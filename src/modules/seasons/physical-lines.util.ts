import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  normalizeAliasKey,
  parseDecimalCell,
  parseIntCell,
  parsePickType,
  parseShipDate,
  trimCell,
} from './final-charge.util';
import { mapHeaderRow, pickDataSheet } from './physical-balance.util';

export const LB_TOLERANCE = 0.05;

export const RECEPTION_LINES_COLUMN_ALIASES: Record<string, string[]> = {
  date: ['date', 'fecha'],
  producer: ['growers', 'grower', 'producer', 'productor'],
  specie: ['specie', 'species', 'market', 'mercado'],
  variety: ['variety', 'variedad'],
  quality: ['quality', 'calidad', 'qual'],
  incoming_no: ['# incoming', 'incoming', 'incoming #', 'n incoming', '# incoming #', 'incoming no'],
  line_no: ['line', 'linea', 'línea'],
  reference: ['reference', 'ref', 'referencia'],
  trays: ['trays', 'bandejas'],
  quantity: ['quantity', 'qty', 'cantidad'],
  net_pounds: ['net pounds', 'net lbs', 'net lb', 'pounds net', 'lbs net'],
  gross_pounds: ['gross pounds', 'gross lbs', 'gross lb', 'lbs gross'],
  fruit_type: ['fruit type', 'type fruits', 'tipo fruta', 'pick type', 'type fruit'],
};

export const PROCESS_LINES_COLUMN_ALIASES: Record<string, string[]> = {
  date: ['date', 'fecha'],
  op: ['op', 'operation', 'operacion', 'operación'],
  producer: ['growers', 'grower', 'producer', 'productor'],
  variety: ['variety', 'variedad'],
  specie: ['specie', 'species', 'market', 'mercado'],
  lb_domp: ['lbs.domp fruit', 'lbs domp fruit', 'lb domp fruit', 'domp fruit', 'lbs. domp fruit'],
  lb_fresh: ['lbs.fresh berries', 'lbs fresh berries', 'lb fresh berries', 'fresh berries lbs'],
  lb_waste: ['lbs waste', 'lb waste', 'lbs. waste', 'waste lbs'],
  lb_total: ['lbs. total', 'lbs total', 'lb total', 'total lbs'],
  format: ['packout', 'format', 'packing', 'packaging', 'empaque'],
  fruit_type: ['fruit type', 'type fruits', 'tipo fruta', 'pick type', 'type fruit'],
  boxes: ['boxes', 'cajas'],
};

export type ReceptionQuality = 'FRESH' | 'WASTE' | 'FOR_FROZEN';

export function parseReceptionQuality(raw: string): ReceptionQuality | null {
  const key = normalizeAliasKey(raw);
  if (!key) return null;
  if (key === 'WASTE' || key.endsWith(' WASTE')) return 'WASTE';
  if (key === 'FOR FROZEN' || key.includes('FOR FROZEN')) return 'FOR_FROZEN';
  if (key.includes('FRESH')) return 'FRESH';
  return null;
}

