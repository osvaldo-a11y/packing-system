import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recetas de empaque: reemplaza format_code libre por FK a presentation_formats.
 * Se descartan recetas/líneas existentes para reiniciar la base.
 */
export class PackagingRecipesPresentationFormatFk1712500031000 implements MigrationInterface {
  name = 'PackagingRecipesPresentationFormatFk1712500031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM packaging_recipe_items`);
    await queryRunner.query(`DELETE FROM packaging_recipes`);

    await queryRunner.query(`ALTER TABLE packaging_recipes DROP CONSTRAINT IF EXISTS uq_packaging_recipe_format_code`);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP CONSTRAINT IF EXISTS packaging_recipes_format_code_key`);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP COLUMN IF EXISTS format_code`);

    await queryRunner.query(`
      ALTER TABLE packaging_recipes
      ADD COLUMN IF NOT EXISTS presentation_format_id BIGINT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_recipes
      ALTER COLUMN presentation_format_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_recipes
      ADD CONSTRAINT fk_packaging_recipes_presentation_format
      FOREIGN KEY (presentation_format_id) REFERENCES presentation_formats(id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_packaging_recipe_presentation_format
      ON packaging_recipes(presentation_format_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_packaging_recipe_presentation_format`);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP CONSTRAINT IF EXISTS fk_packaging_recipes_presentation_format`);
    await queryRunner.query(`ALTER TABLE packaging_recipes DROP COLUMN IF EXISTS presentation_format_id`);
    await queryRunner.query(`ALTER TABLE packaging_recipes ADD COLUMN IF NOT EXISTS format_code VARCHAR(20)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS packaging_recipes_format_code_key ON packaging_recipes(format_code)`);
  }
}
