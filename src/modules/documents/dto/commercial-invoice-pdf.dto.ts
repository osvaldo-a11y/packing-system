import { IsObject, IsOptional } from 'class-validator';

/** Precios por caja por `presentation_format_id` (string) para factura comercial desde packing list PT. */
export class CommercialInvoicePdfDto {
  @IsOptional()
  @IsObject()
  unit_prices_by_format_id?: Record<string, number>;
}
