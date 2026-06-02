import { Transform, Type } from 'class-transformer';
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

  /** Si true, liquidación/export usan costo_materiales_target (precio objetivo $/caja) donde esté configurado. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 1)
  @IsBoolean()
  use_material_target_price?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9999) limit?: number;

  @IsOptional()
  @IsIn(['es', 'en'])
  lang?: 'es' | 'en';
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

export class UpsertPackingFormatSurchargeDto {
  @IsString() format_code!: string;
  @Type(() => Number) @IsNumber() @Min(0) surcharge_per_lb!: number;
  @IsOptional() @IsString() season?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() notes?: string | null;
}

export class UpsertMaterialCostAdjustmentDto {
  @IsString() name!: string;
  @IsIn(['per_box', 'per_lb', 'percent']) adjustment_type!: 'per_box' | 'per_lb' | 'percent';
  @Type(() => Number) @IsNumber() value!: number;
  @IsOptional() @IsString() format_code?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() producer_id?: number | null;
  @IsOptional() @IsString() season?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpsertMaterialPriceTargetDto {
  @IsOptional() @IsString()
  format_code?: string | null;

  @IsOptional() @IsInt() @Type(() => Number)
  producer_id?: number | null;

  @IsNumber() @Min(0) @Type(() => Number)
  target_price_per_box!: number;

  @IsOptional() @IsString()
  season?: string | null;

  @IsOptional() @IsBoolean() @Type(() => Boolean)
  active?: boolean;

  @IsOptional() @IsString()
  notes?: string | null;
}

export class UpsertMachineProcessingRateDto {
  @IsNumber() @Min(0) @Type(() => Number)
  rate_per_lb!: number;

  @IsOptional() @IsInt() @Type(() => Number)
  species_id?: number | null;

  @IsOptional() @IsString()
  season?: string | null;

  @IsOptional() @IsBoolean() @Type(() => Boolean)
  active?: boolean;

  @IsOptional() @IsString()
  notes?: string | null;
}
