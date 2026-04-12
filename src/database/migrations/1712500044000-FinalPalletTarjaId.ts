import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vincula `final_pallets` ↔ `pt_tags` (1:1 en flujo normal): el pallet técnico se crea automáticamente
 * al tener stock real en la unidad PT. `tarja_id` NULL = pallets legacy / resultado de repaletizado.
 */
export class FinalPalletTarjaId1712500044000 implements MigrationInterface {
  name = 'FinalPalletTarjaId1712500044000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE final_pallets
      ADD COLUMN IF NOT EXISTS tarja_id BIGINT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets
      ADD CONSTRAINT fk_final_pallets_tarja
      FOREIGN KEY (tarja_id) REFERENCES pt_tags(id)
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_final_pallets_tarja_id
      ON final_pallets (tarja_id)
      WHERE tarja_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_final_pallets_tarja_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP CONSTRAINT IF EXISTS fk_final_pallets_tarja`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS tarja_id`);
  }
}
