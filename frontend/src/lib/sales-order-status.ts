/** Pedido con estado comercial y avance operativo (despacho / BOL). */
export type SalesOrderStatusInput = {
  estado_comercial?: string | null;
  requested_boxes?: number | string | null;
  operatively_complete?: boolean;
  dispatch_match?: 'orden' | 'bol' | 'ambos' | null;
  dispatched_boxes?: number | string | null;
  pending_boxes?: number | string | null;
};

const CANCELADO_RE = /cancelad|anulad|\bcancel\b/i;

export function isOrderCanceled(r: SalesOrderStatusInput): boolean {
  const st = (r.estado_comercial ?? '').trim();
  if (st.length > 0 && CANCELADO_RE.test(st)) return true;
  return false;
}

export function orderHasVolume(r: SalesOrderStatusInput): boolean {
  return (Number(r.requested_boxes) || 0) > 0;
}

export function isOrderOperativelyComplete(r: SalesOrderStatusInput): boolean {
  if (r.operatively_complete === true) return true;
  const req = Number(r.requested_boxes) || 0;
  if (req <= 0) return false;
  const pending = Number(r.pending_boxes);
  if (Number.isFinite(pending) && pending <= 0.5) return true;
  return false;
}

/** Segmento para listado y filtros de la pantalla Pedidos. */
export type SalesOrderListSegment = 'pendiente' | 'completado' | 'cancelado' | 'sin_cajas';

export function salesOrderListSegment(r: SalesOrderStatusInput): SalesOrderListSegment {
  if (isOrderCanceled(r)) return 'cancelado';
  if (!orderHasVolume(r)) return 'sin_cajas';
  if (isOrderOperativelyComplete(r)) return 'completado';
  return 'pendiente';
}

export const ESTADO_COMERCIAL_PRESETS = [
  '',
  'Pendiente',
  'En proceso',
  'Confirmado',
  'Enviado',
  'Cancelado',
] as const;

export function dispatchMatchLabel(match: SalesOrderStatusInput['dispatch_match']): string | null {
  if (match === 'ambos') return 'Despacho por pedido y BOL';
  if (match === 'bol') return 'Despacho por BOL';
  if (match === 'orden') return 'Despacho por pedido';
  return null;
}
