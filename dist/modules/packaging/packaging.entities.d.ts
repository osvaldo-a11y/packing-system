export declare enum MaterialCategory {
    CLAMSHELL = "clamshell",
    CAJA = "caja",
    ETIQUETA = "etiqueta",
    TAPE = "tape",
    CORNER_BOARD = "corner_board",
    OTRO = "otro"
}
export declare class PackagingMaterial {
    id: number;
    nombre_material: string;
    categoria: MaterialCategory;
    descripcion?: string;
    unidad_medida: string;
    costo_unitario: string;
    cantidad_disponible: string;
    activo: boolean;
}
export declare class PackagingRecipe {
    id: number;
    format_code: string;
    descripcion?: string;
    activo: boolean;
}
export declare class PackagingRecipeItem {
    id: number;
    recipe_id: number;
    material_id: number;
    qty_per_unit: string;
    base_unidad: 'box' | 'pallet';
}
export declare class PackagingPalletConsumption {
    id: number;
    tarja_id: number;
    dispatch_tag_item_id?: number;
    recipe_id: number;
    pallet_count: number;
    boxes_count: number;
    tape_linear_meters: string;
    corner_boards_qty: number;
    labels_qty: number;
    material_cost_total: string;
    created_at: Date;
}
export declare class PackagingCostBreakdown {
    id: number;
    consumption_id: number;
    material_id: number;
    qty_used: string;
    unit_cost: string;
    line_total: string;
}
