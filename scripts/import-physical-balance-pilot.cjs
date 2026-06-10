/**
 * Balance de masas legacy — recepciones + procesos (+ opcional final pallet).
 *
 * Uso:
 *   node scripts/import-physical-balance-pilot.cjs 2025
 *   node scripts/import-physical-balance-pilot.cjs 2024
 *   node scripts/import-physical-balance-pilot.cjs 2023   // FOR FROZEN + check por rango
 *
 * Archivos esperados en data/import/ (no versionados):
 *   recepciones_<year>.xlsx
 *   procesos_<year>.xlsx
 *   query_final_pallet_<year>.xlsx (opcional)
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const year = Number(process.argv[2] || 2025);
const base = path.join(__dirname, '..', 'data', 'import');
const receptionsPath = path.join(base, `recepciones_${year}.xlsx`);
const processesPath = path.join(base, `procesos_${year}.xlsx`);
const finalPalletPath = path.join(base, `query_final_pallet_${year}.xlsx`);

process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;
if (!process.env.DATABASE_URL) {
  console.error('❌ Definí RAILWAY_URL o DATABASE_URL');
  process.exit(1);
}

for (const p of [receptionsPath, processesPath]) {
  if (!fs.existsSync(p)) {
    console.error(`❌ Archivo no encontrado: ${p}`);
    process.exit(1);
  }
}

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PhysicalBalanceImportService } = require('../dist/modules/seasons/physical-balance-import.service');

  const receptions = fs.readFileSync(receptionsPath);
  const processes = fs.readFileSync(processesPath);
  const finalPallet = fs.existsSync(finalPalletPath) ? fs.readFileSync(finalPalletPath) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(PhysicalBalanceImportService);
    const result = await svc.importPhysicalBalance(year, receptions, processes, 'physical-pilot', finalPallet);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
