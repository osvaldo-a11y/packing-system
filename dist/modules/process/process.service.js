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
exports.ProcessService = void 0;
const to_json_record_1 = require("../../common/to-json-record");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const process_entities_1 = require("./process.entities");
let ProcessService = class ProcessService {
    constructor(processRepo, tagRepo, tagItemRepo, tagAuditRepo) {
        this.processRepo = processRepo;
        this.tagRepo = tagRepo;
        this.tagItemRepo = tagItemRepo;
        this.tagAuditRepo = tagAuditRepo;
    }
    async createProcess(dto) {
        const pct = (dto.peso_procesado_lb / 1000) * 100;
        const row = this.processRepo.create({
            ...dto,
            fecha_proceso: new Date(dto.fecha_proceso),
            porcentaje_procesado: pct.toFixed(4),
            peso_procesado_lb: dto.peso_procesado_lb.toFixed(2),
            merma_lb: dto.merma_lb.toFixed(2),
        });
        return this.processRepo.save(row);
    }
    async createTag(dto) {
        const seq = (await this.tagRepo.count()) + 1;
        const ymd = dto.fecha.slice(0, 10).replace(/-/g, '');
        return this.tagRepo.save(this.tagRepo.create({
            ...dto,
            fecha: new Date(dto.fecha),
            tag_code: `TAR-${ymd}-${String(seq).padStart(5, '0')}`,
        }));
    }
    boxWeight(formatCode) {
        const m = /^(\d+)x(\d+)oz$/i.exec(formatCode);
        if (!m)
            throw new common_1.BadRequestException('format_code inválido');
        return (Number(m[1]) * Number(m[2])) / 16;
    }
    async addProcessToTag(tagId, dto) {
        const tag = await this.tagRepo.findOne({ where: { id: tagId } });
        const proc = await this.processRepo.findOne({ where: { id: dto.process_id } });
        if (!tag || !proc)
            throw new common_1.NotFoundException('Tarja o proceso no encontrado');
        const exists = await this.tagItemRepo.findOne({ where: { tarja_id: tagId, process_id: dto.process_id } });
        if (exists)
            throw new common_1.BadRequestException('Proceso ya agregado a esta tarja');
        const net = Number(proc.peso_procesado_lb) - Number(proc.merma_lb);
        const cajas = Math.floor(net / this.boxWeight(tag.format_code));
        const pallets = Math.max(1, Math.ceil(cajas / tag.cajas_por_pallet));
        await this.tagItemRepo.save(this.tagItemRepo.create({
            tarja_id: tagId,
            process_id: proc.id,
            productor_id: proc.productor_id,
            cajas_generadas: cajas,
            pallets_generados: pallets,
        }));
        proc.tarja_id = tagId;
        await this.processRepo.save(proc);
        const items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });
        tag.total_cajas = items.reduce((a, i) => a + i.cajas_generadas, 0);
        tag.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
        await this.tagRepo.save(tag);
        return tag;
    }
    async updateTag(tagId, dto) {
        const tag = await this.tagRepo.findOne({ where: { id: tagId } });
        if (!tag)
            throw new common_1.NotFoundException('Tarja no encontrada');
        const before = { ...tag };
        tag.format_code = dto.format_code;
        tag.cajas_por_pallet = dto.cajas_por_pallet;
        await this.tagRepo.save(tag);
        const items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });
        for (const item of items) {
            item.pallets_generados = Math.max(1, Math.ceil(item.cajas_generadas / tag.cajas_por_pallet));
            await this.tagItemRepo.save(item);
        }
        tag.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
        await this.tagRepo.save(tag);
        await this.tagAuditRepo.save(this.tagAuditRepo.create({
            tarja_id: tagId,
            action: 'update_tag',
            before_payload: (0, to_json_record_1.toJsonRecord)(before),
            after_payload: (0, to_json_record_1.toJsonRecord)(tag),
        }));
        return tag;
    }
};
exports.ProcessService = ProcessService;
exports.ProcessService = ProcessService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(process_entities_1.FruitProcess)),
    __param(1, (0, typeorm_1.InjectRepository)(process_entities_1.PtTag)),
    __param(2, (0, typeorm_1.InjectRepository)(process_entities_1.PtTagItem)),
    __param(3, (0, typeorm_1.InjectRepository)(process_entities_1.PtTagAudit)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ProcessService);
//# sourceMappingURL=process.service.js.map