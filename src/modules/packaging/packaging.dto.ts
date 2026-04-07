import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MaterialCategory } from './packaging.entities';

export class CreateMaterialDto {
  @IsString() nombre_material: string;
  @IsEnum(MaterialCategory) categoria: MaterialCategory;
  @IsOptional() @IsString() descripcion?: string;
  @IsString() unidad_medida: string;
  @IsNumber() @Min(0) costo_unitario: number;
  @IsNumber() @Min(0) cantidad_disponible: number;
}

export class CreateRecipeDto {
  @IsString() format_code: string;
  @IsOptional() @IsString() descripcion?: string;
}

export class AddRecipeItemDto {
  @IsInt() material_id: number;
  @IsNumber() @Min(0.0001) qty_per_unit: number;
  @IsString() base_unidad: 'box' | 'pallet';
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
