import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportFilterDto } from './reporting.dto';
import { ReportingService } from './reporting.service';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

@Injectable()
export class ReportingExportService {
  constructor(private readonly reporting: ReportingService) {}

  async build(format: ExportFormat, filter: ReportFilterDto) {
    const data = await this.reporting.generateFullExport(filter);
    const flat = {
      boxesByProducer: data.boxesByProducer.rows,
      palletCosts: data.palletCosts.rows,
      yieldAndWaste: data.yieldAndWaste.rows,
      salesAndCostsByDispatch: data.salesAndCostsByDispatch.rows,
      packagingByFormat: data.packagingByFormat.rows,
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
      return this.buildPdf(flat);
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

  private async buildXlsx(payload: Record<string, unknown>) {
    const wb = new ExcelJS.Workbook();
    const meta = wb.addWorksheet('meta');
    meta.addRow(['plant_thresholds', JSON.stringify(payload.plant_thresholds ?? {})]);
    meta.addRow(['filters', JSON.stringify(payload.filters ?? {})]);

    const addSheet = (name: string, rows: unknown) => {
      const ws = wb.addWorksheet(name.slice(0, 31));
      if (!Array.isArray(rows) || !rows.length) {
        ws.addRow(['sin datos']);
        return;
      }
      const first = rows[0] as Record<string, unknown>;
      const cols = Object.keys(first);
      ws.addRow(cols);
      for (const row of rows as Record<string, unknown>[]) {
        ws.addRow(cols.map((c) => row[c]));
      }
    };
    addSheet('cajas_productor', payload.boxesByProducer);
    addSheet('costo_pallet', payload.palletCosts);
    addSheet('merma_rendimiento', payload.yieldAndWaste);
    addSheet('ventas_despacho', payload.salesAndCostsByDispatch);
    addSheet('embalaje_formato', payload.packagingByFormat);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'reporte-packing.xlsx',
    };
  }

  private async buildPdf(payload: Record<string, unknown>) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.fontSize(14).text('Reporte operativo packing', { underline: true });
    doc.moveDown();
    doc.fontSize(9).text(`Umbrales planta: ${JSON.stringify(payload.plant_thresholds ?? {})}`);
    doc.text(`Filtros: ${JSON.stringify(payload.filters ?? {})}`);
    doc.moveDown();
    const writeSection = (title: string, rows: unknown) => {
      doc.fontSize(11).text(title, { underline: true });
      doc.fontSize(8);
      if (!Array.isArray(rows) || !rows.length) {
        doc.text('sin datos');
        doc.moveDown();
        return;
      }
      for (const row of rows) {
        doc.text(JSON.stringify(row));
      }
      doc.moveDown();
    };
    writeSection('Cajas por productor', payload.boxesByProducer);
    writeSection('Costo pallet', payload.palletCosts);
    writeSection('Merma y rendimiento', payload.yieldAndWaste);
    writeSection('Ventas por despacho', payload.salesAndCostsByDispatch);
    writeSection('Embalaje por formato', payload.packagingByFormat);
    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    return {
      buffer: Buffer.concat(chunks),
      mime: 'application/pdf',
      filename: 'reporte-packing.pdf',
    };
  }
}
