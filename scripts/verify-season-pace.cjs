/**
 * Verificación Mejora C — ritmo intra-temporada (ancla 2025 última semana).
 */
require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;

const TARGETS_2025 = {
  received_lb: 1614123.61,
  packout_lb: 1354617.6,
  sold_usd: 4556301.38,
  boxes: 143600,
};

function close(a, b, tol = 1) {
  return Math.abs(a - b) <= tol;
}

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { SeasonPaceService } = require('../dist/modules/seasons/season-pace.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(SeasonPaceService);
    const pace = await svc.getPace();

    const prev = pace.previous;
    const last = prev.weeks[prev.weeks.length - 1];
    const totals = prev.totals;

    const info = {
      active_year: pace.active_year,
      previous_year: pace.previous_year,
      current_week: pace.current_week,
      previous_day1: prev.day1,
      previous_week_count: prev.week_count,
      last_week_index: last?.week_index,
      last_week: last,
      totals,
      anchor_match: {
        received_lb: close(last?.received_lb ?? 0, TARGETS_2025.received_lb, 5),
        packout_lb: close(last?.packout_lb ?? 0, TARGETS_2025.packout_lb, 5),
        sold_usd: close(last?.sold_usd ?? 0, TARGETS_2025.sold_usd, 5),
        boxes: last?.boxes === TARGETS_2025.boxes,
      },
      comparisons: pace.comparisons,
    };

    info.match = Object.values(info.anchor_match).every(Boolean);
    console.log(JSON.stringify(info, null, 2));
    if (!info.match) process.exit(1);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
