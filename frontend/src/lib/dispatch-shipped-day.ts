/** Entrada mínima de despacho para KPI «shipped» / fin del día. */
export type DispatchShippedDayInput = {
  status?: string | null;
  fecha_despacho?: string | Date | null;
  despachado_at?: string | null;
};

export function toLocalDayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Día en que el despacho cuenta como salida (shipped) en reportes operativos.
 *
 * Siempre **`fecha_despacho`** (fecha operativa asignada al crear/editar el despacho).
 * `despachado_at` solo indica cuándo se registró en el sistema al poner al día — no debe
 * mover la salida a «hoy» en fin del día ni KPIs shipped.
 *
 * Cuenta **confirmado** y **despachado**; no borrador ni anulado.
 */
export function dispatchShippedDayKey(d: DispatchShippedDayInput): string | null {
  const st = String(d.status ?? '').trim().toLowerCase();
  if (!st || st === 'borrador' || st === 'anulado') return null;
  if (st !== 'confirmado' && st !== 'despachado') return null;

  const raw = d.fecha_despacho;
  if (raw != null && raw !== '') return toLocalDayKey(raw);

  const fb = d.despachado_at?.trim();
  if (fb) return toLocalDayKey(fb);
  return null;
}

export function dispatchCountsAsShippedOnDay(d: DispatchShippedDayInput, opsDayKey: string): boolean {
  const dk = dispatchShippedDayKey(d);
  return dk != null && dk.length > 0 && dk === opsDayKey;
}
