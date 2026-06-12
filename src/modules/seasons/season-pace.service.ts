import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Season } from './season.entity';
import type {
  PaceMetricComparison,
  PaceMetricKey,
  PaceSeasonSeries,
  PaceWeekPoint,
  SeasonPaceResult,
} from './season-pace.types';

type DailyRow = { date: string; received_lb: number; packout_lb: number; sold_usd: number; boxes: number };

const METRIC_KEYS: PaceMetricKey[] = ['received_lb', 'packout_lb', 'sold_usd', 'boxes'];

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
    const activeRange = yearRange(activeYear);

    const [activeDaily, previousDaily] = await Promise.all([
      this.dailyLive(activeRange.desde, activeRange.hasta),
      this.dailyPrevious(previousYear),
    ]);

    const activeSeries = this.buildSeries(activeYear, activeDay1, activeDaily);
    const previousSeries = this.buildSeries(previousYear, previousDay1, previousDaily);

    const currentWeek = this.weekIndex(activeDay1, today);
    const maxWeek = Math.max(activeSeries.week_count, previousSeries.week_count, currentWeek);

    const comparisons = METRIC_KEYS.map((metric) =>
      this.compareMetric(metric, activeSeries, previousSeries, currentWeek, maxWeek),
    );

    return {
      active_year: activeYear,
      previous_year: previousYear,
      current_week: currentWeek,
      active: activeSeries,
      previous: previousSeries,
      comparisons,
    };
  }

  private compareMetric(
    metric: PaceMetricKey,
    active: PaceSeasonSeries,
    previous: PaceSeasonSeries,
    currentWeek: number,
    maxWeek: number,
  ): PaceMetricComparison {
    const activeVal = this.cumulativeAt(active.weeks, currentWeek, metric);
    const previousVal = this.cumulativeAt(previous.weeks, currentWeek, metric);
    const deltaAbs = activeVal - previousVal;
    const deltaPct = previousVal !== 0 ? Number(((deltaAbs / previousVal) * 100).toFixed(2)) : null;

    const prevAtCurrent = previousVal;
    const prevTotal = previous.totals[metric];
    const isLastWeek = currentWeek >= maxWeek;
    let projectedFinal: number | null = null;
    if (prevAtCurrent > 0 && !isLastWeek && activeVal >= 0) {
      projectedFinal = Number((activeVal * (prevTotal / prevAtCurrent)).toFixed(2));
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

  private cumulativeAt(weeks: PaceWeekPoint[], weekIndex: number, metric: PaceMetricKey): number {
    if (!weeks.length) return 0;
    const row = weeks.find((w) => w.week_index === weekIndex) ?? weeks[weeks.length - 1];
    if (weekIndex > (weeks[weeks.length - 1]?.week_index ?? 0)) {
      return weeks[weeks.length - 1]?.[metric] ?? 0;
    }
    return row?.[metric] ?? 0;
  }

  private buildSeries(year: number, day1: string, daily: DailyRow[]): PaceSeasonSeries {
    const weekly = new Map<number, DailyRow>();

    for (const row of daily) {
      const wi = this.weekIndex(day1, row.date);
      const cur = weekly.get(wi) ?? { date: row.date, received_lb: 0, packout_lb: 0, sold_usd: 0, boxes: 0 };
      cur.received_lb += row.received_lb;
      cur.packout_lb += row.packout_lb;
      cur.sold_usd += row.sold_usd;
      cur.boxes += row.boxes;
      weekly.set(wi, cur);
    }

    const maxWeek = weekly.size > 0 ? Math.max(...weekly.keys()) : 0;
    const weeks: PaceWeekPoint[] = [];
    let acc = { received_lb: 0, packout_lb: 0, sold_usd: 0, boxes: 0 };

    for (let w = 1; w <= maxWeek; w++) {
      const inc = weekly.get(w);
      if (inc) {
        acc = {
          received_lb: Number((acc.received_lb + inc.received_lb).toFixed(2)),
          packout_lb: Number((acc.packout_lb + inc.packout_lb).toFixed(2)),
          sold_usd: Number((acc.sold_usd + inc.sold_usd).toFixed(2)),
          boxes: Math.round(acc.boxes + inc.boxes),
        };
      }
      weeks.push({ week_index: w, ...acc });
    }

    const totals = weeks.length
      ? { ...weeks[weeks.length - 1] }
      : { received_lb: 0, packout_lb: 0, sold_usd: 0, boxes: 0 };

    return {
      season_year: year,
      day1,
      week_count: maxWeek,
      weeks,
      totals: {
        received_lb: totals.received_lb,
        packout_lb: totals.packout_lb,
        sold_usd: totals.sold_usd,
        boxes: totals.boxes,
      },
    };
  }

  private weekIndex(day1: string, date: string): number {
    const diff = this.daysBetween(day1, date);
    if (diff < 0) return 1;
    return Math.floor(diff / 7) + 1;
  }

  private daysBetween(day1: string, date: string): number {
    const d0 = this.parseDate(day1).getTime();
    const d = this.parseDate(date).getTime();
    return Math.round((d - d0) / 86_400_000);
  }

  private parseDate(s: string): Date {
    return new Date(`${s}T12:00:00`);
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
