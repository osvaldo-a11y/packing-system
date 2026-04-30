/**
 * Textos y clases de apoyo para Materiales / Kardex (solo presentación; la lógica de stock sigue en API).
 */

/** Campos mínimos para alcance (alineado con PackagingMaterialRow). */
export type AlcanceRow = {
  presentation_format_scope_ids?: number[] | null;
  presentation_format_id?: number | null;
  client_scope_ids?: number[] | null;
  client_id?: number | null;
};

export function formatScopeIdsFromRow(row: AlcanceRow): number[] {
  const scope = row.presentation_format_scope_ids;
  if (scope && scope.length > 0) return [...scope];
  if (row.presentation_format_id != null && row.presentation_format_id > 0) return [row.presentation_format_id];
  return [];
}

export function clientScopeIdsFromRow(row: AlcanceRow): number[] {
  const scope = row.client_scope_ids;
  if (scope && scope.length > 0) return [...scope];
  if (row.client_id != null && row.client_id > 0) return [row.client_id];
  return [];
}

/** Lenguaje claro para alcance formato + cliente. */
export function describeAlcance(
  row: AlcanceRow,
  formatById: Map<number, string>,
  clientById: Map<number, string>,
): string {
  const fIds = formatScopeIdsFromRow(row);
  const cIds = clientScopeIdsFromRow(row);
  const fAll = fIds.length === 0;
  const cAll = cIds.length === 0 && !(row.client_id != null && row.client_id > 0);
  if (fAll && cAll) return 'General';

  const fmtLbl =
    fAll ? null : fIds.length === 1 ? formatById.get(fIds[0]) ?? `Formato #${fIds[0]}` : `${fIds.length} formatos`;
  const cliLbl =
    cAll ? null : cIds.length === 1 ? clientById.get(cIds[0]) ?? `Cliente #${cIds[0]}` : `${cIds.length} clientes`;

  if (fmtLbl && cliLbl) return `${fmtLbl} + ${cliLbl}`;
  if (fmtLbl) return fIds.length === 1 ? `Solo ${fmtLbl}` : `Varios formatos (${fIds.length})`;
  if (cliLbl) return cIds.length === 1 ? `Solo ${cliLbl}` : `Varios clientes (${cIds.length})`;
  return 'General';
}

/**
 * Presentación de saldo sin umbrales por material (el backend no expone mínimos).
 * Solo se resalta en rojo cuando no hay saldo útil; el resto es neutro para no sugerir “óptimo” genérico.
 */
export type StockSaldoTone = 'sin_saldo' | 'con_saldo';

export function stockSaldoTone(qty: number): StockSaldoTone {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return 'sin_saldo';
  return 'con_saldo';
}

export function stockSaldoClass(tone: StockSaldoTone): string {
  if (tone === 'sin_saldo') return 'text-rose-700 font-semibold';
  return 'font-semibold tabular-nums text-slate-900';
}

/** @deprecated Usar stockSaldoTone — los umbrales genéricos por UOM inducían señales falsas. */
export type StockHealth = 'ok' | 'warn' | 'crit';

/** @deprecated Usar stockSaldoTone / stockSaldoClass */
export function stockHealthFromQty(qty: number, _uom?: string): StockHealth {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return 'crit';
  return 'ok';
}

/** @deprecated Usar stockSaldoClass */
export function stockHealthClass(h: StockHealth): string {
  if (h === 'crit') return 'text-rose-700 font-semibold';
  return 'font-semibold tabular-nums text-slate-900';
}

/** @deprecated */
export function stockHealthBadgeClass(h: StockHealth): string {
  if (h === 'crit') return 'border-rose-200 bg-rose-50 text-rose-900';
  return 'border-slate-200 bg-slate-50 text-slate-900';
}

/** Etiqueta legible para ref_type de movimientos (códigos internos → español). */
export function movementRefTypeLabel(ref: string | null | undefined): string {
  const r = (ref ?? 'manual').toLowerCase();
  const map: Record<string, string> = {
    manual: 'Ajuste manual',
    entrada: 'Ingreso',
    compra: 'Compra / OC',
    inventario_inicial: 'Inventario inicial',
    salida: 'Salida / merma',
    final_inventario: 'Cierre de inventario',
    consumo: 'Consumo de tarja',
    consumption: 'Consumo de tarja',
    consumo_reverso: 'Reverso de consumo',
    consumption_revert: 'Reverso de consumo',
    ajuste: 'Corrección',
    correccion: 'Corrección',
  };
  return map[r] ?? ref ?? 'Movimiento';
}
