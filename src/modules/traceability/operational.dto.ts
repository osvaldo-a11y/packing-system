import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(200) nombre: string;
  @IsOptional() @IsString() @MaxLength(120) pais?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() mercado_id?: number | null;
}

export class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() @MaxLength(120) pais?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() mercado_id?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateMercadoDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
}

export class UpdateMercadoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateMaterialCategoryDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
}

export class UpdateMaterialCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateReceptionTypeDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
}

export class UpdateReceptionTypeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateDocumentStateDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
}

export class UpdateDocumentStateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateBrandDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
  @IsOptional() @Type(() => Number) @IsInt() label_material_id?: number | null;
  /** Marca especial vinculada a un cliente comercial. */
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number | null;
}

export class UpdateBrandDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @Type(() => Number) @IsInt() label_material_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreatePackingSupplierDto {
  @IsString() @MinLength(1) @MaxLength(40) codigo: string;
  @IsString() @MinLength(1) @MaxLength(200) nombre: string;
}

export class UpdatePackingSupplierDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class LinkMaterialSupplierDto {
  @Type(() => Number) @IsInt() material_id: number;
  @Type(() => Number) @IsInt() supplier_id: number;
}

export class CreateReturnableContainerDto {
  @IsString() @MinLength(1) @MaxLength(80) tipo: string;
  @IsOptional() @IsString() @MaxLength(40) capacidad?: string;
  @IsOptional() @IsBoolean() requiere_retorno?: boolean;
}

export class UpdateReturnableContainerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) tipo?: string;
  @IsOptional() @IsString() @MaxLength(40) capacidad?: string;
  @IsOptional() @IsBoolean() requiere_retorno?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
}
