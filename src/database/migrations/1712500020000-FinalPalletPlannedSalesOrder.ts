import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinalPalletPlannedSalesOrder1712500020000 implements MigrationInterface {
  name = 'FinalPalletPlannedSalesOrder1712500020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE final_pallets
      ADD COLUMN IF NOT EXISTS planned_sales_order_id BIGINT NULL
      REFERENCES sales_orders(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_final_pallets_planned_sales_order
      ON final_pallets (planned_sales_order_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_final_pallets_planned_sales_order`);
    await queryRunner.query(`ALTER TABLE final_pallets DROP COLUMN IF EXISTS planned_sales_order_id`);
  }
}
