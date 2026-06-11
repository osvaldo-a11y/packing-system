import PDFDocument from 'pdfkit';

/** Paleta y utilidades PDF compartidas (liquidación en vivo + histórico temporadas). */
export class ExportPdfLayout {
  static readonly ACCENT = '#1a3a5c';
  static readonly MUTED = '#555555';

  static contentWidth(doc: InstanceType<typeof PDFDocument>): number {
    const m = doc.page.margins;
    return doc.page.width - m.left - m.right;
  }

  static bottomY(doc: InstanceType<typeof PDFDocument>): number {
    return doc.page.height - doc.page.margins.bottom;
  }

  static moneyUsd(n: number): string {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  static qty(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  static clip(s: string, max: number): string {
    const t = s.trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
  }

  static fmtDate(value: string | null | undefined, lang: 'es' | 'en'): string {
    if (!value) return '—';
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  static drawBrandedHeader(
    doc: InstanceType<typeof PDFDocument>,
    opts: {
      company: string;
      title: string;
      subtitle: string;
      metaLeft: Array<{ label: string; value: string }>;
      metaRight: Array<{ label: string; value: string }>;
      note?: string;
    },
  ): number {
    const x0 = doc.page.margins.left;
    const w = ExportPdfLayout.contentWidth(doc);

    doc.save();
    doc.rect(x0, doc.page.margins.top - 16, w, 3).fill(ExportPdfLayout.ACCENT);
    doc.restore();

    let y = doc.page.margins.top;
    doc.font('Helvetica').fontSize(8).fillColor(ExportPdfLayout.MUTED).text(opts.company, x0, y, {
      width: w,
      align: 'center',
    });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ExportPdfLayout.ACCENT).text(opts.title, x0, y, {
      width: w,
      align: 'center',
    });
    y += 24;
    doc.font('Helvetica').fontSize(9).fillColor(ExportPdfLayout.MUTED).text(opts.subtitle, x0, y, {
      width: w,
      align: 'center',
    });
    y += 10;
    doc.moveTo(x0, y + 8).lineTo(x0 + w, y + 8).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 20;

    const colW = w * 0.5 - 8;
    const xR = x0 + w * 0.5 + 8;
    const metaStartY = y;
    const renderMetaCol = (items: Array<{ label: string; value: string }>, x: number, maxW: number) => {
      let cy = metaStartY;
      for (const item of items) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ExportPdfLayout.MUTED).text(item.label.toUpperCase(), x, cy, {
          width: maxW,
        });
        cy += 10;
        doc.font('Helvetica').fontSize(9).fillColor('#111111').text(item.value, x, cy, { width: maxW });
        cy += 14;
      }
      return cy;
    };
    const endL = renderMetaCol(opts.metaLeft, x0, colW);
    const endR = renderMetaCol(opts.metaRight, xR, colW);
    y = Math.max(endL, endR) + 8;

    if (opts.note?.trim()) {
      doc.font('Helvetica').fontSize(8.5).fillColor(ExportPdfLayout.MUTED).text(opts.note.trim(), x0, y, { width: w });
      y += 14;
    }
    doc.moveTo(x0, y + 4).lineTo(x0 + w, y + 4).lineWidth(0.5).strokeColor('#dddddd').stroke();
    y += 16;
    doc.y = y;
    doc.fillColor('#000000');
    return y;
  }

  static drawTotalBar(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
    const x0 = doc.page.margins.left;
    const w = ExportPdfLayout.contentWidth(doc);
    const y = doc.y;
    const totalH = 28;
    doc.save();
    doc.rect(x0, y, w, totalH).fill(ExportPdfLayout.ACCENT);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text(`${label}: ${value}`, x0 + 10, y + 8, {
      width: w - 20,
    });
    doc.y = y + totalH + 12;
    doc.fillColor('#000000');
  }

