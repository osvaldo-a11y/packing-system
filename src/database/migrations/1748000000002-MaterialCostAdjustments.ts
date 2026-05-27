import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaterialCostAdjustments1748000000002 implements MigrationInterface {
  name = 'MaterialCostAdjustments1748000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS material_cost_adjustments (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('per_box', 'per_lb', 'percent')),
        value NUMERIC(12,6) NOT NULL,
        format_code VARCHAR(80) NULL,
        producer_id BIGINT NULL,
        season VARCHAR(40) NULL,
        notes VARCHAR(200) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS material_cost_adjustments`);
  }
}
