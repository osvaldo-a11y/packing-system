import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportFilterDto } from '../reporting/reporting.dto';
import { ReportSnapshot } from '../reporting/reporting.entities';
import { ReportingService } from '../reporting/reporting.service';
import { SeasonMassBalance, SeasonProcessLine, SeasonReceptionLine, SeasonSettlementLine } from './legacy.entities';
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
  DispatchExportGroup,
  ProcessExportLine,
  ReceptionExportLine,
  SettlementLineFilters,
  SettlementLineRow,
  SettlementLinesResult,
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
    @InjectRepository(SeasonReceptionLine) private readonly receptionLineRepo: Repository<SeasonReceptionLine>,
    @InjectRepository(SeasonProcessLine) private readonly processLineRepo: Repository<SeasonProcessLine>,
    private readonly reporting: ReportingService,
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
    const useLive = this.isLiveOperationalSeason(season);
    const dataSource = useLive ? 'live' : await this.resolveDataSource(season);
    const capabilities = await this.buildCapabilities(season, dataSource);

    const commercial = capabilities.commercial
      ? useLive
        ? await this.commercialFromLive(year)
        : dataSource === 'snapshot'
          ? await this.commercialFromSnapshot(season)
          : await this.commercialFromLegacy(year)
      : null;

    const mass_balance = capabilities.mass_balance
      ? useLive
        ? await this.massBalanceFromLive(year)
        : dataSource === 'snapshot'
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
      commercial_field_notes: useLive
        ? 'Datos operativos en vivo (misma lógica que Cierre y Balance de masas). El snapshot se congela al cerrar la temporada.'
        : dataSource === 'snapshot'
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

  async getSettlementLines(year: number, filters: SettlementLineFilters): Promise<SettlementLinesResult> {
    const season = await this.findSeason(year);
    const dataSource = await this.resolveDataSource(season);
    return this.querySettlementLines(year, dataSource, filters, 5000);
  }

  async getAllSettlementLines(year: number): Promise<SettlementLineRow[]> {
    const season = await this.findSeason(year);
    const dataSource = await this.resolveDataSource(season);
    const result = await this.querySettlementLines(year, dataSource, {}, undefined);
    return result.lines;
  }

  async getReceptionExportLines(year: number): Promise<ReceptionExportLine[]> {
    const rows = (await this.receptionLineRepo.query(
      `
      SELECT
        r.producer_id,
        COALESCE(p.nombre, r.producer_raw, '') AS producer_name,
        r.reception_date::text AS reception_date,
        r.variety,
        r.quality,
        r.incoming_no,
        r.trays,
        r.quantity::numeric AS quantity,
        r.net_lb::numeric AS net_lb,
        r.gross_lb::numeric AS gross_lb,
        r.fruit_type
      FROM season_reception_lines r
      LEFT JOIN producers p ON p.id = r.producer_id
      WHERE r.season_year = $1
      ORDER BY r.reception_date, COALESCE(p.nombre, r.producer_raw), r.id
      `,
      [year],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      producer_id: Number(r.producer_id),
      producer_name: String(r.producer_name ?? ''),
      reception_date: String(r.reception_date ?? ''),
      variety: r.variety != null ? String(r.variety) : null,
      quality: String(r.quality ?? 'FRESH') as ReceptionExportLine['quality'],
      incoming_no: r.incoming_no != null ? String(r.incoming_no) : null,
      trays: r.trays != null ? Number(r.trays) : null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      net_lb: Number(r.net_lb ?? 0),
      gross_lb: r.gross_lb != null ? Number(r.gross_lb) : null,
      fruit_type: (r.fruit_type as ReceptionExportLine['fruit_type']) ?? null,
    }));
  }

  async getProcessExportLines(year: number): Promise<ProcessExportLine[]> {
    const rows = (await this.processLineRepo.query(
      `
      SELECT
        pl.producer_id,
        COALESCE(p.nombre, pl.producer_raw, '') AS producer_name,
        pl.process_date::text AS process_date,
        pl.op,
        pl.variety,
        COALESCE(pl.format_code, pl.format_raw) AS format_code,
        pl.lb_total::numeric AS lb_total,
        pl.lb_fresh::numeric AS lb_fresh,
        pl.lb_waste::numeric AS lb_waste,
        pl.boxes,
        pl.fruit_type
      FROM season_process_lines pl
      LEFT JOIN producers p ON p.id = pl.producer_id
      WHERE pl.season_year = $1
      ORDER BY pl.process_date, COALESCE(p.nombre, pl.producer_raw), pl.id
      `,
      [year],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      producer_id: Number(r.producer_id),
      producer_name: String(r.producer_name ?? ''),
      process_date: String(r.process_date ?? ''),
      op: r.op != null ? String(r.op) : null,
      variety: r.variety != null ? String(r.variety) : null,
      format_code: r.format_code != null ? String(r.format_code) : null,
      lb_total: Number(r.lb_total ?? 0),
      lb_fresh: Number(r.lb_fresh ?? 0),
      lb_waste: Number(r.lb_waste ?? 0),
      boxes: r.boxes != null ? Number(r.boxes) : null,
      fruit_type: (r.fruit_type as ProcessExportLine['fruit_type']) ?? null,
    }));
  }

  async getDispatchExportGroups(year: number): Promise<DispatchExportGroup[]> {
    const rows = (await this.lineRepo.query(
      `
      SELECT
        l.bol,
        l.ship_date::text AS ship_date,
        STRING_AGG(DISTINCT COALESCE(p.nombre, l.producer_raw, ''), ', ' ORDER BY COALESCE(p.nombre, l.producer_raw, '')) AS producers,
        COALESCE(SUM(l.boxes), 0)::int AS boxes,
        COALESCE(SUM(l.pounds::numeric), 0)::numeric AS pounds,
        COALESCE(SUM(l.revenue::numeric), 0)::numeric AS revenue
      FROM season_settlement_lines l
      LEFT JOIN producers p ON p.id = l.producer_id
      WHERE l.season_year = $1
      GROUP BY l.bol, l.ship_date
      ORDER BY l.ship_date NULLS LAST, l.bol
      `,
      [year],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      bol: String(r.bol ?? ''),
      ship_date: r.ship_date != null ? String(r.ship_date) : null,
      producers: String(r.producers ?? ''),
      boxes: Number(r.boxes ?? 0),
      pounds: Number(r.pounds ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  }

  private async querySettlementLines(
    year: number,
    dataSource: SeasonDataSource,
    filters: SettlementLineFilters,
    limit?: number,
  ): Promise<SettlementLinesResult> {
    const params: unknown[] = [year];
    const clauses = ['l.season_year = $1'];

    const addIlike = (value: string | undefined, cols: string[]) => {
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
        clauses.push(`l.producer_id = $${params.length}`);
      } else {
        addIlike(p, ['p.nombre', 'l.producer_raw']);
      }
    }
    addIlike(filters.format, ['l.format_code', 'l.format_raw']);
    addIlike(filters.bol, ['l.bol']);
    addIlike(filters.variety, ['l.variety_raw']);
    addIlike(filters.brand, ['l.brand_raw']);

    const whereSql = clauses.join(' AND ');
    const countRows = (await this.lineRepo.query(
      `
      SELECT COUNT(*)::int AS c
      FROM season_settlement_lines l
      LEFT JOIN producers p ON p.id = l.producer_id
      WHERE ${whereSql}
      `,
      params,
    )) as Array<{ c: number }>;
    const totalCount = Number(countRows[0]?.c ?? 0);

    const limitSql = limit != null ? `LIMIT ${Number(limit)}` : '';
    const rows = (await this.lineRepo.query(
      `
      SELECT
        l.id, l.season_year, l.producer_id,
        COALESCE(p.nombre, l.producer_raw, '') AS producer_name,
        l.producer_raw,
        l.brand_raw, l.variety_raw,
        l.format_code, l.format_raw, l.ship_date,
        l.bol, l.pallet_ref,
        l.boxes, l.pounds, l.unit_price, l.revenue, l.grower_return,
        l.source_row_no
      FROM season_settlement_lines l
      LEFT JOIN producers p ON p.id = l.producer_id
      WHERE ${whereSql}
      ORDER BY COALESCE(p.nombre, l.producer_raw), l.source_row_no NULLS LAST, l.id
      ${limitSql}
      `,
      params,
    )) as Array<Record<string, unknown>>;

    return {
      season_year: year,
      source: dataSource,
      filters,
      line_count: rows.length,
      total_count: totalCount,
      lines: rows.map((r) => this.mapSettlementLineRow(r)),
    };
  }

  private mapSettlementLineRow(r: Record<string, unknown>): SettlementLineRow {
    return {
      id: Number(r.id),
      producer_id: Number(r.producer_id),
      producer_name: String(r.producer_name ?? ''),
      producer_raw: r.producer_raw != null ? String(r.producer_raw) : null,
      brand_raw: r.brand_raw != null ? String(r.brand_raw) : null,
      variety_raw: r.variety_raw != null ? String(r.variety_raw) : null,
      format_code: r.format_code != null ? String(r.format_code) : null,
      format_raw: r.format_raw != null ? String(r.format_raw) : null,
      ship_date: r.ship_date != null ? String(r.ship_date) : null,
      bol: r.bol != null ? String(r.bol) : null,
      pallet_ref: r.pallet_ref != null ? String(r.pallet_ref) : null,
      boxes: this.num(r.boxes),
      pounds: this.lb(r.pounds),
      unit_price: this.money(r.unit_price),
      revenue: this.money(r.revenue),
      grower_return: this.money(r.grower_return),
      source_row_no: r.source_row_no != null ? Number(r.source_row_no) : null,
    };
  }

  private async findSeason(year: number): Promise<Season> {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) throw new NotFoundException(`Temporada ${year} no encontrada`);
    return season;
  }

  private isLiveOperationalSeason(season: Season): boolean {
    return season.source === 'system' && season.status !== 'closed';
  }

  private seasonDateRange(year: number): { desde: string; hasta: string } {
    return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
  }

  private async resolveDataSource(season: Season): Promise<SeasonDataSource> {
    if (this.isLiveOperationalSeason(season)) return 'live';
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

    const hasCommercial = dataSource === 'live' || dataSource === 'snapshot' || lineCount > 0;
    const hasMass = dataSource === 'live' || dataSource === 'snapshot' || massCount > 0;

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

  private async massBalanceFromLive(year: number): Promise<MassBalanceOverview> {
    const { desde, hasta } = this.seasonDateRange(year);
    const raw = await this.reporting.getMassBalanceByProducer({ desde, hasta });
    const by_producer: MassBalanceProducerRow[] = raw.producers.map((p) => ({
      producer_id: p.productor_id,
      producer_name: p.productor_nombre,
      receptions: p.recepciones,
      lb_received: this.lb(p.lb_recepcionado),
      lb_rejected: 0,
      lb_for_frozen: 0,
      lb_frozen_to_frozen: 0,
      processes: p.procesos,
      lb_processed: this.lb(p.lb_procesado),
      lb_packout: this.lb(p.lb_packout),
      lb_waste: this.lb(p.lb_merma),
      pct_packout: this.num(p.pct_packout),
      lb_invoiced: this.lb(p.lb_facturado),
      difference: this.lb(p.diferencia),
    }));

    const lbProcessed = this.lb(raw.totales.lb_procesado);
    const lbPackout = this.lb(raw.totales.lb_packout);

    return {
      lb_received: this.lb(raw.totales.lb_recepcionado),
      lb_processed: lbProcessed,
      lb_packout: lbPackout,
      lb_waste: this.lb(raw.totales.lb_merma),
      pct_packout: lbProcessed > 0 ? this.pct(lbPackout / lbProcessed) : 0,
      lb_rejected: 0,
      lb_for_frozen: 0,
      lb_frozen_to_frozen: 0,
      by_producer: by_producer.sort((a, b) => b.lb_packout - a.lb_packout),
    };
  }

  private async commercialFromLive(year: number): Promise<CommercialOverview> {
    const { desde, hasta } = this.seasonDateRange(year);
    const filter: ReportFilterDto = {
      fecha_desde: desde,
      fecha_hasta: hasta,
      page: 1,
      limit: 10000,
    };
    const { summaryRows } = await this.reporting.computeProducerSettlementRows(filter);

    const by_producer: CommercialProducerRow[] = summaryRows
      .filter((r) => r.productor_id != null)
      .map((r) => {
        const producerNet = this.money(r.neto_productor);
        return {
          producer_id: r.productor_id != null ? Number(r.productor_id) : null,
          producer_name: String(r.productor_nombre ?? ''),
          sales: this.money(r.ventas),
          grower_return: producerNet,
          producer_net: producerNet,
          boxes: this.num(r.cajas),
          pounds: this.lb(r.lb),
        };
      });

    const producerNetTotal = this.money(by_producer.reduce((s, r) => s + (r.producer_net ?? 0), 0));

    return {
      sales: this.money(by_producer.reduce((s, r) => s + r.sales, 0)),
      grower_return: producerNetTotal,
      producer_net: producerNetTotal,
      boxes: by_producer.reduce((s, r) => s + r.boxes, 0),
      pounds: this.lb(by_producer.reduce((s, r) => s + r.pounds, 0)),
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
        l.producer_id,
        MAX(l.producer_raw) AS producer_raw,
        COALESCE(p.nombre, MAX(l.producer_raw), '') AS producer_name,
        COALESCE(SUM(l.boxes), 0)::numeric AS boxes,
        COALESCE(SUM(l.pounds::numeric), 0)::numeric AS pounds,
        COALESCE(SUM(l.revenue::numeric), 0)::numeric AS revenue,
        COALESCE(SUM(l.grower_return::numeric), 0)::numeric AS grower_return
      FROM season_settlement_lines l
      LEFT JOIN producers p ON p.id = l.producer_id
      WHERE l.season_year = $1
      GROUP BY l.producer_id, p.nombre
      ORDER BY SUM(l.revenue::numeric) DESC
      `,
      [year],
    )) as Array<{
      producer_id: string;
      producer_raw: string;
      producer_name: string;
      boxes: string;
      pounds: string;
      revenue: string;
      grower_return: string;
    }>;

    const by_producer: CommercialProducerRow[] = rows.map((r) => ({
      producer_id: r.producer_id != null ? Number(r.producer_id) : null,
      producer_name: String(r.producer_name ?? ''),
      producer_raw: r.producer_raw ? String(r.producer_raw) : undefined,
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
    const rows = (await this.massBalanceRepo.query(
      `
      SELECT
        smb.producer_id,
        COALESCE(p.nombre, smb.producer_name, '') AS producer_name,
        smb.receptions,
        smb.lb_received,
        smb.lb_rejected,
        smb.lb_for_frozen,
        smb.lb_frozen_to_frozen,
        smb.processes,
        smb.lb_processed,
        smb.lb_packout,
        smb.lb_waste,
        smb.pct_packout,
        smb.lb_invoiced,
        smb.difference
      FROM season_mass_balance smb
      LEFT JOIN producers p ON p.id = smb.producer_id
      WHERE smb.season_year = $1
      ORDER BY smb.lb_packout DESC
      `,
      [year],
    )) as Array<{
      producer_id: string;
      producer_name: string;
      receptions: number;
      lb_received: string;
      lb_rejected: string;
      lb_for_frozen: string;
      lb_frozen_to_frozen: string;
      processes: number;
      lb_processed: string;
      lb_packout: string;
      lb_waste: string;
      pct_packout: string;
      lb_invoiced: string;
      difference: string;
    }>;

    const by_producer: MassBalanceProducerRow[] = rows.map((r) => ({
      producer_id: Number(r.producer_id),
      producer_name: String(r.producer_name ?? ''),
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
