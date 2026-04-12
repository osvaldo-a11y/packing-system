import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recetas de empaque: agrega tipo de costo por línea (directo/tripaje)
 * y asegura base de cálculo con default caja para compatibilidad.
 */
export class PackagingRecipeItemCostTypeBase1712500030000 implements MigrationInterface {
  name = 'PackagingRecipeItemCostTypeBase1712500030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_recipe_items
      ADD COLUMN IF NOT EXISTS cost_type VARCHAR(20) NULL
    `);
    await queryRunner.query(`
      UPDATE packaging_recipe_items
      SET cost_type = 'directo'
      WHERE cost_type IS NULL OR BTRIM(cost_type) = ''
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_recipe_items
      ALTER COLUMN cost_type SET DEFAULT 'directo'
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_recipe_items
      ALTER COLUMN cost_type SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_recipe_items
      ALTER COLUMN base_unidad SET DEFAULT 'box'
    `);
    await queryRunner.query(`
      UPDATE packaging_recipe_items
      SET base_unidad = 'box'
      WHERE base_unidad IS NULL OR BTRIM(base_unidad) = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_recipe_items
      ALTER COLUMN base_unidad DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_recipe_items
      DROP COLUMN IF EXISTS cost_type
    `);
  }
}
