import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  ReceptionLineDirectAllocation,
  ReceptionLineAdjustment,
} from '../dispatch/dispatch.entities';
import { FruitProcessLineAllocation } from '../process/process.entities';
import { ReceptionLine, Species } from './traceability.entities';
import { normalizeFlowType, resolveSpeciesCapabilities } from './species-flow';

export const RAW_BALANCE_EPS = 0.02;

/**
 * Unified RAW balance over reception_line:
 * available = net_lb + Σ adjustments.lb_delta − process_alloc − direct_alloc
 *
 * Adjustment convention: LOSS/REJECTION → negative lb_delta; CORRECTION → signed.
 */
@Injectable()
export class RawInventoryService {
  constructor(
    @InjectRepository(ReceptionLine) private readonly receptionLineRepo: Repository<ReceptionLine>,
    @InjectRepository(FruitProcessLineAllocation)
    private readonly processAllocRepo: Repository<FruitProcessLineAllocation>,
    @InjectRepository(ReceptionLineDirectAllocation)
    private readonly directAllocRepo: Repository<ReceptionLineDirectAllocation>,
    @InjectRepository(ReceptionLineAdjustment)
    private readonly adjustmentRepo: Repository<ReceptionLineAdjustment>,
    @InjectRepository(Species) private readonly speciesRepo: Repository<Species>,
  ) {}

