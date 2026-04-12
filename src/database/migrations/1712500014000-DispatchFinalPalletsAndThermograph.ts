import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchFinalPalletsAndThermograph1712500014000 implements MigrationInterface {
  name = 'DispatchFinalPalletsAndThermograph1712500014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS thermograph_serial VARCHAR(80) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS thermograph_notes TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS final_pallet_unit_prices JSONB NULL
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS dispatch_id BIGINT NULL REFERENCES dispatches(id)
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_final_pallets_dispatch_id ON final_pallets(dispatch_id)`);
    await queryRunner.query(`
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS final_pallet_id BIGINT NULL REFERENCES final_pallets(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS final_pallet_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_dispatch_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS dispatch_id`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS final_pallet_unit_prices`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS thermograph_notes`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS thermograph_serial`);
  }
}
