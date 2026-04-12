import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Brand, Client } from '../traceability/operational.entities';
import {
  ProcessMachine,
  ProcessResultComponent,
  Reception,
  ReceptionLine,
} from '../traceability/traceability.entities';

export enum ProcessResult {
  IQF = 'IQF',
  /** Producto terminado en cajas (pallet); distinto de IQF congelado en algunas plantas. */
  CAJAS = 'cajas',
  JUGO = 'jugo',
  PERDIDO = 'perdido',
  OTRO = 'otro',
}

export type FruitProcessStatus = 'borrador' | 'confirmado' | 'cerrado';

@Entity('fruit_processes')
export class FruitProcess {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  recepcion_id: number;

  @ManyToOne(() => Reception)
  @JoinColumn({ name: 'recepcion_id' })
  reception: Reception;

  @Column({ type: 'timestamp' })
  fecha_proceso: Date;

  @Column({ type: 'bigint' })
  productor_id: number;

  @Column({ type: 'bigint' })
  variedad_id: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  peso_procesado_lb: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  merma_lb: string;

  @Column({ type: 'decimal', precision: 8, scale: 4 })
  porcentaje_procesado: string;

  @Column({ type: 'enum', enum: ProcessResult })
  resultado: ProcessResult;

  @Column({ type: 'bigint', nullable: true })
  tarja_id?: number;

  @Column({ type: 'bigint', nullable: true })
  reception_line_id?: number;

  @ManyToOne(() => ReceptionLine, { nullable: true })
  @JoinColumn({ name: 'reception_line_id' })
  reception_line?: ReceptionLine;

  @Column({ type: 'bigint', nullable: true })
  process_machine_id?: number | null;

  @ManyToOne(() => ProcessMachine, { nullable: true })
  @JoinColumn({ name: 'process_machine_id' })
  process_machine?: ProcessMachine | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  temperatura_f?: string;

  @Column({ type: 'text', nullable: true })
  nota?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_entrada?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_iqf?: string;

  /** Cache derivada de tarjas (Σ cajas × lb/caja por formato de tarja); no se define en el alta del proceso. */
  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_packout?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_sobrante?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_producto_terminado?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_desecho?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_jugo?: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  lb_merma_balance?: string;

  @Column({ type: 'boolean', default: false })
  balance_closed: boolean;

  @Column({ type: 'varchar', length: 20, default: 'borrador' })
  process_status: FruitProcessStatus;

  @CreateDateColumn()
  created_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date;
}

@Entity('pt_tags')
export class PtTag {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  tag_code: string;

  @Column({ type: 'timestamp' })
  fecha: Date;

  @Column({ type: 'enum', enum: ProcessResult })
  resultado: ProcessResult;

  @Column({ type: 'varchar', length: 20 })
  format_code: string;

  @Column({ type: 'int', default: 0 })
  cajas_por_pallet: number;

  @Column({ type: 'int', default: 0 })
  total_cajas: number;

  @Column({ type: 'int', default: 0 })
  total_pallets: number;

  @Column({ type: 'bigint', nullable: true })
  client_id?: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  @Column({ type: 'bigint', nullable: true })
  brand_id?: number | null;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  bol?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  net_weight_lb?: string | null;
}

@Entity('fruit_process_line_allocations')
@Unique('uq_fpla_process_line', ['process_id', 'reception_line_id'])
export class FruitProcessLineAllocation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  process_id: number;

  @ManyToOne(() => FruitProcess, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'process_id' })
  process: FruitProcess;

  @Column({ type: 'bigint' })
  reception_line_id: number;

  @ManyToOne(() => ReceptionLine)
  @JoinColumn({ name: 'reception_line_id' })
  reception_line: ReceptionLine;

  /** Copia del `reception_lines.lot_code` al consumir MP (trazabilidad explícita). */
  @Column({ type: 'varchar', length: 96 })
  lot_code: string;

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  lb_allocated: string;
}

@Entity('fruit_process_component_values')
@Unique('uq_fpcv_process_component', ['fruit_process_id', 'component_id'])
export class FruitProcessComponentValue {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  fruit_process_id: number;

  @ManyToOne(() => FruitProcess, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fruit_process_id' })
  fruit_process: FruitProcess;

  @Column({ type: 'bigint' })
  component_id: number;

  @ManyToOne(() => ProcessResultComponent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'component_id' })
  component: ProcessResultComponent;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_value: string;
}

@Entity('raw_material_movements')
export class RawMaterialMovement {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint', nullable: true })
  reception_line_id: number | null;

  @ManyToOne(() => ReceptionLine, { nullable: true })
  @JoinColumn({ name: 'reception_line_id' })
  reception_line?: ReceptionLine | null;

  @Column({ type: 'bigint', nullable: true })
  fruit_process_id: number | null;

  @ManyToOne(() => FruitProcess, { nullable: true })
  @JoinColumn({ name: 'fruit_process_id' })
  fruit_process?: FruitProcess | null;

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity_delta_lb: string;

  @Column({ type: 'varchar', length: 16 })
  movement_kind: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  ref_type?: string | null;

  @Column({ type: 'bigint', nullable: true })
  ref_id?: number | null;

  @Column({ type: 'text', nullable: true })
  nota?: string | null;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('pt_tag_merges')
export class PtTagMerge {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  result_tarja_id: number;

  @ManyToOne(() => PtTag)
  @JoinColumn({ name: 'result_tarja_id' })
  result_tarja: PtTag;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('pt_tag_merge_sources')
export class PtTagMergeSource {
  @PrimaryColumn({ type: 'bigint' })
  merge_id: number;

  @PrimaryColumn({ type: 'bigint' })
  source_tarja_id: number;
}

@Entity('pt_tag_lineage')
export class PtTagLineage {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  ancestor_tarja_id: number;

  @Column({ type: 'bigint' })
  descendant_tarja_id: number;

  @Column({ type: 'varchar', length: 24 })
  relation: string;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('pt_tag_audits')
export class PtTagAudit {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  tarja_id: number;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'simple-json' })
  before_payload: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  after_payload: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('pt_tag_items')
@Unique('uq_pti_unique_process_per_tag', ['tarja_id', 'process_id'])
export class PtTagItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  tarja_id: number;

  @Column({ type: 'bigint' })
  process_id: number;

  @Column({ type: 'bigint' })
  productor_id: number;

  @Column({ type: 'int' })
  cajas_generadas: number;

  @Column({ type: 'int' })
  pallets_generados: number;
}
