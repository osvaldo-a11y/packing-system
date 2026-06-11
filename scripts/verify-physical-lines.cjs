/**
 * Verifica líneas físicas vs season_mass_balance (sin reimportar).
 *
 * Uso: node scripts/verify-physical-lines.cjs [2023|2024|2025|all]
 */
require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;

const arg = process.argv[2] || 'all';
const years =
  arg === 'all'
    ? [2023, 2024, 2025]
    : [Number(arg)].filter((y) => Number.isFinite(y) && y > 0);

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PhysicalLinesImportService } = require('../dist/modules/seasons/physical-lines-import.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(PhysicalLinesImportService);
    const out = [];
    for (const year of years) {
      const v = await svc.verifyAgainstMassBalance(year);
      out.push({ year, ...v });
    }
    console.log(JSON.stringify(out, null, 2));
    const allMatch = out.every((x) => x.match);
    if (!allMatch) process.exit(2);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
