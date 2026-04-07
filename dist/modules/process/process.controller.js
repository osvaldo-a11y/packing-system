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
exports.ProcessController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_1 = require("../../common/roles");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const process_dto_1 = require("./process.dto");
const process_service_1 = require("./process.service");
let ProcessController = class ProcessController {
    constructor(service) {
        this.service = service;
    }
    createProcess(dto) {
        return this.service.createProcess(dto);
    }
    createTag(dto) {
        return this.service.createTag(dto);
    }
    addToTag(id, dto) {
        return this.service.addProcessToTag(id, dto);
    }
    updateTag(id, dto) {
        return this.service.updateTag(id, dto);
    }
};
exports.ProcessController = ProcessController;
__decorate([
    (0, common_1.Post)('processes'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [process_dto_1.CreateFruitProcessDto]),
    __metadata("design:returntype", void 0)
], ProcessController.prototype, "createProcess", null);
__decorate([
    (0, common_1.Post)('pt-tags'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [process_dto_1.CreatePtTagDto]),
    __metadata("design:returntype", void 0)
], ProcessController.prototype, "createTag", null);
__decorate([
    (0, common_1.Post)('pt-tags/:id/items'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, process_dto_1.AddPtTagItemDto]),
    __metadata("design:returntype", void 0)
], ProcessController.prototype, "addToTag", null);
__decorate([
    (0, common_1.Put)('pt-tags/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN, roles_1.ROLES.SUPERVISOR),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, process_dto_1.UpdatePtTagDto]),
    __metadata("design:returntype", void 0)
], ProcessController.prototype, "updateTag", null);
exports.ProcessController = ProcessController = __decorate([
    (0, common_1.Controller)('api'),
    __metadata("design:paramtypes", [process_service_1.ProcessService])
], ProcessController);
//# sourceMappingURL=process.controller.js.map