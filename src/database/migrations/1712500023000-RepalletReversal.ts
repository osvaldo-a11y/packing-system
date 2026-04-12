import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepalletReversal1712500023000 implements MigrationInterface {
  name = 'RepalletReversal1712500023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS repallet_reversals (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        repallet_event_id BIGINT NOT NULL UNIQUE REFERENCES repallet_events(id) ON DELETE CASCADE,
        reversed_by_username VARCHAR(80) NOT NULL,
        notes TEXT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_repallet_reversals_event ON repallet_reversals (repallet_event_id)
    `);
    await queryRunner.query(`
      ALTER TABLE repallet_events ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE repallet_events DROP COLUMN IF EXISTS reversed_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS repallet_reversals`);
  }
}
