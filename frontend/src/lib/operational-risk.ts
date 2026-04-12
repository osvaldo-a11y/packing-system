/**
 * Reglas operativas solo frontend (sin cambiar API): riesgo de mezcla de clientes en pallet,
 * unidades PT sin cliente, destino logístico incompleto, consistencia despacho.
 */
import type { FruitProcessRow } from '@/pages/ProcessesPage';

/** Evita import circular con páginas que usan estos helpers. */
export type PalletRiskInput = {
  client_id: number | null;
  planned_sales_order_id?: number | null;
  bol: string | null;
  /** Si el pallet salió de un PL, el BOL “de documento” puede estar solo en el PL. */
  pt_packing_list_id?: number | null;
  lines: Array<{ fruit_process_id: number | null }>;
};

export function palletHasLogisticsDestination(p: PalletRiskInput): boolean {
  const client = p.client_id != null && Number(p.client_id) > 0;
  const order = p.planned_sales_order_id != null && Number(p.planned_sales_order_id) > 0;
  const bol = !!(p.bol?.trim());
  return client || order || bol;
}

/** IDs de cliente maestro (>0) desde unidades PT vinculadas a líneas vía proceso→tarja. */
export function distinctPtClientIdsFromLines(
  lines: Array<{ fruit_process_id?: number | null }>,
  processes: FruitProcessRow[] | undefined,
  ptTags: Array<{ id: number; client_id?: number | null }> | undefined,
): number[] {
  const set = new Set<number>();
  for (const ln of lines) {
    const pid = ln.fruit_process_id != null ? Number(ln.fruit_process_id) : 0;
    if (pid <= 0) continue;
    const proc = processes?.find((x) => x.id === pid);
    const tid = proc?.tarja_id != null ? Number(proc.tarja_id) : 0;
    if (tid <= 0) continue;
    const tag = ptTags?.find((t) => t.id === tid);
    const cid = tag?.client_id != null ? Number(tag.client_id) : 0;
    if (cid > 0) set.add(cid);
  }
  return [...set].sort((a, b) => a - b);
}

export function distinctPtClientIdsFromPallet(
  p: PalletRiskInput,
  processes: FruitProcessRow[] | undefined,
  ptTags: Array<{ id: number; client_id?: number | null }> | undefined,
): number[] {
  return distinctPtClientIdsFromLines(p.lines, processes, ptTags);
}

export function palletHasMixedPtClients(
  p: PalletRiskInput,
  processes: FruitProcessRow[] | undefined,
  ptTags: Array<{ id: number; client_id?: number | null }> | undefined,
): boolean {
  return distinctPtClientIdsFromPallet(p, processes, ptTags).length > 1;
}

/** Alguna línea con proceso→tarja cuya unidad PT no tiene cliente previsto. */
export function palletHasUnassignedPtFromLines(
  p: PalletRiskInput,
  processes: FruitProcessRow[] | undefined,
  ptTags: Array<{ id: number; client_id?: number | null }> | undefined,
): boolean {
  for (const ln of p.lines) {
    const pid = ln.fruit_process_id != null ? Number(ln.fruit_process_id) : 0;
    if (pid <= 0) continue;
    const proc = processes?.find((x) => x.id === pid);
    const tid = proc?.tarja_id != null ? Number(proc.tarja_id) : 0;
    if (tid <= 0) continue;
    const tag = ptTags?.find((t) => t.id === tid);
    const cid = tag?.client_id != null ? Number(tag.client_id) : 0;
    if (cid <= 0) return true;
  }
  return false;
}

