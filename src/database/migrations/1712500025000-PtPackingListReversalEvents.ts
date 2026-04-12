import { MigrationInterface, QueryRunner } from 'typeorm';

/** Trazabilidad de reversa (anulación) de packing list PT confirmado. */
export class PtPackingListReversalEvents1712500025000 implements MigrationInterface {
  name = 'PtPackingListReversalEvents1712500025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pt_packing_list_reversal_events (
        id BIGSERIAL PRIMARY KEY,
        packing_list_id BIGINT NOT NULL UNIQUE REFERENCES pt_packing_lists(id) ON DELETE CASCADE,
        reversed_by_username VARCHAR(80) NOT NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pt_pl_reversal_pl ON pt_packing_list_reversal_events (packing_list_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pt_packing_list_reversal_events`);
  }
}