  static drawDocumentFooters(
    doc: InstanceType<typeof PDFDocument>,
    opts: { footerText: string; emission: string; lang: 'es' | 'en' },
  ): void {
    const w = ExportPdfLayout.contentWidth(doc);
    const left = doc.page.margins.left;
    const pageWord = opts.lang === 'en' ? 'Page' : 'Pág.';
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const footerY = ExportPdfLayout.bottomY(doc) - 18;
      doc.save();
      doc.moveTo(left, footerY - 8).lineTo(left + w, footerY - 8).lineWidth(0.5).strokeColor('#dddddd').stroke();
      doc.restore();
      doc.fontSize(7.5).fillColor(ExportPdfLayout.MUTED);
      doc.text(opts.footerText, left, footerY, { width: w * 0.72, align: 'left', lineBreak: false });
      doc.text(
        `${opts.emission}  ·  ${pageWord} ${i - range.start + 1}/${range.count}`,
        left,
        footerY,
        { width: w, align: 'right', lineBreak: false },
      );
      doc.fillColor('#000000');
    }
  }

  private static hLine(
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

  private static hLineDark(doc: InstanceType<typeof PDFDocument>, x1: number, y: number, x2: number) {
    ExportPdfLayout.hLine(doc, x1, y, x2, { color: '#333333', width: 0.75 });
  }

  private static drawTableRow(
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
    doc.font(font).fontSize(fs).fillColor(opts.textColor ?? '#111111');
    let maxTextH = 0;
    let x = left;
    for (let i = 0; i < columns.length; i++) {
      const cw = columns[i].w * tableWidth;
      const innerW = Math.max(8, cw - padX * 2);
      const h = doc.heightOfString(cells[i] ?? '', { width: innerW, lineGap: 0.5 });
      maxTextH = Math.max(maxTextH, h);
      x += cw;
    }
    const rowHeight = Math.max(fs + 10, padTop + maxTextH + 6);
    x = left;
    for (let i = 0; i < columns.length; i++) {
      const cw = columns[i].w * tableWidth;
      const innerW = Math.max(8, cw - padX * 2);
      doc.text(cells[i] ?? '', x + padX, y + padTop, { width: innerW, align: columns[i].align, lineGap: 0.5 });
      x += cw;
    }
    return rowHeight;
  }

  static drawDataTable(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    columns: Array<{ w: number; header: string; align: 'left' | 'right' | 'center' }>,
    bodyRows: string[][],
    totalRow: string[] | null,
    options?: { titleSize?: number; headerFontSize?: number; bodyFontSize?: number; totalFontSize?: number },
  ) {
    const left = doc.page.margins.left;
    const tw = ExportPdfLayout.contentWidth(doc);
    const titleSize = options?.titleSize ?? 12;
    const headerFs = options?.headerFontSize ?? 9;
    const bodyFs = options?.bodyFontSize ?? 8.5;
    const totalFs = options?.totalFontSize ?? 9;

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(titleSize).fillColor('#000000').text(title, left, doc.y, {
      align: 'left',
      width: tw,
    });
    doc.moveDown(0.35);

    const colMeta = columns.map((c) => ({ w: c.w, align: c.align }));
    const headers = columns.map((c) => c.header);

    const drawHeader = (startY: number) => {
      let y = startY;
      ExportPdfLayout.hLineDark(doc, left, y, left + tw);
      y += 4;
      const h = ExportPdfLayout.drawTableRow(doc, left, y, tw, colMeta, headers, {
        bold: true,
        fontSize: headerFs,
      });
      y += h;
      ExportPdfLayout.hLineDark(doc, left, y, left + tw);
      return y + 2;
    };

    let y = doc.y;
    if (y + 80 > ExportPdfLayout.bottomY(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y = drawHeader(y);

    const pageBreak = (): number => drawHeader(doc.page.margins.top);

    for (const row of bodyRows) {
      if (y + bodyFs + 36 > ExportPdfLayout.bottomY(doc) - 8) {
        y = pageBreak();
      }
      const rowH = ExportPdfLayout.drawTableRow(doc, left, y, tw, colMeta, row, { fontSize: bodyFs });
      y += rowH;
      ExportPdfLayout.hLine(doc, left, y, left + tw);
    }

    if (totalRow && totalRow.length === columns.length) {
      const trh = totalFs + 10;
      if (y + trh + 12 > ExportPdfLayout.bottomY(doc)) {
        y = pageBreak();
      }
      doc.save();
      doc.fillColor('#ececec');
      doc.rect(left, y, tw, trh + 4).fill();
      doc.restore();
      y += 2;
      ExportPdfLayout.drawTableRow(doc, left, y, tw, colMeta, totalRow, {
        bold: true,
        fontSize: totalFs,
      });
      y += trh + 2;
      ExportPdfLayout.hLineDark(doc, left, y, left + tw);
    } else if (bodyRows.length > 0) {
      ExportPdfLayout.hLineDark(doc, left, y, left + tw);
    }

    doc.y = y + 8;
  }

  static async finishPdf(
    doc: InstanceType<typeof PDFDocument>,
    chunks: Buffer[],
  ): Promise<Buffer> {
    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    return Buffer.concat(chunks);
  }
}
