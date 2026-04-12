import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pallet final (cabecera + líneas con vínculo a proceso), detalle de factura al estilo legado,
 * y movimientos de inventario de materiales (kardex).
 */
export class FinalPalletInvoiceMovements1712500006000 implements MigrationInterface {
  name = 'FinalPalletInvoiceMovements1712500006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE final_pallets (
        id BIGSERIAL PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'borrador',
        species_id BIGINT NULL REFERENCES species(id),
        quality_grade_id BIGINT NULL REFERENCES quality_grades(id),
        label_code VARCHAR(80) NOT NULL DEFAULT '',
        exporter_code VARCHAR(80) NOT NULL DEFAULT '',
        brand_code VARCHAR(80) NOT NULL DEFAULT '',
        dispatch_unit VARCHAR(80) NOT NULL DEFAULT '',
        packing_type VARCHAR(80) NOT NULL DEFAULT '',
        market VARCHAR(80) NOT NULL DEFAULT '',
        bol VARCHAR(100) NULL,
        packaging_code VARCHAR(40) NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE final_pallet_lines (
        id BIGSERIAL PRIMARY KEY,
        final_pallet_id BIGINT NOT NULL REFERENCES final_pallets(id) ON DELETE CASCADE,
        line_order INT NOT NULL DEFAULT 0,
        fruit_process_id BIGINT NULL REFERENCES fruit_processes(id),
        fecha TIMESTAMP NOT NULL,
        ref_text VARCHAR(120) NULL,
        variety_id BIGINT NOT NULL REFERENCES varieties(id),
        caliber VARCHAR(40) NULL,
        category VARCHAR(80) NULL,
        amount INT NOT NULL DEFAULT 0,
        pounds NUMERIC(14,3) NOT NULL DEFAULT 0,
        net_lb NUMERIC(14,3) NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_fpl_pallet ON final_pallet_lines(final_pallet_id)`);
    await queryRunner.query(`CREATE INDEX idx_fpl_process ON final_pallet_lines(fruit_process_id)`);

    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS species_id BIGINT NULL REFERENCES species(id)
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS variety_id BIGINT NULL REFERENCES varieties(id)
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS packaging_code VARCHAR(40) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS brand VARCHAR(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS trays INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS pounds NUMERIC(14,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS packing_list_ref VARCHAR(80) NULL
    `);

    await queryRunner.query(`ALTER TABLE invoice_items ALTER COLUMN tarja_id DROP NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE packaging_material_movements (
        id BIGSERIAL PRIMARY KEY,
        material_id BIGINT NOT NULL REFERENCES packaging_materials(id),
        quantity_delta NUMERIC(14,4) NOT NULL,
        ref_type VARCHAR(40) NULL,
        ref_id BIGINT NULL,
        nota TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_pmm_material_created ON packaging_material_movements(material_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pmm_material_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS packaging_material_movements`);
    await queryRunner.query(`ALTER TABLE invoice_items ALTER COLUMN tarja_id SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS packing_list_ref`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS pounds`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS trays`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS brand`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS packaging_code`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS variety_id`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS species_id`);
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS is_manual`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fpl_process`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fpl_pallet`);
    await queryRunner.query(`DROP TABLE IF EXISTS final_pallet_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS final_pallets`);
  }
}
