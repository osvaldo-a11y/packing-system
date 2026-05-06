import { MigrationInterface, QueryRunner } from 'typeorm';

/** Metadatos comerciales opcionales para importación histórica de pedidos. */
export class SalesOrderImportMetadata1712500058000 implements MigrationInterface {
  name = 'SalesOrderImportMetadata1712500058000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_orders
      ADD COLUMN IF NOT EXISTS fecha_pedido TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE sales_orders
      ADD COLUMN IF NOT EXISTS fecha_despacho_cliente TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE sales_orders
      ADD COLUMN IF NOT EXISTS estado_comercial VARCHAR(24) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sales_orders DROP COLUMN IF EXISTS estado_comercial`);
    await queryRunner.query(`ALTER TABLE sales_orders DROP COLUMN IF EXISTS fecha_despacho_cliente`);
    await queryRunner.query(`ALTER TABLE sales_orders DROP COLUMN IF EXISTS fecha_pedido`);
  }
}
