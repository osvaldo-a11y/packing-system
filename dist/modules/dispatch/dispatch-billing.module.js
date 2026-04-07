"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchBillingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const dispatch_billing_controller_1 = require("./dispatch-billing.controller");
const dispatch_entities_1 = require("./dispatch.entities");
const dispatch_billing_service_1 = require("./dispatch-billing.service");
let DispatchBillingModule = class DispatchBillingModule {
};
exports.DispatchBillingModule = DispatchBillingModule;
exports.DispatchBillingModule = DispatchBillingModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([dispatch_entities_1.SalesOrder, dispatch_entities_1.SalesOrderModification, dispatch_entities_1.Dispatch, dispatch_entities_1.DispatchTagItem, dispatch_entities_1.PackingList, dispatch_entities_1.Invoice, dispatch_entities_1.InvoiceItem])],
        controllers: [dispatch_billing_controller_1.DispatchBillingController],
        providers: [dispatch_billing_service_1.DispatchBillingService],
    })
], DispatchBillingModule);
//# sourceMappingURL=dispatch-billing.module.js.map