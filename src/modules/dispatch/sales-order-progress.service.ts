import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from '../traceability/operational.entities';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { PtPackingList, PtPackingListReversalEvent } from '../pt-packing-list/pt-packing-list.entities';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchReceptionLine,
  SalesOrder,
  SalesOrderLine,
} from './dispatch.entities';
import { ReceptionLine } from '../traceability/traceability.entities';

export type SalesOrderProgressLineDto = {
  sales_order_line_id: number;
  line_kind: 'PT_FORMAT' | 'RAW_WEIGHT';
  presentation_format_id: number | null;
  format_code: string | null;
  requested_boxes: number;
  requested_lb: number | null;
  species_id: number | null;
  species_nombre: string | null;
  unit_price: number | null;
  brand_id: number | null;
  brand_nombre: string | null;
  variety_id: number | null;
  variety_nombre: string | null;
  produced_depot_boxes: number;
  /** Cajas en cámara vinculadas al pedido: `planned_sales_order_id` o BOL del pallet = nº de pedido. */
  reserved_depot_boxes: number;
  assigned_pl_boxes: number;
  dispatched_boxes: number;
  pending_boxes: number;
  dispatched_lb: number | null;
  pending_lb: number | null;
  /** Indicador de avance respecto al pedido. */
  fulfillment: 'pendiente' | 'parcial' | 'completo';
  alerts: string[];
};

export type SalesOrderOperationalSummary = {
  dispatched_boxes: number;
  pending_boxes: number;
  dispatch_by_orden: boolean;
  dispatch_by_bol: boolean;
  /** Pedido cerrado operativamente (despacho / BOL cruzado). */
  operatively_complete: boolean;
  fulfillment: 'pendiente' | 'parcial' | 'completo' | 'sin_volumen';
  /** Cómo se vinculó al despacho, si aplica. */
  dispatch_match: 'orden' | 'bol' | 'ambos' | null;
};

export type SalesOrderProgressDto = {
  order: {
    id: number;
    order_number: string;
    cliente_id: number;
    cliente_nombre: string | null;
  };
  lines: SalesOrderProgressLineDto[];
  totals: {
    requested_boxes: number;
    produced_depot_boxes: number;
    /** Cajas en cámara vinculadas al pedido (planned o BOL = nº pedido). */
    reserved_depot_boxes: number;
    assigned_pl_boxes: number;
    dispatched_boxes: number;
    pending_boxes: number;
    requested_lb: number;
    dispatched_lb: number;
    pending_lb: number;
  };
};

@Injectable()
export class SalesOrderProgressService {
  constructor(
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly soLineRepo: Repository<SalesOrderLine>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(DispatchPtPackingList) private readonly dplRepo: Repository<DispatchPtPackingList>,
    @InjectRepository(DispatchReceptionLine)
    private readonly dispatchRawLineRepo: Repository<DispatchReceptionLine>,
    @InjectRepository(FinalPallet) private readonly fpRepo: Repository<FinalPallet>,
    @InjectRepository(FinalPalletLine) private readonly fpLineRepo: Repository<FinalPalletLine>,
    @InjectRepository(PtPackingListReversalEvent) private readonly plRevRepo: Repository<PtPackingListReversalEvent>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
  ) {}

  private applyLineDimensions(
    qb: SelectQueryBuilder<FinalPalletLine>,
    line: SalesOrderLine,
    aliasFp = 'fp',
    aliasFpl = 'fpl',
  ) {
    qb.andWhere(`${aliasFp}.presentation_format_id = :pf`, { pf: line.presentation_format_id });
    if (line.brand_id != null && Number(line.brand_id) > 0) {
      qb.andWhere(`${aliasFp}.brand_id = :bid`, { bid: line.brand_id });
    }
    if (line.variety_id != null && Number(line.variety_id) > 0) {
      qb.andWhere(`${aliasFpl}.variety_id = :vid`, { vid: line.variety_id });
    }
  }

