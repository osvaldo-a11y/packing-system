import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { SeasonReadService } from './season-read.service';
import type { SeasonDataSource } from './season-read.types';

const HDR = {
  bg: 'FF1E3A5F',
  fg: 'FFFFFFFF',
  border: 'FF8BADD3',
  totalBg: 'FFEEF2F8',
};

@Injectable()
export class SeasonExportService {
  constructor(private readonly seasonRead: SeasonReadService) {}

  async buildSettlementXlsx(year: number): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const overview = await this.seasonRead.getOverview(year);
    const lines = await this.seasonRead.getAllSettlementLines(year);
    const commercial = overview.commercial;
    if (!commercial) {
      throw new Error(`Sin datos comerciales para temporada ${year}`);
    }

    const sourceLabel = this.sourceLabel(overview.source, year);
    const returnLabel =
      overview.source === 'snapshot' ? 'Neto productor (snapshot)' : 'Retorno a productor';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Packing system — Registro histórico';
    wb.created = new Date();

    const info = wb.addWorksheet('Info');
    info.addRow(['Registro histórico — NO es una re-liquidación']);
    info.addRow([sourceLabel]);
    info.addRow([`Temporada ${year}`]);
    info.addRow([`Emitido: ${new Date().toLocaleString('es-AR')}`]);
    info.getColumn(1).width = 90;

    const summary = wb.addWorksheet('Resumen productor');
    const sumHeaders = ['Productor', 'Cajas', 'Libras', 'Ventas', returnLabel];
    this.styleHeaderRow(summary.addRow(sumHeaders));
    let tBoxes = 0;
    let tLb = 0;
    let tSales = 0;
    let tReturn = 0;
    for (const p of commercial.by_producer) {
      summary.addRow([
        p.producer_name,
        p.boxes,
        p.pounds,
        p.sales,
        p.grower_return,
      ]);
      tBoxes += p.boxes;
      tLb += p.pounds;
      tSales += p.sales;
      tReturn += p.grower_return;
    }
    const totalRow = summary.addRow(['TOTAL', tBoxes, tLb, tSales, tReturn]);
    this.styleTotalRow(totalRow);
    this.applyMoneyFmt(summary, [4, 5]);
    this.applyLbFmt(summary, 3);
    summary.getColumn(1).width = 28;

