import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportExportQueryDto, ReportFilterDto } from './reporting.dto';
import { ReportingService } from './reporting.service';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

@Injectable()
export class ReportingExportService {
  constructor(private readonly reporting: ReportingService) {}

  async build(format: ExportFormat, query: ReportExportQueryDto) {
    const data = await this.reporting.generateFullExport(query);
    const flat = {
      boxesByProducer: data.boxesByProducer.rows,
      boxesByProducerDetail: data.boxesByProducerDetail.rows,
      dispatchedBoxesByProducer: data.dispatchedBoxesByProducer.rows,
      palletCosts: data.palletCosts.rows,
      yieldAndWaste: data.yieldAndWaste.rows,
      salesAndCostsByDispatch: data.salesAndCostsByDispatch.rows,
      packagingByFormat: data.packagingByFormat.rows,
      clientMarginSummary: data.clientMarginSummary?.rows ?? [],
      clientMarginDetail: data.clientMarginDetail?.rows ?? [],
      plant_thresholds: data.plant_thresholds,
      filters: data.filters,
    };
    if (format === 'csv') {
      return this.buildCsv(flat);
    }
    if (format === 'xlsx') {
      return this.buildXlsx(flat);
    }
    if (format === 'pdf') {
      const profile = query.pdf_profile === 'external' ? 'external' : 'internal';
      return this.buildOperationalPdf(flat, profile);
    }
    throw new BadRequestException('formato no soportado');
  }

