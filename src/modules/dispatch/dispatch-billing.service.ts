import { toJsonRecord } from '../../common/to-json-record';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull } from 'typeorm';
import { Repository } from 'typeorm';
import { FinalPallet } from '../final-pallet/final-pallet.entities';
import { FinalPalletService, type UnidadPtTraceability } from '../final-pallet/final-pallet.service';
import { FinishedPtInventory } from '../final-pallet/finished-pt-inventory.entity';
import { Brand, Client, FinishedPtStock } from '../traceability/operational.entities';
import { PresentationFormat, Variety } from '../traceability/traceability.entities';
import { FruitProcess, PtTag } from '../process/process.entities';
import {
  AddDispatchTagDto,
  AddManualInvoiceLineDto,
  AttachFinalPalletsDto,
  CreateDispatchDto,
  CreateSalesOrderDto,
  HistoricalDispatchImportInput,
  ModifySalesOrderDto,
  SalesOrderLineInputDto,
  UpdateDispatchBolDto,
  UpdateDispatchMetaDto,
  UpdateDispatchOrderLinkDto,
  UpdateDispatchUnitPricesDto,
} from './dispatch.dto';
import { PtPackingList, PtPackingListItem } from '../pt-packing-list/pt-packing-list.entities';
import { groupFinalPalletsForCommercialInvoice } from './commercial-invoice-lines';
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
} from './dispatch.entities';

