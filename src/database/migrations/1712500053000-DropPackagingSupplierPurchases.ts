import { MigrationInterface, QueryRunner } from 'typeorm';

/** Se unifica el flujo de compras en Materiales (ajuste tipo compra + Kardex). */
export class DropPackagingSupplierPurchases1712500053000 implements MigrationInterface {
  name = 'DropPackagingSupplierPurchases1712500053000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS packaging_supplier_purchase_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS packaging_supplier_purchase_orders`);
  }

  public async down(): Promise<void> {
    // No restaurar: la versión previa quedó obsoleta.
  }
}
