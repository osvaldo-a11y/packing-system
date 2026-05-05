import { MigrationInterface, QueryRunner } from 'typeorm';

export class PackingSupplierMaterialCategories1712500054000 implements MigrationInterface {
  name = 'PackingSupplierMaterialCategories1712500054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS packing_supplier_material_categories (
        supplier_id bigint NOT NULL,
        material_category_id bigint NOT NULL,
        PRIMARY KEY (supplier_id, material_category_id),
        CONSTRAINT fk_psmc_supplier FOREIGN KEY (supplier_id) REFERENCES packing_suppliers(id) ON DELETE CASCADE,
        CONSTRAINT fk_psmc_material_category FOREIGN KEY (material_category_id) REFERENCES material_categories(id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS packing_supplier_material_categories`);
  }
}

