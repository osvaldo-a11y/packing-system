export declare class CreateSalesOrderDto {
    cliente_id: number;
    requested_pallets: number;
    requested_boxes: number;
}
export declare class CreateDispatchDto {
    orden_id: number;
    cliente_id: number;
    fecha_despacho: string;
    numero_bol: string;
    temperatura_f: number;
}
export declare class AddDispatchTagDto {
    tarja_id: number;
    cajas_despachadas: number;
    pallets_despachados: number;
    unit_price: number;
    pallet_cost: number;
}
export declare class ModifySalesOrderDto {
    requested_pallets: number;
    requested_boxes: number;
}
