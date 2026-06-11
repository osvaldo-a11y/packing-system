import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type LegacyAliasKind = 'producer' | 'format' | 'brand' | 'variety';

/** Mapa de normalización: valores crudos del Excel histórico → id/código canónico. */
@Entity('legacy_value_aliases')
export class LegacyValueAlias {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 20 })
  kind: LegacyAliasKind;

  /** Valor crudo normalizado (trim + upper para lookup). */
  @Column({ type: 'varchar', length: 200 })
  raw_value: string;

  @Column({ type: 'bigint', nullable: true })
  resolved_id: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  resolved_code: string | null;

  /** Null = alias global; 2025/2024/2023 = específico de temporada. */
  @Column({ type: 'int', nullable: true })
  season_year: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/** Capa comercial congelada por línea (Final Charge histórico). */
@Entity('season_settlement_lines')
export class SeasonSettlementLine {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  season_year: number;

  @Column({ type: 'bigint' })
  producer_id: number;

  @Column({ type: 'varchar', length: 200 })
  producer_raw: string;

  @Column({ type: 'bigint', nullable: true })
  brand_id: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  brand_raw: string | null;

  @Column({ type: 'bigint', nullable: true })
  variety_id: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  variety_raw: string | null;

  /** Código canónico resuelto, o crudo trim si no hay alias. */
  @Column({ type: 'varchar', length: 80 })
  format_code: string;

  @Column({ type: 'varchar', length: 80 })
  format_raw: string;

  @Column({ type: 'date', nullable: true })
  ship_date: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pick_type: 'hand' | 'machine' | null;

  @Column({ type: 'varchar', length: 120 })
  bol: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  pallet_ref: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customer_raw: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  market_raw: string | null;

  @Column({ type: 'int' })
  boxes: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  pounds: string;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  unit_price: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  revenue: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  grower_return: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  pack_fee: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  material_cost: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  grade_raw: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  invoice_ref: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 40, default: 'legacy_final_charge' })
  source: string;

  @Column({ type: 'varchar', length: 64 })
  row_hash: string;

  @Column({ type: 'int', nullable: true })
  excel_row_number: number | null;

  /** Índice de fila en el Excel origen (1-based, incl. header = fila 1). */
  @Column({ type: 'int', nullable: true })
  source_row_no: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/** Línea de recepción histórica con fecha (Base B/C). */
@Entity('season_reception_lines')
export class SeasonReceptionLine {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  season_year: number;

  @Column({ type: 'bigint' })
  producer_id: number;

  @Column({ type: 'varchar', length: 200 })
  producer_raw: string;

  @Column({ type: 'date' })
  reception_date: string;

  @Column({ type: 'varchar', length: 20 })
  quality: 'FRESH' | 'WASTE' | 'FOR_FROZEN';

  @Column({ type: 'varchar', length: 120, nullable: true })
  specie: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  variety: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  incoming_no: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  line_no: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reference: string | null;

  @Column({ type: 'int', nullable: true })
  trays: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  quantity: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  net_lb: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  gross_lb: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  fruit_type: 'hand' | 'machine' | null;

  @Column({ type: 'varchar', length: 40, default: 'legacy_assembled' })
  source: string;

  @Column({ type: 'varchar', length: 64 })
  row_hash: string;

  @Column({ type: 'int' })
  source_row_no: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/** Línea de proceso histórica con fecha (Base B/C). */
@Entity('season_process_lines')
export class SeasonProcessLine {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  season_year: number;

  @Column({ type: 'bigint' })
  producer_id: number;

  @Column({ type: 'varchar', length: 200 })
  producer_raw: string;

  @Column({ type: 'date' })
  process_date: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  op: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  specie: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  variety: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  format_code: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  format_raw: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  lb_domp: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  lb_fresh: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  lb_waste: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  lb_total: string;

  @Column({ type: 'int', nullable: true })
  boxes: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  fruit_type: 'hand' | 'machine' | null;

  @Column({ type: 'varchar', length: 40, default: 'legacy_assembled' })
  source: string;

  @Column({ type: 'varchar', length: 64 })
  row_hash: string;

  @Column({ type: 'int' })
  source_row_no: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/** Capa física por productor — se puebla en fase posterior (loader físico). */
@Entity('season_mass_balance')
export class SeasonMassBalance {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  season_year: number;

  @Column({ type: 'bigint' })
  producer_id: number;

  @Column({ type: 'varchar', length: 200 })
  producer_name: string;

  @Column({ type: 'int', default: 0 })
  receptions: number;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_received: string;

  /** Rechazo en recepción (Quality=WASTE). */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_rejected: string;

  /** Stream congelado en recepción (Quality=FOR FROZEN). */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_for_frozen: string;

  /** (lb_received + lb_for_frozen) − lb_processed cuando hay frozen. */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_frozen_to_frozen: string;

  @Column({ type: 'int', default: 0 })
  processes: number;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_processed: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_packout: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_waste: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  pct_packout: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  lb_invoiced: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  difference: string;

  @Column({ type: 'varchar', length: 40, default: 'legacy_physical' })
  source: string;

  @Column({ type: 'timestamptz', nullable: true })
  loaded_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
