import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from '../traceability/operational.entities';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { PtPackingList, PtPackingListReversalEvent } from '../pt-packing-list/pt-packing-list.entities';
import { Dispatch, DispatchPtPackingList, SalesOrder, SalesOrderLine } from './dispatch.entities';

export type SalesOrderProgressLineDto = {
  sales_order_line_id: number;
  presentation_format_id: number;
  format_code: string | null;
  requested_boxes: number;
  unit_price: number | null;
  brand_id: number | null;
  brand_nombre: string | null;
  variety_id: number | null;
  variety_nombre: string | null;
  produced_depot_boxes: number;
  assigned_pl_boxes: number;
  dispatched_boxes: number;
  pending_boxes: number;
  /** Indicador de avance respecto al pedido. */
  fulfillment: 'pendiente' | 'parcial' | 'completo';
  alerts: string[];
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
    assigned_pl_boxes: number;
    dispatched_boxes: number;
    pending_boxes: number;
  };
};

@Injectable()
export class SalesOrderProgressService {
  constructor(
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly soLineRepo: Repository<SalesOrderLine>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(DispatchPtPackingList) private readonly dplRepo: Repository<DispatchPtPackingList>,
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

  private async sumAssigned(
    line: SalesOrderLine,
    orderId: number,
    plIdsFromOrderDispatches: number[],
    reversedIds: number[],
  ): Promise<number> {
    const qb = this.fpLineRepo
      .createQueryBuilder('fpl')
      .innerJoin(FinalPallet, 'fp', 'fp.id = fpl.final_pallet_id')
      .innerJoin(PtPackingList, 'pl', 'pl.id = fp.pt_packing_list_id')
      .select('COALESCE(SUM(fpl.amount), 0)', 's');
    this.applyLineDimensions(qb, line);
    qb.andWhere('fp.status = :st', { st: 'asignado_pl' })
      .andWhere('fp.pt_packing_list_id IS NOT NULL')
      .andWhere('pl.status = :pls', { pls: 'confirmado' });
    if (reversedIds.length) {
      qb.andWhere('pl.id NOT IN (:...rev)', { rev: reversedIds });
    }
    qb.andWhere(
      new Brackets((w) => {
        w.where('fp.planned_sales_order_id = :oid', { oid: orderId });
        if (plIdsFromOrderDispatches.length > 0) {
          w.orWhere('fp.pt_packing_list_id IN (:...plids)', { plids: plIdsFromOrderDispatches });
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
    qb.andWhere('fp.status = :st', { st: 'asignado_pl' })
      .andWhere('pl.status = :pls', { pls: 'confirmado' })
      .andWhere('d.orden_id = :oid2', { oid2: orderId })
      .andWhere('d.status IN (:...dst)', { dst: ['confirmado', 'despachado'] });
    if (reversedIds.length) {
      qb.andWhere('pl.id NOT IN (:...rev)', { rev: reversedIds });
    }
    const r = await qb.getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  async getProgress(orderId: number): Promise<SalesOrderProgressDto> {
    const order = await this.soRepo.findOne({
      where: { id: orderId },
      relations: ['lines', 'lines.presentation_format', 'lines.brand', 'lines.variety'],
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
      ta = 0,
      td = 0,
      tpend = 0;

    for (const line of sortedLines) {
      const produced = await this.sumDepot(line);
      const assigned = await this.sumAssigned(line, orderId, plIdsFromOrderDispatches, reversedIds);
      const dispatched = await this.sumDispatched(line, orderId, reversedIds);
      const pending = Math.max(0, line.requested_boxes - dispatched);

      const alerts: string[] = [];
      if (line.requested_boxes > 0 && dispatched > line.requested_boxes) alerts.push('despacho_sobre_pedido');
      if (line.requested_boxes > 0 && assigned > line.requested_boxes) alerts.push('asignacion_pl_sobre_pedido');
      if (line.requested_boxes > 0 && produced > line.requested_boxes) alerts.push('deposito_sobre_pedido');

      let fulfillment: 'pendiente' | 'parcial' | 'completo' = 'pendiente';
      if (line.requested_boxes <= 0) {
        fulfillment = 'completo';
      } else if (dispatched >= line.requested_boxes) {
        fulfillment = 'completo';
      } else if (dispatched > 0) {
        fulfillment = 'parcial';
      }

      tr += line.requested_boxes;
      tp += produced;
      ta += assigned;
      td += dispatched;
      tpend += pending;

      lines.push({
        sales_order_line_id: line.id,
        presentation_format_id: Number(line.presentation_format_id),
        format_code: line.presentation_format?.format_code ?? null,
        requested_boxes: line.requested_boxes,
        unit_price: line.unit_price != null ? Number(line.unit_price) : null,
        brand_id: line.brand_id != null ? Number(line.brand_id) : null,
        brand_nombre: line.brand?.nombre ?? null,
        variety_id: line.variety_id != null ? Number(line.variety_id) : null,
        variety_nombre: line.variety?.nombre ?? null,
        produced_depot_boxes: produced,
        assigned_pl_boxes: assigned,
        dispatched_boxes: dispatched,
        pending_boxes: pending,
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
        assigned_pl_boxes: ta,
        dispatched_boxes: td,
        pending_boxes: tpend,
      },
    };
  }
}
