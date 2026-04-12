import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pallet final alineado a proceso (sin despacho/tarja PT en cabecera).
 * Código corner board, cliente, modo calidad, formato presentación y etiqueta clamshell.
 */
export class FinalPalletReshapeCornerClient1712500011000 implements MigrationInterface {
  name = 'FinalPalletReshapeCornerClient1712500011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE final_pallets DROP CONSTRAINT IF EXISTS final_pallets_dispatch_id_fkey`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP CONSTRAINT IF EXISTS final_pallets_tarja_id_fkey`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_dispatch_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_tarja_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS dispatch_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS tarja_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS exporter_code`);

    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS corner_board_code VARCHAR(80) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      UPDATE final_pallets SET corner_board_code = COALESCE(NULLIF(TRIM(label_code), ''), '')
      WHERE corner_board_code = ''
    `);

    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS clamshell_label VARCHAR(120) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS client_id BIGINT NULL REFERENCES clients(id)
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS fruit_quality_mode VARCHAR(16) NOT NULL DEFAULT 'proceso'
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS presentation_format_id BIGINT NULL REFERENCES presentation_formats(id)
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_final_pallets_client_id ON final_pallets(client_id)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_final_pallets_presentation_format_id ON final_pallets(presentation_format_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_presentation_format_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_client_id`);

    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS presentation_format_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS fruit_quality_mode`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS client_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS clamshell_label`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS corner_board_code`);

    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS exporter_code VARCHAR(80) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN dispatch_id BIGINT NULL REFERENCES dispatches(id)
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN tarja_id BIGINT NULL REFERENCES pt_tags(id)
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_final_pallets_dispatch_id ON final_pallets(dispatch_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_final_pallets_tarja_id ON final_pallets(tarja_id)`);
  }
}
