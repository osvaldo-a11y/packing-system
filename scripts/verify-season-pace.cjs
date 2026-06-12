/**
 * Verificación Mejora C — ritmo ISO + campana 2025.
 */
require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;

const CAMPANA_2025 = {
  16: 19259,
  17: 211646,
  18: 268527,
  19: 275511,
  20: 482241,
  21: 312838,
  22: 44102,
};

const TOTALS_2025 = {
  received_lb: 1614123.61,
  packout_lb: 1354617.6,
  sold_usd: 4556301.38,
  boxes: 143600,
};

function close(a, b, tol = 5) {
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

    const campana = {};
    for (const [iw, target] of Object.entries(CAMPANA_2025)) {
      const w = prev.weeks.find((x) => x.iso_week === Number(iw));
      const got = w?.weekly.received_lb ?? 0;
      campana[iw] = { got, target, ok: close(got, target, 10) };
    }

    const last = prev.weeks[prev.weeks.length - 1];
    const cum = last?.cumulative ?? {};

    const info = {
      active_year: pace.active_year,
      previous_year: pace.previous_year,
      current_iso_week: pace.current_iso_week,
      iso_week_range: [pace.iso_week_min, pace.iso_week_max],
      iso_week_range_ok:
        pace.iso_week_min >= 12 &&
        pace.iso_week_max <= 26 &&
        pace.iso_week_max >= pace.current_iso_week,
      previous_start_iso: prev.start_iso_week,
      previous_day1: prev.day1,
      campana_2025_received: campana,
      campana_sum: Object.values(campana).reduce((s, x) => s + x.got, 0),
      cumulative_totals: cum,
      anchor_match: {
        received_lb: close(cum.received_lb, TOTALS_2025.received_lb),
        packout_lb: close(cum.packout_lb, TOTALS_2025.packout_lb),
        sold_usd: close(cum.sold_usd, TOTALS_2025.sold_usd),
        boxes: cum.boxes === TOTALS_2025.boxes,
      },
    };

    info.campana_match = Object.values(campana).every((x) => x.ok);
    info.match =
      info.campana_match &&
      Object.values(info.anchor_match).every(Boolean) &&
      info.iso_week_range_ok;
    console.log(JSON.stringify(info, null, 2));
    if (!info.match) process.exit(1);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
