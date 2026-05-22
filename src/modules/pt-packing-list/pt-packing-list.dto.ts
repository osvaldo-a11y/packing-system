import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePtPackingListDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  final_pallet_ids: number[];

  @IsOptional() @IsString()
  list_date?: string;

  @IsOptional() @IsString()
  notes?: string;
}

/** Cuerpo opcional al revertir / anular un packing list confirmado. */
export class ReversePtPackingListDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** BOL del packing list (solo si no está vinculado a un despacho). Cadena vacía borra el BOL. */
export class UpdatePtPackingListBolDto {
  @IsString()
  @MaxLength(50)
  numero_bol: string;
}

/** Reasignar cliente comercial del PL y de sus pallets (p. ej. fruta redestinada a otro comprador). */
export class UpdatePtPackingListClientDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  client_id: number;
}