  private async sumDepot(line: SalesOrderLine): Promise<number> {
    const qb = this.fpLineRepo
      .createQueryBuilder('fpl')
      .innerJoin(FinalPallet, 'fp', 'fp.id = fpl.final_pallet_id')
      .select('COALESCE(SUM(fpl.amount), 0)', 's');
    this.applyLineDimensions(qb, line);
    qb.andWhere('fp.status = :st', { st: 'definitivo' })
      .andWhere('fp.pt_packing_list_id IS NULL')
      .andWhere('(fp.dispatch_id IS NULL OR fp.dispatch_id = 0)');
    const r = await qb.getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  private normalizeOrderRefForBol(orderNumber: string): string {
    return String(orderNumber ?? '')
      .trim()
      .replace(/^#+/u, '')
      .toLowerCase();
  }

  /** Mismo depósito que `sumDepot`, pero cajas ya atadas al pedido: `planned_sales_order_id` o BOL = nº pedido. */
  private async sumDepotReservedForOrder(line: SalesOrderLine, orderId: number, orderNumber: string): Promise<number> {
    const ref = this.normalizeOrderRefForBol(orderNumber);
    const qb = this.fpLineRepo
      .createQueryBuilder('fpl')
      .innerJoin(FinalPallet, 'fp', 'fp.id = fpl.final_pallet_id')
      .select('COALESCE(SUM(fpl.amount), 0)', 's');
    this.applyLineDimensions(qb, line);
    qb.andWhere('fp.status = :st', { st: 'definitivo' })
      .andWhere('fp.pt_packing_list_id IS NULL')
      .andWhere('(fp.dispatch_id IS NULL OR fp.dispatch_id = 0)');
    qb.andWhere(
      new Brackets((w) => {
        w.where('fp.planned_sales_order_id = :oid', { oid: orderId });
        if (ref.length > 0) {
          w.orWhere(
            "LOWER(TRIM(REGEXP_REPLACE(TRIM(COALESCE(fp.bol, '')), '^#+', '', 'g'))) = :refBol",
            { refBol: ref },
          );
        }
      }),
    );
    const r = await qb.getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  private async sumAssigned(
    line: SalesOrderLine,
    orderId: number,
    orderNumber: string,
    plIdsFromOrderDispatches: number[],
    reversedIds: number[],
  ): Promise<number> {
    const refBol = this.normalizeOrderRefForBol(orderNumber);
    const qb = this.fpLineRepo
      .createQueryBuilder('fpl')
      .innerJoin(FinalPallet, 'fp', 'fp.id = fpl.final_pallet_id')
      .innerJoin(PtPackingList, 'pl', 'pl.id = fp.pt_packing_list_id')
      .select('COALESCE(SUM(fpl.amount), 0)', 's');
    this.applyLineDimensions(qb, line);
    qb.andWhere('fp.pt_packing_list_id IS NOT NULL').andWhere('pl.status = :pls', { pls: 'confirmado' });
    if (reversedIds.length) {
      qb.andWhere('pl.id NOT IN (:...rev)', { rev: reversedIds });
    }
    qb.andWhere(
      new Brackets((root) => {
        root.where(
          new Brackets((standard) => {
            standard.where('fp.status = :stAsign', { stAsign: 'asignado_pl' });
            standard.andWhere(
              new Brackets((lnk) => {
                lnk.where('fp.planned_sales_order_id = :oidAssign', { oidAssign: orderId });
                if (plIdsFromOrderDispatches.length > 0) {
                  lnk.orWhere('fp.pt_packing_list_id IN (:...plidsAssign)', {
                    plidsAssign: plIdsFromOrderDispatches,
                  });
                }
                if (refBol.length > 0) {
                  lnk.orWhere(
                    "LOWER(TRIM(REGEXP_REPLACE(TRIM(COALESCE(fp.bol, '')), '^#+', '', 'g'))) = :refBolFp",
                    { refBolFp: refBol },
                  );
                  lnk.orWhere(
                    "LOWER(TRIM(REGEXP_REPLACE(TRIM(COALESCE(pl.numero_bol, '')), '^#+', '', 'g'))) = :refBolPl",
                    { refBolPl: refBol },
                  );
                }
              }),
            );
          }),
        );
        if (plIdsFromOrderDispatches.length > 0) {
          root.orWhere(
            new Brackets((legacy) => {
              legacy.where('fp.status = :stLegacy', { stLegacy: 'despachado' });
              legacy.andWhere('fp.pt_packing_list_id IN (:...plidsLegacy)', {
                plidsLegacy: plIdsFromOrderDispatches,
              });
            }),
          );
        }
      }),
    );
    const r = await qb.getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  private async sumDispatched(line: SalesOrderLine, orderId: number, reversedIds: number[]): Promise<number> {
    const qb = this.fpLineRepo
      .createQueryBuilder('fpl')
      .innerJoin(FinalPallet, 'fp', 'fp.id = fpl.final_pallet_id')
      .innerJoin(PtPackingList, 'pl', 'pl.id = fp.pt_packing_list_id')
      .innerJoin(DispatchPtPackingList, 'dpl', 'dpl.pt_packing_list_id = pl.id')
      .innerJoin(Dispatch, 'd', 'd.id = dpl.dispatch_id')
      .select('COALESCE(SUM(fpl.amount), 0)', 's');
    this.applyLineDimensions(qb, line);
    qb.andWhere('fp.status IN (:...fst)', { fst: ['asignado_pl', 'despachado'] })
      .andWhere('pl.status = :pls', { pls: 'confirmado' })
      .andWhere('d.orden_id = :oid2', { oid2: orderId })
      .andWhere('d.status IN (:...dst)', { dst: ['confirmado', 'despachado'] });
    if (reversedIds.length) {
      qb.andWhere('pl.id NOT IN (:...rev)', { rev: reversedIds });
    }
    const r = await qb.getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  /** RAW progress: lb from dispatch_reception_lines on confirmed RAW dispatches for this order. */
  private async sumDispatchedLb(line: SalesOrderLine, orderId: number): Promise<number> {
    const speciesId = line.species_id != null ? Number(line.species_id) : 0;
    if (!(speciesId > 0)) return 0;
    const qb = this.dispatchRawLineRepo
      .createQueryBuilder('drl')
      .innerJoin(Dispatch, 'd', 'd.id = drl.dispatch_id')
      .innerJoin(ReceptionLine, 'rl', 'rl.id = drl.reception_line_id')
      .select('COALESCE(SUM(drl.lb_dispatched::numeric), 0)', 's')
      .where('d.orden_id = :oid', { oid: orderId })
      .andWhere("COALESCE(d.source_kind, 'PT_PL') = 'RAW'")
      .andWhere('d.status IN (:...dst)', { dst: ['confirmado', 'despachado'] })
      .andWhere('rl.species_id = :sid', { sid: speciesId });
    if (line.variety_id != null && Number(line.variety_id) > 0) {
      qb.andWhere('rl.variety_id = :vid', { vid: Number(line.variety_id) });
    }
    const r = await qb.getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  async getProgress(orderId: number): Promise<SalesOrderProgressDto> {
    const order = await this.soRepo.findOne({
      where: { id: orderId },
      relations: ['lines', 'lines.presentation_format', 'lines.brand', 'lines.variety', 'lines.species'],
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    const sortedLines = [...(order.lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);

    const reversedIds = (await this.plRevRepo.find()).map((r) => Number(r.packing_list_id));

    const dispatches = await this.dispatchRepo.find({ where: { orden_id: orderId } });
    const dispatchIds = dispatches.map((d) => d.id);
    const dplRows =
      dispatchIds.length > 0
        ? await this.dplRepo.find({ where: { dispatch_id: In(dispatchIds) } })
        : [];
    const plIdsFromOrderDispatches = [...new Set(dplRows.map((r) => Number(r.pt_packing_list_id)))];

    const lines: SalesOrderProgressLineDto[] = [];
    let tr = 0,
      tp = 0,
      tpr = 0,
      ta = 0,
      td = 0,
      tpend = 0,
      trLb = 0,
      tdLb = 0,
      tpendLb = 0;

    for (const line of sortedLines) {
      const kind = (line.line_kind ?? 'PT_FORMAT') as 'PT_FORMAT' | 'RAW_WEIGHT';

      if (kind === 'RAW_WEIGHT') {
        const requestedLb = Number(line.requested_lb) || 0;
        const dispatchedLb = await this.sumDispatchedLb(line, orderId);
        const pendingLb = Math.max(0, requestedLb - dispatchedLb);
        const alerts: string[] = [];
        if (requestedLb > 0 && dispatchedLb > requestedLb + 0.02) alerts.push('despacho_sobre_pedido');

        let fulfillment: 'pendiente' | 'parcial' | 'completo' = 'pendiente';
        if (requestedLb <= 0) fulfillment = 'completo';
        else if (dispatchedLb + 0.02 >= requestedLb) fulfillment = 'completo';
        else if (dispatchedLb > 0) fulfillment = 'parcial';

        trLb += requestedLb;
        tdLb += dispatchedLb;
        tpendLb += pendingLb;

        lines.push({
          sales_order_line_id: line.id,
          line_kind: 'RAW_WEIGHT',
          presentation_format_id: null,
          format_code: null,
          requested_boxes: 0,
          requested_lb: requestedLb,
          species_id: line.species_id != null ? Number(line.species_id) : null,
          species_nombre: line.species?.nombre ?? null,
          unit_price: line.unit_price != null ? Number(line.unit_price) : null,
          brand_id: line.brand_id != null ? Number(line.brand_id) : null,
          brand_nombre: line.brand?.nombre ?? null,
          variety_id: line.variety_id != null ? Number(line.variety_id) : null,
          variety_nombre: line.variety?.nombre ?? null,
          produced_depot_boxes: 0,
          reserved_depot_boxes: 0,
          assigned_pl_boxes: 0,
          dispatched_boxes: 0,
          pending_boxes: 0,
          dispatched_lb: dispatchedLb,
          pending_lb: pendingLb,
          fulfillment,
          alerts,
        });
        continue;
      }

      const produced = await this.sumDepot(line);
      const reservedDepot = await this.sumDepotReservedForOrder(line, orderId, order.order_number ?? '');
      const assigned = await this.sumAssigned(
        line,
        orderId,
        order.order_number ?? '',
        plIdsFromOrderDispatches,
        reversedIds,
      );
      const dispatched = await this.sumDispatched(line, orderId, reversedIds);
      const reqBoxes = Number(line.requested_boxes) || 0;
      const pending = Math.max(0, reqBoxes - dispatched);

      const alerts: string[] = [];
      if (reqBoxes > 0 && dispatched > reqBoxes) alerts.push('despacho_sobre_pedido');
      if (reqBoxes > 0 && assigned > reqBoxes) alerts.push('asignacion_pl_sobre_pedido');
      if (reqBoxes > 0 && produced > reqBoxes) alerts.push('deposito_sobre_pedido');

      let fulfillment: 'pendiente' | 'parcial' | 'completo' = 'pendiente';
      if (reqBoxes <= 0) {
        fulfillment = 'completo';
      } else if (dispatched >= reqBoxes) {
        fulfillment = 'completo';
      } else if (dispatched > 0) {
        fulfillment = 'parcial';
      }

      tr += reqBoxes;
      tp += produced;
      tpr += reservedDepot;
      ta += assigned;
      td += dispatched;
      tpend += pending;

      lines.push({
        sales_order_line_id: line.id,
        line_kind: 'PT_FORMAT',
        presentation_format_id:
          line.presentation_format_id != null ? Number(line.presentation_format_id) : null,
        format_code: line.presentation_format?.format_code ?? null,
        requested_boxes: reqBoxes,
        requested_lb: null,
        species_id: null,
        species_nombre: null,
        unit_price: line.unit_price != null ? Number(line.unit_price) : null,
        brand_id: line.brand_id != null ? Number(line.brand_id) : null,
        brand_nombre: line.brand?.nombre ?? null,
        variety_id: line.variety_id != null ? Number(line.variety_id) : null,
        variety_nombre: line.variety?.nombre ?? null,
        produced_depot_boxes: produced,
        reserved_depot_boxes: reservedDepot,
        assigned_pl_boxes: assigned,
        dispatched_boxes: dispatched,
        pending_boxes: pending,
        dispatched_lb: null,
        pending_lb: null,
        fulfillment,
        alerts,
      });
    }

    const clienteRow = await this.clientRepo.findOne({ where: { id: Number(order.cliente_id) } });
    return {
      order: {
        id: order.id,
        order_number: order.order_number,
        cliente_id: Number(order.cliente_id),
        cliente_nombre: clienteRow?.nombre?.trim() ?? null,
      },
      lines,
      totals: {
        requested_boxes: tr,
        produced_depot_boxes: tp,
        reserved_depot_boxes: tpr,
        assigned_pl_boxes: ta,
        dispatched_boxes: td,
        pending_boxes: tpend,
        requested_lb: Number(trLb.toFixed(3)),
        dispatched_lb: Number(tdLb.toFixed(3)),
        pending_lb: Number(tpendLb.toFixed(3)),
      },
    };
  }

  /** Cajas despachadas por `dispatch.id` (PL confirmados, despacho confirmado/despachado). */
  private async sumDispatchedBoxesByDispatchIds(
    dispatchIds: number[],
    reversedIds: number[],
  ): Promise<Map<number, number>> {
    if (!dispatchIds.length) return new Map();
    const qb = this.fpLineRepo
      .createQueryBuilder('fpl')
      .innerJoin(FinalPallet, 'fp', 'fp.id = fpl.final_pallet_id')
      .innerJoin(PtPackingList, 'pl', 'pl.id = fp.pt_packing_list_id')
      .innerJoin(DispatchPtPackingList, 'dpl', 'dpl.pt_packing_list_id = pl.id')
      .innerJoin(Dispatch, 'd', 'd.id = dpl.dispatch_id')
      .select('d.id', 'dispatch_id')
      .addSelect('COALESCE(SUM(fpl.amount), 0)', 'dispatched')
      .where('d.id IN (:...dids)', { dids: dispatchIds })
      .andWhere('fp.status IN (:...fst)', { fst: ['asignado_pl', 'despachado'] })
      .andWhere('pl.status = :pls', { pls: 'confirmado' })
      .andWhere('d.status IN (:...dst)', { dst: ['confirmado', 'despachado'] });
    if (reversedIds.length) {
      qb.andWhere('pl.id NOT IN (:...rev)', { rev: reversedIds });
    }
    qb.groupBy('d.id');
    const rows = await qb.getRawMany<{ dispatch_id: string; dispatched: string }>();
    const map = new Map<number, number>();
    for (const r of rows) {
      map.set(Number(r.dispatch_id), Number(r.dispatched) || 0);
    }
    return map;
  }

  /**
   * Cruce pedido ↔ despacho por `orden_id` y por `numero_bol` = nº de pedido (normalizado).
   * Usado en listado comercial para separar pendientes de completados.
   * Incluye volumen PT (cajas) y, si aplica, volumen RAW (lb) en el mismo pedido.
   */
  async getOperationalSummaries(
    orders: Array<{
      id: number;
      order_number: string;
      requested_boxes: number;
      requested_lb?: number;
    }>,
  ): Promise<Map<number, SalesOrderOperationalSummary>> {
    const out = new Map<number, SalesOrderOperationalSummary>();
    if (!orders.length) return out;

    const orderIdSet = new Set(orders.map((o) => o.id));
    const orderIdByBolRef = new Map<string, number>();
    for (const o of orders) {
      const ref = this.normalizeOrderRefForBol(o.order_number);
      if (ref) orderIdByBolRef.set(ref, o.id);
    }

    const reversedIds = (await this.plRevRepo.find()).map((r) => Number(r.packing_list_id));

    const dispatches = await this.dispatchRepo.find({
      select: ['id', 'orden_id', 'numero_bol', 'status', 'source_kind'],
      order: { id: 'DESC' },
      take: 4000,
    });

    const dispatchIdsPerOrder = new Map<number, Set<number>>();
    const touch = (orderId: number, dispatchId: number) => {
      let set = dispatchIdsPerOrder.get(orderId);
      if (!set) {
        set = new Set<number>();
        dispatchIdsPerOrder.set(orderId, set);
      }
      set.add(dispatchId);
    };

    for (const d of dispatches) {
      const st = (d.status ?? '').trim().toLowerCase();
      if (st !== 'confirmado' && st !== 'despachado') continue;
      const did = Number(d.id);
      const oid = Number(d.orden_id);
      if (orderIdSet.has(oid)) {
        touch(oid, did);
      }
      const bolRef = this.normalizeOrderRefForBol(d.numero_bol ?? '');
      if (bolRef && orderIdByBolRef.has(bolRef)) {
        touch(orderIdByBolRef.get(bolRef)!, did);
      }
    }

    const allDispatchIds = [...new Set([...dispatchIdsPerOrder.values()].flatMap((s) => [...s]))];
    const boxesByDispatch = await this.sumDispatchedBoxesByDispatchIds(allDispatchIds, reversedIds);

    const rawLbByOrder = new Map<number, number>();
    const rawDispatchIds = dispatches
      .filter((d) => {
        const st = (d.status ?? '').trim().toLowerCase();
        return (
          (st === 'confirmado' || st === 'despachado') &&
          (d.source_kind ?? 'PT_PL') === 'RAW' &&
          orderIdSet.has(Number(d.orden_id))
        );
      })
      .map((d) => Number(d.id));
    if (rawDispatchIds.length) {
      const rawRows = await this.dispatchRawLineRepo
        .createQueryBuilder('drl')
        .innerJoin(Dispatch, 'd', 'd.id = drl.dispatch_id')
        .select('d.orden_id', 'orden_id')
        .addSelect('COALESCE(SUM(drl.lb_dispatched::numeric), 0)', 'lb')
        .where('d.id IN (:...ids)', { ids: rawDispatchIds })
        .groupBy('d.orden_id')
        .getRawMany<{ orden_id: string; lb: string }>();
      for (const r of rawRows) {
        rawLbByOrder.set(Number(r.orden_id), Number(r.lb) || 0);
      }
    }

    for (const o of orders) {
      const req = Number(o.requested_boxes) || 0;
      const reqLb = Number(o.requested_lb) || 0;
      const dispatchIds = dispatchIdsPerOrder.get(o.id) ?? new Set<number>();
      let dispatched = 0;
      for (const did of dispatchIds) {
        dispatched += boxesByDispatch.get(did) ?? 0;
      }
      const dispatchedLb = rawLbByOrder.get(o.id) ?? 0;

      let dispatch_by_orden = false;
      let dispatch_by_bol = false;
      for (const d of dispatches) {
        const st = (d.status ?? '').trim().toLowerCase();
        if (st !== 'confirmado' && st !== 'despachado') continue;
        if (Number(d.orden_id) === o.id) dispatch_by_orden = true;
        const bolRef = this.normalizeOrderRefForBol(d.numero_bol ?? '');
        const orderRef = this.normalizeOrderRefForBol(o.order_number);
        if (bolRef.length > 0 && bolRef === orderRef) dispatch_by_bol = true;
      }

      const pendingBoxes = Math.max(0, req - dispatched);
      const pendingLb = Math.max(0, reqLb - dispatchedLb);
      const hasVolume = req > 0 || reqLb > 0;
      const hasDispatchLink = dispatch_by_orden || dispatch_by_bol;

      let fulfillment: SalesOrderOperationalSummary['fulfillment'] = 'sin_volumen';
      if (!hasVolume) {
        fulfillment = 'sin_volumen';
      } else if ((req <= 0 || pendingBoxes <= 0.5) && (reqLb <= 0 || pendingLb <= 0.02)) {
        fulfillment = 'completo';
      } else if (dispatched > 0 || dispatchedLb > 0) {
        fulfillment = 'parcial';
      } else {
        fulfillment = 'pendiente';
      }

      const operatively_complete =
        hasVolume &&
        (fulfillment === 'completo' || (hasDispatchLink && (dispatched > 0 || dispatchedLb > 0)));

      const dispatch_match: SalesOrderOperationalSummary['dispatch_match'] =
        dispatch_by_orden && dispatch_by_bol ? 'ambos' : dispatch_by_bol ? 'bol' : dispatch_by_orden ? 'orden' : null;

      out.set(o.id, {
        dispatched_boxes: dispatched,
        pending_boxes: pendingBoxes,
        dispatch_by_orden,
        dispatch_by_bol,
        operatively_complete,
        fulfillment,
        dispatch_match,
      });
    }

    return out;
  }
}
