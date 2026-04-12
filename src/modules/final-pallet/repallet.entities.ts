import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FinalPallet, FinalPalletLine } from './final-pallet.entities';

@Entity('repallet_events')
export class RepalletEvent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /** Si se aplicó reversa operativa (el pallet resultado pasa a revertido; orígenes recuperan stock). */
  @Column({ type: 'timestamptz', nullable: true })
  reversed_at?: Date | null;

  @Column({ type: 'bigint' })
  result_final_pallet_id: number;

  @ManyToOne(() => FinalPallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'result_final_pallet_id' })
  result_final_pallet: FinalPallet;
}

@Entity('repallet_reversals')
export class RepalletReversal {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'bigint', unique: true })
  repallet_event_id: number;

  @OneToOne(() => RepalletEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repallet_event_id' })
  event: RepalletEvent;

  @Column({ type: 'varchar', length: 80 })
  reversed_by_username: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}

@Entity('repallet_sources')
export class RepalletSource {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  event_id: number;

  @ManyToOne(() => RepalletEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: RepalletEvent;

  @Column({ type: 'bigint' })
  source_final_pallet_id: number;

  @ManyToOne(() => FinalPallet)
  @JoinColumn({ name: 'source_final_pallet_id' })
  source_final_pallet: FinalPallet;

  @Column({ type: 'int' })
  boxes_removed: number;

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  pounds_removed: string;
}

@Entity('repallet_line_provenance')
export class RepalletLineProvenance {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  event_id: number;

  @ManyToOne(() => RepalletEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: RepalletEvent;

  @Column({ type: 'bigint' })
  source_final_pallet_id: number;

  /** Id de línea origen al momento del repaletizaje (la fila puede haber sido borrada después). */
  @Column({ type: 'bigint', nullable: true })
  source_line_id?: number | null;

  @Column({ type: 'bigint' })
  dest_final_pallet_line_id: number;

  @ManyToOne(() => FinalPalletLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dest_final_pallet_line_id' })
  dest_line: FinalPalletLine;

  @Column({ type: 'int' })
  boxes: number;

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  pounds: string;

  @Column({ type: 'bigint' })
  variety_id: number;

  @Column({ type: 'bigint', nullable: true })
  fruit_process_id?: number | null;
}
