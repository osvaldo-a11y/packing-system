import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrintJobs1748000000004 implements MigrationInterface {
  name = 'PrintJobs1748000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS print_jobs (
        id BIGSERIAL PRIMARY KEY,
        filename VARCHAR(200) NOT NULL,
        zpl TEXT NOT NULL,
        printer_name VARCHAR(200) NULL,
        copies INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error_message TEXT NULL,
        created_by_user_id BIGINT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        claimed_at TIMESTAMPTZ NULL,
        completed_at TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_print_jobs_status_created
      ON print_jobs (status, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_print_jobs_status_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS print_jobs`);
  }
}
