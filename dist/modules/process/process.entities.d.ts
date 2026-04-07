export declare enum ProcessResult {
    IQF = "IQF",
    JUGO = "jugo",
    PERDIDO = "perdido",
    OTRO = "otro"
}
export declare class FruitProcess {
    id: number;
    recepcion_id: number;
    fecha_proceso: Date;
    productor_id: number;
    variedad_id: number;
    peso_procesado_lb: string;
    merma_lb: string;
    porcentaje_procesado: string;
    resultado: ProcessResult;
    tarja_id?: number;
    created_at: Date;
    deleted_at?: Date;
}
export declare class PtTag {
    id: number;
    tag_code: string;
    fecha: Date;
    resultado: ProcessResult;
    format_code: string;
    cajas_por_pallet: number;
    total_cajas: number;
    total_pallets: number;
}
export declare class PtTagAudit {
    id: number;
    tarja_id: number;
    action: string;
    before_payload: Record<string, unknown>;
    after_payload: Record<string, unknown>;
    created_at: Date;
}
export declare class PtTagItem {
    id: number;
    tarja_id: number;
    process_id: number;
    productor_id: number;
    cajas_generadas: number;
    pallets_generados: number;
}
