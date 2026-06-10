import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportSnapshot } from '../reporting/reporting.entities';
import { SeasonMassBalance, SeasonSettlementLine } from './legacy.entities';
import { Season } from './season.entity';
import {
  CommercialOverview,
  CommercialProducerRow,
  MassBalanceOverview,
  MassBalanceProducerRow,
  SeasonCapabilities,
  SeasonCompareResult,
  SeasonDataSource,
  SeasonListItem,
  SeasonOverview,
  SettlementLineFilters,
  YearOverYearVariation,
} from './season-read.types';

type SnapshotPayload = {
  mass_balance?: {
    producers?: Array<Record<string, unknown>>;
    total?: Record<string, unknown>;
  };
  producer_settlement?: {
    producers?: Array<Record<string, unknown>>;
    total?: Record<string, unknown>;
  };
};

@Injectable()
export class SeasonReadService {
  private static readonly SNAPSHOT_TYPE = 'season_closing' as const;

  constructor(
    @InjectRepository(Season) private readonly seasonRepo: Repository<Season>,
    @InjectRepository(ReportSnapshot) private readonly snapshotRepo: Repository<ReportSnapshot>,
    @InjectRepository(SeasonSettlementLine) private readonly lineRepo: Repository<SeasonSettlementLine>,
    @InjectRepository(SeasonMassBalance) private readonly massBalanceRepo: Repository<SeasonMassBalance>,
  ) {}

  async listSeasons(): Promise<SeasonListItem[]> {
    const seasons = await this.seasonRepo.find({ order: { year: 'DESC' } });
    const items: SeasonListItem[] = [];
    for (const season of seasons) {
      const dataSource = await this.resolveDataSource(season);
      const capabilities = await this.buildCapabilities(season, dataSource);
      items.push({
        season_year: season.year,
        label: season.label,
        status: season.status,
        source: season.source,
        capabilities,
        data_source: dataSource,
      });
    }
    return items;
  }

  async getOverview(year: number): Promise<SeasonOverview> {
    const season = await this.findSeason(year);
    const dataSource = await this.resolveDataSource(season);
    const capabilities = await this.buildCapabilities(season, dataSource);

    const commercial =
      capabilities.commercial
        ? dataSource === 'snapshot'
          ? await this.commercialFromSnapshot(season)
          : await this.commercialFromLegacy(year)
        : null;

    const mass_balance =
      capabilities.mass_balance
        ? dataSource === 'snapshot'
          ? await this.massBalanceFromSnapshot(season)
          : await this.massBalanceFromLegacy(year)
        : null;

    return {
      season_year: year,
      season_status: season.status,
      season_source: season.source,
      source: dataSource,
      capabilities,
      commercial,
      mass_balance,
      commercial_field_notes:
        dataSource === 'snapshot'
          ? 'grower_return mapea producer_net del snapshot (neto productor, precio objetivo). No es comparable 1:1 con grower_return del Final Charge legacy.'
          : 'grower_return es la suma de grower_return del Final Charge importado.',
    };
  }

  async compareSeasons(yearsParam: string): Promise<SeasonCompareResult> {
    const years = yearsParam
      .split(',')
      .map((y) => Number(y.trim()))
      .filter((y) => Number.isFinite(y) && y > 0);
    if (years.length < 2) {
      throw new NotFoundException('Indique al menos dos años en years= (ej. years=2025,2026)');
    }

    const overviews = await Promise.all(years.map((y) => this.getOverview(y)));
    overviews.sort(
      (a, b) => (b.commercial?.sales ?? 0) - (a.commercial?.sales ?? 0),
    );

    const sortedYears = [...years].sort((a, b) => a - b);
    const variations: YearOverYearVariation[] = [];
    for (let i = 1; i < sortedYears.length; i++) {
      const fromYear = sortedYears[i - 1];
      const toYear = sortedYears[i];
      const from = overviews.find((o) => o.season_year === fromYear);
      const to = overviews.find((o) => o.season_year === toYear);
      if (!from?.commercial || !to?.commercial) continue;
      const salesFrom = from.commercial.sales;
      const salesTo = to.commercial.sales;
      const growerFrom = from.commercial.grower_return;
      const growerTo = to.commercial.grower_return;
      variations.push({
        from_year: fromYear,
        to_year: toYear,
        sales_delta: this.money(salesTo - salesFrom),
        sales_delta_pct: salesFrom !== 0 ? this.pct((salesTo - salesFrom) / salesFrom) : 0,
        grower_return_delta: this.money(growerTo - growerFrom),
        grower_return_delta_pct: growerFrom !== 0 ? this.pct((growerTo - growerFrom) / growerFrom) : 0,
      });
    }

    return { years, overviews, variations };
  }

