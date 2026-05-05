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

/** Agrupa líneas de `producerSettlementDetail` por formato para un productor (o fila sin asignar). */
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
    const fmt = String(d.format_code ?? '').trim().toLowerCase() || '(sin formato)';
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
    cur.cajas += toNum(d.cajas);
    cur.lb += toNum(d.lb);
    cur.ventas += toNum(d.ventas);
    cur.costo_materiales += toNum(d.costo_materiales);
    cur.costo_packing += toNum(d.costo_packing);
    cur.costo_total += toNum(d.costo_total);
    m.set(fmt, cur);
  }
  return [...m.values()].sort((a, b) => a.format_code.localeCompare(b.format_code));
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
    const fr = byCode.get(row.format_code);
    const precioLb = fr?.precio_packing_por_lb != null ? toNum(fr.precio_packing_por_lb) : null;
    const lbPorCaja = row.cajas > 0 ? row.lb / row.cajas : null;
    return { ...row, precio_packing_por_lb: precioLb, lb_por_caja: lbPorCaja };
  });
}

/**
 * Excel de liquidación por productor (3 hojas) armado en el navegador con los mismos datos que la UI.
 * No reemplaza al export global del servidor.
 */
export async function downloadProducerSettlementExcelClient(opts: {
  fileBase: string;
  producerId: number;
  producerName: string;
  summaryRow: RawRow;
  detailRows: RawRow[];
  formatCostSummaryRows: RawRow[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.creator = 'Packing system — Cierre';

  const s1 = wb.addWorksheet('Resumen productor', { views: [{ state: 'frozen', ySplit: 1 }] });
  s1.addRow(['Campo', 'Valor']);
  const sr = opts.summaryRow;
  const rowsResumen: [string, string | number][] = [
    ['Productor', opts.producerName],
    ['productor_id', opts.producerId],
    ['Cajas', toNum(sr.cajas)],
    ['LB', toNum(sr.lb)],
    ['Ventas', toNum(sr.ventas)],
    ['Costo materiales', toNum(sr.costo_materiales)],
    ['Costo packing', toNum(sr.costo_packing)],
    ['Costo total', toNum(sr.costo_total)],
    ['Neto productor', toNum(sr.neto_productor)],
  ];
  for (const [k, v] of rowsResumen) {
    s1.addRow([k, v]);
  }
  s1.getColumn(1).width = 22;
  s1.getColumn(2).width = 28;

  const s2 = wb.addWorksheet('Detalle despacho', { views: [{ state: 'frozen', ySplit: 1 }] });
  s2.addRow([
    'dispatch_number',
    'dispatch_code',
    'bol_reference',
    'Formato',
    'Cajas',
    'LB',
    'price_per_box',
    'Ventas',
    'material_per_box',
    'packing_per_box',
    'total_cost_per_box',
    'material_total',
    'packing_total',
    'cost_total',
    'Neto',
    'Nota',
  ]);
  const det = opts.detailRows.filter((d) => Number(d.productor_id) === Number(opts.producerId));
  for (const d of det) {
    const cajas = toNum(d.cajas);
    const lb = toNum(d.lb);
    const ventas = toNum(d.ventas);
    const materialTotal = toNum(d.costo_materiales);
    const packingTotal = toNum(d.costo_packing);
    const costTotal = toNum(d.costo_total);
    s2.addRow([
      toNum(d.dispatch_number ?? d.dispatch_id),
      String(d.dispatch_code ?? ''),
      String(d.bol ?? d.reference ?? ''),
      String(d.format_code ?? ''),
      cajas,
      lb,
      cajas > 0 ? ventas / cajas : '',
      ventas,
      cajas > 0 ? materialTotal / cajas : '',
      cajas > 0 ? packingTotal / cajas : '',
      cajas > 0 ? costTotal / cajas : '',
      materialTotal,
      packingTotal,
      costTotal,
      toNum(d.neto),
      String(d.nota_prorrateo ?? ''),
    ]);
  }
  s2.columns = [
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
    { width: 48 },
  ];

  const agg = enrichFormatAggWithFormatCostSummary(
    aggregateDetailByFormatForProducer(opts.producerId, opts.detailRows),
    opts.formatCostSummaryRows,
  );
  const s3 = wb.addWorksheet('Desglose formato', { views: [{ state: 'frozen', ySplit: 1 }] });
  s3.addRow([
    'Formato',
    'Cajas',
    'LB',
    'material_per_box',
    'packing_per_box',
    'total_cost_per_box',
    'material_per_lb',
    'packing_per_lb',
    'total_cost_per_lb',
    'Packing total',
    'Materiales total',
    'Cost total',
    'Ventas',
  ]);
  for (const r of agg) {
    const materialPerBox = r.cajas > 0 ? r.costo_materiales / r.cajas : '';
    const packingPerBox = r.cajas > 0 ? r.costo_packing / r.cajas : '';
    const totalCostPerBox = r.cajas > 0 ? r.costo_total / r.cajas : '';
    const materialPerLb = r.lb > 0 ? r.costo_materiales / r.lb : '';
    const packingPerLb = r.lb > 0 ? r.costo_packing / r.lb : '';
    const totalCostPerLb = r.lb > 0 ? r.costo_total / r.lb : '';
    s3.addRow([
      r.format_code,
      r.cajas,
      r.lb,
      materialPerBox,
      packingPerBox,
      totalCostPerBox,
      materialPerLb,
      packingPerLb,
      totalCostPerLb,
      r.costo_packing,
      r.costo_materiales,
      r.costo_total,
      r.ventas,
    ]);
  }
  s3.columns = [
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.fileBase}-liquidacion-productor-${opts.producerId}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
