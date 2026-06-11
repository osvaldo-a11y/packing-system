/**
 * Verificación exports A+B — full.xlsx conteos y totales 2025/2023.
 */
require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;

const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');

const TARGETS = {
  2025: {
    sales: 4556301.38,
    grower_return: 3440695.32,
    boxes: 143600,
    packout: 1354617.6,
    reception_lines: 155,
    process_lines: 151,
    sales_lines: 1227,
  },
  2023: {
    reception_lines: 275,
    process_lines: 176,
    pinebloom_for_frozen_min: 80000,
  },
};

function close(a, b, tol = 0.05) {
  return Math.abs(a - b) <= tol;
}

function countDataRows(sheet) {
  let n = 0;
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const first = row.getCell(1).value;
    if (first == null || String(first).trim() === '') return;
    if (String(first).includes('Sin líneas') || String(first).includes('No ')) return;
    n++;
  });
  return n;
}

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { SeasonExportService } = require('../dist/modules/seasons/season-export.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(SeasonExportService);
    const outDir = path.join(__dirname, '_export-verify');
    fs.mkdirSync(outDir, { recursive: true });

    for (const lang of ['es', 'en']) {
      for (const year of [2025, 2023]) {
        const { buffer, filename } = await svc.buildFullXlsx(year, lang);
        const fp = path.join(outDir, filename);
        fs.writeFileSync(fp, buffer);

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const summary = wb.getWorksheet(lang === 'en' ? 'Summary' : 'Resumen');
        const reception = wb.getWorksheet(lang === 'en' ? 'Reception' : 'Recepción');
        const processes = wb.getWorksheet(lang === 'en' ? 'Processes' : 'Procesos');
        const sales = wb.getWorksheet(lang === 'en' ? 'Sales' : 'Ventas');

        const info = {
          year,
          lang,
          filename,
          sheets: wb.worksheets.map((s) => s.name),
          reception_rows: reception ? countDataRows(reception) : 0,
          process_rows: processes ? countDataRows(processes) : 0,
          sales_rows: sales ? countDataRows(sales) : 0,
        };

        if (year === 2025 && summary) {
          const totalRow = summary.lastRow;
          const sales = Number(totalRow?.getCell(2).value ?? 0);
          const ret = Number(totalRow?.getCell(3).value ?? 0);
          const boxes = Number(totalRow?.getCell(4).value ?? 0);
          const packout = Number(totalRow?.getCell(8).value ?? 0);
          const t = TARGETS[2025];
          info.totals = { sales, ret, boxes, packout };
          info.match =
            close(sales, t.sales) &&
            close(ret, t.grower_return) &&
            boxes === t.boxes &&
            close(packout, t.packout) &&
            info.reception_rows === t.reception_lines &&
            info.process_rows === t.process_lines &&
            info.sales_rows === t.sales_lines;
        }

        if (year === 2023 && reception) {
          let pineFrozen = 0;
          reception.eachRow((row, i) => {
            if (i === 1) return;
            const prod = String(row.getCell(2).value ?? '');
            const qual = String(row.getCell(4).value ?? '');
            if (prod.includes('PINEBLOOM') && qual.toLowerCase().includes('frozen')) {
              pineFrozen += Number(row.getCell(8).value ?? 0);
            }
          });
          info.pinebloom_for_frozen_lb = pineFrozen;
          info.match =
            info.reception_rows === TARGETS[2023].reception_lines &&
            info.process_rows === TARGETS[2023].process_lines &&
            pineFrozen >= TARGETS[2023].pinebloom_for_frozen_min;
        }

        console.log(JSON.stringify(info, null, 2));
      }

      const pdf = await svc.buildSummaryPdf(2025, lang);
      fs.writeFileSync(path.join(outDir, pdf.filename), pdf.buffer);
      console.log(JSON.stringify({ year: 2025, lang, pdf: pdf.filename, bytes: pdf.buffer.length }));
    }
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
