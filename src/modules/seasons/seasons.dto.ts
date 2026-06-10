import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Opciones al regenerar snapshot (mismos filtros que Reportes → Cierre). */
export class GenerateSeasonSnapshotDto {
  /**
   * Si true, liquidación usa precio objetivo $/caja donde esté configurado
   * (equivale a `use_material_target_price` en reporting).
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 1)
  @IsBoolean()
  use_material_target_price?: boolean;
}
