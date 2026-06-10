import { MigrationInterface, QueryRunner } from 'typeorm';

/** ship_date opcional + source_row_no para hash/idempotencia por fila Excel. */
export class SettlementLineSourceRowAndNullableShipDate1712500066000 implements MigrationInterface {
  name = 'SettlementLineSourceRowAndNullableShipDate1712500066000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE season_settlement_lines
        ALTER COLUMN ship_date DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE season_settlement_lines
        ADD COLUMN IF NOT EXISTS source_row_no INT NULL
    `);

    await queryRunner.query(`
      UPDATE season_settlement_lines
      SET source_row_no = excel_row_number
      WHERE source_row_no IS NULL AND excel_row_number IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ssl_season_source_row
        ON season_settlement_lines (season_year, source_row_no)
        WHERE source_row_no IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_ssl_season_source_row`);
    await queryRunner.query(`
      ALTER TABLE season_settlement_lines DROP COLUMN IF EXISTS source_row_no
    `);
    await queryRunner.query(`
      UPDATE season_settlement_lines SET ship_date = created_at::date WHERE ship_date IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE season_settlement_lines ALTER COLUMN ship_date SET NOT NULL
    `);
  }
}
