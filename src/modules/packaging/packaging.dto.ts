import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialDto {
  @IsString() nombre_material: string;
  @Type(() => Number) @IsInt() material_category_id: number;
  @IsOptional() @IsString() descripcion?: string;
  @IsString() unidad_medida: string;
  @IsNumber() @Min(0) costo_unitario: number;
  @IsNumber() @Min(0) cantidad_disponible: number;
  /** Clamshell: formato de presentación asociado. */
  @IsOptional() @Type(() => Number) @IsInt() presentation_format_id?: number | null;
  /** Clamshell: cuántas unidades de este material por caja. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0001) clamshell_units_per_box?: number | null;
  /** Alcance multi-formato (ids). Si viene, reemplaza la selección simple. */
  @IsOptional() @IsArray() @Type(() => Number) @IsInt({ each: true }) presentation_format_ids?: number[];
  /** Cliente comercial si el insumo es exclusivo; omitir o null = todos. */
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number | null;
  /** Alcance multi-cliente (ids). Si viene, reemplaza la selección simple. */
  @IsOptional() @IsArray() @Type(() => Number) @IsInt({ each: true }) client_ids?: number[];
}

/** Actualización parcial de material (tabla operativa / inline). */
export class UpdateMaterialDto {
  @IsOptional() @IsString() nombre_material?: string;
  @IsOptional() @Type(() => Number) @IsInt() material_category_id?: number;
  @IsOptional() @IsString() unidad_medida?: string;
  @IsOptional() @IsNumber() @Min(0) costo_unitario?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
  /** null o omitido sin cambio; 0 o negativo en cliente se envía como null para «todos los formatos». */
  @IsOptional() @Type(() => Number) @IsInt() presentation_format_id?: number | null;
  @IsOptional() @IsArray() @Type(() => Number) @IsInt({ each: true }) presentation_format_ids?: number[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) clamshell_units_per_box?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number | null;
  @IsOptional() @IsArray() @Type(() => Number) @IsInt({ each: true }) client_ids?: number[];
}

export class CreateRecipeDto {
  @Type(() => Number) @IsInt() @Min(1) presentation_format_id: number;
  @IsOptional() @Type(() => Number) @IsInt() brand_id?: number | null;
  @IsOptional() @IsString() descripcion?: string;
}

export class AddRecipeItemDto {
  @IsInt() material_id: number;
  @IsNumber() @Min(0.0001) qty_per_unit: number;
  @IsIn(['box', 'pallet']) base_unidad: 'box' | 'pallet';
  @IsOptional() @IsIn(['directo', 'tripaje']) cost_type?: 'directo' | 'tripaje';
}

export class UpdateRecipeItemDto {
  @IsInt() material_id: number;
  @IsNumber() @Min(0.0001) qty_per_unit: number;
  @IsIn(['box', 'pallet']) base_unidad: 'box' | 'pallet';
  /** Obsoleto: el servidor deriva siempre directo (caja) / tripaje (pallet). */
  @IsOptional() @IsIn(['directo', 'tripaje']) cost_type?: 'directo' | 'tripaje';
}

export class CreateConsumptionDto {
  @IsInt() tarja_id: number;
  @IsOptional() @IsInt() dispatch_tag_item_id?: number;
  @IsInt() recipe_id: number;
  @IsInt() @Min(1) pallet_count: number;
  @IsInt() @Min(0) boxes_count: number;
  @IsNumber() @Min(0) tape_linear_meters: number;
  @IsInt() @Min(0) corner_boards_qty: number;
  @IsInt() @Min(0) labels_qty: number;
}

export class RecalculateConsumptionsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) tarja_id?: number;
}

export class RecordMaterialMovementDto {
  @IsNumber() quantity_delta: number;
  @IsOptional() @IsString() nota?: string;
  @IsOptional() @IsString() ref_type?: string;
  @IsOptional() @Type(() => Number) @IsInt() ref_id?: number;
}
