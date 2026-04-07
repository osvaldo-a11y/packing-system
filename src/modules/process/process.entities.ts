import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum ProcessResult {
  IQF = 'IQF',
  JUGO = 'jugo',
  PERDIDO = 'perdido',
  OTRO = 'otro',
}

@Entity('fruit_processes')
export class FruitProcess {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  recepcion_id: number;

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

  @Column({ type: 'int', default: 100 })
  cajas_por_pallet: number;

  @Column({ type: 'int', default: 0 })
  total_cajas: number;

  @Column({ type: 'int', default: 0 })
  total_pallets: number;
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
