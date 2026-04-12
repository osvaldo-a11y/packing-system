import { MigrationInterface, QueryRunner } from 'typeorm';

/** Formato: tope cajas/tarja. Material clamshell → formato + unidades/caja. Marca → cliente. Limpieza pallet final. */
export class FormatMaxClamshellBrandPalletCleanup1712500012000 implements MigrationInterface {
  name = 'FormatMaxClamshellBrandPalletCleanup1712500012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE presentation_formats
        ADD COLUMN IF NOT EXISTS max_boxes_per_pallet INT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE brands ADD COLUMN IF NOT EXISTS client_id BIGINT NULL REFERENCES clients(id)
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_brands_client_id ON brands(client_id)`);

    await queryRunner.query(`
      ALTER TABLE packaging_materials
        ADD COLUMN IF NOT EXISTS presentation_format_id BIGINT NULL REFERENCES presentation_formats(id)
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_materials
        ADD COLUMN IF NOT EXISTS clamshell_units_per_box NUMERIC(12, 4) NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_packaging_materials_presentation_format_id ON packaging_materials(presentation_format_id)`,
    );

    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS brand_id BIGINT NULL REFERENCES brands(id)
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_final_pallets_brand_id ON final_pallets(brand_id)`);

    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS label_code`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS packaging_code`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS brand_code`);

    await queryRunner.query(`ALTER TABLE final_pallet_lines DROP COLUMN IF EXISTS category`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE final_pallet_lines ADD COLUMN IF NOT EXISTS category VARCHAR(80) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS label_code VARCHAR(80) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS packaging_code VARCHAR(40) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE final_pallets ADD COLUMN IF NOT EXISTS brand_code VARCHAR(80) NOT NULL DEFAULT ''
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_brand_id`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS brand_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_packaging_materials_presentation_format_id`);
    await queryRunner.query(`ALTER TABLE packaging_materials DROP COLUMN IF EXISTS clamshell_units_per_box`);
    await queryRunner.query(`ALTER TABLE packaging_materials DROP COLUMN IF EXISTS presentation_format_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_brands_client_id`);
    await queryRunner.query(`ALTER TABLE brands DROP COLUMN IF EXISTS client_id`);

    await queryRunner.query(`ALTER TABLE presentation_formats DROP COLUMN IF EXISTS max_boxes_per_pallet`);
  }
}
