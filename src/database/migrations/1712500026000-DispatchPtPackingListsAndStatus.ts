import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Despacho logístico agrupa packing lists PT (sin movimiento de stock aquí).
 * Estados: borrador | confirmado | despachado
 */
export class DispatchPtPackingListsAndStatus1712500026000 implements MigrationInterface {
  name = 'DispatchPtPackingListsAndStatus1712500026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatches
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'borrador'
    `);
    await queryRunner.query(`
      UPDATE dispatches SET status = 'despachado' WHERE status = 'borrador'
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatch_pt_packing_lists (
        dispatch_id BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
        pt_packing_list_id BIGINT NOT NULL UNIQUE REFERENCES pt_packing_lists(id) ON DELETE RESTRICT,
        PRIMARY KEY (dispatch_id, pt_packing_list_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dispatch_pt_pl_dispatch ON dispatch_pt_packing_lists (dispatch_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dispatch_pt_packing_lists`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS status`);
  }
}
