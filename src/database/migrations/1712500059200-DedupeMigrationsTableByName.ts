import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conserva una sola fila por `name` en `migrations` (id mínimo). Corrige duplicados por
 * ejecuciones concurrentes o reintentos; idempotente y seguro en Railway (una fila → no-op).
 */
export class DedupeMigrationsTableByName1712500059200 implements MigrationInterface {
  name = 'DedupeMigrationsTableByName1712500059200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM migrations a
      WHERE EXISTS (
        SELECT 1 FROM migrations b
        WHERE b.name = a.name AND b.id < a.id
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