  async getSettlementLines(year: number, filters: SettlementLineFilters) {
    await this.findSeason(year);
    const params: unknown[] = [year];
    const clauses = ['season_year = $1'];

    const addIlike = (field: string, value: string | undefined, cols: string[]) => {
      if (!value?.trim()) return;
      params.push(`%${value.trim()}%`);
      const idx = params.length;
      const parts = cols.map((c) => `${c} ILIKE $${idx}`);
      clauses.push(`(${parts.join(' OR ')})`);
    };

    if (filters.producer?.trim()) {
      const p = filters.producer.trim();
      if (/^\d+$/.test(p)) {
        params.push(Number(p));
        clauses.push(`producer_id = $${params.length}`);
      } else {
        addIlike('producer', p, ['producer_raw']);
      }
    }
    addIlike('format', filters.format, ['format_code', 'format_raw']);
    addIlike('bol', filters.bol, ['bol']);
    addIlike('variety', filters.variety, ['variety_raw']);
    addIlike('brand', filters.brand, ['brand_raw']);

    const rows = (await this.lineRepo.query(
      `
      SELECT
        id, season_year, producer_id, producer_raw,
        brand_id, brand_raw, variety_id, variety_raw,
        format_code, format_raw, ship_date, pick_type,
        bol, pallet_ref, customer_raw, market_raw,
        boxes, pounds, unit_price, revenue, grower_return,
        pack_fee, material_cost, grade_raw, invoice_ref, notes,
        source_row_no
      FROM season_settlement_lines
      WHERE ${clauses.join(' AND ')}
      ORDER BY producer_raw, source_row_no NULLS LAST, id
      LIMIT 5000
      `,
      params,
    )) as SeasonSettlementLine[];

    return {
      season_year: year,
      filters,
      line_count: rows.length,
      lines: rows.map((r) => ({
        id: Number(r.id),
        producer_id: Number(r.producer_id),
        producer_raw: r.producer_raw,
        brand_raw: r.brand_raw,
        variety_raw: r.variety_raw,
        format_code: r.format_code,
        format_raw: r.format_raw,
        ship_date: r.ship_date,
        bol: r.bol,
        pallet_ref: r.pallet_ref,
        boxes: Number(r.boxes),
        pounds: Number(r.pounds),
        revenue: Number(r.revenue),
        grower_return: Number(r.grower_return),
        pack_fee: Number(r.pack_fee),
        material_cost: Number(r.material_cost),
        source_row_no: r.source_row_no,
      })),
    };
  }

