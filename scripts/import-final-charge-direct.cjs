/**
 * Import Final Charge directo (sin HTTP) — usa FinalChargeImportService contra DATABASE_URL.
 *
 * Uso:
 *   node scripts/import-final-charge-direct.cjs 2025 data/import/FINAL_CHARGE-SEASON_2025.xlsx
 *
 * Por defecto usa RAILWAY_URL del .env (solo escribe season_settlement_lines + import_logs).
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const year = Number(process.argv[2] || 2025);
const fileArg = process.argv[3] || 'data/import/FINAL_CHARGE-SEASON_2025.xlsx';
const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(__dirname, '..', fileArg);

process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;
if (!process.env.DATABASE_URL) {
  console.error('❌ Definí RAILWAY_URL o DATABASE_URL en .env');
  process.exit(1);
}

const fresh = process.argv.includes('--fresh');

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { FinalChargeImportService } = require('../dist/modules/seasons/final-charge-import.service');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  if (fresh) {
    const { Client } = require('pg');
    const c = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
    });
    await c.connect();
    const del = await c.query(
      'DELETE FROM season_settlement_lines WHERE season_year = $1 AND source = $2',
      [year, 'legacy_final_charge'],
    );
    console.log(`→ Purged ${del.rowCount} existing lines for season ${year}`);
    await c.end();
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(FinalChargeImportService);
    const result = await svc.importFinalCharge(year, buffer, 'pilot-direct');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
