import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('import_logs')
export class ImportLog {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'varchar', length: 120 })
  username: string;

  /** Route segment: receptions, processes, … */
  @Column({ type: 'varchar', length: 64 })
  entity_key: string;

  @Column({ type: 'int' })
  total_rows: number;

  @Column({ type: 'int' })
  inserted: number;

  @Column({ type: 'int', default: 0 })
  skipped: number;

  @Column({ type: 'int' })
  errors_count: number;

  /** First chunk of errors for audit (full list returned in HTTP response). */
  @Column({ type: 'jsonb', nullable: true })
  errors_sample?: Array<{ row: number; field?: string; message: string }> | null;
}
