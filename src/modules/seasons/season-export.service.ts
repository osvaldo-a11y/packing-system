import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ExportPdfLayout } from '../../common/export-pdf-layout';
import { PlantService } from '../plant/plant.service';
import { type ExportLang, resolveExportLang, seasonExportText } from './season-export-i18n';
import { SeasonReadService } from './season-read.service';
import type { SeasonDataSource, SeasonOverview } from './season-read.types';

const HDR = {
  bg: 'FF1E3A5F',
  fg: 'FFFFFFFF',
  totalBg: 'FFEEF2F8',
};

type ExportFile = { buffer: Buffer; filename: string; mime: string };

@Injectable()
export class SeasonExportService {
  constructor(
    private readonly seasonRead: SeasonReadService,
    private readonly plantService: PlantService,
  ) {}

  async buildFullXlsx(year: number, langInput?: string, acceptLanguage?: string): Promise<ExportFile> {
    const lang = resolveExportLang(langInput, acceptLanguage);
    const T = seasonExportText(lang);
    const overview = await this.seasonRead.getOverview(year);
    if (!overview.commercial || !overview.mass_balance) {
      throw new Error(`Sin datos para export completo temporada ${year}`);
    }

    const [receptions, processes, salesLines, dispatches] = await Promise.all([
      this.seasonRead.getReceptionExportLines(year),
      this.seasonRead.getProcessExportLines(year),
      this.seasonRead.getAllSettlementLines(year),
      this.seasonRead.getDispatchExportGroups(year),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Packing system — Historical record';
    wb.created = new Date();
    const emission = this.formatEmission(lang);

    this.sheetInfo(wb, overview, year, lang, emission);
    this.sheetSummary(wb, overview, lang);
    this.sheetReception(wb, receptions, overview, lang);
    this.sheetProcesses(wb, processes, overview, lang);
    this.sheetSales(wb, salesLines, overview, lang);
    this.sheetDispatches(wb, dispatches, overview, lang);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${T.filenames.fullXlsx}-${year}.xlsx`,
    };
  }

  async buildSummaryPdf(year: number, langInput?: string, acceptLanguage?: string): Promise<ExportFile> {
    const lang = resolveExportLang(langInput, acceptLanguage);
    const T = seasonExportText(lang);
    const overview = await this.seasonRead.getOverview(year);
    const commercial = overview.commercial;
    const mb = overview.mass_balance;
    if (!commercial || !mb) {
      throw new Error(`Sin datos para PDF temporada ${year}`);
    }

    const company = await this.resolveCompanyDisplayName();
    const emission = this.formatEmission(lang);
    const sourceLabel = this.sourceLabel(overview.source, year, lang);

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    ExportPdfLayout.drawBrandedHeader(doc, {
      company,
      title: T.pdf.title,
      subtitle: T.pdf.subtitle,
      metaLeft: [
        { label: T.pdf.seasonLabel, value: String(year) },
        { label: T.pdf.sourceLabel, value: sourceLabel },
      ],
      metaRight: [{ label: T.pdf.generatedLabel, value: emission }],
      note: T.pdf.historicalNote,
    });
    doc.moveDown(0.35);

    const summaryCols = [
      { w: 0.22, header: T.cols.producer, align: 'left' as const },
      { w: 0.1, header: T.cols.sales, align: 'right' as const },
      { w: 0.1, header: T.cols.growerReturn, align: 'right' as const },
      { w: 0.08, header: T.cols.boxes, align: 'right' as const },
      { w: 0.1, header: T.cols.pounds, align: 'right' as const },
      { w: 0.1, header: T.cols.packout, align: 'right' as const },
      { w: 0.08, header: T.cols.pctPackout, align: 'right' as const },
    ];

    const physById = new Map(mb.by_producer.map((p) => [p.producer_id, p]));
    const body: string[][] = [];
    let tSales = 0;
    let tReturn = 0;
    let tBoxes = 0;
    let tLb = 0;
    let tPackout = 0;

    for (const cp of commercial.by_producer) {
      const phys = cp.producer_id != null ? physById.get(cp.producer_id) : undefined;
      tSales += cp.sales;
      tReturn += cp.grower_return;
      tBoxes += cp.boxes;
      tLb += cp.pounds;
      tPackout += phys?.lb_packout ?? 0;
      body.push([
        ExportPdfLayout.clip(cp.producer_name, 28),
        ExportPdfLayout.moneyUsd(cp.sales),
        ExportPdfLayout.moneyUsd(cp.grower_return),
        ExportPdfLayout.qty(cp.boxes),
        ExportPdfLayout.qty(cp.pounds),
        ExportPdfLayout.qty(phys?.lb_packout ?? 0),
        phys ? `${phys.pct_packout.toFixed(1)}%` : '—',
      ]);
    }

    const totalRow = [
      T.pdf.total,
      ExportPdfLayout.moneyUsd(tSales),
      ExportPdfLayout.moneyUsd(tReturn),
      ExportPdfLayout.qty(tBoxes),
      ExportPdfLayout.qty(tLb),
      ExportPdfLayout.qty(tPackout),
      mb.pct_packout ? `${mb.pct_packout.toFixed(1)}%` : '—',
    ];

    ExportPdfLayout.drawDataTable(doc, T.pdf.summarySection, summaryCols, body, totalRow, { titleSize: 14 });
    ExportPdfLayout.drawTotalBar(doc, T.pdf.totalReturn, ExportPdfLayout.moneyUsd(tReturn));

    doc.moveDown(0.5);
    const w = ExportPdfLayout.contentWidth(doc);
    doc.fontSize(8).fillColor(ExportPdfLayout.MUTED).text(T.pdf.footer, doc.page.margins.left, doc.y, { width: w });

    ExportPdfLayout.drawDocumentFooters(doc, {
      footerText: `${company}  ·  ${T.pdf.pageFooter}`,
      emission,
      lang,
    });

    const buffer = await ExportPdfLayout.finishPdf(doc, chunks);
    return {
      buffer,
      mime: 'application/pdf',
      filename: `${T.filenames.summaryPdf}-${year}.pdf`,
    };
  }

  async buildSettlementPdf(year: number, langInput?: string, acceptLanguage?: string): Promise<ExportFile> {
    return this.buildSummaryPdf(year, langInput, acceptLanguage);
  }

  async buildSettlementXlsx(year: number, langInput?: string, acceptLanguage?: string): Promise<ExportFile> {
    const lang = resolveExportLang(langInput, acceptLanguage);
    const T = seasonExportText(lang);
    const overview = await this.seasonRead.getOverview(year);
    const lines = await this.seasonRead.getAllSettlementLines(year);
    const commercial = overview.commercial;
    if (!commercial) throw new Error(`Sin datos comerciales para temporada ${year}`);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Packing system — Historical record';
    wb.created = new Date();
    this.sheetInfo(wb, overview, year, lang, this.formatEmission(lang));

    const summary = wb.addWorksheet(T.sheets.summary);
    const returnLabel =
      overview.source === 'snapshot' || overview.source === 'live' ? T.cols.growerReturn : T.cols.growerReturn;
    const sumHeaders = [T.cols.producer, T.cols.boxes, T.cols.pounds, T.cols.sales, returnLabel];
    this.styleHeaderRow(summary.addRow(sumHeaders));
    let tBoxes = 0;
    let tLb = 0;
    let tSales = 0;
    let tReturn = 0;
    for (const p of commercial.by_producer) {
      summary.addRow([p.producer_name, p.boxes, p.pounds, p.sales, p.grower_return]);
      tBoxes += p.boxes;
      tLb += p.pounds;
      tSales += p.sales;
      tReturn += p.grower_return;
    }
    this.styleTotalRow(summary.addRow([T.pdf.total, tBoxes, tLb, tSales, tReturn]));
    this.applyMoneyFmt(summary, [4, 5]);
    this.applyLbFmt(summary, 3);
    summary.getColumn(1).width = 28;

    const detail = wb.addWorksheet(T.sheets.sales);
    const detHeaders = [
      T.cols.producer,
      T.cols.bol,
      T.cols.format,
      T.cols.variety,
      T.cols.brand,
      T.cols.date,
      T.cols.boxes,
      T.cols.pounds,
      T.cols.unitPrice,
      T.cols.revenue,
      T.cols.growerReturn,
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
      detail.addRow([this.noSalesNote(overview, lang)]);
    }
    this.applyMoneyFmt(detail, [9, 10, 11]);
    this.applyLbFmt(detail, 8);
    detail.getColumn(1).width = 24;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${T.filenames.settlementXlsx}-${year}.xlsx`,
    };
  }

  async buildMassBalanceXlsx(year: number, langInput?: string, acceptLanguage?: string): Promise<ExportFile> {
    const lang = resolveExportLang(langInput, acceptLanguage);
    const T = seasonExportText(lang);
    const overview = await this.seasonRead.getOverview(year);
    const mb = overview.mass_balance;
    if (!mb) throw new Error(`Sin balance físico para temporada ${year}`);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Packing system — Historical record';
    wb.created = new Date();
    this.sheetInfo(wb, overview, year, lang, this.formatEmission(lang));

    const sheet = wb.addWorksheet(T.sheets.summary);
    const headers = [
      T.cols.producer,
      T.cols.lbReceived,
      T.cols.lbProcessed,
      T.cols.packout,
      T.cols.waste,
      T.cols.pctPackout,
      T.cols.rejected,
      T.cols.forFrozen,
    ];
    this.styleHeaderRow(sheet.addRow(headers));
    for (const p of mb.by_producer) {
      sheet.addRow([
        p.producer_name,
        p.lb_received,
        p.lb_processed,
        p.lb_packout,
        p.lb_waste,
        p.pct_packout,
        p.lb_rejected,
        p.lb_for_frozen,
      ]);
    }
    const tot = sheet.addRow([
      T.pdf.total,
      mb.lb_received,
      mb.lb_processed,
      mb.lb_packout,
      mb.lb_waste,
      mb.pct_packout,
      mb.lb_rejected,
      mb.lb_for_frozen,
    ]);
    this.styleTotalRow(tot);
    this.applyLbFmt(sheet, [2, 3, 4, 5, 7, 8]);
    sheet.getColumn(1).width = 28;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${T.filenames.massXlsx}-${year}.xlsx`,
    };
  }

  private sheetInfo(wb: ExcelJS.Workbook, overview: SeasonOverview, year: number, lang: ExportLang, emission: string) {
    const T = seasonExportText(lang);
    const info = wb.addWorksheet(T.sheets.info);
    info.addRow([T.info.disclaimer]);
    info.addRow([this.sourceLabel(overview.source, year, lang)]);
    info.addRow([`${T.info.season} ${year}`]);
    info.addRow([`${T.info.generated}: ${emission}`]);
    info.getColumn(1).width = 90;
  }

  private sheetSummary(wb: ExcelJS.Workbook, overview: SeasonOverview, lang: ExportLang) {
    const T = seasonExportText(lang);
    const commercial = overview.commercial!;
    const mb = overview.mass_balance!;
    const sheet = wb.addWorksheet(T.sheets.summary);
    const headers = [
      T.cols.producer,
      T.cols.sales,
      T.cols.growerReturn,
      T.cols.boxes,
      T.cols.pounds,
      T.cols.lbReceived,
      T.cols.lbProcessed,
      T.cols.packout,
      T.cols.waste,
      T.cols.pctPackout,
      T.cols.rejected,
      T.cols.forFrozen,
    ];
    this.styleHeaderRow(sheet.addRow(headers));

    const physById = new Map(mb.by_producer.map((p) => [p.producer_id, p]));
    const seen = new Set<number | string>();
    let tSales = 0;
    let tReturn = 0;
    let tBoxes = 0;
    let tLb = 0;
    let tRec = 0;
    let tProc = 0;
    let tPack = 0;
    let tWaste = 0;
    let tRej = 0;
    let tFrozen = 0;

    for (const cp of commercial.by_producer) {
      const pid = cp.producer_id ?? cp.producer_name;
      seen.add(pid);
      const phys = cp.producer_id != null ? physById.get(cp.producer_id) : undefined;
      sheet.addRow([
        cp.producer_name,
        cp.sales,
        cp.grower_return,
        cp.boxes,
        cp.pounds,
        phys?.lb_received ?? 0,
        phys?.lb_processed ?? 0,
        phys?.lb_packout ?? 0,
        phys?.lb_waste ?? 0,
        phys?.pct_packout ?? 0,
        phys?.lb_rejected ?? 0,
        phys?.lb_for_frozen ?? 0,
      ]);
      tSales += cp.sales;
      tReturn += cp.grower_return;
      tBoxes += cp.boxes;
      tLb += cp.pounds;
      tRec += phys?.lb_received ?? 0;
      tProc += phys?.lb_processed ?? 0;
      tPack += phys?.lb_packout ?? 0;
      tWaste += phys?.lb_waste ?? 0;
      tRej += phys?.lb_rejected ?? 0;
      tFrozen += phys?.lb_for_frozen ?? 0;
    }

    for (const phys of mb.by_producer) {
      if (seen.has(phys.producer_id)) continue;
      sheet.addRow([
        phys.producer_name,
        0,
        0,
        0,
        0,
        phys.lb_received,
        phys.lb_processed,
        phys.lb_packout,
        phys.lb_waste,
        phys.pct_packout,
        phys.lb_rejected,
        phys.lb_for_frozen,
      ]);
      tRec += phys.lb_received;
      tProc += phys.lb_processed;
      tPack += phys.lb_packout;
      tWaste += phys.lb_waste;
      tRej += phys.lb_rejected;
      tFrozen += phys.lb_for_frozen;
    }

    this.styleTotalRow(
      sheet.addRow([
        T.pdf.total,
        tSales,
        tReturn,
        tBoxes,
        tLb,
        tRec,
        tProc,
        tPack,
        tWaste,
        mb.pct_packout,
        tRej,
        tFrozen,
      ]),
    );
    this.applyMoneyFmt(sheet, [2, 3]);
    this.applyLbFmt(sheet, [5, 6, 7, 8, 9, 11, 12]);
    sheet.getColumn(1).width = 28;
  }

  private sheetReception(
    wb: ExcelJS.Workbook,
    rows: Awaited<ReturnType<SeasonReadService['getReceptionExportLines']>>,
    overview: SeasonOverview,
    lang: ExportLang,
  ) {
    const T = seasonExportText(lang);
    const sheet = wb.addWorksheet(T.sheets.reception);
    const headers = [
      T.cols.date,
      T.cols.producer,
      T.cols.variety,
      T.cols.quality,
      T.cols.incoming,
      T.cols.trays,
      T.cols.quantity,
      T.cols.netLb,
      T.cols.grossLb,
      T.cols.fruitType,
    ];
    this.styleHeaderRow(sheet.addRow(headers));
    if (!rows.length) {
      sheet.addRow([this.noReceptionNote(overview, lang)]);
      return;
    }
    for (const r of rows) {
      sheet.addRow([
        r.reception_date,
        r.producer_name,
        r.variety ?? '',
        T.quality[r.quality] ?? r.quality,
        r.incoming_no ?? '',
        r.trays ?? '',
        r.quantity ?? '',
        r.net_lb,
        r.gross_lb ?? '',
        r.fruit_type ? (T.fruitType[r.fruit_type] ?? r.fruit_type) : '',
      ]);
    }
    this.applyLbFmt(sheet, [8, 9]);
    sheet.getColumn(2).width = 26;
  }

  private sheetProcesses(
    wb: ExcelJS.Workbook,
    rows: Awaited<ReturnType<SeasonReadService['getProcessExportLines']>>,
    overview: SeasonOverview,
    lang: ExportLang,
  ) {
    const T = seasonExportText(lang);
    const sheet = wb.addWorksheet(T.sheets.processes);
    const headers = [
      T.cols.date,
      T.cols.producer,
      T.cols.op,
      T.cols.variety,
      T.cols.format,
      T.cols.lbTotal,
      T.cols.lbPackout,
      T.cols.lbWaste,
      T.cols.boxes,
      T.cols.fruitType,
    ];
    this.styleHeaderRow(sheet.addRow(headers));
    if (!rows.length) {
      sheet.addRow([this.noProcessNote(overview, lang)]);
      return;
    }
    for (const r of rows) {
      sheet.addRow([
        r.process_date,
        r.producer_name,
        r.op ?? '',
        r.variety ?? '',
        r.format_code ?? '',
        r.lb_total,
        r.lb_fresh,
        r.lb_waste,
        r.boxes ?? '',
        r.fruit_type ? (T.fruitType[r.fruit_type] ?? r.fruit_type) : '',
      ]);
    }
    this.applyLbFmt(sheet, [6, 7, 8]);
    sheet.getColumn(2).width = 26;
  }

  private sheetSales(
    wb: ExcelJS.Workbook,
    lines: Awaited<ReturnType<SeasonReadService['getAllSettlementLines']>>,
    overview: SeasonOverview,
    lang: ExportLang,
  ) {
    const T = seasonExportText(lang);
    const sheet = wb.addWorksheet(T.sheets.sales);
    const headers = [
      T.cols.producer,
      T.cols.bol,
      T.cols.format,
      T.cols.variety,
      T.cols.brand,
      T.cols.date,
      T.cols.boxes,
      T.cols.pounds,
      T.cols.unitPrice,
      T.cols.revenue,
      T.cols.growerReturn,
    ];
    this.styleHeaderRow(sheet.addRow(headers));
    if (!lines.length) {
      sheet.addRow([this.noSalesNote(overview, lang)]);
      return;
    }
    for (const l of lines) {
      sheet.addRow([
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
    this.applyMoneyFmt(sheet, [9, 10, 11]);
    this.applyLbFmt(sheet, 8);
    sheet.getColumn(1).width = 24;
  }

  private sheetDispatches(
    wb: ExcelJS.Workbook,
    groups: Awaited<ReturnType<SeasonReadService['getDispatchExportGroups']>>,
    overview: SeasonOverview,
    lang: ExportLang,
  ) {
    const T = seasonExportText(lang);
    const sheet = wb.addWorksheet(T.sheets.dispatches);
    const headers = [T.cols.bol, T.cols.date, T.cols.producers, T.cols.boxes, T.cols.pounds, T.cols.revenue];
    this.styleHeaderRow(sheet.addRow(headers));
    if (!groups.length) {
      sheet.addRow([T.notes.noDispatchLines]);
      return;
    }
    for (const g of groups) {
      sheet.addRow([g.bol, g.ship_date ?? '', g.producers, g.boxes, g.pounds, g.revenue]);
    }
    this.applyMoneyFmt(sheet, 6);
    this.applyLbFmt(sheet, 5);
    sheet.getColumn(3).width = 32;
  }

  private sourceLabel(source: SeasonDataSource, year: number, lang: ExportLang): string {
    const T = seasonExportText(lang).info;
    if (source === 'live') return `${T.sourceLive} (${year})`;
    if (source === 'snapshot') return `${T.sourceSnapshot} (${year})`;
    return `${T.sourceLegacy} (${year})`;
  }

  private noReceptionNote(overview: SeasonOverview, lang: ExportLang): string {
    const T = seasonExportText(lang);
    if (overview.source === 'live' || overview.source === 'snapshot') return T.notes.noReceptionLines;
    return T.notes.noReceptionLines;
  }

  private noProcessNote(overview: SeasonOverview, lang: ExportLang): string {
    return seasonExportText(lang).notes.noProcessLines;
  }

  private noSalesNote(overview: SeasonOverview, lang: ExportLang): string {
    const T = seasonExportText(lang);
    if (overview.source === 'snapshot' || overview.source === 'live') return T.notes.noSalesLines;
    return T.notes.noSalesLines;
  }

  private formatEmission(lang: ExportLang): string {
    return new Date().toLocaleString(lang === 'en' ? 'en-US' : 'es-AR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  private async resolveCompanyDisplayName(): Promise<string> {
    const fromEnv = process.env.COMPANY_DISPLAY_NAME?.trim();
    if (fromEnv) return fromEnv;
    try {
      const st = await this.plantService.getOrCreate();
      const candidate = (st as { plant_name?: string | null })?.plant_name?.trim();
      return candidate || 'PINEBLOOM PACKING';
    } catch {
      return 'PINEBLOOM PACKING';
    }
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
}