  async sumProcessConsumedLb(receptionLineId: number, em?: EntityManager): Promise<number> {
    const mgr = em ?? this.processAllocRepo.manager;
    const allocRows = (await mgr.query(
      `
      SELECT COALESCE(SUM(a.lb_allocated::numeric), 0)::text AS s
      FROM fruit_process_line_allocations a
      INNER JOIN fruit_processes fp ON fp.id = a.process_id
      WHERE a.reception_line_id = $1
        AND fp.deleted_at IS NULL
      `,
      [receptionLineId],
    )) as Array<{ s: string }>;
    const allocated = Number(allocRows[0]?.s ?? 0);
    const legacyRows = (await mgr.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN fp.lb_entrada IS NOT NULL AND TRIM(fp.lb_entrada::text) <> ''
            AND ABS(fp.lb_entrada::numeric) > $2::numeric THEN fp.lb_entrada::numeric
          ELSE COALESCE(fp.peso_procesado_lb::numeric, 0)
        END
      ), 0)::text AS s
      FROM fruit_processes fp
      WHERE fp.deleted_at IS NULL
        AND fp.reception_line_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM fruit_process_line_allocations a WHERE a.process_id = fp.id
        )
      `,
      [receptionLineId, RAW_BALANCE_EPS],
    )) as Array<{ s: string }>;
    return allocated + Number(legacyRows[0]?.s ?? 0);
  }

  async sumDirectAllocatedLb(receptionLineId: number, em?: EntityManager): Promise<number> {
    const mgr = em ?? this.directAllocRepo.manager;
    const rows = (await mgr.query(
      `
      SELECT COALESCE(SUM(a.lb_allocated::numeric), 0)::text AS s
      FROM reception_line_direct_allocations a
      WHERE a.reception_line_id = $1
      `,
      [receptionLineId],
    )) as Array<{ s: string }>;
    return Number(rows[0]?.s ?? 0);
  }

  async sumAdjustmentLb(receptionLineId: number, em?: EntityManager): Promise<number> {
    const mgr = em ?? this.adjustmentRepo.manager;
    const rows = (await mgr.query(
      `
      SELECT COALESCE(SUM(a.lb_delta::numeric), 0)::text AS s
      FROM reception_line_adjustments a
      WHERE a.reception_line_id = $1
      `,
      [receptionLineId],
    )) as Array<{ s: string }>;
    return Number(rows[0]?.s ?? 0);
  }

  async balanceAvailableOnLine(receptionLineId: number, em?: EntityManager): Promise<number> {
    const mgr = em ?? this.receptionLineRepo.manager;
    const line = await mgr.getRepository(ReceptionLine).findOne({
      where: { id: receptionLineId },
      select: ['id', 'net_lb'],
    });
    if (!line) return 0;
    const [processLb, directLb, adjSum] = await Promise.all([
      this.sumProcessConsumedLb(receptionLineId, mgr),
      this.sumDirectAllocatedLb(receptionLineId, mgr),
      this.sumAdjustmentLb(receptionLineId, mgr),
    ]);
    const net = Number(line.net_lb) || 0;
    return Math.max(0, net + adjSum - processLb - directLb);
  }

  async assertSpeciesAllowsDirectDispatch(speciesId: number): Promise<void> {
    const sp = await this.speciesRepo.findOne({ where: { id: speciesId } });
    if (!sp) throw new NotFoundException('Especie no encontrada');
    const caps = resolveSpeciesCapabilities(sp.flow_type);
    if (!caps.allows_direct_dispatch) {
      throw new BadRequestException(
        `La especie ${sp.nombre} (${normalizeFlowType(sp.flow_type)}) no permite despacho directo.`,
      );
    }
  }

  async assertSpeciesAllowsProcessing(speciesId: number): Promise<void> {
    const sp = await this.speciesRepo.findOne({ where: { id: speciesId } });
    if (!sp) throw new NotFoundException('Especie no encontrada');
    const caps = resolveSpeciesCapabilities(sp.flow_type);
    if (!caps.requires_processing) {
      throw new BadRequestException(
        `La especie ${sp.nombre} es DIRECT: no se asigna a proceso.`,
      );
    }
  }

  isProcessedFlow(flowType: string | null | undefined): boolean {
    return normalizeFlowType(flowType) === 'PROCESSED';
  }

  async listRawStock(opts?: { producer_id?: number; species_id?: number }) {
    const qb = this.receptionLineRepo
      .createQueryBuilder('rl')
      .innerJoinAndSelect('rl.reception', 'r')
      .innerJoin('r.document_state', 'rds')
      .leftJoinAndSelect('rl.species', 'sp')
      .leftJoinAndSelect('rl.variety', 'v')
      .leftJoinAndSelect('r.producer', 'p')
      .where("rds.codigo <> 'anulado'")
      .andWhere("COALESCE(sp.flow_type, 'PROCESSED') = 'DIRECT'");
    if (opts?.producer_id) qb.andWhere('r.producer_id = :pid', { pid: opts.producer_id });
    if (opts?.species_id) qb.andWhere('rl.species_id = :sid', { sid: opts.species_id });
    qb.orderBy('r.received_at', 'ASC').addOrderBy('rl.line_order', 'ASC');
    const lines = await qb.getMany();
    const out: Array<Record<string, unknown>> = [];
    for (const rl of lines) {
      const available_lb = await this.balanceAvailableOnLine(rl.id);
      if (available_lb <= RAW_BALANCE_EPS) continue;
      out.push({
        reception_line_id: rl.id,
        reception_id: Number(rl.reception_id),
        producer_id: Number(rl.reception.producer_id),
        producer_nombre: rl.reception.producer?.nombre ?? null,
        received_at: rl.reception.received_at,
        lot_code: rl.lot_code,
        species_id: rl.species_id != null ? Number(rl.species_id) : null,
        species_nombre: rl.species?.nombre ?? null,
        species_flow_type: normalizeFlowType(rl.species?.flow_type),
        variety_id: rl.variety_id != null ? Number(rl.variety_id) : null,
        variety_nombre: rl.variety?.nombre ?? null,
        net_lb: Number(rl.net_lb) || 0,
        available_lb,
      });
    }
    return out;
  }

  async lockAndAssertAvailable(
    em: EntityManager,
    items: Array<{ reception_line_id: number; lb: number }>,
  ): Promise<ReceptionLine[]> {
    const ids = [...new Set(items.map((i) => i.reception_line_id))];
    if (!ids.length) throw new BadRequestException('Sin líneas de recepción');
    const locked = (await em.query(
      `
      SELECT id FROM reception_lines
      WHERE id = ANY($1::bigint[])
      FOR UPDATE
      `,
      [ids],
    )) as Array<{ id: string }>;
    if (locked.length !== ids.length) {
      throw new BadRequestException('Una o más reception_line_id no existen');
    }
    const lines: ReceptionLine[] = [];
    for (const item of items) {
      const line = await em.getRepository(ReceptionLine).findOne({
        where: { id: item.reception_line_id },
        relations: ['species', 'variety', 'reception', 'reception.producer'],
      });
      if (!line) throw new NotFoundException(`Línea ${item.reception_line_id} no encontrada`);
      if (line.species_id == null) {
        throw new BadRequestException(`Línea ${item.reception_line_id} sin especie`);
      }
      await this.assertSpeciesAllowsDirectDispatch(Number(line.species_id));
      const avail = await this.balanceAvailableOnLine(item.reception_line_id, em);
      if (item.lb > avail + RAW_BALANCE_EPS) {
        throw new BadRequestException(
          `Saldo insuficiente en línea ${item.reception_line_id}: disponible ${avail.toFixed(3)} lb, solicitado ${item.lb.toFixed(3)} lb`,
        );
      }
      lines.push(line);
    }
    return lines;
  }

  async createAdjustment(input: {
    reception_line_id: number;
    adjustment_type: 'LOSS' | 'REJECTION' | 'CORRECTION';
    lb_delta: number;
    reason?: string;
    created_by?: string;
  }) {
    if (!['LOSS', 'REJECTION', 'CORRECTION'].includes(input.adjustment_type)) {
      throw new BadRequestException('adjustment_type inválido');
    }
    const line = await this.receptionLineRepo.findOne({
      where: { id: input.reception_line_id },
      relations: ['species'],
    });
    if (!line) throw new NotFoundException('Línea de recepción no encontrada');
    if (line.species_id != null) {
      await this.assertSpeciesAllowsDirectDispatch(Number(line.species_id));
    }
    let delta = Number(input.lb_delta);
    if (!Number.isFinite(delta) || delta === 0) {
      throw new BadRequestException('lb_delta inválido');
    }
    if (input.adjustment_type === 'LOSS' || input.adjustment_type === 'REJECTION') {
      delta = -Math.abs(delta);
    }
    const avail = await this.balanceAvailableOnLine(input.reception_line_id);
    if (delta < 0 && Math.abs(delta) > avail + RAW_BALANCE_EPS) {
      throw new BadRequestException(
        `Ajuste excede saldo disponible (${avail.toFixed(3)} lb)`,
      );
    }
    const row = await this.adjustmentRepo.save(
      this.adjustmentRepo.create({
        reception_line_id: input.reception_line_id,
        adjustment_type: input.adjustment_type,
        lb_delta: delta.toFixed(3),
        reason: input.reason?.trim() || null,
        created_by: input.created_by?.trim() || null,
      }),
    );
    return {
      id: row.id,
      reception_line_id: Number(row.reception_line_id),
      adjustment_type: row.adjustment_type,
      lb_delta: Number(row.lb_delta),
      reason: row.reason,
      available_lb_after: await this.balanceAvailableOnLine(input.reception_line_id),
    };
  }
}
