import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { DocumentState, Mercado, ReceptionType } from '../traceability/catalog.entities';
import { CreateReceptionDto, CreateReceptionLineDto } from '../traceability/traceability.dto';
import { TraceabilityService } from '../traceability/traceability.service';
import { ProcessService } from '../process/process.service';
import { CreateFruitProcessDto, CreatePtTagDto } from '../process/process.dto';
import {
  FruitProcess,
  FruitProcessLineAllocation,
  ProcessResult,
  PtTag,
  PtTagItem,
  PtTagMerge,
  PtTagMergeSource,
  RawMaterialMovement,
} from '../process/process.entities';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
  SalesOrder,
  SalesOrderLine,
  SalesOrderModification,
} from '../dispatch/dispatch.entities';
import { DispatchBillingService } from '../dispatch/dispatch-billing.service';
import {
  CreateSalesOrderDto,
  HistoricalDispatchImportInput,
  SalesOrderLineInputDto,
} from '../dispatch/dispatch.dto';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { RepalletLineProvenance } from '../final-pallet/repallet.entities';
import {
  PresentationFormat,
  ProcessMachine,
  Producer,
  QualityGrade,
  Reception,
  ReceptionLine,
  Species,
  Variety,
} from '../traceability/traceability.entities';
import { Brand, Client, ReturnableContainer } from '../traceability/operational.entities';
import { ImportLog } from './import-log.entity';
import { escapeCsvCell, extractCsvRecords } from './import-csv.util';
import { ImportTemplateService, type ImportEntityKey } from './import-template.service';

export type ImportRowError = { row: number; field?: string; message: string };

export type ImportSummary = {
  total: number;
  inserted: number;
  /** Solo import «pt-tags»: filas con `import_action=borrar`. */
  deleted?: number;
  skipped: number;
  errors: ImportRowError[];
};

const ENTITY_KEYS = new Set<string>([
  'receptions',
  'processes',
  'pt-tags',
  'final-pallets',
  'sales-orders',
  'dispatches',
]);

@Injectable()
export class ImportService {
  constructor(
    private readonly traceability: TraceabilityService,
    private readonly process: ProcessService,
    private readonly dispatchBilling: DispatchBillingService,
    private readonly templateService: ImportTemplateService,
    @InjectRepository(ImportLog) private readonly importLogRepo: Repository<ImportLog>,
    @InjectRepository(DocumentState) private readonly documentStateRepo: Repository<DocumentState>,
    @InjectRepository(ReceptionType) private readonly receptionTypeRepo: Repository<ReceptionType>,
    @InjectRepository(Mercado) private readonly mercadoRepo: Repository<Mercado>,
    @InjectRepository(SalesOrder) private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly salesOrderLineRepo: Repository<SalesOrderLine>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(DispatchTagItem) private readonly dispatchTagItemRepo: Repository<DispatchTagItem>,
    @InjectRepository(DispatchPtPackingList) private readonly dispatchPlRepo: Repository<DispatchPtPackingList>,
    @InjectRepository(PackingList) private readonly packingListRepo: Repository<PackingList>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(SalesOrderModification) private readonly salesOrderModRepo: Repository<SalesOrderModification>,
    @InjectRepository(Reception) private readonly receptionRepo: Repository<Reception>,
    @InjectRepository(ReceptionLine) private readonly receptionLineRepo: Repository<ReceptionLine>,
    @InjectRepository(ProcessMachine) private readonly processMachineRepo: Repository<ProcessMachine>,
    @InjectRepository(Producer) private readonly producerRepo: Repository<Producer>,
    @InjectRepository(Species) private readonly speciesRepo: Repository<Species>,
    @InjectRepository(Variety) private readonly varietyRepo: Repository<Variety>,
    @InjectRepository(QualityGrade) private readonly qualityGradeRepo: Repository<QualityGrade>,
    @InjectRepository(ReturnableContainer) private readonly returnableContainerRepo: Repository<ReturnableContainer>,
    @InjectRepository(PresentationFormat) private readonly presentationFormatRepo: Repository<PresentationFormat>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(FinalPallet) private readonly finalPalletRepo: Repository<FinalPallet>,
    @InjectRepository(FinalPalletLine) private readonly finalPalletLineRepo: Repository<FinalPalletLine>,
    @InjectRepository(RepalletLineProvenance) private readonly repalletLineProvRepo: Repository<RepalletLineProvenance>,
    @InjectRepository(FruitProcess) private readonly fruitProcessRepo: Repository<FruitProcess>,
    @InjectRepository(PtTag) private readonly ptTagRepo: Repository<PtTag>,
    @InjectRepository(PtTagItem) private readonly ptTagItemRepo: Repository<PtTagItem>,
    @InjectRepository(PtTagMerge) private readonly ptTagMergeRepo: Repository<PtTagMerge>,
    @InjectRepository(PtTagMergeSource) private readonly ptTagMergeSourceRepo: Repository<PtTagMergeSource>,
    @InjectRepository(RawMaterialMovement) private readonly rawMaterialMovementRepo: Repository<RawMaterialMovement>,
  ) {}

  isEntityKey(s: string): s is ImportEntityKey {
    return ENTITY_KEYS.has(s);
  }

  async listRecentLogs(limit = 20): Promise<ImportLog[]> {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    return this.importLogRepo.find({
      order: { created_at: 'DESC', id: 'DESC' },
      take: safeLimit,
    });
  }

  async getEntityCounts(): Promise<{
    receptions: number;
    processes: number;
    pt_tags: number;
    final_pallets: number;
    sales_orders: number;
    dispatches: number;
  }> {
    const [receptions, processes, ptTags, finalPallets, salesOrders, dispatches] = await Promise.all([
      this.receptionRepo.count(),
      this.fruitProcessRepo.count(),
      this.ptTagRepo.count(),
      this.finalPalletRepo.count(),
      this.salesOrderRepo.count(),
      this.dispatchRepo.count(),
    ]);
    return {
      receptions,
      processes,
      pt_tags: ptTags,
      final_pallets: finalPallets,
      sales_orders: salesOrders,
      dispatches,
    };
  }

  /**
   * Lista recepciones recientes (para armar `reception_ids` antes de borrar selectivo).
   * Solo metadatos; no modifica datos.
   */
  async listRecentReceptionsPreview(limit = 150): Promise<
    Array<{
      id: number;
      reference_code: string | null;
      created_at: Date;
      document_state_codigo: string | null;
      line_count: number;
    }>
  > {
    const safe = Math.min(500, Math.max(1, Number(limit) || 150));
    const recs = await this.receptionRepo.find({
      order: { id: 'DESC' },
      take: safe,
      relations: ['document_state', 'lines'],
    });
    return recs.map((r) => ({
      id: r.id,
      reference_code: r.reference_code,
      created_at: r.created_at,
      document_state_codigo: r.document_state?.codigo ?? null,
      line_count: r.lines?.length ?? 0,
    }));
  }

  /**
   * Lista pedidos recientes (metadatos + cantidad de despachos) para borrado selectivo vía import masivo.
   */
  async listRecentSalesOrdersPreview(limit = 150): Promise<
    Array<{
      id: number;
      order_number: string;
      cliente_id: number;
      line_count: number;
      dispatch_count: number;
      estado_comercial: string | null;
      fecha_pedido: Date | null;
    }>
  > {
    const safe = Math.min(500, Math.max(1, Number(limit) || 150));
    const orders = await this.salesOrderRepo.find({
      order: { id: 'DESC' },
      take: safe,
      relations: ['lines'],
    });
    if (!orders.length) return [];
    const ids = orders.map((o) => Number(o.id));
    const raw = await this.dispatchRepo
      .createQueryBuilder('d')
      .select('d.orden_id', 'orden_id')
      .addSelect('COUNT(d.id)', 'cnt')
      .where('d.orden_id IN (:...ids)', { ids })
      .groupBy('d.orden_id')
      .getRawMany();
    const dispatchByOrder = new Map<number, number>();
    for (const row of raw) {
      const oid = Number((row as { orden_id: string | number }).orden_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(oid)) dispatchByOrder.set(oid, Number.isFinite(c) ? c : 0);
    }
    return orders.map((o) => {
      const id = Number(o.id);
      return {
        id,
        order_number: o.order_number,
        cliente_id: Number(o.cliente_id),
        line_count: o.lines?.length ?? 0,
        dispatch_count: dispatchByOrder.get(id) ?? 0,
        estado_comercial: o.estado_comercial ?? null,
        fecha_pedido: o.fecha_pedido ?? null,
      };
    });
  }

  /**
   * Lista unidades PT recientes para borrado selectivo (Carga masiva).
   * `can_delete` resume si aplica `purgePtTagById` (sin despacho, factura ni merge).
   */
  async listRecentPtTagsPreview(limit = 150): Promise<
    Array<{
      id: number;
      tag_code: string;
      fecha: Date;
      format_code: string;
      total_cajas: number;
      total_pallets: number;
      dispatch_count: number;
      invoice_line_count: number;
      merge_involved: boolean;
      client_nombre: string | null;
      can_delete: boolean;
    }>
  > {
    const safe = Math.min(500, Math.max(1, Number(limit) || 150));
    const tags = await this.ptTagRepo.find({
      order: { id: 'DESC' },
      take: safe,
      relations: ['client'],
    });
    if (!tags.length) return [];
    const ids = tags.map((t) => Number(t.id));

    const dRaw = await this.dispatchTagItemRepo
      .createQueryBuilder('dti')
      .select('dti.tarja_id', 'tarja_id')
      .addSelect('COUNT(dti.id)', 'cnt')
      .where('dti.tarja_id IN (:...ids)', { ids })
      .groupBy('dti.tarja_id')
      .getRawMany();
    const dispatchByTag = new Map<number, number>();
    for (const row of dRaw) {
      const tid = Number((row as { tarja_id: string | number }).tarja_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(tid)) dispatchByTag.set(tid, Number.isFinite(c) ? c : 0);
    }

    const invRaw = await this.invoiceItemRepo
      .createQueryBuilder('ii')
      .select('ii.tarja_id', 'tarja_id')
      .addSelect('COUNT(ii.id)', 'cnt')
      .where('ii.tarja_id IN (:...ids)', { ids })
      .groupBy('ii.tarja_id')
      .getRawMany();
    const invoiceByTag = new Map<number, number>();
    for (const row of invRaw) {
      const tid = Number((row as { tarja_id: string | number }).tarja_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(tid)) invoiceByTag.set(tid, Number.isFinite(c) ? c : 0);
    }

    const mergeResult = await this.ptTagMergeRepo.find({
      where: { result_tarja_id: In(ids) },
      select: ['result_tarja_id'],
    });
    const mergeSource = await this.ptTagMergeSourceRepo.find({
      where: { source_tarja_id: In(ids) },
      select: ['source_tarja_id'],
    });
    const mergeIds = new Set<number>();
    for (const m of mergeResult) mergeIds.add(Number(m.result_tarja_id));
    for (const s of mergeSource) mergeIds.add(Number(s.source_tarja_id));

    return tags.map((t) => {
      const id = Number(t.id);
      const dispatch_count = dispatchByTag.get(id) ?? 0;
      const invoice_line_count = invoiceByTag.get(id) ?? 0;
      const merge_involved = mergeIds.has(id);
      const can_delete = dispatch_count === 0 && invoice_line_count === 0 && !merge_involved;
      return {
        id,
        tag_code: t.tag_code,
        fecha: t.fecha,
        format_code: t.format_code,
        total_cajas: t.total_cajas,
        total_pallets: t.total_pallets,
        dispatch_count,
        invoice_line_count,
        merge_involved,
        client_nombre: t.client?.nombre ?? null,
        can_delete,
      };
    });
  }

