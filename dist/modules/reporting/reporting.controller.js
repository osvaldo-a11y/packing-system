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
exports.ReportingController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_1 = require("../../common/roles");
const reporting_dto_1 = require("./reporting.dto");
const reporting_export_service_1 = require("./reporting-export.service");
const reporting_service_1 = require("./reporting.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let ReportingController = class ReportingController {
    constructor(service, exportService) {
        this.service = service;
        this.exportService = exportService;
    }
    generate(query) {
        return this.service.generate(query);
    }
    async export(query, res) {
        const { buffer, mime, filename } = await this.exportService.build(query.format, query);
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    }
    save(dto) {
        return this.service.saveReport(dto);
    }
    list() {
        return this.service.listSavedReports();
    }
    update(id, dto) {
        return this.service.updateSavedReport(id, dto);
    }
    remove(id) {
        return this.service.deleteSavedReport(id);
    }
};
exports.ReportingController = ReportingController;
__decorate([
    (0, common_1.Get)('generate'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN, roles_1.ROLES.SUPERVISOR, roles_1.ROLES.OPERATOR),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reporting_dto_1.ReportFilterDto]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "generate", null);
__decorate([
    (0, common_1.Get)('export'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN, roles_1.ROLES.SUPERVISOR, roles_1.ROLES.OPERATOR),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reporting_dto_1.ReportExportQueryDto, Object]),
    __metadata("design:returntype", Promise)
], ReportingController.prototype, "export", null);
__decorate([
    (0, common_1.Post)('saved-reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN, roles_1.ROLES.SUPERVISOR),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reporting_dto_1.SaveReportDto]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "save", null);
__decorate([
    (0, common_1.Get)('saved-reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN, roles_1.ROLES.SUPERVISOR, roles_1.ROLES.OPERATOR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "list", null);
__decorate([
    (0, common_1.Put)('saved-reports/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN, roles_1.ROLES.SUPERVISOR),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, reporting_dto_1.SaveReportDto]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('saved-reports/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(roles_1.ROLES.ADMIN),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "remove", null);
exports.ReportingController = ReportingController = __decorate([
    (0, common_1.Controller)('api/reporting'),
    __metadata("design:paramtypes", [reporting_service_1.ReportingService,
        reporting_export_service_1.ReportingExportService])
], ReportingController);
//# sourceMappingURL=reporting.controller.js.map