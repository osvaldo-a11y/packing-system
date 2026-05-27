import ExcelJS from 'exceljs';

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type RawRow = Record<string, unknown>;

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

const FMT_MONEY = '#,##0.00';
const FMT_QTY   = '#,##0';
const FMT_LB    = '#,##0.00';
const FMT_RATE  = '#,##0.00';
const FMT_INT   = '#,##0';

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

  const r3 = ws.addRow([`Período: ${period}   ·   Emitido: ${emission}`]);
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
    cur.costo_packing    += toNum(d.costo_packing);
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

  // Filas de detalle del productor (filtradas una sola vez)
  const detProd = opts.detailRows.filter(
    (d) => Number(d.productor_id) === Number(opts.producerId),
  );

  // ── HOJA 1: Resumen ────────────────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 5 }] });
    const COL = 2;
    addInfoHeader(ws, COL, company, opts.producerName, period, emission);

    const hRow = ws.addRow(['Campo', 'Valor']);
    styleHeader(hRow, COL);

    const sr = opts.summaryRow;
    const entries: Array<{ label: string; value: number | string; fmt?: string }> = [
      { label: 'Productor',        value: opts.producerName },
      { label: 'Cajas',            value: toNum(sr.cajas),            fmt: FMT_QTY   },
      { label: 'Libras (LB)',       value: toNum(sr.lb),               fmt: FMT_LB    },
      { label: 'Ventas',           value: toNum(sr.ventas),           fmt: FMT_MONEY },
      { label: 'Costo materiales', value: toNum(sr.costo_materiales), fmt: FMT_MONEY },
      { label: 'Costo packing',    value: toNum(sr.costo_packing),    fmt: FMT_MONEY },
      { label: 'Costo total',      value: toNum(sr.costo_total),      fmt: FMT_MONEY },
      { label: 'Neto productor',   value: toNum(sr.neto_productor),   fmt: FMT_MONEY },
    ];

    for (const e of entries) {
      const row = ws.addRow([e.label, e.value]);
      row.height = 20;
      row.getCell(1).font = { size: 10, name: 'Arial' };
      const valCell = row.getCell(2);
      valCell.alignment = { horizontal: 'right' };
      valCell.font = { size: 10, name: 'Arial' };
      if (e.fmt) applyFmt(valCell, e.fmt);
    }

    // Fila NETO destacada
    styleTotalRow(ws.lastRow!, COL);

    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 22;
  }

  // ── HOJA 2: Ventas por despacho ────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet('Ventas por despacho', { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      'N° Despacho', 'Formato',
      'Cajas', 'LB',
      'Precio venta/caja', 'Ventas', 'Neto',
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, company, opts.producerName, period, emission);

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

    const tot = ws.addRow(['TOTAL', '', sumCajas, sumLb, '', sumVentas, sumNeto]);
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
    const ws  = wb.addWorksheet('Costos por despacho', { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      'N° Despacho', 'Formato',
      'Mat./caja', 'Packing/caja', 'Costo/caja',
      'Mat. total', 'Packing total', 'Costo total',
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, company, opts.producerName, period, emission);

    const hRow = ws.addRow(headers);
    styleHeader(hRow, COL);
    ws.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL } };

    let sumMat = 0, sumPack = 0, sumCost = 0;

    for (const d of detProd) {
      const cajas   = toNum(d.cajas);
      const matTot  = toNum(d.costo_materiales);
      const packTot = toNum(d.costo_packing);
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

    const tot = ws.addRow(['TOTAL', '', '', '', '', sumMat, sumPack, sumCost]);
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
      aggregateDetailByFormatForProducer(opts.producerId, opts.detailRows),
      opts.formatCostSummaryRows,
    );

    const ws  = wb.addWorksheet('Por formato', { views: [{ state: 'frozen', ySplit: 5 }] });
    const headers = [
      'Formato', 'Cajas', 'LB',
      'Mat./caja', 'Packing/caja', 'Costo/caja',
      'Mat. total', 'Packing total', 'Costo total', 'Ventas',
    ];
    const COL = headers.length;
    addInfoHeader(ws, COL, company, opts.producerName, period, emission);

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
      'TOTAL', sumCajas, sumLb,
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
