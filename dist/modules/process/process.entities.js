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
exports.PtTagItem = exports.PtTagAudit = exports.PtTag = exports.FruitProcess = exports.ProcessResult = void 0;
const typeorm_1 = require("typeorm");
var ProcessResult;
(function (ProcessResult) {
    ProcessResult["IQF"] = "IQF";
    ProcessResult["JUGO"] = "jugo";
    ProcessResult["PERDIDO"] = "perdido";
    ProcessResult["OTRO"] = "otro";
})(ProcessResult || (exports.ProcessResult = ProcessResult = {}));
let FruitProcess = class FruitProcess {
};
exports.FruitProcess = FruitProcess;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], FruitProcess.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], FruitProcess.prototype, "recepcion_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], FruitProcess.prototype, "fecha_proceso", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], FruitProcess.prototype, "productor_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], FruitProcess.prototype, "variedad_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", String)
], FruitProcess.prototype, "peso_procesado_lb", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", String)
], FruitProcess.prototype, "merma_lb", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 8, scale: 4 }),
    __metadata("design:type", String)
], FruitProcess.prototype, "porcentaje_procesado", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: ProcessResult }),
    __metadata("design:type", String)
], FruitProcess.prototype, "resultado", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], FruitProcess.prototype, "tarja_id", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], FruitProcess.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.DeleteDateColumn)({ nullable: true }),
    __metadata("design:type", Date)
], FruitProcess.prototype, "deleted_at", void 0);
exports.FruitProcess = FruitProcess = __decorate([
    (0, typeorm_1.Entity)('fruit_processes')
], FruitProcess);
let PtTag = class PtTag {
};
exports.PtTag = PtTag;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PtTag.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, unique: true }),
    __metadata("design:type", String)
], PtTag.prototype, "tag_code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], PtTag.prototype, "fecha", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: ProcessResult }),
    __metadata("design:type", String)
], PtTag.prototype, "resultado", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], PtTag.prototype, "format_code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 100 }),
    __metadata("design:type", Number)
], PtTag.prototype, "cajas_por_pallet", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PtTag.prototype, "total_cajas", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PtTag.prototype, "total_pallets", void 0);
exports.PtTag = PtTag = __decorate([
    (0, typeorm_1.Entity)('pt_tags')
], PtTag);
let PtTagAudit = class PtTagAudit {
};
exports.PtTagAudit = PtTagAudit;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PtTagAudit.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PtTagAudit.prototype, "tarja_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], PtTagAudit.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json' }),
    __metadata("design:type", Object)
], PtTagAudit.prototype, "before_payload", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json' }),
    __metadata("design:type", Object)
], PtTagAudit.prototype, "after_payload", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PtTagAudit.prototype, "created_at", void 0);
exports.PtTagAudit = PtTagAudit = __decorate([
    (0, typeorm_1.Entity)('pt_tag_audits')
], PtTagAudit);
let PtTagItem = class PtTagItem {
};
exports.PtTagItem = PtTagItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PtTagItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PtTagItem.prototype, "tarja_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PtTagItem.prototype, "process_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], PtTagItem.prototype, "productor_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], PtTagItem.prototype, "cajas_generadas", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], PtTagItem.prototype, "pallets_generados", void 0);
exports.PtTagItem = PtTagItem = __decorate([
    (0, typeorm_1.Entity)('pt_tag_items'),
    (0, typeorm_1.Unique)('uq_pti_unique_process_per_tag', ['tarja_id', 'process_id'])
], PtTagItem);
//# sourceMappingURL=process.entities.js.map