  /** Borra unidades PT por id (mismas reglas que `ProcessService.purgePtTagById`). */
  async purgePtTagsByIds(tarjaIds: number[]): Promise<{ deleted_pt_tags: number }> {
    const uniq = [...new Set(tarjaIds.map((n) => Number(n)))].filter((n) => Number.isInteger(n) && n > 0);
    if (!uniq.length) {
      throw new BadRequestException('tarja_ids vacío o inválido');
    }
    if (uniq.length > 2000) {
      throw new BadRequestException('Máximo 2000 ids por solicitud');
    }

    const existing = await this.ptTagRepo.find({ where: { id: In(uniq) } });
    if (existing.length !== uniq.length) {
      const found = new Set(existing.map((t) => Number(t.id)));
      const missing = uniq.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Unidades PT no encontradas: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`,
      );
    }

    let deleted = 0;
    for (const id of uniq) {
      await this.process.purgePtTagById(id);
      deleted++;
    }
    return { deleted_pt_tags: deleted };
  }

  /**
   * Borra pedidos por id solo si **no** tienen despacho (`dispatches.orden_id`).
   * Quita `planned_sales_order_id` en pallets finales e historial de modificaciones del pedido.
   */
  async purgeSalesOrdersByIds(salesOrderIds: number[]): Promise<{
    deleted_sales_orders: number;
    deleted_lines: number;
    cleared_planned_pallets: number;
    deleted_modifications: number;
  }> {
    const uniq = [...new Set(salesOrderIds.map((n) => Number(n)))].filter((n) => Number.isInteger(n) && n > 0);
    if (!uniq.length) {
      throw new BadRequestException('sales_order_ids vacío o inválido');
    }
    if (uniq.length > 2000) {
      throw new BadRequestException('Máximo 2000 ids por solicitud');
    }

    return this.salesOrderRepo.manager.transaction(async (em) => {
      const orders = await em.find(SalesOrder, {
        where: { id: In(uniq) },
        relations: ['lines'],
      });
      if (orders.length !== uniq.length) {
        const found = new Set(orders.map((o) => Number(o.id)));
        const missing = uniq.filter((id) => !found.has(id));
        throw new BadRequestException(
          `Pedidos no encontrados: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`,
        );
      }

      const dispatchCount = await em.count(Dispatch, { where: { orden_id: In(uniq) } });
      if (dispatchCount > 0) {
        throw new BadRequestException(
          `Hay ${dispatchCount} despacho(s) vinculado(s) a pedidos de este conjunto; no se borra. Eliminá primero esos despachos o usá la limpieza total pedidos+despachos si corresponde.`,
        );
      }

      const linesBefore = orders.reduce((s, o) => s + (o.lines?.length ?? 0), 0);

      const modDel = await em.delete(SalesOrderModification, { order_id: In(uniq) });
      const deleted_modifications = Number(modDel.affected ?? 0);

      const fpUp = await em
        .getRepository(FinalPallet)
        .createQueryBuilder()
        .update(FinalPallet)
        .set({ planned_sales_order_id: null })
        .where('planned_sales_order_id IN (:...ids)', { ids: uniq })
        .execute();
      const cleared_planned_pallets = Number(fpUp.affected ?? 0);

      let deleted_sales_orders = 0;
      try {
        const del = await em.createQueryBuilder().delete().from(SalesOrder).where('id IN (:...ids)', { ids: uniq }).execute();
        deleted_sales_orders = Number(del.affected ?? 0);
      } catch (e) {
        if (e instanceof QueryFailedError) {
          throw new BadRequestException(
            `La base de datos rechazó el borrado (${e.message}). Puede haber otras tablas que referencian estos pedidos.`,
          );
        }
        throw e;
      }

      return {
        deleted_sales_orders,
        deleted_lines: linesBefore,
        cleared_planned_pallets,
        deleted_modifications,
      };
    });
  }

  /**
   * Borra solo las recepciones indicadas si están en **borrador** y sin procesos ni asignaciones
   * que referencien sus líneas o la recepción.
   */
  async purgeReceptionsByIds(receptionIds: number[]): Promise<{
    deleted_receptions: number;
    deleted_lines: number;
    deleted_movements: number;
  }> {
    const uniq = [...new Set(receptionIds.map((n) => Number(n)))].filter((n) => Number.isInteger(n) && n > 0);
    if (!uniq.length) {
      throw new BadRequestException('reception_ids vacío o inválido');
    }
    if (uniq.length > 2000) {
      throw new BadRequestException('Máximo 2000 ids por solicitud');
    }

    return this.receptionRepo.manager.transaction(async (em) => {
      const recs = await em.find(Reception, {
        where: { id: In(uniq) },
        relations: ['document_state', 'lines'],
      });
      if (recs.length !== uniq.length) {
        const found = new Set(recs.map((r) => r.id));
        const missing = uniq.filter((id) => !found.has(id));
        throw new BadRequestException(
          `Recepciones no encontradas: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`,
        );
      }

      for (const r of recs) {
        const codigo = r.document_state?.codigo?.trim().toLowerCase() ?? '';
        if (codigo !== 'borrador') {
          throw new BadRequestException(
            `Recepción ${r.id} no está en borrador (estado «${r.document_state?.codigo ?? '?'}»); no se borra`,
          );
        }
      }

      const allLineIds = (recs.flatMap((r) => r.lines ?? []).map((ln) => ln.id) as number[]).filter(Boolean);

      const procByReception = await em.count(FruitProcess, { where: { recepcion_id: In(uniq) } });
      if (procByReception > 0) {
        throw new BadRequestException(
          `Hay ${procByReception} proceso(s) con recepción en este conjunto; eliminá o desvinculá procesos antes de borrar`,
        );
      }

      if (allLineIds.length) {
        const procByLine = await em.count(FruitProcess, { where: { reception_line_id: In(allLineIds) } });
        if (procByLine > 0) {
          throw new BadRequestException(
            `Hay ${procByLine} proceso(s) vinculado(s) a líneas de estas recepciones; no se borra`,
          );
        }
        const fpla = await em.count(FruitProcessLineAllocation, { where: { reception_line_id: In(allLineIds) } });
        if (fpla > 0) {
          throw new BadRequestException(
            `Hay ${fpla} asignación(es) proceso–línea en estas recepciones; no se borra`,
          );
        }
      }

      let deleted_movements = 0;
      if (allLineIds.length) {
        const mov = await em
          .createQueryBuilder()
          .delete()
          .from(RawMaterialMovement)
          .where('reception_line_id IN (:...ids)', { ids: allLineIds })
          .execute();
        deleted_movements = Number(mov.affected ?? 0);
      }

      const linesBefore = allLineIds.length;
      let deleted_receptions = 0;
      try {
        const del = await em.createQueryBuilder().delete().from(Reception).where('id IN (:...ids)', { ids: uniq }).execute();
        deleted_receptions = Number(del.affected ?? 0);
      } catch (e) {
        if (e instanceof QueryFailedError) {
          throw new BadRequestException(
            `La base de datos rechazó el borrado (${e.message}). Suele haber procesos u otras tablas que aún referencian estas recepciones.`,
          );
        }
        throw e;
      }

      return {
        deleted_receptions,
        deleted_lines: linesBefore,
        deleted_movements,
      };
    });
  }

  /**
   * Lista procesos recientes para borrado selectivo (Carga masiva).
   * `can_delete`: borrador, balance abierto, sin ítems PT, sin líneas de pallet final, factura ni repalet con ese proceso.
   */
  async listRecentProcessesPreview(limit = 150): Promise<
    Array<{
      id: number;
      fecha_proceso: Date;
      recepcion_id: number;
      process_status: string;
      balance_closed: boolean;
      peso_procesado_lb: string;
      pt_tag_item_count: number;
      final_pallet_line_count: number;
      invoice_item_count: number;
      repallet_prov_count: number;
      can_delete: boolean;
    }>
  > {
    const safe = Math.min(500, Math.max(1, Number(limit) || 150));
    const procs = await this.fruitProcessRepo.find({
      order: { id: 'DESC' },
      take: safe,
    });
    if (!procs.length) return [];
    const ids = procs.map((p) => Number(p.id));

    const ptiRaw = await this.ptTagItemRepo
      .createQueryBuilder('pti')
      .select('pti.process_id', 'process_id')
      .addSelect('COUNT(pti.id)', 'cnt')
      .where('pti.process_id IN (:...ids)', { ids })
      .groupBy('pti.process_id')
      .getRawMany();
    const ptiByProc = new Map<number, number>();
    for (const row of ptiRaw) {
      const pid = Number((row as { process_id: string | number }).process_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(pid)) ptiByProc.set(pid, Number.isFinite(c) ? c : 0);
    }

    const fplRaw = await this.finalPalletLineRepo
      .createQueryBuilder('fpl')
      .select('fpl.fruit_process_id', 'fruit_process_id')
      .addSelect('COUNT(fpl.id)', 'cnt')
      .where('fpl.fruit_process_id IN (:...ids)', { ids })
      .groupBy('fpl.fruit_process_id')
      .getRawMany();
    const fplByProc = new Map<number, number>();
    for (const row of fplRaw) {
      const pid = Number((row as { fruit_process_id: string | number }).fruit_process_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(pid)) fplByProc.set(pid, Number.isFinite(c) ? c : 0);
    }

    const invRaw = await this.invoiceItemRepo
      .createQueryBuilder('ii')
      .select('ii.fruit_process_id', 'fruit_process_id')
      .addSelect('COUNT(ii.id)', 'cnt')
      .where('ii.fruit_process_id IN (:...ids)', { ids })
      .groupBy('ii.fruit_process_id')
      .getRawMany();
    const invByProc = new Map<number, number>();
    for (const row of invRaw) {
      const pid = Number((row as { fruit_process_id: string | number }).fruit_process_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(pid)) invByProc.set(pid, Number.isFinite(c) ? c : 0);
    }

    const repRaw = await this.repalletLineProvRepo
      .createQueryBuilder('rlp')
      .select('rlp.fruit_process_id', 'fruit_process_id')
      .addSelect('COUNT(rlp.id)', 'cnt')
      .where('rlp.fruit_process_id IN (:...ids)', { ids })
      .groupBy('rlp.fruit_process_id')
      .getRawMany();
    const repByProc = new Map<number, number>();
    for (const row of repRaw) {
      const pid = Number((row as { fruit_process_id: string | number }).fruit_process_id);
      const c = Number((row as { cnt: string | number }).cnt);
      if (Number.isFinite(pid)) repByProc.set(pid, Number.isFinite(c) ? c : 0);
    }

    return procs.map((p) => {
      const id = Number(p.id);
      const pt_tag_item_count = ptiByProc.get(id) ?? 0;
      const final_pallet_line_count = fplByProc.get(id) ?? 0;
      const invoice_item_count = invByProc.get(id) ?? 0;
      const repallet_prov_count = repByProc.get(id) ?? 0;
      const isBorrador = (p.process_status ?? '').trim().toLowerCase() === 'borrador';
      const can_delete =
        isBorrador &&
        !p.balance_closed &&
        pt_tag_item_count === 0 &&
        final_pallet_line_count === 0 &&
        invoice_item_count === 0 &&
        repallet_prov_count === 0;
      return {
        id,
        fecha_proceso: p.fecha_proceso,
        recepcion_id: Number(p.recepcion_id),
        process_status: p.process_status,
        balance_closed: Boolean(p.balance_closed),
        peso_procesado_lb: p.peso_procesado_lb,
        pt_tag_item_count,
        final_pallet_line_count,
        invoice_item_count,
        repallet_prov_count,
        can_delete,
      };
    });
  }

  /**
   * Borra procesos por id: solo **borrador**, balance abierto, sin vínculos a PT / pallet final / factura / repalet.
   * Elimina movimientos de MP (`raw_material_movements`) y el proceso (allocations y component_values en cascada).
   */
  async purgeProcessesByIds(processIds: number[]): Promise<{
    deleted_processes: number;
    deleted_raw_movements: number;
  }> {
    const uniq = [...new Set(processIds.map((n) => Number(n)))].filter((n) => Number.isInteger(n) && n > 0);
    if (!uniq.length) {
      throw new BadRequestException('process_ids vacío o inválido');
    }
    if (uniq.length > 2000) {
      throw new BadRequestException('Máximo 2000 ids por solicitud');
    }

    return this.fruitProcessRepo.manager.transaction(async (em) => {
      const procs = await em.find(FruitProcess, { where: { id: In(uniq) } });
      if (procs.length !== uniq.length) {
        const found = new Set(procs.map((p) => Number(p.id)));
        const missing = uniq.filter((id) => !found.has(id));
        throw new BadRequestException(
          `Procesos no encontrados: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`,
        );
      }

      for (const p of procs) {
        const st = (p.process_status ?? '').trim().toLowerCase();
        if (st !== 'borrador') {
          throw new BadRequestException(
            `Proceso ${p.id} no está en borrador (estado «${p.process_status}»); no se borra`,
          );
        }
        if (p.balance_closed) {
          throw new BadRequestException(`Proceso ${p.id} tiene balance cerrado; no se borra`);
        }
      }

      const pti = await em.count(PtTagItem, { where: { process_id: In(uniq) } });
      if (pti > 0) {
        throw new BadRequestException(
          `Hay ${pti} vínculo(s) tarja–proceso (pt_tag_items); quitá la tarja o desvinculá el proceso antes de borrar`,
        );
      }

      const fpl = await em.count(FinalPalletLine, { where: { fruit_process_id: In(uniq) } });
      if (fpl > 0) {
        throw new BadRequestException(
          `Hay ${fpl} línea(s) de pallet final con este proceso; no se borra (corregí existencias PT primero)`,
        );
      }

      const inv = await em.count(InvoiceItem, { where: { fruit_process_id: In(uniq) } });
      if (inv > 0) {
        throw new BadRequestException(`Hay ${inv} línea(s) de factura con este proceso; no se borra`);
      }

      const rep = await em.count(RepalletLineProvenance, { where: { fruit_process_id: In(uniq) } });
      if (rep > 0) {
        throw new BadRequestException(`Hay ${rep} registro(s) de repalet con este proceso; no se borra`);
      }

      const mov = await em
        .createQueryBuilder()
        .delete()
        .from(RawMaterialMovement)
        .where('fruit_process_id IN (:...ids)', { ids: uniq })
        .execute();
      const deleted_raw_movements = Number(mov.affected ?? 0);

      const del = await em.createQueryBuilder().delete().from(FruitProcess).where('id IN (:...ids)', { ids: uniq }).execute();
      const deleted_processes = Number(del.affected ?? 0);

      return { deleted_processes, deleted_raw_movements };
    });
  }

  async purgeAllReceptions(): Promise<{
    raw_material_movements: number;
    pt_tag_items: number;
    fruit_processes: number;
    reception_lines: number;
    receptions: number;
  }> {
    return this.receptionRepo.manager.transaction(async (em) => {
      const linesBefore = await em.count(ReceptionLine);
      const recsBefore = await em.count(Reception);

      const mov = await em
        .createQueryBuilder()
        .delete()
        .from(RawMaterialMovement)
        .where('reception_line_id IS NOT NULL OR fruit_process_id IS NOT NULL')
        .execute();

      await em.query(`UPDATE final_pallet_lines SET fruit_process_id = NULL WHERE fruit_process_id IS NOT NULL`);
      await em.query(`UPDATE invoice_items SET fruit_process_id = NULL WHERE fruit_process_id IS NOT NULL`);
      await em.query(
        `UPDATE repallet_line_provenance SET fruit_process_id = NULL WHERE fruit_process_id IS NOT NULL`,
      );

      const pti = await em
        .createQueryBuilder()
        .delete()
        .from(PtTagItem)
        .where('process_id IN (SELECT id FROM fruit_processes)')
        .execute();

      await em.query(`UPDATE fruit_processes SET tarja_id = NULL, reception_line_id = NULL`);

      const proc = await em.createQueryBuilder().delete().from(FruitProcess).execute();

      const recs = await em.createQueryBuilder().delete().from(Reception).execute();

      return {
        raw_material_movements: Number(mov.affected ?? 0),
        pt_tag_items: Number(pti.affected ?? 0),
        fruit_processes: Number(proc.affected ?? 0),
        reception_lines: linesBefore,
        receptions: Number(recs.affected ?? recsBefore),
      };
    });
  }

  async buildExportCsv(entityKey: ImportEntityKey): Promise<{ filename: string; body: string }> {
    const headers = this.templateService.getImportHeaders(entityKey);
    const delim: ',' | ';' = ',';
    const rows = await this.exportRows(entityKey, headers);
    const body = [headers, ...rows]
      .map((r) => r.map((c) => escapeCsvCell(String(c ?? ''), delim)).join(delim))
      .join('\n')
      .concat('\n');
    return { filename: `export-${entityKey}.csv`, body };
  }

  async runImport(
    entityKey: ImportEntityKey,
    fileBuffer: Buffer,
    username: string,
  ): Promise<ImportSummary> {
    const text = fileBuffer.toString('utf8');
    const { rows } = extractCsvRecords(text);
    const errors: ImportRowError[] = [];
    let inserted = 0;
    let deleted = 0;
    let skipped = 0;
    let processCreateOrdinal = 0;

    if (entityKey === 'receptions') {
      return this.runReceptionImport(rows, username, entityKey);
    }
    if (entityKey === 'sales-orders') {
      return this.runSalesOrderImport(rows, username, entityKey);
    }
    if (entityKey === 'dispatches') {
      return this.runDispatchImport(rows, username, entityKey);
    }

    for (const { lineNumber, record } of rows) {
      if (isBlankRecord(record)) {
        skipped++;
        continue;
      }

      try {
        switch (entityKey) {
          case 'processes':
            if (this.isProcessDeleteImportRow(record)) {
              await this.purgeProcessFromImportRow(record);
              deleted++;
            } else {
              processCreateOrdinal += 1;
              await this.importProcessRow(record, processCreateOrdinal);
              inserted++;
            }
            break;
          case 'pt-tags':
            if (await this.importPtTagRow(record)) deleted++;
            else inserted++;
            break;
          case 'final-pallets':
            await this.importFinalPalletRow(record);
            inserted++;
            break;
          default:
            throw new BadRequestException('Entidad no soportada');
        }
      } catch (e) {
        errors.push({ row: lineNumber, message: extractErrorMessage(e), field: extractFieldHint(e) });
      }
    }

    const total = rows.length;
    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: entityKey,
        total_rows: total,
        inserted,
        skipped,
        errors_count: errors.length,
        errors_sample: errors.slice(0, 80),
      }),
    );

    return { total, inserted, deleted, skipped, errors };
  }

  private async runReceptionImport(
    rows: Array<{ lineNumber: number; record: Record<string, string> }>,
    username: string,
    entityKey: ImportEntityKey,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    let inserted = 0;
    let skipped = 0;

    const enriched = rows.map(({ lineNumber, record }) => ({
      lineNumber,
      record: this.mergeReceptionCsvRecord(record),
      origKeys: Object.keys(record),
    }));
    const firstNonBlank = enriched.find((x) => !isBlankRecord(x.record));
    if (firstNonBlank?.origKeys?.length) {
      this.assertReceptionCsvNotMetaOnlyHeaders(firstNonBlank.record, firstNonBlank.origKeys);
    }
    const normalized = enriched.map(({ lineNumber, record }) => ({ lineNumber, record }));

    const grouped = this.groupRowsByReference(normalized, ['reception_reference', 'reference', 'referencia']);

    for (const group of grouped) {
      if (!group.length) continue;
      if (group.length === 1 && !this.hasReferenceValue(group[0].record, ['reception_reference', 'reference', 'referencia'])) {
        const { lineNumber, record } = group[0];
        if (isBlankRecord(record)) {
          skipped++;
          continue;
        }
        try {
          /**
           * Una sola fila puede traer encabezado + detalle (plantilla wide-row). Ese caso no debe usar
           * `importReceptionRow` (solo cabecera, sin líneas ni saldo MP para proceso). Si la fila califica
           * como línea de recepción, agrupamos con el mismo flujo que varias filas con `reception_reference`.
           */
          if (this.isReceptionLineRow(record)) {
            await this.importReceptionGroup(group);
          } else {
            await this.importReceptionRow(record);
          }
          inserted++;
        } catch (e) {
          errors.push({ row: lineNumber, message: extractErrorMessage(e), field: extractFieldHint(e) });
        }
        continue;
      }

      try {
        await this.importReceptionGroup(group);
        inserted++;
      } catch (e) {
        errors.push({ row: group[0].lineNumber, message: extractErrorMessage(e), field: extractFieldHint(e) });
      }
    }

    const total = rows.length;
    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: entityKey,
        total_rows: total,
        inserted,
        skipped,
        errors_count: errors.length,
        errors_sample: errors.slice(0, 80),
      }),
    );
    return { total, inserted, deleted: 0, skipped, errors };
  }

  private async runSalesOrderImport(
    rows: Array<{ lineNumber: number; record: Record<string, string> }>,
    username: string,
    entityKey: ImportEntityKey,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    let inserted = 0;
    let skipped = 0;
    const grouped = this.groupRowsByReference(rows, ['order_reference', 'order_number', 'pedido_referencia']);

    for (const group of grouped) {
      if (!group.length) continue;
      if (group.length === 1 && !this.hasReferenceValue(group[0].record, ['order_reference', 'order_number', 'pedido_referencia'])) {
        const { lineNumber, record } = group[0];
        if (isBlankRecord(record)) {
          skipped++;
          continue;
        }
        try {
          await this.importSalesOrderRow(record);
          inserted++;
        } catch (e) {
          errors.push({ row: lineNumber, message: extractErrorMessage(e), field: extractFieldHint(e) });
        }
        continue;
      }

      try {
        await this.importSalesOrderGroup(group);
        inserted++;
      } catch (e) {
        errors.push({ row: group[0].lineNumber, message: extractErrorMessage(e), field: extractFieldHint(e) });
      }
    }

    const total = rows.length;
    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: entityKey,
        total_rows: total,
        inserted,
        skipped,
        errors_count: errors.length,
        errors_sample: errors.slice(0, 80),
      }),
    );
    return { total, inserted, deleted: 0, skipped, errors };
  }

  private async runDispatchImport(
    rows: Array<{ lineNumber: number; record: Record<string, string> }>,
    username: string,
    entityKey: ImportEntityKey,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    let inserted = 0;
    let skipped = 0;

    for (const { lineNumber, record } of rows) {
      if (isBlankRecord(record)) {
        skipped++;
        continue;
      }
      try {
        await this.importDispatchHistoricalRow(record);
        inserted++;
      } catch (e) {
        errors.push({ row: lineNumber, message: extractErrorMessage(e), field: extractFieldHint(e) });
      }
    }

    const total = rows.length;
    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: entityKey,
        total_rows: total,
        inserted,
        skipped,
        errors_count: errors.length,
        errors_sample: errors.slice(0, 80),
      }),
    );
    return { total, inserted, deleted: 0, skipped, errors };
  }

  /**
   * Pedidos + despachos + facturas asociadas. No borra recepciones ni pt_tags.
   */
  async purgeAllSalesOrdersDispatches(): Promise<{
    invoice_items: number;
    invoices: number;
    packing_lists: number;
    dispatch_tag_items: number;
    dispatch_pt_packing_lists: number;
    dispatches: number;
    final_pallets_dispatch_cleared: number;
    sales_order_lines: number;
    sales_order_modifications: number;
    sales_orders: number;
  }> {
    return this.dispatchRepo.manager.transaction(async (em) => {
      const invItem = await em
        .createQueryBuilder()
        .delete()
        .from(InvoiceItem)
        .where('invoice_id IN (SELECT id FROM invoices)')
        .execute();
      const inv = await em.createQueryBuilder().delete().from(Invoice).execute();
      const pl = await em.createQueryBuilder().delete().from(PackingList).execute();
      const dti = await em.createQueryBuilder().delete().from(DispatchTagItem).execute();
      const dpl = await em.createQueryBuilder().delete().from(DispatchPtPackingList).execute();
      const disp = await em.createQueryBuilder().delete().from(Dispatch).execute();
      const fpRes = await em
        .createQueryBuilder()
        .update(FinalPallet)
        .set({ dispatch_id: null })
        .where('dispatch_id IS NOT NULL')
        .execute();
      const lines = await em.createQueryBuilder().delete().from(SalesOrderLine).execute();
      const mods = await em.createQueryBuilder().delete().from(SalesOrderModification).execute();
      const orders = await em.createQueryBuilder().delete().from(SalesOrder).execute();
      return {
        invoice_items: Number(invItem.affected ?? 0),
        invoices: Number(inv.affected ?? 0),
        packing_lists: Number(pl.affected ?? 0),
        dispatch_tag_items: Number(dti.affected ?? 0),
        dispatch_pt_packing_lists: Number(dpl.affected ?? 0),
        dispatches: Number(disp.affected ?? 0),
        final_pallets_dispatch_cleared: Number(fpRes.affected ?? 0),
        sales_order_lines: Number(lines.affected ?? 0),
        sales_order_modifications: Number(mods.affected ?? 0),
        sales_orders: Number(orders.affected ?? 0),
      };
    });
  }

  private hasReferenceValue(record: Record<string, string>, keys: string[]): boolean {
    return keys.some((k) => (record[k] ?? '').trim().length > 0);
  }

  private groupRowsByReference(
    rows: Array<{ lineNumber: number; record: Record<string, string> }>,
    referenceKeys: string[],
  ): Array<Array<{ lineNumber: number; record: Record<string, string> }>> {
    const groups = new Map<string, Array<{ lineNumber: number; record: Record<string, string> }>>();
    const ordered: Array<Array<{ lineNumber: number; record: Record<string, string> }>> = [];

    for (const row of rows) {
      if (isBlankRecord(row.record)) {
        ordered.push([row]);
        continue;
      }
      const ref = referenceKeys.map((k) => row.record[k]?.trim()).find((x) => x && x.length > 0) ?? '';
      if (!ref) {
        ordered.push([row]);
        continue;
      }
      const key = ref.toLowerCase();
      let arr = groups.get(key);
      if (!arr) {
        arr = [];
        groups.set(key, arr);
        ordered.push(arr);
      }
      arr.push(row);
    }
    return ordered;
  }

  private async importReceptionGroup(
    group: Array<{ lineNumber: number; record: Record<string, string> }>,
  ): Promise<void> {
    const merged = group.map((g) => ({ ...g, record: this.mergeReceptionCsvRecord(g.record) }));
    const header = merged.find((g) => this.isReceptionHeaderRow(g.record))?.record ?? merged[0].record;
    const lineRows = merged.filter((g) => this.isReceptionLineRow(g.record)).map((g) => g.record);
    const producerId = await this.resolveProducerId(header);
    const varietyId = await this.resolveVarietyId(header, 'variety_id', ['variety_codigo']);
    const documentStateId = await this.resolveDocumentStateId(header);
    const receptionTypeId = await this.resolveReceptionTypeId(header);
    const mercadoId = await this.resolveMercadoId(header);

    const dto: CreateReceptionDto = {
      received_at: requiredString(header, 'received_at'),
      producer_id: producerId,
      variety_id: varietyId ?? undefined,
      document_number: optionalString(header.document_number),
      reference_code: optionalString(header.reference_code),
      gross_weight_lb: parseImportDecimal(this.pickValue(header, ['gross_weight_lb', 'gross_lb'])),
      net_weight_lb: parseImportDecimal(this.pickValue(header, ['net_weight_lb', 'net_lb'])),
      notes: optionalString(header.notes),
      plant_code: optionalString(header.plant_code),
      lbs_reference: parseImportDecimal(this.pickValue(header, ['lbs_reference'])),
      lbs_difference: parseImportDecimal(this.pickValue(header, ['lbs_difference'])),
      document_state_id: documentStateId ?? undefined,
      reception_type_id: receptionTypeId ?? undefined,
      mercado_id: mercadoId ?? undefined,
      weight_basis: optionalString(header.weight_basis),
      quality_intent: optionalString(header.quality_intent),
      lines: lineRows.length ? await Promise.all(lineRows.map((r) => this.parseReceptionLineRow(r))) : undefined,
    };

    await this.traceability.createReception(dto);
  }

  private isReceptionHeaderRow(row: Record<string, string>): boolean {
    return (
      Boolean(optionalString(row.received_at)) ||
      Boolean(optionalString(row.producer_id)) ||
      Boolean(optionalString(row.document_number)) ||
      Boolean(optionalString(row.document_state_id))
    );
  }

  private isReceptionLineRow(row: Record<string, string>): boolean {
    return (
      Boolean(optionalString(row.species_id)) ||
      Boolean(optionalString(row.line_variety_id)) ||
      Boolean(optionalString(row.line_variety_codigo)) ||
      Boolean(optionalString(row.quality_grade_id)) ||
      Boolean(optionalString(row.returnable_container_id)) ||
      Boolean(optionalString(row.container_codigo)) ||
      Boolean(optionalString(row.net_lb)) ||
      Boolean(optionalString(row.net_weight_lb)) ||
      Boolean(optionalString(row.gross_lb)) ||
      Boolean(optionalString(row.gross_weight_lb))
    );
  }

  /** Normaliza acentos para comparar cabeceras “verbosas” de la plantilla (fila # … | pista). */
  private normCsvHeaderKey(k: string): string {
    return k
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Si Excel usó como nombre de columna el texto largo de la plantilla (fila de ayuda con `# … | …`),
   * copia el valor a las claves canónicas que lee el import.
   */
  private mergeReceptionCsvRecord(row: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { ...row };
    const assign = (canonical: string, val: string) => {
      const t = val.trim();
      if (!t) return;
      if (!(out[canonical] ?? '').trim()) out[canonical] = t;
    };
    for (const [rawKey, rawVal] of Object.entries(row)) {
      const k = this.normCsvHeaderKey(rawKey);
      const v = String(rawVal ?? '').trim();
      if (!v) continue;
      if (k.includes('fecha/hora recepcion') || (k.includes('iso 8601') && k.includes('timestamptz'))) {
        assign('received_at', v);
      }
      if (k.includes('timestamp') && k.includes('recepcion') && k.includes('fecha')) {
        assign('received_at', v);
      }
      if (k.includes('peso neto encabezado')) {
        assign('net_weight_lb', v);
        assign('net_lb', v);
      }
      if ((k.includes('neto lb') && k.includes('linea recepcion')) || k.includes('neto lb linea')) {
        assign('net_lb', v);
        assign('net_weight_lb', v);
      }
      if (k.includes('peso bruto encabezado')) {
        assign('gross_weight_lb', v);
        assign('gross_lb', v);
      }
      if (k.includes('bruto lb') && k.includes('linea recepcion')) {
        assign('gross_lb', v);
        assign('gross_weight_lb', v);
      }
      if (k.includes('tara lb') && k.includes('linea recepcion')) {
        assign('tare_lb', v);
      }
      if (k.includes('temperatura') && k.includes('linea recepcion')) {
        assign('temperature_f', v);
      }
      if (k.includes('cantidad envases') || (k.includes('linea recepcion') && k.includes('cantidad') && k.includes('int'))) {
        assign('quantity', v);
      }
      if (k.includes('linea recepcion') && k.includes('especie')) {
        assign('species_id', v);
      }
      if (
        k.includes('linea recepcion') &&
        k.includes('variedad') &&
        (k.includes('colision') || k.includes('line_variety'))
      ) {
        assign('line_variety_id', v);
      }
      if (k.includes('linea recepcion') && k.includes('calidad')) {
        assign('quality_grade_id', v);
      }
      if (k.includes('envases retornables') || (k.includes('returnable') && k.includes('container'))) {
        assign('returnable_container_id', v);
        assign('container_codigo', v);
      }
      if (k.includes('multivarietal')) {
        assign('multivariety_note', v);
      }
      if (k.includes('formato presentacion') && k.includes('catalogo')) {
        assign('format_code', v);
      }
      if (k.includes('clave de agrupacion') && k.includes('recepcion')) {
        assign('reception_reference', v);
      }
      if (k.includes('reference_code') || (k.includes('clave') && k.includes('unica') && k.includes('recepcion'))) {
        assign('reference_code', v);
      }
    }
    return out;
  }

  private assertReceptionCsvNotMetaOnlyHeaders(merged: Record<string, string>, originalKeys: string[]): void {
    const keys = originalKeys.filter((k) => k.trim().length > 0);
    if (keys.length < 4) return;
    const hashKeys = keys.filter((k) => k.trim().startsWith('#')).length;
    const hasCanonical =
      Boolean((merged.received_at ?? '').trim()) ||
      Boolean((merged.producer_id ?? '').trim()) ||
      Boolean((merged.reception_reference ?? '').trim());
    if (hashKeys / keys.length >= 0.55 && !hasCanonical) {
      throw new BadRequestException(
        'El CSV parece usar como nombres de columna la fila de ayuda de la plantilla (textos que empiezan con #). ' +
          'Dejá como primera fila de datos los nombres cortos: received_at, producer_id, net_lb, species_id, … ' +
          'O volvé a descargar la plantilla y pegá tus valores sin reemplazar la fila de encabezados.',
      );
    }
  }

  private async parseReceptionLineRow(row: Record<string, string>): Promise<CreateReceptionLineDto> {
    const speciesId = await this.resolveSpeciesId(row, 'species_id', ['species_codigo']);
    const rawLineVar = this.pickValue(row, ['line_variety_id', 'line_variety_codigo']);
    const { varietyId } = await this.resolveLineVarietyFromCsv(rawLineVar?.trim() ?? '', speciesId, row);
    if (varietyId == null) {
      throw new BadRequestException(
        speciesId != null
          ? `variety_id: no hay variedad activa para la especie indicada; agregá código o id en el CSV`
          : 'variety_id es obligatorio en la línea de detalle',
      );
    }
    const qualityGradeId = await this.resolveQualityId(row);
    const containerId = await this.resolveContainerId(row);
    return {
      species_id: speciesId!,
      variety_id: varietyId,
      quality_grade_id: qualityGradeId!,
      multivariety_note: optionalString(row.multivariety_note),
      format_code: optionalString(row.format_code),
      returnable_container_id: containerId!,
      quantity: requiredInt(row, 'quantity'),
      gross_lb: parseImportDecimal(this.pickValue(row, ['gross_lb', 'gross_weight_lb'])),
      tare_lb: parseImportDecimal(this.pickValue(row, ['tare_lb'])),
      net_lb: parseImportDecimalRequired(
        this.pickValue(row, ['net_lb', 'net_weight_lb']),
        'net_lb o net_weight_lb',
      ),
      temperature_f: parseImportDecimal(this.pickValue(row, ['temperature_f'])),
    };
  }

  private async importSalesOrderGroup(
    group: Array<{ lineNumber: number; record: Record<string, string> }>,
  ): Promise<void> {
    const header = group.find((g) => this.isSalesOrderHeaderRow(g.record))?.record ?? group[0].record;
    const lineRows = group.filter((g) => this.isSalesOrderLineRow(g.record)).map((g) => g.record);
    const lines: SalesOrderLineInputDto[] = [];
    for (const r of lineRows) {
      lines.push({
        presentation_format_id:
          (await this.resolvePresentationFormatId(r, 'presentation_format_id', ['format_code', 'format_codigo']))!,
        requested_boxes: parseImportIntGrouped(requiredString(r, 'requested_boxes')),
        unit_price: parseImportMoneyOptional(r.unit_price) ?? null,
        brand_id: await this.resolveBrandId(r),
        variety_id: await this.resolveVarietyId(r, 'variety_id', ['variety_codigo']),
      });
    }

    if (!lines.length) {
      throw new BadRequestException(
        'Pedido sin líneas: agregá filas con format_codigo/format_code y requested_boxes',
      );
    }

    const dto: CreateSalesOrderDto = {
      cliente_id: await this.resolveClientIdRequired(header, 'cliente_id', ['cliente_nombre']),
      order_number: optionalString(header.order_number) ?? optionalString(header.order_reference),
      fecha_pedido: optionalString(header.fecha_pedido),
      fecha_despacho_cliente: optionalString(this.pickValue(header, ['fecha_despacho', 'fecha_despacho_cliente'])),
      estado_comercial: optionalString(this.pickValue(header, ['estado', 'estado_comercial'])),
      lines,
    };
    await this.dispatchBilling.createSalesOrder(dto);
  }

  private isSalesOrderHeaderRow(row: Record<string, string>): boolean {
    if (this.isSalesOrderLineRow(row)) return false;
    return Boolean(
      optionalString(row.cliente_id) ||
        optionalString(row.cliente_nombre) ||
        optionalString(row.fecha_pedido) ||
        optionalString(row.fecha_despacho) ||
        optionalString(row.estado) ||
        optionalString(row.order_number),
    );
  }

  private isSalesOrderLineRow(row: Record<string, string>): boolean {
    const hasFmt = Boolean(
      this.pickValue(row, ['presentation_format_id', 'format_code', 'format_codigo'])?.trim(),
    );
    const rb = (row.requested_boxes ?? '').trim();
    return hasFmt && rb.length > 0;
  }

  private async importDispatchHistoricalRow(record: Record<string, string>): Promise<void> {
    const orderRef = requiredString(record, 'order_reference').trim();
    const fecha = new Date(requiredString(record, 'fecha_despacho'));
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('fecha_despacho inválida');
    const bol = requiredString(record, 'numero_bol').trim();
    const totalCajas = parseImportIntGrouped(requiredString(record, 'total_cajas'));
    const totalAmount = parseImportMoney(requiredString(record, 'total_amount'));
    const tfRaw = optionalFloat(record.temperatura_f?.replace(',', '.'));
    const dto: HistoricalDispatchImportInput = {
      order_reference: orderRef,
      fecha_despacho: fecha,
      numero_bol: bol,
      cliente_nombre: optionalString(record.cliente_nombre),
      thermograph_serial: optionalString(record.thermograph) ?? optionalString(record.thermograph_serial),
      temperatura_f: tfRaw ?? 34,
      total_cajas: totalCajas,
      total_amount: totalAmount,
    };
    await this.dispatchBilling.importHistoricalDispatch(dto);
  }

  private async importReceptionRow(row: Record<string, string>): Promise<void> {
    row = this.mergeReceptionCsvRecord(row);
    const borrador = await this.documentStateRepo.findOne({ where: { codigo: 'borrador' } });
    if (!borrador) throw new BadRequestException('Catálogo sin estado borrador');

    const dsId = await this.resolveDocumentStateId(row);
    if (dsId != null) {
      const ds = await this.documentStateRepo.findOne({ where: { id: dsId } });
      if (!ds) throw new BadRequestException('document_state_id inválido');
      if (ds.codigo !== 'borrador') {
        throw new BadRequestException(
          'Importación solo con encabezado: el estado del documento debe ser borrador (sin líneas en CSV)',
        );
      }
    }

    const dto: CreateReceptionDto = {
      received_at: requiredString(row, 'received_at'),
      producer_id: await this.resolveProducerId(row),
      variety_id: (await this.resolveVarietyId(row, 'variety_id', ['variety_codigo']))!,
      document_number: optionalString(row.document_number),
      reference_code: optionalString(row.reference_code),
      gross_weight_lb: parseImportDecimal(this.pickValue(row, ['gross_weight_lb', 'gross_lb'])),
      net_weight_lb: parseImportDecimal(this.pickValue(row, ['net_weight_lb', 'net_lb'])),
      notes: optionalString(row.notes),
      plant_code: optionalString(row.plant_code),
      lbs_reference: parseImportDecimal(this.pickValue(row, ['lbs_reference'])),
      lbs_difference: parseImportDecimal(this.pickValue(row, ['lbs_difference'])),
      document_state_id: dsId ?? borrador.id,
      reception_type_id: (await this.resolveReceptionTypeId(row)) ?? undefined,
      mercado_id: (await this.resolveMercadoId(row)) ?? undefined,
      weight_basis: optionalString(row.weight_basis),
      quality_intent: optionalString(row.quality_intent),
    };

    await this.traceability.createReception(dto);
  }

  private async importProcessRow(row: Record<string, string>, processCreateOrdinal?: number): Promise<void> {
    const lbAlloc = requiredFloat(row, 'peso_procesado_lb');
    const producerId = await this.resolveProducerId(row, 'productor_id', [
      'producer_id',
      'producer_codigo',
      'productor_codigo',
    ]);
    const varietyId = await this.resolveVarietyId(row, 'variedad_id', ['variety_codigo', 'line_variety_id']);
    if (varietyId == null) throw new BadRequestException('variedad_id es obligatorio');
    const { lineIds: receptionLineIds, hints: receptionHints } = await this.resolveReceptionLineIdsForProcess(row);
    const lines = await this.receptionLineRepo.findBy({ id: In(receptionLineIds) });
    if (!lines.length) throw new BadRequestException('No se encontraron líneas de recepción para el proceso');
    const byId = new Map(lines.map((ln) => [ln.id, ln]));
    const orderedLines = receptionLineIds.map((id) => {
      const ln = byId.get(id);
      if (!ln) throw new BadRequestException(`reception_line_id no encontrada: ${id}`);
      return ln;
    });

    const perLine = Number((lbAlloc / orderedLines.length).toFixed(3));
    const machineId = await this.resolveProcessMachineIdOrDefaultOne(parseOptionalInt(row.process_machine_id));
    const percent = optionalString(row.porcentaje_procesado) ?? '100';
    const merma = optionalFloat(row.merma_lb) ?? 0;
    const resultado = parseOptionalEnum(ProcessResult, row.resultado) ?? ProcessResult.IQF;
    const notaParts = [optionalString(row.nota), ...[...new Set(receptionHints)]].filter(
      (x): x is string => !!x?.trim(),
    );
    const mergedNota = notaParts.length ? notaParts.join(' | ') : undefined;

    const desiredIdRaw = this.pickValue(row, [
      'process_id',
      'fruit_process_id',
      'id',
      'proceso_id',
      'proceso_numero',
      'nro_proceso',
      'numero_proceso',
      'numero_proceso_csv',
    ]);
    let desiredProcessId: number | null = null;
    let csvProcessRef: number | null = null;
    if (desiredIdRaw) {
      desiredProcessId = tryParsePositiveInt(desiredIdRaw);
      if (desiredProcessId == null) {
        throw new BadRequestException(
          `process_id / fruit_process_id / id inválido en alta de proceso: «${desiredIdRaw}» (entero ≥1).`,
        );
      }
      csvProcessRef = desiredProcessId;
    } else if (
      processCreateOrdinal != null &&
      processCreateOrdinal > 0 &&
      this.rowWantsAutoSequentialProcessId(row)
    ) {
      desiredProcessId = processCreateOrdinal;
      csvProcessRef = processCreateOrdinal;
    }

    const created = await this.fruitProcessRepo.manager.transaction(async (em) => {
      if (desiredProcessId != null) {
        const clash = await em.findOne(FruitProcess, { where: { id: desiredProcessId }, withDeleted: true });
        if (clash) {
          throw new BadRequestException(
            `process_id=${desiredProcessId} ya existe en fruit_processes; elegí otro id o dejá la columna vacía para autonumérico.`,
          );
        }
      }

      const proc = em.create(FruitProcess, {
        ...(desiredProcessId != null ? { id: desiredProcessId } : {}),
        csv_process_ref: csvProcessRef ?? undefined,
        recepcion_id: orderedLines[0].reception_id,
        fecha_proceso: new Date(requiredString(row, 'fecha_proceso')),
        productor_id: producerId,
        variedad_id: varietyId,
        peso_procesado_lb: lbAlloc.toFixed(3),
        merma_lb: merma.toFixed(3),
        porcentaje_procesado: percent,
        resultado,
        tarja_id: null,
        reception_line_id: orderedLines[0].id,
        process_machine_id: machineId,
        temperatura_f: optionalFloat(row.temperatura_f)?.toFixed(2),
        nota: mergedNota,
        lb_entrada: optionalString(row.lb_entrada),
        lb_iqf: optionalString(row.lb_iqf),
        lb_packout: optionalString(row.lb_packout),
        lb_sobrante: optionalString(row.lb_sobrante),
        lb_producto_terminado: optionalString(row.lb_producto_terminado),
        lb_desecho: optionalString(row.lb_desecho),
        lb_jugo: optionalString(row.lb_jugo),
        lb_merma_balance: optionalString(row.lb_merma_balance),
        balance_closed: row.balance_closed?.trim() ? parseBoolLoose(row.balance_closed) : false,
        process_status: (optionalString(row.process_status) as FruitProcess['process_status']) ?? 'borrador',
      });
      const saved = await em.save(proc);

      if (desiredProcessId != null) {
        await em.query(
          `SELECT setval('fruit_processes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM fruit_processes))`,
        );
      }

      for (const ln of orderedLines) {
        await em.save(
          em.create(FruitProcessLineAllocation, {
            process_id: saved.id,
            reception_line_id: ln.id,
            lot_code: ln.lot_code,
            lb_allocated: perLine.toFixed(3),
          }),
        );
      }
      return saved;
    });
    if (!created?.id) throw new BadRequestException('No se pudo crear el proceso');
  }

  /** Aplica columnas históricas además del alta estándar (createProcess). */
  private async patchFruitProcessFromCsv(id: number, row: Record<string, string>): Promise<void> {
    const cur = await this.fruitProcessRepo.findOne({ where: { id } });
    if (!cur) return;

    const patch: Partial<FruitProcess> = {};
    const optRecepcion = parseOptionalInt(row.recepcion_id);
    if (optRecepcion != null) patch.recepcion_id = optRecepcion;
    const optTarja = parseOptionalInt(row.tarja_id);
    if (optTarja != null) patch.tarja_id = optTarja;
    const optLine = parseOptionalInt(row.reception_line_id);
    if (optLine != null) patch.reception_line_id = optLine;

    const tf = optionalFloat(row.temperatura_f);
    if (tf !== undefined) patch.temperatura_f = tf.toFixed(2);
    if (row.nota !== undefined) patch.nota = optionalString(row.nota);
    if (row.porcentaje_procesado?.trim()) patch.porcentaje_procesado = row.porcentaje_procesado.trim();
    if (row.process_status?.trim()) patch.process_status = row.process_status.trim() as FruitProcess['process_status'];
    if (row.balance_closed?.trim()) patch.balance_closed = parseBoolLoose(row.balance_closed);
    const variedadId = parseOptionalInt(row.variedad_id);
    if (variedadId != null) patch.variedad_id = variedadId;

    const dec = (s?: string) => (s?.trim() ? String(s).trim() : undefined);
    patch.lb_entrada = dec(row.lb_entrada);
    patch.lb_iqf = dec(row.lb_iqf);
    patch.lb_sobrante = dec(row.lb_sobrante);
    patch.lb_packout = dec(row.lb_packout);
    patch.lb_producto_terminado = dec(row.lb_producto_terminado);
    patch.lb_desecho = dec(row.lb_desecho);
    patch.lb_jugo = dec(row.lb_jugo);
    patch.lb_merma_balance = dec(row.lb_merma_balance);

    if (Object.keys(patch).length) {
      await this.fruitProcessRepo.update(id, patch);
    }
  }

  /**
   * Columna `recepcion_id` del CSV de procesos: primero `receptions.id` si existe;
   * si no, document_number o reference_code exactos (útil si cargaste "1" en doc./guía).
   * Si varias recepciones comparten el mismo `reference_code` (ej. mano y máquina), se elige
   * la de menor `receptions.id` y se devuelve `hint` para anotar el proceso (revisión en UI).
   */
  private async resolveReceptionByRecepcionColumn(
    rawToken: string,
  ): Promise<{ reception: Reception; hint?: string }> {
    const t = rawToken.trim();
    if (!t) {
      throw new BadRequestException('recepcion_id vacía');
    }
    const asNum = tryParsePositiveInt(t);
    if (asNum != null) {
      const byId = await this.receptionRepo.findOne({ where: { id: asNum } });
      if (byId) return { reception: byId };
    }

    const byDoc = await this.receptionRepo.find({
      where: { document_number: t },
      order: { id: 'ASC' },
      take: 2,
    });
    if (byDoc.length > 1) {
      throw new BadRequestException(
        `"${t}": varias recepciones con el mismo document_number; usá receptions.id o reception_line_id`,
      );
    }
    if (byDoc[0]) return { reception: byDoc[0] };

    const byRef = await this.receptionRepo.find({
      where: { reference_code: t },
      order: { id: 'ASC' },
    });
    if (byRef.length) {
      const chosen = byRef[0];
      const hint =
        byRef.length > 1
          ? `[import] reference_code "${t}" en ${byRef.length} recepciones; se usó receptions.id=${chosen.id}. Revisá líneas / MP libre en el proceso si corresponde.`
          : undefined;
      return { reception: chosen, hint };
    }

    throw new BadRequestException(
      `Recepción no encontrada: ${t}. Podés usar receptions.id, document_number, reference_code, o reception_line_id.`,
    );
  }

  private async resolveReceptionLineIdsForProcess(
    row: Record<string, string>,
  ): Promise<{ lineIds: number[]; hints: string[] }> {
    const lineToken = this.pickValue(row, ['reception_line_id', 'reception_line_ids'])?.trim();
    if (lineToken) {
      const rawParts = lineToken
        .split('|')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      const partIds: number[] = [];
      for (const p of rawParts) {
        const n = tryParsePositiveInt(p);
        if (n == null) {
          throw new BadRequestException(`reception_line_id inválida (solo ids numéricos): ${p}`);
        }
        partIds.push(n);
      }
      const uniqOrdered: number[] = [];
      const seen = new Set<number>();
      for (const id of partIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniqOrdered.push(id);
      }
      const lines = await this.receptionLineRepo.findBy({ id: In(uniqOrdered) });
      const byId = new Map(lines.map((l) => [l.id, l]));
      for (const id of uniqOrdered) {
        if (!byId.has(id)) {
          throw new BadRequestException(`reception_line_id no encontrada: ${id}`);
        }
      }
      let receptionId: number | null = null;
      for (const id of uniqOrdered) {
        const ln = byId.get(id)!;
        if (receptionId == null) receptionId = Number(ln.reception_id);
        else if (Number(ln.reception_id) !== receptionId) {
          throw new BadRequestException(
            'reception_line_id: todas las líneas deben ser de la misma recepción (mismo recepcion_id)',
          );
        }
      }
      return { lineIds: uniqOrdered, hints: [] };
    }

    const recepcionRaw = this.pickValue(row, ['recepcion_id', 'reception_id'])?.trim();
    if (recepcionRaw) {
      const { reception: resolvedRec, hint } = await this.resolveReceptionByRecepcionColumn(recepcionRaw);
      const lines = await this.receptionLineRepo.find({
        where: { reception_id: resolvedRec.id },
        order: { line_order: 'ASC', id: 'ASC' },
      });
      if (!lines.length) {
        throw new BadRequestException(`Recepción ${resolvedRec.id} sin líneas`);
      }
      return { lineIds: lines.map((l) => l.id), hints: hint ? [hint] : [] };
    }

    const raw = optionalString(this.pickValue(row, ['reception_reference', 'reference', 'referencia']));
    if (!raw?.trim()) {
      throw new BadRequestException(
        'Indicá recepción: recepcion_id (receptions.id), reception_line_id (reception_lines.id, varias con |), o reception_reference (reference_code o document_number, varias con |)',
      );
    }
    const refs = raw
      .split('|')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    if (!refs.length) {
      throw new BadRequestException('reception_reference vacío');
    }

    const lineIds: number[] = [];
    const hints: string[] = [];
    for (const ref of refs) {
      const { reception: rec, hint } = await this.resolveReceptionByRecepcionColumn(ref);
      if (hint) hints.push(hint);
      const ln = await this.receptionLineRepo.findOne({
        where: { reception_id: rec.id },
        order: { line_order: 'ASC', id: 'ASC' },
      });
      if (!ln) {
        throw new BadRequestException(`Recepción ${ref} (id ${rec.id}) sin líneas`);
      }
      lineIds.push(ln.id);
    }
    return { lineIds, hints };
  }

  /** Resuelve `fruit_processes.id` cuando el CSV de PT trae una nota única en lugar de process_id. */
  private async resolveProcessIdByNotaExact(nota: string): Promise<number> {
    const matches = await this.fruitProcessRepo.find({
      where: { nota },
      order: { id: 'ASC' },
      take: 2,
    });
    if (!matches.length) {
      throw new BadRequestException(`No hay proceso con nota exacta: ${nota}`);
    }
    if (matches.length > 1) {
      throw new BadRequestException(
        `Varios procesos con la misma nota "${nota}"; usá process_id numérico o una nota distinta por proceso`,
      );
    }
    return matches[0].id;
  }

  private async resolveProcessMachineIdOrDefaultOne(rawId: number | null): Promise<number> {
    const desired = rawId ?? 1;
    const found = await this.processMachineRepo.findOne({ where: { id: desired } });
    if (found) return found.id;
    const fallback = await this.processMachineRepo.findOne({ where: { id: 1 } });
    if (!fallback) throw new BadRequestException('No existe process_machine_id=1 para fallback');
    return fallback.id;
  }

  private isProcessDeleteImportRow(row: Record<string, string>): boolean {
    const raw = (this.pickValue(row, ['import_action', 'accion_import']) ?? '').trim().toLowerCase();
    return raw === 'borrar' || raw === 'delete' || raw === 'eliminar';
  }

  /** Si true y no hay process_id explícito, el import asigna fruit_processes.id = orden de fila de alta (1, 2, 3…). */
  private rowWantsAutoSequentialProcessId(row: Record<string, string>): boolean {
    const raw = this.pickValue(row, ['auto_process_id', 'process_id_auto', 'ids_secuenciales'])?.trim().toLowerCase();
    return (
      raw === '1' ||
      raw === 'si' ||
      raw === 'sí' ||
      raw === 's' ||
      raw === 'true' ||
      raw === 'yes' ||
      raw === 'y' ||
      raw === 'ordinal'
    );
  }

  /** Si true, no se interpreta process_id como ordinal por día cuando falta el id en BD. Solo texto tipo «si»/«true» — no uses «1» (se confunde con el número de proceso). */
  private ptRowWantsStrictProcessId(row: Record<string, string>): boolean {
    const raw = this.pickValue(row, ['process_id_strict', 'process_id_estricto', 'pid_estricto'])?.trim().toLowerCase();
    return raw === 'si' || raw === 'sí' || raw === 'true' || raw === 'yes' || raw === 'y' || raw === 'on';
  }

  private localCalendarDayKeyInTz(iso: string, timeZone: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone });
  }

