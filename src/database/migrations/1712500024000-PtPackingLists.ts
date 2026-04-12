import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Packing list logístico (PT), independiente del despacho/factura.
 */
export class PtPackingLists1712500024000 implements MigrationInterface {
  name = 'PtPackingLists1712500024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pt_packing_lists (
        id BIGSERIAL PRIMARY KEY,
        list_code VARCHAR(40) NOT NULL UNIQUE,
        client_id BIGINT NULL REFERENCES clients(id) ON DELETE SET NULL,
        list_date DATE NOT NULL DEFAULT (CURRENT_DATE),
        status VARCHAR(20) NOT NULL DEFAULT 'borrador',
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        confirmed_at TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pt_packing_lists_status ON pt_packing_lists (status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pt_packing_lists_client ON pt_packing_lists (client_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pt_packing_list_items (
        id BIGSERIAL PRIMARY KEY,
        packing_list_id BIGINT NOT NULL REFERENCES pt_packing_lists(id) ON DELETE CASCADE,
        final_pallet_id BIGINT NOT NULL REFERENCES final_pallets(id) ON DELETE CASCADE,
        UNIQUE (packing_list_id, final_pallet_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pt_pl_items_pallet ON pt_packing_list_items (final_pallet_id)
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS pt_packing_list_id BIGINT NULL
        REFERENCES pt_packing_lists(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_final_pallets_pt_pl ON final_pallets (pt_packing_list_id)
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ALTER COLUMN status TYPE VARCHAR(28)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS pt_packing_list_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_packing_list_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_packing_lists`);
    await queryRunner.query(`ALTER TABLE final_pallets ALTER COLUMN status TYPE VARCHAR(20)`);
  }
}
