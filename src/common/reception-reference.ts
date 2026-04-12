/** Código corto del productor para referencia automática (solo letras/números, máx. 12). */
export function sanitizeProducerCodeForReference(producer: { codigo?: string | null; nombre?: string }): string {
  const raw = (producer.codigo?.trim() || producer.nombre?.slice(0, 4) || 'REF').toUpperCase();
  const base = raw.replace(/[^A-Z0-9]/g, '') || 'REF';
  return base.slice(0, 12);
}

/** Fecha local del evento en YYYYMMDD (para correlativo diario). */
export function receptionDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Tara del envase vacío (lb), p. ej. bandeja ~3.25 lb — útil para razonar bruto vs neto.
 * No es “lb de fruta por lug”; no debe usarse para validar neto ≈ cantidad × este valor.
 */
export function parseContainerTareLb(capacidad: string | null | undefined): number | null {
  if (!capacidad?.trim()) return null;
  const t = capacidad.trim();
  const mLb = t.match(/(\d+(?:\.\d+)?)\s*lb/i);
  if (mLb) {
    const n = Number(mLb[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const plain = t.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) {
    const n = Number(plain[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Misma regla que recepción: `reference_code` de la recepción o abreviación productor + MMDD (ej. PB0407). */
export function receptionReferenceDisplay(rec: {
  reference_code?: string | null;
  received_at: Date | string;
  producer?: { codigo?: string | null; nombre?: string } | null;
}): string {
  const trimmed = (rec.reference_code ?? '').trim();
  if (trimmed) return trimmed;
  const p = rec.producer;
  const raw = (p?.codigo?.trim() || p?.nombre?.slice(0, 4) || 'REF').toUpperCase();
  const base = raw.replace(/[^A-Z0-9]/g, '') || 'REF';
  const ra = new Date(rec.received_at);
  if (Number.isNaN(ra.getTime())) return base;
  const mm = String(ra.getMonth() + 1).padStart(2, '0');
  const dd = String(ra.getDate()).padStart(2, '0');
  return `${base}${mm}${dd}`;
}
