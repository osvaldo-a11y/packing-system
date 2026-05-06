import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { In, Repository } from 'typeorm';
import { groupFinalPalletsForCommercialInvoice } from '../dispatch/commercial-invoice-lines';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
} from '../dispatch/dispatch.entities';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { RepalletEvent } from '../final-pallet/repallet.entities';
import { FruitProcess, PtTag, PtTagItem } from '../process/process.entities';
import { PtPackingList } from '../pt-packing-list/pt-packing-list.entities';
import { Client } from '../traceability/operational.entities';
import { Producer, Variety } from '../traceability/traceability.entities';
import { FinalPalletService } from '../final-pallet/final-pallet.service';
import { PlantService } from '../plant/plant.service';
import { ProcessService } from '../process/process.service';
import { TraceabilityService } from '../traceability/traceability.service';

function pdfToBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

@Injectable()
export class DocumentsPdfService {
  private companyDisplayName = process.env.COMPANY_DISPLAY_NAME?.trim() || 'PINEBLOOM PACKING';
  private static qtyAr(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private static moneyAr(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private companyLine(): string {
    return this.companyDisplayName?.trim() || 'PINEBLOOM PACKING';
  }

  private static pdfDateEs(d: Date | string | undefined): string {
    if (!d) return '—';
    const x = d instanceof Date ? d : new Date(d as string);
    if (Number.isNaN(x.getTime())) return String(d);
    return x.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
  }

  private static readonly PDF_MARGIN = 48;
  private static readonly PDF_STROKE = '#333333';
  private static readonly PDF_MUTED = '#555555';
  private static readonly PDF_TITLE = '#111111';

  /**
   * Cabecera corporativa (modelo “proceso”): empresa centrada, título, subtítulo.
   * @returns coordenada Y siguiente al bloque.
   */
  private renderCorporateHeader(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    title: string,
    subtitle: string,
  ): number {
    doc.fontSize(9).fillColor('#444444');
    const lineCompany = this.companyLine();
    const hCo = doc.heightOfString(lineCompany, { width: w, align: 'center' });
    doc.text(lineCompany, x0, y, { width: w, align: 'center' });
    y += Math.max(16, hCo + 4);
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DocumentsPdfService.PDF_TITLE);
    const hTi = doc.heightOfString(title, { width: w, align: 'center' });
    doc.text(title, x0, y, { width: w, align: 'center' });
    y += Math.max(18, hTi + 4);
    doc.font('Helvetica').fontSize(9).fillColor(DocumentsPdfService.PDF_MUTED);
    const hSu = doc.heightOfString(subtitle, { width: w, align: 'center' });
    doc.text(subtitle, x0, y, { width: w, align: 'center' });
    y += Math.max(20, hSu + 6);
    return y;
  }

  /** Caja con borde (como bloque “Identificación” en liquidación de proceso). */
  private static renderIdentificationBox(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    boxTitle: string,
    bodyLines: string[],
  ): number {
    const lineH = 14;
    const pad = 8;
    const boxH = pad + 16 + bodyLines.length * lineH + pad;
    doc.rect(x0, y, w, boxH).stroke(DocumentsPdfService.PDF_STROKE);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text(boxTitle, x0 + pad, y + pad);
    let cy = y + pad + 16;
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    for (const line of bodyLines) {
      doc.text(line, x0 + pad, cy, { width: w - 2 * pad });
      cy += lineH;
    }
    return y + boxH + 12;
  }

  /** Pie de página estándar (nota legal / auditoría). */
  private static renderDocumentFooter(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    text: string,
  ): void {
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(text, x0, y, { width: w, align: 'left' });
  }

  /** Título de sección (sin tabla “Campo/Valor”). */
  private static renderSectionTitle(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    title: string,
    subtitle?: string,
  ): number {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DocumentsPdfService.PDF_TITLE).text(title, x0, y);
    let ny = y + 16;
    if (subtitle?.trim()) {
      doc.font('Helvetica').fontSize(8).fillColor(DocumentsPdfService.PDF_MUTED).text(subtitle.trim(), x0, ny, { width: 500 });
      ny += 12;
    }
    return ny + 4;
  }

  /**
   * Bloque contextual con fondo neutro (metadatos sin encabezado “Campo | Valor”).
   * @returns Y siguiente al bloque.
   */
  private static renderMutedContextBlock(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    blockTitle: string,
    lines: string[],
  ): number {
    const pad = 10;
    const headH = 18;
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    let contentH = 0;
    for (const line of lines) {
      contentH += doc.heightOfString(line, { width: w - 2 * pad, lineGap: 1 }) + 5;
    }
    const h = pad + headH + contentH + pad;
    doc.save();
    doc.rect(x0, y, w, h).fill('#f4f5f6');
    doc.strokeColor('#e8e8e8').lineWidth(0.5).rect(x0, y, w, h).stroke();
    doc.lineWidth(1);
    doc.fillColor(DocumentsPdfService.PDF_TITLE);
    doc.font('Helvetica-Bold').fontSize(10).text(blockTitle, x0 + pad, y + pad);
    let cy = y + pad + headH;
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    for (const line of lines) {
      doc.text(line, x0 + pad, cy, { width: w - 2 * pad, lineGap: 1 });
      cy += doc.heightOfString(line, { width: w - 2 * pad, lineGap: 1 }) + 5;
    }
    doc.restore();
    return y + h + 12;
  }

  /**
   * Cabecera comercial (factura): clientes destacados + referencias a la derecha.
   */
  private static renderInvoiceCommercialBlock(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    opts: {
      clienteComercial: string;
      clientePedido: string;
      fechaTexto: string;
      documentoRef: string;
      packingLists: string;
      operacionLine: string;
    },
  ): number {
    const pad = 12;
    const leftW = w * 0.55;
    const rightW = w - leftW - 20;
    const xR = x0 + leftW + 20;

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111');
    const hCom = doc.heightOfString(opts.clienteComercial || '—', { width: leftW - pad });
    doc.font('Helvetica').fontSize(10).fillColor('#222222');
    const hPed = doc.heightOfString(opts.clientePedido || '—', { width: leftW - pad });
    const leftH = pad + 12 + hCom + 14 + 12 + hPed + pad;

    const rightLines = [
      `Fecha: ${opts.fechaTexto}`,
      `Documento: ${opts.documentoRef}`,
      opts.packingLists && opts.packingLists !== '—' && opts.packingLists.trim() !== '' ? `Packing lists: ${opts.packingLists}` : '',
      `Operación: ${opts.operacionLine}`,
    ].filter((s) => s.length > 0);
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    let rightContent = 0;
    for (const line of rightLines) {
      rightContent += doc.heightOfString(line, { width: rightW - pad, lineGap: 2 }) + 5;
    }
    const rightH = pad + rightContent + pad;
    const boxH = Math.max(leftH, rightH);

    doc.save();
    doc.rect(x0, y, w, boxH).fill('#f6f7f8');
    doc.strokeColor('#dddddd').lineWidth(0.5).rect(x0, y, w, boxH).stroke();
    doc.lineWidth(1);

    let ly = y + pad;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text('Cliente comercial', x0 + pad, ly);
    ly += 12;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(opts.clienteComercial || '—', x0 + pad, ly, { width: leftW - pad });
    ly += hCom + 10;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text('Cliente pedido', x0 + pad, ly);
    ly += 12;
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(opts.clientePedido || '—', x0 + pad, ly, { width: leftW - pad });

    let ry = y + pad;
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    for (const line of rightLines) {
      doc.text(line, xR, ry, { width: rightW - pad, lineGap: 2 });
      ry += doc.heightOfString(line, { width: rightW - pad, lineGap: 2 }) + 5;
    }
    doc.restore();
    return y + boxH + 14;
  }