  private buildCsv(payload: Record<string, unknown>) {
    const lines: string[] = [];
    lines.push('seccion,json');
    for (const [section, rows] of Object.entries(payload)) {
      if (section === 'plant_thresholds') {
        lines.push(`${section},${JSON.stringify(rows)}`);
        continue;
      }
      if (section === 'filters') {
        lines.push(`${section},${JSON.stringify(rows)}`);
        continue;
      }
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        lines.push(`${section},${JSON.stringify(row)}`);
      }
    }
    const body = lines.join('\n');
    return {
      buffer: Buffer.from(body, 'utf8'),
      mime: 'text/csv; charset=utf-8',
      filename: 'reporte-packing.csv',
    };
  }

  /** Presentación export (PDF/Excel): mismo criterio que el frontend `format-report-cell`. */
  private static parseExportNumber(v: unknown): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private static exportCellDisplay(key: string, v: unknown): string {
    const k = key.toLowerCase();
    if (v == null) return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === 'object') return JSON.stringify(v);
    const n = ReportingExportService.parseExportNumber(v);
    if (n == null) return String(v);
    if (Math.abs(n) < 1e-9 && n !== 0) return '0';
    if ((k.endsWith('_id') || k === 'id') && (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-6)) {
      return Math.round(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
    }
    if (
      /cajas|pallets|boxes|amount|lineas|trays/i.test(k) &&
      !/precio|costo|subtotal|venta|margen|delta|factor|unit/i.test(k)
    ) {
      return Math.round(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
    }
    if (
      /venta|precio|costo|subtotal|monto|margen|neto|delta|total|tarifa|unit_price|line_subtotal|pallet_cost/i.test(k) &&
      !/lb|pounds|peso|cajas$/i.test(k)
    ) {
      return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (/rend|merma|percent|pct|yield|tasa/i.test(k)) {
      return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    if (/lb|pounds|peso|net_lb|gross|packout|entrada|iqf/i.test(k)) {
      return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    if (/factor|ratio|frac|qty_per|consumo_total|cantidad_receta|costo_por_caja|costo_por_lb|precio.*lb/i.test(k)) {
      return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
    }
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-5) {
      return Math.round(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
    }
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private static excelNumFmtForKey(key: string): string | undefined {
    const k = key.toLowerCase();
    if ((k.endsWith('_id') || k === 'id') && !/uuid/i.test(k)) return '#,##0';
    if (
      /cajas|pallets|boxes|amount|lineas|trays/i.test(k) &&
      !/precio|costo|subtotal|venta|margen|delta|factor|unit/i.test(k)
    ) {
      return '#,##0';
    }
    if (
      /venta|precio|costo|subtotal|monto|margen|neto|delta|total|tarifa|unit_price|line_subtotal|pallet_cost/i.test(k) &&
      !/lb|pounds|peso/i.test(k)
    ) {
      return '#,##0.00';
    }
    if (/rend|merma|percent|pct|yield|tasa/i.test(k)) return '#,##0.00';
    if (/lb|pounds|peso|net_lb|gross|packout|entrada|iqf/i.test(k)) return '#,##0.00';
    if (/factor|ratio|frac|qty_per|consumo|costo_por|precio.*lb/i.test(k)) return '#,##0.######';
    return undefined;
  }

  private static excelTypedValue(key: string, v: unknown): ExcelJS.CellValue {
    if (v == null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    const fmt = ReportingExportService.excelNumFmtForKey(key);
    if (!fmt) {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') return v;
      return String(v);
    }
    const n = ReportingExportService.parseExportNumber(v);
    if (n == null) return String(v);
    return n;
  }

  private pdfColumnAlign(key: string): 'left' | 'right' | 'center' {
    const k = key.toLowerCase();
    if (
      /_id$|^id$|cajas|pallets|lb|ventas|costo|total|margen|precio|subtotal|monto|amount|neto|delta|rend|merma|yield|boxes/i.test(
        k,
      )
    ) {
      return 'right';
    }
    return 'left';
  }

  private pdfTableFromRows(title: string, rows: Record<string, unknown>[], doc: InstanceType<typeof PDFDocument>) {
    if (!rows.length) {
      this.pdfDrawDataTable(
        doc,
        title,
        [{ w: 1, header: '—', align: 'left' }],
        [['sin datos']],
        null,
        { titleSize: 11, bodyFontSize: 8.5 },
      );
      return;
    }
    const cols = Object.keys(rows[0]);
    const n = cols.length;
    const w = 1 / n;
    const columns = cols.map((c) => ({
      w,
      header: c,
      align: this.pdfColumnAlign(c),
    }));
    const body: string[][] = rows.map((r) => cols.map((c) => ReportingExportService.exportCellDisplay(c, r[c])));
    this.pdfDrawDataTable(doc, title, columns, body, null, { titleSize: 11, bodyFontSize: 7.5, headerFontSize: 8 });
  }

  private async buildOperationalPdf(
    payload: Record<string, unknown>,
    profile: 'internal' | 'external',
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const company = process.env.COMPANY_DISPLAY_NAME?.trim() || 'Empresa';
    const emission = new Date().toLocaleString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const filters = payload.filters as Record<string, unknown> | undefined;
    const filterLines: string[] = [];
    if (filters && typeof filters === 'object') {
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null || v === '') continue;
        filterLines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
      }
    }

    doc.fontSize(16).font('Helvetica-Bold').text('Reporte operativo — packing', { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#333333');
    doc.moveDown(0.5);
    doc.text(company, { align: 'center' });
    doc.text(`Emisión: ${emission}`, { align: 'center' });
    doc.text(profile === 'external' ? 'Perfil: resumen (entrega)' : 'Perfil: interno (detalle)', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown();
    doc.fontSize(9).text('Filtros aplicados:', { underline: true });
    doc.fontSize(8);
    if (filterLines.length) {
      for (const line of filterLines.slice(0, 24)) {
        doc.text(line, { width: this.pdfContentWidth(doc) });
      }
    } else {
      doc.text('Sin filtros adicionales.');
    }
    doc.moveDown(0.5);
    doc.fontSize(9).text('Umbrales planta (referencia):', { underline: true });
    doc.fontSize(8).text(JSON.stringify(payload.plant_thresholds ?? {}), { width: this.pdfContentWidth(doc) });
    doc.moveDown();

    const maxRows = profile === 'external' ? 55 : 500;
    const take = (rows: unknown) => {
      if (!Array.isArray(rows)) return [];
      const r = rows as Record<string, unknown>[];
      return r.slice(0, maxRows);
    };

    const noteIfTrunc = (rows: unknown, label: string) => {
      if (!Array.isArray(rows)) return;
      if (rows.length > maxRows) {
        doc.fontSize(8).fillColor('#884400').text(`[${label}] Mostrando ${maxRows} de ${rows.length} filas.`, {
          width: this.pdfContentWidth(doc),
        });
        doc.fillColor('#000000');
        doc.moveDown(0.3);
      }
    };

    this.pdfTableFromRows('Cajas PT por productor (unidades PT)', take(payload.boxesByProducer), doc);
    noteIfTrunc(payload.boxesByProducer, 'Cajas PT por productor');

    if (profile === 'internal') {
      this.pdfTableFromRows('Cajas PT — detalle por operación / unidad PT', take(payload.boxesByProducerDetail), doc);
      noteIfTrunc(payload.boxesByProducerDetail, 'Detalle PT');
    } else {
      doc.fontSize(9).fillColor('#555555').text('Sección omitida en perfil resumen: detalle PT por operación/unidad PT.', {
        width: this.pdfContentWidth(doc),
      });
      doc.fillColor('#000000');
      doc.moveDown();
    }

    this.pdfTableFromRows('Cajas despachadas por productor (factura)', take(payload.dispatchedBoxesByProducer), doc);
    noteIfTrunc(payload.dispatchedBoxesByProducer, 'Cajas despachadas');

    this.pdfTableFromRows('Costo pallet por unidad PT', take(payload.palletCosts), doc);
    this.pdfTableFromRows('Rendimiento y merma registrada', take(payload.yieldAndWaste), doc);
    this.pdfTableFromRows('Ventas por despacho', take(payload.salesAndCostsByDispatch), doc);
    this.pdfTableFromRows('Embalaje por formato', take(payload.packagingByFormat), doc);
    this.pdfTableFromRows('Margen por cliente (resumen)', take(payload.clientMarginSummary), doc);

    if (profile === 'internal') {
      this.pdfTableFromRows('Margen por cliente (detalle formato)', take(payload.clientMarginDetail), doc);
      noteIfTrunc(payload.clientMarginDetail, 'Margen cliente detalle');
    } else {
      doc.fontSize(9).fillColor('#555555').text('Sección omitida en perfil resumen: margen por cliente (detalle por formato).', {
        width: this.pdfContentWidth(doc),
      });
      doc.fillColor('#000000');
      doc.moveDown();
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 36;
      doc.fontSize(8).fillColor('#666666').text(`${company} · Reporte operativo`, doc.page.margins.left, footerY, {
        align: 'left',
        width: this.pdfContentWidth(doc),
      });
      doc.text(`Página ${i - range.start + 1} / ${range.count}`, doc.page.margins.left, footerY + 12, {
        align: 'center',
        width: this.pdfContentWidth(doc),
      });
      doc.fillColor('#000000');
    }

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    const suffix = profile === 'external' ? '-resumen' : '-interno';
    return {
      buffer: Buffer.concat(chunks),
      mime: 'application/pdf',
      filename: `reporte-packing${suffix}.pdf`,
    };
  }

  private async buildXlsx(payload: Record<string, unknown>) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Packing system';
    wb.created = new Date();

    const filtros = wb.addWorksheet('Filtros', { views: [{ state: 'frozen', ySplit: 1 }] });
    filtros.getRow(1).font = { bold: true };
    filtros.getRow(1).values = ['Parámetro', 'Valor'];
    let fr = 2;
    const filterObj = (payload.filters ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(filterObj)) {
      if (v === undefined || v === null || v === '') continue;
      filtros.getRow(fr).values = [k, typeof v === 'object' ? JSON.stringify(v) : String(v)];
      fr++;
    }
    filtros.getColumn(1).width = 28;
    filtros.getColumn(2).width = 48;

    const umb = wb.addWorksheet('Umbrales', { views: [{ state: 'frozen', ySplit: 1 }] });
    umb.getRow(1).font = { bold: true };
    umb.getRow(1).values = ['Clave', 'Valor'];
    const th = (payload.plant_thresholds ?? {}) as Record<string, unknown>;
    let ur = 2;
    for (const [k, v] of Object.entries(th)) {
      umb.getRow(ur).values = [k, typeof v === 'number' && Number.isFinite(v) ? v : String(v)];
      const cell = umb.getRow(ur).getCell(2);
      if (typeof v === 'number' && Number.isFinite(v)) cell.numFmt = '#,##0.######';
      ur++;
    }
    umb.getColumn(1).width = 24;
    umb.getColumn(2).width = 18;

    const addDataSheet = (name: string, rows: unknown) => {
      const ws = wb.addWorksheet(name.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
      });
      if (!Array.isArray(rows) || !rows.length) {
        ws.addRow(['sin datos para esta sección']);
        return;
      }
      const data = rows as Record<string, unknown>[];
      const cols = Object.keys(data[0]);
      const header = ws.addRow(cols);
      header.font = { bold: true };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };
      for (const row of data) {
        const excelRow = ws.addRow(cols.map((c) => ReportingExportService.excelTypedValue(c, row[c])));
        excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const key = cols[colNumber - 1];
          const fmt = key ? ReportingExportService.excelNumFmtForKey(key) : undefined;
          if (fmt && typeof cell.value === 'number') cell.numFmt = fmt;
        });
      }
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      cols.forEach((c, i) => {
        const len = Math.min(42, Math.max(10, c.length + 2));
        ws.getColumn(i + 1).width = len;
      });
    };

    addDataSheet('Cajas_PT_productor', payload.boxesByProducer);
    addDataSheet('Cajas_PT_detalle', payload.boxesByProducerDetail);
    addDataSheet('Cajas_despachadas', payload.dispatchedBoxesByProducer);
    addDataSheet('Costo_pallet', payload.palletCosts);
    addDataSheet('Rend_merma', payload.yieldAndWaste);
    addDataSheet('Ventas_despacho', payload.salesAndCostsByDispatch);
    addDataSheet('Embalaje_formato', payload.packagingByFormat);
    addDataSheet('Margen_cli_resumen', payload.clientMarginSummary);
    addDataSheet('Margen_cli_detalle', payload.clientMarginDetail);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'reporte-packing.xlsx',
    };
  }

  private formatSettlementPeriod(filter: ReportFilterDto): string {
    if (filter.fecha_desde && filter.fecha_hasta) {
      return `${filter.fecha_desde} → ${filter.fecha_hasta}`;
    }
    if (filter.fecha_desde) return `desde ${filter.fecha_desde}`;
    if (filter.fecha_hasta) return `hasta ${filter.fecha_hasta}`;
    return 'Todo el rango (sin filtro de fechas en despacho)';
  }

  private filterDescription(filter: ReportFilterDto): string {
    const parts: string[] = [];
    if (filter.productor_id != null && Number(filter.productor_id) > 0) {
      parts.push(`productor_id=${filter.productor_id}`);
    }
    if (filter.cliente_id != null && Number(filter.cliente_id) > 0) {
      parts.push(`cliente_id=${filter.cliente_id}`);
    }
    if (filter.format_code?.trim()) parts.push(`formato=${filter.format_code.trim()}`);
    if (filter.tarja_id != null && Number(filter.tarja_id) > 0) parts.push(`unidad_pt=${filter.tarja_id}`);
    return parts.length ? parts.join(' · ') : 'Sin filtros adicionales';
  }

  /**
   * PDF de liquidación por productor.
   * `producer`: documento de entrega, claro y sin detalle técnico interno.
   * `internal`: desglose materiales/packing, notas de trazabilidad y diagnóstico.
   */
  async buildProducerSettlementPdf(variant: 'producer' | 'internal', filter: ReportFilterDto) {
    const inner = await this.reporting.computeFormatCostingRows(filter);
    const { summaryRows, detailRows } = await this.reporting.computeProducerSettlementRows(filter, inner);

    if (variant === 'producer') {
      const meta = await this.reporting.getSettlementPdfMeta(filter);
      return await this.renderProducerDeliveryPdf(summaryRows, detailRows, filter, meta);
    }

    const diagnostic = await this.reporting.producerSettlementDiagnostic(filter);
    return await this.renderProducerInternalPdf(summaryRows, detailRows, filter, diagnostic);
  }

  private static moneyAr(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Cajas / lb — no usar formato monetario. */
  private static qtyAr(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private static precioCajaAr(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private static clipText(s: string, max: number): string {
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t) return '—';
    return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
  }

  /** Ancho útil entre márgenes del documento. */
  private pdfContentWidth(doc: InstanceType<typeof PDFDocument>): number {
    const m = doc.page.margins;
    return doc.page.width - m.left - m.right;
  }

  private pdfBottomY(doc: InstanceType<typeof PDFDocument>): number {
    return doc.page.height - doc.page.margins.bottom;
  }

  private pdfHLine(
    doc: InstanceType<typeof PDFDocument>,
    x1: number,
    y: number,
    x2: number,
    opts?: { color?: string; width?: number },
  ) {
    doc.save();
    doc.strokeColor(opts?.color ?? '#bfbfbf').lineWidth(opts?.width ?? 0.5);
    doc.moveTo(x1, y).lineTo(x2, y).stroke();
    doc.restore();
  }

  private pdfHLineDark(doc: InstanceType<typeof PDFDocument>, x1: number, y: number, x2: number) {
    this.pdfHLine(doc, x1, y, x2, { color: '#333333', width: 0.75 });
  }

  /** Columna: fracción del ancho de tabla (suma ≈ 1). */
  private pdfDrawTableRow(
    doc: InstanceType<typeof PDFDocument>,
    left: number,
    y: number,
    tableWidth: number,
    columns: Array<{ w: number; align: 'left' | 'right' | 'center' }>,
    cells: string[],
    opts: { bold?: boolean; fontSize?: number; textColor?: string; padX?: number },
  ): number {
    const fs = opts.fontSize ?? 9;
    const padX = opts.padX ?? 5;
    const padTop = 5;
    const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    const color = opts.textColor ?? '#111111';
    doc.font(font).fontSize(fs).fillColor(color);
    let maxTextH = 0;
    let x = left;
    for (let i = 0; i < columns.length; i++) {
      const cw = columns[i].w * tableWidth;
      const innerW = Math.max(8, cw - padX * 2);
      const h = doc.heightOfString(cells[i] ?? '', {
        width: innerW,
        lineGap: 0.5,
      });
      maxTextH = Math.max(maxTextH, h);
      x += cw;
    }
    const rowHeight = Math.max(fs + 10, padTop + maxTextH + 6);
    x = left;
    for (let i = 0; i < columns.length; i++) {
      const cw = columns[i].w * tableWidth;
      const innerW = Math.max(8, cw - padX * 2);
      const tx = x + padX;
      doc.text(cells[i] ?? '', tx, y + padTop, {
        width: innerW,
        align: columns[i].align,
        lineGap: 0.5,
      });
      x += cw;
    }
    return rowHeight;
  }

  /**
   * Tabla con encabezado, filas y fila TOTAL opcional; líneas horizontales y paginación con reencabezado.
   */
  private pdfDrawDataTable(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    columns: Array<{ w: number; header: string; align: 'left' | 'right' | 'center' }>,
    bodyRows: string[][],
    totalRow: string[] | null,
    options?: {
      titleSize?: number;
      repeatHeaderEachPage?: boolean;
      headerFontSize?: number;
      bodyFontSize?: number;
      totalFontSize?: number;
    },
  ) {
    const left = doc.page.margins.left;
    const tw = this.pdfContentWidth(doc);
    const titleSize = options?.titleSize ?? 12;
    const repeatHeader = options?.repeatHeaderEachPage ?? true;
    const headerFs = options?.headerFontSize ?? 9;
    const bodyFs = options?.bodyFontSize ?? 8.5;
    const totalFs = options?.totalFontSize ?? 9;

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(titleSize).fillColor('#000000').text(title, { align: 'left' });
    doc.moveDown(0.35);

    const colMeta = columns.map((c) => ({ w: c.w, align: c.align }));
    const headers = columns.map((c) => c.header);

    const drawHeader = (startY: number) => {
      let y = startY;
      this.pdfHLineDark(doc, left, y, left + tw);
      y += 4;
      const h = this.pdfDrawTableRow(doc, left, y, tw, colMeta, headers, { bold: true, fontSize: headerFs });
      y += h;
      this.pdfHLineDark(doc, left, y, left + tw);
      return y + 2;
    };

    let y = doc.y;
    if (y + 80 > this.pdfBottomY(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y = drawHeader(y);

    const rowLine = (yy: number) => this.pdfHLine(doc, left, yy, left + tw);

    const pageBreak = (): number => {
      doc.addPage();
      return repeatHeader ? drawHeader(doc.page.margins.top) : doc.page.margins.top + 24;
    };

    for (let i = 0; i < bodyRows.length; i++) {
      /** Margen por filas con texto multilínea (notas, etc.). */
      if (y + bodyFs + 36 > this.pdfBottomY(doc) - 8) {
        y = pageBreak();
      }
      const rowH = this.pdfDrawTableRow(doc, left, y, tw, colMeta, bodyRows[i], { fontSize: bodyFs });
      y += rowH;
      rowLine(y);
    }

    if (totalRow && totalRow.length === columns.length) {
      const trh = totalFs + 10;
      if (y + trh + 12 > this.pdfBottomY(doc)) {
        y = pageBreak();
      }
      doc.save();
      doc.fillColor('#ececec');
      doc.rect(left, y, tw, trh + 4).fill();
      doc.restore();
      y += 2;
      this.pdfDrawTableRow(doc, left, y, tw, colMeta, totalRow, {
        bold: true,
        fontSize: totalFs,
        textColor: '#000000',
      });
      y += trh + 2;
      this.pdfHLineDark(doc, left, y, left + tw);
    } else if (bodyRows.length > 0) {
      this.pdfHLineDark(doc, left, y, left + tw);
    }

    doc.y = y + 8;
  }

  /** PDF para entregar al productor: encabezado formal, resumen con totales, detalle legible, sin diagnóstico. */
  private async renderProducerDeliveryPdf(
    summaryRows: Record<string, unknown>[],
    detailRows: Record<string, unknown>[],
    filter: ReportFilterDto,
    meta: { productorNombre: string | null; especieLabel: string | null; formatoCodigo: string | null },
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const company = process.env.COMPANY_DISPLAY_NAME?.trim() || 'Empresa emisora';
    const period = this.formatSettlementPeriod(filter);
    const emission = new Date().toLocaleString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const w = this.pdfContentWidth(doc);
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const pickText = (row: Record<string, unknown>, keys: string[]): string => {
      for (const k of keys) {
        const v = row[k];
        if (v != null && String(v).trim() !== '') return String(v);
      }
      return '—';
    };

    doc.fontSize(16).font('Helvetica-Bold').text('LIQUIDACIÓN AL PRODUCTOR', { align: 'center', width: w });
    doc.moveDown(0.35);
    doc.fontSize(11).text(company, { align: 'center', width: w });
    doc.font('Helvetica');
    doc.moveDown(0.85);

    doc.fontSize(10).fillColor('#111111');
    if (meta.productorNombre) {
      doc.text(`Productor: ${meta.productorNombre}`, { width: w });
    } else if (filter.productor_id != null && Number(filter.productor_id) > 0) {
      doc.text(`Productor: (referencia ${filter.productor_id})`, { width: w });
    } else {
      doc.text('Alcance: todos los productores incluidos en esta liquidación.', { width: w });
    }
    doc.text(`Período (fechas de despacho facturado): ${period}`, { width: w });
    doc.text(`Fecha de emisión: ${emission}`, { width: w });
    if (meta.especieLabel) {
      doc.text(`Especie / variedad: ${meta.especieLabel}`, { width: w });
    } else if (meta.formatoCodigo) {
      doc.text(`Formato considerado en el informe: ${meta.formatoCodigo}`, { width: w });
    }
    doc.moveDown(0.5);
    doc.fontSize(8);
    doc.fillColor('#444444').text(
      'Los costos se componen de materiales de empaque según receta y servicio de packing calculado por libra de acuerdo a la especie/formato.',
      { width: w, align: 'left' },
    );
    doc.fillColor('#000000');
    doc.moveDown(0.9);

    let sumCajas = 0;
    let sumLb = 0;
    let sumVentas = 0;
    let sumCosto = 0;
    let sumNeto = 0;

    const summaryCols = [
      { w: 0.28, header: 'Productor', align: 'left' as const },
      { w: 0.12, header: 'Cajas', align: 'right' as const },
      { w: 0.12, header: 'LB', align: 'right' as const },
      { w: 0.16, header: 'Ventas', align: 'right' as const },
      { w: 0.16, header: 'Costos', align: 'right' as const },
      { w: 0.16, header: 'Neto', align: 'right' as const },
    ];

    if (!summaryRows.length) {
      doc.fontSize(10).font('Helvetica').fillColor('#666666').text('No hay datos para los filtros seleccionados.', {
        width: w,
      });
      doc.fillColor('#000000');
    } else {
      const summaryBody: string[][] = [];
      for (const r of summaryRows) {
        const name = ReportingExportService.clipText(
          String((r as { productor_nombre?: string }).productor_nombre ?? '—'),
          36,
        );
        const cajas = Number((r as { cajas?: number }).cajas ?? 0);
        const lb = Number((r as { lb?: number }).lb ?? 0);
        const ventas = Number((r as { ventas?: number }).ventas ?? 0);
        const ct = Number((r as { costo_total?: number }).costo_total ?? 0);
        const neto = Number((r as { neto_productor?: number }).neto_productor ?? 0);
        sumCajas += cajas;
        sumLb += lb;
        sumVentas += ventas;
        sumCosto += ct;
        sumNeto += neto;
        summaryBody.push([
          name,
          ReportingExportService.qtyAr(cajas),
          ReportingExportService.qtyAr(lb),
          ReportingExportService.moneyAr(ventas),
          ReportingExportService.moneyAr(ct),
          ReportingExportService.moneyAr(neto),
        ]);
      }
      const totalRow = [
        'TOTAL',
        ReportingExportService.qtyAr(sumCajas),
        ReportingExportService.qtyAr(sumLb),
        ReportingExportService.moneyAr(sumVentas),
        ReportingExportService.moneyAr(sumCosto),
        ReportingExportService.moneyAr(sumNeto),
      ];
      this.pdfDrawDataTable(doc, 'Resumen por productor', summaryCols, summaryBody, totalRow, {
        titleSize: 14,
      });
    }

    doc.moveDown(0.5);

    const detailColsA = [
      { w: 0.09, header: 'Despacho', align: 'left' as const },
      { w: 0.12, header: 'Código / BOL', align: 'left' as const },
      { w: 0.16, header: 'Formato', align: 'left' as const },
      { w: 0.08, header: 'Cajas', align: 'right' as const },
      { w: 0.08, header: 'LB', align: 'right' as const },
      { w: 0.1, header: 'Precio venta/caja', align: 'right' as const },
      { w: 0.12, header: 'Ventas', align: 'right' as const },
      { w: 0.12, header: 'Neto', align: 'right' as const },
      { w: 0.13, header: 'Nota', align: 'left' as const },
    ];

    const detailColsB = [
      { w: 0.09, header: 'Despacho', align: 'left' as const },
      { w: 0.16, header: 'Formato', align: 'left' as const },
      { w: 0.11, header: 'Material/caja', align: 'right' as const },
      { w: 0.11, header: 'Packing/caja', align: 'right' as const },
      { w: 0.11, header: 'Total costo/caja', align: 'right' as const },
      { w: 0.14, header: 'Material total', align: 'right' as const },
      { w: 0.14, header: 'Packing total', align: 'right' as const },
      { w: 0.14, header: 'Costo total', align: 'right' as const },
    ];

    if (!detailRows.length) {
      doc.fontSize(10).font('Helvetica').fillColor('#666666').text('Sin líneas de detalle para estos filtros.', {
        width: w,
      });
      doc.fillColor('#000000');
    } else {
      const detailBodyA: string[][] = [];
      const detailBodyB: string[][] = [];
      const byFormat = new Map<
        string,
        { cajas: number; lb: number; material: number; packing: number; total: number; ventas: number }
      >();
      for (const r of detailRows) {
        const did = pickText(r, ['dispatch_number', 'dispatch_id']);
        const dispatchCode = pickText(r, ['dispatch_code']);
        const bol = pickText(r, ['bol', 'reference', 'reference_number']);
        const codeBol = dispatchCode !== '—' ? dispatchCode : bol;
        const fc = ReportingExportService.clipText(String((r as { format_code?: string }).format_code ?? '—'), 24);
        const cajas = num((r as { cajas?: number }).cajas);
        const lb = num((r as { lb?: number }).lb);
        const ventas = num((r as { ventas?: number }).ventas);
        const cm = num((r as { costo_materiales?: number }).costo_materiales);
        const cp = num((r as { costo_packing?: number }).costo_packing);
        const ct = num((r as { costo_total?: number }).costo_total);
        const neto = num((r as { neto?: number }).neto);
        const precio = cajas > 0 ? ventas / cajas : 0;
        const matCaja = cajas > 0 ? cm / cajas : 0;
        const packCaja = cajas > 0 ? cp / cajas : 0;
        const totalCaja = cajas > 0 ? ct / cajas : 0;
        const note = ReportingExportService.clipText(
          pickText(r, ['nota_prorrateo', 'nota_trazabilidad', 'trace_note']),
          56,
        );

        detailBodyA.push([
          did,
          ReportingExportService.clipText(codeBol, 22),
          ReportingExportService.clipText(fc, 24),
          ReportingExportService.qtyAr(cajas),
          ReportingExportService.qtyAr(lb),
          ReportingExportService.precioCajaAr(precio),
          ReportingExportService.moneyAr(ventas),
          ReportingExportService.moneyAr(neto),
          note,
        ]);
        detailBodyB.push([
          did,
          ReportingExportService.clipText(fc, 24),
          ReportingExportService.precioCajaAr(matCaja),
          ReportingExportService.precioCajaAr(packCaja),
          ReportingExportService.precioCajaAr(totalCaja),
          ReportingExportService.moneyAr(cm),
          ReportingExportService.moneyAr(cp),
          ReportingExportService.moneyAr(ct),
        ]);

        const key = String((r as { format_code?: string }).format_code ?? '').trim().toLowerCase() || '(sin formato)';
        const cur = byFormat.get(key) ?? { cajas: 0, lb: 0, material: 0, packing: 0, total: 0, ventas: 0 };
        cur.cajas += cajas;
        cur.lb += lb;
        cur.material += cm;
        cur.packing += cp;
        cur.total += ct;
        cur.ventas += ventas;
        byFormat.set(key, cur);
      }
      this.pdfDrawDataTable(doc, 'Detalle por despacho — ventas y neto', detailColsA, detailBodyA, null, {
        titleSize: 13,
        headerFontSize: 8,
        bodyFontSize: 7.5,
      });
      this.pdfDrawDataTable(doc, 'Detalle por despacho — costos abiertos', detailColsB, detailBodyB, null, {
        titleSize: 12,
        headerFontSize: 8,
        bodyFontSize: 7.5,
      });

      const fmtCols = [
        { w: 0.2, header: 'Formato', align: 'left' as const },
        { w: 0.08, header: 'Cajas', align: 'right' as const },
        { w: 0.08, header: 'LB', align: 'right' as const },
        { w: 0.11, header: 'Material/caja', align: 'right' as const },
        { w: 0.11, header: 'Packing/caja', align: 'right' as const },
        { w: 0.11, header: 'Total/caja', align: 'right' as const },
        { w: 0.1, header: 'Material total', align: 'right' as const },
        { w: 0.1, header: 'Packing total', align: 'right' as const },
        { w: 0.11, header: 'Costo total', align: 'right' as const },
      ];
      const fmtBody: string[][] = [];
      for (const [fmt, val] of [...byFormat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
        const matCaja = val.cajas > 0 ? val.material / val.cajas : 0;
        const packCaja = val.cajas > 0 ? val.packing / val.cajas : 0;
        const totalCaja = val.cajas > 0 ? val.total / val.cajas : 0;
        fmtBody.push([
          ReportingExportService.clipText(fmt, 30),
          ReportingExportService.qtyAr(val.cajas),
          ReportingExportService.qtyAr(val.lb),
          ReportingExportService.precioCajaAr(matCaja),
          ReportingExportService.precioCajaAr(packCaja),
          ReportingExportService.precioCajaAr(totalCaja),
          ReportingExportService.moneyAr(val.material),
          ReportingExportService.moneyAr(val.packing),
          ReportingExportService.moneyAr(val.total),
        ]);
      }
      this.pdfDrawDataTable(doc, 'Resumen de costos por formato', fmtCols, fmtBody, null, {
        titleSize: 12,
        headerFontSize: 8,
        bodyFontSize: 7.5,
      });
    }

    doc.moveDown(1);
    doc.fontSize(8);
    doc.fillColor('#333333').text(
      'Documento emitido para fines de liquidación comercial. Ante consultas, coordinar con la administración de la empresa.',
      { width: w, align: 'left' },
    );

    return this.pdfBufferAndFinish(doc, chunks, 'liquidacion_productor.pdf');
  }

  /** PDF interno: columnas mat./packing, notas de prorrateo en datos, diagnóstico de trazabilidad. */
  private async renderProducerInternalPdf(
    summaryRows: Record<string, unknown>[],
    detailRows: Record<string, unknown>[],
    filter: ReportFilterDto,
    diagnostic: Awaited<ReturnType<ReportingService['producerSettlementDiagnostic']>>,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const period = this.formatSettlementPeriod(filter);
    const filt = this.filterDescription(filter);
    const company = process.env.COMPANY_DISPLAY_NAME?.trim() || 'Empresa emisora';

    const wInner = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.fontSize(15).font('Helvetica-Bold').text('Liquidación por productor — uso interno', { align: 'center', width: wInner });
    doc.font('Helvetica');
    doc.moveDown(0.5);
    doc.fontSize(9).text(company, { width: wInner });
    doc.text(`Período (fecha despacho): ${period}`);
    doc.text(`Filtros: ${filt}`);
    doc.moveDown(0.6);

    const intSummaryCols = [
      { w: 0.2, header: 'Productor', align: 'left' as const },
      { w: 0.09, header: 'Cajas', align: 'right' as const },
      { w: 0.09, header: 'LB', align: 'right' as const },
      { w: 0.12, header: 'Ventas', align: 'right' as const },
      { w: 0.11, header: 'Mat.', align: 'right' as const },
      { w: 0.11, header: 'Packing', align: 'right' as const },
      { w: 0.14, header: 'Costo total', align: 'right' as const },
      { w: 0.14, header: 'Neto', align: 'right' as const },
    ];

    if (!summaryRows.length) {
      doc.fontSize(9).fillColor('#666666').text('Sin filas para estos filtros.', { width: wInner });
      doc.fillColor('#000000');
    } else {
      let tCajas = 0;
      let tLb = 0;
      let tVentas = 0;
      let tMat = 0;
      let tPack = 0;
      let tCosto = 0;
      let tNeto = 0;
      const summaryBody: string[][] = [];
      for (const r of summaryRows) {
        const name = ReportingExportService.clipText(String((r as { productor_nombre?: string }).productor_nombre ?? '—'), 28);
        const cajas = Number((r as { cajas?: number }).cajas ?? 0);
        const lb = Number((r as { lb?: number }).lb ?? 0);
        const ventas = Number((r as { ventas?: number }).ventas ?? 0);
        const cm = Number((r as { costo_materiales?: number }).costo_materiales ?? 0);
        const cp = Number((r as { costo_packing?: number }).costo_packing ?? 0);
        const ct = Number((r as { costo_total?: number }).costo_total ?? 0);
        const neto = Number((r as { neto_productor?: number }).neto_productor ?? 0);
        tCajas += cajas;
        tLb += lb;
        tVentas += ventas;
        tMat += cm;
        tPack += cp;
        tCosto += ct;
        tNeto += neto;
        summaryBody.push([
          name,
          ReportingExportService.qtyAr(cajas),
          ReportingExportService.qtyAr(lb),
          ReportingExportService.moneyAr(ventas),
          ReportingExportService.moneyAr(cm),
          ReportingExportService.moneyAr(cp),
          ReportingExportService.moneyAr(ct),
          ReportingExportService.moneyAr(neto),
        ]);
      }
      const totalRow = [
        'TOTAL',
        ReportingExportService.qtyAr(tCajas),
        ReportingExportService.qtyAr(tLb),
        ReportingExportService.moneyAr(tVentas),
        ReportingExportService.moneyAr(tMat),
        ReportingExportService.moneyAr(tPack),
        ReportingExportService.moneyAr(tCosto),
        ReportingExportService.moneyAr(tNeto),
      ];
      this.pdfDrawDataTable(doc, 'Resumen por productor', intSummaryCols, summaryBody, totalRow, {
        titleSize: 12,
        headerFontSize: 8.5,
        bodyFontSize: 8,
        totalFontSize: 8.5,
      });
    }

    doc.moveDown(0.4);

    const intDetailCols = [
      { w: 0.13, header: 'Productor', align: 'left' as const },
      { w: 0.07, header: 'Desp.', align: 'left' as const },
      { w: 0.12, header: 'Formato', align: 'left' as const },
      { w: 0.07, header: 'Cajas', align: 'right' as const },
      { w: 0.07, header: 'LB', align: 'right' as const },
      { w: 0.09, header: 'Ventas', align: 'right' as const },
      { w: 0.08, header: 'Mat.', align: 'right' as const },
      { w: 0.08, header: 'Pack.', align: 'right' as const },
      { w: 0.09, header: 'Costo', align: 'right' as const },
      { w: 0.09, header: 'Neto', align: 'right' as const },
      { w: 0.11, header: 'Nota', align: 'left' as const },
    ];

    if (!detailRows.length) {
      doc.fontSize(9).fillColor('#666666').text('Sin líneas de detalle.', { width: wInner });
      doc.fillColor('#000000');
    } else {
      const detailBody: string[][] = [];
      for (const r of detailRows) {
        const pn = ReportingExportService.clipText(String((r as { productor_nombre?: string }).productor_nombre ?? '—'), 18);
        const did = String((r as { dispatch_id?: number }).dispatch_id ?? '—');
        const fc = ReportingExportService.clipText(String((r as { format_code?: string }).format_code ?? '—'), 14);
        const cajas = Number((r as { cajas?: number }).cajas ?? 0);
        const lb = Number((r as { lb?: number }).lb ?? 0);
        const ventas = Number((r as { ventas?: number }).ventas ?? 0);
        const cm = Number((r as { costo_materiales?: number }).costo_materiales ?? 0);
        const cp = Number((r as { costo_packing?: number }).costo_packing ?? 0);
        const ct = Number((r as { costo_total?: number }).costo_total ?? 0);
        const neto = Number((r as { neto?: number }).neto ?? 0);
        const nota = ReportingExportService.clipText(String((r as { nota_prorrateo?: string }).nota_prorrateo ?? ''), 80);
        detailBody.push([
          pn,
          did,
          fc,
          ReportingExportService.qtyAr(cajas),
          ReportingExportService.qtyAr(lb),
          ReportingExportService.moneyAr(ventas),
          ReportingExportService.moneyAr(cm),
          ReportingExportService.moneyAr(cp),
          ReportingExportService.moneyAr(ct),
          ReportingExportService.moneyAr(neto),
          nota || '—',
        ]);
      }
      this.pdfDrawDataTable(doc, 'Detalle por despacho y formato', intDetailCols, detailBody, null, {
        titleSize: 12,
        headerFontSize: 7.5,
        bodyFontSize: 7,
        totalFontSize: 7.5,
      });
    }

    if (diagnostic?.invoice_lines?.length) {
      doc.addPage();
      const diagCols = [
        { w: 0.1, header: 'Despacho', align: 'left' as const },
        { w: 0.1, header: 'Línea', align: 'left' as const },
        { w: 0.1, header: 'Unidad PT', align: 'left' as const },
        { w: 0.1, header: 'Proceso', align: 'left' as const },
        { w: 0.1, header: 'Resolución', align: 'left' as const },
        { w: 0.5, header: 'Notas', align: 'left' as const },
      ];
      const lines = diagnostic.invoice_lines.slice(0, 80) as Record<string, unknown>[];
      const diagBody: string[][] = [];
      for (const row of lines) {
        const dispatchId = String(row.dispatch_id ?? '—');
        const lineId = String(row.line_id ?? '—');
        const tid = String(row.tarja_id ?? '—');
        const fpid = String(row.fruit_process_id ?? '—');
        const res = ReportingExportService.clipText(String(row.resolucion_productor ?? '—'), 20);
        const notas = ReportingExportService.clipText(String(row.notas ?? row.nota ?? ''), 200);
        diagBody.push([dispatchId, lineId, tid, fpid, res, notas]);
      }
      this.pdfDrawDataTable(doc, 'Diagnóstico — trazabilidad (líneas de factura)', diagCols, diagBody, null, {
        titleSize: 12,
        headerFontSize: 7.5,
        bodyFontSize: 6.5,
        totalFontSize: 7.5,
      });
      if (diagnostic.invoice_lines.length > 80) {
        doc.moveDown(0.3);
        doc.fontSize(8).text(`… y ${diagnostic.invoice_lines.length - 80} líneas más (ver diagnóstico en sistema).`);
      }
    }

    doc.fontSize(7);
    doc.text(
      'Uso interno. Cálculo alineado con reportes. Costos por formato prorrateados según participación en cajas del período.',
      { align: 'left' },
    );

    return this.pdfBufferAndFinish(doc, chunks, 'liquidacion_productor_interno.pdf');
  }

  private pdfBufferAndFinish(
    doc: InstanceType<typeof PDFDocument>,
    chunks: Buffer[],
    filename: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          mime: 'application/pdf',
          filename,
        });
      });
      doc.on('error', reject);
      doc.end();
    });
  }
}
