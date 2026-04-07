import { Repository } from 'typeorm';
import { AddRecipeItemDto, CreateConsumptionDto, CreateMaterialDto, CreateRecipeDto } from './packaging.dto';
import { PackagingCostBreakdown, PackagingMaterial, PackagingPalletConsumption, PackagingRecipe, PackagingRecipeItem } from './packaging.entities';
export declare class PackagingService {
    private readonly materialRepo;
    private readonly recipeRepo;
    private readonly recipeItemRepo;
    private readonly consumptionRepo;
    private readonly breakdownRepo;
    constructor(materialRepo: Repository<PackagingMaterial>, recipeRepo: Repository<PackagingRecipe>, recipeItemRepo: Repository<PackagingRecipeItem>, consumptionRepo: Repository<PackagingPalletConsumption>, breakdownRepo: Repository<PackagingCostBreakdown>);
    createMaterial(dto: CreateMaterialDto): Promise<PackagingMaterial>;
    listMaterials(): Promise<PackagingMaterial[]>;
    createRecipe(dto: CreateRecipeDto): Promise<PackagingRecipe>;
    addRecipeItem(recipeId: number, dto: AddRecipeItemDto): Promise<PackagingRecipeItem>;
    private findMaterialByCategory;
    createConsumption(dto: CreateConsumptionDto): Promise<{
        consumption: PackagingPalletConsumption;
        breakdowns: PackagingCostBreakdown[];
        total_cost: number;
    }>;
    getConsumption(id: number): Promise<{
        consumption: PackagingPalletConsumption;
        breakdowns: PackagingCostBreakdown[];
    }>;
}
