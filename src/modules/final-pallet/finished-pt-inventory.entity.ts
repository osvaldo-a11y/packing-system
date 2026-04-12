import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FinalPallet, FinalPalletStatus } from './final-pallet.entities';

/** Línea de trazabilidad persistida al registrar existencia de PT desde pallet final. */
export type FinishedPtInventoryTraceLine = {
  fruit_process_id: number | null;
  recepcion_id: number | null;
  ref_text: string | null;
  variety_id: number;
  amount: number;
  pounds: string;
};

/**
 * Registro formal de producto terminado por pallet final (existencia a nivel lote/pallet).
 * Complementa el agregado `finished_pt_stock` (cliente / formato / marca) con trazabilidad detallada.
 */
@Entity('finished_pt_inventory')
export class FinishedPtInventory {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint', unique: true })
  final_pallet_id: number;

  @ManyToOne(() => FinalPallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'final_pallet_id' })
  final_pallet: FinalPallet;

  @Column({ type: 'varchar', length: 80 })
  corner_board_code: string;

  @Column({ type: 'bigint', nullable: true })
  species_id: number | null;

  @Column({ type: 'bigint', nullable: true })
  presentation_format_id: number | null;

  /** Código de formato normalizado (lower trim), alineado con claves de `finished_pt_stock`. */
  @Column({ type: 'varchar', length: 40, default: '' })
  format_code: string;

  @Column({ type: 'bigint', nullable: true })
  client_id: number | null;

  @Column({ type: 'bigint', nullable: true })
  brand_id: number | null;

  @Column({ type: 'int', default: 0 })
  boxes: number;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  net_lb: string;

  @Column({ type: 'varchar', length: 20 })
  status: FinalPalletStatus;

  /**
   * Cajas contabilizadas en `finished_pt_stock` por este módulo (0 si el pallet está en despacho:
   * el movimiento lo aplicó Despacho).
   */
  @Column({ type: 'int', default: 0 })
  aggregate_boxes_recorded: number;

  @Column({ type: 'simple-json', nullable: true })
  trace_lines: FinishedPtInventoryTraceLine[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
