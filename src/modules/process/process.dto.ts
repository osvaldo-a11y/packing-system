import { IsDateString, IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';
import { ProcessResult } from './process.entities';

export class CreateFruitProcessDto {
  @IsInt() recepcion_id: number;
  @IsDateString() fecha_proceso: string;
  @IsInt() productor_id: number;
  @IsInt() variedad_id: number;
  @IsNumber() @Min(0.01) peso_procesado_lb: number;
  @IsNumber() @Min(0) merma_lb: number;
  @IsEnum(ProcessResult) resultado: ProcessResult;
}

export class CreatePtTagDto {
  @IsDateString() fecha: string;
  @IsEnum(ProcessResult) resultado: ProcessResult;
  @IsString() format_code: string;
  @IsInt() @Min(1) cajas_por_pallet: number;
}

export class AddPtTagItemDto {
  @IsInt() process_id: number;
}

export class UpdatePtTagDto {
  @IsString() format_code: string;
  @IsInt() @Min(1) cajas_por_pallet: number;
}