  private readonly PT_PROCESS_ORDINAL_TZ = 'America/Argentina/Buenos_Aires';

  private utcCalendarDayBoundsForIso(iso: string): { start: Date; endExclusive: Date } {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`fecha inválida para cruzar proceso: «${iso}»`);
    }
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(y, m, day + 1, 0, 0, 0, 0));
    return { start, endExclusive };
  }

  /**
   * PT CSV: process_id=1 a veces es ordinal «primer borrador del día», no PK 1.
   * 1) Mismo día calendario UTC que `fecha` del PT.
   * 2) Si no alcanza, mismo día calendario en America/Argentina/Buenos_Aires (fecha PT vs fecha_proceso).
   */
  private async tryResolvePtProcessIdByBorradorDayOrdinal(
    ordinal: number,
    fechaPtIso: string,
  ): Promise<number | null> {
    if (!Number.isFinite(ordinal) || ordinal < 1 || ordinal > 500) return null;
    const utc = await this.tryResolvePtProcessIdByBorradorUtcDayOrdinal(ordinal, fechaPtIso);
    if (utc != null) return utc;
    return this.tryResolvePtProcessIdByBorradorTzDayOrdinal(ordinal, fechaPtIso, this.PT_PROCESS_ORDINAL_TZ);
  }

  private async tryResolvePtProcessIdByBorradorUtcDayOrdinal(
    ordinal: number,
    fechaPtIso: string,
  ): Promise<number | null> {
    const { start, endExclusive } = this.utcCalendarDayBoundsForIso(fechaPtIso);
    const candidates = await this.borradorProcessesInFechaRange(start, endExclusive);
    const idx = ordinal - 1;
    if (idx < 0 || idx >= candidates.length) return null;
    return Number(candidates[idx].id);
  }

  private async tryResolvePtProcessIdByBorradorTzDayOrdinal(
    ordinal: number,
    fechaPtIso: string,
    timeZone: string,
  ): Promise<number | null> {
    const targetDay = this.localCalendarDayKeyInTz(fechaPtIso, timeZone);
    if (!targetDay) return null;
    const from = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000);
    const rows = await this.fruitProcessRepo
      .createQueryBuilder('fp')
      .where('fp.process_status = :st', { st: 'borrador' })
      .andWhere('fp.fecha_proceso >= :from', { from })
      .orderBy('fp.id', 'ASC')
      .getMany();
    const match = rows.filter((fp) => {
      const procIso =
        fp.fecha_proceso instanceof Date ? fp.fecha_proceso.toISOString() : String(fp.fecha_proceso);
      return this.localCalendarDayKeyInTz(procIso, timeZone) === targetDay;
    });
    const idx = ordinal - 1;
    if (idx < 0 || idx >= match.length) return null;
    return Number(match[idx].id);
  }

  private async borradorProcessesInFechaRange(start: Date, endExclusive: Date): Promise<FruitProcess[]> {
    return this.fruitProcessRepo
      .createQueryBuilder('fp')
      .where('fp.fecha_proceso >= :start', { start })
      .andWhere('fp.fecha_proceso < :endExclusive', { endExclusive })
      .andWhere('fp.process_status = :st', { st: 'borrador' })
      .orderBy('fp.id', 'ASC')
      .getMany();
  }

  /**
   * PT CSV: `process_id` coincide con `fruit_processes.csv_process_ref` (nº en CSV de procesos), mismo día
   * calendario UTC o AR que la `fecha` del PT.
   */
  private async tryResolvePtProcessIdByCsvProcessRef(
    refNum: number,
    fechaPtIso: string,
  ): Promise<number | null> {
    if (!Number.isFinite(refNum) || refNum < 1 || refNum > 50_000) return null;
    const from = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000);
    const rows = await this.fruitProcessRepo
      .createQueryBuilder('fp')
      .where('fp.process_status = :st', { st: 'borrador' })
      .andWhere('fp.csv_process_ref = :ref', { ref: refNum })
      .andWhere('fp.fecha_proceso >= :from', { from })
      .orderBy('fp.id', 'ASC')
      .getMany();
    if (rows.length === 0) return null;

    const ptUtc = this.localCalendarDayKeyInTz(fechaPtIso, 'UTC');
    const ptAr = this.localCalendarDayKeyInTz(fechaPtIso, this.PT_PROCESS_ORDINAL_TZ);
    const hits = rows.filter((fp) => {
      const procIso =
        fp.fecha_proceso instanceof Date ? fp.fecha_proceso.toISOString() : String(fp.fecha_proceso);
      const procUtc = this.localCalendarDayKeyInTz(procIso, 'UTC');
      const procAr = this.localCalendarDayKeyInTz(procIso, this.PT_PROCESS_ORDINAL_TZ);
      return (ptUtc !== '' && procUtc === ptUtc) || (ptAr !== '' && procAr === ptAr);
    });
    if (hits.length === 1) return Number(hits[0].id);
    return null;
  }

  /** CSV: `import_action`=borrar|delete|eliminar y `process_id` o `id` numérico. */
  private async purgeProcessFromImportRow(row: Record<string, string>): Promise<void> {
    const idRaw = this.pickValue(row, ['process_id', 'id'])?.trim();
    if (!idRaw) {
      throw new BadRequestException('Para borrar: import_action=borrar y process_id (o id) numérico');
    }
    const n = Number(idRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      throw new BadRequestException('process_id inválido');
    }
    await this.purgeProcessesByIds([n]);
  }

  private isPtTagDeleteImportRow(row: Record<string, string>): boolean {
    const raw = (this.pickValue(row, ['import_action', 'accion_import']) ?? '').trim().toLowerCase();
    return raw === 'borrar' || raw === 'delete' || raw === 'eliminar';
  }

  /**
   * CSV: `import_action` = borrar|delete|eliminar y `tarja_id` / `id` numérico, o `tag_code` / `etiqueta_id` con código.
   */
  private async purgePtTagFromImportRow(row: Record<string, string>): Promise<void> {
    const ident = this.pickValue(row, ['tarja_id', 'id', 'etiqueta_id'])?.trim();
    const tagCode = optionalString(row.tag_code);
    let tagId: number | null = null;

    if (ident) {
      const n = Number(ident);
      if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
        tagId = n;
      } else {
        const byCode = await this.ptTagRepo
          .createQueryBuilder('t')
          .where('LOWER(TRIM(t.tag_code)) = LOWER(TRIM(:c))', { c: ident })
          .getOne();
        if (!byCode) throw new BadRequestException(`No hay unidad PT con tag_code «${ident}»`);
        tagId = Number(byCode.id);
      }
    }
    if (tagId == null && tagCode) {
      const byCode = await this.ptTagRepo
        .createQueryBuilder('t')
        .where('LOWER(TRIM(t.tag_code)) = LOWER(TRIM(:c))', { c: tagCode })
        .getOne();
      if (!byCode) throw new BadRequestException(`No hay unidad PT con tag_code «${tagCode}»`);
      tagId = Number(byCode.id);
    }
    if (tagId == null) {
      throw new BadRequestException(
        'Para borrar: import_action=borrar y tarja_id (numérico), o tag_code / etiqueta_id con el código de tarja.',
      );
    }
    await this.process.purgePtTagById(tagId);
  }

  private async importPtTagRow(row: Record<string, string>): Promise<boolean> {
    if (this.isPtTagDeleteImportRow(row)) {
      await this.purgePtTagFromImportRow(row);
      return true;
    }
    if (optionalString(row.pallet_id_origen)) {
      await this.importHistoricalPtTagRow(row);
      return false;
    }

    const dto: CreatePtTagDto = {
      fecha: requiredString(row, 'fecha'),
      resultado: requiredEnum(ProcessResult, row, 'resultado'),
      format_code: requiredString(row, 'format_code'),
      cajas_por_pallet: requiredInt(row, 'cajas_por_pallet'),
      client_id: (await this.resolveClientId(row, 'client_id', ['cliente_nombre'])) ?? undefined,
      brand_id: (await this.resolveBrandId(row)) ?? undefined,
      bol: optionalString(row.bol),
    };

    const created = await this.process.createTag(dto);
    if (!created?.id) throw new BadRequestException('No se pudo crear la unidad PT');

    const processRaw = this.pickValue(row, [
      'process_id',
      'id_process_origen',
      'fruit_process_id',
      'proceso_id',
      'id_proceso',
    ]);
    let processId: number | null = null;
    if (processRaw) {
      processId = tryParsePositiveInt(processRaw);
      if (processId == null) {
        throw new BadRequestException(
          `process_id / id_process_origen inválido (entero ≥1): «${processRaw}». Revisá el encabezado de columna y que sea fruit_processes.id.`,
        );
      }
    }
    const notaProc = optionalString(this.pickValue(row, ['process_nota', 'proceso_nota', 'nota_proceso']))?.trim();
    if ((processId == null || processId < 1) && notaProc) {
      processId = await this.resolveProcessIdByNotaExact(notaProc);
    }
    const linkProcess = processId != null && processId > 0;

    const upd: Partial<PtTag> = {};
    if (row.tag_code?.trim()) {
      const code = row.tag_code.trim();
      const dup = await this.ptTagRepo.findOne({ where: { tag_code: code } });
      if (dup && dup.id !== created.id) {
        throw new BadRequestException(`tag_code duplicado: ${code}`);
      }
      upd.tag_code = code;
    }
    if (!linkProcess) {
      if (row.total_cajas?.trim()) upd.total_cajas = requiredInt(row, 'total_cajas');
      if (row.total_pallets?.trim()) upd.total_pallets = requiredInt(row, 'total_pallets');
    }
    if (row.net_weight_lb?.trim()) upd.net_weight_lb = row.net_weight_lb.trim();

    if (Object.keys(upd).length) {
      await this.ptTagRepo.update(created.id, upd);
    }

    if (linkProcess) {
      const cajasGenRaw = this.pickValue(row, ['cajas_generadas', 'cajas_generadas_pt']);
      const cajasGenCol = cajasGenRaw ? tryParsePositiveInt(cajasGenRaw) : null;
      if (cajasGenRaw && cajasGenCol == null) {
        throw new BadRequestException(`cajas_generadas inválido: «${cajasGenRaw}»`);
      }
      const cajasFromTotal = row.total_cajas?.trim() ? requiredInt(row, 'total_cajas') : undefined;
      const cajasGeneradas = cajasGenCol ?? cajasFromTotal;
      const fechaPtIso = requiredString(row, 'fecha');
      let effectiveProcessId = processId!;
      let procRow = await this.fruitProcessRepo.findOne({
        where: { id: effectiveProcessId },
        withDeleted: true,
      });
      if (
        !procRow &&
        !this.ptRowWantsStrictProcessId(row) &&
        processId! >= 1 &&
        processId! <= 50_000
      ) {
        const byCsv = await this.tryResolvePtProcessIdByCsvProcessRef(processId!, fechaPtIso);
        if (byCsv != null) {
          effectiveProcessId = byCsv;
          procRow = await this.fruitProcessRepo.findOne({
            where: { id: effectiveProcessId },
            withDeleted: true,
          });
        }
      }
      if (
        !procRow &&
        !this.ptRowWantsStrictProcessId(row) &&
        processId! >= 1 &&
        processId! <= 500
      ) {
        const byDay = await this.tryResolvePtProcessIdByBorradorDayOrdinal(processId!, fechaPtIso);
        if (byDay != null) {
          effectiveProcessId = byDay;
          procRow = await this.fruitProcessRepo.findOne({
            where: { id: effectiveProcessId },
            withDeleted: true,
          });
        }
      }
      if (!procRow) {
        const dayHint =
          processId! >= 1 && processId! <= 50_000 && !this.ptRowWantsStrictProcessId(row)
            ? ` Si process_id no es PK: probá csv_process_ref del proceso (mismo nº y día que «fecha»), ordinal por día (1..500), o process_id_strict=si con id real.`
            : '';
        throw new BadRequestException(
          `No existe fruit_processes.id=${processId}.${dayHint} Alternativas: id real en process_id con process_id_strict=si; mismo nº y día que proceso con csv_process_ref; auto_process_id=1 en CSV de procesos; ordinal por día (1..500); o process_nota única.`,
        );
      }
      if (procRow.deleted_at) {
        throw new BadRequestException(`El proceso id=${effectiveProcessId} está eliminado (deleted_at).`);
      }
      await this.process.addProcessToTag(created.id, {
        process_id: effectiveProcessId,
        ...(cajasGeneradas != null && cajasGeneradas > 0 ? { cajas_generadas: cajasGeneradas } : {}),
      });
    }

    if (Object.keys(upd).length || linkProcess) {
      await this.process.refreshPtTagStockAfterImport(created.id);
    }
    return false;
  }

  private async importHistoricalPtTagRow(row: Record<string, string>): Promise<void> {
    const fechaIso = requiredString(row, 'fecha_proceso');
    const fecha = new Date(fechaIso);
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('fecha_proceso inválida');

    const boxes = requiredInt(row, 'boxes');
    const netLb = requiredFloat(row, 'net_lb');
    const palletOrigen = requiredString(row, 'pallet_id_origen');
    const process = await this.resolveHistoricalProcessForPtTag(row, fechaIso);
    const clientId = await this.resolveClientId(row, 'client_id', ['client_nombre', 'cliente_nombre']);
    const brandId = await this.resolveBrandByClientName(row.client_nombre);
    const formatCode = requiredString(row, 'format_codigo');
    await this.ensurePresentationFormatExists(formatCode);

    const bolRaw = optionalString(row.bol_referencia);
    const bol = bolRaw ? `${bolRaw}|PALLET:${palletOrigen}` : `PALLET:${palletOrigen}`;
    const fruitType = optionalString(row.fruit_type)?.toLowerCase();
    const resultado = fruitType === 'machine' ? ProcessResult.CAJAS : ProcessResult.IQF;

    await this.ptTagRepo.manager.transaction(async (em) => {
      const tmpCode = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 64);
      const created = await em.save(
        em.create(PtTag, {
          tag_code: tmpCode,
          fecha,
          resultado,
          format_code: formatCode,
          cajas_por_pallet: Math.max(1, boxes),
          total_cajas: boxes,
          total_pallets: 1,
          client_id: clientId ?? null,
          brand_id: brandId ?? null,
          bol,
          net_weight_lb: netLb.toFixed(3),
        }),
      );

      await em.update(PtTag, { id: created.id }, { tag_code: `TAR-HIST-${created.id}` });

      await em.query(
        `INSERT INTO pt_tag_items (tarja_id, process_id, productor_id, cajas_generadas, pallets_generados)
         VALUES ($1,$2,$3,$4,$5)`,
        [created.id, process.id, process.productor_id, boxes, 1],
      );
    });
  }

  private async resolveHistoricalProcessForPtTag(
    row: Record<string, string>,
    fechaIso: string,
  ): Promise<FruitProcess> {
    const originId = parseOptionalInt(row.id_process_origen);
    if (originId != null) {
      const byId = await this.fruitProcessRepo.findOne({ where: { id: originId } });
      if (byId) return byId;
      const opCode = `OP-${String(originId).padStart(3, '0')}`;
      const byNota = await this.fruitProcessRepo.findOne({ where: { nota: opCode } });
      if (byNota) return byNota;
    }

    const producerId = requiredInt(row, 'producer_codigo');
    const byDateProducer = await this.fruitProcessRepo.find({
      where: {
        productor_id: producerId,
        fecha_proceso: new Date(fechaIso),
      },
      order: { id: 'ASC' },
    });
    if (byDateProducer.length > 0) return byDateProducer[0];

    throw new BadRequestException('No se encontró fruit_process para id_process_origen ni por fecha+productor');
  }

  private async ensurePresentationFormatExists(formatCode: string): Promise<void> {
    const fmt = await this.presentationFormatRepo
      .createQueryBuilder('pf')
      .where('LOWER(TRIM(pf.format_code)) = LOWER(TRIM(:fc))', { fc: formatCode })
      .getOne();
    if (!fmt) throw new BadRequestException(`format_codigo no encontrado: ${formatCode}`);
  }

  private async resolveBrandByClientName(clientName?: string): Promise<number | null> {
    const name = (clientName ?? '').trim().toUpperCase();
    if (!name) return null;
    if (name.includes('ALPINE')) {
      const b = await this.brandRepo.findOne({ where: { codigo: 'ALP-FB' } });
      return b?.id ?? null;
    }
    if (name.includes('FRESHWAVE')) {
      const b = await this.brandRepo.findOne({ where: { codigo: 'FW-CN' } });
      return b?.id ?? null;
    }
    return null;
  }

  private async importFinalPalletRow(row: Record<string, string>): Promise<void> {
    const pal = this.finalPalletRepo.create({
      status: (optionalString(row.status) as FinalPallet['status']) ?? 'borrador',
      species_id: parseOptionalInt(row.species_id),
      quality_grade_id: parseOptionalInt(row.quality_grade_id),
      corner_board_code: optionalString(row.corner_board_code) ?? '',
      clamshell_label: optionalString(row.clamshell_label) ?? '',
      brand_id: await this.resolveBrandId(row),
      dispatch_unit: optionalString(row.dispatch_unit) ?? '',
      packing_type: optionalString(row.packing_type) ?? '',
      market: optionalString(row.market) ?? '',
      bol: optionalString(row.bol),
      planned_sales_order_id: parseOptionalInt(row.planned_sales_order_id),
      client_id: await this.resolveClientId(row, 'client_id', ['cliente_nombre']),
      fruit_quality_mode: (optionalString(row.fruit_quality_mode) as FinalPallet['fruit_quality_mode']) ?? 'proceso',
      presentation_format_id: await this.resolvePresentationFormatId(row),
      dispatch_id: parseOptionalInt(row.dispatch_id),
      pt_packing_list_id: parseOptionalInt(row.pt_packing_list_id),
      tarja_id: parseOptionalInt(row.tarja_id),
    });

    let saved = await this.finalPalletRepo.save(pal);
    if (!saved.corner_board_code?.trim()) {
      saved.corner_board_code = `PF-${saved.id}`;
      saved = await this.finalPalletRepo.save(saved);
    }
  }

  private async importSalesOrderRow(row: Record<string, string>): Promise<void> {
    const formatId = await this.resolvePresentationFormatId(row, 'presentation_format_id', [
      'format_code',
      'format_codigo',
    ]);
    const reqBoxesRaw = (row.requested_boxes ?? '').trim();
    const reqBoxes = reqBoxesRaw ? parseImportIntGrouped(reqBoxesRaw) : NaN;
    if (formatId == null || !Number.isFinite(reqBoxes)) {
      throw new BadRequestException(
        'Para pedidos de una sola fila: format_codigo (o format_code/presentation_format_id) y requested_boxes',
      );
    }
    const dto: CreateSalesOrderDto = {
      cliente_id: await this.resolveClientIdRequired(row, 'cliente_id', ['cliente_nombre']),
      order_number: requiredString(row, 'order_number').trim(),
      fecha_pedido: optionalString(row.fecha_pedido),
      fecha_despacho_cliente: optionalString(this.pickValue(row, ['fecha_despacho', 'fecha_despacho_cliente'])),
      estado_comercial: optionalString(this.pickValue(row, ['estado', 'estado_comercial'])),
      lines: [
        {
          presentation_format_id: formatId,
          requested_boxes: reqBoxes,
          unit_price: parseImportMoneyOptional(row.unit_price) ?? null,
          brand_id: await this.resolveBrandId(row),
          variety_id: await this.resolveVarietyId(row, 'variety_id', ['variety_codigo']),
        },
      ],
    };
    await this.dispatchBilling.createSalesOrder(dto);
  }

  private pickValue(row: Record<string, string>, keys: string[]): string | undefined {
    for (const k of keys) {
      const v = row[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    const byLc = new Map<string, string>();
    for (const [rk, rv] of Object.entries(row)) {
      if (rv == null) continue;
      const t = String(rv).trim();
      if (t === '') continue;
      byLc.set(rk.toLowerCase(), t);
    }
    for (const k of keys) {
      const hit = byLc.get(k.toLowerCase());
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  private async resolveIdByText<T extends { id: number }>(
    repo: Repository<T>,
    raw: string | undefined,
    fieldName: string,
    textColumns: Array<keyof T>,
  ): Promise<number | null> {
    if (!raw) return null;
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n)) return n;
    const token = raw.trim().toLowerCase();
    const rows = await repo.find();
    for (const r of rows) {
      for (const c of textColumns) {
        const v = (r[c] as unknown as string | null | undefined)?.toString().trim().toLowerCase();
        if (v && v === token) return Number(r.id);
      }
    }
    throw new BadRequestException(`${fieldName}: no se encontró catálogo para «${raw}»`);
  }

  private async resolveProducerId(
    row: Record<string, string>,
    idField = 'producer_id',
    aliases: string[] = ['producer_codigo'],
  ): Promise<number> {
    const raw = this.pickValue(row, [idField, ...aliases]);
    const id = await this.resolveIdByText(this.producerRepo, raw, idField, ['codigo', 'nombre']);
    if (id == null) throw new BadRequestException(`${idField} es obligatorio`);
    return id;
  }

  private async resolveSpeciesId(
    row: Record<string, string>,
    idField = 'species_id',
    aliases: string[] = ['species_codigo'],
  ): Promise<number | null> {
    const raw = this.pickValue(row, [idField, ...aliases]);
    return this.resolveIdByText(this.speciesRepo, raw, idField, ['codigo', 'nombre']);
  }

  private async resolveVarietyId(
    row: Record<string, string>,
    idField = 'variety_id',
    aliases: string[] = ['variety_codigo'],
  ): Promise<number | null> {
    const raw = this.pickValue(row, [idField, ...aliases]);
    return this.resolveIdByText(this.varietyRepo, raw, idField, ['codigo', 'nombre']);
  }

  /**
   * Líneas de detalle sin `variety_id` (exportes legacy): usa la primera variedad activa de la especie por `id` ascendente.
   * Si hay más de una, es decisión determinista deliberada para carga masiva; si hace falta otra variedad, el CSV debe traer código/id explícito.
   */
  private async resolveVarietyFallbackForSpecies(speciesId: number): Promise<number | null> {
    const row = await this.varietyRepo.findOne({
      where: { species_id: speciesId, activo: true },
      order: { id: 'ASC' },
    });
    return row ? row.id : null;
  }

  private async resolveLineVarietyFromCsv(
    rawLineVar: string,
    speciesId: number | null,
    row: Record<string, string>,
  ): Promise<{ varietyId: number | null }> {
    let varietyId: number | null = null;
    if (rawLineVar.length > 0) {
      varietyId = await this.resolveIdByText(this.varietyRepo, rawLineVar, 'line_variety_id', ['codigo', 'nombre']);
    } else {
      varietyId = await this.resolveVarietyId(row, 'variety_id', ['variety_codigo']);
    }
    if (varietyId == null && speciesId != null) {
      varietyId = await this.resolveVarietyFallbackForSpecies(speciesId);
    }
    return { varietyId };
  }

  private async resolveQualityId(row: Record<string, string>): Promise<number | null> {
    const raw = this.pickValue(row, ['quality_grade_id', 'quality_codigo']);
    return this.resolveIdByText(this.qualityGradeRepo, raw, 'quality_grade_id', ['codigo', 'nombre']);
  }

  private async resolveContainerId(row: Record<string, string>): Promise<number | null> {
    const raw = this.pickValue(row, ['returnable_container_id', 'container_codigo']);
    return this.resolveIdByText(this.returnableContainerRepo, raw, 'returnable_container_id', ['tipo', 'capacidad']);
  }

  private async resolveMercadoId(row: Record<string, string>): Promise<number | null> {
    const raw = this.pickValue(row, ['mercado_id', 'mercado_codigo']);
    return this.resolveIdByText(this.mercadoRepo, raw, 'mercado_id', ['codigo', 'nombre']);
  }

  private async resolveDocumentStateId(row: Record<string, string>): Promise<number | null> {
    const raw = this.pickValue(row, ['document_state_id', 'estado']);
    return this.resolveIdByText(this.documentStateRepo, raw, 'document_state_id', ['codigo', 'nombre']);
  }

  private async resolveReceptionTypeId(row: Record<string, string>): Promise<number | null> {
    const raw = this.pickValue(row, ['reception_type_id', 'tipo']);
    return this.resolveIdByText(this.receptionTypeRepo, raw, 'reception_type_id', ['codigo', 'nombre']);
  }

  private async resolvePresentationFormatId(
    row: Record<string, string>,
    idField = 'presentation_format_id',
    aliases: string[] = ['format_code', 'format_codigo'],
  ): Promise<number | null> {
    const raw = this.pickValue(row, [idField, ...aliases]);
    return this.resolveIdByText(this.presentationFormatRepo, raw, idField, ['format_code', 'descripcion']);
  }

  private async resolveClientId(
    row: Record<string, string>,
    idField = 'cliente_id',
    aliases: string[] = ['cliente_nombre'],
  ): Promise<number | null> {
    const raw = this.pickValue(row, [idField, ...aliases]);
    return this.resolveIdByText(this.clientRepo, raw, idField, ['codigo', 'nombre']);
  }

  private async resolveClientIdRequired(
    row: Record<string, string>,
    idField = 'cliente_id',
    aliases: string[] = ['cliente_nombre'],
  ): Promise<number> {
    const id = await this.resolveClientId(row, idField, aliases);
    if (id == null) throw new BadRequestException(`${idField} es obligatorio`);
    return id;
  }

  private async resolveBrandId(row: Record<string, string>): Promise<number | null> {
    const raw = this.pickValue(row, ['brand_id', 'brand_codigo', 'brand_nombre']);
    if (!raw?.trim()) return null;
    const trimmed = raw.trim();
    const asInt = Number(trimmed);
    if (Number.isFinite(asInt) && Number.isInteger(asInt)) {
      const byId = await this.brandRepo.findOne({ where: { id: asInt } });
      if (byId) return Number(byId.id);
    }
    const token = trimmed.toLowerCase();
    /** Nombres del Excel histórico → código interno en `brands`. */
    const aliasCodigo: Record<string, string> = {
      freshwave: 'FW-CN',
      alpine: 'ALP-FB',
      pinebloom: 'PINEBLOOM',
      'pinebloom farms': 'PINEBLOOM',
    };
    const codigo = aliasCodigo[token];
    if (codigo) {
      const byCod = await this.brandRepo.findOne({ where: { codigo } });
      if (byCod) return Number(byCod.id);
    }
    const brands = await this.brandRepo.find();
    for (const b of brands) {
      const c = b.codigo?.trim().toLowerCase() ?? '';
      const n = b.nombre?.trim().toLowerCase() ?? '';
      if (c === token || n === token) return Number(b.id);
    }
    const prefixHits = brands.filter((b) => {
      const n = b.nombre?.trim().toLowerCase() ?? '';
      return n === token || n.startsWith(`${token} `);
    });
    if (prefixHits.length === 1) return Number(prefixHits[0].id);
    throw new BadRequestException(`brand_id: no se encontró catálogo para «${trimmed}»`);
  }

  /** Mismo layout que `importHistoricalDispatch` (CSV de plantilla despachos). */
  private async exportDispatchHistoricalRows(headers: string[]): Promise<string[][]> {
    const dispatches = await this.dispatchRepo.find({ order: { id: 'ASC' } });
    const out: string[][] = [];
    for (const d of dispatches) {
      const order = d.orden_id ? await this.salesOrderRepo.findOne({ where: { id: d.orden_id } }) : null;
      const inv = await this.invoiceRepo.findOne({ where: { dispatch_id: d.id } });
      const items = await this.dispatchTagItemRepo.find({ where: { dispatch_id: d.id } });
      const totalCajas = items.reduce((s, it) => s + Number(it.cajas_despachadas ?? 0), 0);
      const client = d.cliente_id ? await this.clientRepo.findOne({ where: { id: d.cliente_id } }) : null;
      const row: Record<string, unknown> = {
        order_reference: order?.order_number ?? '',
        fecha_despacho: d.fecha_despacho,
        numero_bol: d.numero_bol,
        total_cajas: totalCajas,
        total_amount: inv?.total != null ? String(inv.total) : '',
        cliente_nombre: client?.nombre ?? '',
        thermograph_serial: d.thermograph_serial ?? '',
        thermograph: d.thermograph_serial ?? '',
        temperatura_f: d.temperatura_f ?? '',
      };
      out.push(this.rowFromObject(headers, row));
    }
    return out;
  }

  private async exportRows(entityKey: ImportEntityKey, headers: string[]): Promise<string[][]> {
    switch (entityKey) {
      case 'receptions':
        return this.exportReceptionRows(headers);
      case 'sales-orders':
        return this.exportSalesOrderRows(headers);
      case 'processes':
        return this.exportSimpleRows(headers, await this.fruitProcessRepo.find({ order: { id: 'ASC' } }));
      case 'pt-tags':
        return this.exportSimpleRows(headers, await this.ptTagRepo.find({ order: { id: 'ASC' } }));
      case 'dispatches':
        return this.exportDispatchHistoricalRows(headers);
      case 'final-pallets':
        return this.exportSimpleRows(headers, await this.finalPalletRepo.find({ order: { id: 'ASC' } }));
      default:
        return [];
    }
  }

  private async exportReceptionRows(headers: string[]): Promise<string[][]> {
    const out: string[][] = [];
    const recs = await this.receptionRepo.find({ order: { id: 'ASC' } });
    for (const rec of recs) {
      const ref = rec.reference_code ?? `R-${rec.id}`;
      const lines = await this.receptionLineRepo.find({ where: { reception_id: rec.id }, order: { line_order: 'ASC', id: 'ASC' } });
      const base = this.rowFromObject(headers, { ...rec, reception_reference: ref });
      out.push(base);
      for (const ln of lines) {
        let container_codigo = '';
        if (ln.returnable_container_id) {
          const rc = await this.returnableContainerRepo.findOne({ where: { id: ln.returnable_container_id } });
          container_codigo = rc?.tipo?.trim() ?? '';
        }
        out.push(
          this.rowFromObject(headers, {
            reception_reference: ref,
            species_id: ln.species_id,
            line_variety_id: ln.variety_id,
            variety_id: ln.variety_id,
            quality_grade_id: ln.quality_grade_id ?? '',
            returnable_container_id: ln.returnable_container_id ?? '',
            container_codigo,
            quantity: ln.quantity ?? '',
            gross_lb: ln.gross_lb,
            tare_lb: ln.tare_lb,
            net_lb: ln.net_lb,
            temperature_f: ln.temperature_f ?? '',
            format_code: ln.format_code ?? '',
            multivariety_note: ln.multivariety_note ?? '',
          }),
        );
      }
    }
    return out;
  }

  private async exportSalesOrderRows(headers: string[]): Promise<string[][]> {
    const out: string[][] = [];
    const orders = await this.salesOrderRepo.find({ order: { id: 'ASC' } });
    for (const o of orders) {
      const ref = o.order_number;
      const headerRow: Record<string, unknown> = { ...o, order_reference: ref };
      headerRow.fecha_despacho = o.fecha_despacho_cliente ?? '';
      headerRow.estado = o.estado_comercial ?? '';
      out.push(this.rowFromObject(headers, headerRow));
      const lines = await this.salesOrderLineRepo.find({ where: { sales_order_id: o.id }, order: { sort_order: 'ASC', id: 'ASC' } });
      for (const ln of lines) {
        out.push(
          this.rowFromObject(headers, {
            order_reference: ref,
            presentation_format_id: ln.presentation_format_id,
            requested_boxes: ln.requested_boxes,
            unit_price: ln.unit_price ?? '',
            brand_id: ln.brand_id ?? '',
            variety_id: ln.variety_id ?? '',
          }),
        );
      }
    }
    return out;
  }

  private exportSimpleRows(headers: string[], rows: Array<Record<string, unknown> | object>): string[][] {
    return rows.map((r) => this.rowFromObject(headers, r));
  }

  private rowFromObject(headers: string[], obj: Record<string, unknown> | object): string[] {
    const rec = obj as Record<string, unknown>;
    return headers.map((h) => {
      const v = rec[h];
      if (v == null) return '';
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
  }
}

/**
 * Pesos / importes en CSV: coma o punto decimal y separadores de miles
 * (ej. 1200,5 · 1200.5 · 1.200,50 · 1,200.50).
 */
function parseImportDecimal(raw?: string): number | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  let normalized: string;
  if (lastComma !== -1 && lastComma > lastDot) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = t.replace(/,/g, '');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`Valor numérico inválido: «${t}»`);
  }
  return n;
}

