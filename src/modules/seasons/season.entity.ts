import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SeasonStatus = 'active' | 'closing' | 'closed';
export type SeasonSource = 'system' | 'legacy';

@Entity('seasons')
export class Season {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int', unique: true })
  year: number;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 20 })
  status: SeasonStatus;

  @Column({ type: 'varchar', length: 20 })
  source: SeasonSource;

  @Column({ type: 'timestamptz' })
  opened_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
