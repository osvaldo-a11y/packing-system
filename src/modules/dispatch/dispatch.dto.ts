import { IsDateString, IsInt, IsNumber, IsString, Min } from 'class-validator';

export class CreateSalesOrderDto {
  @IsInt() cliente_id: number;
  @IsInt() @Min(0) requested_pallets: number;
  @IsInt() @Min(0) requested_boxes: number;
}

export class CreateDispatchDto {
  @IsInt() orden_id: number;
  @IsInt() cliente_id: number;
  @IsDateString() fecha_despacho: string;
  @IsString() numero_bol: string;
  @IsNumber() temperatura_f: number;
}

export class AddDispatchTagDto {
  @IsInt() tarja_id: number;
  @IsInt() @Min(1) cajas_despachadas: number;
  @IsInt() @Min(1) pallets_despachados: number;
  @IsNumber() @Min(0) unit_price: number;
  @IsNumber() @Min(0) pallet_cost: number;
}

export class ModifySalesOrderDto {
  @IsInt() @Min(0) requested_pallets: number;
  @IsInt() @Min(0) requested_boxes: number;
}