function parseImportDecimalRequired(raw: string | undefined, fieldLabel: string): number {
  const n = parseImportDecimal(raw);
  if (n == null) {
    throw new BadRequestException(`Campo obligatorio vacío: ${fieldLabel}`);
  }
  return n;
}

function isBlankRecord(r: Record<string, string>): boolean {
  return Object.values(r).every((v) => v === '' || v === undefined || v === null);
}

function requiredString(row: Record<string, string>, key: string): string {
  const v = row[key]?.trim();
  if (!v) throw new BadRequestException(`Campo obligatorio vacío: ${key}`);
  return v;
}

function optionalString(v?: string): string | undefined {
  const t = v?.trim();
  return t === '' || t === undefined ? undefined : t;
}

function requiredInt(row: Record<string, string>, key: string): number {
  const v = row[key]?.trim();
  if (!v) throw new BadRequestException(`Campo obligatorio vacío: ${key}`);
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new BadRequestException(`${key} debe ser entero`);
  return n;
}

function parseOptionalInt(v?: string): number | null {
  const t = v?.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new BadRequestException(`Valor entero inválido`);
  return n;
}

/** Si el texto es un entero positivo válido, devuelve el número; si está vacío o no es entero, null (no lanza). */
function tryParsePositiveInt(v?: string): number | null {
  const t = v?.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

function requiredFloat(row: Record<string, string>, key: string): number {
  const v = row[key]?.trim();
  if (!v) throw new BadRequestException(`Campo obligatorio vacío: ${key}`);
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n)) throw new BadRequestException(`${key} debe ser numérico`);
  return n;
}

