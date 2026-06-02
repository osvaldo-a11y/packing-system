import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaterialPriceTargets1748000000004 implements MigrationInterface {
  name = 'MaterialPriceTargets1748000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS material_price_targets (
        id BIGSERIAL PRIMARY KEY,
        format_code VARCHAR(80) NULL,
        producer_id BIGINT NULL,
        target_price_lb NUMERIC(12,6) NOT NULL,
        season VARCHAR(40) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        notes VARCHAR(200) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS material_price_targets`);
  }
}
