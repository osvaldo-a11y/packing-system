import { ProcessResult } from './process.entities';
export declare class CreateFruitProcessDto {
    recepcion_id: number;
    fecha_proceso: string;
    productor_id: number;
    variedad_id: number;
    peso_procesado_lb: number;
    merma_lb: number;
    resultado: ProcessResult;
}
export declare class CreatePtTagDto {
    fecha: string;
    resultado: ProcessResult;
    format_code: string;
    cajas_por_pallet: number;
}
export declare class AddPtTagItemDto {
    process_id: number;
}
export declare class UpdatePtTagDto {
    format_code: string;
    cajas_por_pallet: number;
}