function optionalFloat(v?: string): number | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) throw new BadRequestException(`Valor numérico inválido`);
  return n;
}

function parseBoolLoose(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'si' || t === 'sí';
}

function requiredEnum<T extends Record<string, string>>(
  en: T,
  row: Record<string, string>,
  key: string,
): T[keyof T] {
  const v = requiredString(row, key).trim();
  const vals = Object.values(en);
  if (!vals.includes(v)) throw new BadRequestException(`${key} inválido: ${v}`);
  return v as T[keyof T];
}

function parseOptionalEnum<T extends Record<string, string>>(en: T, v?: string): T[keyof T] | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const vals = Object.values(en);
  if (!vals.includes(t)) throw new BadRequestException(`Valor enum inválido`);
  return t as T[keyof T];
}

function parseOptionalJsonRecord(s?: string): Record<string, number> | null | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  try {
    const o = JSON.parse(t) as Record<string, number>;
    return typeof o === 'object' && o !== null ? o : undefined;
  } catch {
    throw new BadRequestException('final_pallet_unit_prices debe ser JSON objeto');
  }
}

function parseOptionalDate(s?: string): Date | null | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('fecha inválida');
  return d;
}

/** Montos con miles europeos (3.217.903,50) o US (3,217,903.50). */
function normalizeDecimalStringForImport(raw: string): string {
  const t = raw.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!t) return '';
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) {
    return t.replace(/\./g, '').replace(',', '.');
  }
  if (lastDot > lastComma) {
    return t.replace(/,/g, '');
  }
  if (lastComma >= 0) {
    return t.replace(',', '.');
  }
  return t;
}

