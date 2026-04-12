import { MigrationInterface, QueryRunner } from 'typeorm';

/** Vínculo explícito del pallet final al despacho y/o a la tarja PT (trazabilidad hacia salida). */
export class FinalPalletDispatchTarjaLink1712500007000 implements MigrationInterface {
  name = 'FinalPalletDispatchTarjaLink1712500007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE final_pallets
        ADD COLUMN dispatch_id BIGINT NULL REFERENCES dispatches(id)
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets
        ADD COLUMN tarja_id BIGINT NULL REFERENCES pt_tags(id)
    `);
    await queryRunner.query(`CREATE INDEX idx_final_pallets_dispatch_id ON final_pallets(dispatch_id)`);
    await queryRunner.query(`CREATE INDEX idx_final_pallets_tarja_id ON final_pallets(tarja_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_tarja_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_dispatch_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS tarja_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS dispatch_id`);
  }
}
