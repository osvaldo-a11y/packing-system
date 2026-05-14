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
 * Sufijo mes+día compacto para clave fuerte de recepción (ej. abril 10 → `410`, octubre 5 → `1005`).
 * Mes 1–9 sin cero inicial; día siempre 2 dígitos; mes ≥ 10 con 2 dígitos.
 */
export function receptionCompactDateKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return '0000';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dd = String(day).padStart(2, '0');
  if (m < 10) return `${m}${dd}`;
  return `${String(m).padStart(2, '0')}${dd}`;
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

/** `reference_code` guardado o, si falta, vista compacta productor+mesdía (misma regla que auto de alta). */
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
  return `${base}${receptionCompactDateKey(ra)}`;
}