  /**
   * Tabla de totales tipo extracto (columna importe alineada a la derecha).
   */
  private static renderStatementTotals(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    rows: Array<{ label: string; value: string; bold?: boolean }>,
  ): number {
    const labelW = w * 0.62;
    const valW = w * 0.38;
    const rowH = 18;
    let cy = y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Totales', x0, cy);
    cy += 16;
    for (const r of rows) {
      doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(r.bold ? 10 : 9)
        .fillColor(r.bold ? '#111111' : '#333333');
      doc.text(r.label, x0, cy, { width: labelW - 8 });
      doc.text(r.value, x0 + labelW, cy, { width: valW - 8, align: 'right' });
      cy += rowH;
    }
    doc.moveTo(x0, cy).lineTo(x0 + w, cy).stroke('#cccccc');
    return cy + 10;
  }

  /** Borde inferior útil del área imprimible (respeta margen inferior). */
  private static pageInnerBottom(doc: InstanceType<typeof PDFDocument>): number {
    return doc.page.height - DocumentsPdfService.PDF_MARGIN;
  }

  /**
   * Si no cabe `minNeeded` puntos desde y, nueva página y Y al margen superior.
   * Evita que tablas o pies queden cortados fuera de la hoja.
   */
  private static ensureVerticalSpace(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    minNeeded: number,
  ): number {
    const bottom = DocumentsPdfService.pageInnerBottom(doc);
    if (y + minNeeded > bottom) {
      doc.addPage();
      return DocumentsPdfService.PDF_MARGIN;
    }
    return y;
  }

  /** Fila simple tipo tabla (una línea por celda, con ancho fijo). */
  private static tableRow(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    cols: string[],
    widths: number[],
    fontSize = 8,
  ): number {
    let cx = x;
    for (let i = 0; i < cols.length; i++) {
      doc.fontSize(fontSize).font('Helvetica').text(cols[i] ?? '', cx, y, { width: widths[i], ellipsis: true });
      cx += widths[i];
    }
    return y + 14;
  }

