import ExcelJS from 'exceljs';

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type RawRow = Record<string, unknown>;

/** Packing total en liquidación: `costo_packing` ya incluye procesado máquina tras el backend/enrich. */
export function packingCostTotal(row: RawRow): number {
  const total = toNum(row.total_packing);
  if (total > 0) return total;
  return toNum(row.costo_packing);
}

function packingBreakdownFromRow(row: RawRow): {
  base: number;
  recargo: number;
  maquina: number;
  lbMach: number;
  total: number;
} {
  const base = toNum(row.costo_packing_base);
  const recargo = toNum(row.recargo_formato);
  const maquina = toNum(row.costo_maquina);
  const lbMach = toNum(row.lb_machine);
  const total = packingCostTotal(row);
  return { base, recargo, maquina, lbMach, total };
}

/**
 * El detalle prorratea por cajas; el resumen usa lb + costo máquina por productor.
 * Ajusta materiales, packing y total para que cuadren con el resumen de liquidación.
 */
export function enrichSettlementDetailPacking(
  detailRows: RawRow[],
  summaryRows: RawRow[],
): RawRow[] {
  let out = detailRows;
  for (const sr of summaryRows) {
    const pidRaw = sr.productor_id;
    const producerId =
      pidRaw == null || pidRaw === '' ? null : Number(pidRaw);
    if (producerId != null && !Number.isFinite(producerId)) continue;
    out = enrichProducerDetailCosts(out, producerId, sr);
  }
  return out;
}

function lineWeight(d: RawRow, totalLb: number, totalCajas: number): number {
  if (totalLb > 0) return toNum(d.lb) / totalLb;
  if (totalCajas > 0) return toNum(d.cajas) / totalCajas;
  return 0;
}

function enrichProducerDetailCosts(
  detailRows: RawRow[],
  producerId: number | null,
  summaryRow: RawRow,
): RawRow[] {
  const matches = (d: RawRow) =>
    producerId == null
      ? d.productor_id == null || d.productor_id === ''
      : Number(d.productor_id) === producerId;

  const det = detailRows.filter(matches);
  if (det.length === 0) return detailRows;

  const targetMat = toNum(summaryRow.costo_materiales);
  const targetPack = toNum(summaryRow.costo_packing);
  const targetTotal = toNum(summaryRow.costo_total);

  const detMat = det.reduce((s, d) => s + toNum(d.costo_materiales), 0);
  const detPack = det.reduce((s, d) => s + toNum(d.costo_packing), 0);
  const detTotal = det.reduce((s, d) => s + toNum(d.costo_total), 0);

  const extraMat = targetMat - detMat;
  const extraPack = targetPack - detPack;
  const extraTotal = targetTotal - detTotal;

  if (
    Math.abs(extraMat) < 0.005 &&
    Math.abs(extraPack) < 0.005 &&
    Math.abs(extraTotal) < 0.005
  ) {
    return detailRows;
  }

  const totalLb = det.reduce((s, d) => s + toNum(d.lb), 0);
  const totalCajas = det.reduce((s, d) => s + toNum(d.cajas), 0);
  const denom = totalLb > 0 ? totalLb : totalCajas;
  if (denom <= 0) return detailRows;

  const adjusted: RawRow[] = [];
  let sumMat = 0;
  let sumPack = 0;
  let sumTotal = 0;

  for (const d of detailRows) {
    if (!matches(d)) {
      adjusted.push(d);
      continue;
    }
    const w = lineWeight(d, totalLb, totalCajas);
    const mat = toNum(d.costo_materiales) + extraMat * w;
    const pack = toNum(d.costo_packing) + extraPack * w;
    const total = mat + pack;
    const ventas = toNum(d.ventas);
    const row: RawRow = {
      ...d,
      costo_materiales: mat,
      costo_packing: pack,
      costo_total: total,
      neto: ventas - total,
    };
    adjusted.push(row);
    sumMat += mat;
    sumPack += pack;
    sumTotal += total;
  }

  // Redondeo: última línea del productor absorbe diferencia vs resumen
  const matDrift = targetMat - sumMat;
  const packDrift = targetPack - sumPack;
  if (Math.abs(matDrift) >= 0.005 || Math.abs(packDrift) >= 0.005) {
    for (let i = adjusted.length - 1; i >= 0; i--) {
      const d = adjusted[i]!;
      if (!matches(d)) continue;
      const mat = toNum(d.costo_materiales) + matDrift;
      const pack = toNum(d.costo_packing) + packDrift;
      const total = mat + pack;
      const ventas = toNum(d.ventas);
      adjusted[i] = {
        ...d,
        costo_materiales: mat,
        costo_packing: pack,
        costo_total: total,
        neto: ventas - total,
      };
      break;
    }
  }

  sumTotal = 0;
  for (const d of adjusted) {
    if (matches(d)) sumTotal += toNum(d.costo_total);
  }
  const totalDrift = targetTotal - sumTotal;
  if (Math.abs(totalDrift) >= 0.005) {
    for (let i = adjusted.length - 1; i >= 0; i--) {
      const d = adjusted[i]!;
      if (!matches(d)) continue;
      const total = toNum(d.costo_total) + totalDrift;
      const ventas = toNum(d.ventas);
      adjusted[i] = {
        ...d,
        costo_total: total,
        neto: ventas - total,
      };
      break;
    }
  }

  return adjusted;
}

