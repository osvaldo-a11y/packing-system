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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackagingCostBreakdown = exports.PackagingPalletConsumption = exports.PackagingRecipeItem = exports.PackagingRecipe = exports.PackagingMaterial = exports.MaterialCategory = void 0;
const typeorm_1 = require("typeorm");
var MaterialCategory;
(function (MaterialCategory) {
    MaterialCategory["CLAMSHELL"] = "clamshell";
    MaterialCategory["CAJA"] = "caja";
    MaterialCategory["ETIQUETA"] = "etiqueta";
    MaterialCategory["TAPE"] = "tape";
    MaterialCategory["CORNER_BOARD"] = "corner_board";
    MaterialCategory["OTRO"] = "otro";
})(MaterialCategory || (exports.MaterialCategory = MaterialCategory = {}));
let PackagingMaterial = class PackagingMaterial {
};
exports.PackagingMaterial = PackagingMaterial;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PackagingMaterial.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 80 }),
    __metadata("design:type", String)
], PackagingMaterial.prototype, "nombre_material", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: MaterialCategory }),
    __metadata("design:type", String)
], PackagingMaterial.prototype, "categoria", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], PackagingMaterial.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], PackagingMaterial.prototype, "unidad_medida", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", String)
], PackagingMaterial.prototype, "costo_unitario", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 3, default: 0 }),
    __metadata("design:type", String)
], PackagingMaterial.prototype, "cantidad_disponible", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], PackagingMaterial.prototype, "activo", void 0);
exports.PackagingMaterial = PackagingMaterial = __decorate([
    (0, typeorm_1.Entity)('packaging_materials')
], PackagingMaterial);
let PackagingRecipe = class PackagingRecipe {
};
exports.PackagingRecipe = PackagingRecipe;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PackagingRecipe.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], PackagingRecipe.prototype, "format_code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], PackagingRecipe.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], PackagingRecipe.prototype, "activo", void 0);
exports.PackagingRecipe = PackagingRecipe = __decorate([
    (0, typeorm_1.Entity)('packaging_recipes'),
    (0, typeorm_1.Unique)('uq_packaging_recipe_format_code', ['format_code'])
], PackagingRecipe);
let PackagingRecipeItem = class PackagingRecipeItem {
};
exports.PackagingRecipeItem = PackagingRecipeItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PackagingRecipeItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PackagingRecipeItem.prototype, "recipe_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PackagingRecipeItem.prototype, "material_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 4 }),
    __metadata("design:type", String)
], PackagingRecipeItem.prototype, "qty_per_unit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], PackagingRecipeItem.prototype, "base_unidad", void 0);
exports.PackagingRecipeItem = PackagingRecipeItem = __decorate([
    (0, typeorm_1.Entity)('packaging_recipe_items'),
    (0, typeorm_1.Unique)('uq_pri_recipe_material', ['recipe_id', 'material_id'])
], PackagingRecipeItem);
let PackagingPalletConsumption = class PackagingPalletConsumption {
};
exports.PackagingPalletConsumption = PackagingPalletConsumption;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "tarja_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "dispatch_tag_item_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "recipe_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 1 }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "pallet_count", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "boxes_count", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 3, default: 0 }),
    __metadata("design:type", String)
], PackagingPalletConsumption.prototype, "tape_linear_meters", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "corner_boards_qty", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PackagingPalletConsumption.prototype, "labels_qty", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", String)
], PackagingPalletConsumption.prototype, "material_cost_total", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PackagingPalletConsumption.prototype, "created_at", void 0);
exports.PackagingPalletConsumption = PackagingPalletConsumption = __decorate([
    (0, typeorm_1.Entity)('packaging_pallet_consumptions')
], PackagingPalletConsumption);
let PackagingCostBreakdown = class PackagingCostBreakdown {
};
exports.PackagingCostBreakdown = PackagingCostBreakdown;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PackagingCostBreakdown.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PackagingCostBreakdown.prototype, "consumption_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PackagingCostBreakdown.prototype, "material_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 4 }),
    __metadata("design:type", String)
], PackagingCostBreakdown.prototype, "qty_used", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", String)
], PackagingCostBreakdown.prototype, "unit_cost", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", String)
], PackagingCostBreakdown.prototype, "line_total", void 0);
exports.PackagingCostBreakdown = PackagingCostBreakdown = __decorate([
    (0, typeorm_1.Entity)('packaging_cost_breakdowns')
], PackagingCostBreakdown);
//# sourceMappingURL=packaging.entities.js.map