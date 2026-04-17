import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recetas de empaque por formato + marca (opcional).
 * Permite receta específica por marca y fallback genérico por formato.
 */
export class PackagingRecipesByBrand1712500046000 implements MigrationInterface {
  name = 'PackagingRecipesByBrand1712500046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_recipes
      ADD COLUMN IF NOT EXISTS brand_id BIGINT NULL
    `);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP CONSTRAINT IF EXISTS uq_packaging_recipe_presentation_format`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_packaging_recipe_presentation_format`);
    await queryRunner.query(`
      ALTER TABLE packaging_recipes
      ADD CONSTRAINT fk_packaging_recipes_brand
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_packaging_recipe_format_generic
      ON packaging_recipes(presentation_format_id)
      WHERE brand_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_packaging_recipe_format_brand
      ON packaging_recipes(presentation_format_id, brand_id)
      WHERE brand_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_packaging_recipe_format_brand`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_packaging_recipe_format_generic`);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP CONSTRAINT IF EXISTS fk_packaging_recipes_brand`);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP COLUMN IF EXISTS brand_id`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_packaging_recipe_presentation_format
      ON packaging_recipes(presentation_format_id)
    `);
  }
}

