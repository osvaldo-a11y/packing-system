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