export type FormatAggRow = {
  format_code: string;
  cajas: number;
  lb: number;
  ventas: number;
  costo_materiales: number;
  costo_packing: number;
  costo_total: number;
  precio_packing_por_lb: number | null;
  lb_por_caja: number | null;
};

// ── Paleta de estilos ────────────────────────────────────────────────────────

const C = {
  headerBg: 'FF1E3A5F',  // azul oscuro
  headerFg: 'FFFFFFFF',  // blanco
  infoBg:   'FFD9E2EF',  // azul claro
  infoFg:   'FF1E3A5F',  // azul oscuro
  totalBg:  'FFEEF2F8',  // azul muy claro
  totalFg:  'FF1E3A5F',  // azul oscuro
  borderMd: 'FF8BADD3',  // borde medio
};

const FMT_MONEY = '"$"#,##0.00';
const FMT_QTY   = '#,##0';
const FMT_LB    = '#,##0.00';
const FMT_RATE  = '#,##0.00';
const FMT_INT   = '#,##0';

const T: Record<'es' | 'en', {
  sheetResumen: string; sheetVentas: string; sheetCostos: string; sheetFormato: string;
  campo: string; valor: string;
  productor: string; cajas: string; lb: string; ventas: string;
  costoMat: string; costoPack: string; costoTotal: string; neto: string;
  costoPackingBase: string; recargoFormato: string; costoMaquina: string;
  lbMachine: string; totalPacking: string;
  despacho: string; formato: string; precioVenta: string;
  matCaja: string; packCaja: string; costoCaja: string;
  matTotal: string; packTotal: string; total: string;
  infoLiquidacion: string;
  titleAll: string;
  periodo: string; emitido: string;
}> = {
  es: {
    sheetResumen: 'Resumen', sheetVentas: 'Ventas por despacho',
    sheetCostos: 'Costos por despacho', sheetFormato: 'Por formato',
    campo: 'Campo', valor: 'Valor',
    productor: 'Productor', cajas: 'Cajas', lb: 'Libras (LB)',
    ventas: 'Ventas',     costoMat: 'Costo materiales', costoPack: 'Costo packing',
    costoTotal: 'Costo total', neto: 'Neto productor',
    costoPackingBase: 'Packing base', recargoFormato: 'Recargo por formato',
    costoMaquina: 'Procesado máquina', lbMachine: 'LB máquina', totalPacking: 'Total packing',
    despacho: 'N° Despacho', formato: 'Formato', precioVenta: 'Precio venta/caja',
    matCaja: 'Mat./caja', packCaja: 'Packing/caja', costoCaja: 'Costo/caja',
    matTotal: 'Mat. total', packTotal: 'Packing total', total: 'TOTAL',
    infoLiquidacion: 'Liquidación al productor',
    titleAll: 'Liquidación global — todos los productores',
    periodo: 'Período', emitido: 'Emitido',
  },
  en: {
    sheetResumen: 'Summary', sheetVentas: 'Sales by dispatch',
    sheetCostos: 'Costs by dispatch', sheetFormato: 'By format',
    campo: 'Field', valor: 'Value',
    productor: 'Producer', cajas: 'Boxes', lb: 'Pounds (LB)',
    ventas: 'Sales',     costoMat: 'Material cost', costoPack: 'Packing cost',
    costoTotal: 'Total cost', neto: 'Producer net',
    costoPackingBase: 'Packing base', recargoFormato: 'Format surcharge',
    costoMaquina: 'Machine processing', lbMachine: 'Machine lbs', totalPacking: 'Total packing',
    despacho: 'Dispatch #', formato: 'Format', precioVenta: 'Sale price/box',
    matCaja: 'Mat./box', packCaja: 'Packing/box', costoCaja: 'Cost/box',
    matTotal: 'Mat. total', packTotal: 'Pack. total', total: 'TOTAL',
    infoLiquidacion: 'Producer settlement',
    titleAll: 'Global settlement — all producers',
    periodo: 'Period', emitido: 'Issued',
  },
};

// ── Helpers de estilo ────────────────────────────────────────────────────────

function applyFmt(cell: ExcelJS.Cell, fmt: string): void {
  if (typeof cell.value === 'number') cell.numFmt = fmt;
}

