export declare class SalesOrder {
    id: number;
    order_number: string;
    cliente_id: number;
    requested_pallets: number;
    requested_boxes: number;
}
export declare class Dispatch {
    id: number;
    orden_id: number;
    cliente_id: number;
    fecha_despacho: Date;
    numero_bol: string;
    temperatura_f: string;
}
export declare class DispatchTagItem {
    id: number;
    dispatch_id: number;
    tarja_id: number;
    cajas_despachadas: number;
    pallets_despachados: number;
    unit_price: string;
    pallet_cost: string;
}
export declare class PackingList {
    id: number;
    dispatch_id: number;
    packing_number: string;
    printable_payload?: Record<string, unknown>;
}
export declare class Invoice {
    id: number;
    dispatch_id: number;
    invoice_number: string;
    subtotal: string;
    total_cost: string;
    total: string;
}
export declare class InvoiceItem {
    id: number;
    invoice_id: number;
    tarja_id: number;
    cajas: number;
    unit_price: string;
    line_subtotal: string;
    pallet_cost_total: string;
}
export declare class SalesOrderModification {
    id: number;
    order_id: number;
    before_payload: Record<string, unknown>;
    after_payload: Record<string, unknown>;
}
