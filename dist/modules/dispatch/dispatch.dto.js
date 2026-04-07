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
exports.ModifySalesOrderDto = exports.AddDispatchTagDto = exports.CreateDispatchDto = exports.CreateSalesOrderDto = void 0;
const class_validator_1 = require("class-validator");
class CreateSalesOrderDto {
}
exports.CreateSalesOrderDto = CreateSalesOrderDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateSalesOrderDto.prototype, "cliente_id", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateSalesOrderDto.prototype, "requested_pallets", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateSalesOrderDto.prototype, "requested_boxes", void 0);
class CreateDispatchDto {
}
exports.CreateDispatchDto = CreateDispatchDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateDispatchDto.prototype, "orden_id", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateDispatchDto.prototype, "cliente_id", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateDispatchDto.prototype, "fecha_despacho", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDispatchDto.prototype, "numero_bol", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateDispatchDto.prototype, "temperatura_f", void 0);
class AddDispatchTagDto {
}
exports.AddDispatchTagDto = AddDispatchTagDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], AddDispatchTagDto.prototype, "tarja_id", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AddDispatchTagDto.prototype, "cajas_despachadas", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AddDispatchTagDto.prototype, "pallets_despachados", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AddDispatchTagDto.prototype, "unit_price", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AddDispatchTagDto.prototype, "pallet_cost", void 0);
class ModifySalesOrderDto {
}
exports.ModifySalesOrderDto = ModifySalesOrderDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ModifySalesOrderDto.prototype, "requested_pallets", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ModifySalesOrderDto.prototype, "requested_boxes", void 0);
//# sourceMappingURL=dispatch.dto.js.map