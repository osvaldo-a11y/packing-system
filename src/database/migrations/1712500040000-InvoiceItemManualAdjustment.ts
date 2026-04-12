import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceItemManualAdjustment1712500040000 implements MigrationInterface {
  name = 'InvoiceItemManualAdjustment1712500040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS manual_description TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS manual_line_kind VARCHAR(16) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS manual_line_kind`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS manual_description`);
  }
}
