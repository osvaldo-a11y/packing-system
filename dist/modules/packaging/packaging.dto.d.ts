import { MaterialCategory } from './packaging.entities';
export declare class CreateMaterialDto {
    nombre_material: string;
    categoria: MaterialCategory;
    descripcion?: string;
    unidad_medida: string;
    costo_unitario: number;
    cantidad_disponible: number;
}
export declare class CreateRecipeDto {
    format_code: string;
    descripcion?: string;
}
export declare class AddRecipeItemDto {
    material_id: number;
    qty_per_unit: number;
    base_unidad: 'box' | 'pallet';
}
export declare class CreateConsumptionDto {
    tarja_id: number;
    dispatch_tag_item_id?: number;
    recipe_id: number;
    pallet_count: number;
    boxes_count: number;
    tape_linear_meters: number;
    corner_boards_qty: number;
    labels_qty: number;
}
