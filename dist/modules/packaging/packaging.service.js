"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackagingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const packaging_entities_1 = require("./packaging.entities");
let PackagingService = class PackagingService {
    constructor(materialRepo, recipeRepo, recipeItemRepo, consumptionRepo, breakdownRepo) {
        this.materialRepo = materialRepo;
        this.recipeRepo = recipeRepo;
        this.recipeItemRepo = recipeItemRepo;
        this.consumptionRepo = consumptionRepo;
        this.breakdownRepo = breakdownRepo;
    }
    createMaterial(dto) {
        return this.materialRepo.save(this.materialRepo.create({
            ...dto,
            costo_unitario: dto.costo_unitario.toFixed(4),
            cantidad_disponible: dto.cantidad_disponible.toFixed(3),
        }));
    }
    listMaterials() {
        return this.materialRepo.find({ order: { id: 'DESC' } });
    }
    createRecipe(dto) {
        return this.recipeRepo.save(this.recipeRepo.create(dto));
    }
    async addRecipeItem(recipeId, dto) {
        if (!['box', 'pallet'].includes(dto.base_unidad)) {
            throw new common_1.BadRequestException('base_unidad debe ser box o pallet');
        }
        const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
        if (!recipe)
            throw new common_1.NotFoundException('Receta no encontrada');
        const material = await this.materialRepo.findOne({ where: { id: dto.material_id, activo: true } });
        if (!material)
            throw new common_1.NotFoundException('Material no encontrado');
        return this.recipeItemRepo.save(this.recipeItemRepo.create({
            recipe_id: recipeId,
            material_id: dto.material_id,
            qty_per_unit: dto.qty_per_unit.toFixed(4),
            base_unidad: dto.base_unidad,
        }));
    }
    async findMaterialByCategory(categoria) {
        return this.materialRepo.findOne({ where: { categoria, activo: true }, order: { id: 'ASC' } });
    }
    async createConsumption(dto) {
        const recipe = await this.recipeRepo.findOne({ where: { id: dto.recipe_id, activo: true } });
        if (!recipe)
            throw new common_1.NotFoundException('Receta no encontrada');
        const recipeItems = await this.recipeItemRepo.find({ where: { recipe_id: dto.recipe_id } });
        if (!recipeItems.length)
            throw new common_1.BadRequestException('La receta no tiene materiales');
        const consumption = await this.consumptionRepo.save(this.consumptionRepo.create({
            ...dto,
            tape_linear_meters: dto.tape_linear_meters.toFixed(3),
        }));
        let total = 0;
        const breakdowns = [];
        for (const item of recipeItems) {
            const material = await this.materialRepo.findOne({ where: { id: item.material_id } });
            if (!material)
                throw new common_1.NotFoundException(`Material ${item.material_id} no existe`);
            const qtyFactor = item.base_unidad === 'box' ? dto.boxes_count : dto.pallet_count;
            const qtyUsed = Number(item.qty_per_unit) * qtyFactor;
            const lineTotal = qtyUsed * Number(material.costo_unitario);
            if (Number(material.cantidad_disponible) < qtyUsed) {
                throw new common_1.BadRequestException(`Inventario insuficiente para ${material.nombre_material}`);
            }
            material.cantidad_disponible = (Number(material.cantidad_disponible) - qtyUsed).toFixed(3);
            await this.materialRepo.save(material);
            total += lineTotal;
            breakdowns.push(this.breakdownRepo.create({
                consumption_id: consumption.id,
                material_id: material.id,
                qty_used: qtyUsed.toFixed(4),
                unit_cost: Number(material.costo_unitario).toFixed(4),
                line_total: lineTotal.toFixed(2),
            }));
        }
        const tapeMat = await this.findMaterialByCategory(packaging_entities_1.MaterialCategory.TAPE);
        if (tapeMat && dto.tape_linear_meters > 0) {
            const qtyUsed = dto.tape_linear_meters;
            const lineTotal = qtyUsed * Number(tapeMat.costo_unitario);
            if (Number(tapeMat.cantidad_disponible) < qtyUsed)
                throw new common_1.BadRequestException('Inventario insuficiente de tape');
            tapeMat.cantidad_disponible = (Number(tapeMat.cantidad_disponible) - qtyUsed).toFixed(3);
            await this.materialRepo.save(tapeMat);
            total += lineTotal;
            breakdowns.push(this.breakdownRepo.create({
                consumption_id: consumption.id,
                material_id: tapeMat.id,
                qty_used: qtyUsed.toFixed(4),
                unit_cost: Number(tapeMat.costo_unitario).toFixed(4),
                line_total: lineTotal.toFixed(2),
            }));
        }
        const cornerMat = await this.findMaterialByCategory(packaging_entities_1.MaterialCategory.CORNER_BOARD);
        if (cornerMat && dto.corner_boards_qty > 0) {
            const qtyUsed = dto.corner_boards_qty;
            const lineTotal = qtyUsed * Number(cornerMat.costo_unitario);
            if (Number(cornerMat.cantidad_disponible) < qtyUsed)
                throw new common_1.BadRequestException('Inventario insuficiente de corner board');
            cornerMat.cantidad_disponible = (Number(cornerMat.cantidad_disponible) - qtyUsed).toFixed(3);
            await this.materialRepo.save(cornerMat);
            total += lineTotal;
            breakdowns.push(this.breakdownRepo.create({
                consumption_id: consumption.id,
                material_id: cornerMat.id,
                qty_used: qtyUsed.toFixed(4),
                unit_cost: Number(cornerMat.costo_unitario).toFixed(4),
                line_total: lineTotal.toFixed(2),
            }));
        }
        const labelMat = await this.findMaterialByCategory(packaging_entities_1.MaterialCategory.ETIQUETA);
        if (labelMat && dto.labels_qty > 0) {
            const qtyUsed = dto.labels_qty;
            const lineTotal = qtyUsed * Number(labelMat.costo_unitario);
            if (Number(labelMat.cantidad_disponible) < qtyUsed)
                throw new common_1.BadRequestException('Inventario insuficiente de etiquetas');
            labelMat.cantidad_disponible = (Number(labelMat.cantidad_disponible) - qtyUsed).toFixed(3);
            await this.materialRepo.save(labelMat);
            total += lineTotal;
            breakdowns.push(this.breakdownRepo.create({
                consumption_id: consumption.id,
                material_id: labelMat.id,
                qty_used: qtyUsed.toFixed(4),
                unit_cost: Number(labelMat.costo_unitario).toFixed(4),
                line_total: lineTotal.toFixed(2),
            }));
        }
        await this.breakdownRepo.save(breakdowns);
        consumption.material_cost_total = total.toFixed(2);
        await this.consumptionRepo.save(consumption);
        return {
            consumption,
            breakdowns,
            total_cost: Number(total.toFixed(2)),
        };
    }
    async getConsumption(id) {
        const consumption = await this.consumptionRepo.findOne({ where: { id } });
        if (!consumption)
            throw new common_1.NotFoundException('Consumo no encontrado');
        const breakdowns = await this.breakdownRepo.find({ where: { consumption_id: id } });
        return { consumption, breakdowns };
    }
};
exports.PackagingService = PackagingService;
exports.PackagingService = PackagingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(packaging_entities_1.PackagingMaterial)),
    __param(1, (0, typeorm_1.InjectRepository)(packaging_entities_1.PackagingRecipe)),
    __param(2, (0, typeorm_1.InjectRepository)(packaging_entities_1.PackagingRecipeItem)),
    __param(3, (0, typeorm_1.InjectRepository)(packaging_entities_1.PackagingPalletConsumption)),
    __param(4, (0, typeorm_1.InjectRepository)(packaging_entities_1.PackagingCostBreakdown)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], PackagingService);
//# sourceMappingURL=packaging.service.js.map