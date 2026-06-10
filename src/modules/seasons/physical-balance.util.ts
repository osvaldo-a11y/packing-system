import ExcelJS from 'exceljs';
import { normalizeAliasKey, parseDecimalCell, trimCell } from './final-charge.util';

export const LB_TOLERANCE = 0.05;

/**
 * Tie-out packout físico vs libras comerciales (season_settlement_lines) en temporadas legacy.
 * Físico y Final Charge redondean por línea; el Δ agregado típico es ~0,003% del packout
 * (~34 lb sobre ~1,25M lb observado en 2023). Solo tie-out — la integridad mass-balance
 * sigue en ±LB_TOLERANCE.
 */
export const LEGACY_TIEOUT_LB_TOLERANCE = 40;

export const TIEOUT_LB_PRODUCER_TOLERANCE = LEGACY_TIEOUT_LB_TOLERANCE;
export const TIEOUT_LB_SEASON_TOLERANCE = LEGACY_TIEOUT_LB_TOLERANCE;

export const RECEPTIONS_COLUMN_ALIASES: Record<string, string[]> = {
  producer: ['growers', 'grower', 'producer', 'productor'],
  quality: ['quality', 'calidad', 'qual'],
  net_pounds: ['net pounds', 'net lbs', 'net lb', 'pounds net', 'lbs net'],
  incoming_ref: ['# incoming', 'incoming', 'incoming #', 'n incoming', '# incoming #', 'incoming no'],
};

export const PROCESSES_COLUMN_ALIASES: Record<string, string[]> = {
  producer: ['growers', 'grower', 'producer', 'productor'],
  lb_processed: ['lbs. total', 'lbs total', 'lb total', 'lbs total processed', 'total lbs'],
  lb_packout: ['lbs.fresh berries', 'lbs fresh berries', 'lb fresh berries', 'fresh berries lbs'],
  lb_waste: ['lbs waste', 'lb waste', 'lbs. waste', 'waste lbs'],
};

export function mapHeaderRow(headers: string[], aliases: Record<string, string[]>): Map<string, number> {
  const normalized = headers.map((h, idx) => ({
    idx,
    key: h.trim().toLowerCase().replace(/\s+/g, ' '),
  }));
  const out = new Map<string, number>();
  for (const [field, names] of Object.entries(aliases)) {
    for (const alias of names) {
      const hit = normalized.find((h) => h.key === alias);
      if (hit) {
        out.set(field, hit.idx);
        break;
      }
    }
  }
  return out;
}

/** Primera hoja con datos (Hoja1 vacía → usa Hoja2). */
export function pickDataSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 1) return sheet;
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo Excel no tiene hojas.');
  return sheet;
}

export function isWasteQuality(raw: string): boolean {
  return normalizeAliasKey(raw) === 'WASTE';
}

export function isForFrozenQuality(raw: string): boolean {
  return normalizeAliasKey(raw) === 'FOR FROZEN';
}

export type ReceptionAgg = {
  producer_raw: string;
  incoming_refs: Set<string>;
  lb_received: number;
  lb_rejected: number;
  lb_for_frozen: number;
};

export type ProcessAgg = {
  producer_raw: string;
  processes_count: number;
  lb_processed: number;
  lb_packout: number;
  lb_waste: number;
};

export function aggregateReceptions(
  sheet: ExcelJS.Worksheet,
  colMap: Map<string, number>,
): Map<string, ReceptionAgg> {
  const byProducer = new Map<string, ReceptionAgg>();
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const get = (field: string): unknown => {
      const idx = colMap.get(field);
      if (idx == null) return null;
      return row.getCell(idx + 1).value;
    };
    const producerRaw = trimCell(get('producer'));
    if (!producerRaw) continue;
    const key = normalizeAliasKey(producerRaw);
    const agg = byProducer.get(key) ?? {
      producer_raw: producerRaw,
      incoming_refs: new Set<string>(),
      lb_received: 0,
      lb_rejected: 0,
      lb_for_frozen: 0,
    };
    const quality = trimCell(get('quality'));
    const pounds = parseDecimalCell(get('net_pounds'));
    if (isWasteQuality(quality)) {
      agg.lb_rejected += pounds;
    } else if (isForFrozenQuality(quality)) {
      agg.lb_for_frozen += pounds;
    } else {
      agg.lb_received += pounds;
      const incoming = trimCell(get('incoming_ref'));
      if (incoming) agg.incoming_refs.add(incoming);
    }
    byProducer.set(key, agg);
  }
  return byProducer;
}

export function aggregateProcesses(
  sheet: ExcelJS.Worksheet,
  colMap: Map<string, number>,
): Map<string, ProcessAgg> {
  const byProducer = new Map<string, ProcessAgg>();
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const get = (field: string): unknown => {
      const idx = colMap.get(field);
      if (idx == null) return null;
      return row.getCell(idx + 1).value;
    };
    const producerRaw = trimCell(get('producer'));
    if (!producerRaw) continue;
    const key = normalizeAliasKey(producerRaw);
    const agg = byProducer.get(key) ?? {
      producer_raw: producerRaw,
      processes_count: 0,
      lb_processed: 0,
      lb_packout: 0,
      lb_waste: 0,
    };
    agg.processes_count += 1;
    agg.lb_processed += parseDecimalCell(get('lb_processed'));
    agg.lb_packout += parseDecimalCell(get('lb_packout'));
    agg.lb_waste += parseDecimalCell(get('lb_waste'));
    byProducer.set(key, agg);
  }
  return byProducer;
}

/** Integridad: exacto sin frozen; rango [received, received+frozen] con frozen. */
export function checkMassBalanceIntegrity(
  lbReceived: number,
  lbForFrozen: number,
  lbProcessed: number,
): { ok: boolean; delta: number; mode: 'exact' | 'frozen_range' } {
  if (lbForFrozen <= LB_TOLERANCE) {
    const delta = lbReceived - lbProcessed;
    return { ok: Math.abs(delta) <= LB_TOLERANCE, delta, mode: 'exact' };
  }
  const low = lbReceived - LB_TOLERANCE;
  const high = lbReceived + lbForFrozen + LB_TOLERANCE;
  const ok = lbProcessed >= low && lbProcessed <= high;
  const delta =
    lbProcessed < lbReceived
      ? lbProcessed - lbReceived
      : lbProcessed > lbReceived + lbForFrozen
        ? lbProcessed - (lbReceived + lbForFrozen)
        : 0;
  return { ok, delta, mode: 'frozen_range' };
}

export function deriveFrozenToFrozen(
  lbReceived: number,
  lbForFrozen: number,
  lbProcessed: number,
): number {
  if (lbForFrozen <= LB_TOLERANCE) return 0;
  return lbReceived + lbForFrozen - lbProcessed;
}
