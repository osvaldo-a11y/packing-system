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
exports.DispatchBillingService = void 0;
const to_json_record_1 = require("../../common/to-json-record");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const dispatch_entities_1 = require("./dispatch.entities");
let DispatchBillingService = class DispatchBillingService {
    constructor(soRepo, dispatchRepo, dtiRepo, plRepo, invRepo, invItemRepo, soModRepo) {
        this.soRepo = soRepo;
        this.dispatchRepo = dispatchRepo;
        this.dtiRepo = dtiRepo;
        this.plRepo = plRepo;
        this.invRepo = invRepo;
        this.invItemRepo = invItemRepo;
        this.soModRepo = soModRepo;
    }
    async createSalesOrder(dto) {
        const seq = (await this.soRepo.count()) + 1;
        return this.soRepo.save(this.soRepo.create({
            cliente_id: dto.cliente_id,
            requested_pallets: dto.requested_pallets,
            requested_boxes: dto.requested_boxes,
            order_number: `SO-${String(seq).padStart(5, '0')}`,
        }));
    }
    async modifySalesOrder(orderId, dto) {
        const order = await this.soRepo.findOne({ where: { id: orderId } });
        if (!order)
            throw new common_1.NotFoundException('Orden no encontrada');
        const before = { ...order };
        order.requested_pallets = dto.requested_pallets;
        order.requested_boxes = dto.requested_boxes;
        await this.soRepo.save(order);
        await this.soModRepo.save(this.soModRepo.create({
            order_id: orderId,
            before_payload: (0, to_json_record_1.toJsonRecord)(before),
            after_payload: (0, to_json_record_1.toJsonRecord)(order),
        }));
        const dispatches = await this.dispatchRepo.find({ where: { orden_id: orderId } });
        for (const d of dispatches) {
            await this.generatePackingList(d.id);
            await this.generateInvoice(d.id);
        }
        return order;
    }
    async createDispatch(dto) {
        return this.dispatchRepo.save(this.dispatchRepo.create({
            ...dto,
            fecha_despacho: new Date(dto.fecha_despacho),
            temperatura_f: dto.temperatura_f.toFixed(2),
        }));
    }
    async addTag(dispatchId, dto) {
        return this.dtiRepo.save(this.dtiRepo.create({
            dispatch_id: dispatchId,
            ...dto,
            unit_price: dto.unit_price.toFixed(4),
            pallet_cost: dto.pallet_cost.toFixed(4),
        }));
    }
    async generatePackingList(dispatchId) {
        const dispatch = await this.dispatchRepo.findOne({ where: { id: dispatchId } });
        if (!dispatch)
            throw new common_1.NotFoundException('Despacho no encontrado');
        const items = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });
        const existing = await this.plRepo.findOne({ where: { dispatch_id: dispatchId } });
        if (existing) {
            existing.printable_payload = { dispatch, items };
            return this.plRepo.save(existing);
        }
        const seq = (await this.plRepo.count()) + 1;
        return this.plRepo.save(this.plRepo.create({
            dispatch_id: dispatchId,
            packing_number: `PK-${String(seq).padStart(5, '0')}`,
            printable_payload: { dispatch, items },
        }));
    }
    async generateInvoice(dispatchId) {
        const rows = await this.dtiRepo.find({ where: { dispatch_id: dispatchId } });
        let inv = await this.invRepo.findOne({ where: { dispatch_id: dispatchId } });
        if (!inv) {
            const seq = (await this.invRepo.count()) + 1;
            inv = await this.invRepo.save(this.invRepo.create({
                dispatch_id: dispatchId,
                invoice_number: `INV-${String(seq).padStart(5, '0')}`,
                subtotal: '0.00',
                total_cost: '0.00',
                total: '0.00',
            }));
        }
        else {
            await this.invItemRepo.delete({ invoice_id: inv.id });
        }
        let subtotal = 0;
        let totalCost = 0;
        for (const r of rows) {
            const lineSubtotal = r.cajas_despachadas * Number(r.unit_price);
            const lineCost = r.pallets_despachados * Number(r.pallet_cost);
            subtotal += lineSubtotal;
            totalCost += lineCost;
            await this.invItemRepo.save(this.invItemRepo.create({
                invoice_id: inv.id,
                tarja_id: r.tarja_id,
                cajas: r.cajas_despachadas,
                unit_price: r.unit_price,
                line_subtotal: lineSubtotal.toFixed(2),
                pallet_cost_total: lineCost.toFixed(2),
            }));
        }
        inv.subtotal = subtotal.toFixed(2);
        inv.total_cost = totalCost.toFixed(2);
        inv.total = subtotal.toFixed(2);
        return this.invRepo.save(inv);
    }
};
exports.DispatchBillingService = DispatchBillingService;
exports.DispatchBillingService = DispatchBillingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(dispatch_entities_1.SalesOrder)),
    __param(1, (0, typeorm_1.InjectRepository)(dispatch_entities_1.Dispatch)),
    __param(2, (0, typeorm_1.InjectRepository)(dispatch_entities_1.DispatchTagItem)),
    __param(3, (0, typeorm_1.InjectRepository)(dispatch_entities_1.PackingList)),
    __param(4, (0, typeorm_1.InjectRepository)(dispatch_entities_1.Invoice)),
    __param(5, (0, typeorm_1.InjectRepository)(dispatch_entities_1.InvoiceItem)),
    __param(6, (0, typeorm_1.InjectRepository)(dispatch_entities_1.SalesOrderModification)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], DispatchBillingService);
//# sourceMappingURL=dispatch-billing.service.js.map