function isoOrNull(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString();
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function mapInvoiceLine(it: InvoiceItem) {
  return {
    id: it.id,
    tarja_id: it.tarja_id != null ? Number(it.tarja_id) : null,
    final_pallet_id: it.final_pallet_id != null ? Number(it.final_pallet_id) : null,
    fruit_process_id: it.fruit_process_id != null ? Number(it.fruit_process_id) : null,
    traceability_note: it.traceability_note ?? null,
    traceability_ok:
      it.is_manual ||
      (it.tarja_id != null && Number(it.tarja_id) > 0) ||
      (it.fruit_process_id != null && Number(it.fruit_process_id) > 0),
    cajas: it.cajas,
    unit_price: it.unit_price,
    line_subtotal: it.line_subtotal,
    pallet_cost_total: it.pallet_cost_total,
    is_manual: it.is_manual,
    species_id: it.species_id != null ? Number(it.species_id) : null,
    variety_id: it.variety_id != null ? Number(it.variety_id) : null,
    packaging_code: it.packaging_code,
    brand: it.brand,
    trays: it.trays,
    pounds: it.pounds,
    packing_list_ref: it.packing_list_ref,
    manual_description: it.manual_description ?? null,
    manual_line_kind: it.manual_line_kind ?? null,
  };
}

function enrichInvoiceLine(
  it: InvoiceItem,
  tagCodeByTarjaId: Map<number, string>,
  traceByPalletId: Map<number, UnidadPtTraceability>,
) {
  const base = mapInvoiceLine(it);
  const tid = it.tarja_id != null ? Number(it.tarja_id) : null;
  const pid = it.final_pallet_id != null ? Number(it.final_pallet_id) : null;
  let codigo_unidad_pt_display: string | null = null;
  if (tid != null && tid > 0) {
    codigo_unidad_pt_display = tagCodeByTarjaId.get(tid)?.trim() ?? null;
  }
  if (!codigo_unidad_pt_display && pid != null && pid > 0) {
    codigo_unidad_pt_display = traceByPalletId.get(pid)?.codigo_unidad_pt_display?.trim() ?? null;
  }
  return {
    ...base,
    tag_code: codigo_unidad_pt_display,
    codigo_unidad_pt_display,
  };
}

@Injectable()
export class DispatchBillingService {
  constructor(
    private readonly finalPalletService: FinalPalletService,
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly soLineRepo: Repository<SalesOrderLine>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Variety) private readonly varietyRepo: Repository<Variety>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(DispatchTagItem) private readonly dtiRepo: Repository<DispatchTagItem>,
    @InjectRepository(PackingList) private readonly plRepo: Repository<PackingList>,
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly invItemRepo: Repository<InvoiceItem>,
    @InjectRepository(SalesOrderModification) private readonly soModRepo: Repository<SalesOrderModification>,
    @InjectRepository(PtTag) private readonly ptTagRepo: Repository<PtTag>,
    @InjectRepository(FinishedPtStock) private readonly finishedPtRepo: Repository<FinishedPtStock>,
    @InjectRepository(FinishedPtInventory) private readonly finishedPtInventoryRepo: Repository<FinishedPtInventory>,
    @InjectRepository(FinalPallet) private readonly fpRepo: Repository<FinalPallet>,
    @InjectRepository(PresentationFormat) private readonly formatRepo: Repository<PresentationFormat>,
    @InjectRepository(DispatchPtPackingList) private readonly dispatchPlRepo: Repository<DispatchPtPackingList>,
    @InjectRepository(PtPackingList) private readonly ptPlRepo: Repository<PtPackingList>,
    @InjectRepository(PtPackingListItem) private readonly ptPlItemRepo: Repository<PtPackingListItem>,
    @InjectRepository(FruitProcess) private readonly fruitProcessRepo: Repository<FruitProcess>,
  ) {}

  private async dispatchPlIds(dispatchId: number): Promise<number[]> {
    const rows = await this.dispatchPlRepo.find({ where: { dispatch_id: dispatchId } });
    return rows.map((r) => Number(r.pt_packing_list_id));
  }

  private normalizeDispatchBol(s: string): string {
    const t = s.trim();
    if (!t) throw new BadRequestException('El BOL no puede estar vacío.');
    return t;
  }

  /** Si hay más de un BOL distinto entre PLs (no vacíos), error. */
  private resolveInheritedBolFromPls(pls: PtPackingList[]): string | null {
    const vals = [...new Set(pls.map((p) => (p.numero_bol?.trim() ?? '')).filter(Boolean))];
    if (vals.length > 1) {
      throw new BadRequestException(
        `Los packing lists tienen BOL distintos (${vals.join(', ')}). Unificá el BOL en cada PL o indicá un BOL explícito en el despacho (solo despacho).`,
      );
    }
    return vals.length === 1 ? vals[0]! : null;
  }

  private async assertNotPlDispatch(dispatchId: number, action: string) {
    const n = await this.dispatchPlRepo.count({ where: { dispatch_id: dispatchId } });
    if (n > 0) {
      throw new BadRequestException(
        `Este despacho agrupa packing lists PT (solo logística, sin movimiento de stock aquí). ${action}`,
      );
    }
  }

  /** Pallets finales incluidos vía packing lists confirmados (sin usar fp.dispatch_id). */
  private async finalPalletsFromPtPackingLists(dispatchId: number): Promise<FinalPallet[]> {
    const plIds = await this.dispatchPlIds(dispatchId);
    if (!plIds.length) return [];
    const items = await this.ptPlItemRepo.find({ where: { packing_list_id: In(plIds) } });
    const fpIds = [...new Set(items.map((i) => Number(i.final_pallet_id)))];
    if (!fpIds.length) return [];
    return this.fpRepo.find({
      where: { id: In(fpIds) },
      relations: ['presentation_format'],
      order: { id: 'ASC' },
    });
  }

  private boxWeightFromCode(formatCode: string) {
    const m = /^(\d+)x(\d+)oz$/i.exec(formatCode);
    if (!m) throw new BadRequestException('format_code inválido');
    return (Number(m[1]) * Number(m[2])) / 16;
  }

  /** Misma lógica que en process.service (peso neto por caja para PT). */
  private async netLbPerBox(formatCode: string): Promise<number> {
    const fc = (formatCode ?? '').trim().toLowerCase();
    const row = await this.formatRepo
      .createQueryBuilder('pf')
      .where('LOWER(pf.format_code) = :fc', { fc })
      .getOne();
    if (row && Number(row.net_weight_lb_per_box) > 0) {
      return Number(row.net_weight_lb_per_box);
    }
    return this.boxWeightFromCode(formatCode);
  }

  private async assertSalesOrderLineRefs(lines: SalesOrderLineInputDto[]) {
    const fmtIds = [...new Set(lines.map((l) => l.presentation_format_id))];
    const formats = await this.formatRepo.findBy({ id: In(fmtIds) });
    if (formats.length !== fmtIds.length) {
      throw new BadRequestException('Uno o más formatos de presentación no existen.');
    }
    const brandIds = [
      ...new Set(lines.map((l) => l.brand_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    if (brandIds.length) {
      const n = await this.brandRepo.count({ where: { id: In(brandIds) } });
      if (n !== brandIds.length) throw new BadRequestException('Marca inválida.');
    }
    const varietyIds = [
      ...new Set(lines.map((l) => l.variety_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    if (varietyIds.length) {
      const n = await this.varietyRepo.count({ where: { id: In(varietyIds) } });
      if (n !== varietyIds.length) throw new BadRequestException('Variedad inválida.');
    }
  }

  private async computeOrderTotalsFromLineInputs(
    lines: Array<{ presentation_format_id: number; requested_boxes: number }>,
  ) {
    let totalBoxes = 0;
    let estimatedPallets = 0;
    const formatIds = [...new Set(lines.map((l) => l.presentation_format_id))];
    const formats = await this.formatRepo.findBy({ id: In(formatIds) });
    const byId = new Map(formats.map((f) => [f.id, f]));
    for (const line of lines) {
      totalBoxes += line.requested_boxes;
      const f = byId.get(line.presentation_format_id);
      if (!f) continue;
      const max = f.max_boxes_per_pallet;
      if (max != null && max > 0) {
        estimatedPallets += Math.ceil(line.requested_boxes / max);
      }
    }
    return { totalBoxes, estimatedPallets };
  }

  /** Nombres desde maestro `clients` (ids de `cliente_id` / `client_id` comercial). */
  private async clientNombresByIds(ids: Iterable<number>): Promise<Map<number, string>> {
    const uniq = [...new Set([...ids].filter((x) => Number.isFinite(x) && x > 0))];
    if (!uniq.length) return new Map();
    const rows = await this.clientRepo.findBy({ id: In(uniq) });
    return new Map(rows.map((c) => [c.id, c.nombre.trim()]));
  }

  private mapSalesOrderToRow(o: SalesOrder, clienteNombreById: Map<number, string>) {
    const rawLines = o.lines ?? [];
    const lines = [...rawLines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        id: l.id,
        presentation_format_id: Number(l.presentation_format_id),
        format_code: l.presentation_format?.format_code ?? null,
        requested_boxes: l.requested_boxes,
        unit_price: l.unit_price != null ? Number(l.unit_price) : null,
        brand_id: l.brand_id != null ? Number(l.brand_id) : null,
        brand_nombre: l.brand?.nombre ?? null,
        variety_id: l.variety_id != null ? Number(l.variety_id) : null,
        variety_nombre: l.variety?.nombre ?? null,
        sort_order: l.sort_order,
      }));
    return {
      id: o.id,
      order_number: o.order_number,
      cliente_id: Number(o.cliente_id),
      cliente_nombre: clienteNombreById.get(Number(o.cliente_id)) ?? null,
      requested_pallets: o.requested_pallets,
      requested_boxes: o.requested_boxes,
      lines,
    };
  }

  private async replaceOrderLines(orderId: number, lineDtos: SalesOrderLineInputDto[]) {
    await this.soLineRepo.delete({ sales_order_id: orderId });
    let sort = 0;
    for (const l of lineDtos) {
      const unitPrice =
        l.unit_price === null || l.unit_price === undefined ? null : String(l.unit_price);
      const brandId = l.brand_id != null && Number(l.brand_id) > 0 ? Number(l.brand_id) : null;
      const varietyId = l.variety_id != null && Number(l.variety_id) > 0 ? Number(l.variety_id) : null;
      await this.soLineRepo.save(
        this.soLineRepo.create({
          sales_order_id: orderId,
          presentation_format_id: l.presentation_format_id,
          requested_boxes: l.requested_boxes,
          unit_price: unitPrice,
          brand_id: brandId,
          variety_id: varietyId,
          sort_order: sort++,
        }),
      );
    }
  }

  private async syncOrderTotalsFromLines(orderId: number) {
    const lines = await this.soLineRepo.find({ where: { sales_order_id: orderId } });
    const inputs = lines.map((l) => ({
      presentation_format_id: Number(l.presentation_format_id),
      requested_boxes: l.requested_boxes,
    }));
    const { totalBoxes, estimatedPallets } = await this.computeOrderTotalsFromLineInputs(inputs);
    await this.soRepo.update(orderId, { requested_boxes: totalBoxes, requested_pallets: estimatedPallets });
  }

  async listSalesOrders() {
    const rows = await this.soRepo.find({
      order: { id: 'DESC' },
      take: 400,
      relations: ['lines', 'lines.presentation_format', 'lines.brand', 'lines.variety'],
    });
    const clienteNombreById = await this.clientNombresByIds(rows.map((r) => Number(r.cliente_id)));
    return rows.map((o) => this.mapSalesOrderToRow(o, clienteNombreById));
  }

  async listDispatchesWithItems() {
    const dispatches = await this.dispatchRepo.find({ order: { id: 'DESC' }, take: 400 });
    const dispIds = dispatches.map((d) => d.id);

    const allLinks = dispIds.length > 0 ? await this.dispatchPlRepo.find({ where: { dispatch_id: In(dispIds) } }) : [];
    const plIdsByDisp = new Map<number, number[]>();
    for (const l of allLinks) {
      const did = Number(l.dispatch_id);
      const arr = plIdsByDisp.get(did) ?? [];
      arr.push(Number(l.pt_packing_list_id));
      plIdsByDisp.set(did, arr);
    }
    const distinctPlIds = [...new Set(allLinks.map((x) => Number(x.pt_packing_list_id)))];
    const allPtItems =
      distinctPlIds.length > 0
        ? await this.ptPlItemRepo.find({ where: { packing_list_id: In(distinctPlIds) } })
        : [];
    const fpIdsByDispatch = new Map<number, Set<number>>();
    for (const l of allLinks) {
      const did = Number(l.dispatch_id);
      const plid = Number(l.pt_packing_list_id);
      let set = fpIdsByDispatch.get(did);
      if (!set) {
        set = new Set<number>();
        fpIdsByDispatch.set(did, set);
      }
      for (const it of allPtItems) {
        if (Number(it.packing_list_id) === plid) set.add(Number(it.final_pallet_id));
      }
    }
    const allFpIdsFromPl = [...new Set([...fpIdsByDispatch.values()].flatMap((s) => [...s]))];
    const fpFromPlRows =
      allFpIdsFromPl.length > 0
        ? await this.fpRepo.find({
            where: { id: In(allFpIdsFromPl) },
            relations: ['presentation_format'],
            order: { id: 'ASC' },
          })
        : [];
    const fpById = new Map(fpFromPlRows.map((fp) => [fp.id, fp]));
    const ptPlMeta = distinctPlIds.length > 0 ? await this.ptPlRepo.findBy({ id: In(distinctPlIds) }) : [];
    const ptPlById = new Map(ptPlMeta.map((p) => [p.id, p]));

    const fpRows =
      dispIds.length > 0
        ? await this.fpRepo.find({
            where: { dispatch_id: In(dispIds) },
            relations: ['presentation_format'],
            order: { id: 'ASC' },
          })
        : [];
    const fpByDisp = new Map<number, FinalPallet[]>();
    for (const fp of fpRows) {
      const did = Number(fp.dispatch_id);
      const arr = fpByDisp.get(did) ?? [];
      arr.push(fp);
      fpByDisp.set(did, arr);
    }
    const tagItems = await this.dtiRepo.find({ order: { id: 'ASC' } });
    const pls = await this.plRepo.find();
    const invs = await this.invRepo.find();
    const allInvLines = await this.invItemRepo.find({ order: { id: 'ASC' } });
    /** Claves normalizadas: invoice_id es bigint en DB y puede llegar como string; inv.id es number → Map.get fallaba. */
    const linesByInvoiceId = new Map<number, InvoiceItem[]>();
    for (const li of allInvLines) {
      const iid = Number(li.invoice_id);
      const arr = linesByInvoiceId.get(iid) ?? [];
      arr.push(li);
      linesByInvoiceId.set(iid, arr);
    }
    const plByDisp = new Map(pls.map((p) => [Number(p.dispatch_id), p]));
    const invByDisp = new Map(invs.map((i) => [Number(i.dispatch_id), i]));

    const dispatchClientIds = new Set<number>();
    for (const d of dispatches) {
      dispatchClientIds.add(Number(d.cliente_id));
      if (d.client_id != null && Number(d.client_id) > 0) dispatchClientIds.add(Number(d.client_id));
    }
    const clientNombreById = await this.clientNombresByIds(dispatchClientIds);

    const unionFpIds = new Set<number>();
    const unionTarjaIds = new Set<number>();
    for (const d of dispatches) {
      const plIdsForD = plIdsByDisp.get(d.id) ?? [];
      const fpIdSet = fpIdsByDispatch.get(d.id);
      const finalPalletsFromPl =
        fpIdSet != null && fpIdSet.size > 0
          ? [...fpIdSet]
              .sort((a, b) => a - b)
              .map((fid) => fpById.get(fid))
              .filter((fp): fp is FinalPallet => fp != null)
          : [];
      const legacyFps = fpByDisp.get(d.id) ?? [];
      const finalPalletsDisplay = plIdsForD.length > 0 ? finalPalletsFromPl : legacyFps;
      for (const fp of finalPalletsDisplay) unionFpIds.add(Number(fp.id));
    }
    for (const li of allInvLines) {
      if (li.final_pallet_id != null && Number(li.final_pallet_id) > 0) {
        unionFpIds.add(Number(li.final_pallet_id));
      }
      if (li.tarja_id != null && Number(li.tarja_id) > 0) {
        unionTarjaIds.add(Number(li.tarja_id));
      }
    }
    for (const ti of tagItems) {
      unionTarjaIds.add(Number(ti.tarja_id));
    }

    const traceByPalletId =
      unionFpIds.size > 0
        ? await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds([...unionFpIds])
        : new Map<number, UnidadPtTraceability>();
    const tarjaIdList = [...unionTarjaIds].filter((x) => x > 0);
    const tagRows =
      tarjaIdList.length > 0
        ? await this.ptTagRepo.find({ where: { id: In(tarjaIdList) }, select: ['id', 'tag_code'] })
        : [];
    const tagCodeByTarjaId = new Map<number, string>();
    for (const t of tagRows) {
      const c = (t.tag_code ?? '').trim();
      if (c) tagCodeByTarjaId.set(Number(t.id), c);
    }

    return dispatches.map((d) => {
      const pl = plByDisp.get(d.id);
      const inv = invByDisp.get(d.id);
      const plIdsForD = plIdsByDisp.get(d.id) ?? [];
      const fpIdSet = fpIdsByDispatch.get(d.id);
      const finalPalletsFromPl =
        fpIdSet != null && fpIdSet.size > 0
          ? [...fpIdSet]
              .sort((a, b) => a - b)
              .map((fid) => fpById.get(fid))
              .filter((fp): fp is FinalPallet => fp != null)
          : [];
      const legacyFps = fpByDisp.get(d.id) ?? [];
      const finalPalletsDisplay = plIdsForD.length > 0 ? finalPalletsFromPl : legacyFps;
      return {
        id: d.id,
        orden_id: Number(d.orden_id),
        cliente_id: Number(d.cliente_id),
        cliente_nombre: clientNombreById.get(Number(d.cliente_id)) ?? null,
        client_id: d.client_id != null ? Number(d.client_id) : null,
        client_nombre:
          d.client_id != null && Number(d.client_id) > 0 ? clientNombreById.get(Number(d.client_id)) ?? null : null,
        fecha_despacho: d.fecha_despacho,
        numero_bol: d.numero_bol,
        bol_origin: d.bol_origin ?? 'manual_entry',
        temperatura_f: d.temperatura_f,
        thermograph_serial: d.thermograph_serial ?? null,
        thermograph_notes: d.thermograph_notes ?? null,
        status: d.status ?? 'despachado',
        confirmed_at: isoOrNull(d.dispatch_confirmed_at ?? null),
        despachado_at: isoOrNull(d.dispatch_despachado_at ?? null),
        kind: plIdsForD.length > 0 ? 'packing_lists' : 'legacy',
        pt_packing_lists: plIdsForD.map((plid) => ({
          id: plid,
          list_code: ptPlById.get(plid)?.list_code ?? `PL-${plid}`,
          numero_bol: ptPlById.get(plid)?.numero_bol?.trim() || null,
        })),
        final_pallet_unit_prices: d.final_pallet_unit_prices ?? null,
        final_pallets: finalPalletsDisplay.map((fp) => {
          const tr = traceByPalletId.get(Number(fp.id));
          return {
            id: fp.id,
            corner_board_code: fp.corner_board_code,
            presentation_format_id: fp.presentation_format_id != null ? Number(fp.presentation_format_id) : null,
            format_code: fp.presentation_format?.format_code ?? null,
            codigo_unidad_pt_display: tr?.codigo_unidad_pt_display ?? null,
            tag_code: tr?.unidad_pt_codigos?.[0] ?? null,
            trazabilidad_pt: tr?.trazabilidad_pt ?? 'sin_trazabilidad',
          };
        }),
        items: tagItems
          .filter((i) => Number(i.dispatch_id) === d.id)
          .map((i) => {
            const tid = Number(i.tarja_id);
            return {
              id: i.id,
              tarja_id: tid,
              tag_code: tagCodeByTarjaId.get(tid) ?? null,
              cajas_despachadas: i.cajas_despachadas,
              pallets_despachados: i.pallets_despachados,
              unit_price: i.unit_price,
              pallet_cost: i.pallet_cost,
            };
          }),
        packing_list: pl ? { id: pl.id, packing_number: pl.packing_number } : null,
        invoice: inv
          ? {
              id: inv.id,
              invoice_number: inv.invoice_number,
              subtotal: inv.subtotal,
              total_cost: inv.total_cost,
              total: inv.total,
              lines: (linesByInvoiceId.get(Number(inv.id)) ?? []).map((li) =>
                enrichInvoiceLine(li, tagCodeByTarjaId, traceByPalletId),
              ),
            }
          : null,
      };
    });
  }

  private async recalculateInvoiceTotals(invoiceId: number) {
    const items = await this.invItemRepo.find({ where: { invoice_id: invoiceId } });
    let subtotal = 0;
    let totalCost = 0;
    for (const it of items) {
      subtotal += Number(it.line_subtotal);
      totalCost += Number(it.pallet_cost_total);
    }
    await this.invRepo.update(invoiceId, {
      subtotal: subtotal.toFixed(2),
      total_cost: totalCost.toFixed(2),
      total: subtotal.toFixed(2),
    });
  }

  async createSalesOrder(dto: CreateSalesOrderDto) {
    await this.assertSalesOrderLineRefs(dto.lines);
    const seq = (await this.soRepo.count()) + 1;
    let orderNumber = `SO-${String(seq).padStart(5, '0')}`;
    if (dto.order_number !== undefined && dto.order_number.trim() !== '') {
      const custom = dto.order_number.trim();
      const dup = await this.soRepo.findOne({ where: { order_number: custom } });
      if (dup) {
        throw new BadRequestException(`Ya existe un pedido con la referencia «${custom}». Elegí otro código o dejá el campo vacío para usar un número automático.`);
      }
      orderNumber = custom;
    }
    const order = await this.soRepo.save(
      this.soRepo.create({
        cliente_id: dto.cliente_id,
        requested_pallets: 0,
        requested_boxes: 0,
        order_number: orderNumber,
        fecha_pedido:
          dto.fecha_pedido !== undefined && String(dto.fecha_pedido ?? '').trim() !== ''
            ? new Date(dto.fecha_pedido!)
            : null,
        fecha_despacho_cliente:
          dto.fecha_despacho_cliente !== undefined && String(dto.fecha_despacho_cliente ?? '').trim() !== ''
            ? new Date(dto.fecha_despacho_cliente!)
            : null,
        estado_comercial: dto.estado_comercial?.trim() ? dto.estado_comercial.trim().slice(0, 24) : null,
      }),
    );
    await this.replaceOrderLines(order.id, dto.lines);
    await this.syncOrderTotalsFromLines(order.id);
    const full = await this.soRepo.findOne({
      where: { id: order.id },
      relations: ['lines', 'lines.presentation_format', 'lines.brand', 'lines.variety'],
    });
    if (!full) throw new NotFoundException('Orden no encontrada');
    const nm = await this.clientNombresByIds([Number(full.cliente_id)]);
    return this.mapSalesOrderToRow(full, nm);
  }

  async modifySalesOrder(orderId: number, dto: ModifySalesOrderDto) {
    const order = await this.soRepo.findOne({
      where: { id: orderId },
      relations: ['lines', 'lines.presentation_format', 'lines.brand', 'lines.variety'],
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const nameMapBefore = await this.clientNombresByIds([Number(order.cliente_id)]);
    const before = toJsonRecord(this.mapSalesOrderToRow(order, nameMapBefore));

    if (dto.order_number !== undefined) {
      const next = dto.order_number.trim();
      if (!next) {
        throw new BadRequestException('El nombre del pedido no puede quedar vacío.');
      }
      const dup = await this.soRepo.findOne({ where: { order_number: next } });
      if (dup && Number(dup.id) !== orderId) {
        throw new BadRequestException(`Ya existe otro pedido con la referencia «${next}».`);
      }
      if (order.order_number !== next) {
        order.order_number = next;
        await this.soRepo.save(order);
      }
    }
    await this.assertSalesOrderLineRefs(dto.lines);
    await this.replaceOrderLines(orderId, dto.lines);
    await this.syncOrderTotalsFromLines(orderId);
    const afterOrder = await this.soRepo.findOne({
      where: { id: orderId },
      relations: ['lines', 'lines.presentation_format', 'lines.brand', 'lines.variety'],
    });
    if (!afterOrder) throw new NotFoundException('Orden no encontrada');
    const nameMapAfter = await this.clientNombresByIds([Number(afterOrder.cliente_id)]);
    await this.soModRepo.save(
      this.soModRepo.create({
        order_id: orderId,
        before_payload: before,
        after_payload: toJsonRecord(this.mapSalesOrderToRow(afterOrder, nameMapAfter)),
      }),
    );

    const dispatches = await this.dispatchRepo.find({ where: { orden_id: orderId } });
    for (const d of dispatches) {
      await this.generatePackingList(d.id);
      await this.generateInvoice(d.id);
    }
    return this.mapSalesOrderToRow(afterOrder, nameMapAfter);
  }

  async createDispatch(dto: CreateDispatchDto) {
    const plIds = [...new Set(dto.pt_packing_list_ids.map(Number))].filter((id) => Number.isFinite(id) && id > 0);
    if (plIds.length < 1) {
      throw new BadRequestException('Indicá al menos un packing list PT confirmado.');
    }

    const pls = await this.ptPlRepo.findBy({ id: In(plIds) });
    if (pls.length !== plIds.length) {
      throw new BadRequestException('Uno o más packing lists PT no existen.');
    }
    for (const pl of pls) {
      if (pl.status !== 'confirmado') {
        throw new BadRequestException(`Packing list ${pl.list_code}: debe estar confirmado (actual: ${pl.status}).`);
      }
    }
    const taken = await this.dispatchPlRepo.find({ where: { pt_packing_list_id: In(plIds) } });
    if (taken.length > 0) {
      throw new BadRequestException(
        `Uno o más packing lists ya están en otro despacho: ${taken.map((t) => t.pt_packing_list_id).join(', ')}`,
      );
    }

    const inherited = this.resolveInheritedBolFromPls(pls);
    const rawInput = dto.numero_bol?.trim();
    let finalBol: string;
    let bolOrigin: string;

    if (inherited) {
      if (!rawInput || rawInput === inherited) {
        finalBol = inherited;
        bolOrigin = 'inherited_from_pl';
      } else {
        finalBol = this.normalizeDispatchBol(rawInput);
        bolOrigin = 'dispatch_only';
      }
    } else {
      if (!rawInput) {
        throw new BadRequestException(
          'Indicá número BOL o definilo en los packing lists PT antes de crear el despacho.',
        );
      }
      finalBol = this.normalizeDispatchBol(rawInput);
      bolOrigin = 'manual_entry';
    }

    const order = await this.soRepo.findOne({ where: { id: dto.orden_id } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (Number(order.cliente_id) !== Number(dto.cliente_id)) {
      throw new BadRequestException('cliente_id no coincide con el pedido seleccionado.');
    }
    const bolMatchesOtherOrder = await this.soRepo.findOne({ where: { order_number: finalBol } });
    if (bolMatchesOtherOrder && Number(bolMatchesOtherOrder.id) !== Number(dto.orden_id)) {
      throw new BadRequestException(
        `La BOL ${finalBol} coincide con el pedido #${bolMatchesOtherOrder.id} (${bolMatchesOtherOrder.order_number}). Verificá el pedido del despacho.`,
      );
    }

    const row = await this.dispatchRepo.save(
      this.dispatchRepo.create({
        orden_id: dto.orden_id,
        cliente_id: dto.cliente_id,
        fecha_despacho: new Date(dto.fecha_despacho),
        numero_bol: finalBol,
        bol_origin: bolOrigin,
        temperatura_f: dto.temperatura_f.toFixed(2),
        client_id: dto.client_id ?? null,
        thermograph_serial: dto.thermograph_serial?.trim() || null,
        thermograph_notes: dto.thermograph_notes?.trim() || null,
        final_pallet_unit_prices:
          dto.final_pallet_unit_prices && Object.keys(dto.final_pallet_unit_prices).length > 0
            ? dto.final_pallet_unit_prices
            : null,
        status: 'borrador',
      }),
    );
    for (const pid of plIds) {
      await this.dispatchPlRepo.insert({ dispatch_id: row.id, pt_packing_list_id: pid });
    }
    return row;
  }

  async confirmDispatch(dispatchId: number) {
    const d = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!d) throw new NotFoundException('Despacho no encontrado');
    if (d.status !== 'borrador') {
      throw new BadRequestException('Solo se puede confirmar un despacho en borrador.');
    }
    const links = await this.dispatchPlRepo.find({ where: { dispatch_id: dispatchId } });
    if (links.length === 0) {
      throw new BadRequestException('Despacho sin packing lists asociados.');
    }
    const plIds = links.map((l) => Number(l.pt_packing_list_id));
    const pls = await this.ptPlRepo.findBy({ id: In(plIds) });
    for (const pl of pls) {
      if (pl.status !== 'confirmado') {
        throw new BadRequestException(
          `Packing list ${pl.list_code} ya no está confirmado; no se puede confirmar el despacho.`,
        );
      }
    }
    const now = new Date();
    d.status = 'confirmado';
    d.dispatch_confirmed_at = now;
    await this.dispatchRepo.save(d);
    const linked = pls.map((pl) => ({ id: pl.id, list_code: pl.list_code }));
    const plCodes = linked.map((x) => x.list_code).join(', ');
    const messages = [
      'Estado: confirmado — el despacho dejó de ser borrador; el documento queda cerrado operativamente.',
      `Vínculo formal con packing list(s) PT: ${plCodes}.`,
      'BOL y demás datos críticos del despacho pasan a solo lectura (no se editan desde esta pantalla).',
      'Stock PT: no se descuenta aquí; ya se descontó al confirmar cada packing list PT en Existencias PT.',
      'Siguiente paso operativo: cargar precios / factura / PDF (① ② ③) según corresponda.',
    ];
    return {
      confirmation: {
        dispatch_id: dispatchId,
        status: 'confirmado' as const,
        confirmed_at: now.toISOString(),
        linked_pt_packing_lists: linked,
        messages,
      },
      dispatches: await this.listDispatchesWithItems(),
    };
  }

  async despacharDispatch(dispatchId: number) {
    const d = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!d) throw new NotFoundException('Despacho no encontrado');
    if (d.status !== 'confirmado') {
      throw new BadRequestException('Solo se puede marcar como despachado un despacho confirmado.');
    }
    const now = new Date();
    d.status = 'despachado';
    d.dispatch_despachado_at = now;
    await this.dispatchRepo.save(d);
    const messages = [
      'Estado: despachado — se registró la salida física de la carga (camión / retiro).',
      'Diferencia con «confirmado»: confirmado cierra el documento y fija datos críticos; despachado marca que la mercadería ya salió del predio.',
      'Stock PT: tampoco se modifica al marcar despachado; el movimiento de existencias fue al confirmar cada packing list PT.',
      'Los precios de factura (①) quedan bloqueados en este estado.',
    ];
    return {
      transition: {
        dispatch_id: dispatchId,
        status: 'despachado' as const,
        despachado_at: now.toISOString(),
        messages,
      },
      dispatches: await this.listDispatchesWithItems(),
    };
  }

  /**
   * Corregir un “despachado” marcado por error: vuelve a confirmado y limpia la fecha de salida.
   * No mueve stock PT (el movimiento sigue siendo el del packing list PT).
   */
  async revertDespachado(dispatchId: number) {
    const d = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!d) throw new NotFoundException('Despacho no encontrado');
    if (d.status !== 'despachado') {
      throw new BadRequestException('Solo se puede deshacer la salida en un despacho que esté en estado despachado.');
    }
    d.status = 'confirmado';
    d.dispatch_despachado_at = null;
    await this.dispatchRepo.save(d);
    const messages = [
      'Estado: confirmado otra vez — se anuló el registro operativo de salida física (no se archiva ni se borra el despacho).',
      'Stock PT: sin cambios; el descuento de existencias sigue ligado al packing list PT confirmado.',
      'Podés volver a editar ① Precios y, si corresponde, registrar la salida otra vez con «Registrar salida física».',
    ];
    return {
      reversion: {
        dispatch_id: dispatchId,
        status: 'confirmado' as const,
        messages,
      },
      dispatches: await this.listDispatchesWithItems(),
    };
  }

  /** Packing lists PT confirmados y aún no asignados a ningún despacho. */
  async listLinkablePtPackingLists() {
    const usedRows = await this.dispatchPlRepo.find();
    const used = new Set(usedRows.map((r) => Number(r.pt_packing_list_id)));
    const rows = await this.ptPlRepo.find({
      where: { status: 'confirmado' },
      order: { id: 'DESC' },
      take: 500,
      relations: { client: true },
    });
    return rows
      .filter((r) => !used.has(r.id))
      .map((r) => ({
        id: r.id,
        list_code: r.list_code,
        client_id: r.client_id != null ? Number(r.client_id) : null,
        client_nombre: r.client?.nombre ?? null,
        list_date: r.list_date instanceof Date ? r.list_date.toISOString().slice(0, 10) : String(r.list_date),
        numero_bol: r.numero_bol?.trim() || null,
        pallet_count: 0,
      }));
  }

  async attachFinalPallets(dispatchId: number, dto: AttachFinalPalletsDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    await this.assertNotPlDispatch(dispatchId, 'No se adjuntan pallets finales.');
    const ids = [...new Set(dto.final_pallet_ids)];
    if (!ids.length) throw new BadRequestException('Indicá al menos un pallet final');
    const prevOnDispatch = await this.fpRepo.find({
      where: { dispatch_id: dispatchId },
      relations: ['lines', 'presentation_format'],
    });

    const pallets = await this.fpRepo.find({ where: { id: In(ids) }, relations: ['lines', 'presentation_format'] });
    if (pallets.length !== ids.length) throw new BadRequestException('Algún pallet final no existe');
    for (const p of pallets) {
      if (p.status !== 'definitivo') {
        throw new BadRequestException(`Pallet ${p.id} debe estar en estado definitivo`);
      }
      if (p.dispatch_id != null && Number(p.dispatch_id) !== dispatchId) {
        throw new BadRequestException(`Pallet ${p.id} ya está asignado al despacho ${p.dispatch_id}`);
      }
    }
    await this.assertFinishedPtStockForFinalPalletAttach(prevOnDispatch, pallets);

    for (const p of prevOnDispatch) {
      await this.applyFinalPalletFinishedPtStockMove(p, 'in');
    }
    const merged = { ...(dispatch.final_pallet_unit_prices ?? {}), ...(dto.unit_price_by_format_id ?? {}) };
    await this.dispatchRepo.update(dispatchId, {
      final_pallet_unit_prices: Object.keys(merged).length ? merged : null,
    });
    await this.fpRepo
      .createQueryBuilder()
      .update(FinalPallet)
      .set({ dispatch_id: null })
      .where('dispatch_id = :did', { did: dispatchId })
      .execute();
    for (const p of pallets) {
      p.dispatch_id = dispatchId;
      await this.fpRepo.save(p);
    }
    for (const p of pallets) {
      await this.applyFinalPalletFinishedPtStockMove(p, 'out');
    }
    const touchedIds = [...new Set([...prevOnDispatch.map((x) => x.id), ...pallets.map((x) => x.id)])];
    if (touchedIds.length) {
      const resync = await this.fpRepo.find({
        where: { id: In(touchedIds) },
        relations: ['lines', 'presentation_format'],
      });
      for (const fp of resync) {
        await this.finalPalletService.notifyDispatchFinalPalletStockSynced(fp.id);
      }
    }
    await this.generatePackingList(dispatchId);
    return this.listDispatchesWithItems();
  }

  /** Precios por caja por formato (factura comercial desde pallets / PL). Merge; no toca stock. */
  async updateDispatchUnitPrices(dispatchId: number, dto: UpdateDispatchUnitPricesDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    if (dispatch.status === 'despachado') {
      throw new BadRequestException(
        'No se pueden editar precios de factura en un despacho ya marcado como despachado (salida efectiva registrada).',
      );
    }
    const merged = { ...(dispatch.final_pallet_unit_prices ?? {}), ...(dto.unit_price_by_format_id ?? {}) };
    await this.dispatchRepo.update(dispatchId, {
      final_pallet_unit_prices: Object.keys(merged).length ? merged : null,
    });
    return this.listDispatchesWithItems();
  }

  async updateDispatchBol(dispatchId: number, dto: UpdateDispatchBolDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    if (dispatch.status !== 'borrador') {
      throw new BadRequestException(
        'El BOL solo se puede editar en borrador. Tras confirmar el despacho, el documento queda cerrado operativamente.',
      );
    }
    const bol = this.normalizeDispatchBol(dto.numero_bol);
    const links = await this.dispatchPlRepo.find({ where: { dispatch_id: dispatchId } });
    if (links.length > 0) {
      dispatch.numero_bol = bol;
      if (dto.apply_to_packing_lists) {
        for (const l of links) {
          await this.ptPlRepo.update({ id: Number(l.pt_packing_list_id) }, { numero_bol: bol });
        }
        dispatch.bol_origin = 'synced_to_pls';
      } else {
        dispatch.bol_origin = 'dispatch_only';
      }
    } else {
      dispatch.numero_bol = bol;
      dispatch.bol_origin = 'manual_entry';
    }
    try {
      await this.dispatchRepo.save(dispatch);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        throw new BadRequestException('El BOL ya está en uso por otro despacho.');
      }
      throw e;
    }
    return this.listDispatchesWithItems();
  }

  async updateDispatchMeta(dispatchId: number, dto: UpdateDispatchMetaDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const postSalidaEdit = dispatch.status === 'despachado';
    const hasAnyField =
      dto.fecha_despacho !== undefined ||
      dto.temperatura_f !== undefined ||
      dto.thermograph_serial !== undefined ||
      dto.thermograph_notes !== undefined;
    if (!hasAnyField) {
      throw new BadRequestException('No se enviaron campos para actualizar.');
    }

    if (dto.fecha_despacho !== undefined) {
      const d = new Date(dto.fecha_despacho);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('fecha_despacho inválida.');
      dispatch.fecha_despacho = d;
    }
    if (dto.temperatura_f !== undefined) {
      if (!Number.isFinite(dto.temperatura_f)) throw new BadRequestException('temperatura_f inválida.');
      dispatch.temperatura_f = Number(dto.temperatura_f).toFixed(2);
    }
    if (dto.thermograph_serial !== undefined) {
      dispatch.thermograph_serial = dto.thermograph_serial.trim() || null;
    }
    if (dto.thermograph_notes !== undefined) {
      dispatch.thermograph_notes = dto.thermograph_notes.trim() || null;
    }
    if (postSalidaEdit) {
      const stamp = `[AJUSTE POST-SALIDA ${new Date().toISOString()}]`;
      const prev = dispatch.thermograph_notes?.trim() ?? '';
      dispatch.thermograph_notes = prev ? `${prev}\n${stamp}` : stamp;
    }

    await this.dispatchRepo.save(dispatch);
    const packing = await this.plRepo.findOne({ where: { dispatch_id: dispatchId }, select: ['id'] });
    if (packing) {
      await this.generatePackingList(dispatchId);
    }
    return this.listDispatchesWithItems();
  }

  async updateDispatchOrderLink(dispatchId: number, dto: UpdateDispatchOrderLinkDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const order = await this.soRepo.findOne({ where: { id: dto.orden_id } });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    dispatch.orden_id = order.id;
    dispatch.cliente_id = dto.cliente_id != null ? dto.cliente_id : Number(order.cliente_id);
    if (dto.client_id !== undefined) {
      dispatch.client_id = dto.client_id && dto.client_id > 0 ? dto.client_id : null;
    }
    if (dispatch.status === 'despachado') {
      const stamp = `[AJUSTE PEDIDO POST-SALIDA ${new Date().toISOString()}] pedido=${order.order_number}`;
      const prev = dispatch.thermograph_notes?.trim() ?? '';
      dispatch.thermograph_notes = prev ? `${prev}\n${stamp}` : stamp;
    }
    await this.dispatchRepo.save(dispatch);
    return this.listDispatchesWithItems();
  }

  private finishedPtStockKey(format_code: string, client_id: number | null, brand_id: number | null) {
    const fc = format_code.trim().toLowerCase();
    return `${fc}\0${client_id === null ? 'n' : String(client_id)}\0${brand_id === null ? 'n' : String(brand_id)}`;
  }

  /** Suma cajas por dimensión de stock PT (solo líneas con formato cargado en el pallet). */
  private aggregateFinalPalletBoxesByStockKey(pallets: FinalPallet[]) {
    const m = new Map<string, { fc: string; cid: number | null; bid: number | null; boxes: number }>();
    for (const p of pallets) {
      const boxes = (p.lines ?? []).reduce((s, l) => s + l.amount, 0);
      if (boxes <= 0) continue;
      const pf = p.presentation_format;
      if (!pf?.format_code) continue;
      const fc = pf.format_code.trim().toLowerCase();
      const cid = p.client_id ?? null;
      const bid = p.brand_id ?? null;
      const key = this.finishedPtStockKey(fc, cid, bid);
      const cur = m.get(key);
      if (cur) cur.boxes += boxes;
      else m.set(key, { fc, cid, bid, boxes });
    }
    return m;
  }

  /**
   * Comprueba que haya stock PT suficiente tras liberar lo que ya estaba en este despacho.
   * disponible = fila finished_pt_stock + cajas de pallets previos del mismo despacho (misma clave).
   */
  private async assertFinishedPtStockForFinalPalletAttach(
    prevPallets: FinalPallet[],
    nextPallets: FinalPallet[],
  ) {
    for (const p of nextPallets) {
      const boxes = (p.lines ?? []).reduce((s, l) => s + l.amount, 0);
      if (boxes <= 0) continue;
      if (!p.presentation_format?.format_code) {
        throw new BadRequestException(
          `Pallet ${p.id} debe tener formato de presentación para registrar salida de stock PT`,
        );
      }
    }
    const released = this.aggregateFinalPalletBoxesByStockKey(prevPallets);
    const needed = this.aggregateFinalPalletBoxesByStockKey(nextPallets);
    for (const [, need] of needed) {
      const key = this.finishedPtStockKey(need.fc, need.cid, need.bid);
      const back = released.get(key)?.boxes ?? 0;
      const row = await this.finishedPtRepo.findOne({
        where: {
          format_code: need.fc,
          client_id: need.cid === null ? IsNull() : need.cid,
          brand_id: need.bid === null ? IsNull() : need.bid,
        },
      });
      const inStock = row?.boxes ?? 0;
      const available = inStock + back;
      if (need.boxes > available) {
        throw new BadRequestException(
          `Stock PT insuficiente para formato ${need.fc}: hay ${available} cajas disponibles (${inStock} en almacén + ${back} a liberar por reemplazo en este despacho), se requieren ${need.boxes}.`,
        );
      }
    }
  }

  private async assertFinishedPtStockAvailableForTag(tag: PtTag, boxesOut: number) {
    if (boxesOut <= 0) return;
    const fc = tag.format_code.trim().toLowerCase();
    const cid = tag.client_id ?? null;
    const bid = tag.brand_id ?? null;
    const row = await this.finishedPtRepo.findOne({
      where: {
        format_code: fc,
        client_id: cid === null ? IsNull() : cid,
        brand_id: bid === null ? IsNull() : bid,
      },
    });
    const available = row?.boxes ?? 0;
    if (available < boxesOut) {
      throw new BadRequestException(
        `Stock PT insuficiente para formato ${fc}: hay ${available} cajas, se requieren ${boxesOut}.`,
      );
    }
  }

  /** Salida de PT agregado: por cajas y dimensión formato + cliente + marca (como unidades PT). */
  private async applyFinishedPtStockOutByKey(
    format_code: string,
    client_id: number | null,
    brand_id: number | null,
    boxesOut: number,
  ) {
    if (boxesOut <= 0) return;
    const fc = format_code.trim().toLowerCase();
    const cid = client_id ?? null;
    const bid = brand_id ?? null;
    const row = await this.finishedPtRepo.findOne({
      where: {
        format_code: fc,
        client_id: cid === null ? IsNull() : cid,
        brand_id: bid === null ? IsNull() : bid,
      },
    });
    const available = row?.boxes ?? 0;
    if (!row || available < boxesOut) {
      throw new BadRequestException(
        `Stock PT insuficiente para formato ${fc}: hay ${available} cajas, se requieren ${boxesOut}.`,
      );
    }
    const netLb = Number(row.net_lb);
    const perBox = row.boxes > 0 ? netLb / row.boxes : 0;
    row.boxes = row.boxes - boxesOut;
    row.net_lb = Math.max(0, netLb - boxesOut * perBox).toFixed(3);
    await this.finishedPtRepo.save(row);
  }

  /** Revierte salida al desasignar pallets del despacho (misma dimensión). */
  private async applyFinishedPtStockInByKey(
    format_code: string,
    client_id: number | null,
    brand_id: number | null,
    boxesIn: number,
  ) {
    if (boxesIn <= 0) return;
    const fc = format_code.trim().toLowerCase();
    const cid = client_id ?? null;
    const bid = brand_id ?? null;
    let row = await this.finishedPtRepo.findOne({
      where: {
        format_code: fc,
        client_id: cid === null ? IsNull() : cid,
        brand_id: bid === null ? IsNull() : bid,
      },
    });
    const netPerBox =
      row && row.boxes > 0 ? Number(row.net_lb) / row.boxes : await this.netLbPerBox(fc);
    if (!row) {
      row = this.finishedPtRepo.create({
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
    await this.finishedPtRepo.save(row);
  }

  private async applyFinalPalletFinishedPtStockMove(p: FinalPallet, direction: 'in' | 'out') {
    const boxes = (p.lines ?? []).reduce((s, l) => s + l.amount, 0);
    if (boxes <= 0) return;
    const pf = p.presentation_format;
    if (!pf?.format_code) {
      if (direction === 'out') {
        throw new BadRequestException(
          `Pallet ${p.id} debe tener formato de presentación para registrar salida de stock PT`,
        );
      }
      return;
    }
    const fc = pf.format_code.trim().toLowerCase();
    const cid = p.client_id ?? null;
    const bid = p.brand_id ?? null;
    if (direction === 'out') {
      await this.applyFinishedPtStockOutByKey(fc, cid, bid, boxes);
    } else {
      await this.applyFinishedPtStockInByKey(fc, cid, bid, boxes);
    }
  }

  private async applyFinishedPtStockOut(tag: PtTag, boxesOut: number) {
    await this.applyFinishedPtStockOutByKey(tag.format_code, tag.client_id ?? null, tag.brand_id ?? null, boxesOut);
  }

  async addTag(dispatchId: number, dto: AddDispatchTagDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    await this.assertNotPlDispatch(dispatchId, 'No se agregan unidades PT.');

    const tag = await this.ptTagRepo.findOne({ where: { id: dto.tarja_id } });
    if (!tag) throw new NotFoundException('Unidad PT no encontrada');
    if (tag.total_cajas <= 0) {
      throw new BadRequestException('Solo se despacha producto terminado con cajas disponibles en la unidad PT');
    }
    const dup = await this.dtiRepo.findOne({ where: { dispatch_id: dispatchId, tarja_id: dto.tarja_id } });
    if (dup) {
      throw new BadRequestException('Esta unidad PT ya está cargada en este despacho.');
    }
    if (dto.cajas_despachadas > tag.total_cajas) {
      throw new BadRequestException(`Cajas a despachar (${dto.cajas_despachadas}) superan el stock de la unidad PT (${tag.total_cajas})`);
    }

    await this.assertFinishedPtStockAvailableForTag(tag, dto.cajas_despachadas);

    const saved = await this.dtiRepo.save(
      this.dtiRepo.create({
        dispatch_id: dispatchId,
        ...dto,
        unit_price: dto.unit_price.toFixed(4),
        pallet_cost: dto.pallet_cost.toFixed(4),
      }),
    );

    await this.applyFinishedPtStockOut(tag, dto.cajas_despachadas);
    return saved;
  }

  async generatePackingList(dispatchId: number) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const items = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });
    const plLinked = await this.dispatchPlRepo.count({ where: { dispatch_id: dispatchId } });
    const fpsPl = plLinked > 0 ? await this.finalPalletsFromPtPackingLists(dispatchId) : [];
    const finalPallets =
      plLinked > 0
        ? fpsPl.length > 0
          ? await this.fpRepo.find({
              where: { id: In(fpsPl.map((fp) => fp.id)) },
              relations: ['lines', 'presentation_format'],
            })
          : []
        : await this.fpRepo.find({
            where: { dispatch_id: dispatchId },
            relations: ['lines', 'presentation_format'],
          });
    const fpPayload = finalPallets.map((fp) => ({
      id: fp.id,
      corner_board_code: fp.corner_board_code,
      clamshell_label: fp.clamshell_label,
      format_code: fp.presentation_format?.format_code ?? null,
      boxes: (fp.lines ?? []).reduce((s, l) => s + l.amount, 0),
      pounds: (fp.lines ?? []).reduce((s, l) => s + Number(l.pounds), 0),
    }));
    const payload = {
      dispatch,
      items,
      final_pallets: fpPayload,
      thermograph_serial: dispatch.thermograph_serial,
      thermograph_notes: dispatch.thermograph_notes,
    };
    const existing = await this.plRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (existing) {
      existing.printable_payload = payload as Record<string, unknown>;
      return this.plRepo.save(existing);
    }
    const seq = (await this.plRepo.count()) + 1;
    return this.plRepo.save(
      this.plRepo.create({
        dispatch_id: dispatchId,
        packing_number: `PK-${String(seq).padStart(5, '0')}`,
        printable_payload: payload as Record<string, unknown>,
      }),
    );
  }

  async generateInvoice(dispatchId: number) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const rows = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });
    let inv = await this.invRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (!inv) {
      const seq = (await this.invRepo.count()) + 1;
      inv = await this.invRepo.save(
        this.invRepo.create({
          dispatch_id: dispatchId,
          invoice_number: `INV-${String(seq).padStart(5, '0')}`,
          subtotal: '0.00',
          total_cost: '0.00',
          total: '0.00',
        }),
      );
    } else {
      await this.invItemRepo.delete({ invoice_id: inv.id, is_manual: false });
    }

    for (const r of rows) {
      const lineSubtotal = r.cajas_despachadas * Number(r.unit_price);
      const lineCost = r.pallets_despachados * Number(r.pallet_cost);
      await this.invItemRepo.save(
        this.invItemRepo.create({
          invoice_id: inv.id,
          tarja_id: r.tarja_id,
          final_pallet_id: null,
          fruit_process_id: null,
          traceability_note: null,
          cajas: r.cajas_despachadas,
          unit_price: r.unit_price,
          line_subtotal: lineSubtotal.toFixed(2),
          pallet_cost_total: lineCost.toFixed(2),
          is_manual: false,
        }),
      );
    }

    const prices = dispatch.final_pallet_unit_prices ?? {};
    const plLinkedInv = await this.dispatchPlRepo.count({ where: { dispatch_id: dispatchId } });
    const fpsPlInv = plLinkedInv > 0 ? await this.finalPalletsFromPtPackingLists(dispatchId) : [];
    const fpIdsForInv =
      plLinkedInv > 0 ? fpsPlInv.map((fp) => fp.id) : (await this.fpRepo.find({ where: { dispatch_id: dispatchId }, select: ['id'] })).map((x) => x.id);
    const fps =
      fpIdsForInv.length > 0
        ? await this.fpRepo.find({
            where: { id: In(fpIdsForInv) },
            relations: ['lines', 'lines.variety', 'lines.fruit_process', 'presentation_format', 'brand'],
          })
        : [];

    const grouped = groupFinalPalletsForCommercialInvoice(fps, prices);
    const plRefForInvoice = await this.ptPackingListRefForDispatch(dispatchId);
    let autoLinesFromPallets = 0;
    for (const g of grouped) {
      await this.invItemRepo.save(
        this.invItemRepo.create({
          invoice_id: inv.id,
          tarja_id: g.tarja_id,
          final_pallet_id: g.final_pallet_id,
          fruit_process_id: g.fruit_process_id,
          traceability_note: g.traceability_note,
          cajas: g.cajas,
          unit_price: g.unitPrice.toFixed(4),
          line_subtotal: g.lineSubtotal.toFixed(2),
          pallet_cost_total: '0.00',
          is_manual: false,
          packaging_code: g.formatCode,
          species_id: g.speciesId,
          variety_id: g.varietyId,
          brand: g.brandName,
          pounds: g.pounds.toFixed(3),
          packing_list_ref: plRefForInvoice,
        }),
      );
      autoLinesFromPallets++;
    }

    if (autoLinesFromPallets === 0 && fpIdsForInv.length > 0) {
      // Fallback: si no hay líneas detalladas en final_pallet_lines, usar inventario PT por pallet y formato.
      const invRows = await this.finishedPtInventoryRepo.find({
        where: { final_pallet_id: In(fpIdsForInv) },
      });
      const procIds = [
        ...new Set(
          invRows.flatMap((ir) =>
            (ir.trace_lines ?? [])
              .map((t) => t.fruit_process_id)
              .filter((x): x is number => x != null && Number(x) > 0),
          ),
        ),
      ];
      const processes =
        procIds.length > 0
          ? await this.fruitProcessRepo.find({
              where: { id: In(procIds) },
            })
          : [];
      const procById = new Map(processes.map((p) => [p.id, p]));
      for (const ir of invRows) {
        if (Number(ir.boxes) <= 0) continue;
        const formatId = ir.presentation_format_id != null ? Number(ir.presentation_format_id) : null;
        const unitPrice = formatId != null ? Number(prices[String(formatId)] ?? 0) : 0;
        const pounds = Number(ir.net_lb ?? 0);
        const firstProcId = (ir.trace_lines ?? []).map((t) => t.fruit_process_id).find((x) => x != null && Number(x) > 0);
        const fpNum = firstProcId != null ? Number(firstProcId) : null;
        const proc = fpNum != null ? procById.get(fpNum) : undefined;
        const tarjaFromInv =
          proc?.tarja_id != null && Number(proc.tarja_id) > 0 ? Number(proc.tarja_id) : null;
        let traceNote: string | null = null;
        if (tarjaFromInv == null && fpNum != null) {
          traceNote = 'Inventario PT: proceso sin unidad PT; liquidación vía fruit_process.';
        } else if (tarjaFromInv == null && fpNum == null) {
          traceNote = 'Inventario PT sin fruit_process en trace_lines.';
        }
        await this.invItemRepo.save(
          this.invItemRepo.create({
            invoice_id: inv.id,
            tarja_id: tarjaFromInv,
            final_pallet_id: Number(ir.final_pallet_id),
            fruit_process_id: fpNum,
            traceability_note: traceNote,
            cajas: Number(ir.boxes),
            unit_price: unitPrice.toFixed(4),
            line_subtotal: (Number(ir.boxes) * unitPrice).toFixed(2),
            pallet_cost_total: '0.00',
            is_manual: false,
            packaging_code: (ir.format_code?.trim() || '—').toUpperCase(),
            species_id: ir.species_id != null ? Number(ir.species_id) : null,
            variety_id: null,
            brand: null,
            pounds: pounds.toFixed(3),
            packing_list_ref: plRefForInvoice,
          }),
        );
        autoLinesFromPallets++;
      }
    }
    if (fpIdsForInv.length > 0 && autoLinesFromPallets === 0) {
      throw new BadRequestException(
        'No se pudieron generar líneas automáticas de factura desde los pallets del despacho. Verificá que los pallets tengan cajas/libras en inventario PT.',
      );
    }

    await this.recalculateInvoiceTotals(inv.id);
    return this.invRepo.findOne({ where: { id: inv.id } });
  }

  private async ptPackingListRefForDispatch(dispatchId: number): Promise<string | null> {
    const links = await this.dispatchPlRepo.find({
      where: { dispatch_id: dispatchId },
      relations: { pt_packing_list: true },
    });
    const codes = links
      .map((l) => l.pt_packing_list?.list_code?.trim() || null)
      .filter((x): x is string => !!x);
    if (!codes.length) return null;
    return codes.join(', ').slice(0, 80);
  }

  /** Facturas existentes sin ningún ítem (auditoría / liquidación). */
  async listInvoicesWithNoLines() {
    const invoices = await this.invRepo.find({ order: { id: 'ASC' } });
    if (!invoices.length) return { count: 0, items: [] };
    const ids = invoices.map((i) => i.id);
    const raw = await this.invItemRepo
      .createQueryBuilder('ii')
      .select('ii.invoice_id', 'invoice_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('ii.invoice_id IN (:...ids)', { ids })
      .groupBy('ii.invoice_id')
      .getRawMany();
    const cntById = new Map<number, number>();
    for (const r of raw) {
      cntById.set(Number(r.invoice_id), Number(r.cnt));
    }
    const items = invoices
      .filter((inv) => (cntById.get(inv.id) ?? 0) === 0)
      .map((inv) => ({
        dispatch_id: Number(inv.dispatch_id),
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        subtotal: inv.subtotal,
        total: inv.total,
        line_count: 0,
      }));
    return { count: items.length, items };
  }

  /**
   * Vuelve a ejecutar generateInvoice para despachos cuya factura no tiene líneas.
   * Solo admin (controlador). Útil tras corregir la lógica de generación.
   */
  async regenerateEmptyInvoices(dispatchIds?: number[]) {
    const { items } = await this.listInvoicesWithNoLines();
    let targets = items;
    if (dispatchIds?.length) {
      const allow = new Set(dispatchIds.map(Number));
      targets = items.filter((t) => allow.has(Number(t.dispatch_id)));
    }
    const results: Array<{
      dispatch_id: number;
      ok: boolean;
      lines_after?: number;
      error?: string;
    }> = [];
    for (const t of targets) {
      const did = Number(t.dispatch_id);
      try {
        await this.generateInvoice(did);
        const inv = await this.invRepo.findOne({ where: { dispatch_id: did } });
        const n = inv ? await this.invItemRepo.count({ where: { invoice_id: inv.id } }) : 0;
        results.push({ dispatch_id: did, ok: n > 0, lines_after: n });
      } catch (e: unknown) {
        results.push({
          dispatch_id: did,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { processed: targets.length, results };
  }

  async addManualInvoiceLine(dispatchId: number, dto: AddManualInvoiceLineDto) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    let inv = await this.invRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (!inv) {
      const seq = (await this.invRepo.count()) + 1;
      inv = await this.invRepo.save(
        this.invRepo.create({
          dispatch_id: dispatchId,
          invoice_number: `INV-${String(seq).padStart(5, '0')}`,
          subtotal: '0.00',
          total_cost: '0.00',
          total: '0.00',
        }),
      );
    }
    const kind = dto.tipo === 'descuento' ? 'descuento' : 'cargo';
    const qty = dto.cantidad;
    const unit = dto.unit_price;
    const gross = qty * unit;
    const lineSubtotal = kind === 'descuento' ? -Math.abs(gross) : gross;
    await this.invItemRepo.save(
      this.invItemRepo.create({
        invoice_id: inv.id,
        tarja_id: null,
        final_pallet_id: null,
        fruit_process_id: null,
        traceability_note: null,
        cajas: qty,
        unit_price: unit.toFixed(4),
        line_subtotal: lineSubtotal.toFixed(2),
        pallet_cost_total: '0.00',
        is_manual: true,
        species_id: null,
        variety_id: null,
        packaging_code: null,
        brand: null,
        trays: null,
        pounds: null,
        packing_list_ref: null,
        manual_description: dto.descripcion.trim(),
        manual_line_kind: kind,
      }),
    );
    await this.recalculateInvoiceTotals(inv.id);
    return this.invRepo.findOne({ where: { id: inv.id } });
  }

  /**
   * Despacho + factura histórica: encuentra PT por `pt_tags.bol` = numero_bol.
   * No ejecuta salida de `finished_pt_stock` vía API de tags (reconstrucción documental).
   */
  async importHistoricalDispatch(dto: HistoricalDispatchImportInput): Promise<{ dispatch_id: number }> {
    const bol = dto.numero_bol.trim();
    if (!bol) throw new BadRequestException('numero_bol vacío');

    const order = await this.soRepo.findOne({ where: { order_number: dto.order_reference.trim() } });
    if (!order) throw new BadRequestException(`Pedido no encontrado: ${dto.order_reference}`);

    const dup = await this.dispatchRepo.findOne({ where: { numero_bol: bol } });
    if (dup) throw new BadRequestException(`numero_bol duplicado: ${bol}`);

    const nameHint = dto.cliente_nombre?.trim();
    if (nameHint) {
      const clients = await this.clientRepo.find();
      const lc = nameHint.toLowerCase();
      const found = clients.find((c) => (c.nombre ?? '').trim().toLowerCase() === lc);
      if (found && Number(found.id) !== Number(order.cliente_id)) {
        throw new BadRequestException(
          `cliente_nombre (${nameHint}) no coincide con el cliente del pedido ${dto.order_reference}`,
        );
      }
    }

    const tags = await this.ptTagRepo
      .createQueryBuilder('t')
      .where(`TRIM(SPLIT_PART(t.bol, '|', 1)) = TRIM(:bol)`, { bol })
      .orderBy('t.id', 'ASC')
      .getMany();

    if (!tags.length) {
      throw new BadRequestException(`Sin pt_tags con bol exacto «${bol}». Verificar import PT / BOL.`);
    }

    const sumTagCajas = tags.reduce((s, t) => s + Number(t.total_cajas ?? 0), 0);
    if (sumTagCajas <= 0) {
      throw new BadRequestException(`Unidades PT con bol ${bol} no tienen cajas cargadas`);
    }

    const dispatchId = await this.dispatchRepo.manager.transaction(async (em) => {
      const fecha = dto.fecha_despacho instanceof Date ? dto.fecha_despacho : new Date(dto.fecha_despacho);
      const disp = em.create(Dispatch, {
        orden_id: order.id,
        cliente_id: order.cliente_id,
        fecha_despacho: fecha,
        numero_bol: bol,
        bol_origin: 'dispatch_only',
        temperatura_f: Number(dto.temperatura_f).toFixed(2),
        thermograph_serial: dto.thermograph_serial?.trim() || null,
        thermograph_notes: null,
        final_pallet_unit_prices: null,
        client_id: order.cliente_id,
        status: 'despachado',
        dispatch_confirmed_at: fecha,
        dispatch_despachado_at: fecha,
      });
      const saved = await em.save(Dispatch, disp);

      const amt = dto.total_amount;
      for (const tag of tags) {
        const cajas = Math.max(1, Number(tag.total_cajas));
        const share = cajas / sumTagCajas;
        const lineAmt = amt * share;
        const unitPrice = lineAmt / cajas;
        const pallets = Math.max(1, Number(tag.total_pallets ?? 1));
        await em.save(
          em.create(DispatchTagItem, {
            dispatch_id: saved.id,
            tarja_id: tag.id,
            cajas_despachadas: cajas,
            pallets_despachados: pallets,
            unit_price: unitPrice.toFixed(4),
            pallet_cost: '0.0000',
          }),
        );
      }
      return saved.id as number;
    });

    await this.generatePackingList(dispatchId);
    await this.generateInvoice(dispatchId);

    const inv = await this.invRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (inv && Math.abs(Number(inv.total) - dto.total_amount) > 0.05) {
      await this.invRepo.update(inv.id, {
        subtotal: dto.total_amount.toFixed(2),
        total: dto.total_amount.toFixed(2),
      });
    }

    return { dispatch_id: dispatchId };
  }

  async deleteManualInvoiceLine(dispatchId: number, itemId: number) {
    const inv = await this.invRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (!inv) throw new NotFoundException('Factura no encontrada para este despacho');
    const item = await this.invItemRepo.findOne({ where: { id: itemId, invoice_id: inv.id } });
    if (!item) throw new NotFoundException('Línea de factura no encontrada');
    if (!item.is_manual) throw new BadRequestException('Solo se eliminan líneas manuales; regenerá la factura para actualizar líneas desde unidades PT.');
    await this.invItemRepo.delete({ id: itemId });
    await this.recalculateInvoiceTotals(inv.id);
    return { ok: true };
  }

  /**
   * Repara trazabilidad: despacho sin `dispatch_pt_packing_lists` + PL en `pt_packing_lists`
   * (mismo `numero_bol` TRIM y `client_id` del despacho). Resuelve pallets vía legacy
   * `dispatch_tag_items` → `pt_tags` → `final_pallets` (dispatch_id en pallets suele estar vacío).
   */
  async reconcileLegacyDispatches(opts: { dryRun: boolean }): Promise<{
    despachosReconciliados: number;
    plsActualizados: number;
    itemsCreados: number;
    errores: string[];
  }> {
    const errores: string[] = [];
    let despachosReconciliados = 0;
    let itemsCreados = 0;
    const plIdsTouched = new Set<number>();

    const linkedRows = await this.dispatchPlRepo.find({ select: ['dispatch_id', 'pt_packing_list_id'] });
    const linkedDispatchIds = new Set(linkedRows.map((r) => Number(r.dispatch_id)));
    const plIdsAlreadyLinked = new Set(linkedRows.map((r) => Number(r.pt_packing_list_id)));

    const reservedPlIds = new Set(plIdsAlreadyLinked);

    const allDispatches = await this.dispatchRepo.find({ order: { id: 'ASC' } });
    const legacyDispatches = allDispatches.filter((d) => !linkedDispatchIds.has(d.id));

    const palletsToReconcileInventory: number[] = [];

    for (const d of legacyDispatches) {
      const bol = (d.numero_bol ?? '').trim();
      if (!bol) {
        errores.push(`Despacho #${d.id}: sin numero_bol; no se puede cruzar con pt_packing_lists.`);
        continue;
      }

      const clientId = d.client_id != null && Number(d.client_id) > 0 ? Number(d.client_id) : null;
      if (clientId == null) {
        errores.push(
          `Despacho #${d.id}: sin client_id válido; se requiere pt_packing_lists.client_id = dispatches.client_id.`,
        );
        continue;
      }

      const plCandidates = await this.ptPlRepo
        .createQueryBuilder('pl')
        .select(['pl.id', 'pl.list_code', 'pl.numero_bol', 'pl.client_id', 'pl.status'])
        .where('TRIM(pl.numero_bol) = :bol', { bol })
        .andWhere('pl.client_id = :cid', { cid: clientId })
        .andWhere("pl.status <> 'anulado'")
        .getMany();

      if (plCandidates.length !== 1) {
        if (plCandidates.length === 0) {
          errores.push(
            `Despacho #${d.id}: 0 PL candidatos (TRIM(numero_bol)= "${bol}", client_id=${clientId}, status<>anulado).`,
          );
        } else {
          errores.push(
            `Despacho #${d.id}: ${plCandidates.length} PL candidatos (${plCandidates
              .map((p) => `#${p.id}`)
              .join(', ')}); debe haber exactamente uno.`,
          );
        }
        continue;
      }

      const pl = plCandidates[0];
      if (reservedPlIds.has(Number(pl.id))) {
        errores.push(
          `Despacho #${d.id}: el PL #${pl.id} (${pl.list_code}) ya está en dispatch_pt_packing_lists o fue reservado en esta corrida.`,
        );
        continue;
      }

      const fps = await this.fpRepo
        .createQueryBuilder('fp')
        .distinct(true)
        .innerJoin(
          DispatchTagItem,
          'dti',
          'dti.tarja_id = fp.tarja_id AND dti.dispatch_id = :did',
          { did: d.id },
        )
        .innerJoin(PtTag, 'pt', 'pt.id = dti.tarja_id')
        .orderBy('fp.id', 'ASC')
        .getMany();

      let abortDispatch = false;
      for (const fp of fps) {
        const existingPl = fp.pt_packing_list_id != null ? Number(fp.pt_packing_list_id) : null;
        if (existingPl != null && existingPl > 0 && existingPl !== Number(pl.id)) {
          errores.push(
            `Despacho #${d.id}: final_pallet #${fp.id} ya tiene pt_packing_list_id=${existingPl}; conflicto.`,
          );
          abortDispatch = true;
          break;
        }
      }
      if (abortDispatch) continue;

      let newItemsForThis = 0;
      for (const fp of fps) {
        const exists = await this.ptPlItemRepo.findOne({
          where: { packing_list_id: pl.id, final_pallet_id: fp.id },
        });
        if (!exists) newItemsForThis += 1;
      }

      if (opts.dryRun) {
        despachosReconciliados += 1;
        itemsCreados += newItemsForThis;
        plIdsTouched.add(Number(pl.id));
        reservedPlIds.add(Number(pl.id));
        continue;
      }

      const qr = this.dispatchRepo.manager.connection.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await qr.manager.insert(DispatchPtPackingList, {
          dispatch_id: d.id,
          pt_packing_list_id: pl.id,
        });

        for (const fp of fps) {
          const existed = await qr.manager.findOne(PtPackingListItem, {
            where: { packing_list_id: pl.id, final_pallet_id: fp.id },
          });
          if (!existed) {
            await qr.manager.insert(PtPackingListItem, {
              packing_list_id: pl.id,
              final_pallet_id: fp.id,
            });
            itemsCreados += 1;
          }

          const row = await qr.manager.findOne(FinalPallet, { where: { id: fp.id } });
          if (!row) continue;

          row.pt_packing_list_id = pl.id;
          if (row.status === 'definitivo') {
            row.status = 'asignado_pl';
            palletsToReconcileInventory.push(Number(row.id));
          }

          await qr.manager.save(row);
        }

        await qr.commitTransaction();
        despachosReconciliados += 1;
        plIdsTouched.add(Number(pl.id));
        reservedPlIds.add(Number(pl.id));
      } catch (e) {
        await qr.rollbackTransaction();
        const msg = e instanceof Error ? e.message : String(e);
        errores.push(`Despacho #${d.id}: transacción revertida — ${msg}`);
      } finally {
        await qr.release();
      }
    }

    for (const pid of palletsToReconcileInventory) {
      try {
        await this.finalPalletService.reconcileInventoryForPallet(pid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errores.push(`Inventario PT (pallet #${pid}): ${msg}`);
      }
    }

    return {
      despachosReconciliados,
      plsActualizados: plIdsTouched.size,
      itemsCreados,
      errores,
    };
  }
}
