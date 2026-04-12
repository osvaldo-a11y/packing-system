import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReportFilterDto {
  @IsOptional() @Type(() => Number) @IsInt() productor_id?: number;
  /** Filtro despacho.cliente_id (maestro `clients`) para margen por cliente y vistas que lo soporten. */
  @IsOptional() @Type(() => Number) @IsInt() cliente_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() variedad_id?: number;
  @IsOptional() @IsString() fecha_desde?: string;
  @IsOptional() @IsString() fecha_hasta?: string;
  @IsOptional() @IsString() calidad?: string;
  @IsOptional() @Type(() => Number) @IsInt() tarja_id?: number;
  @IsOptional() @IsString() format_code?: string;
  @IsOptional() @Type(() => Number) precio_packing_por_lb?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ReportExportQueryDto extends ReportFilterDto {
  @IsIn(['csv', 'xlsx', 'pdf'])
  format: 'csv' | 'xlsx' | 'pdf';

  /** Solo `format=pdf`: `internal` = tablas completas; `external` = resumen para entrega (menos detalle operativo). */
  @IsOptional() @IsIn(['internal', 'external']) pdf_profile?: 'internal' | 'external';
}

export class SaveReportDto {
  @IsString() report_name: string;
  @IsObject() filters: Record<string, unknown>;
  @IsObject() payload: Record<string, unknown>;
}

export class UpsertPackingCostDto {
  @Type(() => Number) @IsInt() @Min(1) species_id: number;
  @IsOptional() @IsString() season?: string;
  @Type(() => Number) @IsNumber() @Min(0) price_per_lb: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