function parseImportMoney(raw: string, field?: string): number {
  const label = field ? `${field}: ` : '';
  const t = raw.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!t) throw new BadRequestException(`${label}valor requerido`);
  const normalized = normalizeDecimalStringForImport(raw);
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`${label}monto inválido: ${raw.trim()}`);
  }
  return n;
}

function parseImportMoneyOptional(raw?: string): number | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  return parseImportMoney(t);
}

/** Enteros con agrupación de miles (67.377 o 67,377). */
function parseImportIntGrouped(raw: string, field?: string): number {
  const label = field ? `${field}: ` : '';
  const t = raw.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!t) throw new BadRequestException(`${label}valor entero requerido`);
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const n = Number(t.replace(/\./g, ''));
    if (!Number.isFinite(n)) throw new BadRequestException(`${label}entero inválido: ${raw.trim()}`);
    return n;
  }
  if (/^\d{1,3}(,\d{3})+$/.test(t)) {
    const n = Number(t.replace(/,/g, ''));
    if (!Number.isFinite(n)) throw new BadRequestException(`${label}entero inválido: ${raw.trim()}`);
    return n;
  }
  const normalized = normalizeDecimalStringForImport(t);
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`${label}entero inválido: ${raw.trim()}`);
  }
  return Math.round(n);
}

function extractErrorMessage(e: unknown): string {
  if (e instanceof BadRequestException) {
    const r = e.getResponse();
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object' && 'message' in r) {
      const m = (r as { message?: string | string[] }).message;
      return Array.isArray(m) ? m.join('; ') : String(m ?? e.message);
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function extractFieldHint(_e: unknown): string | undefined {
  return undefined;
}
