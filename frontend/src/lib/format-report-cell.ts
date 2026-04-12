import { formatCount, formatLb, formatMoney, formatPercent, formatTechnical, parseNumeric } from '@/lib/number-format';

/**
 * Formatea celdas de tablas de reporte según nombre de columna (heurística) y tipo.
 */
export function formatReportCell(columnKey: string, v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);

  const k = columnKey.toLowerCase();
  const s = String(v).trim();
  if (s === '') return '—';

  const n = parseNumeric(v);
  if (n == null) return s;

  // Casi cero numérico por ruido
  if (Math.abs(n) < 1e-9 && n !== 0) return '0';

  // IDs y conteos enteros
  if (
    (k.endsWith('_id') || k === 'id' || k === 'proceso_id' || k === 'dispatch_id' || k === 'tarja_id') &&
    Number.isFinite(n)
  ) {
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-6) return formatCount(Math.round(n));
  }
  if (
    /cajas|pallets|boxes|amount|lineas|trays|cantidad(?!_receta)|total_cajas/i.test(k) &&
    !/precio|costo|subtotal|venta|margen|delta|factor|unit/i.test(k)
  ) {
    return formatCount(Math.round(n));
  }

  // Dinero
  if (
    /venta|precio|costo|subtotal|monto|margen|neto|delta|total|tarifa|unit_price|line_subtotal|pallet_cost/i.test(k) &&
    !/lb|pounds|peso|cajas$/i.test(k)
  ) {
    return formatMoney(n);
  }

  // Porcentajes / rendimiento
  if (/rend|merma|percent|pct|yield|tasa/i.test(k)) {
    return formatPercent(n, k.includes('rend') || k.includes('merma') ? 2 : 1);
  }

  // Libras / peso
  if (/lb|pounds|peso|net_lb|gross|packout|entrada|iqf|merma.*lb/i.test(k)) {
    return formatLb(n, 2);
  }

  // Ratios técnicos
  if (/factor|ratio|frac|qty_per|consumo_total|cantidad_receta|costo_por_caja|costo_por_lb|precio.*lb/i.test(k)) {
    return formatTechnical(n, 6);
  }

  // Numérico genérico: evitar 270.000000
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-5) {
    return formatCount(Math.round(n));
  }
  return formatLb(n, 2);
}
