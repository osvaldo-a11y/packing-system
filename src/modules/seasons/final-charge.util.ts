import { createHash } from 'node:crypto';

export function normalizeAliasKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Idempotencia: season_year + bol + pallet + format_raw + boxes + pounds */
export function buildSettlementRowHash(input: {
  season_year: number;
  bol: string;
  pallet_ref: string;
  format_raw: string;
  boxes: number;
  pounds: number;
}): string {
  const payload = [
    input.season_year,
    input.bol.trim(),
    input.pallet_ref.trim(),
    normalizeAliasKey(input.format_raw),
    input.boxes,
    Number(input.pounds).toFixed(4),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

/** Mapeo flexible de encabezados Final Charge (20 columnas, sección 4.1 ESPEC). */
export const FINAL_CHARGE_COLUMN_ALIASES: Record<string, string[]> = {
  producer: ['producer', 'productor', 'grower', 'producer name', 'productor name', 'grower name'],
  brand: ['brand', 'marca'],
  variety: ['variety', 'variedad'],
  format: ['format', 'packing', 'packaging', 'empaque', 'pack size', 'format code', 'packing code'],
  ship_date: ['date shipping', 'fecha despacho', 'ship date', 'shipping date', 'fecha shipping'],
  pick_type: ['type fruits', 'tipo fruta', 'pick type', 'tipo', 'type fruit'],
  bol: ['bol', 'bill of lading', 'b/l', 'bl', 'numero bol'],
  pallet_ref: ['pallet', 'pallet #', 'pallet no', 'n pallet', 'pallet ref', '# pallet', 'pallet number'],
  boxes: ['boxes', 'cajas', 'qty boxes', 'quantity boxes', 'trays', 'qty'],
  pounds: ['pounds', 'lbs', 'lb', 'pounds net', 'net lb', 'net pounds', 'pounds shipped'],
  revenue: ['revenue', 'sales', 'ventas', 'total sales', 'total revenue', 'sales total'],
  grower_return: ['grower return', 'retorno productor', 'grower return $', 'net grower', 'producer net', 'grower net'],
  pack_fee: ['pack fee', 'packing fee', 'pack fee $', 'tarifa packing', 'packing cost', 'pack fee total'],
  material_cost: ['material cost', 'material cost $', 'costo material', 'materiales', 'materials', 'material'],
  customer: ['customer', 'cliente', 'client', 'customer name'],
  market: ['market', 'mercado'],
  unit_price: ['unit price', 'price per box', 'precio unitario', 'price/box', 'price box'],
  invoice_ref: ['invoice', 'invoice #', 'factura', 'invoice number', 'invoice no'],
  grade: ['grade', 'calidad', 'quality'],
  notes: ['notes', 'notas', 'reference', 'ref', 'comments'],
};

export function mapHeaderRow(headers: string[]): Map<string, number> {
  const normalized = headers.map((h, idx) => ({
    idx,
    key: h.trim().toLowerCase().replace(/\s+/g, ' '),
  }));
  const out = new Map<string, number>();
  for (const [field, aliases] of Object.entries(FINAL_CHARGE_COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const hit = normalized.find((h) => h.key === alias);
      if (hit) {
        out.set(field, hit.idx);
        break;
      }
    }
  }
  return out;
}

export function parsePickType(raw: string | null | undefined): 'hand' | 'machine' | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v === 'HAND PICKING' || v === 'HAND') return 'hand';
  if (v === 'MACHINE PICK' || v === 'MACHINE PICKING' || v === 'MACHINE') return 'machine';
  return null;
}

/** Parser dual: datetime nativo Excel o string dd-mm-yyyy h:mm:ss */
export function parseShipDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{2}:\d{2})?$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function trimCell(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function parseMoney(value: unknown): number {
  const s = trimCell(value).replace(/,/g, '');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseIntCell(value: unknown): number {
  const s = trimCell(value).replace(/,/g, '');
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseDecimalCell(value: unknown): number {
  return parseMoney(value);
}
