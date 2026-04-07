import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReportFilterDto {
  @IsOptional() @Type(() => Number) @IsInt() productor_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() variedad_id?: number;
  @IsOptional() @IsString() fecha_desde?: string;
  @IsOptional() @IsString() fecha_hasta?: string;
  @IsOptional() @IsString() calidad?: string;
  @IsOptional() @Type(() => Number) @IsInt() tarja_id?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ReportExportQueryDto extends ReportFilterDto {
  @IsIn(['csv', 'xlsx', 'pdf'])
  format: 'csv' | 'xlsx' | 'pdf';
}

export class SaveReportDto {
  @IsString() report_name: string;
  filters: Record<string, unknown>;
  payload: Record<string, unknown>;
}