export function normBol(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Resumen para confirmar despacho (solo lectura de datos ya en pantalla). */
export type DispatchRiskSummary = {
  palletsSinDestino: number;
  palletsSinClienteCabecera: number;
  palletsMulticlientePt: number;
  palletsPtSinAsignacion: number;
  /** Dos o más pallets con client_id de cabecera distintos (>0). */
  mezclaCabeceraClientes: boolean;
  /** client_id del despacho (>0) distinto de algún pallet con cabecera de cliente. */
  clienteDespachoVsPallet: boolean;
  /** BOL del despacho no alinea con pallet ni con el PL PT vinculado (normalizadas). */
  bolDespachoVsPallet: boolean;
};

export type DispatchRiskMeta = {
  client_id?: number | null;
  numero_bol: string;
  final_pallets?: Array<{ id: number }> | null;
  /** BOL por PL (mismo criterio que cabecera del despacho en flujo packing_lists). */
  pt_packing_lists?: Array<{ id: number; numero_bol?: string | null }> | null;
};

/**
 * Cruza despacho con filas completas de `/api/final-pallets` (mismo id que `final_pallets[].id`).
 */
export function summarizeDispatchPalletRisks(
  d: DispatchRiskMeta,
  palletById: Map<number, PalletRiskInput>,
  processes: FruitProcessRow[] | undefined,
  ptTags: Array<{ id: number; client_id?: number | null }> | undefined,
): DispatchRiskSummary {
  const ids = d.final_pallets?.map((fp) => fp.id) ?? [];
  let palletsSinDestino = 0;
  let palletsSinClienteCabecera = 0;
  let palletsMulticlientePt = 0;
  let palletsPtSinAsignacion = 0;
  const headerClientIds = new Set<number>();

  for (const id of ids) {
    const p = palletById.get(id);
    if (!p) continue;
    if (!palletHasLogisticsDestination(p)) palletsSinDestino++;
    const hdrCid = p.client_id != null ? Number(p.client_id) : 0;
    if (hdrCid <= 0) palletsSinClienteCabecera++;
    if (palletHasMixedPtClients(p, processes, ptTags)) palletsMulticlientePt++;
    if (palletHasUnassignedPtFromLines(p, processes, ptTags)) palletsPtSinAsignacion++;
    if (hdrCid > 0) headerClientIds.add(hdrCid);
  }

  const mezclaCabeceraClientes = headerClientIds.size > 1;

  const dClient = d.client_id != null && Number(d.client_id) > 0 ? Number(d.client_id) : null;
  let clienteDespachoVsPallet = false;
  if (dClient != null && headerClientIds.size > 0) {
    for (const cid of headerClientIds) {
      if (cid !== dClient) {
        clienteDespachoVsPallet = true;
        break;
      }
    }
  }

  const dBol = normBol(d.numero_bol);
  let bolDespachoVsPallet = false;
  if (dBol) {
    const plBolNormById = new Map<number, string>();
    for (const pl of d.pt_packing_lists ?? []) {
      const nb = normBol(pl.numero_bol);
      if (nb) plBolNormById.set(Number(pl.id), nb);
    }
    for (const id of ids) {
      const p = palletById.get(id);
      if (!p) continue;
      const pBol = normBol(p.bol);
      const plId = p.pt_packing_list_id != null ? Number(p.pt_packing_list_id) : 0;
      const plBol = plId > 0 ? plBolNormById.get(plId) ?? '' : '';
      if (dBol === pBol || (plBol && dBol === plBol)) continue;
      if (pBol || plBol) {
        bolDespachoVsPallet = true;
        break;
      }
    }
  }

  return {
    palletsSinDestino,
    palletsSinClienteCabecera,
    palletsMulticlientePt,
    palletsPtSinAsignacion,
    mezclaCabeceraClientes,
    clienteDespachoVsPallet,
    bolDespachoVsPallet,
  };
}

/** Antes de confirmar: mostrar modal si hay riesgos de carga (no incluye solo mismatch BOL/cliente visuales). */
export function dispatchConfirmShouldWarn(s: DispatchRiskSummary): boolean {
  return (
    s.palletsSinDestino > 0 ||
    s.palletsSinClienteCabecera > 0 ||
    s.palletsMulticlientePt > 0 ||
    s.palletsPtSinAsignacion > 0 ||
    s.mezclaCabeceraClientes
  );
}

export function dispatchHasAnyOperationalAlert(s: DispatchRiskSummary): boolean {
  return dispatchConfirmShouldWarn(s) || s.clienteDespachoVsPallet || s.bolDespachoVsPallet;
}

/**
 * Solo UI: pallets con “sin cliente en cabecera” que no entran ya en el conteo “sin destino”
 * (tienen BOL o pedido en cabecera pero aún sin cliente maestro).
 */
export function palletsCabeceraClienteFueraSinDestino(s: DispatchRiskSummary): number {
  return Math.max(0, s.palletsSinClienteCabecera - s.palletsSinDestino);
}
