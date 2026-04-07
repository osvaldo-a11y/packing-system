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
exports.ReportingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const plant_service_1 = require("../plant/plant.service");
const reporting_entities_1 = require("./reporting.entities");
let ReportingService = class ReportingService {
    constructor(dataSource, reportRepo, plantService) {
        this.dataSource = dataSource;
        this.reportRepo = reportRepo;
        this.plantService = plantService;
    }
    withDate(field, filter) {
        const clauses = [];
        if (filter.fecha_desde)
            clauses.push(`${field} >= '${filter.fecha_desde}'`);
        if (filter.fecha_hasta)
            clauses.push(`${field} <= '${filter.fecha_hasta}'`);
        return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
    }
    pageLimit(filter) {
        var _a, _b;
        const page = (_a = filter.page) !== null && _a !== void 0 ? _a : 1;
        const limit = Math.min((_b = filter.limit) !== null && _b !== void 0 ? _b : 20, 100);
        return { page, limit, offset: (page - 1) * limit };
    }
    async paginateQuery(sql, countSql, filter) {
        var _a, _b, _c;
        const { page, limit, offset } = this.pageLimit(filter);
        const totalRow = await this.dataSource.query(countSql);
        const first = totalRow[0];
        const total = Number((_c = (_b = (_a = first === null || first === void 0 ? void 0 : first.c) !== null && _a !== void 0 ? _a : first === null || first === void 0 ? void 0 : first.count) !== null && _b !== void 0 ? _b : Object.values(first || {})[0]) !== null && _c !== void 0 ? _c : 0);
        const rows = await this.dataSource.query(`${sql} LIMIT ${limit} OFFSET ${offset}`);
        return { rows, total, page, limit };
    }
    async enrichYieldAlerts(rows) {
        const plant = await this.plantService.getOrCreate();
        const minYield = Number(plant.min_yield_percent);
        const maxMerma = Number(plant.max_merma_percent);
        return rows.map((r) => {
            var _a, _b;
            const alerts = [];
            const rend = Number(r.rendimiento_promedio);
            const pesoProc = Number((_a = r.peso_procesado_total) !== null && _a !== void 0 ? _a : 0);
            const merma = Number((_b = r.merma_total_lb) !== null && _b !== void 0 ? _b : 0);
            const mermaPct = pesoProc > 0 ? (merma / pesoProc) * 100 : 0;
            if (!Number.isNaN(rend) && rend < minYield) {
                alerts.push(`rendimiento bajo: ${rend.toFixed(2)}% < ${minYield}%`);
            }
            if (mermaPct > maxMerma) {
                alerts.push(`merma alta: ${mermaPct.toFixed(2)}% > ${maxMerma}%`);
            }
            return { ...r, alertas: alerts };
        });
    }
    async generate(filter) {
        const prod = filter.productor_id ? ` AND p.productor_id = ${Number(filter.productor_id)}` : '';
        const varf = filter.variedad_id ? ` AND p.variedad_id = ${Number(filter.variedad_id)}` : '';
        const tarja = filter.tarja_id ? ` AND t.id = ${Number(filter.tarja_id)}` : '';
        const boxesSql = `
      SELECT p.productor_id, COALESCE(SUM(dti.cajas_despachadas),0) AS total_cajas
      FROM fruit_processes p
      LEFT JOIN pt_tags t ON t.id = p.tarja_id
      LEFT JOIN dispatch_tag_items dti ON dti.tarja_id = t.id
      WHERE 1=1 ${prod} ${varf} ${tarja} ${this.withDate('p.fecha_proceso', filter)}
      GROUP BY p.productor_id
      ORDER BY p.productor_id
    `;
        const boxesCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT p.productor_id
        FROM fruit_processes p
        LEFT JOIN pt_tags t ON t.id = p.tarja_id
        LEFT JOIN dispatch_tag_items dti ON dti.tarja_id = t.id
        WHERE 1=1 ${prod} ${varf} ${tarja} ${this.withDate('p.fecha_proceso', filter)}
        GROUP BY p.productor_id
      ) sub
    `;
        const boxesByProducer = await this.paginateQuery(boxesSql, boxesCountSql, filter);
        const palletSql = `
      SELECT dti.tarja_id, AVG(dti.pallet_cost) AS costo_promedio_pallet
      FROM dispatch_tag_items dti
      WHERE 1=1 ${filter.tarja_id ? ` AND dti.tarja_id = ${Number(filter.tarja_id)}` : ''}
      GROUP BY dti.tarja_id
      ORDER BY dti.tarja_id
    `;
        const palletCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT dti.tarja_id
        FROM dispatch_tag_items dti
        WHERE 1=1 ${filter.tarja_id ? ` AND dti.tarja_id = ${Number(filter.tarja_id)}` : ''}
        GROUP BY dti.tarja_id
      ) sub
    `;
        const palletCosts = await this.paginateQuery(palletSql, palletCountSql, filter);
        const yieldSql = `
      SELECT p.productor_id, p.recepcion_id AS lote_id,
             SUM(p.merma_lb) AS merma_total_lb,
             SUM(p.peso_procesado_lb) AS peso_procesado_total,
             AVG(p.porcentaje_procesado) AS rendimiento_promedio
      FROM fruit_processes p
      WHERE 1=1 ${prod} ${varf} ${this.withDate('p.fecha_proceso', filter)}
      GROUP BY p.productor_id, p.recepcion_id
      ORDER BY p.productor_id, p.recepcion_id
    `;
        const yieldCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT p.productor_id, p.recepcion_id
        FROM fruit_processes p
        WHERE 1=1 ${prod} ${varf} ${this.withDate('p.fecha_proceso', filter)}
        GROUP BY p.productor_id, p.recepcion_id
      ) sub
    `;
        const yieldRaw = await this.paginateQuery(yieldSql, yieldCountSql, filter);
        yieldRaw.rows = await this.enrichYieldAlerts(yieldRaw.rows);
        const salesSql = `
      SELECT d.id AS dispatch_id,
             COALESCE(SUM(ii.line_subtotal),0) AS total_ventas,
             COALESCE(SUM(ii.pallet_cost_total),0) AS total_costos
      FROM dispatches d
      LEFT JOIN invoices i ON i.dispatch_id = d.id
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
      GROUP BY d.id
      ORDER BY d.id
    `;
        const salesCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT d.id
        FROM dispatches d
        LEFT JOIN invoices i ON i.dispatch_id = d.id
        LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
        GROUP BY d.id
      ) sub
    `;
        const salesAndCostsByDispatch = await this.paginateQuery(salesSql, salesCountSql, filter);
        const packSql = `
      SELECT r.format_code,
             COALESCE(SUM(c.material_cost_total),0) AS costo_total_embalaje,
             COUNT(c.id) AS consumos
      FROM packaging_pallet_consumptions c
      JOIN packaging_recipes r ON r.id = c.recipe_id
      WHERE 1=1 ${filter.tarja_id ? ` AND c.tarja_id = ${Number(filter.tarja_id)}` : ''}
      GROUP BY r.format_code
      ORDER BY r.format_code
    `;
        const packCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT r.format_code
        FROM packaging_pallet_consumptions c
        JOIN packaging_recipes r ON r.id = c.recipe_id
        WHERE 1=1 ${filter.tarja_id ? ` AND c.tarja_id = ${Number(filter.tarja_id)}` : ''}
        GROUP BY r.format_code
      ) sub
    `;
        const packagingByFormat = await this.paginateQuery(packSql, packCountSql, filter);
        const plant = await this.plantService.getOrCreate();
        return {
            filters: filter,
            plant_thresholds: {
                yield_tolerance_percent: Number(plant.yield_tolerance_percent),
                min_yield_percent: Number(plant.min_yield_percent),
                max_merma_percent: Number(plant.max_merma_percent),
            },
            boxesByProducer,
            palletCosts,
            yieldAndWaste: yieldRaw,
            salesAndCostsByDispatch,
            packagingByFormat,
        };
    }
    async generateFullExport(filter) {
        const full = { ...filter, page: 1, limit: 10000 };
        return this.generate(full);
    }
    saveReport(dto) {
        return this.reportRepo.save(this.reportRepo.create(dto));
    }
    listSavedReports() {
        return this.reportRepo.find({ order: { id: 'DESC' } });
    }
    async updateSavedReport(id, dto) {
        const report = await this.reportRepo.findOne({ where: { id } });
        if (!report)
            throw new common_1.NotFoundException('Reporte no encontrado');
        report.report_name = dto.report_name;
        report.filters = dto.filters;
        report.payload = dto.payload;
        return this.reportRepo.save(report);
    }
    async deleteSavedReport(id) {
        const report = await this.reportRepo.findOne({ where: { id } });
        if (!report)
            throw new common_1.NotFoundException('Reporte no encontrado');
        await this.reportRepo.delete(id);
    }
};
exports.ReportingService = ReportingService;
exports.ReportingService = ReportingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __param(1, (0, typeorm_1.InjectRepository)(reporting_entities_1.ReportSnapshot)),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        typeorm_2.Repository,
        plant_service_1.PlantService])
], ReportingService);
//# sourceMappingURL=reporting.service.js.map