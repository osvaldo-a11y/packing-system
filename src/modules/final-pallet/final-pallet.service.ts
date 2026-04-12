import { receptionReferenceDisplay } from '../../common/reception-reference';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { Dispatch, SalesOrder } from '../dispatch/dispatch.entities';
import { MATERIAL_CATEGORY_CODES, PackagingMaterial } from '../packaging/packaging.entities';
import {
  FruitProcess,
  FruitProcessLineAllocation,
  PtTag,
  PtTagItem,
  PtTagMerge,
  PtTagMergeSource,
} from '../process/process.entities';
import { Brand, Client, FinishedPtStock } from '../traceability/operational.entities';
import { PresentationFormat, QualityGrade, Species, Variety } from '../traceability/traceability.entities';
import {
  BulkAssignBolDto,
  CreateFinalPalletDto,
  ListExistenciasPtQueryDto,
  PatchFinalPalletDto,
  RepalletDto,
  RepalletReverseDto,
} from './final-pallet.dto';
import { FinalPallet, FinalPalletLine } from './final-pallet.entities';
import { RepalletEvent, RepalletLineProvenance, RepalletReversal, RepalletSource } from './repallet.entities';
import { FinishedPtInventory, type FinishedPtInventoryTraceLine } from './finished-pt-inventory.entity';

const PACKOUT_EPS = 0.02;

/** Trazabilidad unidad PT ↔ pallet final: resolución desde líneas → proceso(s) → tarja(s). */
export type UnidadPtTraceability = {
  unidad_pt_codigos: string[];
  tarja_ids: number[];
  trazabilidad_pt: 'unica' | 'varias' | 'sin_trazabilidad';
  /** Texto principal para operación (TAR o varias; si no hay PT, esquina/PF-). */
  codigo_unidad_pt_display: string;
  codigo_logistico: string;
};

@Injectable()
export class FinalPalletService {
  constructor(
    @InjectRepository(FinalPallet) private readonly palletRepo: Repository<FinalPallet>,
    @InjectRepository(FinalPalletLine) private readonly lineRepo: Repository<FinalPalletLine>,
    @InjectRepository(FinishedPtInventory) private readonly inventoryRepo: Repository<FinishedPtInventory>,
    @InjectRepository(FinishedPtStock) private readonly finishedPtRepo: Repository<FinishedPtStock>,
    @InjectRepository(FruitProcess) private readonly processRepo: Repository<FruitProcess>,
    @InjectRepository(FruitProcessLineAllocation)
    private readonly processAllocRepo: Repository<FruitProcessLineAllocation>,
    @InjectRepository(PtTag) private readonly tagRepo: Repository<PtTag>,
    @InjectRepository(PtTagItem) private readonly tagItemRepo: Repository<PtTagItem>,
    @InjectRepository(PtTagMerge) private readonly tagMergeRepo: Repository<PtTagMerge>,
    @InjectRepository(PtTagMergeSource) private readonly tagMergeSourceRepo: Repository<PtTagMergeSource>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(PackagingMaterial) private readonly materialRepo: Repository<PackagingMaterial>,
    @InjectRepository(PresentationFormat) private readonly formatRepo: Repository<PresentationFormat>,
    @InjectRepository(Variety) private readonly varietyRepo: Repository<Variety>,
    @InjectRepository(Species) private readonly speciesRepo: Repository<Species>,
    @InjectRepository(QualityGrade) private readonly qualityRepo: Repository<QualityGrade>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(SalesOrder) private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(RepalletEvent) private readonly repalletEventRepo: Repository<RepalletEvent>,
    @InjectRepository(RepalletSource) private readonly repalletSourceRepo: Repository<RepalletSource>,
    @InjectRepository(RepalletLineProvenance)
    private readonly repalletLineProvRepo: Repository<RepalletLineProvenance>,
    @InjectRepository(RepalletReversal) private readonly repalletReversalRepo: Repository<RepalletReversal>,
    private readonly ds: DataSource,
  ) {}

  /** Repositorios unificados para sync en transacción externa (`em`) o modo normal. */
  private txRepos(em?: EntityManager) {
    const m = em ?? this.ds.manager;
    return {
      tag: m.getRepository(PtTag),
      tagItem: m.getRepository(PtTagItem),
      pallet: m.getRepository(FinalPallet),
      line: m.getRepository(FinalPalletLine),
      process: m.getRepository(FruitProcess),
      format: m.getRepository(PresentationFormat),
      variety: m.getRepository(Variety),
      brand: m.getRepository(Brand),
      finishedPt: m.getRepository(FinishedPtStock),
      inventory: m.getRepository(FinishedPtInventory),
    };
  }

  private cornerCodeFromId(id: number) {
    return `PF-${id}`;
  }

