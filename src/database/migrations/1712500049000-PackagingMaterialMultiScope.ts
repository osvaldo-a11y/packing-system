import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite alcance múltiple por formato y cliente para materiales de empaque.
 * Se mantienen campos legacy (`presentation_format_id`, `client_id`) por compatibilidad.
 */
export class PackagingMaterialMultiScope1712500049000 implements MigrationInterface {
  name = 'PackagingMaterialMultiScope1712500049000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_materials
        ADD COLUMN IF NOT EXISTS presentation_format_scope_ids BIGINT[] NULL,
        ADD COLUMN IF NOT EXISTS client_scope_ids BIGINT[] NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packaging_materials
        DROP COLUMN IF EXISTS client_scope_ids,
        DROP COLUMN IF EXISTS presentation_format_scope_ids
    `);
  }
}
