import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type TraceabilityDashboardDto = {
  counts: {
    receptions: number;
    reception_lines: number;
    fruit_processes: number;
    pt_tags: number;
    dispatches: number;
    packaging_materials: number;
    final_pallets: number;
    packaging_material_movements: number;
  };
  materials_low_stock: Array<{
    id: number;
    nombre_material: string;
    cantidad_disponible: string;
    unidad_medida: string;
    categoria: string;
  }>;
  chain_hint: string;
};

@Injectable()
export class TraceabilityDashboardService {
  private readonly logger = new Logger(TraceabilityDashboardService.name);

  constructor(private readonly ds: DataSource) {}

  /** TypeORM `query()` devuelve un array de filas, no un array de arrays. */
  private async countRows(sql: string): Promise<number> {
    const rows = (await this.ds.query(sql)) as Array<{ c: number | string }>;
    const v = rows[0]?.c;
    return v == null ? 0 : Number(v);
  }

  /**
   * Esquema nuevo: `material_categories` + `material_category_id`.
   * Esquema antiguo (pre-migración catalog): columna enum `categoria` en `packaging_materials`.
   */
  private async fetchMaterialsLowStock(): Promise<TraceabilityDashboardDto['materials_low_stock']> {
    const modern = `SELECT m.id, m.nombre_material, m.cantidad_disponible::text AS cantidad_disponible, m.unidad_medida, c.codigo AS categoria
       FROM packaging_materials m
       JOIN material_categories c ON c.id = m.material_category_id
       WHERE m.activo = true AND m.cantidad_disponible < 500
       ORDER BY m.cantidad_disponible ASC
       LIMIT 10`;
    try {
      return (await this.ds.query(modern)) as TraceabilityDashboardDto['materials_low_stock'];
    } catch (err) {
      this.logger.warn(
        `materials_low_stock (JOIN material_categories) falló; probando esquema legacy con categoria enum: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const legacy = `SELECT m.id, m.nombre_material, m.cantidad_disponible::text AS cantidad_disponible, m.unidad_medida, m.categoria::text AS categoria
       FROM packaging_materials m
       WHERE m.activo = true AND m.cantidad_disponible < 500
       ORDER BY m.cantidad_disponible ASC
       LIMIT 10`;
    try {
      return (await this.ds.query(legacy)) as TraceabilityDashboardDto['materials_low_stock'];
    } catch (err2) {
      this.logger.warn(
        `materials_low_stock legacy también falló; se omite la tabla en el dashboard: ${err2 instanceof Error ? err2.message : String(err2)}`,
      );
      return [];
    }
  }

  async getSummary(): Promise<TraceabilityDashboardDto> {
    const receptions = await this.countRows('SELECT COUNT(*)::int AS c FROM receptions');
    const reception_lines = await this.countRows('SELECT COUNT(*)::int AS c FROM reception_lines');
    const fruit_processes = await this.countRows(
      `SELECT COUNT(*)::int AS c FROM fruit_processes WHERE deleted_at IS NULL`,
    );
    const pt_tags = await this.countRows('SELECT COUNT(*)::int AS c FROM pt_tags');
    const dispatches = await this.countRows('SELECT COUNT(*)::int AS c FROM dispatches');
    const packaging_materials = await this.countRows(
      `SELECT COUNT(*)::int AS c FROM packaging_materials WHERE activo = true`,
    );
    const final_pallets = await this.countRows(`SELECT COUNT(*)::int AS c FROM final_pallets`);
    const packaging_material_movements = await this.countRows(
      `SELECT COUNT(*)::int AS c FROM packaging_material_movements`,
    );

    const materials_low_stock = await this.fetchMaterialsLowStock();

    return {
      counts: {
        receptions: Number(receptions),
        reception_lines: Number(reception_lines),
        fruit_processes: Number(fruit_processes),
        pt_tags: Number(pt_tags),
        dispatches: Number(dispatches),
        packaging_materials: Number(packaging_materials),
        final_pallets: Number(final_pallets),
        packaging_material_movements: Number(packaging_material_movements),
      },
      materials_low_stock,
      chain_hint:
        'Cadena: Recepción → Proceso → Unidad PT → Pallet final (opcional) → Despacho → Factura (líneas desde unidades PT o manuales con especie/variedad/empaque). Materiales: existencias, consumos y movimientos (kardex).',
    };
  }
}
