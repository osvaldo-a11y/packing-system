import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum MaterialCategory {
  CLAMSHELL = 'clamshell',
  CAJA = 'caja',
  ETIQUETA = 'etiqueta',
  TAPE = 'tape',
  CORNER_BOARD = 'corner_board',
  OTRO = 'otro',
}

@Entity('packaging_materials')
export class PackagingMaterial {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 80 })
  nombre_material: string;

  @Column({ type: 'enum', enum: MaterialCategory })
  categoria: MaterialCategory;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'varchar', length: 20 })
  unidad_medida: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  costo_unitario: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  cantidad_disponible: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}

@Entity('packaging_recipes')
@Unique('uq_packaging_recipe_format_code', ['format_code'])
export class PackagingRecipe {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 20 })
  format_code: string;

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

  @Column({ type: 'varchar', length: 20 })
  base_unidad: 'box' | 'pallet';
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
