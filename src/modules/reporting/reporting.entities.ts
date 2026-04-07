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
