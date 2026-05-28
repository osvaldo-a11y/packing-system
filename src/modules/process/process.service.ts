import { receptionReferenceDisplay } from '../../common/reception-reference';
import { toJsonRecord } from '../../common/to-json-record';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Repository } from 'typeorm';
import { FinishedPtStock } from '../traceability/operational.entities';
import {
  PresentationFormat,
  ProcessMachine,
  ReceptionLine,
  SpeciesProcessResultComponent,
} from '../traceability/traceability.entities';
import { DispatchTagItem, InvoiceItem } from '../dispatch/dispatch.entities';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { FinalPalletService } from '../final-pallet/final-pallet.service';
import { PackagingPalletConsumption } from '../packaging/packaging.entities';
import { TraceabilityService } from '../traceability/traceability.service';
import {
  AddPtTagItemDto,
  CloseProcessBalanceDto,
  CreateFruitProcessDto,
  CreatePtTagDto,
  MergeTagsDto,
  SetProcessStatusDto,
  SplitTagDto,
  RestoreProcessPtLinksDto,
  UpdateProcessWeightsDto,
  UpdatePtTagDto,
} from './process.dto';
import {
  FruitProcess,
  FruitProcessComponentValue,
  FruitProcessLineAllocation,
  ProcessResult,
  PtTag,
  PtTagAudit,
  PtTagItem,
  PtTagLineage,
  PtTagMerge,
  PtTagMergeSource,
  RawMaterialMovement,
} from './process.entities';
import { findMermaResultComponent, isMermaResultComponent } from './process-waste-component.util';

const BALANCE_EPS = 0.02;

@Injectable()
export class ProcessService {
  constructor(
    @InjectRepository(FruitProcess) private readonly processRepo: Repository<FruitProcess>,
    @InjectRepository(FruitProcessComponentValue)
    private readonly processComponentValueRepo: Repository<FruitProcessComponentValue>,
    @InjectRepository(PtTag) private readonly tagRepo: Repository<PtTag>,
    @InjectRepository(PtTagItem) private readonly tagItemRepo: Repository<PtTagItem>,
    @InjectRepository(PtTagAudit) private readonly tagAuditRepo: Repository<PtTagAudit>,
    @InjectRepository(FruitProcessLineAllocation) private readonly allocRepo: Repository<FruitProcessLineAllocation>,
    @InjectRepository(RawMaterialMovement) private readonly rawMovementRepo: Repository<RawMaterialMovement>,
    @InjectRepository(PresentationFormat) private readonly formatRepo: Repository<PresentationFormat>,
    @InjectRepository(FinishedPtStock) private readonly finishedPtRepo: Repository<FinishedPtStock>,
    @InjectRepository(ReceptionLine) private readonly receptionLineRepo: Repository<ReceptionLine>,
    @InjectRepository(FinalPalletLine) private readonly finalPalletLineRepo: Repository<FinalPalletLine>,
    @InjectRepository(ProcessMachine) private readonly processMachineRepo: Repository<ProcessMachine>,
    @InjectRepository(SpeciesProcessResultComponent)
    private readonly speciesResultComponentRepo: Repository<SpeciesProcessResultComponent>,
    @InjectRepository(PtTagLineage) private readonly lineageRepo: Repository<PtTagLineage>,
    @InjectRepository(PtTagMerge) private readonly tagMergeRepo: Repository<PtTagMerge>,
    private readonly traceability: TraceabilityService,
    private readonly finalPalletService: FinalPalletService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Código visible alineado al id interno (misma regla que PF-{id} en existencias). */
  private tagCodeFromId(id: number) {
    return `TAR-${id}`;
  }

  private async assignTagCodeFromId(tag: PtTag) {
    tag.tag_code = this.tagCodeFromId(tag.id);
    return this.tagRepo.save(tag);
  }

  /** Búsqueda tolerante a mayúsculas/minúsculas para códigos de formato. */
  private async findFormatByCode(formatCode: string): Promise<PresentationFormat | null> {
    const fc = (formatCode ?? '').trim().toLowerCase();
    if (!fc) return null;
    return this.formatRepo
      .createQueryBuilder('pf')
      .where('LOWER(pf.format_code) = :fc', { fc })
      .getOne();
  }

  /** `max_boxes_per_pallet` del formato limita solo «cajas por pallet» en la unidad PT, no el total de cajas del proceso. */
  private async assertCajasPorPalletVsFormat(formatCode: string, cajasPorPallet: number) {
    const fmt = await this.findFormatByCode(formatCode);
    if (!fmt) throw new BadRequestException(`Formato de presentación no encontrado: ${formatCode}`);
    const max = fmt.max_boxes_per_pallet != null ? Number(fmt.max_boxes_per_pallet) : null;
    if (max != null && max > 0 && cajasPorPallet > max) {
      throw new BadRequestException(
        `Este formato admite como máximo ${max} cajas por pallet físico; indicaste ${cajasPorPallet} en «cajas por pallet».`,
      );
    }
  }

  /**
   * Suma lb de PT ya cargadas en tarjas para estos procesos (cajas × lb/caja por formato de cada unidad).
   * `excludeTarjaId`: al editar cajas de una unidad, excluir esa tarja para calcular el tope en esa misma unidad.
   */
  private async sumLbAllocatedOnPtTagsForProcessIds(
    processIds: number[],
    opts?: { excludeTarjaId?: number },
  ): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (const id of processIds) out.set(id, 0);
    const uniq = [...new Set(processIds)].filter((id) => id > 0);
    if (uniq.length === 0) return out;
    const items = await this.tagItemRepo.find({ where: { process_id: In(uniq) } });
    if (items.length === 0) return out;
    const tagIds = [...new Set(items.map((i) => Number(i.tarja_id)))];
    const skipRepalletTags = await this.repalletUnifiedTarjaIds(tagIds);
    const tags = await this.tagRepo.find({ where: { id: In(tagIds) } });
    const tagById = new Map(tags.map((t) => [Number(t.id), t]));
    const netByFormat = new Map<string, number>();
    for (const it of items) {
      if (opts?.excludeTarjaId != null && Number(it.tarja_id) === opts.excludeTarjaId) continue;
      if (skipRepalletTags.has(Number(it.tarja_id))) continue;
      const tag = tagById.get(Number(it.tarja_id));
      if (!tag) continue;
      const fc = tag.format_code.trim().toLowerCase();
      let net = netByFormat.get(fc);
      if (net == null) {
        net = await this.netLbPerBox(tag.format_code);
        netByFormat.set(fc, net);
      }
      const pid = Number(it.process_id);
      out.set(pid, (out.get(pid) ?? 0) + it.cajas_generadas * net);
    }
    return out;
  }

