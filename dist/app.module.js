"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const database_config_1 = require("./database/database.config");
const auth_module_1 = require("./modules/auth/auth.module");
const process_module_1 = require("./modules/process/process.module");
const dispatch_billing_module_1 = require("./modules/dispatch/dispatch-billing.module");
const packaging_module_1 = require("./modules/packaging/packaging.module");
const reporting_module_1 = require("./modules/reporting/reporting.module");
const plant_module_1 = require("./modules/plant/plant.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            auth_module_1.AuthModule,
            typeorm_1.TypeOrmModule.forRoot((0, database_config_1.getTypeOrmModuleOptions)()),
            process_module_1.ProcessModule,
            dispatch_billing_module_1.DispatchBillingModule,
            packaging_module_1.PackagingModule,
            plant_module_1.PlantModule,
            reporting_module_1.ReportingModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map