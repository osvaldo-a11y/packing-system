import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materiales con existencia pero sin ninguna fila en kardex (altas viejas o datos importados).
 * Inserta un movimiento inventario_inicial para que el Kardex muestre ingreso y cuadre con `cantidad_disponible`.
 */
export class BackfillInventarioInicialKardexSinMovimientos1712500062000 implements MigrationInterface {
  name = 'BackfillInventarioInicialKardexSinMovimientos1712500062000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO packaging_material_movements (material_id, quantity_delta, ref_type, ref_id, nota, created_at, occurred_at)
      SELECT
        pm.id,
        pm.cantidad_disponible::numeric,
        'inventario_inicial',
        pm.id,
        'Backfill kardex: existencia sin movimientos previos.',
        NOW(),
        NOW()
      FROM packaging_materials pm
      WHERE pm.activo = true
        AND pm.cantidad_disponible::numeric > 0
        AND NOT EXISTS (
          SELECT 1 FROM packaging_material_movements m WHERE m.material_id = pm.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM packaging_material_movements
      WHERE ref_type = 'inventario_inicial'
        AND nota = 'Backfill kardex: existencia sin movimientos previos.'
    `);
  }
}
