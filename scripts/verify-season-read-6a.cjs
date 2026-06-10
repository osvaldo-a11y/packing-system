/**
 * Verificación Fase 6a — overviews y compare contra números acordados.
 */
require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_URL;

const TARGETS = {
  2026: { sales: 5060410.0, grower_return: 3869237.17, lb_packout: 1425171.98, source: 'live' },
  2025: { sales: 4556301.38, grower_return: 3440695.32, lb_packout: 1354617.6, source: 'legacy' },
  2024: { sales: 3801096.3, grower_return: 2637298.66, lb_packout: 1442986.4, source: 'legacy' },
  2023: { sales: 3752584.0, grower_return: 2794375.82, lb_packout: 1254918.64, source: 'legacy' },
};

const MONEY_TOL = 0.05;
const LB_TOL = 0.05;

function close(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { SeasonReadService } = require('../dist/modules/seasons/season-read.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(SeasonReadService);
    const overviews = [];
    for (const year of [2026, 2025, 2024, 2023]) {
      const o = await svc.getOverview(year);
      const t = TARGETS[year];
      const ok =
        o.source === t.source &&
        close(o.commercial.sales, t.sales, MONEY_TOL) &&
        close(o.commercial.grower_return, t.grower_return, MONEY_TOL) &&
        close(o.mass_balance.lb_packout, t.lb_packout, LB_TOL) &&
        o.capabilities.fine_traceability === (year === 2026);
      overviews.push({
        year,
        match: ok,
        source: o.source,
        sales: o.commercial.sales,
        grower_return: o.commercial.grower_return,
        lb_packout: o.mass_balance.lb_packout,
        capabilities: o.capabilities,
        expected: t,
      });
    }

    const compare = await svc.compareSeasons('2025,2026');
    const v = compare.variations[0];
    const compareOk =
      v &&
      close(v.sales_delta, 504108.62, MONEY_TOL) &&
      close(v.grower_return_delta, 428541.85, MONEY_TOL);

    const list = await svc.listSeasons();

    console.log(
      JSON.stringify(
        {
          overviews,
          all_overviews_match: overviews.every((x) => x.match),
          compare_2025_2026: { variation: v, match: compareOk },
          season_list: list.map((s) => ({
            year: s.season_year,
            status: s.status,
            source: s.source,
            data_source: s.data_source,
            capabilities: s.capabilities,
          })),
          full_overviews: await Promise.all([2026, 2025, 2024, 2023].map((y) => svc.getOverview(y))),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
