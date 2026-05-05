import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modelo analítico B: stock_base = stock_inicial + movimientos manuales;
 * consumo_total desde PT (breakdowns); stock_actual = stock_base - consumo_total.
 */
export class PackagingMaterialStockInicial1712500051000 implements MigrationInterface {
  name = 'PackagingMaterialStockInicial1712500051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_materials
      ADD COLUMN stock_inicial DECIMAL(14,3) NOT NULL DEFAULT 0
    `);

    /** stock_inicial ≈ saldo base antes de consumos: actual + consumido − movimientos no productivos */
    await queryRunner.query(`
      UPDATE packaging_materials pm
      SET stock_inicial = GREATEST(0,
        COALESCE(pm.cantidad_disponible::numeric, 0)
        + COALESCE((
          SELECT SUM(b.qty_used::numeric)
          FROM packaging_cost_breakdowns b
          WHERE b.material_id = pm.id
        ), 0)
        - COALESCE((
          SELECT SUM(mv.quantity_delta::numeric)
          FROM packaging_material_movements mv
          WHERE mv.material_id = pm.id
            AND (mv.ref_type IS NULL OR mv.ref_type NOT IN ('consumption', 'consumption_revert'))
        ), 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE packaging_materials DROP COLUMN IF EXISTS stock_inicial`);
  }
}
