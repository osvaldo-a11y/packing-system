/**
 * Reglas globales de presentación numérica (solo UI; no altera datos).
 * es-AR: miles con punto, decimales con coma.
 */

const LOCALE = 'es-AR';

/** Conteos, IDs enteros, cantidades discretas: sin decimales. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/** Peso lb (y similares): 1–2 decimales, sin ruido 0.000000. */
export function formatLb(value: number, maxDecimals: 1 | 2 = 2): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = maxDecimals === 1 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  if (Math.abs(rounded) < 1e-8 && value !== 0) return '0';
  return rounded.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/** Dinero: siempre 2 decimales. */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Porcentajes (0–100 o fracción según contexto): 1–2 decimales. */
export function formatPercent(value: number, maxDecimals: 1 | 2 = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/** Detalle técnico (factores, ratios): hasta N decimales sin ceros innecesarios al final. */
export function formatTechnical(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return '—';
  const s = value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
  return s;
}

/** Inventario: alias semántico para cantidades de materiales (sin decimales). */
export function formatInventoryQty(value: number): string {
  return formatCount(value);
}

/** Inventario desde string numérico (API legacy). */
export function formatInventoryQtyFromString(value: string | number | null | undefined): string {
  const n = parseNumeric(value);
  if (n == null) return '—';
  return formatInventoryQty(n);
}

export function parseNumeric(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
