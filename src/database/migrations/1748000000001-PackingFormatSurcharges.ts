import { MigrationInterface, QueryRunner } from 'typeorm';

export class PackingFormatSurcharges1748000000001 implements MigrationInterface {
  name = 'PackingFormatSurcharges1748000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS packing_format_surcharges (
        id BIGSERIAL PRIMARY KEY,
        format_code VARCHAR(80) NOT NULL,
        surcharge_per_lb NUMERIC(12,6) NOT NULL DEFAULT 0,
        season VARCHAR(40) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        notes VARCHAR(200) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_format_surcharges_format_season
      ON packing_format_surcharges(LOWER(TRIM(format_code)), COALESCE(season, ''))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_packing_format_surcharges_format_season`);
    await queryRunner.query(`DROP TABLE IF EXISTS packing_format_surcharges`);
  }
}