  /** Alinea `fruit_processes.tarja_id` con las filas en `pt_tag_items` (una tarja si hay una sola; null si hay varias). */
  private async syncFruitProcessTarjaIdFromItems(processId: number): Promise<void> {
    const items = await this.tagItemRepo.find({ where: { process_id: processId } });
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) return;
    if (items.length === 0) {
      proc.tarja_id = null;
    } else if (items.length === 1) {
      proc.tarja_id = Number(items[0].tarja_id);
    } else {
      proc.tarja_id = null;
    }
    await this.processRepo.save(proc);
  }

  /** Máximo de cajas permitidas para un proceso y el formato de la unidad PT (lb + packout). */
  private async getMaxCajasForProcessOnTag(
    tag: Pick<PtTag, 'format_code'>,
    processId: number,
    opts?: { excludeTarjaId?: number },
  ): Promise<number> {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    const netPerBox = await this.netLbPerBox(tag.format_code);
    if (!(netPerBox > 0)) {
      throw new BadRequestException('El formato de la unidad PT no tiene lb/caja definidos para calcular cajas.');
    }
    const allocSum = await this.sumAllocationsLb(proc.id);
    const lbFromProcess =
      allocSum > BALANCE_EPS ? allocSum : Number(proc.lb_entrada ?? proc.peso_procesado_lb);
    const allocMap = await this.sumLbAllocatedOnPtTagsForProcessIds([processId], opts);
    const allocatedPtLb = allocMap.get(processId) ?? 0;
    const lbRemainingForPt = Math.max(0, lbFromProcess - allocatedPtLb);
    const maxCajasTheoretical = Math.floor(lbRemainingForPt / netPerBox + 1e-9);

    const formatEnt = await this.findFormatByCode(tag.format_code);
    const presentationFormatId = formatEnt?.id != null ? Number(formatEnt.id) : undefined;
    let maxCajas = maxCajasTheoretical;
    /** Primera asignación a tarjas: mantener tope conjunto con pallet final / packout cache. */
    if (allocatedPtLb <= BALANCE_EPS) {
      const budget = await this.finalPalletService.getPackoutBudget(processId, presentationFormatId);
      const maxFromPackout =
        budget.suggested_max_boxes_this_pallet != null
          ? Math.floor(budget.suggested_max_boxes_this_pallet + 1e-9)
          : null;
      if (maxFromPackout != null) {
        maxCajas = Math.min(maxCajasTheoretical, maxFromPackout);
      }
    }

    if (!Number.isFinite(maxCajas) || maxCajas < 1) {
      throw new BadRequestException(
        'No hay cajas disponibles según lb del proceso, packout y peso neto por caja del formato.',
      );
    }
    return maxCajas;
  }

  private assertRequestedCajasWithinMax(requestedCajas: number, maxCajas: number): number {
    const req = Math.floor(Number(requestedCajas));
    if (req < 1) {
      throw new BadRequestException('Las cajas a cargar deben ser al menos 1.');
    }
    if (req > maxCajas) {
      throw new BadRequestException(
        `Podés cargar como máximo ${maxCajas} cajas en esta unidad PT según el proceso (indicaste ${req}).`,
      );
    }
    return req;
  }

  /** Alta: sin tarjas aún, packout = 0; si hay componentes/IQF/merma, deben sumar la entrada. */
  private async assertCreateDestinoBalance(
    entrada: number,
    dto: CreateFruitProcessDto,
    speciesId: number | null,
  ): Promise<void> {
    const pack = 0;
    const hasPack = false;
    const hasLegacy = dto.lb_iqf != null || dto.lb_sobrante != null;
    let compSum = 0;

    if (dto.components != null && dto.components.length > 0) {
      const active = await this.listActiveComponentsForSpecies(speciesId);
      const activeIds = new Set(active.map((c) => Number(c.id)));
      for (const c of dto.components) {
        const id = Number(c.component_id);
        if (!activeIds.has(id)) {
          if (Number(c.lb_value) > BALANCE_EPS) {
            throw new BadRequestException(`Componente ${id} no está activo para esta especie`);
          }
          continue;
        }
        if (!Number.isFinite(c.lb_value) || c.lb_value < 0) {
          throw new BadRequestException('lb_value inválido en components');
        }
        compSum += Number(c.lb_value);
      }
    } else if (hasLegacy) {
      compSum = (dto.lb_iqf ?? 0) + (dto.lb_sobrante ?? 0);
    }

    if (!hasPack && !hasLegacy && compSum <= BALANCE_EPS) return;

    if (Math.abs(entrada - (pack + compSum)) > BALANCE_EPS) {
      const diff = entrada - (pack + compSum);
      throw new BadRequestException(
        `Lb entrada (${entrada.toFixed(3)}) debe coincidir con componentes (${(pack + compSum).toFixed(3)}). El packout lo definen las unidades PT después. Diferencia: ${diff.toFixed(3)} lb.`,
      );
    }
  }

  private lotCodeFromLine(line: ReceptionLine): string {
    const t = line.lot_code?.trim();
    if (t) return t;
    return `R${line.id}`;
  }

  private async sumAllocationsLb(processId: number): Promise<number> {
    const raw = await this.allocRepo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(CAST(a.lb_allocated AS DECIMAL)), 0)', 's')
      .where('a.process_id = :id', { id: processId })
      .getRawOne<{ s: string }>();
    return Number(raw?.s ?? 0);
  }

  private computeEntradaLb(proc: FruitProcess, allocSum: number): number {
    if (allocSum > BALANCE_EPS) return allocSum;
    if (proc.lb_entrada != null && String(proc.lb_entrada).trim() !== '') {
      return Number(proc.lb_entrada);
    }
    return Number(proc.peso_procesado_lb) || 0;
  }

  /**
   * Merma en columnas legacy (`merma_lb`, `lb_sobrante`, `lb_merma_balance`) cuando la fila del componente MERMA
   * está vacía o no aplica — mismo criterio que el modal (mermaRegistrada vs componente MERMA).
   */
  private extraMermaLbOutsideComponents(
    fresh: FruitProcess,
    freshValues: FruitProcessComponentValue[],
    activeComponents: Array<{ id: number; codigo: string }>,
  ): number {
    const mermaComp = findMermaResultComponent(activeComponents);
    const mermaRowVal = mermaComp
      ? Number(freshValues.find((v) => Number(v.component_id) === Number(mermaComp.id))?.lb_value ?? 0)
      : 0;
    if (mermaRowVal > BALANCE_EPS) return 0;
    const sob = Number(fresh.lb_sobrante ?? 0);
    const bal = Number(fresh.lb_merma_balance ?? 0);
    if (sob + bal > BALANCE_EPS) return sob + bal;
    return Number(fresh.merma_lb ?? 0);
  }

  /**
   * Merma que cuenta en el cuadre: fila MERMA en componentes, o legacy + implícita (entrada − PT − resto)
   * cuando `merma_lb` quedó desactualizada (p. ej. tras restaurar vínculos PT).
   */
  private resolveMermaLbForBalance(
    entrada: number,
    packProductLb: number,
    componentTotal: number,
    extraMerma: number,
    extraIqf: number,
    freshValues: FruitProcessComponentValue[],
    activeComponents: Array<{ id: number; codigo: string }>,
  ): number {
    const mermaComp = findMermaResultComponent(activeComponents);
    const mermaRowVal = mermaComp
      ? Number(freshValues.find((v) => Number(v.component_id) === Number(mermaComp.id))?.lb_value ?? 0)
      : 0;
    if (mermaRowVal > BALANCE_EPS) return 0;
    const implied = Math.max(0, entrada - packProductLb - componentTotal - extraIqf);
    if (implied <= BALANCE_EPS) return Math.max(0, extraMerma);
    return Math.max(extraMerma, implied);
  }

  /** IQF en `lb_iqf` cuando el componente IQF no tiene lb en tabla de valores (misma idea que merma). */
  private extraIqfLbOutsideComponents(
    fresh: FruitProcess,
    freshValues: FruitProcessComponentValue[],
    activeComponents: Array<{ id: number; codigo: string }>,
  ): number {
    const iqfComp = activeComponents.find((c) => c.codigo.toUpperCase() === 'IQF');
    if (!iqfComp) return 0;
    const iqfRowVal = Number(freshValues.find((v) => Number(v.component_id) === Number(iqfComp.id))?.lb_value ?? 0);
    if (iqfRowVal > BALANCE_EPS) return 0;
    return Number(fresh.lb_iqf ?? 0);
  }

  private ensureProcessEditableBorrador(proc: FruitProcess): void {
    if (proc.process_status !== 'borrador') {
      throw new BadRequestException('Solo se puede editar un proceso en estado borrador');
    }
  }

  private async persistCreateComponentValues(
    em: EntityManager,
    fruitProcessId: number,
    speciesId: number | null,
    dto: CreateFruitProcessDto,
  ): Promise<void> {
    const active = await this.listActiveComponentsForSpecies(speciesId);
    const activeIds = new Set(active.map((c) => Number(c.id)));
    const iqf = active.find((c) => c.codigo.toUpperCase() === 'IQF');
    const merma = findMermaResultComponent(active);

    if (dto.components != null && dto.components.length > 0) {
      for (const c of dto.components) {
        const id = Number(c.component_id);
        if (!activeIds.has(id)) continue;
        if (Number(c.lb_value) <= BALANCE_EPS) continue;
        await em.save(
          em.create(FruitProcessComponentValue, {
            fruit_process_id: fruitProcessId,
            component_id: id,
            lb_value: Number(c.lb_value).toFixed(3),
          }),
        );
      }
    } else {
      if (iqf && dto.lb_iqf != null) {
        await em.save(
          em.create(FruitProcessComponentValue, {
            fruit_process_id: fruitProcessId,
            component_id: iqf.id,
            lb_value: dto.lb_iqf.toFixed(3),
          }),
        );
      }
      if (merma && dto.lb_sobrante != null) {
        await em.save(
          em.create(FruitProcessComponentValue, {
            fruit_process_id: fruitProcessId,
            component_id: merma.id,
            lb_value: dto.lb_sobrante.toFixed(3),
          }),
        );
      }
    }

    const fresh = await em.find(FruitProcessComponentValue, {
      where: { fruit_process_id: fruitProcessId },
    });
    const fp = await em.findOne(FruitProcess, { where: { id: fruitProcessId } });
    if (!fp) return;
    if (iqf) {
      const row = fresh.find((v) => Number(v.component_id) === Number(iqf.id));
      fp.lb_iqf = row ? String(row.lb_value) : undefined;
    }
    if (merma) {
      const row = fresh.find((v) => Number(v.component_id) === Number(merma.id));
      fp.lb_sobrante = row ? String(row.lb_value) : undefined;
    }
    await em.save(fp);
  }

  private async resolveProcessMachineId(machineId?: number | null): Promise<number | undefined> {
    if (machineId == null) return undefined;
    const m = await this.processMachineRepo.findOne({ where: { id: machineId } });
    if (!m) throw new BadRequestException('Línea de proceso (máquina) no encontrada');
    if (!m.activo) throw new BadRequestException('La máquina seleccionada está inactiva');
    return m.id;
  }

  private boxWeightFromCode(formatCode: string) {
    const m = /^(\d+)x(\d+)oz$/i.exec(formatCode);
    if (!m) throw new BadRequestException('format_code inválido');
    return (Number(m[1]) * Number(m[2])) / 16;
  }

  private async netLbPerBox(formatCode: string): Promise<number> {
    const row = await this.findFormatByCode(formatCode);
    if (row && Number(row.net_weight_lb_per_box) > 0) {
      return Number(row.net_weight_lb_per_box);
    }
    return this.boxWeightFromCode(formatCode);
  }

  private async sumAllocationsLbOnLine(receptionLineId: number): Promise<number> {
    const raw = await this.allocRepo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(CAST(a.lb_allocated AS DECIMAL)), 0)', 's')
      .where('a.reception_line_id = :id', { id: receptionLineId })
      .getRawOne<{ s: string }>();
    return Number(raw?.s ?? 0);
  }

  /**
   * Procesos legacy: `reception_line_id` en cabecera sin filas en `fruit_process_line_allocations`.
   */
  private async sumLegacyProcessLbOnLine(receptionLineId: number): Promise<number> {
    const rows = (await this.ds.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN COALESCE(fp.lb_entrada::numeric, 0) > $2::numeric THEN fp.lb_entrada::numeric
          ELSE fp.peso_procesado_lb::numeric
        END
      ), 0)::text AS s
      FROM fruit_processes fp
      WHERE fp.deleted_at IS NULL
        AND fp.reception_line_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM fruit_process_line_allocations a WHERE a.process_id = fp.id
        )
      `,
      [receptionLineId, BALANCE_EPS],
    )) as Array<{ s: string }>;
    return Number(rows[0]?.s ?? 0);
  }

  /** Lb ya vaciadas de esta línea a proceso (asignaciones + procesos legacy en la línea). */
  private async sumConsumedLbOnLine(receptionLineId: number): Promise<number> {
    const [allocated, legacy] = await Promise.all([
      this.sumAllocationsLbOnLine(receptionLineId),
      this.sumLegacyProcessLbOnLine(receptionLineId),
    ]);
    return allocated + legacy;
  }

  /**
   * Saldo por línea = neto recepción − lb ya repartidas/vaciadas a proceso en esa línea.
   * No usa estado documental ni kardex MP (solo cruce recepción ↔ proceso).
   */
  private computeLineAvailableLb(netLb: number, consumedLb: number): number {
    const net = Number(netLb) || 0;
    if (net <= BALANCE_EPS) return 0;
    return Math.max(0, net - Math.max(0, Number(consumedLb) || 0));
  }

  private async balanceAvailableOnLine(receptionLineId: number): Promise<number> {
    const line = await this.receptionLineRepo.findOne({
      where: { id: receptionLineId },
      select: ['id', 'net_lb'],
    });
    if (!line) return 0;
    const consumed = await this.sumConsumedLbOnLine(receptionLineId);
    return this.computeLineAvailableLb(Number(line.net_lb) || 0, consumed);
  }

  /**
   * Tope editable para un proceso en una línea: neto recepción − lb ya repartidas en la línea
   * + lo que este proceso ya tiene (permite bajar tras corregir el neto de la recepción).
   */
  private async maxEditableLbOnLineForProcess(
    receptionLineId: number,
    currentLbOnThisProcess: number,
  ): Promise<number> {
    const line = await this.receptionLineRepo.findOne({
      where: { id: receptionLineId },
      select: ['id', 'net_lb'],
    });
    if (!line) return 0;
    const net = Number(line.net_lb) || 0;
    const consumed = await this.sumConsumedLbOnLine(receptionLineId);
    const current = Math.max(0, Number(currentLbOnThisProcess) || 0);
    const headroom = Math.max(0, net - consumed + current);
    /** Si la recepción se ajustó después, igual se puede conservar lo ya asignado a este proceso. */
    return Math.max(current, headroom);
  }

  /**
   * Tarjas PT creadas solo como etiqueta unificada del resultado de un repallet (`final_pallets.tarja_id` +
   * evento activo). No deben sumarse al cache `lb_packout`: duplican cajas ya contadas en tarjas de producción.
   */
  private async repalletUnifiedTarjaIds(tagIds: number[]): Promise<Set<number>> {
    const uniq = [...new Set(tagIds)].filter((id) => id > 0);
    if (uniq.length === 0) return new Set();
    const out = new Set<number>();
    const CHUNK = 8000;
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const slice = uniq.slice(i, i + CHUNK);
      const rows = await this.ds.query(
        `SELECT DISTINCT fp.tarja_id AS tid
         FROM final_pallets fp
         INNER JOIN repallet_events re
           ON re.result_final_pallet_id = fp.id AND re.reversed_at IS NULL
         WHERE fp.tarja_id IS NOT NULL AND fp.tarja_id = ANY($1::bigint[])`,
        [slice],
      );
      for (const r of rows as { tid: string | number }[]) {
        const n = Number(r.tid);
        if (Number.isFinite(n) && n > 0) out.add(n);
      }
    }
    return out;
  }

  /** Suma lb de PT por proceso: Σ (cajas en tarja × lb netas por caja según formato). */
  private async computeLbPackoutForProcessIds(processIds: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (const id of processIds) out.set(id, 0);
    if (processIds.length === 0) return out;

    const items = await this.tagItemRepo.find({
      where: { process_id: In(processIds) },
    });
    if (items.length === 0) return out;

    const tagIds = [...new Set(items.map((i) => Number(i.tarja_id)))];
    const skipTags = await this.repalletUnifiedTarjaIds(tagIds);
    const tags = await this.tagRepo.find({ where: { id: In(tagIds) } });
    const tagById = new Map(tags.map((t) => [t.id, t]));
    const formats = [...new Set(tags.map((t) => t.format_code.trim().toLowerCase()))];
    const netByFormat = new Map<string, number>();
    for (const fc of formats) {
      netByFormat.set(fc, await this.netLbPerBox(fc));
    }

    for (const it of items) {
      const tid = Number(it.tarja_id);
      if (skipTags.has(tid)) continue;
      const tag = tagById.get(tid);
      if (!tag) continue;
      const fc = tag.format_code.trim().toLowerCase();
      const net = netByFormat.get(fc) ?? (await this.netLbPerBox(fc));
      const pid = Number(it.process_id);
      const lb = it.cajas_generadas * net;
      out.set(pid, (out.get(pid) ?? 0) + lb);
    }
    return out;
  }

  /** Libras de pallet final asignadas a cada proceso (pallets no anulados, suma de líneas). */
  private async computeUsedLbFromFinalPallets(processIds: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    const uniq = [...new Set(processIds)].filter((id) => id > 0);
    for (const id of uniq) out.set(id, 0);
    if (uniq.length === 0) return out;

    const raw = await this.finalPalletLineRepo
      .createQueryBuilder('l')
      .innerJoin(FinalPallet, 'fp', 'fp.id = l.final_pallet_id')
      .select('l.fruit_process_id', 'pid')
      .addSelect('COALESCE(SUM(CAST(l.pounds AS DECIMAL)), 0)', 's')
      .where('l.fruit_process_id IN (:...ids)', { ids: uniq })
      .andWhere('l.fruit_process_id IS NOT NULL')
      .andWhere("fp.status != 'anulado'")
      .groupBy('l.fruit_process_id')
      .getRawMany<{ pid: string; s: string }>();

    for (const row of raw) {
      const pid = Number(row.pid);
      if (pid > 0) out.set(pid, Number(row.s ?? 0));
    }
    return out;
  }

  private async resolveProcessSpeciesId(proc: FruitProcess): Promise<number | null> {
    if (proc.reception_line_id != null) {
      const line = await this.receptionLineRepo.findOne({ where: { id: proc.reception_line_id } });
      if (line) return Number(line.species_id);
    }
    const rec = await this.traceability.getReception(proc.recepcion_id);
    return rec?.variety?.species?.id != null ? Number(rec.variety.species.id) : null;
  }

  private async listActiveComponentsForSpecies(speciesId: number | null) {
    if (speciesId == null || speciesId <= 0) return [];
    const links = await this.speciesResultComponentRepo.find({
      where: { species_id: speciesId, activo: true },
      relations: ['component'],
      order: { component_id: 'ASC' },
    });
    return links
      .map((l) => l.component)
      .filter((c) => c && c.activo)
      .sort((a, b) => a.sort_order - b.sort_order || a.nombre.localeCompare(b.nombre));
  }

  /** Persiste lb_packout cache (solo desde tarjas: Σ cajas × lb/caja por formato de tarja). */
  private async refreshLbPackoutForProcessIds(processIds: number[]) {
    const uniq = [...new Set(processIds)].filter((id) => id > 0);
    if (uniq.length === 0) return;
    const map = await this.computeLbPackoutForProcessIds(uniq);
    for (const pid of uniq) {
      const lb = map.get(pid) ?? 0;
      await this.processRepo.update({ id: pid }, { lb_packout: lb.toFixed(3) });
    }
  }

  private async refreshFinishedPtStockAggregate(
    formatCode: string,
    clientId: number | null,
    brandId: number | null,
  ) {
    const tags = await this.tagRepo.find({
      where: {
        format_code: formatCode,
        client_id: clientId === null ? IsNull() : clientId,
        brand_id: brandId === null ? IsNull() : brandId,
      },
    });
    const netPerBox = await this.netLbPerBox(formatCode);
    let totalBoxes = 0;
    for (const t of tags) {
      totalBoxes += t.total_cajas;
    }
    const netLb = totalBoxes * netPerBox;
    let row = await this.finishedPtRepo.findOne({
      where: {
        format_code: formatCode,
        client_id: clientId === null ? IsNull() : clientId,
        brand_id: brandId === null ? IsNull() : brandId,
      },
    });
    if (!row) {
      row = this.finishedPtRepo.create({
        client_id: clientId,
        brand_id: brandId,
        format_code: formatCode,
        boxes: totalBoxes,
        net_lb: netLb.toFixed(3),
      });
    } else {
      row.boxes = totalBoxes;
      row.net_lb = netLb.toFixed(3);
    }
    await this.finishedPtRepo.save(row);
  }

  private async refreshFinishedPtStockForTag(tag: PtTag) {
    const netPerBox = await this.netLbPerBox(tag.format_code);
    tag.net_weight_lb = (tag.total_cajas * netPerBox).toFixed(3);
    await this.tagRepo.save(tag);
    await this.refreshFinishedPtStockAggregate(tag.format_code, tag.client_id ?? null, tag.brand_id ?? null);
  }

  private readonly processListRelations = [
    'reception',
    'reception.producer',
    'reception.variety',
    'reception.variety.species',
    'reception_line',
    'reception_line.species',
    'reception_line.variety',
    'process_machine',
  ] as const;

  /**
   * Procesos filtrados por período / maestros, sin límite de 500: para informes que deben
   * coincidir con la misma lógica que el listado (rendimiento, merma en lb_sobrante, etc.).
   */
  async listProcessesForReporting(opts: {
    fecha_desde?: string;
    fecha_hasta?: string;
    productor_id?: number | null;
    variedad_id?: number | null;
  }) {
    const qb = this.processRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.reception', 'reception')
      .leftJoinAndSelect('reception.producer', 'reception_producer')
      .leftJoinAndSelect('reception.variety', 'reception_variety')
      .leftJoinAndSelect('reception_variety.species', 'reception_variety_species')
      .leftJoinAndSelect('p.reception_line', 'reception_line')
      .leftJoinAndSelect('reception_line.species', 'reception_line_species')
      .leftJoinAndSelect('reception_line.variety', 'reception_line_variety')
      .leftJoinAndSelect('p.process_machine', 'process_machine')
      .orderBy('p.id', 'DESC');
    const fd = opts.fecha_desde?.trim();
    const fh = opts.fecha_hasta?.trim();
    if (fd && /^\d{4}-\d{2}-\d{2}$/.test(fd)) {
      qb.andWhere(`(p.fecha_proceso)::date >= :fd`, { fd });
    }
    if (fh && /^\d{4}-\d{2}-\d{2}$/.test(fh)) {
      qb.andWhere(`(p.fecha_proceso)::date <= :fh`, { fh });
    }
    if (opts.productor_id != null && opts.productor_id > 0) {
      qb.andWhere('p.productor_id = :pid', { pid: opts.productor_id });
    }
    if (opts.variedad_id != null && opts.variedad_id > 0) {
      qb.andWhere('p.variedad_id = :vid', { vid: opts.variedad_id });
    }
    const rows = await qb.getMany();
    return this.buildProcessListRows(rows);
  }

  async listProcesses() {
    const rows = await this.processRepo.find({
      order: { id: 'DESC' },
      take: 500,
      relations: [...this.processListRelations],
    });
    return this.buildProcessListRows(rows);
  }

  /** Misma forma enriquecida que `listProcesses` (tarjas, allocations, % packout / entrada). */
  private async buildProcessListRows(rows: FruitProcess[]) {
    if (rows.length === 0) return [];
    const packMap = await this.computeLbPackoutForProcessIds(rows.map((r) => r.id));
    const usedFinalPalletByProcess = await this.computeUsedLbFromFinalPallets(rows.map((r) => r.id));
    const speciesIds = [
      ...new Set(
        rows
          .map((r) => Number(r.reception_line?.species?.id ?? r.reception?.variety?.species?.id ?? 0))
          .filter((id) => id > 0),
      ),
    ];
    const speciesLinks = speciesIds.length
      ? await this.speciesResultComponentRepo.find({
          where: { species_id: In(speciesIds), activo: true },
          relations: ['component'],
        })
      : [];
    const componentsBySpecies = new Map<number, Array<{ id: number; codigo: string; nombre: string }>>();
    for (const l of speciesLinks) {
      if (!l.component?.activo) continue;
      const sid = Number(l.species_id);
      const arr = componentsBySpecies.get(sid) ?? [];
      arr.push({ id: Number(l.component_id), codigo: l.component.codigo, nombre: l.component.nombre });
      componentsBySpecies.set(sid, arr);
    }
    for (const [sid, arr] of componentsBySpecies) {
      arr.sort((a, b) => a.codigo.localeCompare(b.codigo));
      componentsBySpecies.set(sid, arr);
    }
    const pids = rows.map((r) => r.id);
    const ptAllocByPid = await this.sumLbAllocatedOnPtTagsForProcessIds(pids);
    const componentValues = await this.processComponentValueRepo.find({
      where: { fruit_process_id: In(pids) },
      relations: ['component'],
    });
    const allAllocRows = pids.length
      ? await this.allocRepo.find({ where: { process_id: In(pids) }, order: { id: 'ASC' } })
      : [];
    const allocByPid = new Map<number, typeof allAllocRows>();
    for (const a of allAllocRows) {
      const pid = Number(a.process_id);
      const arr = allocByPid.get(pid) ?? [];
      arr.push(a);
      allocByPid.set(pid, arr);
    }
    const compByProcess = new Map<number, Array<{ id: number; codigo: string; nombre: string; lb_value: string }>>();
    for (const cv of componentValues) {
      const pid = Number(cv.fruit_process_id);
      const arr = compByProcess.get(pid) ?? [];
      arr.push({
        id: Number(cv.component_id),
        codigo: cv.component?.codigo ?? `C${cv.component_id}`,
        nombre: cv.component?.nombre ?? `Componente ${cv.component_id}`,
        lb_value: cv.lb_value,
      });
      compByProcess.set(pid, arr);
    }
    return rows.map((r) => {
      const lineVar = r.reception_line?.variety;
      const lineSp = r.reception_line?.species;
      const headerVar = r.reception?.variety;
      const headerSp = headerVar?.species;
      const packComputed = packMap.get(r.id) ?? 0;
      const packPlanned = r.lb_packout != null ? Number(r.lb_packout) : 0;
      /**
       * Si hay suma desde tarjas (excl. tarjas solo-repallet), manda sobre el cache en BD: evita lb_packout
       * inflado por ítems duplicados de tarja unificada de repallet.
       * Si aún no hay tarjas, el cache puede adelantar el valor.
       */
      const packPlannedEffective =
        packComputed > BALANCE_EPS ? packComputed : Math.max(packPlanned, packComputed);
      const packAssociated = usedFinalPalletByProcess.get(r.id) ?? 0;
      const packRemainingManual = Math.max(0, packPlannedEffective - packAssociated);
      const packRemaining = packComputed > BALANCE_EPS ? packComputed : packRemainingManual;
      /** Lb packout para %: tarjas si hay; si no, asociado a pallets + saldo manual (sin duplicar). */
      const lbPackoutForPct =
        packComputed > BALANCE_EPS ? packComputed : packAssociated + packRemainingManual;
      const rec = r.reception;
      let reception_ref_suggestion: string | null = null;
      let reception_ref_for_pallet: string | null = null;
      if (rec) {
        const ra = new Date(rec.received_at);
        const ymd = `${ra.getFullYear()}${String(ra.getMonth() + 1).padStart(2, '0')}${String(ra.getDate()).padStart(2, '0')}`;
        const pfx = (rec.producer?.codigo ?? '').trim() || `P${rec.producer_id}`;
        reception_ref_suggestion = `${pfx}-${ymd}`;
        reception_ref_for_pallet = receptionReferenceDisplay(rec);
      }
      const sid = Number(lineSp?.id ?? headerSp?.id ?? 0);
      const activeComponents = sid > 0 ? componentsBySpecies.get(sid) ?? [] : [];
      const valueByComp = new Map((compByProcess.get(r.id) ?? []).map((v) => [Number(v.id), v.lb_value]));
      const resolveLbValueForComponent = (comp: { id: number; codigo: string }) => {
        const raw = valueByComp.get(comp.id);
        if (raw != null && Math.abs(Number(raw)) > BALANCE_EPS) return String(raw);
        const code = comp.codigo.toUpperCase();
        if (code === 'IQF' && r.lb_iqf != null && Math.abs(Number(r.lb_iqf)) > BALANCE_EPS) return String(r.lb_iqf);
        if (isMermaResultComponent({ codigo: code }) && r.lb_sobrante != null && Math.abs(Number(r.lb_sobrante)) > BALANCE_EPS) {
          return String(r.lb_sobrante);
        }
        return raw ?? '0.000';
      };
      const allocs = allocByPid.get(r.id) ?? [];
      const sumAlloc = allocs.reduce((s, a) => s + Number(a.lb_allocated), 0);
      const entradaLb =
        sumAlloc > BALANCE_EPS ? sumAlloc : Number(r.lb_entrada ?? r.peso_procesado_lb) || 0;
      const allocatedPtLb = ptAllocByPid.get(r.id) ?? 0;
      const puede_nueva_unidad_pt = entradaLb - allocatedPtLb > BALANCE_EPS;
      const porcentajePackoutSobreEntrada =
        entradaLb > BALANCE_EPS
          ? Math.min(100, (lbPackoutForPct / entradaLb) * 100).toFixed(4)
          : '0.0000';
      const pctOfEntrada = (lb: number) => {
        if (!Number.isFinite(lb) || lb <= BALANCE_EPS) return '0.00';
        if (entradaLb <= 0) return '—';
        return ((lb / entradaLb) * 100).toFixed(2);
      };
      return {
      id: r.id,
        csv_process_ref: r.csv_process_ref != null ? Number(r.csv_process_ref) : null,
      recepcion_id: Number(r.recepcion_id),
        reception_line_id: r.reception_line_id != null ? Number(r.reception_line_id) : null,
        process_machine_id: r.process_machine_id != null ? Number(r.process_machine_id) : null,
        process_machine_codigo: r.process_machine?.codigo ?? null,
        process_machine_nombre: r.process_machine?.nombre ?? null,
        process_machine_kind: r.process_machine?.kind ?? null,
      fecha_proceso: r.fecha_proceso,
      productor_id: Number(r.productor_id),
      variedad_id: Number(r.variedad_id),
        especie_id: (lineSp?.id ?? headerSp?.id) ?? null,
        especie_nombre: (lineSp?.nombre ?? headerSp?.nombre) ?? null,
        productor_nombre: r.reception?.producer?.nombre ?? null,
        variedad_nombre: (lineVar?.nombre ?? headerVar?.nombre) ?? null,
        temperatura_f: r.temperatura_f ?? null,
        nota: r.nota ?? null,
        process_status: r.process_status ?? 'borrador',
        allocations: allocs.map((a) => ({
          reception_line_id: Number(a.reception_line_id),
          lot_code: a.lot_code,
          lb_allocated: a.lb_allocated,
        })),
        lb_entrada: entradaLb > 0 ? entradaLb.toFixed(3) : (r.lb_entrada ?? null),
        lb_iqf: r.lb_iqf ?? null,
        lb_packout: packRemaining.toFixed(3),
        lb_packout_planned: packPlannedEffective.toFixed(3),
        lb_packout_asociado: packAssociated.toFixed(3),
        lb_packout_restante: packRemaining.toFixed(3),
        lb_sobrante: r.lb_sobrante ?? null,
        lb_producto_terminado: r.lb_producto_terminado ?? null,
        lb_desecho: r.lb_desecho ?? null,
        lb_jugo: r.lb_jugo ?? null,
        lb_merma_balance: r.lb_merma_balance ?? null,
        entrada_lb_basis: entradaLb > 0 ? entradaLb.toFixed(3) : null,
        lb_packout_asociado_pct_of_entrada: pctOfEntrada(packAssociated),
        lb_packout_restante_pct_of_entrada: pctOfEntrada(packRemaining),
        components: activeComponents.map((c) => {
          const lbStr = resolveLbValueForComponent(c);
          const lbNum = Number(lbStr);
          return {
            id: c.id,
            codigo: c.codigo,
            nombre: c.nombre,
            lb_value: lbStr,
            pct_of_entrada: pctOfEntrada(lbNum),
          };
        }),
        balance_closed: r.balance_closed ?? false,
      peso_procesado_lb: r.peso_procesado_lb,
      merma_lb: r.merma_lb,
        porcentaje_procesado: porcentajePackoutSobreEntrada,
      resultado: r.resultado,
      tarja_id: r.tarja_id != null ? Number(r.tarja_id) : null,
        puede_nueva_unidad_pt,
        /** Lb de entrada ya imputadas a unidades PT (Σ cajas × lb/caja por formato de cada tarja). */
        lb_pt_asignadas: allocatedPtLb > BALANCE_EPS ? allocatedPtLb.toFixed(3) : '0.000',
        /** Lb que aún pueden distribuirse en nuevas unidades PT sin superar la entrada. */
        lb_pt_restante: Math.max(0, entradaLb - allocatedPtLb).toFixed(3),
        received_at: rec?.received_at?.toISOString?.() ?? null,
        reception_ref_suggestion,
        reception_ref_for_pallet,
      created_at: r.created_at,
      };
    });
  }

  /** Misma forma que cada elemento de `listProcesses` (composición + %), para PDF e informes. */
  async getProcessRowForReport(id: number) {
    const rows = await this.listProcesses();
    const row = rows.find((x) => x.id === id);
    if (!row) throw new NotFoundException('Proceso no encontrado');
    return row;
  }

  /** Fila de listado para una unidad PT (misma forma que `listPtTagsWithItems`). */
  private async buildPtTagListRow(tagId: number) {
    const t = await this.tagRepo.findOne({ where: { id: tagId }, relations: ['client', 'brand'] });
    if (!t) throw new NotFoundException('Unidad PT no encontrada');
    const mergeHit = await this.tagMergeRepo.findOne({
      where: { result_tarja_id: tagId },
      select: ['result_tarja_id'],
    });
    const excluidaSumaPackout = await this.repalletUnifiedTarjaIds([tagId]);
    const items = await this.tagItemRepo.find({ where: { tarja_id: tagId }, order: { id: 'ASC' } });
    const processIds = [...new Set(items.map((i) => Number(i.process_id)))];
    const processes =
      processIds.length > 0
        ? await this.processRepo.find({ where: { id: In(processIds) } })
        : [];
    const procById = new Map(processes.map((p) => [p.id, p]));
    return {
      id: t.id,
      tag_code: t.tag_code,
      es_union_tarjas: mergeHit != null,
      excluida_suma_packout: excluidaSumaPackout.has(Number(t.id)),
      fecha: t.fecha,
      resultado: t.resultado,
      format_code: t.format_code,
      cajas_por_pallet: t.cajas_por_pallet,
      total_cajas: t.total_cajas,
      total_pallets: t.total_pallets,
      client_id: t.client_id ?? null,
      brand_id: t.brand_id ?? null,
      bol: t.bol ?? null,
      net_weight_lb: t.net_weight_lb ?? null,
      items: items.map((i) => {
        const proc = procById.get(Number(i.process_id));
        return {
          id: i.id,
          tarja_id: Number(i.tarja_id),
          process_id: Number(i.process_id),
          productor_id: Number(i.productor_id),
          cajas_generadas: i.cajas_generadas,
          pallets_generados: i.pallets_generados,
          process: proc
            ? {
                id: proc.id,
                peso_procesado_lb: proc.peso_procesado_lb,
                merma_lb: proc.merma_lb,
                resultado: proc.resultado,
                fecha_proceso: proc.fecha_proceso,
              }
            : null,
        };
      }),
    };
  }

  async listPtTagsWithItems() {
    const tags = await this.tagRepo.find({
      order: { id: 'DESC' },
      take: 3000,
      relations: ['client', 'brand'],
    });
    const mergeRows = await this.tagMergeRepo.find({ select: ['result_tarja_id'] });
    const mergeResultIds = new Set(mergeRows.map((m) => Number(m.result_tarja_id)));
    const tagIdsNum = tags.map((t) => Number(t.id));
    const excluidaSumaPackout = await this.repalletUnifiedTarjaIds(tagIdsNum);

    const itemsByTarjaId = new Map<number, PtTagItem[]>();
    const TAG_CHUNK = 500;
    for (let i = 0; i < tagIdsNum.length; i += TAG_CHUNK) {
      const slice = tagIdsNum.slice(i, i + TAG_CHUNK);
      if (slice.length === 0) continue;
      const part = await this.tagItemRepo.find({
        where: { tarja_id: In(slice) },
        order: { id: 'ASC' },
      });
      for (const it of part) {
        const tid = Number(it.tarja_id);
        let list = itemsByTarjaId.get(tid);
        if (!list) {
          list = [];
          itemsByTarjaId.set(tid, list);
        }
        list.push(it);
      }
    }

    const processIdSet = new Set<number>();
    for (const list of itemsByTarjaId.values()) {
      for (const it of list) processIdSet.add(Number(it.process_id));
    }
    const processIds = [...processIdSet];
    const processes: FruitProcess[] = [];
    const PROC_CHUNK = 500;
    for (let i = 0; i < processIds.length; i += PROC_CHUNK) {
      const slice = processIds.slice(i, i + PROC_CHUNK);
      const part = await this.processRepo.find({ where: { id: In(slice) } });
      processes.push(...part);
    }
    const procById = new Map(processes.map((p) => [p.id, p]));
    return tags.map((t) => ({
      id: t.id,
      tag_code: t.tag_code,
      /** Unión de 2+ unidades PT (repaletización a nivel tarja); las fuentes quedan en 0 cajas — no duplicar en cierres. */
      es_union_tarjas: mergeResultIds.has(t.id),
      /**
       * Tarja usada solo como etiqueta unificada del resultado de repallet (misma exclusión que en Σ packout proceso).
       * No debe listarse como “unidad PT de producción” vinculada al proceso en UI.
       */
      excluida_suma_packout: excluidaSumaPackout.has(Number(t.id)),
      fecha: t.fecha,
      resultado: t.resultado,
      format_code: t.format_code,
      cajas_por_pallet: t.cajas_por_pallet,
      total_cajas: t.total_cajas,
      total_pallets: t.total_pallets,
      client_id: t.client_id ?? null,
      brand_id: t.brand_id ?? null,
      bol: t.bol ?? null,
      net_weight_lb: t.net_weight_lb ?? null,
      items: (itemsByTarjaId.get(Number(t.id)) ?? []).map((i) => {
          const proc = procById.get(Number(i.process_id));
          return {
            id: i.id,
            tarja_id: Number(i.tarja_id),
            process_id: Number(i.process_id),
            productor_id: Number(i.productor_id),
            cajas_generadas: i.cajas_generadas,
            pallets_generados: i.pallets_generados,
            process: proc
              ? {
                  id: proc.id,
                  peso_procesado_lb: proc.peso_procesado_lb,
                  merma_lb: proc.merma_lb,
                  resultado: proc.resultado,
                  fecha_proceso: proc.fecha_proceso,
                }
              : null,
          };
        }),
    }));
  }

  /**
   * Resumen MP disponible (fin del día): Σ recepción neta − Σ volteado/vaciado a proceso, por productor.
   * Cruza todo lo recibido (no anulado) con asignaciones reales a `fruit_processes`, sin filtrar por estado
   * documental (cerrado/confirmado/borrador).
   */
  async getMpDisponibleResumen(opts?: { planningOnly?: boolean; borradorOnly?: boolean }): Promise<{
    total_lb: number;
    line_count: number;
    producer_count: number;
  }> {
    let stateFilter = "ds.codigo <> 'anulado'";
    if (opts?.borradorOnly) {
      stateFilter = "ds.codigo = 'borrador'";
    } else if (opts?.planningOnly) {
      /** @deprecated Preferir resumen sin filtro de estado; se mantiene por compatibilidad de query string. */
      stateFilter = "ds.codigo <> 'anulado'";
    }

    const rows = (await this.ds.query(
      `
      WITH recv AS (
        SELECT r.producer_id, COALESCE(SUM(rl.net_lb::numeric), 0) AS net_lb
        FROM reception_lines rl
        INNER JOIN receptions r ON r.id = rl.reception_id
        INNER JOIN document_states ds ON ds.id = r.document_state_id
        WHERE ${stateFilter}
        GROUP BY r.producer_id
      ),
      consumed_alloc AS (
        SELECT fp.productor_id AS producer_id, COALESCE(SUM(a.lb_allocated::numeric), 0) AS consumed_lb
        FROM fruit_processes fp
        INNER JOIN fruit_process_line_allocations a ON a.process_id = fp.id
        WHERE fp.deleted_at IS NULL
        GROUP BY fp.productor_id
      ),
      consumed_legacy AS (
        SELECT fp.productor_id AS producer_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(fp.lb_entrada::numeric, 0) > $1::numeric THEN fp.lb_entrada::numeric
              ELSE fp.peso_procesado_lb::numeric
            END
          ), 0) AS consumed_lb
        FROM fruit_processes fp
        WHERE fp.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM fruit_process_line_allocations a WHERE a.process_id = fp.id)
        GROUP BY fp.productor_id
      ),
      producer_avail AS (
        SELECT
          recv.producer_id,
          GREATEST(
            0,
            recv.net_lb
              - COALESCE(consumed_alloc.consumed_lb, 0)
              - COALESCE(consumed_legacy.consumed_lb, 0)
          ) AS available_lb
        FROM recv
        LEFT JOIN consumed_alloc ON consumed_alloc.producer_id = recv.producer_id
        LEFT JOIN consumed_legacy ON consumed_legacy.producer_id = recv.producer_id
      ),
      line_alloc AS (
        SELECT reception_line_id, COALESCE(SUM(lb_allocated::numeric), 0) AS s
        FROM fruit_process_line_allocations
        GROUP BY reception_line_id
      ),
      line_legacy AS (
        SELECT fp.reception_line_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(fp.lb_entrada::numeric, 0) > $1::numeric THEN fp.lb_entrada::numeric
              ELSE fp.peso_procesado_lb::numeric
            END
          ), 0) AS s
        FROM fruit_processes fp
        WHERE fp.deleted_at IS NULL
          AND fp.reception_line_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM fruit_process_line_allocations a WHERE a.process_id = fp.id)
        GROUP BY fp.reception_line_id
      ),
      line_avail AS (
        SELECT rl.id
        FROM reception_lines rl
        INNER JOIN receptions r ON r.id = rl.reception_id
        INNER JOIN document_states ds ON ds.id = r.document_state_id
        LEFT JOIN line_alloc la ON la.reception_line_id = rl.id
        LEFT JOIN line_legacy ll ON ll.reception_line_id = rl.id
        WHERE ${stateFilter}
          AND GREATEST(
            0,
            rl.net_lb::numeric - COALESCE(la.s, 0) - COALESCE(ll.s, 0)
          ) > $1::numeric
      )
      SELECT
        COALESCE((SELECT SUM(available_lb) FROM producer_avail), 0)::text AS total_lb,
        (SELECT COUNT(*)::int FROM line_avail) AS line_count,
        (SELECT COUNT(*)::int FROM producer_avail WHERE available_lb > $1::numeric) AS producer_count
      `,
      [BALANCE_EPS],
    )) as Array<{ total_lb: string; line_count: number; producer_count: number }>;

    const row = rows[0];
    return {
      total_lb: Number(row?.total_lb ?? 0) || 0,
      line_count: Number(row?.line_count ?? 0) || 0,
      producer_count: Number(row?.producer_count ?? 0) || 0,
    };
  }

  /** Productores que tienen al menos una línea de recepción con saldo disponible para procesar. */
  async listProducerIdsWithEligibleMp(opts?: { planningOnly?: boolean; borradorOnly?: boolean }): Promise<number[]> {
    const qb = this.receptionLineRepo
      .createQueryBuilder('rl')
      .innerJoin('rl.reception', 'r')
      .innerJoin('r.document_state', 'rds')
      .select('DISTINCT r.producer_id', 'pid');
    if (opts?.planningOnly) {
      qb.where("rds.codigo <> 'anulado'");
    } else if (opts?.borradorOnly) {
      qb.where("rds.codigo = 'borrador'");
    } else {
      qb.where("rds.codigo <> 'anulado'");
    }
    const raw = await qb.getRawMany();
    const out: number[] = [];
    for (const row of raw) {
      const pid = Number((row as { pid: string }).pid);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const lines = await this.listEligibleMpLinesForProducer(pid, opts);
      if (lines.length > 0) out.push(pid);
    }
    return out.sort((a, b) => a - b);
  }

  /** Líneas de MP con saldo > 0 para vaciar a proceso (mismo productor). */
  async listEligibleMpLinesForProducer(producerId: number, opts?: { planningOnly?: boolean; borradorOnly?: boolean }) {
    const qb = this.receptionLineRepo
      .createQueryBuilder('rl')
      .innerJoinAndSelect('rl.reception', 'r')
      .innerJoin('r.document_state', 'rds')
      .leftJoinAndSelect('rl.species', 'sp')
      .leftJoinAndSelect('rl.variety', 'v')
      .where('r.producer_id = :pid', { pid: producerId });
    if (opts?.planningOnly) {
      /** Planificación: mismo criterio que alta de proceso — todo salvo anulado (no filtrar por cerrado). */
      qb.andWhere("rds.codigo <> 'anulado'");
    } else if (opts?.borradorOnly) {
      qb.andWhere("rds.codigo = 'borrador'");
    } else {
      /** Alta de proceso (por defecto): incluye borrador; excluye solo anulado. */
      qb.andWhere("rds.codigo <> 'anulado'");
    }
    const lines = await qb
      /** FIFO: primero la fruta más antigua (misma lógica operativa que “vaciar” recepciones viejas). */
      .orderBy('r.received_at', 'ASC')
      .addOrderBy('rl.line_order', 'ASC')
      .getMany();

    const out: Array<{
      reception_line_id: number;
      reception_id: number;
      received_at: Date;
      line_order: number;
      available_lb: number;
      net_lb_line: string;
      lot_code: string;
      species_id: number | null;
      species_nombre: string | null;
      variety_nombre: string | null;
    }> = [];

    for (const rl of lines) {
      const avail = await this.balanceAvailableOnLine(rl.id);
      if (avail <= BALANCE_EPS) continue;
      out.push({
        reception_line_id: rl.id,
        reception_id: Number(rl.reception_id),
        received_at: rl.reception.received_at,
        line_order: rl.line_order,
        available_lb: avail,
        net_lb_line: rl.net_lb,
        lot_code: this.lotCodeFromLine(rl),
        species_id: rl.species_id != null ? Number(rl.species_id) : null,
        species_nombre: rl.species?.nombre ?? null,
        variety_nombre: rl.variety?.nombre ?? null,
      });
    }
    return out;
  }

  /**
   * Líneas editables al corregir reparto MP de un proceso existente.
   * `available_lb` = máximo editable para este proceso (neto recepción − reparto en línea + asignación actual).
   */
  async listEditableMpLinesForProcess(processId: number) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    const producerId = Number(proc.productor_id);
    if (!Number.isFinite(producerId) || producerId <= 0) {
      throw new BadRequestException('Proceso sin productor válido');
    }

    const currentAllocs = await this.allocRepo.find({ where: { process_id: processId } });
    const allocLbByLine = new Map<number, number>();
    for (const a of currentAllocs) {
      allocLbByLine.set(Number(a.reception_line_id), Number(a.lb_allocated) || 0);
    }

    const lineIdsOnProcess = [...allocLbByLine.keys()];

    const linesByProducer = await this.receptionLineRepo
      .createQueryBuilder('rl')
      .innerJoinAndSelect('rl.reception', 'r')
      .innerJoinAndSelect('r.document_state', 'rds')
      .leftJoinAndSelect('rl.species', 'sp')
      .leftJoinAndSelect('rl.variety', 'v')
      .where('r.producer_id = :pid', { pid: producerId })
      .andWhere("rds.codigo <> 'anulado'")
      .orderBy('r.received_at', 'ASC')
      .addOrderBy('rl.line_order', 'ASC')
      .getMany();

    const extraLines =
      lineIdsOnProcess.length > 0
        ? await this.receptionLineRepo.find({
            where: { id: In(lineIdsOnProcess) },
            relations: ['reception', 'reception.document_state', 'species', 'variety'],
          })
        : [];

    const seen = new Set<number>();
    const out: Array<{
      reception_line_id: number;
      reception_id: number;
      received_at: Date;
      line_order: number;
      available_lb: number;
      lb_allocated_current: number;
      net_lb_line: string;
      lot_code: string;
      species_id: number | null;
      species_nombre: string | null;
      variety_nombre: string | null;
    }> = [];

    for (const rl of [...linesByProducer, ...extraLines]) {
      if (seen.has(rl.id)) continue;
      seen.add(rl.id);
      const st = rl.reception?.document_state?.codigo ?? '';
      if (st === 'anulado') continue;

      const current = allocLbByLine.get(rl.id) ?? 0;
      const maxLb = await this.maxEditableLbOnLineForProcess(rl.id, current);
      if (maxLb <= BALANCE_EPS && current <= BALANCE_EPS) continue;

      out.push({
        reception_line_id: rl.id,
        reception_id: Number(rl.reception_id),
        received_at: rl.reception.received_at,
        line_order: rl.line_order,
        available_lb: maxLb,
        lb_allocated_current: current,
        net_lb_line: rl.net_lb,
        lot_code: this.lotCodeFromLine(rl),
        species_id: rl.species_id != null ? Number(rl.species_id) : null,
        species_nombre: rl.species?.nombre ?? null,
        variety_nombre: rl.variety?.nombre ?? null,
      });
    }

    out.sort(
      (a, b) =>
        a.received_at.getTime() - b.received_at.getTime() ||
        a.line_order - b.line_order ||
        a.reception_line_id - b.reception_line_id,
    );
    return out;
  }

  private async replaceProcessLineAllocations(
    proc: FruitProcess,
    allocations: Array<{ reception_line_id: number; lb_allocated: number }>,
  ): Promise<void> {
    const filtered = allocations.filter((a) => Number(a.lb_allocated) > BALANCE_EPS);
    if (!filtered.length) {
      throw new BadRequestException('Indicá al menos una línea de recepción con libras mayores que 0');
    }

    const lineIds = filtered.map((a) => a.reception_line_id);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new BadRequestException('No repetir la misma reception_line_id en allocations');
    }

    const lines = await this.receptionLineRepo.find({
      where: { id: In(lineIds) },
      relations: ['reception', 'reception.document_state'],
    });
    const lineById = new Map(lines.map((l) => [l.id, l]));
    const producerId = Number(proc.productor_id);

    let sumAlloc = 0;
    for (const a of filtered) {
      const lb = Number(a.lb_allocated);
      if (!Number.isFinite(lb) || lb <= BALANCE_EPS) {
        throw new BadRequestException(`lb_allocated inválido en línea ${a.reception_line_id}`);
      }
      const ln = lineById.get(a.reception_line_id);
      if (!ln) throw new BadRequestException(`reception_line_id ${a.reception_line_id} no encontrada`);
      if (Number(ln.reception.producer_id) !== producerId) {
        throw new BadRequestException(`La línea ${a.reception_line_id} no pertenece al productor del proceso`);
      }
      const st = (ln.reception.document_state as { codigo?: string })?.codigo ?? '';
      if (st === 'anulado') {
        throw new BadRequestException(`Recepción de línea ${a.reception_line_id} está anulada`);
      }

      const currentRow = await this.allocRepo.findOne({
        where: { process_id: proc.id, reception_line_id: a.reception_line_id },
      });
      const currentLb = currentRow ? Number(currentRow.lb_allocated) : 0;
      const maxLb = await this.maxEditableLbOnLineForProcess(a.reception_line_id, currentLb);
      if (lb > maxLb + BALANCE_EPS) {
        const netLine = Number(ln.net_lb) || 0;
        throw new BadRequestException(
          `LB insuficientes en línea ${a.reception_line_id}: máximo ${maxLb.toFixed(3)} (neto recepción ${netLine.toFixed(3)}), solicitado ${lb.toFixed(3)}`,
        );
      }
      sumAlloc += lb;
    }

    const receptionIds = [...new Set(filtered.map((a) => Number(lineById.get(a.reception_line_id)!.reception_id)))];
    const recepcionId = Math.min(...receptionIds);
    const firstLine = lineById.get(filtered[0].reception_line_id)!;

    await this.processRepo.manager.transaction(async (em) => {
      await em.delete(RawMaterialMovement, { fruit_process_id: proc.id, movement_kind: 'process_out' });
      await em.delete(FruitProcessLineAllocation, { process_id: proc.id });

      for (const a of filtered) {
        const ln = lineById.get(a.reception_line_id)!;
        await em.save(
          em.create(FruitProcessLineAllocation, {
            process_id: proc.id,
            reception_line_id: a.reception_line_id,
            lot_code: this.lotCodeFromLine(ln),
            lb_allocated: a.lb_allocated.toFixed(3),
          }),
        );
        await em.save(
          em.create(RawMaterialMovement, {
            reception_line_id: a.reception_line_id,
            fruit_process_id: proc.id,
            quantity_delta_lb: (-a.lb_allocated).toFixed(3),
            movement_kind: 'process_out',
            ref_type: 'fruit_process',
            ref_id: proc.id,
          }),
        );
      }

      await em.update(FruitProcess, { id: proc.id }, {
        recepcion_id: recepcionId,
        reception_line_id: firstLine.id,
        variedad_id: firstLine.variety_id,
        peso_procesado_lb: sumAlloc.toFixed(2),
        lb_entrada: sumAlloc.toFixed(3),
      });
    });

    proc.recepcion_id = recepcionId;
    proc.reception_line_id = firstLine.id;
    proc.variedad_id = firstLine.variety_id;
    proc.peso_procesado_lb = sumAlloc.toFixed(2);
    proc.lb_entrada = sumAlloc.toFixed(3);
  }

  async updateProcessWeights(
    processId: number,
    dto: UpdateProcessWeightsDto,
    opts?: { allowClosedIfAdmin?: boolean },
  ) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    if (proc.balance_closed) {
      throw new BadRequestException('No se puede editar pesos de un proceso con balance cerrado');
    }
    if (proc.process_status === 'cerrado' && !opts?.allowClosedIfAdmin) {
      throw new BadRequestException('No se puede editar el reparto de lb de un proceso cerrado');
    }
    const speciesId = await this.resolveProcessSpeciesId(proc);
    const activeComponents = await this.listActiveComponentsForSpecies(speciesId);
    const activeById = new Map(activeComponents.map((c) => [Number(c.id), c]));
    const currentValues = await this.processComponentValueRepo.find({
      where: { fruit_process_id: proc.id },
      relations: ['component'],
    });
    const currentById = new Map(currentValues.map((v) => [Number(v.component_id), v]));

    if (dto.components != null) {
      for (const c of dto.components) {
        const cid = Number(c.component_id);
        const lb = Number(c.lb_value);
        if (!Number.isFinite(cid) || cid <= 0) throw new BadRequestException('component_id inválido en components');
        if (!Number.isFinite(lb) || lb < 0) throw new BadRequestException('lb_value inválido en components');
        if (!activeById.has(cid)) throw new BadRequestException(`Componente ${cid} no está activo para esta especie`);
        const row = currentById.get(cid);
        if (!row) {
          await this.processComponentValueRepo.save(
            this.processComponentValueRepo.create({
              fruit_process_id: proc.id,
              component_id: cid,
              lb_value: lb.toFixed(3),
            }),
          );
        } else {
          row.lb_value = lb.toFixed(3);
          await this.processComponentValueRepo.save(row);
        }
      }
    }

    if (dto.allocations != null) {
      await this.replaceProcessLineAllocations(proc, dto.allocations);
    }

    const allocSum = await this.sumAllocationsLb(proc.id);
    if (allocSum > BALANCE_EPS) {
      proc.lb_entrada = allocSum.toFixed(3);
      proc.peso_procesado_lb = allocSum.toFixed(2);
    } else if (dto.lb_entrada !== undefined) {
      proc.lb_entrada = dto.lb_entrada.toFixed(3);
      proc.peso_procesado_lb = dto.lb_entrada.toFixed(2);
    }

    if (dto.lb_iqf !== undefined) proc.lb_iqf = dto.lb_iqf.toFixed(3);
    if (dto.lb_sobrante !== undefined) proc.lb_sobrante = dto.lb_sobrante.toFixed(3);

    const freshValues = await this.processComponentValueRepo.find({
      where: { fruit_process_id: proc.id },
      relations: ['component'],
    });
    const componentTotal = freshValues
      .filter((v) => activeById.has(Number(v.component_id)))
      .reduce((s, v) => s + Number(v.lb_value), 0);

    const iqfComp = activeComponents.find((c) => c.codigo.toUpperCase() === 'IQF');
    const mermaComp = findMermaResultComponent(activeComponents);
    if (iqfComp) {
      const row = freshValues.find((v) => Number(v.component_id) === Number(iqfComp.id));
      proc.lb_iqf = (row ? Number(row.lb_value) : 0).toFixed(3);
    }
    if (mermaComp) {
      const row = freshValues.find((v) => Number(v.component_id) === Number(mermaComp.id));
      proc.lb_sobrante = (row ? Number(row.lb_value) : 0).toFixed(3);
    }

    if (dto.merma_lb !== undefined) {
      proc.merma_lb = dto.merma_lb.toFixed(3);
      const mermaRowLb = mermaComp
        ? Number(freshValues.find((v) => Number(v.component_id) === Number(mermaComp.id))?.lb_value ?? 0)
        : 0;
      if (mermaRowLb <= BALANCE_EPS) {
        proc.lb_sobrante = '0.000';
        proc.lb_merma_balance = undefined;
      }
    }

    if (dto.nota !== undefined) proc.nota = dto.nota?.trim() || undefined;

    await this.processRepo.save(proc);
    await this.refreshLbPackoutForProcessIds([proc.id]);
    const freshProc = (await this.processRepo.findOne({ where: { id: proc.id } })) ?? proc;
    const cachedPack = freshProc?.lb_packout != null ? Number(freshProc.lb_packout) : 0;
    const computedPack = (await this.computeLbPackoutForProcessIds([proc.id])).get(proc.id) ?? 0;
    const packFromTags =
      computedPack > BALANCE_EPS ? computedPack : Math.max(cachedPack, computedPack);
    const usedOnPallets = (await this.computeUsedLbFromFinalPallets([proc.id])).get(proc.id) ?? 0;
    /** Tarjas y pallets finales suelen ser canales alternativos; max evita duplicar si ambos reflejan el mismo PT. */
    const packProductLb = Math.max(packFromTags, usedOnPallets);
    const extraMerma = this.extraMermaLbOutsideComponents(freshProc, freshValues, activeComponents);
    const extraIqf = this.extraIqfLbOutsideComponents(freshProc, freshValues, activeComponents);
    const entradaCheck = this.computeEntradaLb(proc, await this.sumAllocationsLb(proc.id));
    const mermaLb = this.resolveMermaLbForBalance(
      entradaCheck,
      packProductLb,
      componentTotal,
      extraMerma,
      extraIqf,
      freshValues,
      activeComponents,
    );
    const destinos = packProductLb + componentTotal + mermaLb + extraIqf;

    if (
      dto.components != null ||
      dto.lb_iqf !== undefined ||
      dto.lb_sobrante !== undefined ||
      dto.merma_lb !== undefined ||
      dto.lb_entrada !== undefined ||
      dto.allocations != null
    ) {
      const entrada = this.computeEntradaLb(proc, await this.sumAllocationsLb(proc.id));
      if (Math.abs(entrada - destinos) > BALANCE_EPS) {
        const diff = entrada - destinos;
        throw new BadRequestException(
          `Balance: lb entrada (${entrada.toFixed(3)}) debe ser packout producto (${packProductLb.toFixed(3)} = máx. unidades PT ${packFromTags.toFixed(3)}, pallets ${usedOnPallets.toFixed(3)}) + componentes (${componentTotal.toFixed(3)})` +
            (mermaLb > BALANCE_EPS ? ` + merma (${mermaLb.toFixed(3)})` : '') +
            (extraIqf > BALANCE_EPS ? ` + IQF fuera de tabla (${extraIqf.toFixed(3)})` : '') +
            `. Diferencia: ${diff.toFixed(3)} lb.`,
        );
      }
    }
    return this.processRepo.findOne({ where: { id: proc.id } });
  }

  async createProcess(dto: CreateFruitProcessDto) {
    const allocations = dto.allocations ?? [];
    if (allocations.length === 0) {
      throw new BadRequestException('Indicá al menos una línea de recepción con libras (mismo productor, lotes disponibles).');
    }
    const producerId = dto.producer_id;
    const seen = new Set<number>();
    for (const a of allocations) {
      if (seen.has(a.reception_line_id)) {
        throw new BadRequestException('No repetir la misma reception_line_id en allocations; sume lb en una sola línea');
      }
      seen.add(a.reception_line_id);
    }

    const lineIds = allocations.map((a) => a.reception_line_id);
    const lines = await this.receptionLineRepo.find({
      where: { id: In(lineIds) },
      relations: ['reception', 'species', 'variety'],
    });
    const lineById = new Map(lines.map((l) => [l.id, l]));
    if (lines.length !== lineIds.length) {
      throw new BadRequestException('Alguna línea de recepción no existe');
    }

    let sumAlloc = 0;
    for (const a of allocations) {
      const line = lineById.get(a.reception_line_id)!;
      if (Number(line.reception.producer_id) !== producerId) {
        throw new BadRequestException(
          `La línea ${a.reception_line_id} no pertenece al productor ${producerId}`,
        );
      }
      sumAlloc += a.lb_allocated;
      const avail = await this.balanceAvailableOnLine(a.reception_line_id);
      if (avail + BALANCE_EPS < a.lb_allocated) {
        throw new BadRequestException(
          `LB insuficientes en línea ${a.reception_line_id}: disponible ${avail}, solicitado ${a.lb_allocated}`,
        );
      }
    }

    const lbEntrada = sumAlloc;
    const receptionIds = lines.map((l) => Number(l.reception_id));
    const recepcionId = Math.min(...receptionIds);
    const firstLine = lineById.get(allocations[0].reception_line_id)!;
    const variedadId = firstLine.variety_id;
    const receptionLineId = firstLine.id;
    const speciesId = firstLine.species_id != null ? Number(firstLine.species_id) : null;
    const resultado = dto.resultado ?? ProcessResult.IQF;
    await this.assertCreateDestinoBalance(lbEntrada, dto, speciesId);
    const processMachineId = await this.resolveProcessMachineId(dto.process_machine_id ?? undefined);
    const mermaVal = dto.merma_lb ?? 0;

    const row = await this.processRepo.manager.transaction(async (em) => {
      const fp = await em.save(
        em.create(FruitProcess, {
          recepcion_id: recepcionId,
      fecha_proceso: new Date(dto.fecha_proceso),
          productor_id: producerId,
          variedad_id: variedadId,
          reception_line_id: receptionLineId,
          process_machine_id: processMachineId ?? null,
          peso_procesado_lb: lbEntrada.toFixed(2),
          merma_lb: mermaVal.toFixed(2),
          /** Al alta no hay packout tarjas todavía: 0%; el listado recalcula lb_packout/lb_entrada. */
          porcentaje_procesado: '0.0000',
          resultado,
          nota: dto.nota?.trim() || undefined,
          lb_entrada: lbEntrada.toFixed(3),
          lb_iqf: dto.lb_iqf != null ? dto.lb_iqf.toFixed(3) : undefined,
          lb_sobrante: dto.lb_sobrante != null ? dto.lb_sobrante.toFixed(3) : undefined,
        }),
      );

      await this.persistCreateComponentValues(em, fp.id, speciesId, dto);

      for (const a of allocations) {
        const ln = lineById.get(a.reception_line_id)!;
        await em.save(
          em.create(FruitProcessLineAllocation, {
            process_id: fp.id,
            reception_line_id: a.reception_line_id,
            lot_code: this.lotCodeFromLine(ln),
            lb_allocated: a.lb_allocated.toFixed(3),
          }),
        );
        await em.save(
          em.create(RawMaterialMovement, {
            reception_line_id: a.reception_line_id,
            fruit_process_id: fp.id,
            quantity_delta_lb: (-a.lb_allocated).toFixed(3),
            movement_kind: 'process_out',
            ref_type: 'fruit_process',
            ref_id: fp.id,
          }),
        );
      }

      return em.findOne(FruitProcess, { where: { id: fp.id } });
    });

    return row;
  }

  async closeProcessBalance(processId: number, dto: CloseProcessBalanceDto) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    this.ensureProcessEditableBorrador(proc);
    if (proc.balance_closed) {
      throw new BadRequestException('El balance de este proceso ya está cerrado');
    }
    const entrada = proc.lb_entrada != null ? Number(proc.lb_entrada) : Number(proc.peso_procesado_lb);
    const sum =
      dto.lb_producto_terminado + dto.lb_desecho + dto.lb_merma_balance;
    if (Math.abs(sum - entrada) > BALANCE_EPS) {
      throw new BadRequestException(
        `Balance debe cuadrar 100% con lb de entrada (${entrada}): packout + desecho + merma = ${sum}`,
      );
    }
    proc.lb_producto_terminado = dto.lb_producto_terminado.toFixed(3);
    proc.lb_desecho = dto.lb_desecho.toFixed(3);
    proc.lb_jugo = '0.000';
    proc.lb_merma_balance = dto.lb_merma_balance.toFixed(3);
    proc.balance_closed = true;
    return this.processRepo.save(proc);
  }

  async createTag(dto: CreatePtTagDto) {
    await this.assertCajasPorPalletVsFormat(dto.format_code, dto.cajas_por_pallet);
    const processId = dto.process_id != null && Number(dto.process_id) > 0 ? Number(dto.process_id) : null;
    if (processId != null) {
      return this.createTagWithProcessLink(dto, processId);
    }
    const tmp = `TMP${Date.now()}${Math.random().toString(36).slice(2, 9)}`.slice(0, 64);
    let tag = await this.tagRepo.save(
      this.tagRepo.create({
        fecha: new Date(dto.fecha),
        resultado: dto.resultado,
        format_code: dto.format_code.trim().toLowerCase(),
        cajas_por_pallet: dto.cajas_por_pallet,
        tag_code: tmp,
        client_id: dto.client_id ?? null,
        brand_id: dto.brand_id ?? null,
        bol: dto.bol?.trim() || null,
        total_cajas: 0,
        total_pallets: 0,
      }),
    );
    tag = await this.assignTagCodeFromId(tag);
    return this.buildPtTagListRow(tag.id);
  }

  /** Alta + vínculo proceso en una transacción (un round-trip HTTP). */
  private async createTagWithProcessLink(dto: CreatePtTagDto, processId: number) {
    const tmp = `TMP${Date.now()}${Math.random().toString(36).slice(2, 9)}`.slice(0, 64);
    const tagId = await this.ds.transaction(async (em) => {
      let tag = await em.save(
        em.create(PtTag, {
          fecha: new Date(dto.fecha),
          resultado: dto.resultado,
          format_code: dto.format_code.trim().toLowerCase(),
          cajas_por_pallet: dto.cajas_por_pallet,
          tag_code: tmp,
          client_id: dto.client_id ?? null,
          brand_id: dto.brand_id ?? null,
          bol: dto.bol?.trim() || null,
          total_cajas: 0,
          total_pallets: 0,
        }),
      );
      tag.tag_code = this.tagCodeFromId(tag.id);
      await em.save(PtTag, tag);

      const proc = await em.findOne(FruitProcess, { where: { id: processId } });
      if (!proc) throw new NotFoundException(`Proceso id=${processId} no encontrado`);

      const maxCajas = await this.getMaxCajasForProcessOnTag(tag, processId);
      const cajas =
        dto.cajas_generadas != null
          ? this.assertRequestedCajasWithinMax(dto.cajas_generadas, maxCajas)
          : maxCajas;
      const pallets = Math.max(1, Math.ceil(cajas / tag.cajas_por_pallet));

      await em.save(
        em.create(PtTagItem, {
          tarja_id: tag.id,
          process_id: proc.id,
          productor_id: proc.productor_id,
          cajas_generadas: cajas,
          pallets_generados: pallets,
        }),
      );

      const items = await em.find(PtTagItem, { where: { tarja_id: tag.id } });
      tag.total_cajas = items.reduce((a, i) => a + i.cajas_generadas, 0);
      tag.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
      await em.save(PtTag, tag);

      await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(tag.id, em);
      return tag.id;
    });

    const fresh = await this.tagRepo.findOne({ where: { id: tagId } });
    if (fresh) await this.refreshFinishedPtStockForTag(fresh);
    await this.refreshLbPackoutForProcessIds([processId]);
    await this.syncFruitProcessTarjaIdFromItems(processId);
    return this.buildPtTagListRow(tagId);
  }

  async addProcessToTag(tagId: number, dto: AddPtTagItemDto) {
    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    const proc = await this.processRepo.findOne({ where: { id: dto.process_id } });
    if (!tag) throw new NotFoundException(`Unidad PT id=${tagId} no encontrada`);
    if (!proc) throw new NotFoundException(`Proceso id=${dto.process_id} no encontrado`);

    const exists = await this.tagItemRepo.findOne({ where: { tarja_id: tagId, process_id: dto.process_id } });
    if (exists) throw new BadRequestException('Proceso ya agregado a esta unidad PT');

    if (!tag.cajas_por_pallet || tag.cajas_por_pallet < 1) {
      throw new BadRequestException('Definí cajas por pallet (≥ 1) en la unidad PT antes de vincular un proceso.');
    }
    const maxCajas = await this.getMaxCajasForProcessOnTag(tag, dto.process_id);
    let cajas: number;
    if (dto.cajas_generadas != null) {
      cajas = this.assertRequestedCajasWithinMax(dto.cajas_generadas, maxCajas);
    } else {
      cajas = maxCajas;
    }

    const pallets = Math.max(1, Math.ceil(cajas / tag.cajas_por_pallet));

    await this.ds.transaction(async (em) => {
      const tagEnt = await em.findOne(PtTag, { where: { id: tagId } });
      const procEnt = await em.findOne(FruitProcess, { where: { id: dto.process_id } });
      if (!tagEnt) throw new NotFoundException(`Unidad PT id=${tagId} no encontrada`);
      if (!procEnt) throw new NotFoundException(`Proceso id=${dto.process_id} no encontrado`);

      const dup = await em.findOne(PtTagItem, { where: { tarja_id: tagId, process_id: dto.process_id } });
      if (dup) throw new BadRequestException('Proceso ya agregado a esta unidad PT');

      await em.save(
        em.create(PtTagItem, {
        tarja_id: tagId,
          process_id: procEnt.id,
          productor_id: procEnt.productor_id,
        cajas_generadas: cajas,
        pallets_generados: pallets,
      }),
    );

      const items = await em.find(PtTagItem, { where: { tarja_id: tagId } });
      tagEnt.total_cajas = items.reduce((a, i) => a + i.cajas_generadas, 0);
      tagEnt.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
      await em.save(PtTag, tagEnt);

      await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(tagId, em);
    });

    const fresh = await this.tagRepo.findOne({ where: { id: tagId } });
    if (fresh) await this.refreshFinishedPtStockForTag(fresh);
    await this.refreshLbPackoutForProcessIds([dto.process_id]);
    await this.syncFruitProcessTarjaIdFromItems(dto.process_id);

    return this.buildPtTagListRow(tagId);
  }

  async updateTag(tagId: number, dto: UpdatePtTagDto) {
    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Unidad PT no encontrada');
    const before = { ...tag };
    const fc = dto.format_code.trim().toLowerCase();
    const cpp = dto.cajas_por_pallet;
    await this.assertCajasPorPalletVsFormat(fc, cpp);

    let items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });

    if (dto.process_id !== undefined && dto.process_id > 0) {
      if (items.length !== 1) {
        throw new BadRequestException(
          'Solo se puede cambiar el proceso cuando la unidad tiene una sola línea de proceso.',
        );
      }
      const item = items[0];
      /** bigint desde PG/TypeORM puede venir como string; sin coerción, 54 !== "54" dispara un “cambio” falso. */
      const nextPid = Number(dto.process_id);
      const currentPid = Number(item.process_id);
      if (nextPid !== currentPid) {
        const previousProcessId = Number(item.process_id);
        await this.ds.transaction(async (em) => {
          const newProc = await em.findOne(FruitProcess, { where: { id: nextPid } });
          if (!newProc) throw new NotFoundException('Proceso no encontrado');
          const st = newProc.process_status ?? 'borrador';
          if (st === 'cerrado') {
            throw new BadRequestException('No se puede vincular un proceso cerrado.');
          }
          const onOtherTags = await em.find(PtTagItem, { where: { process_id: newProc.id } });
          if (onOtherTags.some((x) => Number(x.tarja_id) !== Number(tagId))) {
            throw new BadRequestException('Ese proceso ya está vinculado a otra unidad PT.');
          }
          item.process_id = newProc.id;
          item.productor_id = newProc.productor_id;
          await em.save(PtTagItem, item);
        });
        await this.syncFruitProcessTarjaIdFromItems(previousProcessId);
        await this.syncFruitProcessTarjaIdFromItems(nextPid);
        items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });
      }
    }

    tag.format_code = fc;
    tag.cajas_por_pallet = cpp;
    if (dto.fecha !== undefined) {
      tag.fecha = new Date(dto.fecha);
    }
    if (dto.resultado !== undefined) {
      tag.resultado = dto.resultado;
    }
    if (dto.client_id !== undefined) {
      tag.client_id = dto.client_id > 0 ? dto.client_id : null;
    }
    if (dto.brand_id !== undefined) {
      tag.brand_id = dto.brand_id > 0 ? dto.brand_id : null;
    }
    if (dto.bol !== undefined) {
      tag.bol = dto.bol?.trim() || null;
    }
    await this.tagRepo.save(tag);

    const tagForMax: Pick<PtTag, 'format_code'> = { format_code: fc };

    if (dto.cajas_generadas !== undefined) {
      if (items.length !== 1) {
        throw new BadRequestException(
          'Solo se puede cambiar el total de cajas cuando la unidad tiene una sola línea de proceso.',
        );
      }
      const maxCajas = await this.getMaxCajasForProcessOnTag(tagForMax, items[0].process_id, {
        excludeTarjaId: tagId,
      });
      const cajas = this.assertRequestedCajasWithinMax(dto.cajas_generadas, maxCajas);
      items[0].cajas_generadas = cajas;
      items[0].pallets_generados = Math.max(1, Math.ceil(cajas / cpp));
      await this.tagItemRepo.save(items[0]);
    } else if (items.length === 1) {
      const maxCajas = await this.getMaxCajasForProcessOnTag(tagForMax, items[0].process_id, {
        excludeTarjaId: tagId,
      });
      if (items[0].cajas_generadas > maxCajas) {
        throw new BadRequestException(
          `Según el proceso y el formato elegidos el máximo es ${maxCajas} cajas; esta unidad tiene ${items[0].cajas_generadas}. Ajustá la cantidad de cajas o el formato/proceso.`,
        );
      }
    }

    items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });
    for (const item of items) {
      item.pallets_generados = Math.max(1, Math.ceil(item.cajas_generadas / cpp));
      await this.tagItemRepo.save(item);
    }
    tag.total_cajas = items.reduce((a, i) => a + i.cajas_generadas, 0);
    tag.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
    await this.tagRepo.save(tag);
    await this.refreshFinishedPtStockForTag(tag);

    const procIds = items.map((i) => Number(i.process_id));
    await this.refreshLbPackoutForProcessIds(procIds);
    for (const pid of procIds) {
      await this.syncFruitProcessTarjaIdFromItems(pid);
    }

    await this.tagAuditRepo.save(
      this.tagAuditRepo.create({
        tarja_id: tagId,
        action: 'update_tag',
        before_payload: toJsonRecord(before),
        after_payload: toJsonRecord(tag),
      }),
    );

    await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(tagId);
    const afterPallet = await this.tagRepo.findOne({ where: { id: tagId } });
    if (afterPallet) await this.refreshFinishedPtStockForTag(afterPallet);

    return tag;
  }

  /**
   * Repaletización: combina tarjas fuente en una nueva; las fuentes quedan en 0 cajas (trazabilidad en lineage / merge).
   */
  async mergeTags(dto: MergeTagsDto) {
    const ids = [...new Set(dto.source_tarja_ids)];
    if (ids.length < 2) throw new BadRequestException('Se requieren al menos 2 unidades PT distintas');
    const sources = await this.tagRepo.find({ where: { id: In(ids) } });
    if (sources.length !== ids.length) throw new BadRequestException('Alguna unidad PT no existe');
    const fc = sources[0].format_code.trim().toLowerCase();
    for (const s of sources) {
      if (s.format_code.trim().toLowerCase() !== fc) {
        throw new BadRequestException('Todas las unidades PT deben tener el mismo format_code');
      }
      if (s.total_cajas <= 0) {
        throw new BadRequestException(`Unidad PT ${s.id} no tiene cajas disponibles`);
      }
    }

    const totalCajas = sources.reduce((a, s) => a + s.total_cajas, 0);
    const resultado = dto.resultado ?? sources[0].resultado;
    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();
    const clientId = dto.client_id !== undefined ? dto.client_id : sources.find((s) => s.client_id != null)?.client_id ?? null;
    const brandId = dto.brand_id !== undefined ? dto.brand_id : sources.find((s) => s.brand_id != null)?.brand_id ?? null;
    const cajasPorPallet = Math.max(...sources.map((s) => s.cajas_por_pallet));
    if (!cajasPorPallet || cajasPorPallet < 1) {
      throw new BadRequestException('Las unidades PT deben tener cajas por pallet ≥ 1 para poder unirlas.');
    }

    const processById = new Map<number, { cajas: number; pallets: number; productor_id: number }>();
    for (const s of sources) {
      const items = await this.tagItemRepo.find({ where: { tarja_id: s.id } });
      for (const it of items) {
        const cur = processById.get(it.process_id) ?? { cajas: 0, pallets: 0, productor_id: it.productor_id };
        cur.cajas += it.cajas_generadas;
        cur.pallets += it.pallets_generados;
        processById.set(it.process_id, cur);
      }
    }

    const merged = await this.tagRepo.manager.transaction(async (em) => {
      const tmpCode = `TMP${Date.now()}${Math.random().toString(36).slice(2, 9)}`.slice(0, 64);
      let nt = await em.save(
        em.create(PtTag, {
          tag_code: tmpCode,
          fecha,
          resultado,
          format_code: fc,
          cajas_por_pallet: cajasPorPallet,
          total_cajas: totalCajas,
          total_pallets: Math.max(1, Math.ceil(totalCajas / cajasPorPallet)),
          client_id: clientId,
          brand_id: brandId,
          bol: dto.bol?.trim() || null,
        }),
      );
      nt.tag_code = this.tagCodeFromId(nt.id);
      nt = await em.save(PtTag, nt);

      for (const s of sources) {
        await em.delete(PtTagItem, { tarja_id: s.id });
        s.total_cajas = 0;
        s.total_pallets = 0;
        await em.save(PtTag, s);
      }

      for (const [processId, agg] of processById) {
        const pallets = Math.max(1, Math.ceil(agg.cajas / cajasPorPallet));
        await em.save(
          em.create(PtTagItem, {
            tarja_id: nt.id,
            process_id: processId,
            productor_id: agg.productor_id,
            cajas_generadas: agg.cajas,
            pallets_generados: pallets,
          }),
        );
      }

      const mergeRow = await em.save(em.create(PtTagMerge, { result_tarja_id: nt.id }));
      for (const sid of ids) {
        await em.save(
          em.create(PtTagMergeSource, {
            merge_id: mergeRow.id,
            source_tarja_id: sid,
          }),
        );
        await em.save(
          em.create(PtTagLineage, {
            ancestor_tarja_id: sid,
            descendant_tarja_id: nt.id,
            relation: 'merge',
          }),
        );
      }

      return nt;
    });

    await this.refreshLbPackoutForProcessIds([...processById.keys()]);
    for (const pid of processById.keys()) {
      await this.syncFruitProcessTarjaIdFromItems(pid);
    }

    for (const sid of ids) {
      await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(sid);
    }
    await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(merged.id);

    for (const s of sources) {
      const t = await this.tagRepo.findOne({ where: { id: s.id } });
      if (t) await this.refreshFinishedPtStockForTag(t);
    }
    const freshNew = await this.tagRepo.findOne({ where: { id: merged.id }, relations: ['client', 'brand'] });
    if (freshNew) await this.refreshFinishedPtStockForTag(freshNew);

    return freshNew;
  }

  /** Repaletización: abre una tarja moviendo cajas a una nueva tarja (lineage split). */
  async splitTag(sourceTarjaId: number, dto: SplitTagDto) {
    const src = await this.tagRepo.findOne({ where: { id: sourceTarjaId }, relations: ['client', 'brand'] });
    if (!src) throw new NotFoundException('Unidad PT no encontrada');
    if (dto.cajas < 1 || dto.cajas >= src.total_cajas) {
      throw new BadRequestException('cajas debe ser entre 1 y total_cajas - 1');
    }

    const items = await this.tagItemRepo.find({ where: { tarja_id: src.id }, order: { id: 'ASC' } });
    if (!items.length) {
      throw new BadRequestException('La unidad PT no tiene líneas de proceso para fraccionar');
    }

    const oldTotal = src.total_cajas;
    const move = dto.cajas;
    const shares = items.map((it) => (move * it.cajas_generadas) / oldTotal);
    const floors = shares.map((s) => Math.floor(s));
    let diff = move - floors.reduce((a, b) => a + b, 0);
    for (let i = 0; diff > 0 && i < floors.length; i++) {
      floors[i]++;
      diff--;
    }

    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();

    const splitResult = await this.tagRepo.manager.transaction(async (em) => {
      const tmpCode = `TMP${Date.now()}${Math.random().toString(36).slice(2, 9)}`.slice(0, 64);
      let nt = await em.save(
        em.create(PtTag, {
          tag_code: tmpCode,
          fecha,
          resultado: src.resultado,
          format_code: src.format_code,
          cajas_por_pallet: src.cajas_por_pallet,
          total_cajas: move,
          total_pallets: Math.max(1, Math.ceil(move / src.cajas_por_pallet)),
          client_id: src.client_id ?? null,
          brand_id: src.brand_id ?? null,
          bol: src.bol ?? null,
        }),
      );
      nt.tag_code = this.tagCodeFromId(nt.id);
      nt = await em.save(PtTag, nt);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const take = floors[i];
        const processId = it.process_id;
        const productorId = it.productor_id;
        it.cajas_generadas -= take;
        if (it.cajas_generadas <= 0) {
          await em.delete(PtTagItem, { id: it.id });
        } else {
          it.pallets_generados = Math.max(1, Math.ceil(it.cajas_generadas / src.cajas_por_pallet));
          await em.save(PtTagItem, it);
        }
        if (take > 0) {
          await em.save(
            em.create(PtTagItem, {
              tarja_id: nt.id,
              process_id: processId,
              productor_id: productorId,
              cajas_generadas: take,
              pallets_generados: Math.max(1, Math.ceil(take / src.cajas_por_pallet)),
            }),
          );
        }
      }

      src.total_cajas -= move;
      const srcItems = await em.find(PtTagItem, { where: { tarja_id: src.id } });
      src.total_pallets = srcItems.reduce((a, i) => a + i.pallets_generados, 0);
      await em.save(PtTag, src);

      await em.save(
        em.create(PtTagLineage, {
          ancestor_tarja_id: src.id,
          descendant_tarja_id: nt.id,
          relation: 'split',
        }),
      );

      return nt;
    });

    const affectedPids = [...new Set(items.map((it) => Number(it.process_id)))];
    await this.refreshLbPackoutForProcessIds(affectedPids);
    for (const pid of affectedPids) {
      await this.syncFruitProcessTarjaIdFromItems(pid);
    }

    await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(splitResult.id);
    await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(src.id);

    const freshNew = await this.tagRepo.findOne({ where: { id: splitResult.id }, relations: ['client', 'brand'] });
    if (freshNew) await this.refreshFinishedPtStockForTag(freshNew);
    const freshSrc = await this.tagRepo.findOne({ where: { id: src.id } });
    if (freshSrc) await this.refreshFinishedPtStockForTag(freshSrc);

    return freshNew;
  }

  /** Trazabilidad: lineage de una tarja (ancestros y descendientes). */
  async getTagLineage(tarjaId: number) {
    const asDesc = await this.lineageRepo.find({ where: { descendant_tarja_id: tarjaId } });
    const asAnc = await this.lineageRepo.find({ where: { ancestor_tarja_id: tarjaId } });
    return {
      tarja_id: tarjaId,
      ancestors: asDesc.map((r) => {
        return { tarja_id: r.ancestor_tarja_id, relation: r.relation };
      }),
      descendants: asAnc.map((r) => {
        return { tarja_id: r.descendant_tarja_id, relation: r.relation };
      }),
    };
  }

  /** Confirma el proceso: balance entrada = packout producto (máx. tarjas · pallets) + componentes; estado → confirmado. */
  async confirmProcess(processId: number) {
    const proc = await this.processRepo.findOne({
      where: { id: processId },
      relations: ['reception', 'reception.variety', 'reception_line', 'reception_line.variety'],
    });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    if (proc.process_status !== 'borrador') {
      throw new BadRequestException('Solo se puede confirmar un proceso en borrador');
    }

    await this.refreshLbPackoutForProcessIds([proc.id]);
    const fresh = await this.processRepo.findOne({ where: { id: processId } });
    if (!fresh) throw new NotFoundException('Proceso no encontrado');

    const allocSum = await this.sumAllocationsLb(proc.id);
    const entrada = this.computeEntradaLb(fresh, allocSum);
    fresh.lb_entrada = entrada.toFixed(3);

    const speciesId = await this.resolveProcessSpeciesId(proc);
    if (!speciesId || speciesId <= 0) throw new BadRequestException('No se pudo determinar la especie');

    const activeComponents = await this.listActiveComponentsForSpecies(speciesId);
    const activeIds = new Set(activeComponents.map((c) => Number(c.id)));
    const freshValues = await this.processComponentValueRepo.find({
      where: { fruit_process_id: proc.id },
    });
    const componentTotal = freshValues
      .filter((v) => activeIds.has(Number(v.component_id)))
      .reduce((s, v) => s + Number(v.lb_value), 0);

    const cachedPack = Number(fresh.lb_packout ?? 0);
    const computedPack = (await this.computeLbPackoutForProcessIds([proc.id])).get(proc.id) ?? 0;
    const packFromTags =
      computedPack > BALANCE_EPS ? computedPack : Math.max(cachedPack, computedPack);
    const usedOnPallets = (await this.computeUsedLbFromFinalPallets([proc.id])).get(proc.id) ?? 0;
    const packProductLb = Math.max(packFromTags, usedOnPallets);
    const extraMerma = this.extraMermaLbOutsideComponents(fresh, freshValues, activeComponents);
    const extraIqf = this.extraIqfLbOutsideComponents(fresh, freshValues, activeComponents);
    const mermaLb = this.resolveMermaLbForBalance(
      entrada,
      packProductLb,
      componentTotal,
      extraMerma,
      extraIqf,
      freshValues,
      activeComponents,
    );
    const destinos = packProductLb + componentTotal + mermaLb + extraIqf;
    const diff = entrada - destinos;
    if (Math.abs(diff) > BALANCE_EPS) {
      throw new BadRequestException(
        `Balance no cuadra: entrada ${entrada.toFixed(3)} ≠ packout producto ${packProductLb.toFixed(3)} (máx. unidades PT ${packFromTags.toFixed(3)}, pallets ${usedOnPallets.toFixed(3)}) + componentes ${componentTotal.toFixed(3)}` +
          (mermaLb > BALANCE_EPS ? ` + merma (${mermaLb.toFixed(3)})` : '') +
          (extraIqf > BALANCE_EPS ? ` + IQF fuera de tabla (${extraIqf.toFixed(3)})` : '') +
          ` (diferencia ${diff.toFixed(3)} lb).`,
      );
    }

    const mermaComp = findMermaResultComponent(activeComponents);
    const mermaRowVal = mermaComp
      ? Number(freshValues.find((v) => Number(v.component_id) === Number(mermaComp.id))?.lb_value ?? 0)
      : 0;
    if (mermaComp && mermaRowVal <= BALANCE_EPS && mermaLb > BALANCE_EPS) {
      const existing = await this.processComponentValueRepo.findOne({
        where: { fruit_process_id: proc.id, component_id: Number(mermaComp.id) },
      });
      if (existing) {
        existing.lb_value = mermaLb.toFixed(3);
        await this.processComponentValueRepo.save(existing);
      } else {
        await this.processComponentValueRepo.save(
          this.processComponentValueRepo.create({
            fruit_process_id: proc.id,
            component_id: Number(mermaComp.id),
            lb_value: mermaLb.toFixed(3),
          }),
        );
      }
      fresh.merma_lb = mermaLb.toFixed(3);
      fresh.lb_sobrante = '0.000';
      fresh.lb_merma_balance = undefined;
    }

    fresh.process_status = 'confirmado';
    return this.processRepo.save(fresh);
  }

  /** Confirmado → cerrado (supervisor/admin). */
  async setProcessStatus(processId: number, dto: { status: 'cerrado' }) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    if (proc.process_status !== 'confirmado') {
      throw new BadRequestException('Solo se puede cerrar un proceso confirmado');
    }
    proc.process_status = 'cerrado';
    return this.processRepo.save(proc);
  }

  /**
   * Al reabrir un proceso a borrador, quita el vínculo con la unidad PT anterior (ítem + tarja_id).
   * Así el proceso vuelve a aparecer en "Nueva unidad PT" y los totales de la tarja quedan coherentes.
   */
  private async detachProcessFromPtWhenReopeningToBorrador(processId: number): Promise<void> {
    const items = await this.tagItemRepo.find({ where: { process_id: processId } });
    const tagIds = [...new Set(items.map((i) => Number(i.tarja_id)))];

    await this.ds.transaction(async (em) => {
      const procEnt = await em.findOne(FruitProcess, { where: { id: processId } });
      if (!procEnt) return;

      if (items.length) {
        await em.delete(PtTagItem, { process_id: processId });
      }
      procEnt.tarja_id = null;
      await em.save(FruitProcess, procEnt);

      for (const tagId of tagIds) {
        const tagEnt = await em.findOne(PtTag, { where: { id: tagId } });
        if (!tagEnt) continue;
        const rest = await em.find(PtTagItem, { where: { tarja_id: tagId } });
        tagEnt.total_cajas = rest.reduce((a, i) => a + i.cajas_generadas, 0);
        tagEnt.total_pallets = rest.reduce((a, i) => a + i.pallets_generados, 0);
        await em.save(PtTag, tagEnt);
        await this.finalPalletService.syncTechnicalFinalPalletFromPtTag(tagId, em);
      }
    });

    for (const tagId of tagIds) {
      const t = await this.tagRepo.findOne({ where: { id: tagId } });
      if (t) await this.refreshFinishedPtStockForTag(t);
    }
    await this.refreshLbPackoutForProcessIds([processId]);
  }

  /**
   * Solo administrador: cambiar estado con flexibilidad (reabrir cerrado → confirmado/borrador, etc.).
   * borrador → confirmado usa la misma validación de balance que `confirmProcess`.
   * confirmado → cerrado usa la misma regla que `setProcessStatus`.
   */
  async adminSetProcessStatus(processId: number, dto: SetProcessStatusDto) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    const cur = proc.process_status ?? 'borrador';
    const next = dto.status;
    const unlinkPt = dto.unlinkPt === true;
    if (cur === next) {
      if (next === 'borrador' && unlinkPt) {
        await this.detachProcessFromPtWhenReopeningToBorrador(processId);
        const after = await this.processRepo.findOne({ where: { id: processId } });
        return after ?? proc;
      }
      return proc;
    }

    if (cur === 'borrador' && next === 'confirmado') {
      return this.confirmProcess(processId);
    }
    if (cur === 'confirmado' && next === 'cerrado') {
      return this.setProcessStatus(processId, { status: 'cerrado' });
    }

    if (next === 'borrador' && unlinkPt) {
      await this.detachProcessFromPtWhenReopeningToBorrador(processId);
    }

    const fresh = await this.processRepo.findOne({ where: { id: processId } });
    if (!fresh) throw new NotFoundException('Proceso no encontrado');
    fresh.process_status = next;
    return this.processRepo.save(fresh);
  }

  /**
   * Pistas para re-vincular unidades PT tras desvincular por error (p. ej. pasar a borrador con unlinkPt).
   * Usa líneas de pallet final con fruit_process_id y tarjas del mismo productor en ventana de fechas.
   */
  async getProcessPtRecoveryHints(processId: number) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');

    const producerId = Number(proc.productor_id);
    const fecha = proc.fecha_proceso instanceof Date ? proc.fecha_proceso : new Date(proc.fecha_proceso);
    const windowDays = 21;
    const from = new Date(fecha);
    from.setDate(from.getDate() - windowDays);
    const to = new Date(fecha);
    to.setDate(to.getDate() + windowDays);

    const linkedItems = await this.tagItemRepo.find({ where: { process_id: processId } });
    const linkedTagIds = new Set(linkedItems.map((i) => Number(i.tarja_id)));

    const palletAgg = await this.finalPalletLineRepo
      .createQueryBuilder('l')
      .innerJoin(FinalPallet, 'fp', 'fp.id = l.final_pallet_id')
      .where('l.fruit_process_id = :pid', { pid: processId })
      .andWhere("fp.status != 'anulado'")
      .andWhere('fp.tarja_id IS NOT NULL')
      .select('fp.tarja_id', 'tarja_id')
      .addSelect('COALESCE(SUM(l.amount), 0)', 'cajas')
      .addSelect('COALESCE(SUM(CAST(l.pounds AS DECIMAL)), 0)', 'lb')
      .groupBy('fp.tarja_id')
      .getRawMany<{ tarja_id: string; cajas: string; lb: string }>();

    type Hint = {
      source: 'final_pallet_line' | 'pt_tag_same_producer';
      tarja_id: number;
      tag_code: string;
      format_code: string;
      suggested_cajas: number;
      suggested_lb: number | null;
      fecha: string | null;
      note: string;
      already_linked: boolean;
    };

    const byTag = new Map<number, Hint>();

    for (const row of palletAgg) {
      const tid = Number(row.tarja_id);
      if (!Number.isFinite(tid) || tid < 1) continue;
      const tag = await this.tagRepo.findOne({ where: { id: tid } });
      const cajas = Math.max(0, Math.round(Number(row.cajas ?? 0)));
      if (cajas <= 0) continue;
      byTag.set(tid, {
        source: 'final_pallet_line',
        tarja_id: tid,
        tag_code: tag?.tag_code ?? `PT-${tid}`,
        format_code: tag?.format_code ?? '',
        suggested_cajas: cajas,
        suggested_lb: Number(row.lb ?? 0) > 0 ? Number(row.lb) : null,
        fecha: tag?.fecha instanceof Date ? tag.fecha.toISOString().slice(0, 10) : null,
        note: 'Encontrada en pallets finales con este proceso',
        already_linked: linkedTagIds.has(tid),
      });
    }

    const tagRows = await this.tagRepo
      .createQueryBuilder('t')
      .innerJoin(PtTagItem, 'io', 'io.tarja_id = t.id AND io.productor_id = :prod', { prod: producerId })
      .leftJoin(PtTagItem, 'ip', 'ip.tarja_id = t.id AND ip.process_id = :pid', { pid: processId })
      .where('ip.id IS NULL')
      .andWhere('t.fecha >= :from AND t.fecha <= :to', { from, to })
      .select('t.id', 'id')
      .addSelect('SUM(io.cajas_generadas)', 'cajas')
      .groupBy('t.id')
      .getRawMany<{ id: string; cajas: string }>();

    for (const row of tagRows) {
      const tid = Number(row.id);
      if (!Number.isFinite(tid) || tid < 1 || byTag.has(tid)) continue;
      const tag = await this.tagRepo.findOne({ where: { id: tid } });
      if (!tag) continue;
      const cajas = Math.max(0, Math.round(Number(row.cajas ?? tag.total_cajas ?? 0)));
      if (cajas <= 0 && (tag.total_cajas ?? 0) <= 0) continue;
      byTag.set(tid, {
        source: 'pt_tag_same_producer',
        tarja_id: tid,
        tag_code: tag.tag_code,
        format_code: tag.format_code,
        suggested_cajas: cajas > 0 ? cajas : tag.total_cajas,
        suggested_lb: null,
        fecha: tag.fecha instanceof Date ? tag.fecha.toISOString().slice(0, 10) : null,
        note: 'Unidad PT del mismo productor en fechas cercanas (sin vínculo a este proceso)',
        already_linked: false,
      });
    }

    const suggestions = [...byTag.values()].sort((a, b) => {
      if (a.source === 'final_pallet_line' && b.source !== 'final_pallet_line') return -1;
      if (b.source === 'final_pallet_line' && a.source !== 'final_pallet_line') return 1;
      return a.tag_code.localeCompare(b.tag_code);
    });

    return {
      process_id: processId,
      productor_id: producerId,
      fecha_proceso: fecha.toISOString().slice(0, 10),
      window_days: windowDays,
      linked_count: linkedItems.length,
      suggestions,
      hint:
        suggestions.length === 0
          ? 'No hay pistas automáticas. Revisá Existencias PT / Unidad PT por fecha y productor, o restaurá backup de Railway.'
          : 'Restaurar crea de nuevo pt_tag_items. Revisá cajas sugeridas antes de aplicar.',
    };
  }

  /** Restaura vínculos proceso ↔ unidad PT (admin). */
  async restoreProcessPtLinks(processId: number, dto: RestoreProcessPtLinksDto) {
    const proc = await this.processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    if (!dto.links?.length) {
      throw new BadRequestException('Indicá al menos un vínculo (tarja_id + cajas)');
    }
    const restored: number[] = [];
    for (const link of dto.links) {
      await this.addProcessToTag(link.tarja_id, {
        process_id: processId,
        cajas_generadas: link.cajas_generadas,
      });
      restored.push(link.tarja_id);
    }
    const rows = await this.listProcesses();
    const row = rows.find((r) => r.id === processId);
    return { restored_tarja_ids: restored, process: row ?? null };
  }

  /** Importación masiva / ajuste admin: recalcular stock PT luego de tocar `pt_tags`. */
  async refreshPtTagStockAfterImport(tagId: number): Promise<void> {
    const t = await this.tagRepo.findOne({ where: { id: tagId } });
    if (t) await this.refreshFinishedPtStockForTag(t);
  }

  /**
   * Elimina una unidad PT y sus vínculos internos (ítems, consumos de packaging, pallet técnico borrador).
   * No permite si hay despacho, factura, merge, o pallet final ya logístico/despachado.
   */
  async purgePtTagById(tagId: number): Promise<void> {
    const id = Number(tagId);
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestException('tarja_id inválido');
    }
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException('Unidad PT no encontrada');

    const dtiRepo = this.ds.getRepository(DispatchTagItem);
    const dti = await dtiRepo.count({ where: { tarja_id: id } });
    if (dti > 0) {
      throw new BadRequestException(
        `No se puede borrar la tarja ${id}: figura en ${dti} línea(s) de despacho. Quitála del despacho primero.`,
      );
    }

    const invRepo = this.ds.getRepository(InvoiceItem);
    const inv = await invRepo.count({ where: { tarja_id: id } });
    if (inv > 0) {
      throw new BadRequestException(
        `No se puede borrar la tarja ${id}: tiene ${inv} línea(s) en facturas.`,
      );
    }

    const mergeAsResult = await this.tagMergeRepo.count({ where: { result_tarja_id: id } });
    const mergeSrcRepo = this.ds.getRepository(PtTagMergeSource);
    const mergeAsSource = await mergeSrcRepo.count({ where: { source_tarja_id: id } });
    if (mergeAsResult > 0 || mergeAsSource > 0) {
      throw new BadRequestException(
        'No se puede borrar: la tarja participa en un merge (origen o resultado). Resolvé el merge antes.',
      );
    }

    const fpRepo = this.ds.getRepository(FinalPallet);
    const fps = await fpRepo.find({ where: { tarja_id: id } });
    for (const fp of fps) {
      if (fp.dispatch_id != null || fp.pt_packing_list_id != null) {
        throw new BadRequestException(
          `No se puede borrar: el pallet final ${fp.id} (${fp.corner_board_code}) está en packing list o despacho.`,
        );
      }
      if (fp.status === 'despachado' || fp.status === 'asignado_pl') {
        throw new BadRequestException(
          `No se puede borrar: el pallet final ${fp.id} tiene estado «${fp.status}».`,
        );
      }
    }

    const items = await this.tagItemRepo.find({ where: { tarja_id: id } });
    const processIds = [...new Set(items.map((it) => Number(it.process_id)).filter((n) => n > 0))];
    const formatKey = tag.format_code.trim().toLowerCase();
    const clientKey = tag.client_id ?? null;
    const brandKey = tag.brand_id ?? null;

    const consRepo = this.ds.getRepository(PackagingPalletConsumption);

    await this.ds.transaction(async (em) => {
      await em.query(
        `DELETE FROM packaging_cost_breakdowns WHERE consumption_id IN (SELECT id FROM packaging_pallet_consumptions WHERE tarja_id = $1)`,
        [id],
      );
      await em.delete(PackagingPalletConsumption, { tarja_id: id });
      await em.delete(PtTagAudit, { tarja_id: id });
      await em
        .createQueryBuilder()
        .delete()
        .from(PtTagLineage)
        .where('ancestor_tarja_id = :id OR descendant_tarja_id = :id', { id })
        .execute();
      await em.delete(PtTagItem, { tarja_id: id });
      await em.update(FruitProcess, { tarja_id: id }, { tarja_id: null });
      await em.delete(FinalPallet, { tarja_id: id });
      await em.delete(PtTag, { id });
    });

    for (const pid of processIds) {
      await this.syncFruitProcessTarjaIdFromItems(pid);
    }
    await this.refreshFinishedPtStockAggregate(formatKey, clientKey, brandKey);
    await this.refreshLbPackoutForProcessIds(processIds);
  }
}