  private async findSeason(year: number): Promise<Season> {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) throw new NotFoundException(`Temporada ${year} no encontrada`);
    return season;
  }

  private async resolveDataSource(season: Season): Promise<SeasonDataSource> {
    const snapshot = await this.snapshotRepo.findOne({
      where: {
        season_id: season.id,
        snapshot_type: SeasonReadService.SNAPSHOT_TYPE,
        is_current: true,
      },
    });
    if (snapshot) return 'snapshot';
    return 'legacy';
  }

  private async buildCapabilities(
    season: Season,
    dataSource: SeasonDataSource,
  ): Promise<SeasonCapabilities> {
    const lineCount = await this.lineRepo.count({ where: { season_year: season.year } });
    const massCount = await this.massBalanceRepo.count({ where: { season_year: season.year } });

    const hasCommercial = dataSource === 'snapshot' || lineCount > 0;
    const hasMass = dataSource === 'snapshot' || massCount > 0;

    return {
      commercial: hasCommercial,
      mass_balance: hasMass,
      commercial_line_detail: lineCount > 0 || dataSource === 'snapshot',
      fine_traceability: season.year === 2026,
    };
  }

  private async getSnapshotPayload(season: Season): Promise<SnapshotPayload> {
    const snapshot = await this.snapshotRepo.findOne({
      where: {
        season_id: season.id,
        snapshot_type: SeasonReadService.SNAPSHOT_TYPE,
        is_current: true,
      },
    });
    if (!snapshot) {
      throw new NotFoundException(`No hay snapshot vigente para la temporada ${season.year}`);
    }
    return snapshot.payload as SnapshotPayload;
  }

  private async commercialFromSnapshot(season: Season): Promise<CommercialOverview> {
    const payload = await this.getSnapshotPayload(season);
    const producers = payload.producer_settlement?.producers ?? [];
    const total = payload.producer_settlement?.total ?? {};

    const by_producer: CommercialProducerRow[] = producers.map((p) => {
      const producerNet = this.num(p.producer_net);
      return {
        producer_id: p.producer_id != null ? Number(p.producer_id) : null,
        producer_name: String(p.producer_name ?? ''),
        sales: this.money(p.sales),
        grower_return: producerNet,
        producer_net: producerNet,
        boxes: this.num(p.boxes),
        pounds: this.lb(p.pounds),
      };
    });

    const producerNetTotal = this.money(total.producer_net ?? by_producer.reduce((s, r) => s + r.producer_net!, 0));

    return {
      sales: this.money(total.sales ?? by_producer.reduce((s, r) => s + r.sales, 0)),
      grower_return: producerNetTotal,
      producer_net: producerNetTotal,
      boxes: this.num(total.boxes ?? by_producer.reduce((s, r) => s + r.boxes, 0)),
      pounds: this.lb(total.pounds ?? by_producer.reduce((s, r) => s + r.pounds, 0)),
      by_producer: by_producer.sort((a, b) => b.sales - a.sales),
    };
  }

  private async massBalanceFromSnapshot(season: Season): Promise<MassBalanceOverview> {
    const payload = await this.getSnapshotPayload(season);
    const producers = payload.mass_balance?.producers ?? [];
    const total = payload.mass_balance?.total ?? {};

    const by_producer: MassBalanceProducerRow[] = producers.map((p) => ({
      producer_id: Number(p.producer_id),
      producer_name: String(p.producer_name ?? ''),
      receptions: this.num(p.receptions),
      lb_received: this.lb(p.lb_received),
      lb_rejected: 0,
      lb_for_frozen: 0,
      lb_frozen_to_frozen: 0,
      processes: this.num(p.processes),
      lb_processed: this.lb(p.lb_processed),
      lb_packout: this.lb(p.lb_packout),
      lb_waste: this.lb(p.lb_waste),
      pct_packout: this.num(p.pct_packout),
      lb_invoiced: this.lb(p.lb_invoiced),
      difference: this.lb(p.difference),
    }));

    const lbProcessed = this.lb(total.lb_processed ?? by_producer.reduce((s, r) => s + r.lb_processed, 0));
    const lbPackout = this.lb(total.lb_packout ?? by_producer.reduce((s, r) => s + r.lb_packout, 0));

    return {
      lb_received: this.lb(total.lb_received ?? by_producer.reduce((s, r) => s + r.lb_received, 0)),
      lb_processed: lbProcessed,
      lb_packout: lbPackout,
      lb_waste: this.lb(total.lb_waste ?? by_producer.reduce((s, r) => s + r.lb_waste, 0)),
      pct_packout:
        lbProcessed > 0 ? this.pct(lbPackout / lbProcessed) : this.num(total.pct_packout),
      lb_rejected: 0,
      lb_for_frozen: 0,
      lb_frozen_to_frozen: 0,
      by_producer: by_producer.sort((a, b) => b.lb_packout - a.lb_packout),
    };
  }

  private async commercialFromLegacy(year: number): Promise<CommercialOverview> {
    const rows = (await this.lineRepo.query(
      `
      SELECT
        producer_id,
        producer_raw,
        COALESCE(SUM(boxes), 0)::numeric AS boxes,
        COALESCE(SUM(pounds::numeric), 0)::numeric AS pounds,
        COALESCE(SUM(revenue::numeric), 0)::numeric AS revenue,
        COALESCE(SUM(grower_return::numeric), 0)::numeric AS grower_return
      FROM season_settlement_lines
      WHERE season_year = $1
      GROUP BY producer_id, producer_raw
      ORDER BY revenue DESC
      `,
      [year],
    )) as Array<{
      producer_id: string;
      producer_raw: string;
      boxes: string;
      pounds: string;
      revenue: string;
      grower_return: string;
    }>;

    const by_producer: CommercialProducerRow[] = rows.map((r) => ({
      producer_id: Number(r.producer_id),
      producer_name: r.producer_raw,
      sales: this.money(r.revenue),
      grower_return: this.money(r.grower_return),
      boxes: this.num(r.boxes),
      pounds: this.lb(r.pounds),
    }));

    return {
      sales: this.money(by_producer.reduce((s, r) => s + r.sales, 0)),
      grower_return: this.money(by_producer.reduce((s, r) => s + r.grower_return, 0)),
      boxes: by_producer.reduce((s, r) => s + r.boxes, 0),
      pounds: this.lb(by_producer.reduce((s, r) => s + r.pounds, 0)),
      by_producer,
    };
  }

  private async massBalanceFromLegacy(year: number): Promise<MassBalanceOverview> {
    const rows = await this.massBalanceRepo.find({
      where: { season_year: year },
      order: { lb_packout: 'DESC' },
    });

    const by_producer: MassBalanceProducerRow[] = rows.map((r) => ({
      producer_id: Number(r.producer_id),
      producer_name: r.producer_name,
      receptions: r.receptions,
      lb_received: this.lb(r.lb_received),
      lb_rejected: this.lb(r.lb_rejected),
      lb_for_frozen: this.lb(r.lb_for_frozen),
      lb_frozen_to_frozen: this.lb(r.lb_frozen_to_frozen),
      processes: r.processes,
      lb_processed: this.lb(r.lb_processed),
      lb_packout: this.lb(r.lb_packout),
      lb_waste: this.lb(r.lb_waste),
      pct_packout: this.num(r.pct_packout),
      lb_invoiced: this.lb(r.lb_invoiced),
      difference: this.lb(r.difference),
    }));

    const lbProcessed = by_producer.reduce((s, r) => s + r.lb_processed, 0);
    const lbPackout = by_producer.reduce((s, r) => s + r.lb_packout, 0);

    return {
      lb_received: this.lb(by_producer.reduce((s, r) => s + r.lb_received, 0)),
      lb_processed: this.lb(lbProcessed),
      lb_packout: this.lb(lbPackout),
      lb_waste: this.lb(by_producer.reduce((s, r) => s + r.lb_waste, 0)),
      pct_packout: lbProcessed > 0 ? this.pct(lbPackout / lbProcessed) : 0,
      lb_rejected: this.lb(by_producer.reduce((s, r) => s + r.lb_rejected, 0)),
      lb_for_frozen: this.lb(by_producer.reduce((s, r) => s + r.lb_for_frozen, 0)),
      lb_frozen_to_frozen: this.lb(by_producer.reduce((s, r) => s + r.lb_frozen_to_frozen, 0)),
      by_producer,
    };
  }

  private money(v: unknown): number {
    return Number(Number(v ?? 0).toFixed(2));
  }

  private lb(v: unknown): number {
    return Number(Number(v ?? 0).toFixed(2));
  }

  private num(v: unknown): number {
    return Number(v ?? 0);
  }

  private pct(v: number): number {
    return Number((v * 100).toFixed(2));
  }
}
