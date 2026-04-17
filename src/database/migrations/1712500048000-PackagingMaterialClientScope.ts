import { MigrationInterface, QueryRunner } from 'typeorm';

/** Alcance por cliente comercial (etiquetas / clamshell dedicados); null = todos. */
export class PackagingMaterialClientScope1712500048000 implements MigrationInterface {
  name = 'PackagingMaterialClientScope1712500048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_materials
        ADD COLUMN IF NOT EXISTS client_id BIGINT NULL REFERENCES clients(id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_packaging_materials_client_id ON packaging_materials(client_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_packaging_materials_client_id`);
    await queryRunner.query(`ALTER TABLE packaging_materials DROP COLUMN IF EXISTS client_id`);
  }
}