  /**
   * Tabla con encabezado sombreado, borde exterior y líneas horizontales.
   * - `wrap`: texto multilínea en celdas (alto de fila según contenido).
   * - `pageBreak`: ante fila que no cabe, nueva página y encabezado repetido.
   */
  private static renderPdfTable(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    width: number,
    colWidths: number[],
    header: string[],
    rows: string[][],
    opts?: {
      rowHeight?: number;
      headerHeight?: number;
      fs?: number;
      rowStyles?: Array<{ bold?: boolean; fillColor?: string } | undefined>;
      wrap?: boolean;
      pageBreak?: boolean;
    },
  ): number {
    const rowHMin = opts?.rowHeight ?? 15;
    const fs = opts?.fs ?? 8;
    const rowStyles = opts?.rowStyles;
    const wrap = opts?.wrap ?? false;
    const pageBreak = opts?.pageBreak ?? true;
    const bottom = DocumentsPdfService.pageInnerBottom(doc);
    const defaultHeadH = opts?.headerHeight ?? 20;

    const measureHeaderHeight = (): number => {
      if (!wrap) return defaultHeadH;
      let mh = defaultHeadH;
      for (let i = 0; i < header.length; i++) {
        doc.font('Helvetica-Bold').fontSize(fs);
        const cw = colWidths[i] - 10;
        const h = doc.heightOfString(header[i] ?? '', { width: cw, lineGap: 1 });
        mh = Math.max(mh, h + 10);
      }
      return mh;
    };

    const paintHeader = (atY: number): number => {
      const headH = measureHeaderHeight();
      doc.save();
      doc.rect(x, atY, width, headH).fill('#e9ecef');
      doc.fillColor('#111111');
      let cx = x + 5;
      for (let i = 0; i < header.length; i++) {
        doc.font('Helvetica-Bold').fontSize(fs);
        doc.text(header[i] ?? '', cx, atY + 5, {
          width: colWidths[i] - 10,
          lineBreak: !wrap,
          lineGap: wrap ? 1 : undefined,
        });
        cx += colWidths[i];
      }
      doc.restore();
      const lineY = atY + headH;
      doc.moveTo(x, lineY).lineTo(x + width, lineY).stroke('#333333');
      return headH;
    };

    const measureRowHeight = (ri: number): number => {
      const row = rows[ri];
      const st = rowStyles?.[ri];
      if (!wrap) return rowHMin;
      let rh = rowHMin;
      for (let i = 0; i < row.length; i++) {
        doc.font(st?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor(st?.fillColor ?? '#222222');
        const cw = colWidths[i] - 10;
        const h = doc.heightOfString(String(row[i] ?? ''), { width: cw, lineGap: 1 });
        rh = Math.max(rh, h + 8);
      }
      return rh;
    };

    const strokeSegment = (top: number, bot: number) => {
      doc.rect(x, top, width, bot - top).stroke(DocumentsPdfService.PDF_STROKE);
    };

    let segmentTop = y;
    let cy = y;
    cy += paintHeader(cy);

    for (let ri = 0; ri < rows.length; ri++) {
      const st = rowStyles?.[ri];
      let rh = wrap ? measureRowHeight(ri) : rowHMin;

      if (pageBreak && cy + rh > bottom) {
        if (ri > 0) {
          strokeSegment(segmentTop, cy);
          doc.addPage();
          cy = DocumentsPdfService.PDF_MARGIN;
          segmentTop = cy;
          cy += paintHeader(cy);
        } else {
          const avail = bottom - cy - 8;
          if (avail >= rowHMin) {
            rh = Math.min(rh, avail);
          } else {
            strokeSegment(segmentTop, cy);
            doc.addPage();
            cy = DocumentsPdfService.PDF_MARGIN;
            segmentTop = cy;
            cy += paintHeader(cy);
            rh = wrap ? measureRowHeight(ri) : rowHMin;
          }
        }
      }

      const maxRowFit = bottom - cy - 8;
      if (rh > maxRowFit && maxRowFit >= rowHMin) {
        rh = maxRowFit;
      }

      const row = rows[ri];
      let cx = x + 5;
      for (let i = 0; i < row.length; i++) {
        doc.font(st?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor(st?.fillColor ?? '#222222');
        const cellW = colWidths[i] - 10;
        if (wrap) {
          doc.text(row[i] ?? '', cx, cy + 4, {
            width: cellW,
            lineGap: 1,
            align: 'left',
            height: Math.max(8, rh - 8),
          });
        } else {
          doc.text(row[i] ?? '', cx, cy + 4, { width: cellW, ellipsis: true });
        }
        cx += colWidths[i];
      }
      cy += rh;
      doc.moveTo(x, cy).lineTo(x + width, cy).stroke('#dddddd');
    }

    strokeSegment(segmentTop, cy);
    return cy + 8;
  }

  /** Tabla recepción: última columna (observaciones) con ajuste de línea y alto de fila dinámico. */
  private static renderReceptionLinesTable(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    width: number,
    colWidths: number[],
    header: string[],
    rows: [string, string, string, string][],
    fs = 8,
  ): number {
    const headH = 20;
    let cy = y;
    doc.save();
    doc.rect(x, cy, width, headH).fill('#e9ecef');
    doc.fillColor('#111111');
    let cx = x + 5;
    for (let i = 0; i < header.length; i++) {
      doc
        .font('Helvetica-Bold')
        .fontSize(fs)
        .text(header[i], cx, cy + 5, { width: colWidths[i] - 10, lineBreak: false });
      cx += colWidths[i];
    }
    doc.restore();
    cy += headH;
    doc.moveTo(x, cy).lineTo(x + width, cy).stroke('#333333');
    const obsW = colWidths[3] - 10;
    const docMeas = doc as unknown as { heightOfString?: (t: string, o?: { width?: number; lineGap?: number }) => number };
    for (const row of rows) {
      let hObs = 14;
      try {
        hObs = docMeas.heightOfString?.(row[3], { width: obsW, lineGap: 1 }) ?? 14;
      } catch {
        hObs = 14;
      }
      const rowH = Math.max(18, hObs + 10);
      cx = x + 5;
      doc.font('Helvetica').fontSize(fs).fillColor('#222222');
      doc.text(row[0], cx, cy + 4, { width: colWidths[0] - 10, ellipsis: true });
      cx += colWidths[0];
      doc.text(row[1], cx, cy + 4, { width: colWidths[1] - 10, ellipsis: true });
      cx += colWidths[1];
      doc.text(row[2], cx, cy + 4, { width: colWidths[2] - 10, ellipsis: true });
      cx += colWidths[2];
      doc.text(row[3], cx, cy + 4, { width: obsW, lineGap: 1, align: 'left' });
      cy += rowH;
      doc.moveTo(x, cy).lineTo(x + width, cy).stroke('#dddddd');
    }
    doc.rect(x, y, width, cy - y).stroke('#333333');
    return cy + 8;
  }

  private static pctOf(ent: number, lb: number): string {
    if (!(ent > 0) || !Number.isFinite(lb)) return '—';
    return ((lb / ent) * 100).toFixed(2).replace('.', ',');
  }

  constructor(
    private readonly traceability: TraceabilityService,
    private readonly processService: ProcessService,
    private readonly finalPalletService: FinalPalletService,
    private readonly plantService: PlantService,
    @InjectRepository(FruitProcess) private readonly processRepo: Repository<FruitProcess>,
    @InjectRepository(PtTag) private readonly tagRepo: Repository<PtTag>,
    @InjectRepository(PtTagItem) private readonly tagItemRepo: Repository<PtTagItem>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(DispatchTagItem) private readonly dtiRepo: Repository<DispatchTagItem>,
    @InjectRepository(PackingList) private readonly plRepo: Repository<PackingList>,
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly invItemRepo: Repository<InvoiceItem>,
    @InjectRepository(PtPackingList) private readonly ptPlRepo: Repository<PtPackingList>,
    @InjectRepository(DispatchPtPackingList) private readonly dispatchPlRepo: Repository<DispatchPtPackingList>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Producer) private readonly producerRepo: Repository<Producer>,
    @InjectRepository(Variety) private readonly varietyRepo: Repository<Variety>,
    @InjectRepository(FinalPallet) private readonly fpRepo: Repository<FinalPallet>,
    @InjectRepository(FinalPalletLine) private readonly fplLineRepo: Repository<FinalPalletLine>,
    @InjectRepository(RepalletEvent) private readonly repalletEventRepo: Repository<RepalletEvent>,
  ) {}

  private async resolveCompanyLine(): Promise<void> {
    const fromEnv = process.env.COMPANY_DISPLAY_NAME?.trim();
    if (fromEnv) {
      this.companyDisplayName = fromEnv;
      return;
    }
    try {
      const st = await this.plantService.getOrCreate();
      const candidate = (st as unknown as { plant_name?: string | null })?.plant_name?.trim();
      this.companyDisplayName = candidate || 'PINEBLOOM PACKING';
    } catch {
      this.companyDisplayName = 'PINEBLOOM PACKING';
    }
  }

  private ptPlPalletTotals(palletId: number, lines: FinalPalletLine[]) {
    const ls = lines.filter((l) => Number(l.final_pallet_id) === palletId);
    const boxes = ls.reduce((s, l) => s + l.amount, 0);
    const pounds = ls.reduce((s, l) => s + Number(l.pounds), 0);
    return { boxes, pounds };
  }

  async buildReceptionPdf(id: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const r = await this.traceability.getReception(id);
    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Acta de recepción de fruta',
      'Documento técnico-operativo — verificación de ingreso',
    );
    const fecha = DocumentsPdfService.pdfDateEs(r.received_at as Date);
    const ctxLines = [
      `${this.companyLine()} · Planta ${r.plant_code ?? '—'}`,
      `Productor: ${r.producer?.nombre ?? String(r.producer_id ?? '—')}`,
      `Fecha y hora: ${fecha}`,
      `Referencia: ${r.reference_code ?? '—'} · Documento: ${r.document_number ?? '—'}`,
      `Mercado: ${r.mercado?.nombre ?? '—'} · Estado: ${r.document_state?.nombre ?? '—'} · Tipo recepción: ${r.reception_type?.nombre ?? '—'}`,
    ];
    const grossStr = r.gross_weight_lb != null ? String(r.gross_weight_lb).trim() : '';
    const netStr = r.net_weight_lb != null ? String(r.net_weight_lb).trim() : '';
    const totParts: string[] = [];
    if (grossStr !== '') totParts.push(`Bruto ${grossStr} lb`);
    if (netStr !== '') totParts.push(`Neto ${netStr} lb`);
    if (totParts.length) ctxLines.push(`Totales cabecera: ${totParts.join(' · ')}`);
    if (r.notes?.trim()) ctxLines.push(`Observaciones: ${r.notes.trim()}`);
    y = DocumentsPdfService.renderMutedContextBlock(doc, x0, y, w, 'Contexto operativo', ctxLines);
    y = DocumentsPdfService.renderSectionTitle(doc, x0, y, 'Detalle por línea', 'Peso neto por variedad y envase');
    const lines = r.lines ?? [];
    const colW = [w * 0.22, w * 0.2, w * 0.14, w * 0.44];
    const tableRows: string[][] = [];
    let sumNet = 0;
    for (const ln of lines) {
      const variedad = ln.variety?.nombre ?? String(ln.variety_id);
      let tipoFruta = '—';
      if (ln.returnable_container != null) {
        tipoFruta = `${ln.returnable_container.tipo}${ln.returnable_container.capacidad ? ` (${ln.returnable_container.capacidad})` : ''}`;
      } else if (ln.format_code) {
        tipoFruta = String(ln.format_code);
      } else if (r.reception_type?.nombre) {
        tipoFruta = r.reception_type.nombre;
      }
      const net = Number(ln.net_lb);
      if (Number.isFinite(net)) sumNet += net;
      const obs = [
        ln.multivariety_note?.trim(),
        ln.quality_grade?.nombre ? `Cal. ${ln.quality_grade.nombre}` : null,
        `Lote ${ln.lot_code ?? '—'}`,
      ]
        .filter(Boolean)
        .join(' · ');
      tableRows.push([variedad, tipoFruta, `${DocumentsPdfService.qtyAr(net)} lb`, obs]);
    }
    if (!tableRows.length) {
      tableRows.push(['—', '—', '0 lb', 'Sin líneas en este documento']);
    }
    y = DocumentsPdfService.renderReceptionLinesTable(
      doc,
      x0,
      y,
      w,
      colW,
      ['Variedad', 'Tipo fruta / envase', 'Peso neto (lb)', 'Observaciones'],
      tableRows as [string, string, string, string][],
      8,
    );
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(`Total lb netas recepcionadas: ${DocumentsPdfService.qtyAr(sumNet)} lb`, x0, y);
    y += 22;
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento generado desde el sistema de trazabilidad. Los pesos netos por línea son los registrados en planta al momento de la recepción.',
    );
    return pdfToBuffer(doc);
  }

  async buildProcessPdf(id: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const row = await this.processService.getProcessRowForReport(id);
    const raw = await this.processRepo.findOne({ where: { id } });
    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Liquidación técnica de proceso',
      'Análisis de distribución — 100% lb de entrada',
    );
    const fs = DocumentsPdfService.pdfDateEs(row.fecha_proceso as Date | string);
    const idLines = [
      `${this.companyLine()}`,
      `Fecha y hora: ${fs}`,
      `Productor: ${row.productor_nombre ?? String(row.productor_id ?? '—')} · Recepción vinculada: ${row.recepcion_id ?? '—'}`,
      `Especie / variedad: ${row.especie_nombre ?? '—'} / ${row.variedad_nombre ?? '—'}`,
      `Estado proceso: ${row.process_status ?? '—'} · Balance de liquidación: ${row.balance_closed ? 'cerrado' : 'abierto'}`,
    ];
    y = DocumentsPdfService.renderMutedContextBlock(doc, x0, y, w, 'Identificación del proceso', idLines);
    if (!row.balance_closed) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555555').text(
        'Proceso en curso: distribución aún no completada',
        x0,
        y,
        { width: w },
      );
      y += 16;
    }
    y = DocumentsPdfService.renderSectionTitle(doc, x0, y, 'Resumen de liquidación (lb)', 'Porcentajes sobre lb de entrada');
    y += 4;
    const ent = Number(row.entrada_lb_basis ?? row.lb_entrada ?? row.peso_procesado_lb) || 0;
    const emp = Number(row.lb_packout_planned ?? 0);
    const mermaPlanta = Number(row.merma_lb ?? raw?.merma_lb ?? 0);
    const mermaBal = raw?.lb_merma_balance != null ? Number(raw.lb_merma_balance) : 0;
    const mermaTot = mermaPlanta + mermaBal;
    const jugo = Number(row.lb_jugo ?? raw?.lb_jugo ?? 0);
    const desecho = Number(row.lb_desecho ?? raw?.lb_desecho ?? 0);
    const otrosReg = Number(row.lb_sobrante ?? raw?.lb_sobrante ?? 0);
    const colW = [w * 0.48, w * 0.26, w * 0.24];
    const mainRows: string[][] = [
      ['Total fruta ingresada (100%)', `${DocumentsPdfService.qtyAr(ent)} lb`, '100,00'],
      ['Producto terminado (lb)', `${DocumentsPdfService.qtyAr(emp)} lb`, DocumentsPdfService.pctOf(ent, emp)],
      ['Lb merma (operativa + cierre de balance si aplica)', `${DocumentsPdfService.qtyAr(mermaTot)} lb`, DocumentsPdfService.pctOf(ent, mermaTot)],
      ['Lb jugo', `${DocumentsPdfService.qtyAr(jugo)} lb`, DocumentsPdfService.pctOf(ent, jugo)],
      ['Lb desecho', `${DocumentsPdfService.qtyAr(desecho)} lb`, DocumentsPdfService.pctOf(ent, desecho)],
    ];
    if (Math.abs(otrosReg) > 0.001) {
      mainRows.push(['Otros registros (sobrante / legacy)', `${DocumentsPdfService.qtyAr(otrosReg)} lb`, DocumentsPdfService.pctOf(ent, otrosReg)]);
    }
    const sumMain = emp + mermaTot + jugo + desecho + (Math.abs(otrosReg) > 0.001 ? otrosReg : 0);
    const diff = ent - sumMain;
    mainRows.push(['TOTAL distribuido (suma de conceptos)', `${DocumentsPdfService.qtyAr(sumMain)} lb`, DocumentsPdfService.pctOf(ent, sumMain)]);
    mainRows.push(['Diferencia vs entrada (debe tender a 0 al cerrar)', `${DocumentsPdfService.qtyAr(diff)} lb`, DocumentsPdfService.pctOf(ent, diff)]);
    const rowStyles: Array<{ bold?: boolean; fillColor?: string } | undefined> = mainRows.map(() => undefined);
    rowStyles[mainRows.length - 1] = {
      bold: true,
      fillColor: Math.abs(diff) > 1e-6 ? '#b00020' : '#111111',
    };
    y = DocumentsPdfService.renderPdfTable(
      doc,
      x0,
      y,
      w,
      colW,
      ['Concepto', 'Libras', '% sobre entrada'],
      mainRows,
      { fs: 8, rowHeight: 16, rowStyles },
    );
    doc.font('Helvetica').fontSize(7).fillColor('#666666').text(
      'Los porcentajes se calculan sobre lb de entrada. El desglose por componente de especie (si existe) aparece abajo y complementa el detalle técnico.',
      x0,
      y,
      { width: w },
    );
    y += 22;
    const comps = row.components ?? [];
    if (comps.length) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Detalle por componente (especie)', x0, y);
      y += 14;
      const crRows: string[][] = [];
      for (const c of comps) {
        const lbv = Number(c.lb_value);
        crRows.push([c.nombre, `${DocumentsPdfService.qtyAr(lbv)} lb`, c.pct_of_entrada != null ? `${c.pct_of_entrada}%` : '—']);
      }
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, colW, ['Componente', 'Libras', '% sobre entrada'], crRows, { fs: 8, rowHeight: 14 });
    }
    doc.fillColor('#111111').fontSize(10);
    let tarjaLabel = '—';
    if (row.tarja_id != null && Number(row.tarja_id) > 0) {
      const pt = await this.tagRepo.findOne({ where: { id: Number(row.tarja_id) }, select: ['id', 'tag_code'] });
      tarjaLabel = pt?.tag_code?.trim() ? pt.tag_code.trim() : '—';
    }
    doc.font('Helvetica-Bold').fontSize(10).text(`Unidad PT vinculada: ${tarjaLabel}`, x0, y);
    y += 16;
    const fpLines = await this.fplLineRepo.find({
      where: { fruit_process_id: id },
      relations: ['final_pallet'],
      order: { id: 'ASC' },
    });
    const fpIdsForTrace = [
      ...new Set(
        fpLines
          .map((ln) => ln.final_pallet?.id)
          .filter((x): x is number => x != null && Number(x) > 0)
          .map(Number),
      ),
    ];
    const fpTrace =
      fpIdsForTrace.length > 0
        ? await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds(fpIdsForTrace)
        : new Map();
    if (fpLines.length) {
      doc.text('Existencias PT que consumen este proceso:', x0, y);
      y += 14;
      const seen = new Set<number>();
      for (const ln of fpLines) {
        const fp = ln.final_pallet;
        const fid = fp?.id ?? 0;
        if (fid && seen.has(fid)) continue;
        if (fid) seen.add(fid);
        const tr = fpTrace.get(Number(fid));
        const code =
          tr?.codigo_unidad_pt_display?.trim() ?? fp?.corner_board_code?.trim() ?? `PF-${fid}`;
        doc.font('Helvetica').fontSize(8).text(` · ${code} · cajas línea ${ln.amount} · lb ${ln.pounds}`, x0 + 4, y, { width: w - 8 });
        y += 12;
      }
      y += 4;
    }
    const notaTxt = row.nota?.trim() ? row.nota.trim() : '—';
    doc.font('Helvetica').fontSize(9).fillColor('#333333').text(`Nota: ${notaTxt}`, x0, y, { width: w });
    y += Math.max(20, doc.heightOfString(`Nota: ${notaTxt}`, { width: w }) + 8);
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento técnico generado desde el sistema de trazabilidad. Conservar junto con la documentación de recepción y despacho correspondiente.',
    );
    return pdfToBuffer(doc);
  }

  /** Bloque resumen: código de unidad PT (protagonista visual). */
  private static renderTagHeroBlock(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    y: number,
    w: number,
    tagCode: string,
    subtitle: string,
  ): number {
    const h = 76;
    doc.save();
    doc.rect(x0, y, w, h).fill('#f4f5f6');
    doc.strokeColor('#e0e0e0').lineWidth(0.5).rect(x0, y, w, h).stroke();
    doc.lineWidth(1);
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#111111').text(tagCode, x0 + 14, y + 14, { width: w - 28 });
    doc.font('Helvetica').fontSize(9).fillColor('#555555').text(subtitle, x0 + 14, y + 50, { width: w - 28, lineGap: 2 });
    doc.restore();
    return y + h + 12;
  }

  /** PDF detalle (A4) — trazabilidad y tablas. */
  async buildTagDetailPdf(id: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const t = await this.tagRepo.findOne({
      where: { id },
      relations: ['client', 'brand'],
    });
    if (!t) throw new NotFoundException('Unidad PT no encontrada');
    const items = await this.tagItemRepo.find({ where: { tarja_id: id } });
    const producerIds = Array.from(new Set(items.map((it) => Number(it.productor_id)).filter((v) => Number.isFinite(v) && v > 0)));
    const producers = producerIds.length > 0 ? await this.producerRepo.find({ where: { id: In(producerIds) } }) : [];
    const producerById = new Map(
      producers.map((p) => [
        p.id,
        p.nombre?.trim() || p.codigo?.trim() || String(p.id),
      ]),
    );
    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Certificado de trazabilidad — Unidad PT',
      'Datos de producto y origen por proceso',
    );
    const clientLabel = t.client?.nombre?.trim() ? t.client.nombre : 'Sin cliente asignado';
    const brandLabel = t.brand?.nombre?.trim() ? t.brand.nombre : '—';
    const bolLabel = t.bol?.trim() ? t.bol.trim() : '—';
    y = DocumentsPdfService.renderTagHeroBlock(
      doc,
      x0,
      y,
      w,
      t.tag_code,
      `${clientLabel} · ${t.total_cajas} cajas · ${t.format_code} · Resultado ${t.resultado}`,
    );
    const prodLines = [
      `Fecha: ${DocumentsPdfService.pdfDateEs(t.fecha)}`,
      `Pallets: ${t.total_pallets} · Cajas por pallet: ${t.cajas_por_pallet}`,
      `Marca: ${brandLabel} · BOL / referencia: ${bolLabel}`,
      `Peso neto (lb): ${t.net_weight_lb ?? '—'}`,
    ];
    y = DocumentsPdfService.renderMutedContextBlock(doc, x0, y, w, 'Producto y logística', prodLines);
    const tw = [w * 0.12, w * 0.2, w * 0.15, w * 0.15, w * 0.38];
    const headerOrig = ['Proceso', 'Productor', 'Cajas', 'Pallets línea', 'Nota'];
    const origRowsAll: string[][] =
      items.length > 0
        ? items.map((it) => [
            String(it.process_id),
            producerById.get(Number(it.productor_id)) ?? String(it.productor_id ?? '—'),
            String(it.cajas_generadas),
            String(it.pallets_generados),
            '—',
          ])
        : [['—', '—', '—', '—', 'Sin procesos vinculados']];
    const chunkSize = 24;
    for (let i = 0; i < origRowsAll.length; i += chunkSize) {
      if (i > 0) {
        doc.addPage();
        y = DocumentsPdfService.PDF_MARGIN;
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#111111')
        .text(
          i === 0 ? 'Origen por proceso' : 'Origen por proceso (continúa)',
          x0,
          y,
        );
      doc.font('Helvetica').fontSize(8).fillColor('#555555').text('Cajas y pallets por línea de proceso', x0, y + 14);
      y += 30;
      const chunk = origRowsAll.slice(i, i + chunkSize);
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerOrig, chunk, { fs: 8, rowHeight: 14, wrap: true });
    }
    y += 8;
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento de trazabilidad generado desde el sistema. Conservar para auditoría y despacho.',
    );
    return pdfToBuffer(doc);
  }

  /** Etiqueta operativa (4×6 in aprox.) — QR reservado. */
  async buildTagLabelPdf(id: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const t = await this.tagRepo.findOne({
      where: { id },
      relations: ['client', 'brand'],
    });
    if (!t) throw new NotFoundException('Unidad PT no encontrada');
    const doc = new PDFDocument({ margin: 24, size: [288, 432] });
    const w = 240;
    doc.fontSize(11).font('Helvetica-Bold').text(this.companyLine(), 24, 24, { width: w, align: 'center' });
    doc.fontSize(20).text('UNIDAD PT', 24, 42, { width: w, align: 'center' });
    doc.fontSize(22).text(t.tag_code, 24, 72, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(14);
    doc.text(`Formato: ${t.format_code}`, 24, 112, { width: w, align: 'center' });
    doc.text(`Cajas: ${t.total_cajas}`, 24, 132, { width: w, align: 'center' });
    doc
      .fontSize(12)
      .text(`Cliente: ${t.client?.nombre?.trim() ? t.client.nombre : 'Sin cliente asignado'}`, 24, 156, { width: w, align: 'center' });
    doc.rect(84, 210, 120, 120).stroke('#333333');
    doc.fontSize(9).fillColor('#666666').text('Espacio QR\n(próximamente)', 84, 248, { width: 120, align: 'center' });
    doc.fillColor('#000000');
    return pdfToBuffer(doc);
  }

  /**
   * Etiqueta operativa para pallet en existencias (corner board / PF-…).
   * Tras repaletizaje, el código nuevo (ej. PF-81) es el que debe ir a cámara / bodega.
   */
  async buildFinalPalletLabelPdf(id: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const fp = await this.fpRepo.findOne({
      where: { id },
      relations: ['species', 'client', 'brand', 'presentation_format'],
    });
    if (!fp) throw new NotFoundException('Existencia / pallet final no encontrado');
    const lines = await this.fplLineRepo.find({ where: { final_pallet_id: id } });
    const { boxes, pounds } = this.ptPlPalletTotals(id, lines);
    const ev = await this.repalletEventRepo.findOne({ where: { result_final_pallet_id: id } });
    const repalletResultadoVigente = ev != null && ev.reversed_at == null;
    const trMap = await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds([id]);
    const tr = trMap.get(id);
    const code =
      (tr?.codigo_unidad_pt_display?.trim() ?? fp.corner_board_code?.trim()) || `PF-${fp.id}`;
    const fmt = fp.presentation_format?.format_code?.trim() ?? '—';
    const cliente = fp.client?.nombre?.trim() ? fp.client.nombre : 'Sin cliente asignado';
    const especie = fp.species?.nombre?.trim() ?? '—';

    const doc = new PDFDocument({ margin: 24, size: [288, 432] });
    const w = 240;
    doc.fontSize(11).font('Helvetica-Bold').text(this.companyLine(), 24, 24, { width: w, align: 'center' });
    doc.fontSize(20).text('EXISTENCIA PT', 24, 42, { width: w, align: 'center' });
    doc.fontSize(22).text(code, 24, 72, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(14).fillColor('#000000');
    doc.text(`Formato: ${fmt}`, 24, 108, { width: w, align: 'center' });
    doc.text(`Cajas: ${boxes}`, 24, 132, { width: w, align: 'center' });
    doc.text(`Lb: ${DocumentsPdfService.qtyAr(pounds)}`, 24, 152, { width: w, align: 'center' });
    doc.fontSize(12).text(`Especie: ${especie}`, 24, 176, { width: w, align: 'center' });
    doc.text(`Cliente: ${cliente}`, 24, 196, { width: w, align: 'center' });
    if (repalletResultadoVigente) {
      doc
        .fontSize(10)
        .fillColor('#0f5132')
        .text('Repaletizaje: resultado (stock vigente)', 24, 222, { width: w, align: 'center' });
    }
    doc.fillColor('#000000');
    doc.rect(84, repalletResultadoVigente ? 252 : 232, 120, 120).stroke('#333333');
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text('Espacio QR\n(próximamente)', 84, repalletResultadoVigente ? 290 : 270, { width: 120, align: 'center' });
    doc.fillColor('#000000');
    return pdfToBuffer(doc);
  }

  /** @deprecated usar buildTagDetailPdf; se mantiene para compatibilidad. */
  async buildTagPdf(id: number): Promise<Buffer> {
    return this.buildTagDetailPdf(id);
  }

  async buildInvoicePdf(dispatchId: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId }, relations: { client: true } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const inv = await this.invRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (!inv) throw new NotFoundException('Factura no generada; ejecute POST .../invoice/generate primero');
    const lines = await this.invItemRepo.find({ where: { invoice_id: inv.id }, order: { id: 'ASC' } });
    const plLinks = await this.dispatchPlRepo.find({
      where: { dispatch_id: dispatchId },
      relations: { pt_packing_list: true },
    });
    const plCodes = plLinks.map((l) => l.pt_packing_list?.list_code).filter((c): c is string => !!c);

    const varietyIds = [
      ...new Set(lines.map((l) => (l.variety_id != null && Number(l.variety_id) > 0 ? Number(l.variety_id) : null)).filter((x): x is number => x != null)),
    ];
    const varieties = varietyIds.length ? await this.varietyRepo.findBy({ id: In(varietyIds) }) : [];
    const varietyName = new Map(varieties.map((v) => [v.id, v.nombre]));

    let clienteNombre = dispatch.client?.nombre ?? null;
    if (!clienteNombre && dispatch.client_id != null && Number(dispatch.client_id) > 0) {
      const c = await this.clientRepo.findOne({ where: { id: Number(dispatch.client_id) } });
      clienteNombre = c?.nombre ?? null;
    }
    const pedidoCliente = await this.clientRepo.findOne({ where: { id: Number(dispatch.cliente_id) } });
    const pedidoNombre = pedidoCliente?.nombre?.trim() ?? null;

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const x0 = DocumentsPdfService.PDF_MARGIN;
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Factura comercial',
      'Documento financiero — despacho y facturación',
    );

    const fd = dispatch.fecha_despacho instanceof Date ? dispatch.fecha_despacho : new Date(String(dispatch.fecha_despacho));
    y = DocumentsPdfService.renderInvoiceCommercialBlock(doc, x0, y, w, {
      clienteComercial: clienteNombre?.trim() ? clienteNombre : '—',
      clientePedido: pedidoNombre ?? '—',
      fechaTexto: DocumentsPdfService.pdfDateEs(fd),
      documentoRef: String(inv.invoice_number ?? '—'),
      packingLists: plCodes.length ? plCodes.join(', ') : '—',
      operacionLine: `BOL / transporte: ${dispatch.numero_bol ?? '—'} · Orden: ${dispatch.orden_id ?? '—'}`,
    });

    const detailRows: string[][] = [];
    let sumCajas = 0;
    let sumLb = 0;
    let sumProducto = 0;

    for (const li of lines) {
      if (li.tarja_id != null && Number(li.tarja_id) > 0) {
        const obs = `Costo logística pallet: $ ${DocumentsPdfService.moneyAr(Number(li.pallet_cost_total ?? 0))}`;
        detailRows.push([
          'Producto PT (unidad)',
          String(li.cajas),
          '—',
          `$ ${DocumentsPdfService.moneyAr(Number(li.unit_price))}`,
          `$ ${DocumentsPdfService.moneyAr(Number(li.line_subtotal))}`,
          obs,
        ]);
        sumCajas += li.cajas;
        sumProducto += Number(li.line_subtotal);
        continue;
      }
      if (li.is_manual) {
        const desc =
          (li.manual_description && String(li.manual_description).trim()) ||
          [li.packaging_code, li.brand].filter((x) => x != null && String(x).trim() !== '').join(' · ') ||
          '—';
        const kindLabel = li.manual_line_kind === 'descuento' ? 'Descuento · ' : 'Ajuste · ';
        const lb = li.pounds != null ? Number(li.pounds) : 0;
        detailRows.push([
          `${kindLabel}${desc}`,
          String(li.cajas),
          lb > 0 ? `${DocumentsPdfService.qtyAr(lb)} lb` : '—',
          `$ ${DocumentsPdfService.moneyAr(Number(li.unit_price))}`,
          `$ ${DocumentsPdfService.moneyAr(Number(li.line_subtotal))}`,
          '—',
        ]);
        sumCajas += li.cajas;
        sumProducto += Number(li.line_subtotal);
        continue;
      }
      const vid = li.variety_id != null ? Number(li.variety_id) : null;
      const vn = vid != null ? varietyName.get(vid) ?? '—' : '—';
      const lb = li.pounds != null ? Number(li.pounds) : 0;
      const marca = li.brand ?? '—';
      const fmt = li.packaging_code ?? '—';
      detailRows.push([
        `${fmt} · ${vn} · ${marca}`,
        String(li.cajas),
        `${DocumentsPdfService.qtyAr(lb)} lb`,
        `$ ${DocumentsPdfService.moneyAr(Number(li.unit_price))}`,
        `$ ${DocumentsPdfService.moneyAr(Number(li.line_subtotal))}`,
        '—',
      ]);
      sumCajas += li.cajas;
      sumLb += lb;
      sumProducto += Number(li.line_subtotal);
    }

    const tw = [w * 0.26, w * 0.08, w * 0.12, w * 0.14, w * 0.14, w * 0.26];
    const headerDet = ['Concepto', 'Cajas', 'Lb neto', 'P. unit.', 'Subtotal', 'Observaciones'];
    y = DocumentsPdfService.renderSectionTitle(doc, x0, y, 'Detalle de producto y servicios', 'Precios y cantidades facturables');
    y += 6;
    if (!detailRows.length) {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerDet, [['—', '—', '—', '—', '—', 'Sin líneas']], {
        fs: 8,
        rowHeight: 14,
        wrap: true,
      });
    } else {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerDet, detailRows, { fs: 8, rowHeight: 14, wrap: true });
    }

    y += 6;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 120);
    doc.moveTo(x0, y).lineTo(x0 + w, y).stroke('#dddddd');
    y += 10;
    y = DocumentsPdfService.renderStatementTotals(doc, x0, y, w, [
      {
        label: 'Totales producto (cajas / lb / subtotal líneas)',
        value: `${DocumentsPdfService.qtyAr(sumCajas)} cajas · ${DocumentsPdfService.qtyAr(sumLb)} lb · $ ${DocumentsPdfService.moneyAr(sumProducto)}`,
      },
      { label: 'Subtotal', value: String(inv.subtotal) },
      { label: 'Costo pallet / logística', value: String(inv.total_cost) },
      { label: 'Total', value: String(inv.total), bold: true },
    ]);

    y += 8;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 48);
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento comercial generado desde el sistema de trazabilidad. No modifica inventario ni saldos físicos.',
    );
    return pdfToBuffer(doc);
  }

  /** Factura PDF desde packing list PT (sin despacho). Solo documento; precios por formato en el cuerpo. */
  async buildPtPackingListCommercialInvoicePdf(
    ptPackingListId: number,
    unitPricesByFormatId: Record<string, number> = {},
  ): Promise<Buffer> {
    await this.resolveCompanyLine();
    const pl = await this.ptPlRepo.findOne({
      where: { id: ptPackingListId },
      relations: { client: true, items: true },
    });
    if (!pl) throw new NotFoundException('Packing list no encontrado');
    const palletIds = (pl.items ?? []).map((i) => Number(i.final_pallet_id));
    if (!palletIds.length) throw new NotFoundException('Packing list sin pallets');
    const fps = await this.fpRepo.find({
      where: { id: In(palletIds) },
      relations: ['lines', 'lines.variety', 'lines.fruit_process', 'presentation_format', 'brand'],
    });
    const grouped = groupFinalPalletsForCommercialInvoice(fps, unitPricesByFormatId);

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Factura comercial (packing list PT)',
      'Precios por formato según cotización cargada — documento comercial',
    );

    const ld = pl.list_date instanceof Date ? pl.list_date : new Date(String(pl.list_date));
    const plStatusLabel = (s: string) =>
      ({ borrador: 'Borrador', confirmado: 'Confirmado', anulado: 'Anulado' } as Record<string, string>)[s] ?? s;

    y = DocumentsPdfService.renderInvoiceCommercialBlock(doc, x0, y, w, {
      clienteComercial: pl.client?.nombre?.trim() ? pl.client.nombre : '—',
      clientePedido: '—',
      fechaTexto: DocumentsPdfService.pdfDateEs(ld),
      documentoRef: pl.list_code,
      packingLists: '—',
      operacionLine: `Estado: ${plStatusLabel(String(pl.status))} · BOL / referencia: ${pl.numero_bol?.trim() ? pl.numero_bol.trim() : '—'}`,
    });
    if (pl.notes?.trim()) {
      y = DocumentsPdfService.renderMutedContextBlock(doc, x0, y, w, 'Notas', [pl.notes.trim()]);
    }

    const tw = [w * 0.1, w * 0.14, w * 0.13, w * 0.1, w * 0.07, w * 0.1, w * 0.11, w * 0.11];
    const headerInv = ['Formato', 'Variedad', 'Marca', 'Ref.', 'Cajas', 'Lb neto', '$/caja', 'Subtotal'];

    const tableRows: string[][] = [];
    let sumCajas = 0;
    let sumLb = 0;
    let sumMonto = 0;
    for (const g of grouped) {
      sumCajas += g.cajas;
      sumLb += g.pounds;
      sumMonto += g.lineSubtotal;
      const refTraz =
        g.tarja_id != null && Number(g.tarja_id) > 0
          ? `TAR #${g.tarja_id}`
          : g.final_pallet_id != null
            ? `PF #${g.final_pallet_id}`
            : '—';
      tableRows.push([
        g.formatCode,
        g.varietyName ?? '—',
        g.brandName ?? '—',
        refTraz,
        String(g.cajas),
        `${DocumentsPdfService.qtyAr(g.pounds)} lb`,
        `$ ${DocumentsPdfService.moneyAr(g.unitPrice)}`,
        `$ ${DocumentsPdfService.moneyAr(g.lineSubtotal)}`,
      ]);
    }

    y = DocumentsPdfService.renderSectionTitle(doc, x0, y, 'Detalle comercial', 'Por formato, variedad y marca');
    y += 4;
    if (!tableRows.length) {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerInv, [['—', '—', '—', '—', '—', '—', '—', '—']], {
        fs: 8,
        rowHeight: 14,
        wrap: true,
      });
    } else {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerInv, tableRows, { fs: 8, rowHeight: 14, wrap: true });
    }

    y += 6;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 56);
    doc.moveTo(x0, y).lineTo(x0 + w, y).stroke('#dddddd');
    y += 10;
    y = DocumentsPdfService.renderStatementTotals(doc, x0, y, w, [
      {
        label: 'Total (cajas / lb / importe)',
        value: `${DocumentsPdfService.qtyAr(sumCajas)} cajas · ${DocumentsPdfService.qtyAr(sumLb)} lb · $ ${DocumentsPdfService.moneyAr(sumMonto)}`,
        bold: true,
      },
    ]);
    y += 6;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 52);
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento generado desde el sistema de trazabilidad. No modifica inventario ni saldos. Los importes resultan de cajas × precio por formato indicado al generar el PDF.',
    );

    return pdfToBuffer(doc);
  }

  async buildPackingListPdf(dispatchId: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const pedidoCliente = await this.clientRepo.findOne({ where: { id: Number(dispatch.cliente_id) } });
    const pl = await this.plRepo.findOne({ where: { dispatch_id: dispatchId } });
    const items = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const x0 = DocumentsPdfService.PDF_MARGIN;
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Packing list — salida',
      'Documento logístico — carga y transporte',
    );

    const fechaDesp = dispatch.fecha_despacho instanceof Date ? dispatch.fecha_despacho : new Date(String(dispatch.fecha_despacho));
    const logLines = [
      `Cliente pedido: ${pedidoCliente?.nombre?.trim() ?? '—'}`,
      `Fecha de carga: ${DocumentsPdfService.pdfDateEs(fechaDesp)}`,
      `BOL / referencia transporte: ${dispatch.numero_bol?.trim() ? dispatch.numero_bol.trim() : '—'}`,
      `Temperatura de carga (°F): ${dispatch.temperatura_f != null ? String(dispatch.temperatura_f) : '—'}`,
      `Termógrafo: ${[
        dispatch.thermograph_serial?.trim() ? dispatch.thermograph_serial.trim() : '—',
        dispatch.thermograph_notes?.trim() ? dispatch.thermograph_notes.trim() : '',
      ]
        .filter(Boolean)
        .join(' · ') || '—'}`,
    ];
    if (pl?.packing_number != null && String(pl.packing_number).trim() !== '') {
      logLines.push(`Referencia packing list: ${String(pl.packing_number)}`);
    }
    y = DocumentsPdfService.renderMutedContextBlock(doc, x0, y, w, 'Envío y condiciones', logLines);
    y = DocumentsPdfService.renderSectionTitle(doc, x0, y, 'Carga — unidades PT', 'Cantidades despachadas');

    const itemTarjaIds = [...new Set(items.map((i) => Number(i.tarja_id)).filter((x) => x > 0))];
    const itemTags =
      itemTarjaIds.length > 0
        ? await this.tagRepo.find({ where: { id: In(itemTarjaIds) }, select: ['id', 'tag_code'] })
        : [];
    const itemTagCode = new Map(itemTags.map((t) => [Number(t.id), (t.tag_code ?? '').trim()]));

    const ptRows: string[][] = [];
    for (const it of items) {
      const tid = Number(it.tarja_id);
      const tc = tid > 0 ? itemTagCode.get(tid) : '';
      const ref = tc ? tc : 'Unidad PT';
      ptRows.push([
        ref,
        String(it.cajas_despachadas ?? '—'),
        String(it.pallets_despachados ?? '—'),
        it.unit_price != null ? `$ ${DocumentsPdfService.moneyAr(Number(it.unit_price))}` : '—',
      ]);
    }

    const twPt = [w * 0.4, w * 0.2, w * 0.2, w * 0.2];
    const headPt = ['Unidad PT (referencia)', 'Cajas', 'Pallets', 'Precio unit.'];
    y += 4;
    if (!ptRows.length) {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, twPt, headPt, [['—', '—', '—', 'Sin líneas de unidad']], { fs: 8, rowHeight: 14, wrap: true });
    } else {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, twPt, headPt, ptRows, { fs: 8, rowHeight: 14, wrap: true });
    }
    y += 10;

    const pay = pl?.printable_payload as { final_pallets?: Array<Record<string, unknown>> } | undefined;
    const fps = pay?.final_pallets;
    if (fps?.length) {
      const fpIdsPdf = [...new Set(fps.map((fp) => Number(fp.id)).filter((x) => x > 0))];
      const fpTrPdf =
        fpIdsPdf.length > 0
          ? await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds(fpIdsPdf)
          : new Map();

      const exRows: string[][] = [];
      for (const fp of fps) {
        const fid = Number(fp.id);
        const tr = fpTrPdf.get(fid);
        const primary =
          (tr?.codigo_unidad_pt_display?.trim() ?? String(fp.corner_board_code ?? '').trim()) ||
          `PF-${fid}`;
        const boxes = fp.boxes != null ? String(fp.boxes) : '—';
        const lbs = fp.pounds != null ? `${DocumentsPdfService.qtyAr(Number(fp.pounds))} lb` : '—';
        exRows.push([primary, String(fp.format_code ?? '—'), boxes, lbs]);
      }

      const twEx = [w * 0.34, w * 0.22, w * 0.2, w * 0.24];
      const headEx = ['Unidad PT / existencia', 'Formato', 'Cajas', 'Lb neto'];
      y = DocumentsPdfService.ensureVerticalSpace(doc, y, 80);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(DocumentsPdfService.PDF_TITLE).text('Existencias PT incluidas en el listado', x0, y);
      y += 16;
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, twEx, headEx, exRows, { fs: 8, rowHeight: 14, wrap: true });
    }

    y += 8;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 48);
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento logístico generado desde el sistema de trazabilidad. Verificar carga y documentación de transporte antes del despacho.',
    );
    return pdfToBuffer(doc);
  }

  /** Packing list logístico PT (independiente de despacho). */
  async buildPtPackingListPtPdf(id: number): Promise<Buffer> {
    await this.resolveCompanyLine();
    const pl = await this.ptPlRepo.findOne({
      where: { id },
      relations: { client: true, items: true },
    });
    if (!pl) throw new NotFoundException('Packing list no encontrado');

    const palletIds = (pl.items ?? []).map((i) => Number(i.final_pallet_id)).filter((x) => Number.isFinite(x) && x > 0);
    const lines =
      palletIds.length > 0
        ? await this.fplLineRepo.find({
            where: { final_pallet_id: In(palletIds) },
            order: { line_order: 'ASC', id: 'ASC' },
          })
        : [];

    const fps =
      palletIds.length > 0
        ? await this.fpRepo.find({
            where: { id: In(palletIds) },
            relations: { presentation_format: true, client: true, species: true },
          })
        : [];
    const fpById = new Map(fps.map((p) => [Number(p.id), p]));

    const plTrace =
      palletIds.length > 0
        ? await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds(palletIds)
        : new Map();

    const plStatusLabel = (s: string) =>
      ({ borrador: 'Borrador', confirmado: 'Confirmado', anulado: 'Anulado' } as Record<string, string>)[s] ?? s;
    const fpStatusLabel = (s: string) =>
      ({
        borrador: 'Borrador',
        definitivo: 'Definitivo',
        anulado: 'Anulado',
        repaletizado: 'Repaletizado',
        revertido: 'Revertido',
        asignado_pl: 'Asignado PL',
      } as Record<string, string>)[s] ?? s;

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;
    let y = this.renderCorporateHeader(
      doc,
      x0,
      DocumentsPdfService.PDF_MARGIN,
      w,
      'Packing list PT (logístico)',
      'Carga consolidada — existencias producto terminado',
    );

    const ld = pl.list_date instanceof Date ? pl.list_date : new Date(String(pl.list_date));
    const listLines = [
      `Código de listado: ${pl.list_code}`,
      `Fecha: ${DocumentsPdfService.pdfDateEs(ld)}`,
      `Cliente: ${pl.client?.nombre?.trim() ? pl.client.nombre : '—'}`,
      `Estado: ${plStatusLabel(String(pl.status))}`,
      `BOL / referencia: ${pl.numero_bol?.trim() ? pl.numero_bol.trim() : '—'}`,
    ];
    if (pl.notes?.trim()) listLines.push(`Notas: ${pl.notes.trim()}`);
    y = DocumentsPdfService.renderMutedContextBlock(doc, x0, y, w, 'Datos del listado', listLines);
    y = DocumentsPdfService.renderSectionTitle(doc, x0, y, 'Existencias incluidas', 'Pallets y peso neto por unidad');

    const tw = [w * 0.15, w * 0.07, w * 0.12, w * 0.12, w * 0.17, w * 0.08, w * 0.11, w * 0.1];
    const headerPt = ['Unidad PT', 'Ref.', 'Especie', 'Formato', 'Cliente', 'Cajas', 'Lb neto', 'Estado'];

    const tableRows: string[][] = [];
    let totalBoxes = 0;
    let totalPounds = 0;
    for (const pid of palletIds) {
      const p = fpById.get(pid);
      if (!p) continue;
      const t = this.ptPlPalletTotals(pid, lines);
      totalBoxes += t.boxes;
      totalPounds += t.pounds;
      const op =
        (plTrace.get(pid)?.codigo_unidad_pt_display?.trim() ?? p.corner_board_code?.trim()) ||
        `PF-${pid}`;
      const cliente = p.client?.nombre?.trim() ? p.client.nombre : '—';
      tableRows.push([
        op,
        String(p.id),
        p.species?.nombre ?? '—',
        p.presentation_format?.format_code ?? '—',
        cliente,
        String(t.boxes),
        `${DocumentsPdfService.qtyAr(t.pounds)} lb`,
        fpStatusLabel(String(p.status)),
      ]);
    }

    y += 4;
    if (!tableRows.length) {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerPt, [['—', '—', '—', '—', '—', '—', '—', 'Sin pallets en este listado']], {
        fs: 8,
        rowHeight: 14,
        wrap: true,
      });
    } else {
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerPt, tableRows, { fs: 8, rowHeight: 14, wrap: true });
    }

    y += 4;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 52);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111111')
      .text(`Totales: ${DocumentsPdfService.qtyAr(totalBoxes)} cajas · ${DocumentsPdfService.qtyAr(totalPounds)} lb`, x0, y);
    y += 20;
    y = DocumentsPdfService.ensureVerticalSpace(doc, y, 48);
    DocumentsPdfService.renderDocumentFooter(
      doc,
      x0,
      y,
      w,
      'Documento generado desde el sistema de trazabilidad. Las cajas y libras netas corresponden a las líneas del pallet final incluidas en este packing list.',
    );

    return pdfToBuffer(doc);
  }
}
