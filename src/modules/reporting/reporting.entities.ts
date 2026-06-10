import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Tipos de snapshot persistidos en `report_snapshots`. */
export type ReportSnapshotType = 'season_closing' | 'user_saved';

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

  /** FK lógica a `seasons.id` (temporada congelada). Null en snapshots guardados por el usuario. */
  @Column({ type: 'bigint', nullable: true })
  season_id: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  snapshot_type: ReportSnapshotType | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  /** Solo un snapshot vigente por (season_id, snapshot_type); false en snapshots legacy/usuario. */
  @Column({ type: 'boolean', default: false })
  is_current: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  generated_by: string | null;

  /** Sello de versión (commit/hash) al momento de generar. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  source_version: string | null;

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

@Entity('material_price_targets')
export class MaterialPriceTarget {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  format_code: string | null;

  @Column({ type: 'bigint', nullable: true })
  producer_id: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  target_price_per_box: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  season: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}
