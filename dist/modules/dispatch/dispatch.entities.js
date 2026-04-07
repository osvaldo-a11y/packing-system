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
exports.SalesOrderModification = exports.InvoiceItem = exports.Invoice = exports.PackingList = exports.DispatchTagItem = exports.Dispatch = exports.SalesOrder = void 0;
const typeorm_1 = require("typeorm");
let SalesOrder = class SalesOrder {
};
exports.SalesOrder = SalesOrder;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], SalesOrder.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 40, unique: true }),
    __metadata("design:type", String)
], SalesOrder.prototype, "order_number", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], SalesOrder.prototype, "cliente_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], SalesOrder.prototype, "requested_pallets", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], SalesOrder.prototype, "requested_boxes", void 0);
exports.SalesOrder = SalesOrder = __decorate([
    (0, typeorm_1.Entity)('sales_orders')
], SalesOrder);
let Dispatch = class Dispatch {
};
exports.Dispatch = Dispatch;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], Dispatch.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Dispatch.prototype, "orden_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Dispatch.prototype, "cliente_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], Dispatch.prototype, "fecha_despacho", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, unique: true }),
    __metadata("design:type", String)
], Dispatch.prototype, "numero_bol", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2 }),
    __metadata("design:type", String)
], Dispatch.prototype, "temperatura_f", void 0);
exports.Dispatch = Dispatch = __decorate([
    (0, typeorm_1.Entity)('dispatches')
], Dispatch);
let DispatchTagItem = class DispatchTagItem {
};
exports.DispatchTagItem = DispatchTagItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], DispatchTagItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], DispatchTagItem.prototype, "dispatch_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], DispatchTagItem.prototype, "tarja_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], DispatchTagItem.prototype, "cajas_despachadas", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], DispatchTagItem.prototype, "pallets_despachados", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", String)
], DispatchTagItem.prototype, "unit_price", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", String)
], DispatchTagItem.prototype, "pallet_cost", void 0);
exports.DispatchTagItem = DispatchTagItem = __decorate([
    (0, typeorm_1.Entity)('dispatch_tag_items'),
    (0, typeorm_1.Unique)('uq_dti_dispatch_tag', ['dispatch_id', 'tarja_id'])
], DispatchTagItem);
let PackingList = class PackingList {
};
exports.PackingList = PackingList;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], PackingList.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', unique: true }),
    __metadata("design:type", Number)
], PackingList.prototype, "dispatch_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 40, unique: true }),
    __metadata("design:type", String)
], PackingList.prototype, "packing_number", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json', nullable: true }),
    __metadata("design:type", Object)
], PackingList.prototype, "printable_payload", void 0);
exports.PackingList = PackingList = __decorate([
    (0, typeorm_1.Entity)('packing_lists')
], PackingList);
let Invoice = class Invoice {
};
exports.Invoice = Invoice;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], Invoice.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', unique: true }),
    __metadata("design:type", Number)
], Invoice.prototype, "dispatch_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 40, unique: true }),
    __metadata("design:type", String)
], Invoice.prototype, "invoice_number", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", String)
], Invoice.prototype, "subtotal", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", String)
], Invoice.prototype, "total_cost", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", String)
], Invoice.prototype, "total", void 0);
exports.Invoice = Invoice = __decorate([
    (0, typeorm_1.Entity)('invoices')
], Invoice);
let InvoiceItem = class InvoiceItem {
};
exports.InvoiceItem = InvoiceItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], InvoiceItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], InvoiceItem.prototype, "invoice_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], InvoiceItem.prototype, "tarja_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], InvoiceItem.prototype, "cajas", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", String)
], InvoiceItem.prototype, "unit_price", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", String)
], InvoiceItem.prototype, "line_subtotal", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", String)
], InvoiceItem.prototype, "pallet_cost_total", void 0);
exports.InvoiceItem = InvoiceItem = __decorate([
    (0, typeorm_1.Entity)('invoice_items')
], InvoiceItem);
let SalesOrderModification = class SalesOrderModification {
};
exports.SalesOrderModification = SalesOrderModification;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('increment'),
    __metadata("design:type", Number)
], SalesOrderModification.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], SalesOrderModification.prototype, "order_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json' }),
    __metadata("design:type", Object)
], SalesOrderModification.prototype, "before_payload", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json' }),
    __metadata("design:type", Object)
], SalesOrderModification.prototype, "after_payload", void 0);
exports.SalesOrderModification = SalesOrderModification = __decorate([
    (0, typeorm_1.Entity)('sales_order_modifications')
], SalesOrderModification);
//# sourceMappingURL=dispatch.entities.js.map