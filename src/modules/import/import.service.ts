import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { FinalPallet } from '../final-pallet/final-pallet.entities';
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
    @InjectRepository(FruitProcess) private readonly fruitProcessRepo: Repository<FruitProcess>,
    @InjectRepository(PtTag) private readonly ptTagRepo: Repository<PtTag>,
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
    let skipped = 0;

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
            await this.importProcessRow(record);
            break;
          case 'pt-tags':
            await this.importPtTagRow(record);
            break;
          case 'final-pallets':
            await this.importFinalPalletRow(record);
            break;
          default:
            throw new BadRequestException('Entidad no soportada');
        }
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

    return { total, inserted, skipped, errors };
  }

  private async runReceptionImport(
    rows: Array<{ lineNumber: number; record: Record<string, string> }>,
    username: string,
    entityKey: ImportEntityKey,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    let inserted = 0;
    let skipped = 0;
    const grouped = this.groupRowsByReference(rows, ['reception_reference', 'reference', 'referencia']);

    for (const group of grouped) {
      if (!group.length) continue;
      if (group.length === 1 && !this.hasReferenceValue(group[0].record, ['reception_reference', 'reference', 'referencia'])) {
        const { lineNumber, record } = group[0];
        if (isBlankRecord(record)) {
          skipped++;
          continue;
        }
        try {
          await this.importReceptionRow(record);
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
    return { total, inserted, skipped, errors };
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
    return { total, inserted, skipped, errors };
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
    return { total, inserted, skipped, errors };
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
    const header = group.find((g) => this.isReceptionHeaderRow(g.record))?.record ?? group[0].record;
    const lineRows = group.filter((g) => this.isReceptionLineRow(g.record)).map((g) => g.record);
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
      gross_weight_lb: optionalFloat(header.gross_weight_lb),
      net_weight_lb: optionalFloat(header.net_weight_lb),
      notes: optionalString(header.notes),
      plant_code: optionalString(header.plant_code),
      lbs_reference: optionalFloat(header.lbs_reference),
      lbs_difference: optionalFloat(header.lbs_difference),
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
      Boolean(optionalString(row.net_lb))
    );
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
      gross_lb: optionalFloat(row.gross_lb),
      tare_lb: optionalFloat(row.tare_lb),
      net_lb: requiredFloat(row, 'net_lb'),
      temperature_f: optionalFloat(row.temperature_f),
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
      fecha_despacho_cliente: optionalString(header.fecha_despacho),
      estado_comercial: optionalString(header.estado),
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
      gross_weight_lb: optionalFloat(row.gross_weight_lb),
      net_weight_lb: optionalFloat(row.net_weight_lb),
      notes: optionalString(row.notes),
      plant_code: optionalString(row.plant_code),
      lbs_reference: optionalFloat(row.lbs_reference),
      lbs_difference: optionalFloat(row.lbs_difference),
      document_state_id: dsId ?? borrador.id,
      reception_type_id: (await this.resolveReceptionTypeId(row)) ?? undefined,
      mercado_id: (await this.resolveMercadoId(row)) ?? undefined,
      weight_basis: optionalString(row.weight_basis),
      quality_intent: optionalString(row.quality_intent),
    };

    await this.traceability.createReception(dto);
  }

  private async importProcessRow(row: Record<string, string>): Promise<void> {
    const lbAlloc = requiredFloat(row, 'peso_procesado_lb');
    const producerId = requiredInt(row, 'productor_id');
    const varietyId = await this.resolveVarietyId(row, 'variedad_id', ['variety_codigo', 'line_variety_id']);
    if (varietyId == null) throw new BadRequestException('variedad_id es obligatorio');
    const receptionLineIds = await this.resolveReceptionLineIdsForProcess(row);
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
    const created = await this.fruitProcessRepo.manager.transaction(async (em) => {
      const proc = em.create(FruitProcess, {
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
        nota: optionalString(row.nota),
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

  private async resolveReceptionLineIdsForProcess(row: Record<string, string>): Promise<number[]> {
    const raw = requiredString(row, 'reception_reference');
    const refs = raw
      .split('|')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    if (!refs.length) throw new BadRequestException('reception_reference vacío');

    const lineIds: number[] = [];
    for (const ref of refs) {
      const rec =
        (await this.receptionRepo.findOne({
          where: { reference_code: ref },
          order: { id: 'ASC' },
        })) ??
        (await this.receptionRepo.findOne({
          where: { document_number: ref },
          order: { id: 'ASC' },
        }));

      if (!rec) {
        throw new BadRequestException(`reception_reference no encontrada: ${ref}`);
      }
      const ln = await this.receptionLineRepo.findOne({
        where: { reception_id: rec.id },
        order: { line_order: 'ASC', id: 'ASC' },
      });
      if (!ln) {
        throw new BadRequestException(`Recepción ${ref} sin líneas`);
      }
      lineIds.push(ln.id);
    }
    return lineIds;
  }

  private async resolveProcessMachineIdOrDefaultOne(rawId: number | null): Promise<number> {
    const desired = rawId ?? 1;
    const found = await this.processMachineRepo.findOne({ where: { id: desired } });
    if (found) return found.id;
    const fallback = await this.processMachineRepo.findOne({ where: { id: 1 } });
    if (!fallback) throw new BadRequestException('No existe process_machine_id=1 para fallback');
    return fallback.id;
  }

  private async importPtTagRow(row: Record<string, string>): Promise<void> {
    if (optionalString(row.pallet_id_origen)) {
      await this.importHistoricalPtTagRow(row);
      return;
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

    const upd: Partial<PtTag> = {};
    if (row.tag_code?.trim()) {
      const code = row.tag_code.trim();
      const dup = await this.ptTagRepo.findOne({ where: { tag_code: code } });
      if (dup && dup.id !== created.id) {
        throw new BadRequestException(`tag_code duplicado: ${code}`);
      }
      upd.tag_code = code;
    }
    if (row.total_cajas?.trim()) upd.total_cajas = requiredInt(row, 'total_cajas');
    if (row.total_pallets?.trim()) upd.total_pallets = requiredInt(row, 'total_pallets');
    if (row.net_weight_lb?.trim()) upd.net_weight_lb = row.net_weight_lb.trim();

    if (Object.keys(upd).length) {
      await this.ptTagRepo.update(created.id, upd);
      await this.process.refreshPtTagStockAfterImport(created.id);
    }
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
      fecha_despacho_cliente: optionalString(row.fecha_despacho),
      estado_comercial: optionalString(row.estado),
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
        return this.exportSimpleRows(headers, await this.dispatchRepo.find({ order: { id: 'ASC' } }));
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
        out.push(
          this.rowFromObject(headers, {
            reception_reference: ref,
            species_id: ln.species_id,
            line_variety_id: ln.variety_id,
            variety_id: ln.variety_id,
            quality_grade_id: ln.quality_grade_id ?? '',
            returnable_container_id: ln.returnable_container_id ?? '',
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
      out.push(this.rowFromObject(headers, { ...o, order_reference: ref }));
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
