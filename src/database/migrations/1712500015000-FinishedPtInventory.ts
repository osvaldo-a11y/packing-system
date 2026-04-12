import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinishedPtInventory1712500015000 implements MigrationInterface {
  name = 'FinishedPtInventory1712500015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finished_pt_inventory (
        id BIGSERIAL PRIMARY KEY,
        final_pallet_id BIGINT NOT NULL UNIQUE REFERENCES final_pallets(id) ON DELETE CASCADE,
        corner_board_code VARCHAR(80) NOT NULL,
        species_id BIGINT NULL,
        presentation_format_id BIGINT NULL,
        format_code VARCHAR(40) NOT NULL DEFAULT '',
        client_id BIGINT NULL,
        brand_id BIGINT NULL,
        boxes INT NOT NULL DEFAULT 0,
        net_lb NUMERIC(14,3) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL,
        aggregate_boxes_recorded INT NOT NULL DEFAULT 0,
        trace_lines JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_finished_pt_inventory_format_client_brand
      ON finished_pt_inventory (format_code, COALESCE(client_id, -1), COALESCE(brand_id, -1))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finished_pt_inventory`);
  }
}
