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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportingExportService = void 0;
const common_1 = require("@nestjs/common");
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const reporting_service_1 = require("./reporting.service");
let ReportingExportService = class ReportingExportService {
    constructor(reporting) {
        this.reporting = reporting;
    }
    async build(format, filter) {
        const data = await this.reporting.generateFullExport(filter);
        const flat = {
            boxesByProducer: data.boxesByProducer.rows,
            palletCosts: data.palletCosts.rows,
            yieldAndWaste: data.yieldAndWaste.rows,
            salesAndCostsByDispatch: data.salesAndCostsByDispatch.rows,
            packagingByFormat: data.packagingByFormat.rows,
            plant_thresholds: data.plant_thresholds,
            filters: data.filters,
        };
        if (format === 'csv') {
            return this.buildCsv(flat);
        }
        if (format === 'xlsx') {
            return this.buildXlsx(flat);
        }
        if (format === 'pdf') {
            return this.buildPdf(flat);
        }
        throw new common_1.BadRequestException('formato no soportado');
    }
    buildCsv(payload) {
        const lines = [];
        lines.push('seccion,json');
        for (const [section, rows] of Object.entries(payload)) {
            if (section === 'plant_thresholds') {
                lines.push(`${section},${JSON.stringify(rows)}`);
                continue;
            }
            if (section === 'filters') {
                lines.push(`${section},${JSON.stringify(rows)}`);
                continue;
            }
            if (!Array.isArray(rows))
                continue;
            for (const row of rows) {
                lines.push(`${section},${JSON.stringify(row)}`);
            }
        }
        const body = lines.join('\n');
        return {
            buffer: Buffer.from(body, 'utf8'),
            mime: 'text/csv; charset=utf-8',
            filename: 'reporte-packing.csv',
        };
    }
    async buildXlsx(payload) {
        var _a, _b;
        const wb = new exceljs_1.default.Workbook();
        const meta = wb.addWorksheet('meta');
        meta.addRow(['plant_thresholds', JSON.stringify((_a = payload.plant_thresholds) !== null && _a !== void 0 ? _a : {})]);
        meta.addRow(['filters', JSON.stringify((_b = payload.filters) !== null && _b !== void 0 ? _b : {})]);
        const addSheet = (name, rows) => {
            const ws = wb.addWorksheet(name.slice(0, 31));
            if (!Array.isArray(rows) || !rows.length) {
                ws.addRow(['sin datos']);
                return;
            }
            const first = rows[0];
            const cols = Object.keys(first);
            ws.addRow(cols);
            for (const row of rows) {
                ws.addRow(cols.map((c) => row[c]));
            }
        };
        addSheet('cajas_productor', payload.boxesByProducer);
        addSheet('costo_pallet', payload.palletCosts);
        addSheet('merma_rendimiento', payload.yieldAndWaste);
        addSheet('ventas_despacho', payload.salesAndCostsByDispatch);
        addSheet('embalaje_formato', payload.packagingByFormat);
        const buffer = Buffer.from(await wb.xlsx.writeBuffer());
        return {
            buffer,
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: 'reporte-packing.xlsx',
        };
    }
    async buildPdf(payload) {
        var _a, _b;
        const doc = new pdfkit_1.default({ margin: 40, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.fontSize(14).text('Reporte operativo packing', { underline: true });
        doc.moveDown();
        doc.fontSize(9).text(`Umbrales planta: ${JSON.stringify((_a = payload.plant_thresholds) !== null && _a !== void 0 ? _a : {})}`);
        doc.text(`Filtros: ${JSON.stringify((_b = payload.filters) !== null && _b !== void 0 ? _b : {})}`);
        doc.moveDown();
        const writeSection = (title, rows) => {
            doc.fontSize(11).text(title, { underline: true });
            doc.fontSize(8);
            if (!Array.isArray(rows) || !rows.length) {
                doc.text('sin datos');
                doc.moveDown();
                return;
            }
            for (const row of rows) {
                doc.text(JSON.stringify(row));
            }
            doc.moveDown();
        };
        writeSection('Cajas por productor', payload.boxesByProducer);
        writeSection('Costo pallet', payload.palletCosts);
        writeSection('Merma y rendimiento', payload.yieldAndWaste);
        writeSection('Ventas por despacho', payload.salesAndCostsByDispatch);
        writeSection('Embalaje por formato', payload.packagingByFormat);
        doc.end();
        await new Promise((resolve) => doc.on('end', () => resolve()));
        return {
            buffer: Buffer.concat(chunks),
            mime: 'application/pdf',
            filename: 'reporte-packing.pdf',
        };
    }
};
exports.ReportingExportService = ReportingExportService;
exports.ReportingExportService = ReportingExportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reporting_service_1.ReportingService])
], ReportingExportService);
//# sourceMappingURL=reporting-export.service.js.map