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
exports.PackagingController = void 0;
const common_1 = require("@nestjs/common");
const packaging_dto_1 = require("./packaging.dto");
const packaging_service_1 = require("./packaging.service");
let PackagingController = class PackagingController {
    constructor(service) {
        this.service = service;
    }
    createMaterial(dto) {
        return this.service.createMaterial(dto);
    }
    listMaterials() {
        return this.service.listMaterials();
    }
    createRecipe(dto) {
        return this.service.createRecipe(dto);
    }
    addRecipeItem(id, dto) {
        return this.service.addRecipeItem(id, dto);
    }
    createConsumption(dto) {
        return this.service.createConsumption(dto);
    }
    getConsumption(id) {
        return this.service.getConsumption(id);
    }
};
exports.PackagingController = PackagingController;
__decorate([
    (0, common_1.Post)('materials'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [packaging_dto_1.CreateMaterialDto]),
    __metadata("design:returntype", void 0)
], PackagingController.prototype, "createMaterial", null);
__decorate([
    (0, common_1.Get)('materials'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PackagingController.prototype, "listMaterials", null);
__decorate([
    (0, common_1.Post)('recipes'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [packaging_dto_1.CreateRecipeDto]),
    __metadata("design:returntype", void 0)
], PackagingController.prototype, "createRecipe", null);
__decorate([
    (0, common_1.Post)('recipes/:id/items'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, packaging_dto_1.AddRecipeItemDto]),
    __metadata("design:returntype", void 0)
], PackagingController.prototype, "addRecipeItem", null);
__decorate([
    (0, common_1.Post)('consumptions'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [packaging_dto_1.CreateConsumptionDto]),
    __metadata("design:returntype", void 0)
], PackagingController.prototype, "createConsumption", null);
__decorate([
    (0, common_1.Get)('consumptions/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], PackagingController.prototype, "getConsumption", null);
exports.PackagingController = PackagingController = __decorate([
    (0, common_1.Controller)('api/packaging'),
    __metadata("design:paramtypes", [packaging_service_1.PackagingService])
], PackagingController);
//# sourceMappingURL=packaging.controller.js.map