import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha operativa opcional por movimiento y fila de inventario inicial en kardex
 * (excluida del sumatorio de reconciliación en servicio; el monto base sigue en stock_inicial).
 */
export class PackagingMaterialMovementOccurredAtInventario1712500055000 implements MigrationInterface {
  name = 'PackagingMaterialMovementOccurredAtInventario1712500055000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_material_movements
      ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      INSERT INTO packaging_material_movements (material_id, quantity_delta, ref_type, ref_id, nota, created_at, occurred_at)
      SELECT
        pm.id,
        pm.stock_inicial,
        'inventario_inicial',
        pm.id,
        'Migración: inventario inicial (histórico).',
        COALESCE((SELECT MIN(mv.created_at) FROM packaging_material_movements mv WHERE mv.material_id = pm.id), NOW())
          - INTERVAL '1 millisecond',
        COALESCE((SELECT MIN(mv.created_at) FROM packaging_material_movements mv WHERE mv.material_id = pm.id), NOW())
          - INTERVAL '1 millisecond'
      FROM packaging_materials pm
      WHERE pm.stock_inicial::numeric > 0
        AND NOT EXISTS (
          SELECT 1 FROM packaging_material_movements ex
          WHERE ex.material_id = pm.id AND ex.ref_type = 'inventario_inicial'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM packaging_material_movements
      WHERE ref_type = 'inventario_inicial'
        AND nota = 'Migración: inventario inicial (histórico).'
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_material_movements DROP COLUMN IF EXISTS occurred_at
    `);
  }
}
