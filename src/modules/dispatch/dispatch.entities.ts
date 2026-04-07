import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('sales_orders')
export class SalesOrder {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'varchar', length: 40, unique: true })
  order_number: string;
  @Column({ type: 'bigint' })
  cliente_id: number;

  @Column({ type: 'int', default: 0 })
  requested_pallets: number;

  @Column({ type: 'int', default: 0 })
  requested_boxes: number;
}

@Entity('dispatches')
export class Dispatch {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'bigint' })
  orden_id: number;
  @Column({ type: 'bigint' })
  cliente_id: number;
  /** `datetime` mapea a `timestamp` en PostgreSQL y es compatible con SQLite (tests e2e). */
  @Column({ type: 'datetime' })
  fecha_despacho: Date;
  @Column({ type: 'varchar', length: 50, unique: true })
  numero_bol: string;
  @Column({ type: 'decimal', precision: 6, scale: 2 })
  temperatura_f: string;
}

@Entity('dispatch_tag_items')
@Unique('uq_dti_dispatch_tag', ['dispatch_id', 'tarja_id'])
export class DispatchTagItem {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'bigint' })
  dispatch_id: number;
  @Column({ type: 'bigint' })
  tarja_id: number;
  @Column({ type: 'int' })
  cajas_despachadas: number;
  @Column({ type: 'int' })
  pallets_despachados: number;
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  unit_price: string;
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  pallet_cost: string;
}

@Entity('packing_lists')
export class PackingList {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'bigint', unique: true })
  dispatch_id: number;
  @Column({ type: 'varchar', length: 40, unique: true })
  packing_number: string;
  @Column({ type: 'simple-json', nullable: true })
  printable_payload?: Record<string, unknown>;
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'bigint', unique: true })
  dispatch_id: number;
  @Column({ type: 'varchar', length: 40, unique: true })
  invoice_number: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  subtotal: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total_cost: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total: string;
}

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'bigint' })
  invoice_id: number;
  @Column({ type: 'bigint' })
  tarja_id: number;
  @Column({ type: 'int' })
  cajas: number;
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  unit_price: string;
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  line_subtotal: string;
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  pallet_cost_total: string;
}

@Entity('sales_order_modifications')
export class SalesOrderModification {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  order_id: number;

  @Column({ type: 'simple-json' })
  before_payload: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  after_payload: Record<string, unknown>;
}
