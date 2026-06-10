/**
 * Regenera snapshot 2026 con la lógica vigente (balance + liquidación).
 * Requiere temporada en status "closing".
 */
require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { SeasonsService } = require('../dist/modules/seasons/seasons.service');
  const { SeasonReadService } = require('../dist/modules/seasons/season-read.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const seasons = app.get(SeasonsService);
    const read = app.get(SeasonReadService);

    const before = await read.getOverview(2026);
    console.log('BEFORE overview source:', before.source);
    console.log('PB diff:', before.mass_balance?.by_producer.find((p) => p.producer_name.includes('PINEBLOOM'))?.difference);

    const result = await seasons.generateSnapshot(2026, {}, 'cursor-agent');
    console.log('SNAPSHOT:', JSON.stringify(result.summary, null, 2));

    const after = await read.getOverview(2026);
    console.log('AFTER overview source:', after.source);
    const focus = ['PINEBLOOM', 'K&K', 'JDS'];
    for (const p of after.mass_balance?.by_producer ?? []) {
      if (focus.some((f) => p.producer_name.includes(f.replace('&', '')) || p.producer_name.includes(f))) {
        console.log({
          name: p.producer_name,
          packout: p.lb_packout,
          invoiced: p.lb_invoiced,
          diff: p.difference,
        });
      }
    }
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
