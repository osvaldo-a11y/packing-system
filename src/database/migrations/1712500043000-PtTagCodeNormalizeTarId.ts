import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normaliza `pt_tags.tag_code` al formato `TAR-{id}` (alineado a `PF-{id}` en existencias).
 * Fase 1: valores únicos temporales para no violar uq_pt_tags_tag_code durante el cambio.
 * Respaldo: `pt_tag_code_migration_backup` para revertir con `down`.
 */
export class PtTagCodeNormalizeTarId1712500043000 implements MigrationInterface {
  name = 'PtTagCodeNormalizeTarId1712500043000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pt_tag_code_migration_backup (
        id BIGINT PRIMARY KEY,
        old_tag_code VARCHAR(64) NOT NULL
      )
    `);
    await queryRunner.query(`TRUNCATE pt_tag_code_migration_backup`);
    await queryRunner.query(`
      INSERT INTO pt_tag_code_migration_backup (id, old_tag_code)
      SELECT id, tag_code FROM pt_tags
    `);
    await queryRunner.query(`
      UPDATE pt_tags SET tag_code = 'TMP-' || id::text
    `);
    await queryRunner.query(`
      UPDATE pt_tags SET tag_code = 'TAR-' || id::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'pt_tag_code_migration_backup'
      LIMIT 1
    `);
    if (!Array.isArray(exists) || exists.length === 0) {
      return;
    }
    await queryRunner.query(`
      UPDATE pt_tags t
      SET tag_code = b.old_tag_code
      FROM pt_tag_code_migration_backup b
      WHERE t.id = b.id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_tag_code_migration_backup`);
  }
}
