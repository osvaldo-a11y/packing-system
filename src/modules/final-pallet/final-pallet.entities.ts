import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SalesOrder } from '../dispatch/dispatch.entities';
import { FruitProcess, PtTag } from '../process/process.entities';
import { Brand, Client } from '../traceability/operational.entities';
import { PresentationFormat, QualityGrade, Species, Variety } from '../traceability/traceability.entities';

export type FinalPalletStatus =
  | 'borrador'
  | 'definitivo'
  | 'despachado'
  | 'anulado'
  | 'repaletizado'
  | 'revertido'
  /** Reservado por packing list logístico confirmado (fuera de existencias depósito). */
  | 'asignado_pl';
export type FruitQualityMode = 'proceso' | 'bulk';

@Entity('final_pallets')
export class FinalPallet {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 28, default: 'borrador' })
  status: FinalPalletStatus;

  @Column({ type: 'bigint', nullable: true })
  species_id?: number | null;

  @ManyToOne(() => Species, { nullable: true })
  @JoinColumn({ name: 'species_id' })
  species?: Species | null;

  @Column({ type: 'bigint', nullable: true })
  quality_grade_id?: number | null;

  @ManyToOne(() => QualityGrade, { nullable: true })
  @JoinColumn({ name: 'quality_grade_id' })
  quality_grade?: QualityGrade | null;

  /** Código corner board = identidad del pallet (generado: PF-{id}). */
  @Column({ type: 'varchar', length: 80, default: '' })
  corner_board_code: string;

  /** Texto de etiqueta clamshell (desde materiales ligados al formato o manual). */
  @Column({ type: 'varchar', length: 120, default: '' })
  clamshell_label: string;

  @Column({ type: 'bigint', nullable: true })
  brand_id?: number | null;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand | null;

  @Column({ type: 'varchar', length: 80, default: '' })
  dispatch_unit: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  packing_type: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  market: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bol?: string | null;

  /**
   * Pedido / orden de venta prevista (planificación comercial). Sin validación estricta por ahora;
   * reservado para futuras reglas contra `sales_orders`.
   */
  @Column({ type: 'bigint', nullable: true })
  planned_sales_order_id?: number | null;

  @ManyToOne(() => SalesOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planned_sales_order_id' })
  planned_sales_order?: SalesOrder | null;

  @Column({ type: 'bigint', nullable: true })
  client_id?: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  /** Calidad operativa: fruta de proceso vs bulk. */
  @Column({ type: 'varchar', length: 16, default: 'proceso' })
  fruit_quality_mode: FruitQualityMode;

  @Column({ type: 'bigint', nullable: true })
  presentation_format_id?: number | null;

  @ManyToOne(() => PresentationFormat, { nullable: true })
  @JoinColumn({ name: 'presentation_format_id' })
  presentation_format?: PresentationFormat | null;

  /** Despacho al que se asignó este pallet (packing list / salida). */
  @Column({ type: 'bigint', nullable: true })
  dispatch_id?: number | null;

  /** Packing list logístico (PT) que reservó este pallet (si aplica). */
  @Column({ type: 'bigint', nullable: true })
  pt_packing_list_id?: number | null;

  /**
   * Unidad PT de origen (flujo normal 1:1). Null en pallets legacy o resultado de repaletizado
   * sin tarja única.
   */
  @Column({ type: 'bigint', nullable: true })
  tarja_id?: number | null;

  @ManyToOne(() => PtTag, { nullable: true })
  @JoinColumn({ name: 'tarja_id' })
  pt_tag?: PtTag | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => FinalPalletLine, (l) => l.final_pallet)
  lines?: FinalPalletLine[];
}

@Entity('final_pallet_lines')
export class FinalPalletLine {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  final_pallet_id: number;

  @ManyToOne(() => FinalPallet, (p) => p.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'final_pallet_id' })
  final_pallet: FinalPallet;

  @Column({ type: 'int', default: 0 })
  line_order: number;

  @Column({ type: 'bigint', nullable: true })
  fruit_process_id?: number | null;

  @ManyToOne(() => FruitProcess, { nullable: true })
  @JoinColumn({ name: 'fruit_process_id' })
  fruit_process?: FruitProcess | null;

  @Column({ type: 'timestamp' })
  fecha: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ref_text?: string | null;

  @Column({ type: 'bigint' })
  variety_id: number;

  @ManyToOne(() => Variety)
  @JoinColumn({ name: 'variety_id' })
  variety: Variety;

  @Column({ type: 'varchar', length: 40, nullable: true })
  caliber?: string | null;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  pounds: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  net_lb?: string | null;
}
