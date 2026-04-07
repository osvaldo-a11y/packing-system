import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PlantService } from '../plant/plant.service';
import { ReportFilterDto, SaveReportDto } from './reporting.dto';
import { ReportSnapshot } from './reporting.entities';

type Paginated<T> = { rows: T[]; total: number; page: number; limit: number };

@Injectable()
export class ReportingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ReportSnapshot) private readonly reportRepo: Repository<ReportSnapshot>,
    private readonly plantService: PlantService,
  ) {}

  private withDate(field: string, filter: ReportFilterDto) {
    const clauses: string[] = [];
    if (filter.fecha_desde) clauses.push(`${field} >= '${filter.fecha_desde}'`);
    if (filter.fecha_hasta) clauses.push(`${field} <= '${filter.fecha_hasta}'`);
    return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  }

  private pageLimit(filter: ReportFilterDto) {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 20, 100);
    return { page, limit, offset: (page - 1) * limit };
  }

  private async paginateQuery<T extends Record<string, unknown>>(
    sql: string,
    countSql: string,
    filter: ReportFilterDto,
  ): Promise<Paginated<T>> {
    const { page, limit, offset } = this.pageLimit(filter);
    const totalRow = await this.dataSource.query(countSql);
    const first = totalRow[0] as Record<string, unknown> | undefined;
    const total = Number(first?.c ?? first?.count ?? Object.values(first || {})[0] ?? 0);
    const rows = await this.dataSource.query(`${sql} LIMIT ${limit} OFFSET ${offset}`);
    return { rows, total, page, limit };
  }

  private async enrichYieldAlerts(rows: Record<string, unknown>[]) {
    const plant = await this.plantService.getOrCreate();
    const minYield = Number(plant.min_yield_percent);
    const maxMerma = Number(plant.max_merma_percent);
    return rows.map((r) => {
      const alerts: string[] = [];
      const rend = Number(r.rendimiento_promedio);
      const pesoProc = Number(r.peso_procesado_total ?? 0);
      const merma = Number(r.merma_total_lb ?? 0);
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

  async generate(filter: ReportFilterDto) {
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
    const yieldRaw = await this.paginateQuery<Record<string, unknown>>(yieldSql, yieldCountSql, filter);
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

  /** Dataset plano para exportación (sin paginar por sección). */
  async generateFullExport(filter: ReportFilterDto) {
    const full = { ...filter, page: 1, limit: 10000 };
    return this.generate(full);
  }

  saveReport(dto: SaveReportDto) {
    return this.reportRepo.save(this.reportRepo.create(dto));
  }

  listSavedReports() {
    return this.reportRepo.find({ order: { id: 'DESC' } });
  }

  async updateSavedReport(id: number, dto: SaveReportDto) {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    report.report_name = dto.report_name;
    report.filters = dto.filters;
    report.payload = dto.payload;
    return this.reportRepo.save(report);
  }

  async deleteSavedReport(id: number) {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    await this.reportRepo.delete(id);
  }
}
