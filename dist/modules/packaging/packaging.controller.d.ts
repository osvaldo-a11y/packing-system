import { AddRecipeItemDto, CreateConsumptionDto, CreateMaterialDto, CreateRecipeDto } from './packaging.dto';
import { PackagingService } from './packaging.service';
export declare class PackagingController {
    private readonly service;
    constructor(service: PackagingService);
    createMaterial(dto: CreateMaterialDto): Promise<import("./packaging.entities").PackagingMaterial>;
    listMaterials(): Promise<import("./packaging.entities").PackagingMaterial[]>;
    createRecipe(dto: CreateRecipeDto): Promise<import("./packaging.entities").PackagingRecipe>;
    addRecipeItem(id: number, dto: AddRecipeItemDto): Promise<import("./packaging.entities").PackagingRecipeItem>;
    createConsumption(dto: CreateConsumptionDto): Promise<{
        consumption: import("./packaging.entities").PackagingPalletConsumption;
        breakdowns: import("./packaging.entities").PackagingCostBreakdown[];
        total_cost: number;
    }>;
    getConsumption(id: number): Promise<{
        consumption: import("./packaging.entities").PackagingPalletConsumption;
        breakdowns: import("./packaging.entities").PackagingCostBreakdown[];
    }>;
}
