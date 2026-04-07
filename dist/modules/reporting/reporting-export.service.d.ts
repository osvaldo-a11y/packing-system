import { ReportFilterDto } from './reporting.dto';
import { ReportingService } from './reporting.service';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export declare class ReportingExportService {
    private readonly reporting;
    constructor(reporting: ReportingService);
    build(format: ExportFormat, filter: ReportFilterDto): Promise<{
        buffer: Buffer<ArrayBuffer>;
        mime: string;
        filename: string;
    }>;
    private buildCsv;
    private buildXlsx;
    private buildPdf;
}
