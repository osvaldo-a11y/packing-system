"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackagingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const packaging_entities_1 = require("./packaging.entities");
const packaging_controller_1 = require("./packaging.controller");
const packaging_service_1 = require("./packaging.service");
let PackagingModule = class PackagingModule {
};
exports.PackagingModule = PackagingModule;
exports.PackagingModule = PackagingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                packaging_entities_1.PackagingMaterial,
                packaging_entities_1.PackagingRecipe,
                packaging_entities_1.PackagingRecipeItem,
                packaging_entities_1.PackagingPalletConsumption,
                packaging_entities_1.PackagingCostBreakdown,
            ]),
        ],
        controllers: [packaging_controller_1.PackagingController],
        providers: [packaging_service_1.PackagingService],
    })
], PackagingModule);
//# sourceMappingURL=packaging.module.js.map