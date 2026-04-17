import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Concilia cost_type con base_unidad: caja → directo, pallet → tripaje.
 * Evita líneas históricas con p. ej. tripaje+caja (solo afectaba reportes/capacidad).
 */
export class NormalizeRecipeCostTypeByBase1712500050000 implements MigrationInterface {
  name = 'NormalizeRecipeCostTypeByBase1712500050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE packaging_recipe_items
      SET cost_type = 'directo'
      WHERE base_unidad = 'box'
    `);
    await queryRunner.query(`
      UPDATE packaging_recipe_items
      SET cost_type = 'tripaje'
      WHERE base_unidad = 'pallet'
    `);
  }

  public async down(): Promise<void> {
    // No reversible sin backup del valor previo por fila.
  }
}
