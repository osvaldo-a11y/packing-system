import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Base B/C — líneas físicas históricas (recepción + procesos) con fecha.
 * Aditiva: no modifica season_mass_balance ni datos 2026.
 */
export class SeasonPhysicalLines1712500071000 implements MigrationInterface {
  name = 'SeasonPhysicalLines1712500071000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS season_reception_lines (
        id BIGSERIAL PRIMARY KEY,
        season_year INT NOT NULL,
        producer_id BIGINT NOT NULL REFERENCES producers(id),
        producer_raw VARCHAR(200) NOT NULL,
        reception_date DATE NOT NULL,
        quality VARCHAR(20) NOT NULL,
        specie VARCHAR(120) NULL,
        variety VARCHAR(120) NULL,
        incoming_no VARCHAR(120) NULL,
        line_no VARCHAR(40) NULL,
        reference VARCHAR(200) NULL,
        trays INT NULL,
        quantity NUMERIC(14,4) NULL,
        net_lb NUMERIC(14,4) NOT NULL,
        gross_lb NUMERIC(14,4) NULL,
        fruit_type VARCHAR(10) NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'legacy_assembled',
        row_hash VARCHAR(64) NOT NULL,
        source_row_no INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT season_reception_lines_quality_check
          CHECK (quality IN ('FRESH', 'WASTE', 'FOR_FROZEN')),
        CONSTRAINT season_reception_lines_fruit_type_check
          CHECK (fruit_type IS NULL OR fruit_type IN ('hand', 'machine'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_season_reception_line_hash
        ON season_reception_lines (season_year, row_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_srl_season_year
        ON season_reception_lines (season_year)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_srl_season_producer
        ON season_reception_lines (season_year, producer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_srl_season_reception_date
        ON season_reception_lines (season_year, reception_date)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS season_process_lines (
        id BIGSERIAL PRIMARY KEY,
        season_year INT NOT NULL,
        producer_id BIGINT NOT NULL REFERENCES producers(id),
        producer_raw VARCHAR(200) NOT NULL,
        process_date DATE NOT NULL,
        op VARCHAR(80) NULL,
        specie VARCHAR(120) NULL,
        variety VARCHAR(120) NULL,
        format_code VARCHAR(80) NULL,
        format_raw VARCHAR(80) NULL,
        lb_domp NUMERIC(14,4) NULL,
        lb_fresh NUMERIC(14,4) NOT NULL DEFAULT 0,
        lb_waste NUMERIC(14,4) NOT NULL DEFAULT 0,
        lb_total NUMERIC(14,4) NOT NULL,
        boxes INT NULL,
        fruit_type VARCHAR(10) NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'legacy_assembled',
        row_hash VARCHAR(64) NOT NULL,
        source_row_no INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT season_process_lines_fruit_type_check
          CHECK (fruit_type IS NULL OR fruit_type IN ('hand', 'machine'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_season_process_line_hash
        ON season_process_lines (season_year, row_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spl_season_year
        ON season_process_lines (season_year)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spl_season_producer
        ON season_process_lines (season_year, producer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spl_season_process_date
        ON season_process_lines (season_year, process_date)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS season_process_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS season_reception_lines`);
  }
}
