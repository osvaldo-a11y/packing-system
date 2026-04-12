import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FinalPalletStatus, FruitQualityMode } from './final-pallet.entities';

export class CreateFinalPalletLineDto {
  @IsOptional() @Type(() => Number) @IsInt() fruit_process_id?: number;
  @IsDateString() fecha: string;
  @IsOptional() @IsString() ref_text?: string;
  @Type(() => Number) @IsInt() variedad_id: number;
  @IsOptional() @IsString() caliber?: string;
  @Type(() => Number) @IsInt() @Min(0) amount: number;
  @IsNumber() @Min(0) pounds: number;
  @IsOptional() @IsNumber() @Min(0) net_lb?: number;
}

export class CreateFinalPalletDto {
  @IsOptional() @Type(() => Number) @IsInt() species_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() quality_grade_id?: number;
  @IsOptional() @IsIn(['borrador', 'definitivo', 'anulado']) status?: FinalPalletStatus;
  @IsOptional() @IsString() clamshell_label?: string;
  @IsOptional() @Type(() => Number) @IsInt() brand_id?: number;
  @IsOptional() @IsString() dispatch_unit?: string;
  @IsOptional() @IsString() packing_type?: string;
  @IsOptional() @IsString() market?: string;
  @IsOptional() @IsString() bol?: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  planned_sales_order_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number;
  @IsOptional() @IsIn(['proceso', 'bulk']) fruit_quality_mode?: FruitQualityMode;
  @IsOptional() @Type(() => Number) @IsInt() presentation_format_id?: number;
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFinalPalletLineDto)
  lines: CreateFinalPalletLineDto[];
}

export class PatchFinalPalletDto {
  @IsOptional()
  @IsIn(['borrador', 'definitivo', 'anulado', 'repaletizado', 'revertido', 'asignado_pl'])
  status?: FinalPalletStatus;
  @IsOptional() @Type(() => Number) @IsInt() species_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() quality_grade_id?: number;
  @IsOptional() @IsString() clamshell_label?: string;
  @IsOptional() @Type(() => Number) @IsInt() brand_id?: number;
  @IsOptional() @IsString() dispatch_unit?: string;
  @IsOptional() @IsString() packing_type?: string;
  @IsOptional() @IsString() market?: string;
  @IsOptional() @IsString() bol?: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  planned_sales_order_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number;
  @IsOptional() @IsIn(['proceso', 'bulk']) fruit_quality_mode?: FruitQualityMode;
  @IsOptional() @Type(() => Number) @IsInt() presentation_format_id?: number;
}

/** Query para vista de existencias PT (pallets finales). */
export class ListExistenciasPtQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() species_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() variety_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() presentation_format_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number;
  @IsOptional()
  @IsIn(['borrador', 'definitivo', 'anulado', 'repaletizado', 'revertido', 'asignado_pl'])
  status?: FinalPalletStatus;

  /**
   * Por defecto true: inventario disponible en depósito (definitivo y sin despacho asignado).
   * Si es false, aplican `status` y `excluir_anulados`.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '' || value === null) return true;
    return value === '1' || value === 'true' || value === true;
  })
  @IsBoolean()
  solo_deposito?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '' || value === null) return true;
    return value === '1' || value === 'true' || value === true;
  })
  @IsBoolean()
  excluir_anulados?: boolean;
}

/** Origen de cajas para repaletizaje (FIFO por líneas del pallet). */
export class RepalletSourceAllocationDto {
  @Type(() => Number) @IsInt() @Min(1) final_pallet_id: number;
  @Type(() => Number) @IsInt() @Min(1) boxes: number;
}

export class RepalletDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepalletSourceAllocationDto)
  sources: RepalletSourceAllocationDto[];

  @IsOptional() @IsString() notes?: string;
}

export class RepalletReverseDto {
  @IsOptional() @IsString() notes?: string;
}

/** Asignación masiva de BOL (pedido operativo) en pallets definitivos en depósito. */
export class BulkAssignBolDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  final_pallet_ids: number[];

  @IsString()
  bol: string;
}
