import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { MaterialCategory as MaterialCategoryEntity } from '../traceability/catalog.entities';
import { PresentationFormat } from '../traceability/traceability.entities';

/** Movimiento de inventario (kardex): el stock actual es la suma de quantity_delta por material (más el saldo inicial al crear el material). */
@Entity('packaging_material_movements')
export class PackagingMaterialMovement {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  material_id: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity_delta: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  ref_type?: string | null;

  @Column({ type: 'bigint', nullable: true })
  ref_id?: number | null;

  @Column({ type: 'text', nullable: true })
  nota?: string | null;

  @CreateDateColumn()
  created_at: Date;
}

/** Códigos de categoría alineados con `material_categories.codigo` (búsquedas por tipo). */
export const MATERIAL_CATEGORY_CODES = {
  CLAMSHELL: 'clamshell',
  CAJA: 'caja',
  BOLSA: 'bolsa',
  ETIQUETA: 'etiqueta',
  TAPE: 'tape',
  CORNER_BOARD: 'corner_board',
  OTRO: 'otro',
} as const;

@Entity('packaging_materials')
export class PackagingMaterial {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 80 })
  nombre_material: string;

  @Column({ type: 'bigint' })
  material_category_id: number;

  @ManyToOne(() => MaterialCategoryEntity, { eager: false })
  @JoinColumn({ name: 'material_category_id' })
  material_category: MaterialCategoryEntity;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'varchar', length: 20 })
  unidad_medida: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  costo_unitario: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  cantidad_disponible: string;

  /** Si es clamshell: formato de presentación al que aplica (nombre comercial puede diferir del código formato). */
  @Column({ type: 'bigint', nullable: true })
  presentation_format_id: number | null;

  /** Unidades de este clamshell por caja comercial (para costeo y stock). */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  clamshell_units_per_box: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}

@Entity('packaging_recipes')
@Unique('uq_packaging_recipe_presentation_format', ['presentation_format_id'])
export class PackagingRecipe {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  presentation_format_id: number;

  @ManyToOne(() => PresentationFormat, { nullable: false })
  @JoinColumn({ name: 'presentation_format_id' })
  presentation_format: PresentationFormat;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}

@Entity('packaging_recipe_items')
@Unique('uq_pri_recipe_material', ['recipe_id', 'material_id'])
export class PackagingRecipeItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  recipe_id: number;

  @Column({ type: 'bigint' })
  material_id: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  qty_per_unit: string;

  @Column({ type: 'varchar', length: 20, default: 'box' })
  base_unidad: 'box' | 'pallet';

  /** Tipo para costeo por formato: directo (por producto) o tripaje (material físico de pallet). */
  @Column({ type: 'varchar', length: 20, default: 'directo' })
  cost_type: 'directo' | 'tripaje';
}

@Entity('packaging_pallet_consumptions')
export class PackagingPalletConsumption {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  tarja_id: number;

  @Column({ type: 'bigint', nullable: true })
  dispatch_tag_item_id?: number;

  @Column({ type: 'bigint' })
  recipe_id: number;

  @Column({ type: 'int', default: 1 })
  pallet_count: number;

  @Column({ type: 'int', default: 0 })
  boxes_count: number;

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  tape_linear_meters: string;

  @Column({ type: 'int', default: 0 })
  corner_boards_qty: number;

  @Column({ type: 'int', default: 0 })
  labels_qty: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  material_cost_total: string;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('packaging_cost_breakdowns')
export class PackagingCostBreakdown {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  consumption_id: number;

  @Column({ type: 'bigint' })
  material_id: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  qty_used: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  unit_cost: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  line_total: string;
}