function styleHeader(row: ExcelJS.Row, colCount: number): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font      = { bold: true, color: { argb: C.headerFg }, size: 10, name: 'Arial' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border    = { bottom: { style: 'thin', color: { argb: C.borderMd } } };
  }
  row.height = 26;
}

function styleInfoRow(row: ExcelJS.Row, colCount: number, bold = false): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font      = { bold, size: 9, color: { argb: C.infoFg }, name: 'Arial' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.infoBg } };
    cell.alignment = { vertical: 'middle' };
  }
  row.height = 18;
}

function styleTotalRow(row: ExcelJS.Row, colCount: number): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font   = { bold: true, size: 10, color: { argb: C.totalFg }, name: 'Arial' };
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalBg } };
    cell.border = { top: { style: 'medium', color: { argb: C.borderMd } } };
  }
  row.height = 22;
}

/**
 * Agrega 3 filas de encabezado informativo (empresa / productor / período+emisión)
 * y fusiona las celdas a lo ancho. Devuelve la cantidad de filas agregadas.
 */
function addInfoHeader(
  ws: ExcelJS.Worksheet,
  colCount: number,
  company: string,
  producerName: string,
  period: string,
  emission: string,
  tx: typeof T['es'],
): number {
  const merge = (rowNum: number) =>
    colCount > 1 && ws.mergeCells(rowNum, 1, rowNum, colCount);

  const r1 = ws.addRow([company || 'Liquidación al productor']);
  merge(r1.number);
  r1.getCell(1).font  = { bold: true, size: 11, color: { argb: C.infoFg }, name: 'Arial' };
  r1.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.infoBg } };
  r1.getCell(1).alignment = { vertical: 'middle' };
  r1.height = 22;

  const r2 = ws.addRow([`Productor: ${producerName}`]);
  merge(r2.number);
  styleInfoRow(r2, colCount, false);

  const r3 = ws.addRow([`${tx.periodo}: ${period}   ·   ${tx.emitido}: ${emission}`]);
  merge(r3.number);
  styleInfoRow(r3, colCount, false);

  return 3;
}

// ── Funciones de agregación (sin cambios respecto a la versión anterior) ────

/** Agrupa líneas de `producerSettlementDetail` por formato para un productor. */
export function aggregateDetailByFormatForProducer(
  productorId: number | null,
  detailRows: RawRow[],
  opts?: { unassigned?: boolean },
): FormatAggRow[] {
  const unassigned = opts?.unassigned ?? false;
  const m = new Map<string, FormatAggRow>();
  for (const raw of detailRows) {
    const d = raw;
    if (unassigned) {
      if (d.productor_id != null && d.productor_id !== '') continue;
    } else if (productorId == null || !Number.isFinite(Number(productorId))) {
      continue;
    } else if (Number(d.productor_id) !== Number(productorId)) {
      continue;
    }
    const fmt =
      String(d.format_code ?? '').trim().toLowerCase() || '(sin formato)';
    const cur =
      m.get(fmt) ??
      ({
        format_code: fmt,
        cajas: 0,
        lb: 0,
        ventas: 0,
        costo_materiales: 0,
        costo_packing: 0,
        costo_total: 0,
        precio_packing_por_lb: null,
        lb_por_caja: null,
      } satisfies FormatAggRow);
    cur.cajas            += toNum(d.cajas);
    cur.lb               += toNum(d.lb);
    cur.ventas           += toNum(d.ventas);
    cur.costo_materiales += toNum(d.costo_materiales);
    cur.costo_packing    += packingCostTotal(d);
    cur.costo_total      += toNum(d.costo_total);
    m.set(fmt, cur);
  }
  return [...m.values()].sort((a, b) =>
    a.format_code.localeCompare(b.format_code),
  );
}

export function enrichFormatAggWithFormatCostSummary(
  agg: FormatAggRow[],
  formatCostSummaryRows: RawRow[],
): FormatAggRow[] {
  const byCode = new Map<string, RawRow>();
  for (const raw of formatCostSummaryRows) {
    const code = String(raw.format_code ?? '').trim().toLowerCase();
    if (code) byCode.set(code, raw);
  }
  return agg.map((row) => {
    const fr      = byCode.get(row.format_code);
    const precioLb =
      fr?.precio_packing_por_lb != null ? toNum(fr.precio_packing_por_lb) : null;
    const lbPorCaja = row.cajas > 0 ? row.lb / row.cajas : null;
    return { ...row, precio_packing_por_lb: precioLb, lb_por_caja: lbPorCaja };
  });
}

// ── Descarga principal ───────────────────────────────────────────────────────

