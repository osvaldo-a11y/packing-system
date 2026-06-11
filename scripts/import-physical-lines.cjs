/**
 * Carga líneas físicas históricas (recepción + procesos) — Base B/C.
 *
 * Uso:
 *   node scripts/import-physical-lines.cjs 2025
 *   node scripts/import-physical-lines.cjs all
 *
 * Archivos en data/import/ (no versionados):
 *   recepciones_<year>.xlsx
 *   procesos_<year>.xlsx
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const arg = process.argv[2] || 'all';
const years =
  arg === 'all'
    ? [2023, 2024, 2025]
    : [Number(arg)].filter((y) => Number.isFinite(y) && y > 0);

process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;
if (!process.env.DATABASE_URL) {
  console.error('❌ Definí RAILWAY_URL o DATABASE_URL');
  process.exit(1);
}

const base = path.join(__dirname, '..', 'data', 'import');

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PhysicalLinesImportService } = require('../dist/modules/seasons/physical-lines-import.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(PhysicalLinesImportService);
    const results = [];

    for (const year of years) {
      const receptionsPath = path.join(base, `recepciones_${year}.xlsx`);
      const processesPath = path.join(base, `procesos_${year}.xlsx`);
      for (const p of [receptionsPath, processesPath]) {
        if (!fs.existsSync(p)) {
          console.error(`❌ Archivo no encontrado: ${p}`);
          process.exit(1);
        }
      }

      const receptions = fs.readFileSync(receptionsPath);
      const processes = fs.readFileSync(processesPath);
      const result = await svc.importPhysicalLines(year, receptions, processes, 'physical-lines-script');
      results.push(result);
      console.log(`\n=== Temporada ${year} ===`);
      console.log(
        JSON.stringify(
          {
            reception_lines_upserted: result.reception_lines_upserted,
            process_lines_upserted: result.process_lines_upserted,
            errors_count: result.errors.length,
            verification: {
              match: result.verification.match,
              counts: {
                reception_lines_total: result.verification.reception_lines_total,
                reception_lines_fresh: result.verification.reception_lines_fresh,
                process_lines: result.verification.process_lines,
              },
              totals: {
                lb_fresh: result.verification.lb_fresh,
                lb_waste: result.verification.lb_waste,
                lb_for_frozen: result.verification.lb_for_frozen,
                lb_processed: result.verification.lb_processed,
                lb_packout: result.verification.lb_packout,
                lb_waste_process: result.verification.lb_waste_process,
              },
              count_match: result.verification.count_match,
              total_match: result.verification.total_match,
              producer_deltas: result.verification.producer_deltas,
            },
          },
          null,
          2,
        ),
      );
    }

    const allMatch = results.every((r) => r.verification.match);
    console.log(`\n${allMatch ? '✅' : '⚠️'} Verificación global: ${allMatch ? 'OK' : 'REVISAR DELTAS'}`);
    if (!allMatch) process.exit(2);
  } finally {
    await app.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
