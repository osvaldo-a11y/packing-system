import type { Response } from 'express';
import { ReportExportQueryDto, ReportFilterDto, SaveReportDto } from './reporting.dto';
import { ReportingExportService } from './reporting-export.service';
import { ReportingService } from './reporting.service';
export declare class ReportingController {
    private readonly service;
    private readonly exportService;
    constructor(service: ReportingService, exportService: ReportingExportService);
    generate(query: ReportFilterDto): Promise<{
        filters: ReportFilterDto;
        plant_thresholds: {
            yield_tolerance_percent: number;
            min_yield_percent: number;
            max_merma_percent: number;
        };
        boxesByProducer: {
            rows: Record<string, unknown>[];
            total: number;
            page: number;
            limit: number;
        };
        palletCosts: {
            rows: Record<string, unknown>[];
            total: number;
            page: number;
            limit: number;
        };
        yieldAndWaste: {
            rows: Record<string, unknown>[];
            total: number;
            page: number;
            limit: number;
        };
        salesAndCostsByDispatch: {
            rows: Record<string, unknown>[];
            total: number;
            page: number;
            limit: number;
        };
        packagingByFormat: {
            rows: Record<string, unknown>[];
            total: number;
            page: number;
            limit: number;
        };
    }>;
    export(query: ReportExportQueryDto, res: Response): Promise<void>;
    save(dto: SaveReportDto): Promise<import("./reporting.entities").ReportSnapshot>;
    list(): Promise<import("./reporting.entities").ReportSnapshot[]>;
    update(id: number, dto: SaveReportDto): Promise<import("./reporting.entities").ReportSnapshot>;
    remove(id: number): Promise<void>;
}
