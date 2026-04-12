import { MigrationInterface, QueryRunner } from 'typeorm';

export class PtPackingListAndDispatchBol1712500027000 implements MigrationInterface {
  name = 'PtPackingListAndDispatchBol1712500027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pt_packing_lists ADD COLUMN IF NOT EXISTS numero_bol VARCHAR(50) NULL`);
    await queryRunner.query(
      `ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS bol_origin VARCHAR(32) NOT NULL DEFAULT 'manual_entry'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS bol_origin`);
    await queryRunner.query(`ALTER TABLE pt_packing_lists DROP COLUMN IF EXISTS numero_bol`);
  }
}
