import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ImportLogs1712500056000 implements MigrationInterface {
  name = 'ImportLogs1712500056000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE import_logs (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        username VARCHAR(120) NOT NULL,
        entity_key VARCHAR(64) NOT NULL,
        total_rows INT NOT NULL,
        inserted INT NOT NULL,
        skipped INT NOT NULL DEFAULT 0,
        errors_count INT NOT NULL,
        errors_sample JSONB NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_import_logs_created ON import_logs (created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_import_logs_entity ON import_logs (entity_key)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE import_logs`);
  }
}
