import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('report_snapshots')
export class ReportSnapshot {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 80 })
  report_name: string;

  @Column({ type: 'simple-json' })
  filters: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('packing_costs')
export class PackingCost {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  species_id: number;

  /** Temporada opcional para evolución futura de costos (ej: 2026-2027). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  season: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  price_per_lb: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('packing_format_surcharges')
export class PackingFormatSurcharge {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 80 })
  format_code: string;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 0 })
  surcharge_per_lb: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  season: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('material_cost_adjustments')
export class MaterialCostAdjustment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  adjustment_type: 'per_box' | 'per_lb' | 'percent';

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  value: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  format_code: string | null;

  @Column({ type: 'bigint', nullable: true })
  producer_id: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  season: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('machine_processing_rates')
export class MachineProcessingRate {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  rate_per_lb: string;

  @Column({ type: 'bigint', nullable: true })
  species_id: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  season: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}
