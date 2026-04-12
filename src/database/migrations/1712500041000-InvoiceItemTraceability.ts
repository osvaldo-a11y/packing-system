import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceItemTraceability1712500041000 implements MigrationInterface {
  name = 'InvoiceItemTraceability1712500041000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS fruit_process_id BIGINT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS traceability_note VARCHAR(512) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS traceability_note;`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS fruit_process_id;`);
  }
}
