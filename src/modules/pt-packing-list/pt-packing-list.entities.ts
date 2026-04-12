import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../traceability/operational.entities';
import { FinalPallet } from '../final-pallet/final-pallet.entities';

export type PtPackingListStatus = 'borrador' | 'confirmado' | 'anulado';

@Entity('pt_packing_lists')
export class PtPackingList {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  list_code: string;

  @Column({ type: 'bigint', nullable: true })
  client_id?: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  @Column({ type: 'date' })
  list_date: Date;

  @Column({ type: 'varchar', length: 20, default: 'borrador' })
  status: PtPackingListStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /** BOL documental del packing list PT (opcional; puede alinearse con el despacho). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  numero_bol?: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmed_at?: Date | null;

  @OneToMany(() => PtPackingListItem, (i) => i.packing_list, { cascade: ['insert'] })
  items?: PtPackingListItem[];
}

@Entity('pt_packing_list_reversal_events')
export class PtPackingListReversalEvent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint', unique: true })
  packing_list_id: number;

  @ManyToOne(() => PtPackingList, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'packing_list_id' })
  packing_list: PtPackingList;

  @Column({ type: 'varchar', length: 80 })
  reversed_by_username: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('pt_packing_list_items')
export class PtPackingListItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  packing_list_id: number;

  @ManyToOne(() => PtPackingList, (pl) => pl.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'packing_list_id' })
  packing_list: PtPackingList;

  @Column({ type: 'bigint' })
  final_pallet_id: number;

  @ManyToOne(() => FinalPallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'final_pallet_id' })
  final_pallet: FinalPallet;
}
