import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { DataSource, In, Repository } from 'typeorm';
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

function pdfToBuffer(
  doc: InstanceType<typeof PDFDocument>,
  footerFn?: (doc: InstanceType<typeof PDFDocument>) => void,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  if (footerFn) footerFn(doc);
  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

@Injectable()
export class DocumentsPdfService {
  private companyDisplayName = process.env.COMPANY_DISPLAY_NAME?.trim() || 'PINEBLOOM PACKING';
  private static readonly T: Record<'es' | 'en', {
    // Recepción
    recTitle: string; recSubtitle: string;
    recCtx: string; recDetail: string; recDetailSub: string;
    recColVariedad: string; recColTipoFruta: string;
    recColPesoNeto: string; recColObs: string;
    recSinLineas: string; recTotalLb: string;
    recFooter: string;
    recProductor: string; recFecha: string;
    recReferencia: string; recDocumento: string; recMercado: string;
    recEstado: string; recTipoRecepcion: string;
    recTotalesCabecera: string; recBruto: string;
    recNeto: string; recObservaciones: string;
    recCalidad: string; recLote: string;
    // Proceso
    procTitle: string; procSubtitle: string;
    procIdTitle: string; procEnCurso: string;
    procResumenTitle: string; procResumenSub: string;
    procColConcepto: string; procColLb: string; procColPct: string;
    procEntrada: string; procPt: string; procMerma: string;
    procJugo: string; procDesecho: string; procOtros: string;
    procTotalDist: string; procDiff: string;
    procDetCompTitle: string;
    procColComp: string;
    procTarjaVinculada: string;
    procExistencias: string;
    procNota: string;
    procFooter: string;
    procCerrado: string; procAbierto: string;
    // Tag detalle
    tagTitle: string; tagSubtitle: string;
    tagProdLog: string;
    tagOrigenProc: string; tagOrigenProcCont: string;
    tagOrigenSub: string;
    tagColProceso: string; tagColProductor: string;
    tagColCajas: string; tagColPallets: string; tagColNota: string;
    tagSinProcesos: string; tagSinCliente: string;
    tagFooter: string;
    // Tag etiqueta
    tagLabelTitle: string;
    tagLabelFormato: string; tagLabelCajas: string;
    tagLabelCliente: string; tagLabelQr: string;
  }> = {
    es: {
      recTitle: 'Acta de recepción de fruta',
      recSubtitle: 'Documento técnico-operativo — verificación de ingreso',
      recCtx: 'Contexto operativo',
      recDetail: 'Detalle por línea',
      recDetailSub: 'Peso neto por variedad y envase',
      recColVariedad: 'Variedad', recColTipoFruta: 'Tipo fruta / envase',
      recColPesoNeto: 'Peso neto (lb)', recColObs: 'Observaciones',
      recSinLineas: 'Sin líneas en este documento',
      recTotalLb: 'Total lb netas recepcionadas',
      recFooter: 'Documento generado desde el sistema de trazabilidad. Los pesos netos por línea son los registrados en planta al momento de la recepción.',
      recProductor: 'Productor', recFecha: 'Fecha y hora',
      recReferencia: 'Referencia', recDocumento: 'Documento', recMercado: 'Mercado',
      recEstado: 'Estado', recTipoRecepcion: 'Tipo recepción',
      recTotalesCabecera: 'Totales cabecera',
      recBruto: 'Bruto', recNeto: 'Neto',
      recObservaciones: 'Observaciones', recCalidad: 'Cal.',
      recLote: 'Lote',
      procTitle: 'Liquidación técnica de proceso',
      procSubtitle: 'Análisis de distribución — 100% lb de entrada',
      procIdTitle: 'Identificación del proceso',
      procEnCurso: 'Proceso en curso: distribución aún no completada',
      procResumenTitle: 'Resumen de liquidación (lb)',
      procResumenSub: 'Porcentajes sobre lb de entrada',
      procColConcepto: 'Concepto', procColLb: 'Libras',
      procColPct: '% sobre entrada',
      procEntrada: 'Total fruta ingresada (100%)',
      procPt: 'Producto terminado (lb)',
      procMerma: 'Lb merma (operativa + cierre de balance si aplica)',
      procJugo: 'Lb jugo', procDesecho: 'Lb desecho',
      procOtros: 'Otros registros (sobrante / legacy)',
      procTotalDist: 'TOTAL distribuido (suma de conceptos)',
      procDiff: 'Diferencia vs entrada (debe tender a 0 al cerrar)',
      procDetCompTitle: 'Detalle por componente (especie)',
      procColComp: 'Componente',
      procTarjaVinculada: 'Unidad PT vinculada',
      procExistencias: 'Existencias PT que consumen este proceso:',
      procNota: 'Nota',
      procFooter: 'Documento técnico generado desde el sistema de trazabilidad. Conservar junto con la documentación de recepción y despacho correspondiente.',
      procCerrado: 'cerrado', procAbierto: 'abierto',
      tagTitle: 'Certificado de trazabilidad — Unidad PT',
      tagSubtitle: 'Datos de producto y origen por proceso',
      tagProdLog: 'Producto y logística',
      tagOrigenProc: 'Origen por proceso',
      tagOrigenProcCont: 'Origen por proceso (continúa)',
      tagOrigenSub: 'Cajas y pallets por línea de proceso',
      tagColProceso: 'Proceso', tagColProductor: 'Productor',
      tagColCajas: 'Cajas', tagColPallets: 'Pallets línea',
      tagColNota: 'Nota',
      tagSinProcesos: 'Sin procesos vinculados',
      tagSinCliente: 'Sin cliente asignado',
      tagFooter: 'Documento de trazabilidad generado desde el sistema. Conservar para auditoría y despacho.',
      tagLabelTitle: 'UNIDAD PT',
      tagLabelFormato: 'Formato', tagLabelCajas: 'Cajas',
      tagLabelCliente: 'Cliente',
      tagLabelQr: 'Espacio QR\n(próximamente)',
    },
    en: {
      recTitle: 'Fruit reception record',
      recSubtitle: 'Technical-operative document — intake verification',
      recCtx: 'Operative context',
      recDetail: 'Line detail',
      recDetailSub: 'Net weight per variety and container',
      recColVariedad: 'Variety', recColTipoFruta: 'Fruit type / container',
      recColPesoNeto: 'Net weight (lb)', recColObs: 'Observations',
      recSinLineas: 'No lines in this document',
      recTotalLb: 'Total net lbs received',
      recFooter: 'Document generated from the traceability system. Net weights per line are those recorded at the plant at the time of reception.',
      recProductor: 'Producer', recFecha: 'Date and time',
      recReferencia: 'Reference', recDocumento: 'Document', recMercado: 'Market',
      recEstado: 'Status', recTipoRecepcion: 'Reception type',
      recTotalesCabecera: 'Header totals',
      recBruto: 'Gross', recNeto: 'Net',
      recObservaciones: 'Observations', recCalidad: 'Qual.',
      recLote: 'Lot',
      procTitle: 'Process technical settlement',
      procSubtitle: 'Distribution analysis — 100% input lbs',
      procIdTitle: 'Process identification',
      procEnCurso: 'Process in progress: distribution not yet completed',
      procResumenTitle: 'Settlement summary (lbs)',
      procResumenSub: 'Percentages over input lbs',
      procColConcepto: 'Concept', procColLb: 'Pounds',
      procColPct: '% over input',
      procEntrada: 'Total fruit intake (100%)',
      procPt: 'Finished product (lbs)',
      procMerma: 'Waste lbs (operative + balance close if applicable)',
      procJugo: 'Juice lbs', procDesecho: 'Waste lbs',
      procOtros: 'Other records (surplus / legacy)',
      procTotalDist: 'TOTAL distributed (sum of concepts)',
      procDiff: 'Difference vs intake (should tend to 0 at close)',
      procDetCompTitle: 'Detail by component (species)',
      procColComp: 'Component',
      procTarjaVinculada: 'Linked PT unit',
      procExistencias: 'PT stock consuming this process:',
      procNota: 'Note',
      procFooter: 'Technical document generated from the traceability system. Keep together with the corresponding reception and dispatch documentation.',
      procCerrado: 'closed', procAbierto: 'open',
      tagTitle: 'Traceability certificate — PT Unit',
      tagSubtitle: 'Product and origin data by process',
      tagProdLog: 'Product and logistics',
      tagOrigenProc: 'Origin by process',
      tagOrigenProcCont: 'Origin by process (continued)',
      tagOrigenSub: 'Boxes and pallets per process line',
      tagColProceso: 'Process', tagColProductor: 'Producer',
      tagColCajas: 'Boxes', tagColPallets: 'Pallet lines',
      tagColNota: 'Note',
      tagSinProcesos: 'No linked processes',
      tagSinCliente: 'No client assigned',
      tagFooter: 'Traceability document generated from the system. Keep for audit and dispatch.',
      tagLabelTitle: 'PT UNIT',
      tagLabelFormato: 'Format', tagLabelCajas: 'Boxes',
      tagLabelCliente: 'Client',
      tagLabelQr: 'QR space\n(coming soon)',
    },
  };
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
    @InjectDataSource() private readonly dataSource: DataSource,
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

  private drawFooter(
    doc: InstanceType<typeof PDFDocument>,
    x0: number,
    w: number,
    footerText: string,
    emission: string,
    muted: string,
  ): void {
    const margin = DocumentsPdfService.PDF_MARGIN;
    const fy = doc.page.height - margin - 18;
    doc.save();
    doc.moveTo(x0, fy - 8).lineTo(x0 + w, fy - 8)
      .lineWidth(0.5).strokeColor('#dddddd').stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(muted)
      .text(footerText, x0, fy, { width: w * 0.72, align: 'left', lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(muted)
      .text(`${emission}  ·  1/1`, x0, fy, { width: w, align: 'right', lineBreak: false });
    doc.restore();
  }

  async buildReceptionPdf(id: number, lang: 'es' | 'en' = 'es'): Promise<Buffer> {
    await this.resolveCompanyLine();
    const r = await this.traceability.getReception(id);
    const L = DocumentsPdfService.T[lang];

    const translateDocState = (codigo: string | undefined, nombre: string | undefined): string => {
      if (!codigo) return nombre ?? '—';
      const map: Record<string, Record<'es' | 'en', string>> = {
        borrador: { es: 'Borrador', en: 'Draft' },
        confirmado: { es: 'Confirmado', en: 'Confirmed' },
        cerrado: { es: 'Cerrado', en: 'Closed' },
        anulado: { es: 'Anulado', en: 'Voided' },
      };
      return map[codigo.toLowerCase()]?.[lang] ?? nombre ?? codigo;
    };

    const locale = lang === 'en' ? 'en-US' : 'es-AR';
    const fmtDate = (d: Date | string | undefined): string => {
      if (!d) return '—';
      const x = d instanceof Date ? d : new Date(d as string);
      if (Number.isNaN(x.getTime())) return String(d);
      return x.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
    };

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });

    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;
    const ACCENT = '#1a3a5c';
    const MUTED = '#555555';

    // Encabezado
    // Linea de acento superior
    doc.save();
    doc.rect(x0, DocumentsPdfService.PDF_MARGIN - 16, w, 3).fill(ACCENT);
    doc.restore();

    let y = DocumentsPdfService.PDF_MARGIN;

    // Empresa
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(this.companyLine(), x0, y, { width: w, align: 'center' });
    y += 14;

    // Titulo principal
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ACCENT)
      .text(L.recTitle, x0, y, { width: w, align: 'center' });
    y += 24;

    // Subtitulo
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(L.recSubtitle, x0, y, { width: w, align: 'center' });
    y += 10;

    // Linea separadora
    doc.moveTo(x0, y + 8).lineTo(x0 + w, y + 8).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 20;

    // Bloque de metadatos en dos columnas
    const colL = w * 0.5 - 8;
    const colR = w * 0.5 + 8;
    const xR = x0 + w * 0.5 + 8;

    const fecha = fmtDate(r.received_at as Date);
    const estado = translateDocState(r.document_state?.codigo, r.document_state?.nombre);

    const metaLeft = [
      { label: L.recProductor, value: r.producer?.nombre ?? String(r.producer_id ?? '—') },
      { label: L.recFecha, value: fecha },
      { label: L.recMercado, value: r.mercado?.nombre ?? '—' },
    ];
    const metaRight = [
      { label: L.recReferencia, value: r.reference_code ?? '—' },
      { label: L.recDocumento, value: r.document_number ?? '—' },
      { label: L.recEstado, value: estado },
      { label: L.recTipoRecepcion, value: r.reception_type?.nombre ?? '—' },
    ];

    const metaStartY = y;
    const renderMetaCol = (items: { label: string; value: string }[], x: number, maxW: number) => {
      let cy = metaStartY;
      for (const item of items) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
          .text(item.label.toUpperCase(), x, cy, { width: maxW });
        cy += 10;
        doc.font('Helvetica').fontSize(9).fillColor('#111111')
          .text(item.value, x, cy, { width: maxW });
        cy += 14;
      }
      return cy;
    };

    const endL = renderMetaCol(metaLeft, x0, colL);
    const endR = renderMetaCol(metaRight, xR, colR);
    y = Math.max(endL, endR) + 8;

    // Totales cabecera (si existen)
    const grossStr = r.gross_weight_lb != null ? String(r.gross_weight_lb).trim() : '';
    const netStr = r.net_weight_lb != null ? String(r.net_weight_lb).trim() : '';
    const totParts: string[] = [];
    if (grossStr !== '') totParts.push(`${L.recBruto} ${grossStr} lb`);
    if (netStr !== '') totParts.push(`${L.recNeto} ${netStr} lb`);
    if (totParts.length) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(`${L.recTotalesCabecera}: ${totParts.join(' · ')}`, x0, y, { width: w });
      y += 14;
    }
    if (r.notes?.trim()) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(`${L.recObservaciones}: ${r.notes.trim()}`, x0, y, { width: w });
      y += 14;
    }

    doc.moveTo(x0, y + 4).lineTo(x0 + w, y + 4).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 16;

    // Titulo de seccion
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(L.recDetail, x0, y);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(L.recDetailSub, x0, y);
    y += 14;

    // Tabla de lineas
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
        ln.quality_grade?.nombre ? `${L.recCalidad} ${ln.quality_grade.nombre}` : null,
        `${L.recLote} ${ln.lot_code ?? '—'}`,
      ].filter(Boolean).join(' · ');
      tableRows.push([variedad, tipoFruta, `${DocumentsPdfService.qtyAr(net)} lb`, obs]);
    }

    if (!tableRows.length) {
      tableRows.push(['—', '—', '0 lb', L.recSinLineas]);
    }

    y = DocumentsPdfService.renderReceptionLinesTable(
      doc, x0, y, w, colW,
      [L.recColVariedad, L.recColTipoFruta, L.recColPesoNeto, L.recColObs],
      tableRows as [string, string, string, string][],
      8,
    );

    // Total
    y += 4;
    // Caja con fondo acento
    const totalH = 28;
    doc.save();
    doc.rect(x0, y, w, totalH).fill(ACCENT);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
      .text(`${L.recTotalLb}: ${DocumentsPdfService.qtyAr(sumNet)} lb`, x0 + 10, y + 8, { width: w - 20 });
    y += totalH + 16;

    const emission = lang === 'en'
      ? new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
      : new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
    return pdfToBuffer(doc, (d) => this.drawFooter(d, x0, w, L.recFooter, emission, MUTED));
  }

  async buildProcessPdf(id: number, lang: 'es' | 'en' = 'es'): Promise<Buffer> {
    await this.resolveCompanyLine();
    const row = await this.processService.getProcessRowForReport(id);
    const raw = await this.processRepo.findOne({ where: { id } });
    const L = DocumentsPdfService.T[lang];
    const ACCENT = '#1a3a5c';
    const MUTED = '#555555';
    const locale = lang === 'en' ? 'en-US' : 'es-AR';
    const fmtDate = (d: Date | string | undefined): string => {
      if (!d) return '—';
      const x = d instanceof Date ? d : new Date(d as string);
      if (Number.isNaN(x.getTime())) return String(d);
      return x.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
    };

    // Cargar unidades PT generadas en este proceso
    const ptItems = await this.tagItemRepo.find({ where: { process_id: id } });
    const tarjaIds = [...new Set(ptItems.map((i) => Number(i.tarja_id)).filter((x) => x > 0))];
    const ptTags = tarjaIds.length > 0
      ? await this.tagRepo.find({ where: { id: In(tarjaIds) }, select: ['id', 'tag_code', 'format_code', 'total_cajas'] })
      : [];
    const tagById = new Map(ptTags.map((t) => [t.id, t]));

    // Agrupar cajas por formato
    const fmtMap = new Map<string, { cajas: number; tags: string[] }>();
    for (const item of ptItems) {
      const tag = tagById.get(Number(item.tarja_id));
      if (!tag) continue;
      const fmt = tag.format_code?.trim() || '—';
      const cur = fmtMap.get(fmt) ?? { cajas: 0, tags: [] };
      cur.cajas += item.cajas_generadas;
      if (!cur.tags.includes(tag.tag_code)) cur.tags.push(tag.tag_code);
      fmtMap.set(fmt, cur);
    }
    const totalCajasPt = [...fmtMap.values()].reduce((s, v) => s + v.cajas, 0);

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;

    // Encabezado
    doc.save();
    doc.rect(x0, DocumentsPdfService.PDF_MARGIN - 16, w, 3).fill(ACCENT);
    doc.restore();
    let y = DocumentsPdfService.PDF_MARGIN;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(this.companyLine(), x0, y, { width: w, align: 'center' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ACCENT)
      .text(L.procTitle, x0, y, { width: w, align: 'center' });
    y += 24;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(L.procSubtitle, x0, y, { width: w, align: 'center' });
    y += 10;
    doc.moveTo(x0, y + 8).lineTo(x0 + w, y + 8).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 20;

    // Metadatos en dos columnas
    const colL = w * 0.5 - 8;
    const colR = w * 0.5 - 8;
    const xR = x0 + w * 0.5 + 8;
    const metaLeft = [
      {
        label: lang === 'en' ? 'PRODUCER' : 'PRODUCTOR',
        value: row.productor_nombre ?? String(row.productor_id ?? '—'),
      },
      {
        label: lang === 'en' ? 'DATE AND TIME' : 'FECHA Y HORA',
        value: fmtDate(row.fecha_proceso as Date | string),
      },
      {
        label: lang === 'en' ? 'SPECIES / VARIETY' : 'ESPECIE / VARIEDAD',
        value: `${row.especie_nombre ?? '—'} / ${row.variedad_nombre ?? '—'}`,
      },
    ];
    const metaRight = [
      {
        label: lang === 'en' ? 'LINKED RECEPTION' : 'RECEPCIÓN VINCULADA',
        value: String(row.recepcion_id ?? '—'),
      },
      {
        label: lang === 'en' ? 'PROCESS STATUS' : 'ESTADO PROCESO',
        value: row.process_status ?? '—',
      },
      {
        label: lang === 'en' ? 'SETTLEMENT BALANCE' : 'BALANCE LIQUIDACIÓN',
        value: row.balance_closed ? L.procCerrado : L.procAbierto,
      },
    ];
    const metaStartY = y;
    const renderMetaCol = (items: { label: string; value: string }[], x: number, maxW: number) => {
      let cy = metaStartY;
      for (const item of items) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
          .text(item.label, x, cy, { width: maxW });
        cy += 10;
        doc.font('Helvetica').fontSize(9).fillColor('#111111')
          .text(item.value, x, cy, { width: maxW });
        cy += 14;
      }
      return cy;
    };
    const endL = renderMetaCol(metaLeft, x0, colL);
    const endR = renderMetaCol(metaRight, xR, colR);
    y = Math.max(endL, endR) + 4;

    if (!row.balance_closed) {
      doc.save();
      doc.rect(x0, y, w, 22).fill('#fff8e1');
      doc.restore();
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#7a5c00')
        .text(L.procEnCurso, x0 + 8, y + 6, { width: w - 16 });
      y += 28;
    }

    doc.moveTo(x0, y + 4).lineTo(x0 + w, y + 4).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 16;

    // KPIs de packout
    const ent = Number(row.entrada_lb_basis ?? row.lb_entrada ?? row.peso_procesado_lb) || 0;
    const emp = Number(row.lb_packout_planned ?? 0);
    const packoutPct = ent > 0 ? (emp / ent * 100) : 0;
    const mermaPlanta = Number(row.merma_lb ?? raw?.merma_lb ?? 0);
    const mermaBal = raw?.lb_merma_balance != null ? Number(raw.lb_merma_balance) : 0;
    const mermaTot = mermaPlanta + mermaBal;
    const mermaPct = ent > 0 ? (mermaTot / ent * 100) : 0;

    const kpiW = (w - 16) / 3;
    const kpiH = 52;
    const kpis = [
      { label: lang === 'en' ? 'INPUT (LBS)' : 'ENTRADA (LBS)', value: `${DocumentsPdfService.qtyAr(ent)} lb`, sub: '100%' },
      { label: lang === 'en' ? 'PACKOUT' : 'PACKOUT PT', value: `${DocumentsPdfService.qtyAr(emp)} lb`, sub: `${packoutPct.toFixed(1).replace('.', ',')}%` },
      { label: lang === 'en' ? 'WASTE' : 'MERMA', value: `${DocumentsPdfService.qtyAr(mermaTot)} lb`, sub: `${mermaPct.toFixed(1).replace('.', ',')}%` },
    ];
    for (let ki = 0; ki < kpis.length; ki++) {
      const kx = x0 + ki * (kpiW + 8);
      doc.save();
      doc.rect(kx, y, kpiW, kpiH).fill(ki === 1 ? ACCENT : '#f0f4f8');
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(ki === 1 ? '#ffffff' : MUTED)
        .text(kpis[ki].label, kx + 8, y + 8, { width: kpiW - 16 });
      doc.font('Helvetica-Bold').fontSize(14).fillColor(ki === 1 ? '#ffffff' : ACCENT)
        .text(kpis[ki].sub, kx + 8, y + 18, { width: kpiW - 16 });
      doc.font('Helvetica').fontSize(8).fillColor(ki === 1 ? '#c8d8e8' : MUTED)
        .text(kpis[ki].value, kx + 8, y + 36, { width: kpiW - 16 });
    }
    y += kpiH + 16;

    // Tabla distribucion
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(L.procResumenTitle, x0, y);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(L.procResumenSub, x0, y);
    y += 14;

    const jugo = Number(row.lb_jugo ?? raw?.lb_jugo ?? 0);
    const desecho = Number(row.lb_desecho ?? raw?.lb_desecho ?? 0);
    const otrosReg = Number(row.lb_sobrante ?? raw?.lb_sobrante ?? 0);
    const colW = [w * 0.52, w * 0.24, w * 0.24];
    const mainRows: string[][] = [
      [L.procEntrada, `${DocumentsPdfService.qtyAr(ent)} lb`, '100,00 %'],
      [L.procPt, `${DocumentsPdfService.qtyAr(emp)} lb`, `${packoutPct.toFixed(2).replace('.', ',')} %`],
      [L.procMerma, `${DocumentsPdfService.qtyAr(mermaTot)} lb`, `${mermaPct.toFixed(2).replace('.', ',')} %`],
    ];
    if (jugo > 0) mainRows.push([L.procJugo, `${DocumentsPdfService.qtyAr(jugo)} lb`, `${DocumentsPdfService.pctOf(ent, jugo)} %`]);
    if (desecho > 0) mainRows.push([L.procDesecho, `${DocumentsPdfService.qtyAr(desecho)} lb`, `${DocumentsPdfService.pctOf(ent, desecho)} %`]);
    if (Math.abs(otrosReg) > 0.001) {
      mainRows.push([L.procOtros, `${DocumentsPdfService.qtyAr(otrosReg)} lb`, `${DocumentsPdfService.pctOf(ent, otrosReg)} %`]);
    }
    const sumMain = emp + mermaTot + jugo + desecho + (Math.abs(otrosReg) > 0.001 ? otrosReg : 0);
    const diff = ent - sumMain;
    mainRows.push([L.procTotalDist, `${DocumentsPdfService.qtyAr(sumMain)} lb`, `${DocumentsPdfService.pctOf(ent, sumMain)} %`]);
    mainRows.push([L.procDiff, `${DocumentsPdfService.qtyAr(diff)} lb`, `${DocumentsPdfService.pctOf(ent, diff)} %`]);
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
      [L.procColConcepto, L.procColLb, L.procColPct],
      mainRows,
      { fs: 8, rowHeight: 16, rowStyles },
    );

    // Componentes (solo si existen)
    const comps = row.components ?? [];
    if (comps.length) {
      y += 4;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT).text(L.procDetCompTitle, x0, y);
      y += 14;
      const crRows: string[][] = comps.map((c: { nombre: string; lb_value: unknown; pct_of_entrada: unknown }) => [
        c.nombre,
        `${DocumentsPdfService.qtyAr(Number(c.lb_value))} lb`,
        c.pct_of_entrada != null ? `${c.pct_of_entrada} %` : '—',
      ]);
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, colW,
        [L.procColComp, L.procColLb, L.procColPct], crRows, { fs: 8, rowHeight: 14 });
    }

    // PT generado por formato
    if (fmtMap.size > 0) {
      y += 8;
      doc.moveTo(x0, y).lineTo(x0 + w, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
      y += 12;
      const ptTitle = lang === 'en' ? 'PT generated by format' : 'PT generado por formato';
      const ptSub = lang === 'en'
        ? `${totalCajasPt} boxes total across ${ptTags.length} PT unit(s)`
        : `${totalCajasPt} cajas totales en ${ptTags.length} unidad(es) PT`;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(ptTitle, x0, y);
      y += 14;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(ptSub, x0, y);
      y += 12;
      const ptColW = [w * 0.28, w * 0.16, w * 0.56];
      const ptHeader = lang === 'en'
        ? ['Format', 'Boxes', 'PT units']
        : ['Formato', 'Cajas', 'Unidades PT'];
      const ptRows: string[][] = [...fmtMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([fmt, val]) => [fmt, DocumentsPdfService.qtyAr(val.cajas), val.tags.join(', ')]);
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, ptColW, ptHeader, ptRows,
        { fs: 8, rowHeight: 14, wrap: true });
    }

    // Nota
    const notaTxt = row.nota?.trim() || '—';
    y += 8;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text(`${L.procNota}:`, x0, y);
    y += 11;
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
      .text(notaTxt, x0 + 4, y, { width: w - 4 });
    y += Math.max(16, doc.heightOfString(notaTxt, { width: w - 4 }) + 6);

    const emission = new Date().toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
    return pdfToBuffer(doc, (d) => this.drawFooter(d, x0, w, L.procFooter, emission, MUTED));
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
  async buildTagDetailPdf(id: number, lang: 'es' | 'en' = 'es'): Promise<Buffer> {
    await this.resolveCompanyLine();
    const t = await this.tagRepo.findOne({ where: { id }, relations: ['client', 'brand'] });
    if (!t) throw new NotFoundException('Unidad PT no encontrada');
    const items = await this.tagItemRepo.find({ where: { tarja_id: id } });
    const producerIds = Array.from(new Set(items.map((it) => Number(it.productor_id)).filter((v) => Number.isFinite(v) && v > 0)));
    const producers = producerIds.length > 0 ? await this.producerRepo.find({ where: { id: In(producerIds) } }) : [];
    const producerById = new Map(producers.map((p) => [p.id, p.nombre?.trim() || p.codigo?.trim() || String(p.id)]));

    const L = DocumentsPdfService.T[lang];
    const ACCENT = '#1a3a5c';
    const MUTED = '#555555';
    const locale = lang === 'en' ? 'en-US' : 'es-AR';

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const w = doc.page.width - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;

    // Encabezado
    doc.save();
    doc.rect(x0, DocumentsPdfService.PDF_MARGIN - 16, w, 3).fill(ACCENT);
    doc.restore();
    let y = DocumentsPdfService.PDF_MARGIN;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(this.companyLine(), x0, y, { width: w, align: 'center' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ACCENT)
      .text(L.tagTitle, x0, y, { width: w, align: 'center' });
    y += 24;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(L.tagSubtitle, x0, y, { width: w, align: 'center' });
    y += 10;
    doc.moveTo(x0, y + 8).lineTo(x0 + w, y + 8).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 20;

    // Hero block (codigo unidad PT)
    const clientLabel = t.client?.nombre?.trim() ? t.client.nombre : L.tagSinCliente;
    const heroH = 64;
    doc.save();
    doc.rect(x0, y, w, heroH).fill('#f0f4f8');
    doc.strokeColor('#c8d8e8').lineWidth(0.5).rect(x0, y, w, heroH).stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ACCENT)
      .text(t.tag_code, x0 + 14, y + 10, { width: w - 28 });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(`${clientLabel} · ${t.total_cajas} ${lang === 'en' ? 'boxes' : 'cajas'} · ${t.format_code}`, x0 + 14, y + 40, { width: w - 28 });
    y += heroH + 14;

    // Metadatos en dos columnas
    const colL = w * 0.5 - 8;
    const colR = w * 0.5 - 8;
    const xR = x0 + w * 0.5 + 8;
    const bolLabel = t.bol?.trim() ? t.bol.trim() : '—';
    const brandLabel = t.brand?.nombre?.trim() ? t.brand.nombre : '—';
    const metaLeft = [
      { label: lang === 'en' ? 'DATE' : 'FECHA', value: new Date(t.fecha).toLocaleString(locale, { dateStyle: 'long' }) },
      { label: lang === 'en' ? 'CLIENT' : 'CLIENTE', value: clientLabel },
      { label: lang === 'en' ? 'FORMAT' : 'FORMATO', value: t.format_code },
    ];
    const metaRight = [
      {
        label: lang === 'en' ? 'BOXES / PALLETS' : 'CAJAS / PALLETS',
        value: `${t.total_cajas} / ${t.total_pallets}`,
      },
      { label: lang === 'en' ? 'BOL / REFERENCE' : 'BOL / REFERENCIA', value: bolLabel },
      { label: lang === 'en' ? 'BRAND' : 'MARCA', value: brandLabel },
      { label: lang === 'en' ? 'NET WEIGHT (LB)' : 'PESO NETO (LB)', value: String(t.net_weight_lb ?? '—') },
    ];
    const metaStartY = y;
    const renderMetaCol = (itms: { label: string; value: string }[], x: number, maxW: number) => {
      let cy = metaStartY;
      for (const item of itms) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(item.label, x, cy, { width: maxW });
        cy += 10;
        doc.font('Helvetica').fontSize(9).fillColor('#111111').text(item.value, x, cy, { width: maxW });
        cy += 14;
      }
      return cy;
    };
    const endL = renderMetaCol(metaLeft, x0, colL);
    const endR = renderMetaCol(metaRight, xR, colR);
    y = Math.max(endL, endR) + 4;

    doc.moveTo(x0, y + 4).lineTo(x0 + w, y + 4).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 16;

    // Tabla origen por proceso
    const tw = [w * 0.12, w * 0.2, w * 0.15, w * 0.15, w * 0.38];
    const headerOrig = [L.tagColProceso, L.tagColProductor, L.tagColCajas, L.tagColPallets, L.tagColNota];
    const origRowsAll: string[][] = items.length > 0
      ? items.map((it) => [
        String(it.process_id),
        producerById.get(Number(it.productor_id)) ?? String(it.productor_id ?? '—'),
        String(it.cajas_generadas),
        String(it.pallets_generados),
        '—',
      ])
      : [['—', '—', '—', '—', L.tagSinProcesos]];

    const chunkSize = 24;
    for (let i = 0; i < origRowsAll.length; i += chunkSize) {
      if (i > 0) { doc.addPage(); y = DocumentsPdfService.PDF_MARGIN; }
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
        .text(i === 0 ? L.tagOrigenProc : L.tagOrigenProcCont, x0, y);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(L.tagOrigenSub, x0, y + 14);
      y += 30;
      const chunk = origRowsAll.slice(i, i + chunkSize);
      y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, tw, headerOrig, chunk, { fs: 8, rowHeight: 14, wrap: true });
    }

    const emission = new Date().toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
    return pdfToBuffer(doc, (d) => this.drawFooter(d, x0, w, L.tagFooter, emission, MUTED));
  }

  /** Etiqueta operativa (4×6 in aprox.) — QR con BOL o código de unidad. */
  async buildTagLabelPdf(id: number, lang: 'es' | 'en' = 'es'): Promise<Buffer> {
    await this.resolveCompanyLine();
    const t = await this.tagRepo.findOne({
      where: { id },
      relations: ['client', 'brand'],
    });
    if (!t) throw new NotFoundException('Unidad PT no encontrada');

    const L = DocumentsPdfService.T[lang];
    const clientName = t.client?.nombre?.trim() ? t.client.nombre : L.tagSinCliente;
    const brandName = t.brand?.nombre?.trim() ? t.brand.nombre : null;
    const bolValue = t.bol?.trim() || null;

    // Generar QR del BOL (o tag_code si no hay BOL)
    const qrContent = bolValue ?? t.tag_code;
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      width: 160, margin: 1, errorCorrectionLevel: 'M',
    });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    // Etiqueta 4×6 in = 288×432 pt
    const doc = new PDFDocument({ margin: 16, size: [288, 432] });
    const PW = 256; // ancho útil
    const x0 = 16;

    // Franja superior de acento
    const ACCENT = '#1a3a5c';
    doc.save();
    doc.rect(0, 0, 288, 6).fill(ACCENT);
    doc.restore();

    let y = 18;

    // Empresa
    doc.font('Helvetica').fontSize(7).fillColor('#555555')
      .text(this.companyLine(), x0, y, { width: PW, align: 'center' });
    y += 12;

    // Titulo PT UNIT
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
      .text(L.tagLabelTitle, x0, y, { width: PW, align: 'center' });
    y += 16;

    // Codigo de unidad PT (protagonista)
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111')
      .text(t.tag_code, x0, y, { width: PW, align: 'center' });
    y += 28;

    // Separador
    doc.moveTo(x0, y).lineTo(x0 + PW, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 8;

    // Datos en dos columnas
    const colW2 = PW / 2 - 4;
    const renderField = (label: string, value: string, x: number, startY: number): number => {
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#555555')
        .text(label.toUpperCase(), x, startY, { width: colW2, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor('#111111')
        .text(value, x, startY + 9, { width: colW2 });
      return startY + 24;
    };

    const fieldStartY = y;
    renderField(L.tagLabelFormato, t.format_code, x0, fieldStartY);
    renderField(L.tagLabelCajas, String(t.total_cajas), x0 + colW2 + 8, fieldStartY);
    y = fieldStartY + 26;

    renderField(L.tagLabelCliente, clientName, x0, y);
    y += 26;

    if (brandName) {
      const brandLabel = lang === 'en' ? 'BRAND' : 'MARCA';
      renderField(brandLabel, brandName, x0, y);
      y += 26;
    }

    if (bolValue) {
      const bolLabel = 'BOL';
      renderField(bolLabel, bolValue, x0, y);
      y += 26;
    }

    // Separador
    doc.moveTo(x0, y).lineTo(x0 + PW, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 10;

    // QR centrado
    const qrSize = 110;
    const qrX = x0 + (PW - qrSize) / 2;
    doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
    y += qrSize + 6;

    // Texto bajo QR
    doc.font('Helvetica').fontSize(7).fillColor('#555555')
      .text(bolValue ?? t.tag_code, x0, y, { width: PW, align: 'center' });
    y += 12;
    doc.font('Helvetica').fontSize(6.5).fillColor('#888888')
      .text(lang === 'en' ? 'Scan to verify BOL / PT unit' : 'Escanear para verificar BOL / unidad PT',
        x0, y, { width: PW, align: 'center' });

    // Franja inferior
    doc.save();
    doc.rect(0, 420, 288, 12).fill(ACCENT);
    doc.restore();

    return pdfToBuffer(doc);
  }

  /**
   * Etiqueta operativa para pallet en existencias (corner board / PF-…).
   * Si hay una sola unidad PT vinculada (p. ej. tras repaletizaje), usa la misma etiqueta 4×6 que pt-tags.
   */
  async buildFinalPalletLabelPdf(id: number, lang: 'es' | 'en' = 'es'): Promise<Buffer> {
    const fpHead = await this.fpRepo.findOne({ where: { id }, select: ['id', 'tarja_id'] });
    const palletTarjaId =
      fpHead?.tarja_id != null && Number(fpHead.tarja_id) > 0 ? Number(fpHead.tarja_id) : null;
    if (palletTarjaId != null) {
      return this.buildTagLabelPdf(palletTarjaId, lang);
    }

    const trMap = await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds([id]);
    const tarjaIds = trMap.get(id)?.tarja_ids ?? [];
    if (tarjaIds.length === 1) {
      return this.buildTagLabelPdf(tarjaIds[0], lang);
    }

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

  async buildBolPdf(dispatchId: number, lang: 'es' | 'en' = 'en'): Promise<Buffer> {
    await this.resolveCompanyLine();
    const dispatch = await this.dispatchRepo.findOne({
      where: { id: dispatchId },
      relations: { client: true },
    });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');

    const pedidoCliente = await this.clientRepo.findOne({ where: { id: Number(dispatch.cliente_id) } });
    const plLinks      = await this.dispatchPlRepo.find({
      where: { dispatch_id: dispatchId },
      relations: { pt_packing_list: true },
    });
    const plCodes = plLinks.map((l) => l.pt_packing_list?.list_code).filter((c): c is string => !!c);

    const ACCENT = '#1a3a5c';
    const MUTED  = '#555555';
    const locale = lang === 'en' ? 'en-US' : 'es-AR';
    const fmtDate = (d: Date | string | undefined): string => {
      if (!d) return '—';
      const x = d instanceof Date ? d : new Date(d as string);
      if (Number.isNaN(x.getTime())) return String(d);
      return x.toLocaleString(locale, { dateStyle: 'long' });
    };

    const doc = new PDFDocument({ margin: DocumentsPdfService.PDF_MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const w  = doc.page.width  - 2 * DocumentsPdfService.PDF_MARGIN;
    const x0 = DocumentsPdfService.PDF_MARGIN;

    // ── Franja superior ──
    doc.save();
    doc.rect(x0, DocumentsPdfService.PDF_MARGIN - 16, w, 3).fill(ACCENT);
    doc.restore();
    let y = DocumentsPdfService.PDF_MARGIN;

    // ── Encabezado ──
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
       .text(this.companyLine(), x0, y, { width: w, align: 'center' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(ACCENT)
       .text(lang === 'en' ? 'STRAIGHT BILL OF LADING' : 'GUÍA DE DESPACHO', x0, y, { width: w, align: 'center' });
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
       .text(lang === 'en' ? 'FOR EXEMPT COMMODITIES — Original Not Negotiable' : 'Documento logístico — no negociable', x0, y, { width: w, align: 'center' });
    y += 10;
    doc.moveTo(x0, y + 6).lineTo(x0 + w, y + 6).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 18;

    // ── Bloque shipper / consignee en dos columnas ──
    const colW2 = w / 2 - 8;
    const xR    = x0 + w / 2 + 8;
    const renderField = (label: string, value: string, x: number, startY: number, maxW: number): number => {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
         .text(label.toUpperCase(), x, startY, { width: maxW });
      doc.font('Helvetica').fontSize(9).fillColor('#111111')
         .text(value, x, startY + 9, { width: maxW });
      return startY + 26;
    };

    const shipperAddr = `${this.companyLine()}`;
    const dispatchExt = dispatch as unknown as { ship_to_name?: string | null; ship_to_address?: string | null };
    const shipToName    = dispatchExt.ship_to_name?.trim()    || dispatch.client?.nombre?.trim() || '—';
    const shipToAddress = dispatchExt.ship_to_address?.trim() || '';
    const soldToName  = pedidoCliente?.nombre?.trim() ?? shipToName;

    const fieldStartY = y;
    renderField(lang === 'en' ? 'Shipper (From)' : 'Remitente', shipperAddr, x0, fieldStartY, colW2);
    renderField(
      lang === 'en' ? 'Ship To (Consignee)' : 'Destinatario',
      shipToAddress ? `${shipToName}\n${shipToAddress}` : shipToName,
      xR, fieldStartY, colW2,
    );
    y = fieldStartY + 28;

    renderField(lang === 'en' ? 'Sold To' : 'Facturado a', soldToName, x0, y, colW2);
    renderField('BOL / Reference', dispatch.numero_bol ?? '—', xR, y, colW2);
    y += 28;

    const fechaStr = fmtDate(dispatch.fecha_despacho);
    renderField(lang === 'en' ? 'Ship Date' : 'Fecha despacho', fechaStr, x0, y, colW2);
    renderField(lang === 'en' ? 'Packing Lists' : 'Packing lists', plCodes.length ? plCodes.join(', ') : '—', xR, y, colW2);
    y += 28;

    if (dispatch.temperatura_f) {
      renderField(lang === 'en' ? 'Maintain Temp (°F)' : 'Temperatura (°F)', String(dispatch.temperatura_f), x0, y, colW2);
    }
    const hasThermograph = dispatch.thermograph_serial?.trim();
    const hasThermographNotes = (dispatch as unknown as { thermograph_notes?: string | null }).thermograph_notes?.trim();
    if (hasThermograph) {
      renderField(
        lang === 'en' ? 'Temperature Recorder' : 'Termógrafo',
        [hasThermograph, hasThermographNotes].filter(Boolean).join(' · '),
        xR, y, colW2,
      );
    } else {
      // Dejar espacio para anotación manual
      renderField(
        lang === 'en' ? 'Temperature Recorder' : 'Termógrafo',
        '____________________',
        xR, y, colW2,
      );
    }
    y += 28;

    doc.moveTo(x0, y).lineTo(x0 + w, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 12;

    // ── Tabla de artículos ──
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
       .text(lang === 'en' ? 'Description of Articles' : 'Descripción de artículos', x0, y);
    y += 14;

    // ── Cargar items: dtiRepo → pt_packing_lists → legacy fp ──────────────
    const dtiItems = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });

    // Resolver tag codes para dtiItems
    const tagIds = [...new Set(dtiItems.map((i) => Number(i.tarja_id)).filter((x) => x > 0))];
    const tags   = tagIds.length > 0
      ? await this.tagRepo.find({ where: { id: In(tagIds) }, select: ['id', 'tag_code', 'format_code'] })
      : [];
    const tagById2 = new Map(tags.map((t) => [t.id, t]));

    // PT packing lists vinculados al despacho
    const ptPlLinks = await this.dispatchPlRepo.find({
      where: { dispatch_id: dispatchId },
      relations: { pt_packing_list: true },
    });
    const ptPlIds = ptPlLinks.map((l) => l.pt_packing_list_id).filter((x) => x != null && Number(x) > 0);

    // Pallets desde PT packing list items
    let ptPlFpIds: number[] = [];
    if (ptPlIds.length > 0) {
      const ptPlItemRows = await this.dataSource.query(
        `SELECT DISTINCT final_pallet_id FROM pt_packing_list_items WHERE packing_list_id = ANY($1::int[])`,
        [ptPlIds],
      ) as Array<{ final_pallet_id: number }>;
      ptPlFpIds = ptPlItemRows.map((r) => Number(r.final_pallet_id)).filter((x) => x > 0);
    }

    // Legacy: final_pallets con dispatch_id directo
    const legacyFpIds: number[] = [];
    if (ptPlFpIds.length === 0) {
      const legacyRows = await this.dataSource.query(
        `SELECT id FROM final_pallets WHERE dispatch_id = $1`,
        [dispatchId],
      ) as Array<{ id: number }>;
      legacyFpIds.push(...legacyRows.map((r) => Number(r.id)));
    }

    const allFpIds = ptPlFpIds.length > 0 ? ptPlFpIds : legacyFpIds;

    const fps = allFpIds.length > 0
      ? await this.fpRepo.find({
          where: { id: In(allFpIds) },
          relations: { presentation_format: true },
        })
      : [];

    const fpTrMap = allFpIds.length > 0
      ? await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds(allFpIds)
      : new Map();

    const useDti = dtiItems.length > 0;
    const colWidths = useDti
      ? [w * 0.18, w * 0.22, w * 0.18, w * 0.14, w * 0.14, w * 0.14]
      : [w * 0.22, w * 0.34, w * 0.16, w * 0.14, w * 0.14, 0];
    const header = useDti
      ? (lang === 'en'
          ? ['Ref.', 'Description', 'Format', 'Boxes', 'Pallets', 'Special Marks']
          : ['Ref.', 'Descripción', 'Formato', 'Cajas', 'Pallets', 'Observaciones'])
      : (lang === 'en'
          ? ['Format', 'Description', '', 'Boxes', 'Pallets', '']
          : ['Formato', 'Descripción', '', 'Cajas', 'Pallets', '']);

    const tableRows: string[][] = [];
    let totalBoxes   = 0;
    let totalPallets = 0;

    if (dtiItems.length > 0) {
      for (const item of dtiItems) {
        const tid  = Number(item.tarja_id);
        const tag  = tid > 0 ? tagById2.get(tid) : undefined;
        const ref  = tag?.tag_code?.trim() ?? `#${item.tarja_id ?? '—'}`;
        const fmt  = tag?.format_code?.trim() ?? '—';
        const desc = lang === 'en' ? 'BLUEBERRIES' : 'ARÁNDANOS';
        const cajas   = Number(item.cajas_despachadas ?? 0);
        const pallets = Number(item.pallets_despachados ?? 0);
        totalBoxes   += cajas;
        totalPallets += pallets;
        tableRows.push([ref, desc, fmt, String(cajas), String(pallets), '']);
      }
    } else if (fps.length > 0) {
      // Agrupar por formato
      const fmtMap = new Map<string, { cajas: number; pallets: number }>();
      for (const fp of fps) {
        const fmt = fp.presentation_format?.format_code?.trim() ?? '—';
        const fpLines = await this.fplLineRepo.find({ where: { final_pallet_id: fp.id } });
        const cajas   = fpLines.reduce((s, l) => s + l.amount, 0);
        const cur = fmtMap.get(fmt) ?? { cajas: 0, pallets: 0 };
        cur.cajas   += cajas;
        cur.pallets += 1;
        fmtMap.set(fmt, cur);
      }
      const desc = lang === 'en' ? 'BLUEBERRIES' : 'ARÁNDANOS';
      for (const [fmt, val] of [...fmtMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        totalBoxes   += val.cajas;
        totalPallets += val.pallets;
        tableRows.push([fmt, desc, '', String(val.cajas), String(val.pallets), '']);
      }
    }

    if (!tableRows.length) {
      tableRows.push(['—', '—', '—', '0', '0', lang === 'en' ? 'No items' : 'Sin ítems']);
    }

    y = DocumentsPdfService.renderPdfTable(doc, x0, y, w, colWidths, header, tableRows,
      { fs: 8, rowHeight: 16, wrap: false });

    // ── Totales ──
    y += 4;
    const totalH = 26;
    doc.save();
    doc.rect(x0, y, w, totalH).fill(ACCENT);
    doc.restore();
    const totalLabel = lang === 'en'
      ? `Total: ${totalBoxes} boxes  ·  ${totalPallets} pallets`
      : `Total: ${totalBoxes} cajas  ·  ${totalPallets} pallets`;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
       .text(totalLabel, x0 + 10, y + 8, { width: w - 20 });
    y += totalH + 16;

    // ── Bloque firmas ──
    doc.moveTo(x0, y).lineTo(x0 + w, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 12;

    const sigW = (w - 16) / 3;
    const sigLabels = lang === 'en'
      ? ["Shipper's Signature", "Driver's Signature", "Driver's License #"]
      : ['Firma remitente', 'Firma conductor', 'Licencia conductor'];

    for (let i = 0; i < 3; i++) {
      const sx = x0 + i * (sigW + 8);
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
         .text(sigLabels[i], sx, y, { width: sigW });
      doc.moveTo(sx, y + 28).lineTo(sx + sigW - 8, y + 28).lineWidth(0.5).strokeColor('#aaaaaa').stroke();
    }
    y += 42;

    // ── Nota legal ──
    const legalNote = lang === 'en'
      ? 'NOTE: Any variance noted by receiver as to quantity, conditions or price must be brought to our attention within 24 hrs. after receipt of goods. No adjustments will be honored unless notified as herein stated.'
      : 'NOTA: Cualquier discrepancia en cantidad, condiciones o precio debe informarse dentro de las 24 hs. de recibida la mercadería. No se aceptarán ajustes fuera de este plazo.';

    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
       .text(legalNote, x0, y, { width: w, align: 'left' });

    this.drawFooter(doc, x0, w,
      lang === 'en' ? 'Straight Bill of Lading — Original Not Negotiable' : 'Guía de despacho',
      new Date().toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }),
      MUTED,
    );
    doc.end();
    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }
}
