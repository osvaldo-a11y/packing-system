/**
 * Precio/caja por formato desde líneas de pedido (fuente de verdad comercial).
 */

export type OrderLinePriceInput = {
  presentation_format_id: number;
  unit_price: number | null;
  sort_order?: number;
};

/** Primer precio válido por formato (orden de líneas del pedido). */
export function unitPricesRecordFromOrderLines(lines: OrderLinePriceInput[]): Record<string, number> {
  const sorted = [...lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out: Record<string, number> = {};
  for (const l of sorted) {
    const fid = Number(l.presentation_format_id);
    if (!fid) continue;
    const k = String(fid);
    if (out[k] !== undefined) continue;
    const u = l.unit_price;
    if (u != null && Number.isFinite(Number(u)) && Number(u) >= 0) {
      out[k] = Number(u);
    }
  }
  return out;
}

export type SalesOrderRowLite = {
  id: number;
  cliente_id: number;
  lines: OrderLinePriceInput[];
};

/**
 * Pedido enlazado al despacho (orden_id) o, si no hay, el pedido más reciente del mismo cliente comercial que el PL.
 */
export function pickSalesOrderForPrices(
  clientId: number | null | undefined,
  linkedOrdenId: number | null | undefined,
  orders: SalesOrderRowLite[],
): SalesOrderRowLite | undefined {
  if (linkedOrdenId != null && linkedOrdenId > 0) {
    const byLink = orders.find((o) => o.id === linkedOrdenId);
    if (byLink) return byLink;
  }
  const cid = clientId != null ? Number(clientId) : 0;
  if (cid <= 0) return undefined;
  return orders.find((o) => o.cliente_id === cid);
}

/** Para inputs de formulario: guardados tienen prioridad; si vacío, heredado del pedido. */
export function mergeUnitPriceStrings(
  formatIds: number[],
  saved: Record<string, number> | null | undefined,
  inherited: Record<string, number>,
): Record<string, string> {
  const pr: Record<string, string> = {};
  for (const fid of formatIds) {
    const k = String(fid);
    const sv = saved?.[k];
    if (sv !== undefined && sv !== null && String(sv).trim() !== '' && Number.isFinite(Number(sv))) {
      pr[k] = String(sv);
    } else if (inherited[k] != null && inherited[k] >= 0) {
      pr[k] = String(inherited[k]);
    } else {
      pr[k] = '';
    }
  }
  return pr;
}
