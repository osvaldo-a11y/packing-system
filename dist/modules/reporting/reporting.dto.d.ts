export declare class ReportFilterDto {
    productor_id?: number;
    variedad_id?: number;
    fecha_desde?: string;
    fecha_hasta?: string;
    calidad?: string;
    tarja_id?: number;
    page?: number;
    limit?: number;
}
export declare class ReportExportQueryDto extends ReportFilterDto {
    format: 'csv' | 'xlsx' | 'pdf';
}
export declare class SaveReportDto {
    report_name: string;
    filters: Record<string, unknown>;
    payload: Record<string, unknown>;
}
