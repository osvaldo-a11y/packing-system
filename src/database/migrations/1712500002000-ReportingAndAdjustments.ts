import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportingAndAdjustments1712500002000 implements MigrationInterface {
  name = 'ReportingAndAdjustments1712500002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS requested_pallets INT NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS requested_boxes INT NOT NULL DEFAULT 0`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pt_tag_audits (
        id BIGSERIAL PRIMARY KEY,
        tarja_id BIGINT NOT NULL,
        action VARCHAR(50) NOT NULL,
        before_payload JSONB NOT NULL,
        after_payload JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_order_modifications (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL,
        before_payload JSONB NOT NULL,
        after_payload JSONB NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS report_snapshots (
        id BIGSERIAL PRIMARY KEY,
        report_name VARCHAR(80) NOT NULL,
        filters JSONB NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS report_snapshots`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_order_modifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_tag_audits`);
    await queryRunner.query(`ALTER TABLE sales_orders DROP COLUMN IF EXISTS requested_boxes`);
    await queryRunner.query(`ALTER TABLE sales_orders DROP COLUMN IF EXISTS requested_pallets`);
  }
}
