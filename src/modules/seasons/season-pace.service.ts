import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Season } from './season.entity';
import type {
  PaceMetricBlock,
  PaceMetricComparison,
  PaceMetricKey,
  PaceSeasonSeries,
  SeasonPaceResult,
} from './season-pace.types';

type DailyRow = { date: string; received_lb: number; packout_lb: number; sold_usd: number; boxes: number };

const METRIC_KEYS: PaceMetricKey[] = ['received_lb', 'packout_lb', 'sold_usd', 'boxes'];
const EMPTY_BLOCK = (): PaceMetricBlock => ({
  received_lb: 0,
  packout_lb: 0,
  sold_usd: 0,
  boxes: 0,
});

@Injectable()
export class SeasonPaceService {
  constructor(
    @InjectRepository(Season) private readonly seasonRepo: Repository<Season>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getPace(): Promise<SeasonPaceResult> {
    const activeSeason = await this.seasonRepo.findOne({
      where: { source: 'system', status: Not('closed') },
      order: { year: 'DESC' },
    });
    if (!activeSeason) {
      throw new NotFoundException('No hay temporada operativa activa');
    }

    const activeYear = activeSeason.year;
    const previousYear = activeYear - 1;
    const yearRange = (y: number) => ({ desde: `${y}-01-01`, hasta: `${y}-12-31` });

    const [activeDay1, previousDay1] = await Promise.all([
      this.day1Live(activeYear),
      this.day1Previous(previousYear),
    ]);

    if (!activeDay1) throw new NotFoundException(`Sin recepciones para temporada activa ${activeYear}`);
    if (!previousDay1) throw new NotFoundException(`Sin recepciones históricas para temporada ${previousYear}`);

    const today = new Date().toISOString().slice(0, 10);
    const currentIsoWeek = this.isoWeek(today);
    const activeRange = yearRange(activeYear);

    const [activeDaily, previousDaily] = await Promise.all([
      this.dailyLive(activeRange.desde, activeRange.hasta),
      this.dailyPrevious(previousYear),
    ]);

    const activeSeries = this.buildSeries(activeYear, activeDay1, activeDaily);
    const previousSeries = this.buildSeries(previousYear, previousDay1, previousDaily);

    const allIsoWeeks = [...activeSeries.weeks, ...previousSeries.weeks].map((w) => w.iso_week);
    const isoWeekMin = allIsoWeeks.length ? Math.min(...allIsoWeeks) : currentIsoWeek;
    const isoWeekMax = allIsoWeeks.length
      ? Math.max(...allIsoWeeks, currentIsoWeek)
      : currentIsoWeek;

    const comparisons = METRIC_KEYS.map((metric) =>
      this.compareMetric(
        metric,
        activeDaily,
        activeDay1,
        today,
        previousSeries,
        currentIsoWeek,
        isoWeekMax,
      ),
    );

    return {
      active_year: activeYear,
      previous_year: previousYear,
      current_iso_week: currentIsoWeek,
      iso_week_min: isoWeekMin,
      iso_week_max: isoWeekMax,
      active: activeSeries,
      previous: previousSeries,
      comparisons,
    };
  }

  private compareMetric(
    metric: PaceMetricKey,
    activeDaily: DailyRow[],
    activeDay1: string,
    today: string,
    previous: PaceSeasonSeries,
    currentIsoWeek: number,
    isoWeekMax: number,
  ): PaceMetricComparison {
    const activeVal = this.sumDailyThroughDate(activeDaily, activeDay1, today, metric);
    const previousVal = this.cumulativeAtIsoWeek(previous, currentIsoWeek, metric);
    const deltaAbs = activeVal - previousVal;
    const deltaPct = previousVal !== 0 ? Number(((deltaAbs / previousVal) * 100).toFixed(2)) : null;

    const prevTotal = previous.totals[metric];
    const isLastWeek = currentIsoWeek >= isoWeekMax;
    let projectedFinal: number | null = null;
    if (previousVal > 0 && !isLastWeek && activeVal >= 0) {
      projectedFinal = Number((activeVal * (prevTotal / previousVal)).toFixed(2));
    }

    return {
      metric,
      active_value: activeVal,
      previous_value: previousVal,
      delta_abs: Number(deltaAbs.toFixed(2)),
      delta_pct: deltaPct,
      projected_final: projectedFinal,
    };
  }

  private sumDailyThroughDate(
    daily: DailyRow[],
    day1: string,
    through: string,
    metric: PaceMetricKey,
  ): number {
    let sum = 0;
    for (const row of daily) {
      if (row.date < day1 || row.date > through) continue;
      sum += row[metric];
    }
    if (metric === 'boxes') return Math.round(sum);
    return Number(sum.toFixed(2));
  }

  private cumulativeAtIsoWeek(
    series: PaceSeasonSeries,
    isoWeek: number,
    metric: PaceMetricKey,
  ): number {
    let best = 0;
    for (const w of series.weeks) {
      if (w.iso_week <= isoWeek) {
        best = w.cumulative[metric];
      }
    }
    return best;
  }

  private buildSeries(year: number, day1: string, daily: DailyRow[]): PaceSeasonSeries {
    const weeklyByIso = new Map<number, PaceMetricBlock>();

    for (const row of daily) {
      const iw = this.isoWeek(row.date);
      const cur = weeklyByIso.get(iw) ?? EMPTY_BLOCK();
      cur.received_lb += row.received_lb;
      cur.packout_lb += row.packout_lb;
      cur.sold_usd += row.sold_usd;
      cur.boxes += row.boxes;
      weeklyByIso.set(iw, cur);
    }

    const isoWeeks = [...weeklyByIso.keys()].sort((a, b) => a - b);
    const weeks = isoWeeks.map((iso_week) => {
      const w = weeklyByIso.get(iso_week)!;
      return {
        iso_week,
        weekly: {
          received_lb: Number(w.received_lb.toFixed(2)),
          packout_lb: Number(w.packout_lb.toFixed(2)),
          sold_usd: Number(w.sold_usd.toFixed(2)),
          boxes: Math.round(w.boxes),
        },
        cumulative: EMPTY_BLOCK(),
      };
    });

    let acc = EMPTY_BLOCK();
    for (const pt of weeks) {
      acc = {
        received_lb: Number((acc.received_lb + pt.weekly.received_lb).toFixed(2)),
        packout_lb: Number((acc.packout_lb + pt.weekly.packout_lb).toFixed(2)),
        sold_usd: Number((acc.sold_usd + pt.weekly.sold_usd).toFixed(2)),
        boxes: Math.round(acc.boxes + pt.weekly.boxes),
      };
      pt.cumulative = { ...acc };
    }

    const totals = weeks.length ? { ...weeks[weeks.length - 1].cumulative } : EMPTY_BLOCK();

    return {
      season_year: year,
      day1,
      start_iso_week: this.isoWeek(day1),
      weeks,
      totals,
    };
  }

  /** ISO 8601 week number (1–53). */
  isoWeek(dateStr: string): number {
    const d = new Date(`${dateStr}T12:00:00`);
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = d.getTime();
    const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const jan4Day = (jan4.getUTCDay() + 6) % 7;
    jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
    return 1 + Math.round((firstThursday - jan4.getTime()) / 604_800_000);
  }

  private async day1Live(year: number): Promise<string | null> {
    const rows = (await this.dataSource.query(
      `
      SELECT MIN((r.received_at)::date)::text AS day1
      FROM receptions r
      WHERE r.producer_id IS NOT NULL
        AND r.producer_id > 0
        AND r.document_state_id IN (
          SELECT id FROM document_states WHERE codigo IN ('confirmado', 'cerrado')
        )
        AND (r.received_at)::date >= $1::date
        AND (r.received_at)::date <= $2::date
      `,
      [`${year}-01-01`, `${year}-12-31`],
    )) as Array<{ day1: string | null }>;
    return rows[0]?.day1 ?? null;
  }

  private async day1Previous(year: number): Promise<string | null> {
    const rows = (await this.dataSource.query(
      `SELECT MIN(reception_date)::text AS day1 FROM season_reception_lines WHERE season_year = $1`,
      [year],
    )) as Array<{ day1: string | null }>;
    return rows[0]?.day1 ?? null;
  }

  private async dailyLive(desde: string, hasta: string): Promise<DailyRow[]> {
    const [received, packout, commercial] = await Promise.all([
      this.dataSource.query(
        `
        SELECT (r.received_at)::date::text AS dt, SUM(r.net_weight_lb::numeric) AS v
        FROM receptions r
        WHERE r.producer_id IS NOT NULL
          AND r.producer_id > 0
          AND r.document_state_id IN (
            SELECT id FROM document_states WHERE codigo IN ('confirmado', 'cerrado')
          )
          AND (r.received_at)::date >= $1::date
          AND (r.received_at)::date <= $2::date
        GROUP BY (r.received_at)::date
        `,
        [desde, hasta],
      ) as Promise<Array<{ dt: string; v: string }>>,
      this.dataSource.query(
        `
        SELECT (fp.fecha_proceso)::date::text AS dt, SUM(COALESCE(fp.lb_packout, 0)::numeric) AS v
        FROM fruit_processes fp
        WHERE fp.deleted_at IS NULL
          AND (fp.fecha_proceso)::date >= $1::date
          AND (fp.fecha_proceso)::date <= $2::date
        GROUP BY (fp.fecha_proceso)::date
        `,
        [desde, hasta],
      ) as Promise<Array<{ dt: string; v: string }>>,
      this.dataSource.query(
        `
        SELECT (d.fecha_despacho)::date::text AS dt,
          SUM(ii.line_subtotal::numeric) AS revenue,
          SUM(COALESCE(ii.cajas, 0)::numeric) AS boxes
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        JOIN dispatches d ON d.id = inv.dispatch_id
        WHERE (d.fecha_despacho)::date >= $1::date
          AND (d.fecha_despacho)::date <= $2::date
        GROUP BY (d.fecha_despacho)::date
        `,
        [desde, hasta],
      ) as Promise<Array<{ dt: string; revenue: string; boxes: string }>>,
    ]);

    return this.mergeDaily({ received, packout, commercial });
  }

  private async dailyPrevious(year: number): Promise<DailyRow[]> {
    const [received, packout, commercial] = await Promise.all([
      this.dataSource.query(
        `
        SELECT reception_date::text AS dt, SUM(net_lb::numeric) AS v
        FROM season_reception_lines
        WHERE season_year = $1 AND quality = 'FRESH'
        GROUP BY reception_date
        `,
        [year],
      ) as Promise<Array<{ dt: string; v: string }>>,
      this.dataSource.query(
        `
        SELECT process_date::text AS dt, SUM(lb_fresh::numeric) AS v
        FROM season_process_lines
        WHERE season_year = $1
        GROUP BY process_date
        `,
        [year],
      ) as Promise<Array<{ dt: string; v: string }>>,
      this.dataSource.query(
        `
        SELECT
          COALESCE(
            ship_date::text,
            (SELECT MAX(ship_date)::text FROM season_settlement_lines WHERE season_year = $1)
          ) AS dt,
          SUM(revenue::numeric) AS revenue,
          SUM(boxes::numeric) AS boxes
        FROM season_settlement_lines
        WHERE season_year = $1
        GROUP BY COALESCE(
          ship_date::text,
          (SELECT MAX(ship_date)::text FROM season_settlement_lines WHERE season_year = $1)
        )
        `,
        [year],
      ) as Promise<Array<{ dt: string; revenue: string; boxes: string }>>,
    ]);

    return this.mergeDaily({ received, packout, commercial });
  }

  private mergeDaily(parts: {
    received: Array<{ dt: string; v: string }>;
    packout: Array<{ dt: string; v: string }>;
    commercial: Array<{ dt: string; revenue: string; boxes: string }>;
  }): DailyRow[] {
    const map = new Map<string, DailyRow>();

    const bump = (dt: string, patch: Partial<DailyRow>) => {
      const cur = map.get(dt) ?? { date: dt, received_lb: 0, packout_lb: 0, sold_usd: 0, boxes: 0 };
      map.set(dt, { ...cur, ...patch, date: dt });
    };

    for (const r of parts.received) {
      bump(r.dt, { received_lb: Number(r.v ?? 0) });
    }
    for (const p of parts.packout) {
      bump(p.dt, { packout_lb: Number(p.v ?? 0) });
    }
    for (const c of parts.commercial) {
      bump(c.dt, { sold_usd: Number(c.revenue ?? 0), boxes: Number(c.boxes ?? 0) });
    }

    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
