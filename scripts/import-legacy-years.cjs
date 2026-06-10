/**
 * Carga Final Charge 2023/2024 + verificación contra objetivos Fase 2b.
 *
 * Uso:
 *   node scripts/import-legacy-years.cjs 2024
 *   node scripts/import-legacy-years.cjs 2023 2024
 *   node scripts/import-legacy-years.cjs 2024 --fresh
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const MONEY_TOTAL_TOL = 1.0;
const MONEY_PRODUCER_TOL = 0.05;

const TARGETS = {
  2024: {
    line_count: 1294,
    producer_count: 8,
    boxes_total: 137010,
    pounds_total: 1442986.4,
    revenue_total: 3801096.3,
    grower_return_total: 2637298.66,
    by_producer: {
      'PINEBLOOM FARM': { line_count: 743, boxes: 85792, revenue: 2353060.7, grower_return: 1638558.81 },
      'K & K FARMS': { line_count: 145, boxes: 12805, revenue: 406058.5, grower_return: 291025.9 },
      'JDS FARMS': { line_count: 123, boxes: 12812, revenue: 364096.2, grower_return: 259548.51 },
      'JER': { line_count: 108, boxes: 9737, revenue: 264024, grower_return: 175282.71 },
      'FAITH FARMS': { line_count: 64, boxes: 5692, revenue: 163416.5, grower_return: 109346.59 },
      'RENTZ FARMS': { line_count: 57, boxes: 5766, revenue: 142831.4, grower_return: 96215.06 },
      'NUBBINTOWN FARMS': { line_count: 35, boxes: 2745, revenue: 64757, grower_return: 37869.94 },
      'JET FARMS INC': { line_count: 19, boxes: 1661, revenue: 42852, grower_return: 29451.14 },
    },
  },
  2023: {
    line_count: 1145,
    producer_count: 11,
    boxes_total: 108100,
    pounds_total: 1254884.69,
    revenue_total: 3752584,
    grower_return_total: 2794375.82,
    by_producer: {
      'PINEBLOOM FARM': { line_count: 559, boxes: 55490, revenue: 1938257.5, grower_return: 1449111.24 },
      'JDS FARMS': { line_count: 180, boxes: 18059, revenue: 595397.5, grower_return: 442954.11 },
      'RENTZ FARMS': { line_count: 82, boxes: 6141, revenue: 248904, grower_return: 183187.32 },
      'JER': { line_count: 66, boxes: 5752, revenue: 202782, grower_return: 147776 },
      'JIMMY WEBB': { line_count: 52, boxes: 4272, revenue: 142203.5, grower_return: 105581.36 },
      'FAITH FARMS': { line_count: 47, boxes: 4021, revenue: 134473, grower_return: 96952 },
      'RIVERVIEW PLANTATION': { line_count: 47, boxes: 4606, revenue: 161855, grower_return: 123093.54 },
      'NUBBINTOWN FARMS': { line_count: 39, boxes: 3105, revenue: 114446, grower_return: 82859.91 },
      'K & K FARMS': { line_count: 37, boxes: 3531, revenue: 118671, grower_return: 91038.3 },
      'JET FARMS INC': { line_count: 34, boxes: 3015, revenue: 91490.5, grower_return: 68426.77 },
      'LOST CREEK FARMS': { line_count: 2, boxes: 108, revenue: 4104, grower_return: 3395.25 },
    },
  },
};

function moneyClose(a, b, tol) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function verify(year, summary, result) {
  const expected = TARGETS[year];
  if (!expected) return null;
  const actual = summary;
  const producerChecks = expected.by_producer
    ? Object.entries(expected.by_producer).map(([name, exp]) => {
        const row = actual.by_producer.find((p) => p.producer_raw.toUpperCase() === name.toUpperCase());
        if (!row) return { producer_raw: name, ok: false, reason: 'missing' };
        const ok =
          row.line_count === exp.line_count &&
          row.boxes === exp.boxes &&
          moneyClose(row.revenue, exp.revenue, MONEY_PRODUCER_TOL) &&
          moneyClose(row.grower_return, exp.grower_return, MONEY_PRODUCER_TOL);
        return { producer_raw: name, ok, expected: exp, actual: row };
      })
    : [];

  const match =
    actual.line_count === expected.line_count &&
    actual.producer_count === expected.producer_count &&
    actual.boxes_total === expected.boxes_total &&
    moneyClose(actual.pounds_total, expected.pounds_total, MONEY_TOTAL_TOL) &&
    moneyClose(actual.revenue_total, expected.revenue_total, MONEY_TOTAL_TOL) &&
    moneyClose(actual.grower_return_total, expected.grower_return_total, MONEY_TOTAL_TOL) &&
    producerChecks.every((p) => p.ok);

  return {
    expected: {
      line_count: expected.line_count,
      producer_count: expected.producer_count,
      boxes_total: expected.boxes_total,
      pounds_total: expected.pounds_total,
      revenue_total: expected.revenue_total,
      grower_return_total: expected.grower_return_total,
    },
    actual: {
      line_count: actual.line_count,
      producer_count: actual.producer_count,
      boxes_total: actual.boxes_total,
      pounds_total: actual.pounds_total,
      revenue_total: actual.revenue_total,
      grower_return_total: actual.grower_return_total,
    },
    producer_checks: producerChecks.filter((p) => !p.ok),
    match,
    import: {
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors_count: result.errors.length,
      errors_sample: result.errors.slice(0, 10),
      unmapped: result.unmapped,
    },
  };
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fresh = process.argv.includes('--fresh');
const years = args.length ? args.map(Number) : [2024, 2023];

process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;
if (!process.env.DATABASE_URL) {
  console.error('❌ Definí RAILWAY_URL o DATABASE_URL');
  process.exit(1);
}

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { FinalChargeImportService } = require('../dist/modules/seasons/final-charge-import.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const svc = app.get(FinalChargeImportService);
  const out = {};

  try {
    for (const year of years) {
      const filePath = path.join(__dirname, '..', 'data', 'import', `FINAL_CHARGE-SEASON_${year}.xlsx`);
      if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);

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
        console.log(`→ ${year}: purged ${del.rowCount} lines`);
        await c.end();
      }

      console.log(`→ Import ${year}...`);
      const buffer = fs.readFileSync(filePath);
      const result = await svc.importFinalCharge(year, buffer, 'legacy-years-script');
      out[year] = verify(year, result.summary, result);
      console.log(JSON.stringify(out[year], null, 2));
    }
  } finally {
    await app.close();
  }

  console.log('\n=== RESUMEN ===');
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
