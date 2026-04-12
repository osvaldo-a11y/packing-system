import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProcessResult } from './process.entities';

export class ProcessLineAllocationDto {
  @Type(() => Number) @IsInt() reception_line_id: number;
  @IsNumber() @Min(0.001) lb_allocated: number;
}

export class UpdateProcessWeightComponentDto {
  @Type(() => Number) @IsInt() component_id: number;
  @IsNumber() @Min(0) lb_value: number;
}

/** Alta solo por productor + líneas/lotes de recepción (MP). Packout = unidades PT, no el proceso. */
export class CreateFruitProcessDto {
  @Type(() => Number) @IsInt() producer_id: number;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProcessLineAllocationDto)
  allocations: ProcessLineAllocationDto[];

  @IsDateString() fecha_proceso: string;

  @IsOptional() @Type(() => Number) @IsInt() process_machine_id?: number | null;

  @IsOptional() @IsNumber() @Min(0) merma_lb?: number;

  @IsOptional() @IsEnum(ProcessResult) resultado?: ProcessResult;

  @IsOptional() @IsNumber() temperatura_f?: number;

  @IsOptional() @IsString() nota?: string;

  @IsOptional() @IsNumber() @Min(0) lb_iqf?: number;

  @IsOptional() @IsNumber() @Min(0) lb_sobrante?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateProcessWeightComponentDto)
  components?: UpdateProcessWeightComponentDto[];
}

/** Componentes y nota; packout viene solo de unidades PT (solo borrador). */
export class UpdateProcessWeightsDto {
  @IsOptional() @IsNumber() @Min(0) lb_iqf?: number;
  @IsOptional() @IsNumber() @Min(0) lb_sobrante?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateProcessWeightComponentDto)
  components?: UpdateProcessWeightComponentDto[];
  @IsOptional() @IsString() @MaxLength(2000) nota?: string;
}

/** Cerrar (confirmado→cerrado) o, como admin, cualquier transición vía `adminSetProcessStatus`. */
export class SetProcessStatusDto {
  @IsIn(['borrador', 'confirmado', 'cerrado'])
  status: 'borrador' | 'confirmado' | 'cerrado';
}

export class CloseProcessBalanceDto {
  @IsNumber() @Min(0) lb_producto_terminado: number;
  @IsNumber() @Min(0) lb_desecho: number;
  @IsNumber() @Min(0) lb_merma_balance: number;
}

export class CreatePtTagDto {
  @IsDateString() fecha: string;
  @IsEnum(ProcessResult) resultado: ProcessResult;
  @IsString() format_code: string;
  @IsInt() @Min(1) cajas_por_pallet: number;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() brand_id?: number;
  @IsOptional() @IsString() @MaxLength(80) bol?: string;
}

export class AddPtTagItemDto {
  @IsInt() process_id: number;
  /** Si se omite, se usa el tope disponible según proceso/packout (comportamiento anterior). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cajas_generadas?: number;
}

export class UpdatePtTagDto {
  @IsString() format_code: string;
  @IsInt() @Min(1) cajas_por_pallet: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsEnum(ProcessResult) resultado?: ProcessResult;
  /** Solo unidades con una línea de proceso; el proceso debe estar libre o ya ser el de esta unidad. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) process_id?: number;
  /** Solo una línea de proceso; validado contra lb/packout como en el alta. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cajas_generadas?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) client_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) brand_id?: number;
  @IsOptional() @IsString() @MaxLength(80) bol?: string;
}

/** Unir varias unidades PT en una nueva (pallet consolidado). */
export class MergeTagsDto {
  @IsArray() @Type(() => Number) @IsInt({ each: true }) source_tarja_ids: number[];
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsEnum(ProcessResult) resultado?: ProcessResult;
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() brand_id?: number | null;
  @IsOptional() @IsString() @MaxLength(80) bol?: string;
}

/** Abrir / fraccionar: saca cajas de una unidad PT a una nueva. */
export class SplitTagDto {
  @IsInt() @Min(1) cajas: number;
  @IsOptional() @IsDateString() fecha?: string;
}
