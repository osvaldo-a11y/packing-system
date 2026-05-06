import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Brand, Client } from '../traceability/operational.entities';
import { PtPackingList } from '../pt-packing-list/pt-packing-list.entities';
import { PresentationFormat, Variety } from '../traceability/traceability.entities';

export type DispatchStatus = 'borrador' | 'confirmado' | 'despachado';

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

  /** Fecha/hora del pedido (historial / import legado). */
  @Column({ type: 'timestamptz', nullable: true })
  fecha_pedido?: Date | null;

  /** Fecha estimada o programada de despacho comunicada en el pedido (import). */
  @Column({ type: 'timestamptz', nullable: true })
  fecha_despacho_cliente?: Date | null;

  /** Estado comercial textual (ej. enviado) — paralelo al flujo logístico. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  estado_comercial?: string | null;

  /** Líneas por formato (fuente de verdad comercial); totales del pedido se derivan de estas filas. */
  @OneToMany(() => SalesOrderLine, (l) => l.sales_order)
  lines?: SalesOrderLine[];
}

/**
 * Línea de pedido: cajas por formato; precio/caja y marca/variedad opcionales para cruce con producción y despacho.
 * (Métricas de avance operativo — producción, PL, despacho — se podrán enlazar por formato + marca/variedad.)
 */
@Entity('sales_order_lines')
export class SalesOrderLine {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  sales_order_id: number;

  @ManyToOne(() => SalesOrder, (o) => o.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  sales_order: SalesOrder;

  @Column({ type: 'bigint' })
  presentation_format_id: number;

  @ManyToOne(() => PresentationFormat, { eager: false })
  @JoinColumn({ name: 'presentation_format_id' })
  presentation_format: PresentationFormat;

  @Column({ type: 'int' })
  requested_boxes: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_price?: string | null;

  @Column({ type: 'bigint', nullable: true })
  brand_id?: number | null;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand | null;

  @Column({ type: 'bigint', nullable: true })
  variety_id?: number | null;

  @ManyToOne(() => Variety, { nullable: true })
  @JoinColumn({ name: 'variety_id' })
  variety?: Variety | null;

  @Column({ type: 'int', default: 0 })
  sort_order: number;
}

@Entity('dispatches')
export class Dispatch {
  @PrimaryGeneratedColumn('increment')
  id: number;
  @Column({ type: 'bigint' })
  orden_id: number;
  @Column({ type: 'bigint' })
  cliente_id: number;
  @Column({ type: 'timestamp' })
  fecha_despacho: Date;
  @Column({ type: 'varchar', length: 50, unique: true })
  numero_bol: string;

  /**
   * Origen del BOL respecto a packing lists PT:
   * inherited_from_pl | manual_entry | dispatch_only | synced_to_pls
   */
  @Column({ type: 'varchar', length: 32, default: 'manual_entry' })
  bol_origin: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  temperatura_f: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  thermograph_serial?: string | null;

  @Column({ type: 'text', nullable: true })
  thermograph_notes?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  final_pallet_unit_prices?: Record<string, number> | null;

  @Column({ type: 'bigint', nullable: true })
  client_id?: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  /** Ciclo logístico: borrador → confirmado → despachado (no implica movimiento de stock PT). */
  @Column({ type: 'varchar', length: 20, default: 'borrador' })
  status: DispatchStatus;

  /** Momento en que el despacho pasó a confirmado (documento cerrado operativamente). */
  @Column({ type: 'timestamptz', nullable: true })
  dispatch_confirmed_at?: Date | null;

  /** Momento en que se registró la salida física (despachado). */
  @Column({ type: 'timestamptz', nullable: true })
  dispatch_despachado_at?: Date | null;
}

/** Agrupa uno o más packing list PT en un despacho (sin duplicar PL en otro despacho). */
@Entity('dispatch_pt_packing_lists')
export class DispatchPtPackingList {
  @PrimaryColumn({ type: 'bigint' })
  dispatch_id: number;

  @PrimaryColumn({ type: 'bigint' })
  pt_packing_list_id: number;

  @ManyToOne(() => Dispatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispatch_id' })
  dispatch: Dispatch;

  @ManyToOne(() => PtPackingList, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pt_packing_list_id' })
  pt_packing_list: PtPackingList;
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
  /** Líneas generadas desde despacho suelen tener tarja; líneas manuales (factura tipo legado) pueden ir sin tarja. */
  @Column({ type: 'bigint', nullable: true })
  tarja_id?: number | null;

  @Column({ type: 'bigint', nullable: true })
  final_pallet_id?: number | null;

  /** Proceso de fruta asociado a la línea de pallet (respaldo de productor si falta tarja). */
  @Column({ type: 'bigint', nullable: true })
  fruit_process_id?: number | null;

  /** Motivo cuando no hay tarja o la trazabilidad es parcial (auditoría / UI). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  traceability_note?: string | null;

  @Column({ type: 'int' })
  cajas: number;
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  unit_price: string;
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  line_subtotal: string;
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  pallet_cost_total: string;
  @Column({ type: 'boolean', default: false })
  is_manual: boolean;
  @Column({ type: 'bigint', nullable: true })
  species_id?: number | null;
  @Column({ type: 'bigint', nullable: true })
  variety_id?: number | null;
  @Column({ type: 'varchar', length: 40, nullable: true })
  packaging_code?: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true })
  brand?: string | null;
  @Column({ type: 'int', nullable: true })
  trays?: number | null;
  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  pounds?: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true })
  packing_list_ref?: string | null;

  /** Texto libre para ajustes manuales (cargo/descuento); líneas automáticas no lo usan. */
  @Column({ type: 'text', nullable: true })
  manual_description?: string | null;

  /** cargo | descuento — solo aplica con is_manual y manual_description. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  manual_line_kind?: string | null;
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
