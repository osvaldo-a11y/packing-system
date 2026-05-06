import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Una fila del pedido: formato + cajas; precio y marca/variedad opcionales. */
export class SalesOrderLineInputDto {
  @Type(() => Number) @IsInt() @Min(1) presentation_format_id: number;
  @Type(() => Number) @IsInt() @Min(0) requested_boxes: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unit_price?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() brand_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() variety_id?: number | null;
}

export class CreateSalesOrderDto {
  @IsInt() cliente_id: number;
  /** Si se informa (no vacío), sustituye el número automático SO-#####; debe ser único. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  order_number?: string;

  @IsOptional() @IsDateString() fecha_pedido?: string;
  @IsOptional() @IsDateString() fecha_despacho_cliente?: string;
  @IsOptional() @IsString() @MaxLength(24) estado_comercial?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineInputDto)
  lines: SalesOrderLineInputDto[];
}

export class CreateDispatchDto {
  /** Uno o más packing list PT confirmados (no deben estar ya en otro despacho). */
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  pt_packing_list_ids: number[];

  @IsInt() orden_id: number;
  @IsInt() cliente_id: number;
  @IsDateString() fecha_despacho: string;
  /** Si los PL tienen BOL coherente, puede omitirse (se hereda). Si no hay BOL en PL, es obligatorio en servicio. */
  @IsOptional() @IsString() @MaxLength(50) numero_bol?: string;
  @IsNumber() temperatura_f: number;
  /** Cliente comercial (mantenedor `clients`); opcional. */
  @IsOptional() @Type(() => Number) @IsInt() client_id?: number | null;
  @IsOptional() @IsString() thermograph_serial?: string;
  @IsOptional() @IsString() thermograph_notes?: string;
  /** Precio por caja por `presentation_format_id` (string) para factura desde pallets del packing list. */
  @IsOptional() @IsObject() final_pallet_unit_prices?: Record<string, number>;
}

/** Agrupar pallets finales definitivos en un despacho y precio por formato (caja). */
export class AttachFinalPalletsDto {
  @IsArray() @IsInt({ each: true }) final_pallet_ids: number[];
  /** Clave = presentation_format_id (string), valor = precio unitario por caja. */
  @IsOptional() @IsObject() unit_price_by_format_id?: Record<string, number>;
}

/** Actualizar solo precios por formato (merge con existentes). Sin movimiento de stock. */
export class UpdateDispatchUnitPricesDto {
  @IsOptional() @IsObject() unit_price_by_format_id?: Record<string, number>;
}

/** Cambiar BOL del despacho; opcionalmente propagarlo a los packing lists PT vinculados. */
export class UpdateDispatchBolDto {
  @IsString() @MaxLength(50) numero_bol: string;
  /** true = también escribe numero_bol en cada pt_packing_lists del despacho. */
  @IsBoolean()
  @Type(() => Boolean)
  apply_to_packing_lists: boolean;
}

/** Correcciones operativas del despacho (fecha, temperatura y datos termógrafo). */
export class UpdateDispatchMetaDto {
  @IsOptional() @IsDateString() fecha_despacho?: string;
  @IsOptional() @IsNumber() temperatura_f?: number;
  @IsOptional() @IsString() @MaxLength(120) thermograph_serial?: string;
  @IsOptional() @IsString() @MaxLength(500) thermograph_notes?: string;
}

/** Corrección de vínculo comercial del despacho (pedido y clientes asociados). */
export class UpdateDispatchOrderLinkDto {
  @Type(() => Number) @IsInt() @Min(1) orden_id: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cliente_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) client_id?: number | null;
}

export class AddDispatchTagDto {
  @IsInt() tarja_id: number;
  @IsInt() @Min(1) cajas_despachadas: number;
  @IsInt() @Min(1) pallets_despachados: number;
  @IsNumber() @Min(0) unit_price: number;
  @IsNumber() @Min(0) pallet_cost: number;
}

/** Payload parseado desde CSV histórico (import despachos). */
export interface HistoricalDispatchImportInput {
  order_reference: string;
  fecha_despacho: Date;
  numero_bol: string;
  cliente_nombre?: string;
  thermograph_serial?: string | null;
  temperatura_f: number;
  total_cajas: number;
  total_amount: number;
}

export class ModifySalesOrderDto {
  /** Referencia visible del pedido (ej. SO-00001 o BOL comercial). Debe ser única. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  order_number?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineInputDto)
  lines: SalesOrderLineInputDto[];
}

/** Ajuste manual en factura (excepción); la factura principal sigue viniendo del despacho / packing list. */
export class AddManualInvoiceLineDto {
  @IsString() @MinLength(1) @MaxLength(500) descripcion: string;
  @Type(() => Number) @IsInt() @Min(1) cantidad: number;
  @IsNumber() @Min(0) unit_price: number;
  @IsOptional() @IsIn(['cargo', 'descuento']) tipo?: 'cargo' | 'descuento';
}

/** Regenerar facturas que no tienen líneas (solo admin). Si omitís ids, se procesan todas las detectadas. */
export class RegenerateEmptyInvoicesDto {
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  dispatch_ids?: number[];
}
