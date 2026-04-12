import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepalletTraceability1712500019000 implements MigrationInterface {
  name = 'RepalletTraceability1712500019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS repallet_events (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        notes TEXT NULL,
        result_final_pallet_id BIGINT NOT NULL REFERENCES final_pallets(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_repallet_events_result
      ON repallet_events (result_final_pallet_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS repallet_sources (
        id BIGSERIAL PRIMARY KEY,
        event_id BIGINT NOT NULL REFERENCES repallet_events(id) ON DELETE CASCADE,
        source_final_pallet_id BIGINT NOT NULL REFERENCES final_pallets(id),
        boxes_removed INT NOT NULL,
        pounds_removed NUMERIC(14,3) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_repallet_sources_event ON repallet_sources (event_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_repallet_sources_source ON repallet_sources (source_final_pallet_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS repallet_line_provenance (
        id BIGSERIAL PRIMARY KEY,
        event_id BIGINT NOT NULL REFERENCES repallet_events(id) ON DELETE CASCADE,
        source_final_pallet_id BIGINT NOT NULL REFERENCES final_pallets(id),
        source_line_id BIGINT NULL,
        dest_final_pallet_line_id BIGINT NOT NULL REFERENCES final_pallet_lines(id) ON DELETE CASCADE,
        boxes INT NOT NULL,
        pounds NUMERIC(14,3) NOT NULL,
        variety_id BIGINT NOT NULL,
        fruit_process_id BIGINT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_repallet_line_provenance_event ON repallet_line_provenance (event_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_repallet_line_provenance_dest_line ON repallet_line_provenance (dest_final_pallet_line_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS repallet_line_provenance`);
    await queryRunner.query(`DROP TABLE IF EXISTS repallet_sources`);
    await queryRunner.query(`DROP TABLE IF EXISTS repallet_events`);
  }
}
