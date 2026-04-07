import { toJsonRecord } from '../../common/to-json-record';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddDispatchTagDto, CreateDispatchDto, CreateSalesOrderDto, ModifySalesOrderDto } from './dispatch.dto';
import { Dispatch, DispatchTagItem, Invoice, InvoiceItem, PackingList, SalesOrder, SalesOrderModification } from './dispatch.entities';

@Injectable()
export class DispatchBillingService {
  constructor(
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(DispatchTagItem) private readonly dtiRepo: Repository<DispatchTagItem>,
    @InjectRepository(PackingList) private readonly plRepo: Repository<PackingList>,
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly invItemRepo: Repository<InvoiceItem>,
    @InjectRepository(SalesOrderModification) private readonly soModRepo: Repository<SalesOrderModification>,
  ) {}

  async createSalesOrder(dto: CreateSalesOrderDto) {
    const seq = (await this.soRepo.count()) + 1;
    return this.soRepo.save(
      this.soRepo.create({
        cliente_id: dto.cliente_id,
        requested_pallets: dto.requested_pallets,
        requested_boxes: dto.requested_boxes,
        order_number: `SO-${String(seq).padStart(5, '0')}`,
      }),
    );
  }

  async modifySalesOrder(orderId: number, dto: ModifySalesOrderDto) {
    const order = await this.soRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const before = { ...order };
    order.requested_pallets = dto.requested_pallets;
    order.requested_boxes = dto.requested_boxes;
    await this.soRepo.save(order);
    await this.soModRepo.save(
      this.soModRepo.create({
        order_id: orderId,
        before_payload: toJsonRecord(before),
        after_payload: toJsonRecord(order),
      }),
    );

    const dispatches = await this.dispatchRepo.find({ where: { orden_id: orderId } });
    for (const d of dispatches) {
      await this.generatePackingList(d.id);
      await this.generateInvoice(d.id);
    }
    return order;
  }

  async createDispatch(dto: CreateDispatchDto) {
    return this.dispatchRepo.save(
      this.dispatchRepo.create({
        ...dto,
        fecha_despacho: new Date(dto.fecha_despacho),
        temperatura_f: dto.temperatura_f.toFixed(2),
      }),
    );
  }

  async addTag(dispatchId: number, dto: AddDispatchTagDto) {
    return this.dtiRepo.save(
      this.dtiRepo.create({
        dispatch_id: dispatchId,
        ...dto,
        unit_price: dto.unit_price.toFixed(4),
        pallet_cost: dto.pallet_cost.toFixed(4),
      }),
    );
  }

  async generatePackingList(dispatchId: number) {
    const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');
    const items = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });
    const existing = await this.plRepo.findOne({ where: { dispatch_id: dispatchId } });
    if (existing) {
      existing.printable_payload = { dispatch, items };
      return this.plRepo.save(existing);
    }
    const seq = (await this.plRepo.count()) + 1;
    return this.plRepo.save(
      this.plRepo.create({
        dispatch_id: dispatchId,
        packing_number: `PK-${String(seq).padStart(5, '0')}`,
        printable_payload: { dispatch, items },
      }),
    );
  }

  async generateInvoice(dispatchId: number) {
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
      await this.invItemRepo.delete({ invoice_id: inv.id });
    }

    let subtotal = 0;
    let totalCost = 0;
    for (const r of rows) {
      const lineSubtotal = r.cajas_despachadas * Number(r.unit_price);
      const lineCost = r.pallets_despachados * Number(r.pallet_cost);
      subtotal += lineSubtotal;
      totalCost += lineCost;
      await this.invItemRepo.save(
        this.invItemRepo.create({
          invoice_id: inv.id,
          tarja_id: r.tarja_id,
          cajas: r.cajas_despachadas,
          unit_price: r.unit_price,
          line_subtotal: lineSubtotal.toFixed(2),
          pallet_cost_total: lineCost.toFixed(2),
        }),
      );
    }

    inv.subtotal = subtotal.toFixed(2);
    inv.total_cost = totalCost.toFixed(2);
    inv.total = subtotal.toFixed(2);
    return this.invRepo.save(inv);
  }
}