  /** Misma base de lb que el listado de procesos / tarjas PT: reparto por línea o lb_entrada / peso. */
  private async entradaLbBasis(proc: FruitProcess, em?: EntityManager): Promise<number> {
    const repo = em ? em.getRepository(FruitProcessLineAllocation) : this.processAllocRepo;
    const raw = await repo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(CAST(a.lb_allocated AS DECIMAL)), 0)', 's')
      .where('a.process_id = :id', { id: proc.id })
      .getRawOne<{ s: string }>();
    const alloc = Number(raw?.s ?? 0);
    if (alloc > PACKOUT_EPS) return alloc;
    if (proc.lb_entrada != null && String(proc.lb_entrada).trim() !== '') {
      return Number(proc.lb_entrada);
    }
    return Number(proc.peso_procesado_lb) || 0;
  }

  /**
   * Libras disponibles para palletizar desde un proceso: si `lb_packout` está cargado (>0), manda;
   * si no, se usa `lb_entrada` (o `peso_procesado_lb` legado) como tope — la fruta que ingresó al proceso.
   */
  private effectivePackoutBudgetLb(proc: FruitProcess): number {
    const explicit = Number(proc.lb_packout || 0);
    if (explicit > PACKOUT_EPS) return explicit;
    const entrada = Number(proc.lb_entrada || 0) || Number(proc.peso_procesado_lb || 0);
    return Math.max(0, entrada);
  }

  private normalizeBol(s: string | null | undefined): string | null {
    const t = (s ?? '').trim();
    return t.length > 0 ? t : null;
  }

  /** Drivers (p. ej. sqljs en e2e) pueden devolver fechas como string. */
  private dateToIso(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  /** Pedido previsto: hoy solo se valida existencia; reservado para reglas contra cliente/cantidades. */
  private async assertPlannedSalesOrderRef(id: number): Promise<void> {
    const o = await this.salesOrderRepo.findOne({ where: { id } });
    if (!o) throw new BadRequestException('Pedido (orden de venta) no encontrado.');
  }

  private boxWeightFromCode(formatCode: string) {
    const m = /^(\d+)x(\d+)oz$/i.exec(formatCode);
    if (!m) throw new BadRequestException('format_code inválido para peso neto');
    return (Number(m[1]) * Number(m[2])) / 16;
  }

  /** Misma lógica que despacho / proceso (lb netas por caja). */
  private async netLbPerBoxFromFormatCode(formatCode: string): Promise<number> {
    const row = await this.formatRepo.findOne({
      where: { format_code: formatCode.trim().toLowerCase() },
    });
    if (row && Number(row.net_weight_lb_per_box) > 0) {
      return Number(row.net_weight_lb_per_box);
    }
    return this.boxWeightFromCode(formatCode);
  }

  private finishedPtRepoFor(em?: EntityManager) {
    return em ? em.getRepository(FinishedPtStock) : this.finishedPtRepo;
  }

  private inventoryRepoFor(em?: EntityManager) {
    return em ? em.getRepository(FinishedPtInventory) : this.inventoryRepo;
  }

  private async applyFinishedPtStockOutByKey(
    format_code: string,
    client_id: number | null,
    brand_id: number | null,
    boxesOut: number,
    em?: EntityManager,
  ) {
    if (boxesOut <= 0) return;
    const fc = format_code.trim().toLowerCase();
    const cid = client_id ?? null;
    const bid = brand_id ?? null;
    const fpRepo = this.finishedPtRepoFor(em);
    const row = await fpRepo.findOne({
      where: {
        format_code: fc,
        client_id: cid === null ? IsNull() : cid,
        brand_id: bid === null ? IsNull() : bid,
      },
    });
    const available = row?.boxes ?? 0;
    /** Pedido o histórico puede superar stock físico; no bloquear (p. ej. BOL, cierre parcial). */
    const take = Math.min(available, boxesOut);
    if (take <= 0 || !row) return;
    const netLb = Number(row.net_lb);
    const perBox = row.boxes > 0 ? netLb / row.boxes : 0;
    row.boxes = row.boxes - take;
    row.net_lb = Math.max(0, netLb - take * perBox).toFixed(3);
    await fpRepo.save(row);
  }

  private async applyFinishedPtStockInByKey(
    format_code: string,
    client_id: number | null,
    brand_id: number | null,
    boxesIn: number,
    em?: EntityManager,
  ) {
    if (boxesIn <= 0) return;
    const fc = format_code.trim().toLowerCase();
    const cid = client_id ?? null;
    const bid = brand_id ?? null;
    const fpRepo = this.finishedPtRepoFor(em);
    let row = await fpRepo.findOne({
      where: {
        format_code: fc,
        client_id: cid === null ? IsNull() : cid,
        brand_id: bid === null ? IsNull() : bid,
      },
    });
    const netPerBox =
      row && row.boxes > 0 ? Number(row.net_lb) / row.boxes : await this.netLbPerBoxFromFormatCode(fc);
    if (!row) {
      row = fpRepo.create({
        client_id: cid,
        brand_id: bid,
        format_code: fc,
        boxes: boxesIn,
        net_lb: (boxesIn * netPerBox).toFixed(3),
      });
    } else {
      row.boxes += boxesIn;
      row.net_lb = (Number(row.net_lb) + boxesIn * netPerBox).toFixed(3);
    }
    await fpRepo.save(row);
  }

  private async buildTraceLines(p: FinalPallet): Promise<FinishedPtInventoryTraceLine[]> {
    const lines = [...(p.lines ?? [])].sort((a, b) => a.line_order - b.line_order || a.id - b.id);
    const pids = [
      ...new Set(
        lines
          .map((l) => l.fruit_process_id)
          .filter((id): id is number => id != null && Number(id) > 0)
          .map((id) => Number(id)),
      ),
    ];
    const processes =
      pids.length > 0
        ? await this.processRepo.find({
            where: { id: In(pids) },
            select: ['id', 'recepcion_id'],
          })
        : [];
    const recepByProcess = new Map<number, number | null>(
      processes.map((pr) => [Number(pr.id), pr.recepcion_id != null ? Number(pr.recepcion_id) : null]),
    );

    return lines.map((l) => ({
      fruit_process_id: l.fruit_process_id != null ? Number(l.fruit_process_id) : null,
      recepcion_id:
        l.fruit_process_id != null ? recepByProcess.get(Number(l.fruit_process_id)) ?? null : null,
      ref_text: l.ref_text ?? null,
      variety_id: Number(l.variety_id),
      amount: l.amount,
      pounds: String(l.pounds),
    }));
  }

  private async upsertInventoryRow(p: FinalPallet, aggregate_boxes_recorded: number, em?: EntityManager): Promise<void> {
    const lines = p.lines ?? [];
    const totalBoxes = lines.reduce((s, l) => s + l.amount, 0);
    const totalLb = lines.reduce((s, l) => s + Number(l.pounds), 0);
    const fc = p.presentation_format?.format_code?.trim().toLowerCase() ?? '';
    const trace = await this.buildTraceLines(p);

    const invRepo = this.inventoryRepoFor(em);
    let row = await invRepo.findOne({ where: { final_pallet_id: p.id } });
    const base = {
      corner_board_code: p.corner_board_code,
      species_id: p.species_id != null ? Number(p.species_id) : null,
      presentation_format_id: p.presentation_format_id != null ? Number(p.presentation_format_id) : null,
      format_code: fc,
      client_id: p.client_id != null ? Number(p.client_id) : null,
      brand_id: p.brand_id != null ? Number(p.brand_id) : null,
      boxes: totalBoxes,
      net_lb: totalLb.toFixed(3),
      status: p.status,
      aggregate_boxes_recorded,
      trace_lines: trace.length ? trace : null,
    };

    if (!row) {
      row = invRepo.create({ final_pallet_id: p.id, ...base });
    } else {
      Object.assign(row, base);
    }
    await invRepo.save(row);
  }

  /** Expuesto para otros módulos (p. ej. packing list logístico). */
  async reconcileInventoryForPallet(palletId: number): Promise<void> {
    return this.reconcileFinishedPtStockForPallet(palletId);
  }

  /**
   * Mantenimiento (p. ej. tras migración que corrige `status`): recalcula inventario para pallets con `tarja_id`.
   */
  async reconcileInventoryForAllTarjaLinkedPallets(): Promise<{ reconciled: number }> {
    const rows = await this.palletRepo.find({
      where: { tarja_id: Not(IsNull()) },
      select: ['id'],
    });
    for (const r of rows) {
      await this.reconcileFinishedPtStockForPallet(r.id);
    }
    return { reconciled: rows.length };
  }

  private async reconcileFinishedPtStockForPallet(palletId: number, em?: EntityManager): Promise<void> {
    const palletRepo = em ? em.getRepository(FinalPallet) : this.palletRepo;
    const p = await palletRepo.findOne({
      where: { id: palletId },
      relations: { lines: true, presentation_format: true },
    });
    if (!p) return;

    if (p.dispatch_id != null && Number(p.dispatch_id) > 0) {
      await this.upsertInventoryRow(p, 0, em);
      return;
    }

    const lines = p.lines ?? [];
    const totalBoxes = lines.reduce((s, l) => s + l.amount, 0);
    const fc = p.presentation_format?.format_code?.trim().toLowerCase() ?? '';
    const cid = p.client_id ?? null;
    const bid = p.brand_id ?? null;
    const targetAgg = p.status === 'definitivo' && fc && totalBoxes > 0 ? totalBoxes : 0;

    const inv = await this.inventoryRepoFor(em).findOne({ where: { final_pallet_id: palletId } });
    const oldRec = inv?.aggregate_boxes_recorded ?? 0;
    const oldFc = inv?.format_code ?? '';
    const oldCid = inv?.client_id ?? null;
    const oldBid = inv?.brand_id ?? null;

    if (oldRec > 0 && oldFc) {
      await this.applyFinishedPtStockOutByKey(oldFc, oldCid, oldBid, oldRec, em);
    }

    if (targetAgg > 0 && fc) {
      await this.applyFinishedPtStockInByKey(fc, cid, bid, targetAgg, em);
    }

    await this.upsertInventoryRow(p, targetAgg, em);
  }

  /**
   * Sincroniza la fila de inventario luego de que Despacho movió stock (`in`/`out`) por asignación del pallet.
   * Mantiene `aggregate_boxes_recorded` alineado para que PATCH posteriores no dupliquen movimientos.
   */
  async notifyDispatchFinalPalletStockSynced(palletId: number): Promise<void> {
    const p = await this.palletRepo.findOne({
      where: { id: palletId },
      relations: { lines: true, presentation_format: true },
    });
    if (!p) return;

    const lines = p.lines ?? [];
    const totalBoxes = lines.reduce((s, l) => s + l.amount, 0);
    const onDispatch = p.dispatch_id != null && Number(p.dispatch_id) > 0;
    const recorded =
      !onDispatch && p.status === 'definitivo' && totalBoxes > 0 ? totalBoxes : 0;
    await this.upsertInventoryRow(p, recorded);
  }

  /** Referencia de línea: igual que recepción (código recepción o productor+MMDD). */
  private async resolveLineRefText(fruitProcessId: number | undefined, refTextProvided: string | undefined): Promise<string | null> {
    const trimmed = (refTextProvided ?? '').trim();
    if (trimmed) return trimmed;
    if (!fruitProcessId || fruitProcessId <= 0) return null;
    const proc = await this.processRepo.findOne({
      where: { id: fruitProcessId },
      relations: ['reception', 'reception.producer'],
    });
    if (!proc?.reception) return null;
    return receptionReferenceDisplay(proc.reception);
  }

  private mapLine(l: FinalPalletLine) {
    return {
      id: l.id,
      line_order: l.line_order,
      fruit_process_id: l.fruit_process_id != null ? Number(l.fruit_process_id) : null,
      fecha: l.fecha,
      ref_text: l.ref_text,
      variety_id: Number(l.variety_id),
      variety_nombre: l.variety?.nombre,
      caliber: l.caliber,
      amount: l.amount,
      pounds: l.pounds,
      net_lb: l.net_lb,
    };
  }

  /**
   * Fusión de unidades PT (`pt_tag_merges`): si el pallet referencia exactamente las tarjas origen + la resultante,
   * la identidad operativa visible es solo la tarja resultante (mismo código TAR único).
   */
  private async tryCollapsePtTagMerge(
    tarjaIdSet: Set<number>,
    tagCodeByTarjaId: Map<number, string>,
  ): Promise<{ resultTarjaId: number; tagCode: string } | null> {
    if (tarjaIdSet.size <= 1) return null;
    const memberIds = [...tarjaIdSet].filter((x) => x > 0);
    if (memberIds.length <= 1) return null;

    const merges = await this.tagMergeRepo.find({
      where: { result_tarja_id: In(memberIds) },
      select: ['id', 'result_tarja_id'],
    });
    for (const m of merges) {
      const mergeId = Number(m.id);
      const R = Number(m.result_tarja_id);
      const sources = await this.tagMergeSourceRepo.find({
        where: { merge_id: mergeId },
        select: ['source_tarja_id'],
      });
      const srcIds = sources.map((s) => Number(s.source_tarja_id)).filter((x) => x > 0);
      if (srcIds.length === 0) continue;

      const full = new Set<number>([R, ...srcIds]);
      if (full.size !== tarjaIdSet.size) continue;
      let same = true;
      for (const t of tarjaIdSet) {
        if (!full.has(t)) {
          same = false;
          break;
        }
      }
      if (!same) continue;
      for (const t of full) {
        if (!tarjaIdSet.has(t)) {
          same = false;
          break;
        }
      }
      if (!same) continue;

      const tagCode = tagCodeByTarjaId.get(R)?.trim();
      if (!tagCode) continue;
      return { resultTarjaId: R, tagCode };
    }
    return null;
  }

  /**
   * Resuelve unidades PT (tarjas) por pallet: todas las líneas → proceso → `fruit_processes.tarja_id`
   * y además `pt_tag_items` por `process_id` (misma cadena que en planta si el proceso quedó vinculado solo por ítems).
   * No usa solo la primera línea: une todas las tarjas distintas del pallet.
   */
  private async resolveUnidadPtTraceabilityByPallet(
    linesByPallet: Map<number, FinalPalletLine[]>,
    palletById: Map<number, FinalPallet>,
  ): Promise<Map<number, UnidadPtTraceability>> {
    const out = new Map<number, UnidadPtTraceability>();
    const allLines = [...linesByPallet.values()].flat();
    const processIds = [
      ...new Set(
        allLines
          .map((l) => l.fruit_process_id)
          .filter((id): id is number => id != null && Number(id) > 0)
          .map(Number),
      ),
    ];

    for (const [palletId, pallet] of palletById) {
      const corner = pallet.corner_board_code?.trim();
      const codigo_logistico =
        corner && corner.length > 0 ? corner : this.cornerCodeFromId(palletId);
      out.set(palletId, {
        unidad_pt_codigos: [],
        tarja_ids: [],
        trazabilidad_pt: 'sin_trazabilidad',
        codigo_unidad_pt_display: codigo_logistico,
        codigo_logistico,
      });
    }

    const directTarjaIds = [
      ...new Set(
        [...palletById.values()]
          .map((p) => (p.tarja_id != null && Number(p.tarja_id) > 0 ? Number(p.tarja_id) : null))
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
    const directTagRows =
      directTarjaIds.length > 0
        ? await this.tagRepo.find({ where: { id: In(directTarjaIds) }, select: ['id', 'tag_code'] })
        : [];
    const directCodeByTarjaId = new Map<number, string>();
    for (const t of directTagRows) {
      const c = (t.tag_code ?? '').trim();
      if (c) directCodeByTarjaId.set(Number(t.id), c);
    }

    if (processIds.length === 0) {
      for (const [palletId, pallet] of palletById) {
        const corner = pallet.corner_board_code?.trim();
        const codigo_logistico =
          corner && corner.length > 0 ? corner : this.cornerCodeFromId(palletId);
        const tid = pallet.tarja_id != null && Number(pallet.tarja_id) > 0 ? Number(pallet.tarja_id) : null;
        const code = tid != null ? directCodeByTarjaId.get(tid) : undefined;
        if (tid != null && code) {
          out.set(palletId, {
            unidad_pt_codigos: [code],
            tarja_ids: [tid],
            trazabilidad_pt: 'unica',
            codigo_unidad_pt_display: code,
            codigo_logistico,
          });
        }
      }
      return out;
    }

    const procs = await this.processRepo.find({
      where: { id: In(processIds) },
      select: ['id', 'tarja_id'],
    });
    const procById = new Map(procs.map((x) => [Number(x.id), x]));

    const tagItems =
      processIds.length > 0
        ? await this.tagItemRepo.find({
            where: { process_id: In(processIds) },
            select: ['process_id', 'tarja_id'],
          })
        : [];
    const extraTarjasByProcess = new Map<number, number[]>();
    for (const it of tagItems) {
      const procId = Number(it.process_id);
      const tid = Number(it.tarja_id);
      if (tid <= 0) continue;
      const arr = extraTarjasByProcess.get(procId) ?? [];
      arr.push(tid);
      extraTarjasByProcess.set(procId, arr);
    }

    const collectTarjaIdsForProcess = (procId: number): number[] => {
      const s = new Set<number>();
      const proc = procById.get(procId);
      if (proc?.tarja_id != null && Number(proc.tarja_id) > 0) s.add(Number(proc.tarja_id));
      for (const tid of extraTarjasByProcess.get(procId) ?? []) {
        if (tid > 0) s.add(tid);
      }
      return [...s];
    };

    const allTarjaIds = new Set<number>();
    for (const procId of processIds) {
      for (const tid of collectTarjaIdsForProcess(procId)) {
        allTarjaIds.add(tid);
      }
    }
    const tarjaIdList = [...allTarjaIds].filter((x) => x > 0);
    const tagCodeByTarjaId = new Map<number, string>();
    if (tarjaIdList.length > 0) {
      const tags = await this.tagRepo.find({
        where: { id: In(tarjaIdList) },
        select: ['id', 'tag_code'],
      });
      for (const t of tags) {
        const code = (t.tag_code ?? '').trim();
        if (code) tagCodeByTarjaId.set(Number(t.id), code);
      }
    }

    for (const [palletId, pallet] of palletById) {
      const lines = linesByPallet.get(palletId) ?? [];
      const corner = pallet.corner_board_code?.trim();
      const codigo_logistico =
        corner && corner.length > 0 ? corner : this.cornerCodeFromId(palletId);

      const tidDirect = pallet.tarja_id != null && Number(pallet.tarja_id) > 0 ? Number(pallet.tarja_id) : null;
      const codeDirect = tidDirect != null ? directCodeByTarjaId.get(tidDirect) : undefined;
      if (tidDirect != null && codeDirect) {
        out.set(palletId, {
          unidad_pt_codigos: [codeDirect],
          tarja_ids: [tidDirect],
          trazabilidad_pt: 'unica',
          codigo_unidad_pt_display: codeDirect,
          codigo_logistico,
        });
        continue;
      }

      const tarjaIdSet = new Set<number>();
      for (const ln of lines) {
        const fpid = ln.fruit_process_id != null ? Number(ln.fruit_process_id) : 0;
        if (fpid <= 0) continue;
        for (const tid of collectTarjaIdsForProcess(fpid)) {
          tarjaIdSet.add(tid);
        }
      }

      const tarja_ids = [...tarjaIdSet].sort((a, b) => a - b);
      const codeSet = new Set<string>();
      for (const tid of tarja_ids) {
        const c = tagCodeByTarjaId.get(tid);
        if (c) codeSet.add(c);
      }
      let unidad_pt_codigos = [...codeSet].sort((a, b) => a.localeCompare(b));
      let tarja_ids_out = tarja_ids;

      let trazabilidad_pt: UnidadPtTraceability['trazabilidad_pt'];
      if (unidad_pt_codigos.length === 0) trazabilidad_pt = 'sin_trazabilidad';
      else if (unidad_pt_codigos.length === 1) trazabilidad_pt = 'unica';
      else trazabilidad_pt = 'varias';

      if (trazabilidad_pt === 'varias') {
        const collapsed = await this.tryCollapsePtTagMerge(tarjaIdSet, tagCodeByTarjaId);
        if (collapsed) {
          trazabilidad_pt = 'unica';
          unidad_pt_codigos = [collapsed.tagCode];
          tarja_ids_out = [collapsed.resultTarjaId];
        }
      }

      let codigo_unidad_pt_display: string;
      if (trazabilidad_pt === 'sin_trazabilidad') {
        codigo_unidad_pt_display = codigo_logistico;
      } else if (trazabilidad_pt === 'unica') {
        codigo_unidad_pt_display = unidad_pt_codigos[0];
      } else {
        const n = unidad_pt_codigos.length;
        codigo_unidad_pt_display =
          n === 2
            ? `${unidad_pt_codigos[0]} · ${unidad_pt_codigos[1]}`
            : `${unidad_pt_codigos[0]} (+${n - 1} más)`;
      }

      out.set(palletId, {
        unidad_pt_codigos,
        tarja_ids: tarja_ids_out,
        trazabilidad_pt,
        codigo_unidad_pt_display,
        codigo_logistico,
      });
    }

    return out;
  }

  private buildMensajeTrazabilidad(
    t: UnidadPtTraceability,
    opts: { repalletizaje: 'no' | 'resultado' | 'origen' },
  ): string {
    const list = t.unidad_pt_codigos.join(', ');
    if (t.trazabilidad_pt === 'sin_trazabilidad') {
      return `Existencia legacy sin unidad PT vinculada en trazabilidad; identificador logístico: ${t.codigo_logistico}.`;
    }
    if (t.trazabilidad_pt === 'unica') {
      return `Esta existencia proviene de la unidad PT ${t.unidad_pt_codigos[0]}.`;
    }
    if (opts.repalletizaje === 'resultado') {
      return `Esta existencia resulta de repaletizaje y agrupa varias unidades PT: ${list}.`;
    }
    return `Esta existencia agrupa varias unidades PT en el mismo pallet: ${list}.`;
  }

  private async getRepalletizajeRol(palletId: number, status: string): Promise<'no' | 'resultado' | 'origen'> {
    const ev = await this.repalletEventRepo.findOne({
      where: { result_final_pallet_id: palletId, reversed_at: IsNull() },
    });
    if (ev) return 'resultado';
    if (status === 'repaletizado') return 'origen';
    return 'no';
  }

  /**
   * Para otros módulos (p. ej. packing list) que deben mostrar el mismo código operativo TAR/PF
   * que Existencias PT, sin duplicar la lógica de joins.
   */
  async resolveUnidadPtTraceabilityForPalletIds(palletIds: number[]): Promise<Map<number, UnidadPtTraceability>> {
    const ids = [...new Set(palletIds.map(Number))].filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) return new Map();
    const pallets = await this.palletRepo.findBy({ id: In(ids) });
    const palletById = new Map(pallets.map((p) => [Number(p.id), p]));
    const lineRows = await this.lineRepo.find({
      where: { final_pallet_id: In(ids) },
      order: { line_order: 'ASC', id: 'ASC' },
    });
    const linesByPallet = new Map<number, FinalPalletLine[]>();
    for (const ln of lineRows) {
      const pid = Number(ln.final_pallet_id);
      const arr = linesByPallet.get(pid) ?? [];
      arr.push(ln);
      linesByPallet.set(pid, arr);
    }
    return this.resolveUnidadPtTraceabilityByPallet(linesByPallet, palletById);
  }

  private mapPallet(
    p: FinalPallet,
    opts?: {
      brandNombre?: string | null;
      unidad_pt?: UnidadPtTraceability | null;
      mensaje_trazabilidad?: string | null;
    },
  ) {
    const brand_nombre =
      opts?.brandNombre !== undefined ? opts.brandNombre : p.brand?.nombre ?? null;
    const u = opts?.unidad_pt;
    const logisticFallback =
      p.corner_board_code?.trim() && p.corner_board_code.trim().length > 0
        ? p.corner_board_code.trim()
        : this.cornerCodeFromId(Number(p.id));
    return {
      id: p.id,
      status: p.status,
      species_id: p.species_id != null ? Number(p.species_id) : null,
      species_nombre: p.species?.nombre,
      quality_grade_id: p.quality_grade_id != null ? Number(p.quality_grade_id) : null,
      quality_nombre: p.quality_grade?.nombre,
      corner_board_code: p.corner_board_code,
      clamshell_label: p.clamshell_label,
      brand_id: p.brand_id != null ? Number(p.brand_id) : null,
      brand_nombre,
      dispatch_unit: p.dispatch_unit,
      packing_type: p.packing_type,
      market: p.market,
      bol: this.normalizeBol(p.bol),
      planned_sales_order_id: p.planned_sales_order_id != null ? Number(p.planned_sales_order_id) : null,
      planned_order_number: p.planned_sales_order?.order_number ?? null,
      client_id: p.client_id != null ? Number(p.client_id) : null,
      client_nombre: p.client?.nombre ?? null,
      fruit_quality_mode: p.fruit_quality_mode,
      presentation_format_id: p.presentation_format_id != null ? Number(p.presentation_format_id) : null,
      format_code: p.presentation_format?.format_code ?? null,
      max_boxes_per_pallet:
        p.presentation_format?.max_boxes_per_pallet != null
          ? Number(p.presentation_format.max_boxes_per_pallet)
          : null,
      net_weight_lb_per_box:
        p.presentation_format?.net_weight_lb_per_box != null
          ? Number(p.presentation_format.net_weight_lb_per_box)
          : null,
      dispatch_id: p.dispatch_id != null ? Number(p.dispatch_id) : null,
      pt_packing_list_id: p.pt_packing_list_id != null ? Number(p.pt_packing_list_id) : null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      lines: (p.lines ?? []).map((l) => this.mapLine(l)),
      totals: {
        amount: (p.lines ?? []).reduce((s, l) => s + l.amount, 0),
        pounds: (p.lines ?? []).reduce((s, l) => s + Number(l.pounds), 0),
      },
      /** Primera TAR resuelta (compat); preferir `codigo_unidad_pt_display` en UI. */
      tag_code: u?.unidad_pt_codigos?.[0] ?? null,
      unidad_pt_codigos: u?.unidad_pt_codigos ?? [],
      tarja_ids: u?.tarja_ids ?? [],
      trazabilidad_pt: u?.trazabilidad_pt ?? 'sin_trazabilidad',
      codigo_unidad_pt_display: u?.codigo_unidad_pt_display ?? logisticFallback,
      codigo_logistico: u?.codigo_logistico ?? logisticFallback,
      mensaje_trazabilidad: opts?.mensaje_trazabilidad ?? null,
    };
  }

  async getPackoutBudget(processId: number, presentationFormatId?: number, excludeFinalPalletId?: number, em?: EntityManager) {
    const processRepo = em ? em.getRepository(FruitProcess) : this.processRepo;
    const lineRepo = em ? em.getRepository(FinalPalletLine) : this.lineRepo;
    const formatRepo = em ? em.getRepository(PresentationFormat) : this.formatRepo;
    const proc = await processRepo.findOne({ where: { id: processId } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    const budget = this.effectivePackoutBudgetLb(proc);
    const qb = lineRepo
      .createQueryBuilder('l')
      .innerJoin(FinalPallet, 'fp', 'fp.id = l.final_pallet_id')
      .select('COALESCE(SUM(CAST(l.pounds AS DECIMAL)), 0)', 's')
      .where('l.fruit_process_id = :pid', { pid: processId })
      .andWhere("fp.status NOT IN ('anulado', 'repaletizado', 'revertido', 'asignado_pl')");
    if (excludeFinalPalletId != null && excludeFinalPalletId > 0) {
      qb.andWhere('fp.id != :exFp', { exFp: excludeFinalPalletId });
    }
    const raw = await qb.getRawOne();
    const usedLb = Number(raw?.s ?? 0);
    const remainingLb = Math.max(0, budget - usedLb);

    let netPerBox: number | null = null;
    let maxBoxesFormat: number | null = null;
    if (presentationFormatId != null) {
      const fmt = await formatRepo.findOne({ where: { id: presentationFormatId } });
      if (fmt) {
        const n = Number(fmt.net_weight_lb_per_box || 0);
        netPerBox = n > 0 ? n : null;
        maxBoxesFormat =
          fmt.max_boxes_per_pallet != null && fmt.max_boxes_per_pallet > 0
            ? Number(fmt.max_boxes_per_pallet)
            : null;
      }
    }

    const remainingBoxesByPackout =
      netPerBox != null && netPerBox > 0 && remainingLb > 0 ? Math.floor(remainingLb / netPerBox + 1e-9) : null;

    /**
     * Tope de cajas que aún puede aportar el proceso a un pallet/unidad PT (packout / lb entrada).
     * `max_boxes_per_pallet` del formato limita solo el campo «cajas por pallet» de la unidad PT, no este total.
     */
    let suggestedMaxBoxesThisPallet: number | null = null;
    if (remainingBoxesByPackout != null) {
      suggestedMaxBoxesThisPallet = remainingBoxesByPackout;
    } else if (maxBoxesFormat != null) {
      suggestedMaxBoxesThisPallet = maxBoxesFormat;
    }

    return {
      process_id: processId,
      budget_lb: budget,
      /** Packout explícito desde tarjas; 0 si el tope viene solo de lb entrada. */
      explicit_packout_lb: Number(proc.lb_packout || 0),
      used_lb: usedLb,
      remaining_lb: remainingLb,
      net_lb_per_box: netPerBox,
      max_boxes_per_pallet: maxBoxesFormat,
      remaining_boxes_by_packout: remainingBoxesByPackout,
      suggested_max_boxes_this_pallet: suggestedMaxBoxesThisPallet,
    };
  }

  private async assertPackoutRoom(
    dtoLines: CreateFinalPalletDto['lines'],
    excludeFinalPalletId?: number,
    em?: EntityManager,
  ) {
    const byPid = new Map<number, number>();
    for (const ln of dtoLines) {
      if (ln.fruit_process_id == null || ln.fruit_process_id <= 0) continue;
      const pid = ln.fruit_process_id;
      byPid.set(pid, (byPid.get(pid) ?? 0) + Number(ln.pounds));
    }
    const processRepo = em ? em.getRepository(FruitProcess) : this.processRepo;
    for (const [pid, newLb] of byPid) {
      const proc = await processRepo.findOne({ where: { id: pid } });
      if (!proc) throw new BadRequestException(`Proceso #${pid} no encontrado`);
      const entradaCap = await this.entradaLbBasis(proc, em);
      const pb = await this.getPackoutBudget(pid, undefined, excludeFinalPalletId, em);
      /** Libra disponible = lb de entrada (producto) no aún en pallet final; no usar `lb_packout` como techo (varias unidades PT / formatos). */
      const remaining = Math.max(0, entradaCap - pb.used_lb);
      if (newLb > remaining + PACKOUT_EPS) {
        throw new BadRequestException(
          `Proceso #${pid}: este pallet suma ${newLb.toFixed(3)} lb pero solo quedan ${remaining.toFixed(3)} lb disponibles para palletizar (entrada ${entradaCap.toFixed(3)} lb menos ${pb.used_lb.toFixed(3)} lb ya en pallets).`,
        );
      }
    }
  }

  private async resolveClamshellLabel(formatId: number | null, manual?: string): Promise<string> {
    const t = (manual ?? '').trim();
    if (t) return t;
    if (!formatId) return '';
    const mats = await this.materialRepo
      .createQueryBuilder('m')
      .innerJoin('m.material_category', 'cat')
      .where('cat.codigo = :codigo', { codigo: MATERIAL_CATEGORY_CODES.CLAMSHELL })
      .andWhere('m.presentation_format_id = :fid', { fid: formatId })
      .andWhere('m.activo = true')
      .orderBy('m.id', 'ASC')
      .getMany();
    if (!mats.length) return '';
    return mats.map((m) => m.nombre_material).join(', ');
  }

  async listPallets() {
    const rows = await this.palletRepo.find({
      order: { id: 'DESC' },
      take: 200,
      relations: {
        species: true,
        quality_grade: true,
        client: true,
        presentation_format: true,
        planned_sales_order: true,
        lines: { variety: true },
      },
    });
    const brandIds = [
      ...new Set(
        rows
          .map((r) => r.brand_id)
          .filter((id): id is number => id != null && Number(id) > 0),
      ),
    ];
    const brands =
      brandIds.length > 0 ? await this.brandRepo.findBy({ id: In(brandIds) }) : [];
    const brandNameById = new Map(brands.map((b) => [Number(b.id), b.nombre]));
    for (const p of rows) {
      if (p.lines?.length) p.lines.sort((a, b) => a.line_order - b.line_order || a.id - b.id);
    }
    const linesByPallet = new Map<number, FinalPalletLine[]>();
    const palletById = new Map<number, FinalPallet>();
    for (const p of rows) {
      const id = Number(p.id);
      linesByPallet.set(id, p.lines ?? []);
      palletById.set(id, p);
    }
    const traceByPallet = await this.resolveUnidadPtTraceabilityByPallet(linesByPallet, palletById);
    return rows.map((p) =>
      this.mapPallet(p, {
        brandNombre:
          p.brand_id != null && Number(p.brand_id) > 0
            ? brandNameById.get(Number(p.brand_id)) ?? null
            : null,
        unidad_pt: traceByPallet.get(Number(p.id)) ?? null,
      }),
    );
  }

  async getPallet(id: number) {
    const p = await this.palletRepo.findOne({
      where: { id },
      relations: {
        species: true,
        quality_grade: true,
        client: true,
        brand: true,
        presentation_format: true,
        planned_sales_order: true,
      },
    });
    if (!p) throw new NotFoundException('Pallet final no encontrado');
    const lines = await this.lineRepo.find({
      where: { final_pallet_id: id },
      relations: { variety: true },
      order: { line_order: 'ASC', id: 'ASC' },
    });
    p.lines = lines;
    const traceMap = await this.resolveUnidadPtTraceabilityByPallet(new Map([[id, lines]]), new Map([[id, p]]));
    const trace = traceMap.get(id) ?? null;
    const repRol = await this.getRepalletizajeRol(id, p.status);
    const mensaje =
      trace != null ? this.buildMensajeTrazabilidad(trace, { repalletizaje: repRol }) : null;
    return this.mapPallet(p, { unidad_pt: trace, mensaje_trazabilidad: mensaje });
  }

  /**
   * Vista detalle trazabilidad (solo lectura): recepción → proceso → pallet por línea.
   */
  async getPalletTraceabilityDetail(id: number) {
    const p = await this.palletRepo.findOne({
      where: { id },
      relations: {
        species: true,
        quality_grade: true,
        client: true,
        brand: true,
        presentation_format: true,
        planned_sales_order: true,
      },
    });
    if (!p) throw new NotFoundException('Pallet final no encontrado');

    const lines = await this.lineRepo.find({
      where: { final_pallet_id: id },
      relations: {
        variety: { species: true },
        fruit_process: { reception: { producer: true } },
      },
      order: { line_order: 'ASC', id: 'ASC' },
    });

    const recepcionesUnique = new Map<
      number,
      { id: number; ref_display: string; document_number: string | null; received_at: string | null }
    >();

    const traceLines = lines.map((l) => {
      const proc = l.fruit_process;
      const rec = proc?.reception;
      let refDisplay: string | null = null;
      let recepcionId: number | null = null;
      let documentNumber: string | null = null;
      let receivedAt: string | null = null;
      let productorNombre: string | null = null;
      let productorCodigo: string | null = null;

      if (rec) {
        recepcionId = Number(rec.id);
        refDisplay = receptionReferenceDisplay(rec);
        documentNumber = rec.document_number?.trim() || null;
        receivedAt = rec.received_at ? new Date(rec.received_at).toISOString() : null;
        if (rec.producer) {
          productorNombre = rec.producer.nombre?.trim() || null;
          productorCodigo = rec.producer.codigo?.trim() || null;
        }
        if (recepcionId > 0 && refDisplay) {
          recepcionesUnique.set(recepcionId, {
            id: recepcionId,
            ref_display: refDisplay,
            document_number: documentNumber,
            received_at: receivedAt,
          });
        }
      }

      const speciesNombreLinea = l.variety?.species?.nombre?.trim() || p.species?.nombre || null;

      return {
        line_id: l.id,
        line_order: l.line_order,
        fruit_process_id: l.fruit_process_id != null ? Number(l.fruit_process_id) : null,
        proceso: proc
          ? {
              id: Number(proc.id),
              resultado: proc.resultado,
              fecha_proceso: proc.fecha_proceso instanceof Date ? proc.fecha_proceso.toISOString() : proc.fecha_proceso,
              process_status: proc.process_status,
            }
          : null,
        productor:
          productorNombre || productorCodigo
            ? { nombre: productorNombre, codigo: productorCodigo }
            : null,
        recepcion:
          recepcionId != null && recepcionId > 0
            ? {
                id: recepcionId,
                ref_display: refDisplay,
                document_number: documentNumber,
                received_at: receivedAt,
              }
            : null,
        ref_text: l.ref_text?.trim() || null,
        especie: speciesNombreLinea,
        variedad: { id: Number(l.variety_id), nombre: l.variety?.nombre ?? null },
        amount: l.amount,
        pounds: Number(l.pounds),
      };
    });

    const totalBoxes = lines.reduce((s, l) => s + l.amount, 0);
    const totalPounds = lines.reduce((s, l) => s + Number(l.pounds), 0);

    const brandNombre = p.brand_id != null && Number(p.brand_id) > 0 ? p.brand?.nombre ?? null : null;

    const evAsResult = await this.repalletEventRepo.findOne({ where: { result_final_pallet_id: id } });
    const resultSources =
      evAsResult != null
        ? await this.repalletSourceRepo.find({ where: { event_id: evAsResult.id } })
        : [];
    const reversalRow =
      evAsResult != null
        ? await this.repalletReversalRepo.findOne({ where: { repallet_event_id: evAsResult.id } })
        : null;
    let repalletReverseBlockCount = 0;
    if (evAsResult != null && evAsResult.reversed_at == null) {
      repalletReverseBlockCount = await this.repalletSourceRepo
        .createQueryBuilder('rs')
        .innerJoin('repallet_events', 'e', 'e.id = rs.event_id')
        .where('rs.source_final_pallet_id = :pid', { pid: id })
        .andWhere('rs.event_id != :evid', { evid: evAsResult.id })
        .andWhere('e.reversed_at IS NULL')
        .getCount();
    }
    const sourcesAsSource = await this.repalletSourceRepo.find({ where: { source_final_pallet_id: id } });
    const eventIds = [...new Set(sourcesAsSource.map((s) => Number(s.event_id)))];
    const eventsForSource =
      eventIds.length > 0 ? await this.repalletEventRepo.findBy({ id: In(eventIds) }) : [];
    const evById = new Map(eventsForSource.map((e) => [Number(e.id), e]));

    const repalletRelatedIds = new Set<number>();
    for (const s of resultSources) repalletRelatedIds.add(Number(s.source_final_pallet_id));
    for (const s of sourcesAsSource) {
      const ev = evById.get(Number(s.event_id));
      if (ev != null && ev.result_final_pallet_id != null) repalletRelatedIds.add(Number(ev.result_final_pallet_id));
    }
    const repalletTraceMap =
      repalletRelatedIds.size > 0
        ? await this.resolveUnidadPtTraceabilityForPalletIds([...repalletRelatedIds])
        : new Map<number, UnidadPtTraceability>();

    type RepalletReversePayload = {
      can_reverse: boolean;
      blocked_reason: 'despachado' | 'usado_en_repalet_posterior' | null;
      reversed_at: string | null;
      reversal: {
        id: number;
        created_at: string;
        reversed_by_username: string;
        notes: string | null;
      } | null;
    };
    let repalletReverse: RepalletReversePayload | null = null;
    if (evAsResult != null) {
      if (evAsResult.reversed_at != null) {
        repalletReverse = {
          can_reverse: false,
          blocked_reason: null,
          reversed_at: this.dateToIso(evAsResult.reversed_at),
          reversal: reversalRow
            ? {
                id: Number(reversalRow.id),
                created_at: this.dateToIso(reversalRow.created_at) ?? '',
                reversed_by_username: reversalRow.reversed_by_username,
                notes: reversalRow.notes ?? null,
              }
            : null,
        };
      } else if (p.dispatch_id != null && Number(p.dispatch_id) > 0) {
        repalletReverse = {
          can_reverse: false,
          blocked_reason: 'despachado',
          reversed_at: null,
          reversal: null,
        };
      } else if (repalletReverseBlockCount > 0) {
        repalletReverse = {
          can_reverse: false,
          blocked_reason: 'usado_en_repalet_posterior',
          reversed_at: null,
          reversal: null,
        };
      } else {
        repalletReverse = {
          can_reverse: true,
          blocked_reason: null,
          reversed_at: null,
          reversal: null,
        };
      }
    }

    const repalletEventActive = evAsResult != null && evAsResult.reversed_at == null;
    const repalletizajeRol: 'no' | 'resultado' | 'origen' = repalletEventActive
      ? 'resultado'
      : p.status === 'repaletizado'
        ? 'origen'
        : 'no';

    const traceMap = await this.resolveUnidadPtTraceabilityByPallet(new Map([[id, lines]]), new Map([[id, p]]));
    const trace = traceMap.get(id) ?? null;
    const mensajeTraz =
      trace != null ? this.buildMensajeTrazabilidad(trace, { repalletizaje: repalletizajeRol }) : null;
    const logisticFallback =
      p.corner_board_code?.trim() && p.corner_board_code.trim().length > 0
        ? p.corner_board_code.trim()
        : this.cornerCodeFromId(id);

    return {
      pallet: {
        id: p.id,
        corner_board_code: p.corner_board_code,
        tag_code: trace?.unidad_pt_codigos?.[0] ?? null,
        unidad_pt_codigos: trace?.unidad_pt_codigos ?? [],
        tarja_ids: trace?.tarja_ids ?? [],
        trazabilidad_pt: trace?.trazabilidad_pt ?? 'sin_trazabilidad',
        codigo_unidad_pt_display: trace?.codigo_unidad_pt_display ?? logisticFallback,
        codigo_logistico: trace?.codigo_logistico ?? logisticFallback,
        mensaje_trazabilidad: mensajeTraz,
        repalletizaje: repalletizajeRol,
        status: p.status,
        species_nombre: p.species?.nombre ?? null,
        quality_nombre: p.quality_grade?.nombre ?? null,
        format_code: p.presentation_format?.format_code ?? null,
        presentation_format_id: p.presentation_format_id != null ? Number(p.presentation_format_id) : null,
        client_id: p.client_id != null ? Number(p.client_id) : null,
        client_nombre: p.client?.nombre ?? null,
        brand_nombre: brandNombre,
        bol: this.normalizeBol(p.bol),
        planned_sales_order_id: p.planned_sales_order_id != null ? Number(p.planned_sales_order_id) : null,
        planned_order_number: p.planned_sales_order?.order_number ?? null,
        clamshell_label: p.clamshell_label ?? '',
        dispatch_id: p.dispatch_id != null ? Number(p.dispatch_id) : null,
        totals: { amount: totalBoxes, pounds: totalPounds },
      },
      recepciones: [...recepcionesUnique.values()].sort((a, b) => a.id - b.id),
      lines: traceLines,
      repallet: {
        as_result:
          evAsResult != null
            ? {
                event_id: Number(evAsResult.id),
                created_at: this.dateToIso(evAsResult.created_at) ?? '',
                notes: evAsResult.notes ?? null,
                sources: resultSources.map((s) => {
                  const sid = Number(s.source_final_pallet_id);
                  const tr = repalletTraceMap.get(sid);
                  return {
                    source_final_pallet_id: sid,
                    codigo_unidad_pt_display: tr?.codigo_unidad_pt_display ?? null,
                    boxes_removed: s.boxes_removed,
                    pounds_removed: Number(s.pounds_removed),
                  };
                }),
              }
            : null,
        as_source: sourcesAsSource.map((s) => {
          const ev = evById.get(Number(s.event_id));
          const rid = ev != null && ev.result_final_pallet_id != null ? Number(ev.result_final_pallet_id) : null;
          const tr = rid != null && rid > 0 ? repalletTraceMap.get(rid) : undefined;
          return {
            event_id: Number(s.event_id),
            result_final_pallet_id: rid,
            result_codigo_unidad_pt_display: tr?.codigo_unidad_pt_display ?? null,
            boxes_removed: s.boxes_removed,
            pounds_removed: Number(s.pounds_removed),
            created_at: ev != null ? this.dateToIso(ev.created_at) : null,
          };
        }),
        reverse: repalletReverse,
      },
    };
  }

  /**
   * Crea o actualiza el `final_pallet` técnico 1:1 con una unidad PT cuando hay stock real (cajas > 0).
   * No sustituye el alta manual vía API (admin); se invoca desde `ProcessService` al persistir ítems de tarja.
   * Si `em` está presente, todo el I/O usa ese `EntityManager` (misma transacción que la tarja).
   */
  async syncTechnicalFinalPalletFromPtTag(tarjaId: number, em?: EntityManager): Promise<void> {
    const T = this.txRepos(em);
    const tag = await T.tag.findOne({ where: { id: tarjaId }, relations: ['client', 'brand'] });
    if (!tag) return;

    const items = await T.tagItem.find({ where: { tarja_id: tarjaId }, order: { id: 'ASC' } });
    const totalCajas = items.reduce((s, i) => s + Number(i.cajas_generadas), 0);
    const existing = await T.pallet.findOne({ where: { tarja_id: tarjaId } });

    if (totalCajas <= 0) {
      if (!existing) return;
      if (existing.dispatch_id != null && Number(existing.dispatch_id) > 0) return;
      if (existing.pt_packing_list_id != null && Number(existing.pt_packing_list_id) > 0) return;
      if (existing.status === 'repaletizado' || existing.status === 'asignado_pl') return;
      const runAnular = async (tx: EntityManager) => {
        await tx.delete(FinalPalletLine, { final_pallet_id: existing.id });
        existing.status = 'anulado';
        await tx.save(FinalPallet, existing);
      };
      if (em) await runAnular(em);
      else await this.ds.transaction(runAnular);
      await this.reconcileFinishedPtStockForPallet(existing.id, em);
      return;
    }

    if (existing) {
      if (existing.dispatch_id != null && Number(existing.dispatch_id) > 0) return;
      if (existing.pt_packing_list_id != null && Number(existing.pt_packing_list_id) > 0) return;
      if (existing.status === 'repaletizado' || existing.status === 'asignado_pl') return;
    }

    const fc = tag.format_code.trim().toLowerCase();
    const fmt = await T.format.findOne({ where: { format_code: fc } });
    if (!fmt) {
      throw new BadRequestException(`Formato de presentación no encontrado para la unidad PT: ${fc}`);
    }
    const formatId = Number(fmt.id);
    const netPerBox = await this.netLbPerBoxFromFormatCode(fc);

    const dtoLines: CreateFinalPalletDto['lines'] = [];
    let speciesId: number | null = fmt.species_id != null && Number(fmt.species_id) > 0 ? Number(fmt.species_id) : null;
    let qualityId: number | null = null;

    for (const it of items) {
      const proc = await T.process.findOne({
        where: { id: it.process_id },
        relations: [
          'reception',
          'reception.variety',
          'reception.variety.species',
          'reception_line',
          'reception_line.species',
          'reception_line.variety',
          'reception_line.quality_grade',
        ],
      });
      if (!proc) throw new BadRequestException(`Proceso #${it.process_id} no encontrado`);

      const fromProc =
        proc.reception_line?.species_id != null
          ? Number(proc.reception_line.species_id)
          : proc.reception?.variety?.species?.id != null
            ? Number(proc.reception.variety.species.id)
            : null;
      if (fromProc != null && fromProc > 0) {
        if (speciesId == null) speciesId = fromProc;
        else if (fromProc !== speciesId) {
          throw new BadRequestException(
            `Proceso #${proc.id}: la especie no coincide con el resto de la unidad PT (tarja ${tarjaId}).`,
          );
        }
      }
      if (qualityId == null && proc.reception_line?.quality_grade_id != null) {
        qualityId = Number(proc.reception_line.quality_grade_id);
      }

      const amount = Number(it.cajas_generadas);
      const pounds = amount * netPerBox;
      const fechaIso =
        proc.fecha_proceso instanceof Date
          ? proc.fecha_proceso.toISOString()
          : new Date(proc.fecha_proceso as unknown as string).toISOString();

      dtoLines.push({
        fruit_process_id: proc.id,
        fecha: fechaIso,
        variedad_id: Number(proc.variedad_id),
        amount,
        pounds,
      });
    }

    if (speciesId == null || speciesId <= 0) {
      throw new BadRequestException('No se pudo determinar la especie para el pallet técnico de la unidad PT');
    }

    for (let i = 0; i < dtoLines.length; i++) {
      const ln = dtoLines[i];
      const v = await T.variety.findOne({ where: { id: ln.variedad_id } });
      if (!v) throw new BadRequestException(`Variedad no encontrada (línea ${i + 1})`);
      if (Number(v.species_id) !== speciesId) {
        throw new BadRequestException(
          `La variedad de la línea ${i + 1} no coincide con la especie del formato/proceso (${speciesId}).`,
        );
      }
    }

    const totalLb = dtoLines.reduce((s, l) => s + Number(l.pounds), 0);
    if (!Number.isFinite(totalLb) || totalLb <= 0) {
      throw new BadRequestException('No se pudo calcular libras netas para el pallet técnico');
    }

    const clientId = tag.client_id != null && Number(tag.client_id) > 0 ? Number(tag.client_id) : null;
    const brandId = tag.brand_id != null && Number(tag.brand_id) > 0 ? Number(tag.brand_id) : null;
    if (brandId != null) {
      const b = await T.brand.findOne({ where: { id: brandId } });
      if (!b) throw new BadRequestException('Marca no encontrada');
      if (b.client_id != null && clientId == null) {
        throw new BadRequestException('La marca de la unidad PT requiere cliente');
      }
      if (b.client_id != null && clientId != null && Number(b.client_id) !== clientId) {
        throw new BadRequestException('La marca de la unidad PT no corresponde al cliente');
      }
    }

    const clamshellResolved = await this.resolveClamshellLabel(formatId, undefined);
    const lineRefTexts = await Promise.all(
      dtoLines.map((ln) => this.resolveLineRefText(ln.fruit_process_id, undefined)),
    );

    const excludeId = existing?.id;
    await this.assertPackoutRoom(dtoLines, excludeId, em);

    if (fmt.max_boxes_per_pallet != null && Number(fmt.max_boxes_per_pallet) > 0) {
      const cpp = Number(tag.cajas_por_pallet ?? 0);
      if (cpp > Number(fmt.max_boxes_per_pallet)) {
        throw new BadRequestException(
          `Este formato admite como máximo ${fmt.max_boxes_per_pallet} cajas por pallet físico en cada pallet; la unidad PT tiene ${cpp} en «cajas por pallet».`,
        );
      }
    }

    const runPalletWrites = async (tx: EntityManager) => {
      let pallet = existing ? await tx.findOne(FinalPallet, { where: { id: existing.id } }) : null;
      if (pallet?.id) {
        await tx.delete(FinalPalletLine, { final_pallet_id: pallet.id });
      }

      if (!pallet) {
        pallet = tx.create(FinalPallet, {
          status: 'definitivo',
          tarja_id: tarjaId,
          species_id: speciesId,
          quality_grade_id: qualityId,
          corner_board_code: '',
          clamshell_label: clamshellResolved,
          brand_id: brandId,
          dispatch_unit: '',
          packing_type: '',
          market: '',
          bol: this.normalizeBol(tag.bol),
          planned_sales_order_id: null,
          client_id: clientId,
          fruit_quality_mode: 'proceso',
          presentation_format_id: formatId,
        });
        pallet = await tx.save(FinalPallet, pallet);
        pallet.corner_board_code = this.cornerCodeFromId(pallet.id);
        pallet = await tx.save(FinalPallet, pallet);
      } else {
        Object.assign(pallet, {
          status: 'definitivo',
          tarja_id: tarjaId,
          species_id: speciesId,
          quality_grade_id: qualityId,
          clamshell_label: clamshellResolved,
          brand_id: brandId,
          bol: this.normalizeBol(tag.bol),
          client_id: clientId,
          fruit_quality_mode: 'proceso',
          presentation_format_id: formatId,
        });
        pallet = await tx.save(FinalPallet, pallet);
      }

      const pid = pallet.id;
      for (let i = 0; i < dtoLines.length; i++) {
        const ln = dtoLines[i];
        const line = tx.create(FinalPalletLine, {
          final_pallet_id: pid,
          line_order: i,
          fruit_process_id: ln.fruit_process_id ?? null,
          fecha: new Date(ln.fecha),
          ref_text: lineRefTexts[i] ?? null,
          variety_id: ln.variedad_id,
          caliber: null,
          amount: ln.amount,
          pounds: Number(ln.pounds).toFixed(3),
          net_lb: Number(ln.pounds).toFixed(3),
        });
        await tx.save(FinalPalletLine, line);
      }
      return pid;
    };

    const savedId = em ? await runPalletWrites(em) : await this.ds.transaction(runPalletWrites);

    await this.reconcileFinishedPtStockForPallet(savedId, em);
  }

  async createPallet(dto: CreateFinalPalletDto) {
    if (dto.species_id != null) {
      const sp = await this.speciesRepo.findOne({ where: { id: dto.species_id } });
      if (!sp) throw new BadRequestException('Especie no encontrada');
    }
    if (dto.quality_grade_id != null) {
      const q = await this.qualityRepo.findOne({ where: { id: dto.quality_grade_id } });
      if (!q) throw new BadRequestException('Calidad no encontrada');
    }
    const clientId = dto.client_id != null && dto.client_id > 0 ? dto.client_id : null;
    if (clientId != null) {
      const c = await this.clientRepo.findOne({ where: { id: clientId } });
      if (!c) throw new BadRequestException('Cliente no encontrado');
    }
    const brandId = dto.brand_id != null && dto.brand_id > 0 ? dto.brand_id : null;
    if (brandId != null) {
      const b = await this.brandRepo.findOne({ where: { id: brandId } });
      if (!b) throw new BadRequestException('Marca no encontrada');
      if (b.client_id != null && clientId == null) {
        throw new BadRequestException('La marca elegida está ligada a un cliente: indicá el cliente del pallet');
      }
      if (b.client_id != null && clientId != null && Number(b.client_id) !== clientId) {
        throw new BadRequestException('La marca elegida no corresponde al cliente del pallet');
      }
    }
    const formatId = dto.presentation_format_id != null && dto.presentation_format_id > 0 ? dto.presentation_format_id : null;
    if (formatId != null) {
      const f = await this.formatRepo.findOne({ where: { id: formatId } });
      if (!f) throw new BadRequestException('Formato de presentación no encontrado');
    }

    const clamshellResolved = await this.resolveClamshellLabel(formatId, dto.clamshell_label);

    for (let i = 0; i < dto.lines.length; i++) {
      const ln = dto.lines[i];
      const v = await this.varietyRepo.findOne({ where: { id: ln.variedad_id } });
      if (!v) throw new BadRequestException(`Variedad no encontrada (línea ${i + 1})`);
      if (dto.species_id != null && Number(v.species_id) !== dto.species_id) {
        throw new BadRequestException(`La variedad de la línea ${i + 1} no coincide con la especie del pallet`);
      }
      if (ln.fruit_process_id != null) {
        const proc = await this.processRepo.findOne({ where: { id: ln.fruit_process_id } });
        if (!proc) throw new BadRequestException(`Proceso no encontrado (línea ${i + 1})`);
      }
    }

    const totalBoxesCreate = dto.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const totalLbCreate = dto.lines.reduce((s, l) => s + Number(l.pounds ?? 0), 0);
    if (totalBoxesCreate <= 0) {
      throw new BadRequestException(
        'No se puede guardar un pallet sin cajas: el total de cajas en las líneas debe ser mayor a 0.',
      );
    }
    if (!Number.isFinite(totalLbCreate) || totalLbCreate <= 0) {
      throw new BadRequestException(
        'No se puede guardar un pallet sin libras netas: el total debe ser mayor a 0 (revisá cajas y el peso por caja del formato).',
      );
    }

    await this.assertPackoutRoom(dto.lines);

    const boxesByProcess = new Map<number, number>();
    for (const ln of dto.lines) {
      if (ln.fruit_process_id == null || ln.fruit_process_id <= 0) continue;
      const pid = ln.fruit_process_id;
      boxesByProcess.set(pid, (boxesByProcess.get(pid) ?? 0) + ln.amount);
    }
    if (formatId != null) {
      for (const [procId, sumBoxes] of boxesByProcess) {
        const b = await this.getPackoutBudget(procId, formatId);
        if (b.suggested_max_boxes_this_pallet != null && sumBoxes > b.suggested_max_boxes_this_pallet + 1e-9) {
          throw new BadRequestException(
            `Proceso #${procId}: en total ${sumBoxes} cajas en este pallet superan lo disponible (~${b.suggested_max_boxes_this_pallet} cajas según packout del proceso).`,
          );
        }
      }
    }

    const lineRefTexts = await Promise.all(
      dto.lines.map((ln) => this.resolveLineRefText(ln.fruit_process_id, ln.ref_text)),
    );

    const plannedSoId =
      dto.planned_sales_order_id != null && dto.planned_sales_order_id > 0 ? dto.planned_sales_order_id : null;
    if (plannedSoId != null) {
      await this.assertPlannedSalesOrderRef(plannedSoId);
    }

    const savedId = await this.ds.transaction(async (em) => {
      const pallet = em.create(FinalPallet, {
        status: dto.status ?? 'borrador',
        species_id: dto.species_id ?? null,
        quality_grade_id: dto.quality_grade_id ?? null,
        corner_board_code: '',
        clamshell_label: clamshellResolved,
        brand_id: brandId,
        dispatch_unit: dto.dispatch_unit ?? '',
        packing_type: dto.packing_type ?? '',
        market: dto.market ?? '',
        bol: this.normalizeBol(dto.bol),
        planned_sales_order_id: plannedSoId,
        client_id: clientId,
        fruit_quality_mode: dto.fruit_quality_mode ?? 'proceso',
        presentation_format_id: formatId,
      });
      const saved = await em.save(FinalPallet, pallet);
      saved.corner_board_code = this.cornerCodeFromId(saved.id);
      await em.save(FinalPallet, saved);

      for (let i = 0; i < dto.lines.length; i++) {
        const ln = dto.lines[i];
        const net =
          ln.net_lb != null
            ? ln.net_lb.toFixed(3)
            : ln.pounds != null
              ? ln.pounds.toFixed(3)
              : null;
        const line = em.create(FinalPalletLine, {
          final_pallet_id: saved.id,
          line_order: i,
          fruit_process_id: ln.fruit_process_id ?? null,
          fecha: new Date(ln.fecha),
          ref_text: lineRefTexts[i] ?? null,
          variety_id: ln.variedad_id,
          caliber: ln.caliber ?? null,
          amount: ln.amount,
          pounds: ln.pounds.toFixed(3),
          net_lb: net,
        });
        await em.save(FinalPalletLine, line);
      }

      return saved.id;
    });
    await this.reconcileFinishedPtStockForPallet(savedId);
    return this.getPallet(savedId);
  }

  async patchPallet(id: number, dto: PatchFinalPalletDto) {
    const p = await this.palletRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Pallet final no encontrado');
    if (dto.species_id != null) {
      const sp = await this.speciesRepo.findOne({ where: { id: dto.species_id } });
      if (!sp) throw new BadRequestException('Especie no encontrada');
    }
    if (dto.quality_grade_id != null) {
      const q = await this.qualityRepo.findOne({ where: { id: dto.quality_grade_id } });
      if (!q) throw new BadRequestException('Calidad no encontrada');
    }
    if (dto.client_id !== undefined) {
      const nextC = dto.client_id > 0 ? dto.client_id : null;
      if (nextC != null) {
        const c = await this.clientRepo.findOne({ where: { id: nextC } });
        if (!c) throw new BadRequestException('Cliente no encontrado');
      }
      p.client_id = nextC;
    }
    if (dto.brand_id !== undefined) {
      const nextB = dto.brand_id > 0 ? dto.brand_id : null;
      if (nextB != null) {
        const b = await this.brandRepo.findOne({ where: { id: nextB } });
        if (!b) throw new BadRequestException('Marca no encontrada');
        const effectiveClient = dto.client_id !== undefined ? (dto.client_id > 0 ? dto.client_id : null) : p.client_id;
        if (b.client_id != null && effectiveClient != null && Number(b.client_id) !== effectiveClient) {
          throw new BadRequestException('La marca no corresponde al cliente del pallet');
        }
      }
      p.brand_id = nextB;
    }
    if (dto.presentation_format_id !== undefined) {
      const nextF = dto.presentation_format_id > 0 ? dto.presentation_format_id : null;
      if (nextF != null) {
        const f = await this.formatRepo.findOne({ where: { id: nextF } });
        if (!f) throw new BadRequestException('Formato de presentación no encontrado');
      }
      p.presentation_format_id = nextF;
    }
    if (dto.clamshell_label !== undefined) {
      p.clamshell_label =
        (dto.clamshell_label ?? '').trim() ||
        (await this.resolveClamshellLabel(
          p.presentation_format_id != null ? Number(p.presentation_format_id) : null,
          '',
        ));
    }
    if (dto.planned_sales_order_id !== undefined) {
      const nextPso =
        dto.planned_sales_order_id != null && dto.planned_sales_order_id > 0 ? dto.planned_sales_order_id : null;
      if (nextPso != null) {
        await this.assertPlannedSalesOrderRef(nextPso);
      }
      p.planned_sales_order_id = nextPso;
    }
    Object.assign(p, {
      ...(dto.status != null && { status: dto.status }),
      ...(dto.species_id !== undefined && { species_id: dto.species_id }),
      ...(dto.quality_grade_id !== undefined && { quality_grade_id: dto.quality_grade_id }),
      ...(dto.dispatch_unit !== undefined && { dispatch_unit: dto.dispatch_unit }),
      ...(dto.packing_type !== undefined && { packing_type: dto.packing_type }),
      ...(dto.market !== undefined && { market: dto.market }),
      ...(dto.bol !== undefined && { bol: this.normalizeBol(dto.bol) }),
      ...(dto.fruit_quality_mode != null && { fruit_quality_mode: dto.fruit_quality_mode }),
    });
    await this.palletRepo.save(p);
    const affectsStock =
      dto.client_id !== undefined ||
      dto.brand_id !== undefined ||
      dto.presentation_format_id !== undefined ||
      dto.status != null;
    if (affectsStock) {
      await this.reconcileFinishedPtStockForPallet(id);
    }
    return this.getPallet(id);
  }

  /**
   * Mismo BOL para varios pallets: solo `definitivo` y sin despacho (validación server-side).
   */
  async bulkAssignBol(dto: BulkAssignBolDto) {
    const ids = [...new Set(dto.final_pallet_ids.map((x) => Number(x)))].filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) {
      throw new BadRequestException('Indicá al menos un pallet válido.');
    }
    const pallets = await this.palletRepo.findBy({ id: In(ids) });
    if (pallets.length !== ids.length) {
      throw new BadRequestException('Uno o más pallets no existen.');
    }
    const bol = this.normalizeBol(dto.bol);
    for (const p of pallets) {
      if (p.status !== 'definitivo') {
        throw new BadRequestException(
          `Pallet #${p.id}: solo se puede asignar BOL en estado definitivo (actual: ${p.status}).`,
        );
      }
      if (p.dispatch_id != null && Number(p.dispatch_id) > 0) {
        throw new BadRequestException(
          `Pallet #${p.id}: tiene despacho asignado; no se puede asignar BOL desde esta acción.`,
        );
      }
    }
    for (const p of pallets) {
      p.bol = bol;
      await this.palletRepo.save(p);
    }
    /** Solo metadata comercial; no tocar `finished_pt_stock` (evita error ficticio si agregado ≠ stock). */
    return { updated: pallets.length, final_pallet_ids: ids };
  }

  private mergeRepalletSources(sources: RepalletDto['sources']): Map<number, number> {
    const m = new Map<number, number>();
    for (const s of sources) {
      m.set(s.final_pallet_id, (m.get(s.final_pallet_id) ?? 0) + s.boxes);
    }
    return m;
  }

  private repalletMergeKey(
    fruitProcessId: number | null,
    varietyId: number,
    refText: string | null,
    caliber: string | null,
  ) {
    return `${fruitProcessId ?? ''}|${varietyId}|${(refText ?? '').trim()}|${(caliber ?? '').trim()}`;
  }

  private assertRepalletGroupCompatible(pallets: FinalPallet[]) {
    if (pallets.length === 0) return;
    const a = pallets[0];
    const normClient = (p: FinalPallet) =>
      p.client_id != null && Number(p.client_id) > 0 ? Number(p.client_id) : null;
    const normSpecies = (p: FinalPallet) =>
      p.species_id != null && Number(p.species_id) > 0 ? Number(p.species_id) : null;
    const normQg = (p: FinalPallet) =>
      p.quality_grade_id != null && Number(p.quality_grade_id) > 0 ? Number(p.quality_grade_id) : null;
    const normBrand = (p: FinalPallet) =>
      p.brand_id != null && Number(p.brand_id) > 0 ? Number(p.brand_id) : null;
    const normFmt = (p: FinalPallet) =>
      p.presentation_format_id != null && Number(p.presentation_format_id) > 0
        ? Number(p.presentation_format_id)
        : null;
    const normStr = (s: string | null | undefined) => (s ?? '').trim();

    for (const b of pallets) {
      if (b.status !== 'definitivo') {
        throw new BadRequestException(
          `Solo se pueden repaletizar pallets en estado definitivo (pallet #${b.id}).`,
        );
      }
      if (b.dispatch_id != null && Number(b.dispatch_id) > 0) {
        throw new BadRequestException(
          `El pallet #${b.id} tiene despacho asignado; no se puede repaletizar desde depósito.`,
        );
      }
      if (normFmt(a) !== normFmt(b)) {
        throw new BadRequestException('Todos los pallets deben compartir el mismo formato de presentación.');
      }
      if (normClient(a) !== normClient(b)) {
        throw new BadRequestException('Todos los pallets deben compartir el mismo cliente.');
      }
      if (normSpecies(a) !== normSpecies(b)) {
        throw new BadRequestException('Todos los pallets deben compartir la misma especie.');
      }
      if (normQg(a) !== normQg(b)) {
        throw new BadRequestException('Todos los pallets deben compartir la misma calidad de fruta.');
      }
      if ((a.fruit_quality_mode ?? 'proceso') !== (b.fruit_quality_mode ?? 'proceso')) {
        throw new BadRequestException(
          'Todos los pallets deben compartir la misma calidad operativa (proceso/bulk).',
        );
      }
      if (normStr(a.packing_type) !== normStr(b.packing_type)) {
        throw new BadRequestException('Todos los pallets deben compartir el mismo tipo de packing.');
      }
      if (normStr(a.market) !== normStr(b.market)) {
        throw new BadRequestException('Todos los pallets deben compartir el mismo mercado.');
      }
      if (normBrand(a) !== normBrand(b)) {
        throw new BadRequestException('Todos los pallets deben compartir la misma marca (para cuadrar stock PT).');
      }
    }
  }

  private fifoChunksFromPallet(
    palletId: number,
    sortedLines: FinalPalletLine[],
    boxesToTake: number,
  ): Array<{
    source_pallet_id: number;
    source_line_id: number;
    variety_id: number;
    fruit_process_id: number | null;
    ref_text: string | null;
    caliber: string | null;
    fecha: Date;
    boxes: number;
    poundsTaken: number;
  }> {
    const chunks: Array<{
      source_pallet_id: number;
      source_line_id: number;
      variety_id: number;
      fruit_process_id: number | null;
      ref_text: string | null;
      caliber: string | null;
      fecha: Date;
      boxes: number;
      poundsTaken: number;
    }> = [];
    let remaining = boxesToTake;
    for (const line of sortedLines) {
      if (remaining <= 0) break;
      if (line.amount <= 0) continue;
      const take = Math.min(remaining, line.amount);
      const totalLb = Number(line.pounds);
      const poundsTaken = line.amount > 0 ? (totalLb * take) / line.amount : 0;
      chunks.push({
        source_pallet_id: palletId,
        source_line_id: line.id,
        variety_id: Number(line.variety_id),
        fruit_process_id: line.fruit_process_id != null ? Number(line.fruit_process_id) : null,
        ref_text: line.ref_text ?? null,
        caliber: line.caliber ?? null,
        fecha: line.fecha instanceof Date ? line.fecha : new Date(line.fecha as string),
        boxes: take,
        poundsTaken,
      });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new BadRequestException(`Pallet #${palletId}: no hay suficientes cajas (faltan ${remaining}).`);
    }
    return chunks;
  }

  private buildDestLineSpecsFromChunks(
    chunks: Array<{
      fruit_process_id: number | null;
      variety_id: number;
      ref_text: string | null;
      caliber: string | null;
      fecha: Date;
      boxes: number;
      poundsTaken: number;
    }>,
  ) {
    const map = new Map<
      string,
      {
        fruit_process_id: number | null;
        variety_id: number;
        ref_text: string | null;
        caliber: string | null;
        fecha: Date;
        amount: number;
        pounds: number;
      }
    >();
    for (const c of chunks) {
      const k = this.repalletMergeKey(c.fruit_process_id, c.variety_id, c.ref_text, c.caliber);
      const ex = map.get(k);
      if (!ex) {
        map.set(k, {
          fruit_process_id: c.fruit_process_id,
          variety_id: c.variety_id,
          ref_text: c.ref_text,
          caliber: c.caliber,
          fecha: c.fecha,
          amount: c.boxes,
          pounds: c.poundsTaken,
        });
      } else {
        ex.amount += c.boxes;
        ex.pounds += c.poundsTaken;
        if (c.fecha.getTime() < ex.fecha.getTime()) ex.fecha = c.fecha;
      }
    }
    return [...map.values()].sort((x, y) => x.fecha.getTime() - y.fecha.getTime());
  }

  /**
   * Une o redistribuye cajas de pallets definitivos en depósito hacia un pallet nuevo, con registro de trazabilidad.
   */
  async executeRepallet(dto: RepalletDto) {
    if (!dto.sources?.length) {
      throw new BadRequestException('Indicá al menos un pallet origen con cajas.');
    }
    const merged = this.mergeRepalletSources(dto.sources);
    const palletIds = [...merged.keys()];
    const pallets = await this.palletRepo.find({
      where: { id: In(palletIds) },
      relations: {
        presentation_format: true,
        client: true,
        species: true,
        quality_grade: true,
        brand: true,
      },
    });
    if (pallets.length !== palletIds.length) {
      throw new BadRequestException('Uno o más pallets origen no existen.');
    }
    this.assertRepalletGroupCompatible(pallets);

    const lineRows = await this.lineRepo.find({
      where: { final_pallet_id: In(palletIds) },
      order: { line_order: 'ASC', id: 'ASC' },
    });
    const linesByPallet = new Map<number, FinalPalletLine[]>();
    for (const ln of lineRows) {
      const pid = Number(ln.final_pallet_id);
      const arr = linesByPallet.get(pid) ?? [];
      arr.push(ln);
      linesByPallet.set(pid, arr);
    }

    for (const [pid, need] of merged) {
      const lines = linesByPallet.get(pid) ?? [];
      const avail = lines.reduce((s, l) => s + l.amount, 0);
      if (need > avail) {
        throw new BadRequestException(`Pallet #${pid}: pedís ${need} cajas pero hay ${avail} disponibles.`);
      }
    }

    const allChunks: Array<{
      source_pallet_id: number;
      source_line_id: number;
      variety_id: number;
      fruit_process_id: number | null;
      ref_text: string | null;
      caliber: string | null;
      fecha: Date;
      boxes: number;
      poundsTaken: number;
    }> = [];

    for (const [pid, need] of merged) {
      const lines = linesByPallet.get(pid) ?? [];
      const chunks = this.fifoChunksFromPallet(pid, lines, need);
      allChunks.push(...chunks);
    }

    const destSpecs = this.buildDestLineSpecsFromChunks(allChunks);
    const totalDestBoxes = destSpecs.reduce((s, x) => s + x.amount, 0);
    const totalDestLb = destSpecs.reduce((s, x) => s + x.pounds, 0);
    if (totalDestBoxes <= 0 || totalDestLb <= 0) {
      throw new BadRequestException('El pallet resultante no tiene cajas o libras.');
    }

    const template = [...pallets].sort((a, b) => a.id - b.id)[0];
    const formatId =
      template.presentation_format_id != null && Number(template.presentation_format_id) > 0
        ? Number(template.presentation_format_id)
        : null;
    if (formatId != null) {
      const fmt = await this.formatRepo.findOne({ where: { id: formatId } });
      const maxBoxes = fmt?.max_boxes_per_pallet != null ? Number(fmt.max_boxes_per_pallet) : null;
      if (maxBoxes != null && maxBoxes > 0 && totalDestBoxes > maxBoxes) {
        throw new BadRequestException(
          `El resultado supera el máximo del formato (${maxBoxes} cajas por pallet).`,
        );
      }
    }

    const clamshellResolved = await this.resolveClamshellLabel(formatId, template.clamshell_label);
    const lineRefTexts = await Promise.all(
      destSpecs.map((sp) =>
        this.resolveLineRefText(sp.fruit_process_id ?? undefined, sp.ref_text ?? undefined),
      ),
    );

    const sourcePounds = new Map<number, number>();
    for (const c of allChunks) {
      const pid = c.source_pallet_id;
      sourcePounds.set(pid, (sourcePounds.get(pid) ?? 0) + c.poundsTaken);
    }

    const newId = await this.ds.transaction(async (em) => {
      for (const [pid, need] of merged) {
        let remaining = need;
        const plines = await em.find(FinalPalletLine, {
          where: { final_pallet_id: pid },
          order: { line_order: 'ASC', id: 'ASC' },
        });
        for (const line of plines) {
          if (remaining <= 0) break;
          if (line.amount <= 0) continue;
          const take = Math.min(remaining, line.amount);
          const totalLb = Number(line.pounds);
          const oldAmt = line.amount;
          if (take === line.amount) {
            await em.delete(FinalPalletLine, { id: line.id });
          } else {
            const newAmt = line.amount - take;
            const ratio = newAmt / oldAmt;
            line.amount = newAmt;
            line.pounds = (totalLb * ratio).toFixed(3);
            if (line.net_lb != null && String(line.net_lb).length > 0) {
              line.net_lb = (Number(line.net_lb) * ratio).toFixed(3);
            }
            await em.save(FinalPalletLine, line);
          }
          remaining -= take;
        }
        if (remaining > 0) {
          throw new BadRequestException(
            `Error interno: no se pudieron descontar todas las cajas del pallet #${pid}.`,
          );
        }

        const left = await em.find(FinalPalletLine, { where: { final_pallet_id: pid } });
        const leftBoxes = left.reduce((s, l) => s + l.amount, 0);
        if (leftBoxes === 0) {
          const pal = await em.findOne(FinalPallet, { where: { id: pid } });
          if (pal) {
            pal.status = 'repaletizado';
            await em.save(FinalPallet, pal);
          }
        }
      }

      const pallet = em.create(FinalPallet, {
        status: 'definitivo',
        species_id: template.species_id ?? null,
        quality_grade_id: template.quality_grade_id ?? null,
        corner_board_code: '',
        clamshell_label: clamshellResolved,
        brand_id: template.brand_id ?? null,
        dispatch_unit: template.dispatch_unit ?? '',
        packing_type: template.packing_type ?? '',
        market: template.market ?? '',
        bol: this.normalizeBol(template.bol),
        planned_sales_order_id: template.planned_sales_order_id ?? null,
        client_id: template.client_id ?? null,
        fruit_quality_mode: template.fruit_quality_mode ?? 'proceso',
        presentation_format_id: formatId,
      });
      const saved = await em.save(FinalPallet, pallet);
      saved.corner_board_code = this.cornerCodeFromId(saved.id);
      await em.save(FinalPallet, saved);

      const savedLineByKey = new Map<string, FinalPalletLine>();
      for (let i = 0; i < destSpecs.length; i++) {
        const sp = destSpecs[i];
        const net = sp.pounds.toFixed(3);
        const line = em.create(FinalPalletLine, {
          final_pallet_id: saved.id,
          line_order: i,
          fruit_process_id: sp.fruit_process_id,
          fecha: sp.fecha,
          ref_text: lineRefTexts[i] ?? null,
          variety_id: sp.variety_id,
          caliber: sp.caliber ?? null,
          amount: sp.amount,
          pounds: sp.pounds.toFixed(3),
          net_lb: net,
        });
        const sl = await em.save(FinalPalletLine, line);
        savedLineByKey.set(
          this.repalletMergeKey(sp.fruit_process_id, sp.variety_id, sp.ref_text, sp.caliber),
          sl,
        );
      }

      const rev = em.create(RepalletEvent, {
        result_final_pallet_id: saved.id,
        notes: dto.notes?.trim() || null,
      });
      const ev = await em.save(RepalletEvent, rev);

      for (const [srcId, boxes] of merged) {
        const lb = sourcePounds.get(srcId) ?? 0;
        await em.save(
          RepalletSource,
          em.create(RepalletSource, {
            event_id: Number(ev.id),
            source_final_pallet_id: srcId,
            boxes_removed: boxes,
            pounds_removed: lb.toFixed(3),
          }),
        );
      }

      for (const ch of allChunks) {
        const key = this.repalletMergeKey(ch.fruit_process_id, ch.variety_id, ch.ref_text, ch.caliber);
        const destLine = savedLineByKey.get(key);
        if (!destLine) {
          throw new BadRequestException('Error interno al vincular líneas de repaletizaje.');
        }
        await em.save(
          RepalletLineProvenance,
          em.create(RepalletLineProvenance, {
            event_id: Number(ev.id),
            source_final_pallet_id: ch.source_pallet_id,
            source_line_id: ch.source_line_id,
            dest_final_pallet_line_id: destLine.id,
            boxes: ch.boxes,
            pounds: ch.poundsTaken.toFixed(3),
            variety_id: ch.variety_id,
            fruit_process_id: ch.fruit_process_id,
          }),
        );
      }

      return saved.id;
    });

    for (const pid of merged.keys()) {
      await this.reconcileFinishedPtStockForPallet(pid);
    }
    await this.reconcileFinishedPtStockForPallet(newId);
    return this.getPallet(newId);
  }

  /**
   * Reversa operativa de un repaletizaje: el pallet resultado pasa a `revertido` (sin borrar trazas);
   * los orígenes recuperan cajas según `repallet_line_provenance`.
   */
  async executeRepalletReversal(resultPalletId: number, username: string, dto?: RepalletReverseDto) {
    const uname = (username ?? '').trim() || 'unknown';
    const ev = await this.repalletEventRepo.findOne({
      where: { result_final_pallet_id: resultPalletId },
    });
    if (!ev) {
      throw new BadRequestException(
        'Este pallet no es el resultado de un repaletizaje: no hay evento asociado.',
      );
    }
    if (ev.reversed_at != null) {
      throw new BadRequestException('Este repaletizaje ya fue revertido.');
    }

    const resultPal = await this.palletRepo.findOne({ where: { id: resultPalletId } });
    if (!resultPal) throw new NotFoundException('Pallet no encontrado');

    if (resultPal.dispatch_id != null && Number(resultPal.dispatch_id) > 0) {
      throw new BadRequestException('No se puede revertir: el pallet resultado ya tiene despacho asignado.');
    }

    const blockingOtherRepallet = await this.repalletSourceRepo
      .createQueryBuilder('rs')
      .innerJoin('repallet_events', 'e', 'e.id = rs.event_id')
      .where('rs.source_final_pallet_id = :pid', { pid: resultPalletId })
      .andWhere('rs.event_id != :evid', { evid: ev.id })
      .andWhere('e.reversed_at IS NULL')
      .getCount();
    if (blockingOtherRepallet > 0) {
      throw new BadRequestException(
        'No se puede revertir: este pallet fue usado como origen en otro repaletizaje que sigue activo.',
      );
    }

    const provs = await this.repalletLineProvRepo.find({
      where: { event_id: ev.id },
      relations: { dest_line: true },
    });
    if (provs.length === 0) {
      throw new BadRequestException('No hay líneas de trazabilidad del repaletizaje para revertir.');
    }

    type Agg = {
      fruit_process_id: number | null;
      variety_id: number;
      ref_text: string | null;
      caliber: string | null;
      fecha: Date;
      boxes: number;
      pounds: number;
    };
    const bySource = new Map<number, Map<string, Agg>>();

    for (const pr of provs) {
      const dl = pr.dest_line;
      if (!dl) {
        throw new BadRequestException('Datos de línea destino incompletos para la reversa.');
      }
      const srcId = Number(pr.source_final_pallet_id);
      const fp = dl.fruit_process_id != null ? Number(dl.fruit_process_id) : null;
      const vid = Number(dl.variety_id);
      const k = this.repalletMergeKey(fp, vid, dl.ref_text ?? null, dl.caliber ?? null);
      const pounds = Number(pr.pounds);
      const fecha = dl.fecha instanceof Date ? dl.fecha : new Date(dl.fecha as string);

      let m = bySource.get(srcId);
      if (!m) {
        m = new Map();
        bySource.set(srcId, m);
      }
      const ex = m.get(k);
      if (!ex) {
        m.set(k, {
          fruit_process_id: fp,
          variety_id: vid,
          ref_text: dl.ref_text ?? null,
          caliber: dl.caliber ?? null,
          fecha,
          boxes: pr.boxes,
          pounds,
        });
      } else {
        ex.boxes += pr.boxes;
        ex.pounds += pounds;
        if (fecha.getTime() < ex.fecha.getTime()) ex.fecha = fecha;
      }
    }

    const sourceIds = [...bySource.keys()].sort((a, b) => a - b);

    await this.ds.transaction(async (em) => {
      const evLocked = await em.findOne(RepalletEvent, { where: { id: ev.id } });
      if (!evLocked || evLocked.reversed_at != null) {
        throw new BadRequestException('El evento ya fue revertido o no existe.');
      }

      for (const srcId of sourceIds) {
        const aggs = bySource.get(srcId);
        if (!aggs) continue;

        const lines = await em.find(FinalPalletLine, {
          where: { final_pallet_id: srcId },
          order: { line_order: 'ASC', id: 'ASC' },
        });
        const byKey = new Map<string, FinalPalletLine>();
        for (const l of lines) {
          const kk = this.repalletMergeKey(
            l.fruit_process_id != null ? Number(l.fruit_process_id) : null,
            Number(l.variety_id),
            l.ref_text ?? null,
            l.caliber ?? null,
          );
          byKey.set(kk, l);
        }
        let maxOrder = lines.reduce((m, l) => Math.max(m, l.line_order), -1);

        for (const agg of aggs.values()) {
          const kk = this.repalletMergeKey(agg.fruit_process_id, agg.variety_id, agg.ref_text, agg.caliber);
          const existing = byKey.get(kk);
          if (existing) {
            const oldLb = Number(existing.pounds);
            existing.amount += agg.boxes;
            const newLb = oldLb + agg.pounds;
            existing.pounds = newLb.toFixed(3);
            if (existing.net_lb != null && String(existing.net_lb).length > 0) {
              existing.net_lb = (Number(existing.net_lb) + agg.pounds).toFixed(3);
            } else {
              existing.net_lb = agg.pounds.toFixed(3);
            }
            await em.save(FinalPalletLine, existing);
          } else {
            maxOrder += 1;
            const net = agg.pounds.toFixed(3);
            const nl = em.create(FinalPalletLine, {
              final_pallet_id: srcId,
              line_order: maxOrder,
              fruit_process_id: agg.fruit_process_id,
              fecha: agg.fecha,
              ref_text: agg.ref_text,
              variety_id: agg.variety_id,
              caliber: agg.caliber,
              amount: agg.boxes,
              pounds: net,
              net_lb: net,
            });
            const saved = await em.save(FinalPalletLine, nl);
            byKey.set(kk, saved);
          }
        }

        const pal = await em.findOne(FinalPallet, { where: { id: srcId } });
        if (pal) {
          const left = await em.find(FinalPalletLine, { where: { final_pallet_id: srcId } });
          const sumB = left.reduce((s, l) => s + l.amount, 0);
          if (sumB > 0 && pal.status === 'repaletizado') {
            pal.status = 'definitivo';
            await em.save(FinalPallet, pal);
          }
        }
      }

      const resLines = await em.find(FinalPalletLine, {
        where: { final_pallet_id: resultPalletId },
      });
      for (const ln of resLines) {
        ln.amount = 0;
        ln.pounds = '0.000';
        ln.net_lb = '0.000';
        await em.save(FinalPalletLine, ln);
      }

      const resP = await em.findOne(FinalPallet, { where: { id: resultPalletId } });
      if (resP) {
        resP.status = 'revertido';
        await em.save(FinalPallet, resP);
      }

      evLocked.reversed_at = new Date();
      await em.save(RepalletEvent, evLocked);

      await em.save(
        RepalletReversal,
        em.create(RepalletReversal, {
          repallet_event_id: Number(evLocked.id),
          reversed_by_username: uname,
          notes: dto?.notes?.trim() || null,
        }),
      );
    });

    for (const pid of sourceIds) {
      await this.reconcileFinishedPtStockForPallet(pid);
    }
    await this.reconcileFinishedPtStockForPallet(resultPalletId);
    return this.getPallet(resultPalletId);
  }

  /**
   * Listado para vista “Existencias PT”: pallets finales con totales y BOL/pedido vía despacho.
   */
  async listExistenciasPt(q: ListExistenciasPtQueryDto) {
    const soloDeposito = q.solo_deposito !== false;
    const qb = this.palletRepo
      .createQueryBuilder('fp')
      .leftJoinAndSelect('fp.species', 'sp')
      .leftJoinAndSelect('fp.client', 'cl')
      .leftJoinAndSelect('fp.presentation_format', 'pf');

    if (q.species_id != null && q.species_id > 0) {
      qb.andWhere('fp.species_id = :sid', { sid: q.species_id });
    }
    if (q.presentation_format_id != null && q.presentation_format_id > 0) {
      qb.andWhere('fp.presentation_format_id = :pfid', { pfid: q.presentation_format_id });
    }
    if (q.client_id != null && q.client_id > 0) {
      qb.andWhere('fp.client_id = :cid', { cid: q.client_id });
    }
    if (q.variety_id != null && q.variety_id > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM final_pallet_lines flv WHERE flv.final_pallet_id = fp.id AND flv.variety_id = :vid)`,
        { vid: q.variety_id },
      );
    }

    if (soloDeposito) {
      qb.andWhere(`fp.status = 'definitivo'`).andWhere('fp.dispatch_id IS NULL');
    } else {
      if (q.status) {
        qb.andWhere('fp.status = :st', { st: q.status });
      } else if (q.excluir_anulados !== false) {
        qb.andWhere(`fp.status != 'anulado'`);
      }
    }

    const pallets = await qb.orderBy('fp.id', 'DESC').take(500).getMany();

    const palletIds = pallets.map((p) => p.id);
    const lineRows =
      palletIds.length > 0
        ? await this.lineRepo.find({
            where: { final_pallet_id: In(palletIds) },
            relations: { variety: true },
            order: { line_order: 'ASC', id: 'ASC' },
          })
        : [];
    const linesByPallet = new Map<number, FinalPalletLine[]>();
    for (const ln of lineRows) {
      const pid = Number(ln.final_pallet_id);
      const arr = linesByPallet.get(pid) ?? [];
      arr.push(ln);
      linesByPallet.set(pid, arr);
    }

    const dispatchIds = [
      ...new Set(
        pallets.map((p) => p.dispatch_id).filter((id): id is number => id != null && Number(id) > 0),
      ),
    ].map(Number);
    const dispatches =
      dispatchIds.length > 0 ? await this.dispatchRepo.findBy({ id: In(dispatchIds) }) : [];
    const dispById = new Map(dispatches.map((d) => [Number(d.id), d]));
    const ordenIds = [...new Set(dispatches.map((d) => Number(d.orden_id)))];
    const orders =
      ordenIds.length > 0 ? await this.salesOrderRepo.findBy({ id: In(ordenIds) }) : [];
    const orderById = new Map(orders.map((o) => [Number(o.id), o]));

    const plannedSoIds = [
      ...new Set(
        pallets
          .map((x) => x.planned_sales_order_id)
          .filter((id): id is number => id != null && Number(id) > 0)
          .map((id) => Number(id)),
      ),
    ];
    const plannedOrderRows =
      plannedSoIds.length > 0 ? await this.salesOrderRepo.findBy({ id: In(plannedSoIds) }) : [];
    const plannedOrderNumberById = new Map(plannedOrderRows.map((o) => [Number(o.id), o.order_number]));

    const repalletResultIds = new Set<number>();
    if (palletIds.length > 0) {
      const revRows = await this.repalletEventRepo
        .createQueryBuilder('re')
        .select('re.result_final_pallet_id', 'pid')
        .where('re.result_final_pallet_id IN (:...ids)', { ids: palletIds })
        .andWhere('re.reversed_at IS NULL')
        .getRawMany();
      for (const row of revRows) {
        repalletResultIds.add(Number((row as { pid: string }).pid));
      }
    }

    const palletById = new Map<number, FinalPallet>(pallets.map((x) => [Number(x.id), x]));
    const traceByPalletId = await this.resolveUnidadPtTraceabilityByPallet(linesByPallet, palletById);

    return pallets.map((p) => {
      const plines = linesByPallet.get(Number(p.id)) ?? [];
      const varietyNames = [
        ...new Set(
          plines.map((l) =>
            l.variety?.nombre ? String(l.variety.nombre).trim() : `Var. ${l.variety_id}`,
          ),
        ),
      ];
      const boxes = plines.reduce((s, l) => s + l.amount, 0);
      const pounds = plines.reduce((s, l) => s + Number(l.pounds), 0);
      const did = p.dispatch_id != null ? Number(p.dispatch_id) : null;
      const disp = did ? dispById.get(did) : undefined;
      const so = disp ? orderById.get(Number(disp.orden_id)) : undefined;

      const repalletRol: 'no' | 'resultado' | 'origen' = repalletResultIds.has(Number(p.id))
        ? 'resultado'
        : p.status === 'repaletizado'
          ? 'origen'
          : 'no';

      const trace = traceByPalletId.get(Number(p.id)) ?? null;
      const mensajeTraz =
        trace != null ? this.buildMensajeTrazabilidad(trace, { repalletizaje: repalletRol }) : null;

      return {
        id: p.id,
        corner_board_code: p.corner_board_code,
        /** Primera TAR si hay varias (compat API). */
        tag_code: trace?.unidad_pt_codigos?.[0] ?? null,
        unidad_pt_codigos: trace?.unidad_pt_codigos ?? [],
        tarja_ids: trace?.tarja_ids ?? [],
        trazabilidad_pt: trace?.trazabilidad_pt ?? 'sin_trazabilidad',
        codigo_unidad_pt_display:
          trace?.codigo_unidad_pt_display ??
          (p.corner_board_code?.trim() && p.corner_board_code.trim().length > 0
            ? p.corner_board_code.trim()
            : this.cornerCodeFromId(Number(p.id))),
        codigo_logistico:
          trace?.codigo_logistico ??
          (p.corner_board_code?.trim() && p.corner_board_code.trim().length > 0
            ? p.corner_board_code.trim()
            : this.cornerCodeFromId(Number(p.id))),
        mensaje_trazabilidad: mensajeTraz,
        /** Para cierres: resultado = stock nuevo post-repallet; origen = consumido (no duplicar lb/cajas). */
        repalletizaje: repalletRol,
        species_id: p.species_id != null ? Number(p.species_id) : null,
        species_nombre: p.species?.nombre ?? null,
        variedades_label: varietyNames.length ? varietyNames.join(' · ') : '—',
        presentation_format_id: p.presentation_format_id != null ? Number(p.presentation_format_id) : null,
        format_code: p.presentation_format?.format_code ?? null,
        client_id: p.client_id != null ? Number(p.client_id) : null,
        client_nombre: p.client?.nombre ?? null,
        boxes,
        pounds,
        status: p.status,
        bol: p.bol ?? null,
        planned_sales_order_id: p.planned_sales_order_id != null ? Number(p.planned_sales_order_id) : null,
        planned_order_number:
          p.planned_sales_order_id != null
            ? plannedOrderNumberById.get(Number(p.planned_sales_order_id)) ?? null
            : null,
        dispatch_id: did,
        dispatch_bol: disp?.numero_bol ?? null,
        /** Pedido vinculado al despacho (cuando el pallet ya salió). */
        sales_order_number: so?.order_number ?? null,
      };
    })
      /** Inventario PT: no listar pallets sin cajas o sin lb (datos incompletos). */
      .filter((r) => r.boxes > 0 && Number.isFinite(r.pounds) && r.pounds > 0);
  }
}
