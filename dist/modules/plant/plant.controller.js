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
exports.PlantController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_1 = require("../../common/roles");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const plant_dto_1 = require("./plant.dto");
const plant_service_1 = require("./plant.service");
let PlantController = class PlantController {
    constructor(service) {
        this.service = service;
    }
    get() {
        return this.service.getOrCreate();
    }
    update(dto) {
        return this.service.update(dto);
    }
};
exports.PlantController = PlantController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PlantController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [plant_dto_1.UpdatePlantSettingsDto]),
    __metadata("design:returntype", void 0)
], PlantController.prototype, "update", null);
exports.PlantController = PlantController = __decorate([
    (0, common_1.Controller)('api/plant-settings'),
    __metadata("design:paramtypes", [plant_service_1.PlantService])
], PlantController);
//# sourceMappingURL=plant.controller.js.map