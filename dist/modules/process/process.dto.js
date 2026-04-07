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
exports.UpdatePtTagDto = exports.AddPtTagItemDto = exports.CreatePtTagDto = exports.CreateFruitProcessDto = void 0;
const class_validator_1 = require("class-validator");
const process_entities_1 = require("./process.entities");
class CreateFruitProcessDto {
}
exports.CreateFruitProcessDto = CreateFruitProcessDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateFruitProcessDto.prototype, "recepcion_id", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateFruitProcessDto.prototype, "fecha_proceso", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateFruitProcessDto.prototype, "productor_id", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateFruitProcessDto.prototype, "variedad_id", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], CreateFruitProcessDto.prototype, "peso_procesado_lb", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateFruitProcessDto.prototype, "merma_lb", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(process_entities_1.ProcessResult),
    __metadata("design:type", String)
], CreateFruitProcessDto.prototype, "resultado", void 0);
class CreatePtTagDto {
}
exports.CreatePtTagDto = CreatePtTagDto;
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreatePtTagDto.prototype, "fecha", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(process_entities_1.ProcessResult),
    __metadata("design:type", String)
], CreatePtTagDto.prototype, "resultado", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePtTagDto.prototype, "format_code", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreatePtTagDto.prototype, "cajas_por_pallet", void 0);
class AddPtTagItemDto {
}
exports.AddPtTagItemDto = AddPtTagItemDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], AddPtTagItemDto.prototype, "process_id", void 0);
class UpdatePtTagDto {
}
exports.UpdatePtTagDto = UpdatePtTagDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdatePtTagDto.prototype, "format_code", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdatePtTagDto.prototype, "cajas_por_pallet", void 0);
//# sourceMappingURL=process.dto.js.map