import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeasonsAndSnapshotFreeze1712500064000 implements MigrationInterface {
  name = 'SeasonsAndSnapshotFreeze1712500064000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id BIGSERIAL PRIMARY KEY,
        year INT NOT NULL UNIQUE,
        label VARCHAR(120) NOT NULL,
        status VARCHAR(20) NOT NULL,
        source VARCHAR(20) NOT NULL,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ NULL,
        notes TEXT NULL,
        CONSTRAINT seasons_status_check CHECK (status IN ('active', 'closing', 'closed')),
        CONSTRAINT seasons_source_check CHECK (source IN ('system', 'legacy'))
      )
    `);

    await queryRunner.query(`
      INSERT INTO seasons (year, label, status, source, opened_at, notes)
      VALUES (2026, 'Temporada 2026', 'closing', 'system', NOW(), 'Fase 0 — congelación de totales aceptados')
      ON CONFLICT (year) DO NOTHING
    `);

    // Columnas nuevas: nullable o NOT NULL con DEFAULT (filas legacy en producción).
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ADD COLUMN IF NOT EXISTS season_id BIGINT NULL REFERENCES seasons(id)
    `);
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ADD COLUMN IF NOT EXISTS snapshot_type VARCHAR(40) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ADD COLUMN IF NOT EXISTS version INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ADD COLUMN IF NOT EXISTS is_current BOOLEAN NULL
    `);
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ADD COLUMN IF NOT EXISTS generated_by VARCHAR(80) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ADD COLUMN IF NOT EXISTS source_version VARCHAR(80) NULL
    `);

    await queryRunner.query(`
      UPDATE report_snapshots
      SET version = 1
      WHERE version IS NULL
    `);
    await queryRunner.query(`
      UPDATE report_snapshots
      SET is_current = FALSE
      WHERE is_current IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE report_snapshots
        ALTER COLUMN version SET DEFAULT 1,
        ALTER COLUMN version SET NOT NULL,
        ALTER COLUMN is_current SET DEFAULT FALSE,
        ALTER COLUMN is_current SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_report_snapshots_season_current
        ON report_snapshots (season_id, snapshot_type)
        WHERE is_current IS TRUE
          AND season_id IS NOT NULL
          AND snapshot_type IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_report_snapshots_season_current`);
    await queryRunner.query(`
      ALTER TABLE report_snapshots
        DROP COLUMN IF EXISTS source_version,
        DROP COLUMN IF EXISTS generated_by,
        DROP COLUMN IF EXISTS is_current,
        DROP COLUMN IF EXISTS version,
        DROP COLUMN IF EXISTS snapshot_type,
        DROP COLUMN IF EXISTS season_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS seasons`);
  }
}