    const detail = wb.addWorksheet('Detalle líneas');
    const detHeaders = [
      'Productor',
      'BOL',
      'Formato',
      'Variedad',
      'Marca',
      'Fecha',
      'Cajas',
      'Libras',
      'Precio unit.',
      'Revenue',
      'Retorno',
    ];
    this.styleHeaderRow(detail.addRow(detHeaders));
    for (const l of lines) {
      detail.addRow([
        l.producer_name,
        l.bol ?? '',
        l.format_code ?? l.format_raw ?? '',
        l.variety_raw ?? '',
        l.brand_raw ?? '',
        l.ship_date ?? '',
        l.boxes,
        l.pounds,
        l.unit_price,
        l.revenue,
        l.grower_return,
      ]);
    }
    if (!lines.length) {
      detail.addRow([
        overview.source === 'snapshot'
          ? 'Sin líneas en capa legacy; el snapshot firmado contiene resumen por productor.'
          : 'Sin líneas de detalle.',
      ]);
    }
    this.applyMoneyFmt(detail, [9, 10, 11]);
    this.applyLbFmt(detail, 8);
    detail.getColumn(1).width = 24;
    detail.getColumn(2).width = 14;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `liquidacion-historica-${year}.xlsx`,
    };
  }

  async buildMassBalanceXlsx(year: number): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const overview = await this.seasonRead.getOverview(year);
    const mb = overview.mass_balance;
    if (!mb) {
      throw new Error(`Sin balance físico para temporada ${year}`);
    }

    const sourceLabel = this.sourceLabel(overview.source, year);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Packing system — Registro histórico';
    wb.created = new Date();

    const info = wb.addWorksheet('Info');
    info.addRow(['Registro histórico — balance de masas importado / snapshot']);
    info.addRow([sourceLabel]);
    info.addRow([`Temporada ${year}`]);
    info.getColumn(1).width = 90;

    const sheet = wb.addWorksheet('Por productor');
    const headers = [
      'Productor',
      'Recepciones',
      'Lb recibido',
      'Lb procesado',
      'Lb packout',
      'Lb merma',
      '% Packout',
      'Lb rechazo',
      'For frozen',
      'Frozen→congelado',
    ];
    this.styleHeaderRow(sheet.addRow(headers));
    for (const p of mb.by_producer) {
      sheet.addRow([
        p.producer_name,
        p.receptions,
        p.lb_received,
        p.lb_processed,
        p.lb_packout,
        p.lb_waste,
        p.pct_packout,
        p.lb_rejected,
        p.lb_for_frozen,
        p.lb_frozen_to_frozen,
      ]);
    }
    const tot = sheet.addRow([
      'TOTAL',
      mb.by_producer.reduce((s, r) => s + r.receptions, 0),
      mb.lb_received,
      mb.lb_processed,
      mb.lb_packout,
      mb.lb_waste,
      mb.pct_packout,
      mb.lb_rejected,
      mb.lb_for_frozen,
      mb.lb_frozen_to_frozen,
    ]);
    this.styleTotalRow(tot);
    this.applyLbFmt(sheet, [3, 4, 5, 6, 8, 9, 10]);
    sheet.getColumn(1).width = 28;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `balance-masas-historico-${year}.xlsx`,
    };
  }

  async buildSettlementPdf(year: number): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const overview = await this.seasonRead.getOverview(year);
    const commercial = overview.commercial;
    if (!commercial) {
      throw new Error(`Sin datos comerciales para temporada ${year}`);
    }

    const sourceLabel = this.sourceLabel(overview.source, year);
    const returnLabel =
      overview.source === 'snapshot' ? 'Neto productor' : 'Retorno productor';

    const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.fontSize(16).font('Helvetica-Bold').text(`Liquidación histórica — Temporada ${year}`, { width: w });
    doc.moveDown(0.4);
    doc.fontSize(9).font('Helvetica').fillColor('#444444');
    doc.text('Registro histórico de lo cerrado. NO es una re-liquidación ni incluye desglose de costos operativos.', {
      width: w,
    });
    doc.text(sourceLabel, { width: w });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    const cols = [
      { header: 'Productor', w: 0.32, align: 'left' as const },
      { header: 'Cajas', w: 0.12, align: 'right' as const },
      { header: 'Libras', w: 0.14, align: 'right' as const },
      { header: 'Ventas', w: 0.2, align: 'right' as const },
      { header: returnLabel, w: 0.22, align: 'right' as const },
    ];

    const body: string[][] = commercial.by_producer.map((p) => [
      this.clip(p.producer_name, 28),
      this.qty(p.boxes),
      this.qty(p.pounds),
      this.money(p.sales),
      this.money(p.grower_return),
    ]);

    const totalRow = [
      'TOTAL',
      this.qty(commercial.boxes),
      this.qty(commercial.pounds),
      this.money(commercial.sales),
      this.money(commercial.grower_return),
    ];

    this.drawPdfTable(doc, 'Resumen por productor', cols, body, totalRow, w);

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));

    return {
      buffer: Buffer.concat(chunks),
      mime: 'application/pdf',
      filename: `liquidacion-historica-${year}.pdf`,
    };
  }

  private sourceLabel(source: SeasonDataSource, year: number): string {
    if (source === 'snapshot') {
      return `Fuente: snapshot firmado (temporada ${year})`;
    }
    return `Fuente: Final Charge legacy importado (temporada ${year})`;
  }

  private styleHeaderRow(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: HDR.fg }, size: 10 };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR.bg } };
    row.height = 22;
  }

  private styleTotalRow(row: ExcelJS.Row) {
    row.font = { bold: true, size: 10 };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR.totalBg } };
  }

  private applyMoneyFmt(ws: ExcelJS.Worksheet, cols: number | number[]) {
    const list = Array.isArray(cols) ? cols : [cols];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      for (const c of list) {
        const cell = row.getCell(c);
        if (typeof cell.value === 'number') cell.numFmt = '$#,##0.00';
      }
    });
  }

  private applyLbFmt(ws: ExcelJS.Worksheet, cols: number | number[]) {
    const list = Array.isArray(cols) ? cols : [cols];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      for (const c of list) {
        const cell = row.getCell(c);
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
      }
    });
  }

  private money(n: number): string {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  private qty(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private clip(s: string, max: number): string {
    const t = s.trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
  }

  private drawPdfTable(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    cols: Array<{ header: string; w: number; align: 'left' | 'right' | 'center' }>,
    body: string[][],
    totalRow: string[] | null,
    pageWidth: number,
  ) {
    const left = doc.page.margins.left;
    let y = doc.y;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text(title, left, y, { width: pageWidth });
    y = doc.y + 6;

    const rowH = 16;
    const headerFs = 8;
    const bodyFs = 7.5;

    const drawRow = (cells: string[], bold: boolean, bg?: string) => {
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      let x = left;
      if (bg) {
        doc.save();
        doc.rect(left, y, pageWidth, rowH).fill(bg);
        doc.restore();
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? headerFs : bodyFs);
      for (let i = 0; i < cols.length; i++) {
        const cw = pageWidth * cols[i].w;
        doc.fillColor('#000000').text(cells[i] ?? '', x + 2, y + 4, {
          width: cw - 4,
          align: cols[i].align,
          lineBreak: false,
        });
        x += cw;
      }
      y += rowH;
    };

    drawRow(
      cols.map((c) => c.header),
      true,
      HDR.bg,
    );
    for (const row of body) {
      drawRow(row, false);
    }
    if (totalRow) {
      drawRow(totalRow, true, HDR.totalBg);
    }
    doc.y = y + 8;
  }
}
