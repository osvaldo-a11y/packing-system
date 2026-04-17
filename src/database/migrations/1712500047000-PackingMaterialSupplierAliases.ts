import { MigrationInterface, QueryRunner } from 'typeorm';

/** Código/nombre del ítem según guía o factura del proveedor (mapeo a material interno). */
export class PackingMaterialSupplierAliases1712500047000 implements MigrationInterface {
  name = 'PackingMaterialSupplierAliases1712500047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packing_material_suppliers
        ADD COLUMN IF NOT EXISTS supplier_item_code VARCHAR(80) NULL,
        ADD COLUMN IF NOT EXISTS supplier_item_name VARCHAR(300) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE packing_material_suppliers
        DROP COLUMN IF EXISTS supplier_item_name,
        DROP COLUMN IF EXISTS supplier_item_code
    `);
  }
}
