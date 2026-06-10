import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execSync } from 'node:child_process';
import { Repository } from 'typeorm';
import { ReportSnapshot } from '../reporting/reporting.entities';
import { ReportFilterDto } from '../reporting/reporting.dto';
import { ReportingService } from '../reporting/reporting.service';
import { Season, SeasonStatus } from './season.entity';
import { GenerateSeasonSnapshotDto } from './seasons.dto';

/**
 * INMUTABILIDAD (Fase 0):
 * El snapshot registra los números tal como se aceptaron al generarlo.
 * Cambios de cálculo posteriores (p. ej. clasificación máquina en Fase 1)
 * NO reescriben un snapshot ya generado ni una temporada `closed`.
 * Solo se permite regenerar manualmente mientras `status = closing`.
 */
@Injectable()
export class SeasonsService {
  private static readonly SNAPSHOT_TYPE = 'season_closing' as const;

  constructor(
    @InjectRepository(Season) private readonly seasonRepo: Repository<Season>,
    @InjectRepository(ReportSnapshot) private readonly snapshotRepo: Repository<ReportSnapshot>,
    private readonly reporting: ReportingService,
  ) {}

  async findByYear(year: number): Promise<Season> {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) throw new NotFoundException(`Temporada ${year} no encontrada`);
    return season;
  }

  private assertCanRegenerateSnapshot(season: Season): void {
    if (season.status === 'closed') {
      throw new BadRequestException(
        `La temporada ${season.year} está cerrada (${season.closed_at?.toISOString() ?? 'sin fecha'}). ` +
          'El snapshot es inmutable; no se puede regenerar.',
      );
    }
    if (season.status !== 'closing') {
      throw new BadRequestException(
        `La temporada ${season.year} debe estar en estado "closing" para generar snapshot (actual: ${season.status}).`,
      );
    }
  }

  /** Regla de negocio Fase 0+: temporadas `closed` son solo lectura para datos congelados. */
  isSeasonReadOnly(season: Season): boolean {
    return season.status === 'closed';
  }

  private seasonDateRange(year: number): { desde: string; hasta: string } {
    return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
  }

  private resolveSourceVersion(): string | null {
    const fromEnv =
      process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
      process.env.GIT_COMMIT?.trim() ||
      process.env.SOURCE_VERSION?.trim() ||
      null;
    if (fromEnv) return fromEnv.slice(0, 80);
    try {
      const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return hash || null;
    } catch {
      return null;
    }
  }

  private mapMassBalanceRow(p: {
    productor_id: number;
    productor_nombre: string;
    recepciones: number;
    lb_recepcionado: number;
    procesos: number;
    lb_procesado: number;
    lb_packout: number;
    lb_merma: number;
    pct_packout: number;
    lb_facturado: number;
    diferencia: number;
  }) {
    return {
      producer_id: p.productor_id,
      producer_name: p.productor_nombre,
      receptions: p.recepciones,
      lb_received: p.lb_recepcionado,
      processes: p.procesos,
      lb_processed: p.lb_procesado,
      lb_packout: p.lb_packout,
      lb_waste: p.lb_merma,
      pct_packout: p.pct_packout,
      lb_invoiced: p.lb_facturado,
      difference: p.diferencia,
    };
  }

  private mapSettlementRow(r: Record<string, unknown>) {
    return {
      producer_id: r.productor_id ?? null,
      producer_name: r.productor_nombre ?? null,
      boxes: Number(r.cajas ?? 0),
      pounds: Number(r.lb ?? 0),
      sales: Number(r.ventas ?? 0),
      material_cost: Number(r.costo_materiales ?? 0),
      packing_base: Number(r.costo_packing_base ?? 0),
      format_surcharge: Number(r.recargo_formato ?? 0),
      machine_processing: Number(r.costo_maquina ?? 0),
      machine_lbs: Number(r.lb_machine ?? 0),
      total_packing: Number(r.total_packing ?? 0),
      total_cost: Number(r.costo_total ?? 0),
      producer_net: Number(r.neto_productor ?? 0),
    };
  }

  private sumMassBalanceTotal(rows: ReturnType<SeasonsService['mapMassBalanceRow']>[]) {
    const lb_received = rows.reduce((s, r) => s + r.lb_received, 0);
    const lb_packout = rows.reduce((s, r) => s + r.lb_packout, 0);
    return {
      receptions: rows.reduce((s, r) => s + r.receptions, 0),
      lb_received: Number(lb_received.toFixed(3)),
      processes: rows.reduce((s, r) => s + r.processes, 0),
      lb_processed: Number(rows.reduce((s, r) => s + r.lb_processed, 0).toFixed(3)),
      lb_packout: Number(lb_packout.toFixed(3)),
      lb_waste: Number(rows.reduce((s, r) => s + r.lb_waste, 0).toFixed(3)),
      pct_packout: lb_received > 0 ? Number(((lb_packout / lb_received) * 100).toFixed(2)) : 0,
      lb_invoiced: Number(rows.reduce((s, r) => s + r.lb_invoiced, 0).toFixed(3)),
      difference: Number(rows.reduce((s, r) => s + r.difference, 0).toFixed(3)),
    };
  }

  private sumSettlementTotal(rows: ReturnType<SeasonsService['mapSettlementRow']>[]) {
    return {
      boxes: Number(rows.reduce((s, r) => s + r.boxes, 0).toFixed(4)),
      pounds: Number(rows.reduce((s, r) => s + r.pounds, 0).toFixed(4)),
      sales: Number(rows.reduce((s, r) => s + r.sales, 0).toFixed(2)),
      material_cost: Number(rows.reduce((s, r) => s + r.material_cost, 0).toFixed(2)),
      packing_base: Number(rows.reduce((s, r) => s + r.packing_base, 0).toFixed(2)),
      format_surcharge: Number(rows.reduce((s, r) => s + r.format_surcharge, 0).toFixed(2)),
      machine_processing: Number(rows.reduce((s, r) => s + r.machine_processing, 0).toFixed(2)),
      machine_lbs: Number(rows.reduce((s, r) => s + r.machine_lbs, 0).toFixed(3)),
      total_packing: Number(rows.reduce((s, r) => s + r.total_packing, 0).toFixed(2)),
      total_cost: Number(rows.reduce((s, r) => s + r.total_cost, 0).toFixed(2)),
      producer_net: Number(rows.reduce((s, r) => s + r.producer_net, 0).toFixed(2)),
    };
  }

  async generateSnapshot(year: number, dto: GenerateSeasonSnapshotDto, username: string) {
    const season = await this.findByYear(year);
    this.assertCanRegenerateSnapshot(season);

    const { desde, hasta } = this.seasonDateRange(year);
    const filter: ReportFilterDto = {
      fecha_desde: desde,
      fecha_hasta: hasta,
      page: 1,
      limit: 10000,
      use_material_target_price: dto.use_material_target_price === true,
    };

    const massBalanceRaw = await this.reporting.getMassBalanceByProducer({ desde, hasta });
    const { summaryRows } = await this.reporting.computeProducerSettlementRows(filter);

    const massProducers = massBalanceRaw.producers.map((p) => this.mapMassBalanceRow(p));
    const massTotal = this.sumMassBalanceTotal(massProducers);

    const settlementProducers = summaryRows.map((r) => this.mapSettlementRow(r));
    const settlementTotal = this.sumSettlementTotal(settlementProducers);

    const generatedAt = new Date().toISOString();
    const sourceVersion = this.resolveSourceVersion();

    const payload = {
      schema_version: 1,
      season_year: year,
      season_status_at_generation: season.status,
      date_range: { desde, hasta },
      immutability_principle:
        'Snapshot histórico de lo aceptado. No se recalcula solo ante cambios de código; solo regeneración manual en closing.',
      mass_balance: {
        producers: massProducers,
        total: massTotal,
      },
      producer_settlement: {
        producers: settlementProducers,
        total: settlementTotal,
      },
      meta: {
        generated_at: generatedAt,
        generated_by: username,
        source_version: sourceVersion,
        filters: filter,
      },
    };

    const existingCurrent = await this.snapshotRepo.findOne({
      where: {
        season_id: season.id,
        snapshot_type: SeasonsService.SNAPSHOT_TYPE,
        is_current: true,
      },
    });

    const nextVersion = existingCurrent ? existingCurrent.version + 1 : 1;
    if (existingCurrent) {
      existingCurrent.is_current = false;
      await this.snapshotRepo.save(existingCurrent);
    }

    const snapshot = await this.snapshotRepo.save(
      this.snapshotRepo.create({
        report_name: `season_freeze_${year}`,
        filters: filter as unknown as Record<string, unknown>,
        payload,
        season_id: season.id,
        snapshot_type: SeasonsService.SNAPSHOT_TYPE,
        version: nextVersion,
        is_current: true,
        generated_by: username,
        source_version: sourceVersion,
      }),
    );

    return {
      season_id: season.id,
      season_year: year,
      season_status: season.status,
      snapshot_id: snapshot.id,
      version: snapshot.version,
      regenerated: Boolean(existingCurrent),
      generated_at: generatedAt,
      generated_by: username,
      source_version: sourceVersion,
      summary: {
        producer_count: settlementProducers.filter((p) => p.producer_id != null).length,
        mass_balance: {
          lb_received_total: massTotal.lb_received,
          lb_packout_total: massTotal.lb_packout,
          lb_invoiced_total: massTotal.lb_invoiced,
          difference_total: massTotal.difference,
        },
        producer_settlement: {
          boxes_total: settlementTotal.boxes,
          pounds_total: settlementTotal.pounds,
          sales_total: settlementTotal.sales,
          total_cost_total: settlementTotal.total_cost,
          producer_net_total: settlementTotal.producer_net,
        },
      },
      payload_preview: {
        mass_balance_producers: massProducers.length,
        settlement_producers: settlementProducers.length,
      },
    };
  }

  async closeSeason(year: number) {
    const season = await this.findByYear(year);
    if (season.status === 'closed') {
      throw new BadRequestException(`La temporada ${year} ya está cerrada.`);
    }

    const currentSnapshot = await this.snapshotRepo.findOne({
      where: {
        season_id: season.id,
        snapshot_type: SeasonsService.SNAPSHOT_TYPE,
        is_current: true,
      },
    });
    if (!currentSnapshot) {
      throw new BadRequestException(
        `No hay snapshot vigente para la temporada ${year}. Ejecute POST /api/seasons/${year}/snapshot/generate primero.`,
      );
    }

    season.status = 'closed' as SeasonStatus;
    season.closed_at = new Date();
    await this.seasonRepo.save(season);

    return {
      season_id: season.id,
      season_year: year,
      status: season.status,
      closed_at: season.closed_at?.toISOString() ?? null,
      snapshot_id: currentSnapshot.id,
      snapshot_version: currentSnapshot.version,
      message:
        'Temporada cerrada. El snapshot vigente es inmutable; regeneración rechazada hasta nueva fase de reapertura.',
    };
  }

  async getCurrentSnapshot(year: number) {
    const season = await this.findByYear(year);
    const snapshot = await this.snapshotRepo.findOne({
      where: {
        season_id: season.id,
        snapshot_type: SeasonsService.SNAPSHOT_TYPE,
        is_current: true,
      },
    });
    if (!snapshot) return { season, snapshot: null };
    return { season, snapshot };
  }
}