/**
 * Excel de liquidación por productor (4 hojas) armado en el navegador con ExcelJS.
 *
 * Hojas:
 *   1. Resumen         — totales del productor
 *   2. Ventas          — detalle ventas y neto por despacho/formato
 *   3. Costos          — desglose material/packing por despacho/formato
 *   4. Por formato     — resumen de costos agrupado por formato
 *
 * Parámetros nuevos opcionales (retrocompatibles):
 *   period  — texto del período (ej. "01/01/2026 → 31/05/2026")
 *   company — nombre de la empresa emisora
 */
export async function downloadProducerSettlementExcelClient(opts: {
  fileBase: string;
  producerId: number;
  producerName: string;
  summaryRow: RawRow;
  detailRows: RawRow[];
  formatCostSummaryRows: RawRow[];
  /** Texto descriptivo del período, ej. "01/01/2026 → 31/05/2026" */
  period?: string;
  /** Nombre de la empresa emisora */
  company?: string;
  lang?: 'es' | 'en';
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created  = new Date();
  wb.creator  = 'Packing system — Cierre';

  const period   = opts.period  ?? 'Período completo';
  const company  = opts.company ?? '';
  const emission = new Date().toLocaleString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const tx = T[opts.lang === 'en' ? 'en' : 'es'];
  const companyDisplay = company || tx.infoLiquidacion;

  const detailRows = enrichSettlementDetailPacking(opts.detailRows, [opts.summaryRow]);

  // Filas de detalle del productor (filtradas una sola vez)
  const detProd = detailRows.filter(
    (d) => Number(d.productor_id) === Number(opts.producerId),
  );

  // ── HOJA 1: Resumen ────────────────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet(tx.sheetResumen, { views: [{ state: 'frozen', ySplit: 5 }] });
    const COL = 2;
    addInfoHeader(ws, COL, companyDisplay, opts.producerName, period, emission, tx);

    const hRow = ws.addRow([tx.campo, tx.valor]);
    styleHeader(hRow, COL);

    const sr = opts.summaryRow;
    const pack = packingBreakdownFromRow(sr);
    const entries: Array<{ label: string; value: number | string; fmt?: string; indent?: boolean }> = [
      { label: tx.productor,        value: opts.producerName },
      { label: tx.cajas,            value: toNum(sr.cajas),            fmt: FMT_QTY   },
      { label: tx.lb,               value: toNum(sr.lb),               fmt: FMT_LB    },
      { label: tx.ventas,           value: toNum(sr.ventas),           fmt: FMT_MONEY },
      { label: tx.costoMat,         value: toNum(sr.costo_materiales), fmt: FMT_MONEY },
      { label: tx.costoPackingBase, value: pack.base,                  fmt: FMT_MONEY, indent: true },
      { label: tx.recargoFormato,   value: pack.recargo,               fmt: FMT_MONEY, indent: true },
      { label: tx.costoMaquina,     value: pack.maquina,               fmt: FMT_MONEY, indent: true },
      { label: tx.lbMachine,        value: pack.lbMach,                fmt: FMT_LB,    indent: true },
      { label: tx.totalPacking,     value: pack.total,                 fmt: FMT_MONEY },
      { label: tx.costoTotal,       value: toNum(sr.costo_total),      fmt: FMT_MONEY },
      { label: tx.neto,             value: toNum(sr.neto_productor),   fmt: FMT_MONEY },
    ];

    for (const e of entries) {
      const row = ws.addRow([e.label, e.value]);
      row.height = 20;
      const labelCell = row.getCell(1);
      labelCell.font = {
        size: 9,
        name: 'Arial',
        color: { argb: e.indent ? 'FF555555' : 'FF000000' },
        italic: !!e.indent,
      };
      if (e.indent) {
        labelCell.alignment = { indent: 2 };
      }
      const valCell = row.getCell(2);
      valCell.alignment = { horizontal: 'right' };
      valCell.font = { size: e.indent ? 9 : 10, name: 'Arial' };
      if (e.fmt) applyFmt(valCell, e.fmt);
    }

    // Fila NETO destacada
    styleTotalRow(ws.lastRow!, COL);

    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 22;
  }

  // ── HOJA 2: Ventas por despacho ────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet(tx.sheetVentas, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      tx.despacho, tx.formato,
      tx.cajas, tx.lb,
      tx.precioVenta, tx.ventas, tx.neto,
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, companyDisplay, opts.producerName, period, emission, tx);

    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);
    ws.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL } };

    let sumCajas = 0, sumLb = 0, sumVentas = 0, sumNeto = 0;

    for (const d of detProd) {
      const cajas  = toNum(d.cajas);
      const lb     = toNum(d.lb);
      const ventas = toNum(d.ventas);
      const neto   = toNum(d.neto);
      const precio = cajas > 0 ? ventas / cajas : 0;

      sumCajas  += cajas;
      sumLb     += lb;
      sumVentas += ventas;
      sumNeto   += neto;

      const row = ws.addRow([
        toNum(d.dispatch_number ?? d.dispatch_id),
        String(d.format_code ?? ''),
        cajas, lb, precio, ventas, neto,
      ]);
      row.height = 18;
      row.getCell(1).font = { size: 9, name: 'Arial' };
      row.getCell(2).font = { size: 9, name: 'Arial' };
      row.getCell(2).alignment = { horizontal: 'left' };
      applyFmt(row.getCell(1), FMT_INT);
      applyFmt(row.getCell(3), FMT_QTY);
      applyFmt(row.getCell(4), FMT_LB);
      applyFmt(row.getCell(5), FMT_RATE);
      applyFmt(row.getCell(6), FMT_MONEY);
      applyFmt(row.getCell(7), FMT_MONEY);
      for (let i = 3; i <= COL; i++) {
        row.getCell(i).alignment = { horizontal: 'right' };
        row.getCell(i).font = { size: 9, name: 'Arial' };
      }
    }

    const tot = ws.addRow([tx.total, '', sumCajas, sumLb, '', sumVentas, sumNeto]);
    applyFmt(tot.getCell(3), FMT_QTY);
    applyFmt(tot.getCell(4), FMT_LB);
    applyFmt(tot.getCell(6), FMT_MONEY);
    applyFmt(tot.getCell(7), FMT_MONEY);
    styleTotalRow(tot, COL);

    ws.columns = [
      { width: 13 }, { width: 20 },
      { width: 10 }, { width: 12 },
      { width: 16 }, { width: 14 }, { width: 14 },
    ];
  }

  // ── HOJA 3: Costos por despacho ────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet(tx.sheetCostos, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      tx.despacho, tx.formato,
      tx.matCaja, tx.packCaja, tx.costoCaja,
      tx.matTotal, tx.packTotal, tx.costoTotal,
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, companyDisplay, opts.producerName, period, emission, tx);

    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);
    ws.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL } };

    let sumMat = 0, sumPack = 0, sumCost = 0;

    for (const d of detProd) {
      const cajas   = toNum(d.cajas);
      const matTot  = toNum(d.costo_materiales);
      const packTot = packingCostTotal(d);
      const costTot = toNum(d.costo_total);
      const matCaja  = cajas > 0 ? matTot  / cajas : 0;
      const packCaja = cajas > 0 ? packTot / cajas : 0;
      const costCaja = cajas > 0 ? costTot / cajas : 0;

      sumMat  += matTot;
      sumPack += packTot;
      sumCost += costTot;

      const row = ws.addRow([
        toNum(d.dispatch_number ?? d.dispatch_id),
        String(d.format_code ?? ''),
        matCaja, packCaja, costCaja,
        matTot, packTot, costTot,
      ]);
      row.height = 18;
      row.getCell(1).font = { size: 9, name: 'Arial' };
      row.getCell(2).font = { size: 9, name: 'Arial' };
      row.getCell(2).alignment = { horizontal: 'left' };
      applyFmt(row.getCell(1), FMT_INT);
      for (let i = 3; i <= COL; i++) {
        applyFmt(row.getCell(i), FMT_RATE);
        row.getCell(i).alignment = { horizontal: 'right' };
        row.getCell(i).font = { size: 9, name: 'Arial' };
      }
    }

    const tot = ws.addRow([tx.total, '', '', '', '', sumMat, sumPack, sumCost]);
    applyFmt(tot.getCell(6), FMT_MONEY);
    applyFmt(tot.getCell(7), FMT_MONEY);
    applyFmt(tot.getCell(8), FMT_MONEY);
    styleTotalRow(tot, COL);

    ws.columns = [
      { width: 13 }, { width: 20 },
      { width: 13 }, { width: 14 }, { width: 12 },
      { width: 14 }, { width: 14 }, { width: 14 },
    ];
  }

  // ── HOJA 4: Resumen por formato ────────────────────────────────────────────
  {
    const agg = enrichFormatAggWithFormatCostSummary(
      aggregateDetailByFormatForProducer(opts.producerId, detailRows),
      opts.formatCostSummaryRows,
    );

    const ws  = wb.addWorksheet(tx.sheetFormato, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      tx.formato, tx.cajas, tx.lb,
      tx.matCaja, tx.packCaja, tx.costoCaja,
      tx.matTotal, tx.packTotal, tx.costoTotal, tx.ventas,
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, companyDisplay, opts.producerName, period, emission, tx);

    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);

    let sumCajas = 0, sumLb = 0, sumMat = 0, sumPack = 0, sumCost = 0, sumVentas = 0;

    for (const r of agg) {
      const matCaja  = r.cajas > 0 ? r.costo_materiales / r.cajas : 0;
      const packCaja = r.cajas > 0 ? r.costo_packing    / r.cajas : 0;
      const costCaja = r.cajas > 0 ? r.costo_total      / r.cajas : 0;

      sumCajas  += r.cajas;
      sumLb     += r.lb;
      sumMat    += r.costo_materiales;
      sumPack   += r.costo_packing;
      sumCost   += r.costo_total;
      sumVentas += r.ventas;

      const row = ws.addRow([
        r.format_code,
        r.cajas, r.lb,
        matCaja, packCaja, costCaja,
        r.costo_materiales, r.costo_packing, r.costo_total, r.ventas,
      ]);
      row.height = 18;
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(1).font = { size: 9, name: 'Arial' };
      applyFmt(row.getCell(2), FMT_QTY);
      applyFmt(row.getCell(3), FMT_LB);
      for (let i = 4; i <= COL; i++) {
        applyFmt(row.getCell(i), FMT_RATE);
        row.getCell(i).alignment = { horizontal: 'right' };
        row.getCell(i).font = { size: 9, name: 'Arial' };
      }
    }

    const tot = ws.addRow([
      tx.total, sumCajas, sumLb,
      '', '', '',
      sumMat, sumPack, sumCost, sumVentas,
    ]);
    applyFmt(tot.getCell(2), FMT_QTY);
    applyFmt(tot.getCell(3), FMT_LB);
    applyFmt(tot.getCell(7), FMT_MONEY);
    applyFmt(tot.getCell(8), FMT_MONEY);
    applyFmt(tot.getCell(9), FMT_MONEY);
    applyFmt(tot.getCell(10), FMT_MONEY);
    styleTotalRow(tot, COL);

    ws.columns = [
      { width: 22 }, { width: 10 }, { width: 12 },
      { width: 12 }, { width: 14 }, { width: 12 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];
  }

  // ── Descarga ───────────────────────────────────────────────────────────────
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${opts.fileBase}-liquidacion-productor-${opts.producerId}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Excel de liquidación global (todos los productores) — misma estructura
 * que el Excel por productor pero con todos los datos del período.
 */
