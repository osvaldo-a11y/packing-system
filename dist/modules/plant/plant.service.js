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
exports.PlantService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const plant_entities_1 = require("./plant.entities");
let PlantService = class PlantService {
    constructor(repo) {
        this.repo = repo;
    }
    async getOrCreate() {
        let row = await this.repo.findOne({ order: { id: 'ASC' } });
        if (!row) {
            row = await this.repo.save(this.repo.create({
                yield_tolerance_percent: '5.0000',
                min_yield_percent: '70.0000',
                max_merma_percent: '15.0000',
            }));
        }
        return row;
    }
    async update(dto) {
        const row = await this.getOrCreate();
        if (!row)
            throw new common_1.NotFoundException('Parámetros de planta no inicializados');
        row.yield_tolerance_percent = dto.yield_tolerance_percent.toFixed(4);
        row.min_yield_percent = dto.min_yield_percent.toFixed(4);
        row.max_merma_percent = dto.max_merma_percent.toFixed(4);
        return this.repo.save(row);
    }
};
exports.PlantService = PlantService;
exports.PlantService = PlantService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plant_entities_1.PlantSettings)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PlantService);
//# sourceMappingURL=plant.service.js.map