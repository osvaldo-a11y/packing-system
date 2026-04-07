import { DataSource, Repository } from 'typeorm';
import { PlantService } from '../plant/plant.service';
import { ReportFilterDto, SaveReportDto } from './reporting.dto';
import { ReportSnapshot } from './reporting.entities';
type Paginated<T> = {
    rows: T[];
    total: number;
    page: number;
    limit: number;
};
export declare class ReportingService {
    private readonly dataSource;
    private readonly reportRepo;
    private readonly plantService;
    constructor(dataSource: DataSource, reportRepo: Repository<ReportSnapshot>, plantService: PlantService);
    private withDate;
    private pageLimit;
    private paginateQuery;
    private enrichYieldAlerts;
    generate(filter: ReportFilterDto): Promise<{
        filters: ReportFilterDto;
        plant_thresholds: {
            yield_tolerance_percent: number;
            min_yield_percent: number;
            max_merma_percent: number;
        };
        boxesByProducer: Paginated<Record<string, unknown>>;
        palletCosts: Paginated<Record<string, unknown>>;
        yieldAndWaste: Paginated<Record<string, unknown>>;
        salesAndCostsByDispatch: Paginated<Record<string, unknown>>;
        packagingByFormat: Paginated<Record<string, unknown>>;
    }>;
    generateFullExport(filter: ReportFilterDto): Promise<{
        filters: ReportFilterDto;
        plant_thresholds: {
            yield_tolerance_percent: number;
            min_yield_percent: number;
            max_merma_percent: number;
        };
        boxesByProducer: Paginated<Record<string, unknown>>;
        palletCosts: Paginated<Record<string, unknown>>;
        yieldAndWaste: Paginated<Record<string, unknown>>;
        salesAndCostsByDispatch: Paginated<Record<string, unknown>>;
        packagingByFormat: Paginated<Record<string, unknown>>;
    }>;
    saveReport(dto: SaveReportDto): Promise<ReportSnapshot>;
    listSavedReports(): Promise<ReportSnapshot[]>;
    updateSavedReport(id: number, dto: SaveReportDto): Promise<ReportSnapshot>;
    deleteSavedReport(id: number): Promise<void>;
}
export {};