export function buildReceptionRowHash(input: {
  season_year: number;
  source_row_no: number;
  producer_raw: string;
  reception_date: string | null;
  incoming_no: string;
  quality: string;
  net_lb: number;
}): string {
  const payload = [
    input.season_year,
    input.source_row_no,
    normalizeAliasKey(input.producer_raw),
    input.reception_date ?? '',
    input.incoming_no.trim(),
    input.quality,
    Number(input.net_lb).toFixed(4),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function buildProcessRowHash(input: {
  season_year: number;
  source_row_no: number;
  producer_raw: string;
  process_date: string | null;
  op: string;
  format_raw: string;
  lb_total: number;
  lb_fresh: number;
}): string {
  const payload = [
    input.season_year,
    input.source_row_no,
    normalizeAliasKey(input.producer_raw),
    input.process_date ?? '',
    input.op.trim(),
    normalizeAliasKey(input.format_raw),
    Number(input.lb_total).toFixed(4),
    Number(input.lb_fresh).toFixed(4),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export type ParsedReceptionLine = {
  source_row_no: number;
  producer_raw: string;
  reception_date: string;
  quality: ReceptionQuality;
  specie: string | null;
  variety: string | null;
  incoming_no: string | null;
  line_no: string | null;
  reference: string | null;
  trays: number | null;
  quantity: number | null;
  net_lb: number;
  gross_lb: number | null;
  fruit_type: 'hand' | 'machine' | null;
  row_hash: string;
};

export type ParsedProcessLine = {
  source_row_no: number;
  producer_raw: string;
  process_date: string;
  op: string | null;
  specie: string | null;
  variety: string | null;
  format_raw: string | null;
  lb_domp: number | null;
  lb_fresh: number;
  lb_waste: number;
  lb_total: number;
  boxes: number | null;
  fruit_type: 'hand' | 'machine' | null;
  row_hash: string;
};

export function parseReceptionLinesFromSheet(
  sheet: ExcelJS.Worksheet,
  seasonYear: number,
): { lines: ParsedReceptionLine[]; errors: Array<{ row: number; message: string }> } {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = trimCell(cell.value);
  });
  const colMap = mapHeaderRow(headers, RECEPTION_LINES_COLUMN_ALIASES);
  const lines: ParsedReceptionLine[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const get = (field: string): unknown => {
      const idx = colMap.get(field);
      if (idx == null) return null;
      return row.getCell(idx + 1).value;
    };

    const producerRaw = trimCell(get('producer'));
    if (!producerRaw) continue;

    const receptionDate = parseShipDate(get('date'));
    if (!receptionDate) {
      errors.push({ row: rowNum, message: `Fecha inválida o vacía para productor "${producerRaw}"` });
      continue;
    }

    const qualityRaw = trimCell(get('quality'));
    const quality = parseReceptionQuality(qualityRaw);
    if (!quality) {
      errors.push({ row: rowNum, message: `Quality no reconocida "${qualityRaw}" (fila ${rowNum})` });
      continue;
    }

    const netLb = parseDecimalCell(get('net_pounds'));
    const rowHash = buildReceptionRowHash({
      season_year: seasonYear,
      source_row_no: rowNum,
      producer_raw: producerRaw,
      reception_date: receptionDate,
      incoming_no: trimCell(get('incoming_no')),
      quality,
      net_lb: netLb,
    });

    lines.push({
      source_row_no: rowNum,
      producer_raw: producerRaw,
      reception_date: receptionDate,
      quality,
      specie: trimCell(get('specie')) || null,
      variety: trimCell(get('variety')) || null,
      incoming_no: trimCell(get('incoming_no')) || null,
      line_no: trimCell(get('line_no')) || null,
      reference: trimCell(get('reference')) || null,
      trays: parseIntCell(get('trays')) || null,
      quantity: parseDecimalCell(get('quantity')) || null,
      net_lb: netLb,
      gross_lb: parseDecimalCell(get('gross_pounds')) || null,
      fruit_type: parsePickType(trimCell(get('fruit_type'))),
      row_hash: rowHash,
    });
  }

  return { lines, errors };
}

export function parseProcessLinesFromSheet(
  sheet: ExcelJS.Worksheet,
  seasonYear: number,
): { lines: ParsedProcessLine[]; errors: Array<{ row: number; message: string }> } {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = trimCell(cell.value);
  });
  const colMap = mapHeaderRow(headers, PROCESS_LINES_COLUMN_ALIASES);
  const lines: ParsedProcessLine[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const get = (field: string): unknown => {
      const idx = colMap.get(field);
      if (idx == null) return null;
      return row.getCell(idx + 1).value;
    };

    const producerRaw = trimCell(get('producer'));
    if (!producerRaw) continue;

    const processDate = parseShipDate(get('date'));
    if (!processDate) {
      errors.push({ row: rowNum, message: `Fecha inválida o vacía para productor "${producerRaw}"` });
      continue;
    }

    const lbTotal = parseDecimalCell(get('lb_total'));
    const lbFresh = parseDecimalCell(get('lb_fresh'));
    const formatRaw = trimCell(get('format')) || null;
    const op = trimCell(get('op')) || null;

    const rowHash = buildProcessRowHash({
      season_year: seasonYear,
      source_row_no: rowNum,
      producer_raw: producerRaw,
      process_date: processDate,
      op: op ?? '',
      format_raw: formatRaw ?? '',
      lb_total: lbTotal,
      lb_fresh: lbFresh,
    });

    lines.push({
      source_row_no: rowNum,
      producer_raw: producerRaw,
      process_date: processDate,
      op,
      specie: trimCell(get('specie')) || null,
      variety: trimCell(get('variety')) || null,
      format_raw: formatRaw,
      lb_domp: parseDecimalCell(get('lb_domp')) || null,
      lb_fresh: lbFresh,
      lb_waste: parseDecimalCell(get('lb_waste')),
      lb_total: lbTotal,
      boxes: parseIntCell(get('boxes')) || null,
      fruit_type: parsePickType(trimCell(get('fruit_type'))),
      row_hash: rowHash,
    });
  }

  return { lines, errors };
}

export function parseReceptionWorkbook(buffer: Buffer, seasonYear: number) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.load(buffer as never).then(() => {
    const sheet = pickDataSheet(workbook);
    return parseReceptionLinesFromSheet(sheet, seasonYear);
  });
}

export function parseProcessWorkbook(buffer: Buffer, seasonYear: number) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.load(buffer as never).then(() => {
    const sheet = pickDataSheet(workbook);
    return parseProcessLinesFromSheet(sheet, seasonYear);
  });
}

export const PHYSICAL_LINES_VERIFICATION_TARGETS: Record<
  number,
  {
    reception_lines_total: number;
    reception_lines_fresh: number;
    lb_fresh: number;
    lb_waste: number;
    lb_for_frozen: number;
    process_lines: number;
    lb_processed: number;
    lb_packout: number;
    lb_waste_process: number;
  }
> = {
  2023: {
    reception_lines_total: 275,
    reception_lines_fresh: 208,
    lb_fresh: 1352801.57,
    lb_waste: 0,
    lb_for_frozen: 84994.05,
    process_lines: 176,
    lb_processed: 1359898.57,
    lb_packout: 1254918.64,
    lb_waste_process: 105256.93,
  },
  2024: {
    reception_lines_total: 174,
    reception_lines_fresh: 174,
    lb_fresh: 1626334.84,
    lb_waste: 0,
    lb_for_frozen: 0,
    process_lines: 144,
    lb_processed: 1626334.84,
    lb_packout: 1442986.4,
    lb_waste_process: 183403.64,
  },
  2025: {
    reception_lines_total: 155,
    reception_lines_fresh: 154,
    lb_fresh: 1614123.61,
    lb_waste: 4347,
    lb_for_frozen: 0,
    process_lines: 151,
    lb_processed: 1614123.61,
    lb_packout: 1354617.6,
    lb_waste_process: 258813.01,
  },
};

export function closeLb(a: number, b: number, tol = LB_TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}
