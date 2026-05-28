import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type PrintJobStatus = 'pending' | 'claimed' | 'done' | 'failed';

@Entity('print_jobs')
export class PrintJob {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  filename!: string;

  @Column({ type: 'text' })
  zpl!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  printer_name!: string | null;

  @Column({ type: 'int', default: 1 })
  copies!: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: PrintJobStatus;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by_user_id!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  claimed_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null;
}