export async function downloadSettlementExcelAll(opts: {
  fileBase: string;
  summaryRows: RawRow[];
  detailRows: RawRow[];
  formatCostSummaryRows: RawRow[];
  period?: string;
  company?: string;
  lang?: 'es' | 'en';
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created  = new Date();
  wb.creator  = 'Packing system — Cierre';

  const period   = opts.period  ?? 'Período completo';
  const company  = opts.company ?? '';
  const emission = new Date().toLocaleString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const tx = T[opts.lang === 'en' ? 'en' : 'es'];
  const detailRows = enrichSettlementDetailPacking(opts.detailRows, opts.summaryRows);

  // ── HOJA 1: Resumen por productor ────────────────────────────────────────
  {
    const ws  = wb.addWorksheet(tx.sheetResumen, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      tx.productor, tx.cajas, tx.lb, tx.ventas, tx.costoMat,
      tx.costoPackingBase, tx.recargoFormato, tx.costoMaquina,
      tx.lbMachine, tx.totalPacking,
      tx.costoTotal, tx.neto,
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, company || tx.titleAll, '', period, emission, tx);
    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);
    ws.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL } };

    let sumCajas = 0, sumLb = 0, sumVentas = 0, sumMat = 0;
    let sumPackBase = 0, sumRecargo = 0, sumMaquina = 0, sumLbMach = 0, sumTotalPack = 0;
    let sumCost = 0, sumNeto = 0;
    for (const r of opts.summaryRows) {
      const cajas  = toNum(r.cajas); const lb    = toNum(r.lb);
      const ventas = toNum(r.ventas); const mat  = toNum(r.costo_materiales);
      const pb = packingBreakdownFromRow(r);
      const cost = toNum(r.costo_total);
      const neto   = toNum(r.neto_productor);
      sumCajas += cajas; sumLb += lb; sumVentas += ventas;
      sumMat += mat;
      sumPackBase += pb.base; sumRecargo += pb.recargo; sumMaquina += pb.maquina;
      sumLbMach += pb.lbMach; sumTotalPack += pb.total;
      sumCost += cost; sumNeto += neto;
      const row = ws.addRow([
        String(r.productor_nombre ?? ''),
        cajas, lb, ventas, mat,
        pb.base, pb.recargo, pb.maquina, pb.lbMach, pb.total,
        cost, neto,
      ]);
      row.height = 18;
      row.getCell(1).font = { size: 9, name: 'Arial' };
      applyFmt(row.getCell(2), FMT_QTY);   applyFmt(row.getCell(3), FMT_LB);
      applyFmt(row.getCell(4), FMT_MONEY); applyFmt(row.getCell(5), FMT_MONEY);
      applyFmt(row.getCell(6), FMT_MONEY); applyFmt(row.getCell(7), FMT_MONEY);
      applyFmt(row.getCell(8), FMT_MONEY); applyFmt(row.getCell(9), FMT_LB);
      applyFmt(row.getCell(10), FMT_MONEY);
      applyFmt(row.getCell(11), FMT_MONEY); applyFmt(row.getCell(12), FMT_MONEY);
      for (let i = 2; i <= COL; i++) row.getCell(i).alignment = { horizontal: 'right' };
    }
    const tot = ws.addRow([
      '', sumCajas, sumLb, sumVentas, sumMat,
      sumPackBase, sumRecargo, sumMaquina, sumLbMach, sumTotalPack,
      sumCost, sumNeto,
    ]);
    tot.getCell(1).value = tx.total;
    applyFmt(tot.getCell(2), FMT_QTY);   applyFmt(tot.getCell(3), FMT_LB);
    applyFmt(tot.getCell(4), FMT_MONEY); applyFmt(tot.getCell(5), FMT_MONEY);
    applyFmt(tot.getCell(6), FMT_MONEY); applyFmt(tot.getCell(7), FMT_MONEY);
    applyFmt(tot.getCell(8), FMT_MONEY); applyFmt(tot.getCell(9), FMT_LB);
    applyFmt(tot.getCell(10), FMT_MONEY);
    applyFmt(tot.getCell(11), FMT_MONEY); applyFmt(tot.getCell(12), FMT_MONEY);
    styleTotalRow(tot, COL);
    ws.columns = [
      { width: 28 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 },
      { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 },
      { width: 14 }, { width: 14 },
    ];
  }

  // ── HOJA 2: Ventas por despacho ──────────────────────────────────────────
  {
    const ws  = wb.addWorksheet(tx.sheetVentas, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [tx.productor, tx.despacho, tx.formato, tx.cajas, tx.lb, tx.precioVenta, tx.ventas, tx.neto];
    const COL = headers.length;
    addInfoHeader(ws, COL, company || tx.titleAll, '', period, emission, tx);
    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);
    ws.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL } };

    let sumCajas = 0, sumLb = 0, sumVentas = 0, sumNeto = 0;
    for (const d of detailRows) {
      const cajas  = toNum(d.cajas); const lb     = toNum(d.lb);
      const ventas = toNum(d.ventas); const neto  = toNum(d.neto);
      const precio = cajas > 0 ? ventas / cajas : 0;
      sumCajas += cajas; sumLb += lb; sumVentas += ventas; sumNeto += neto;
      const row = ws.addRow([
        String(d.productor_nombre ?? ''),
        toNum(d.dispatch_number ?? d.dispatch_id),
        String(d.format_code ?? ''),
        cajas, lb, precio, ventas, neto,
      ]);
      row.height = 18;
      row.getCell(1).font = { size: 9, name: 'Arial' };
      row.getCell(3).font = { size: 9, name: 'Arial' };
      applyFmt(row.getCell(2), FMT_INT);   applyFmt(row.getCell(4), FMT_QTY);
      applyFmt(row.getCell(5), FMT_LB);    applyFmt(row.getCell(6), FMT_RATE);
      applyFmt(row.getCell(7), FMT_MONEY); applyFmt(row.getCell(8), FMT_MONEY);
      for (let i = 2; i <= COL; i++) row.getCell(i).alignment = { horizontal: 'right' };
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(3).alignment = { horizontal: 'left' };
    }
    const tot = ws.addRow([tx.total, '', '', sumCajas, sumLb, '', sumVentas, sumNeto]);
    applyFmt(tot.getCell(4), FMT_QTY);   applyFmt(tot.getCell(5), FMT_LB);
    applyFmt(tot.getCell(7), FMT_MONEY); applyFmt(tot.getCell(8), FMT_MONEY);
    styleTotalRow(tot, COL);
    ws.columns = [{ width: 24 },{ width: 12 },{ width: 20 },{ width: 10 },{ width: 12 },{ width: 16 },{ width: 14 },{ width: 14 }];
  }

  // ── HOJA 3: Costos por despacho ──────────────────────────────────────────
  {
    const ws  = wb.addWorksheet(tx.sheetCostos, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [tx.productor, tx.despacho, tx.formato, tx.matCaja, tx.packCaja, tx.costoCaja, tx.matTotal, tx.packTotal, tx.costoTotal];
    const COL = headers.length;
    addInfoHeader(ws, COL, company || tx.titleAll, '', period, emission, tx);
    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);
    ws.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL } };

    let sumMat = 0, sumPack = 0, sumCost = 0;
    for (const d of detailRows) {
      const cajas   = toNum(d.cajas);
      const matTot  = toNum(d.costo_materiales); const packTot = packingCostTotal(d);
      const costTot = toNum(d.costo_total);
      const matCaja  = cajas > 0 ? matTot  / cajas : 0;
      const packCaja = cajas > 0 ? packTot / cajas : 0;
      const costCaja = cajas > 0 ? costTot / cajas : 0;
      sumMat += matTot; sumPack += packTot; sumCost += costTot;
      const row = ws.addRow([
        String(d.productor_nombre ?? ''),
        toNum(d.dispatch_number ?? d.dispatch_id),
        String(d.format_code ?? ''),
        matCaja, packCaja, costCaja, matTot, packTot, costTot,
      ]);
      row.height = 18;
      row.getCell(1).font = { size: 9, name: 'Arial' };
      row.getCell(3).font = { size: 9, name: 'Arial' };
      applyFmt(row.getCell(2), FMT_INT);
      for (let i = 4; i <= COL; i++) { applyFmt(row.getCell(i), FMT_RATE); row.getCell(i).alignment = { horizontal: 'right' }; }
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(3).alignment = { horizontal: 'left' };
    }
    const tot = ws.addRow([tx.total, '', '', '', '', '', sumMat, sumPack, sumCost]);
    applyFmt(tot.getCell(7), FMT_MONEY); applyFmt(tot.getCell(8), FMT_MONEY); applyFmt(tot.getCell(9), FMT_MONEY);
    styleTotalRow(tot, COL);
    ws.columns = [{ width: 24 },{ width: 12 },{ width: 20 },{ width: 12 },{ width: 13 },{ width: 12 },{ width: 14 },{ width: 14 },{ width: 14 }];
  }

  // ── HOJA 4: Por formato ──────────────────────────────────────────────────
  {
    const fmtMap = new Map<string, { cajas: number; lb: number; mat: number; pack: number; cost: number; ventas: number }>();
    for (const d of detailRows) {
      const key = String(d.format_code ?? '').trim().toLowerCase() || '(sin formato)';
      const cur = fmtMap.get(key) ?? { cajas: 0, lb: 0, mat: 0, pack: 0, cost: 0, ventas: 0 };
      cur.cajas += toNum(d.cajas); cur.lb += toNum(d.lb); cur.ventas += toNum(d.ventas);
      cur.mat   += toNum(d.costo_materiales); cur.pack += packingCostTotal(d); cur.cost += toNum(d.costo_total);
      fmtMap.set(key, cur);
    }
    const ws  = wb.addWorksheet(tx.sheetFormato, { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [tx.formato, tx.cajas, tx.lb, tx.matCaja, tx.packCaja, tx.costoCaja, tx.matTotal, tx.packTotal, tx.costoTotal, tx.ventas];
    const COL = headers.length;
    addInfoHeader(ws, COL, company || tx.titleAll, '', period, emission, tx);
    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);

    let sumCajas = 0, sumLb = 0, sumMat = 0, sumPack = 0, sumCost = 0, sumVentas = 0;
    for (const [fmt, v] of [...fmtMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const matCaja  = v.cajas > 0 ? v.mat  / v.cajas : 0;
      const packCaja = v.cajas > 0 ? v.pack / v.cajas : 0;
      const costCaja = v.cajas > 0 ? v.cost / v.cajas : 0;
      sumCajas += v.cajas; sumLb += v.lb; sumMat += v.mat; sumPack += v.pack; sumCost += v.cost; sumVentas += v.ventas;
      const row = ws.addRow([fmt, v.cajas, v.lb, matCaja, packCaja, costCaja, v.mat, v.pack, v.cost, v.ventas]);
      row.height = 18;
      row.getCell(1).alignment = { horizontal: 'left' };
      applyFmt(row.getCell(2), FMT_QTY); applyFmt(row.getCell(3), FMT_LB);
      for (let i = 4; i <= COL; i++) { applyFmt(row.getCell(i), FMT_RATE); row.getCell(i).alignment = { horizontal: 'right' }; }
    }
    const tot = ws.addRow([tx.total, sumCajas, sumLb, '', '', '', sumMat, sumPack, sumCost, sumVentas]);
    applyFmt(tot.getCell(2), FMT_QTY); applyFmt(tot.getCell(3), FMT_LB);
    applyFmt(tot.getCell(7), FMT_MONEY); applyFmt(tot.getCell(8), FMT_MONEY);
    applyFmt(tot.getCell(9), FMT_MONEY); applyFmt(tot.getCell(10), FMT_MONEY);
    styleTotalRow(tot, COL);
    ws.columns = [{ width: 22 },{ width: 10 },{ width: 12 },{ width: 12 },{ width: 14 },{ width: 12 },{ width: 14 },{ width: 14 },{ width: 14 },{ width: 14 }];
  }

  // ── Descarga ───────────────────────────────────────────────────────────────
  const filename = opts.lang === 'en' ? 'packing-settlement-all.xlsx' : 'liquidacion-todos.xlsx';
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
