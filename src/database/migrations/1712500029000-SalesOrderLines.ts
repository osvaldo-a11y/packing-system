import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Líneas comerciales por formato (cajas, precio opcional, marca/variedad opcional).
 * Los totales en sales_orders (requested_boxes, requested_pallets) se mantienen
 * como agregados (cajas totales y pallets estimados vía max_boxes_per_pallet del formato).
 */
export class SalesOrderLines1712500029000 implements MigrationInterface {
  name = 'SalesOrderLines1712500029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_order_lines (
        id BIGSERIAL PRIMARY KEY,
        sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
        presentation_format_id BIGINT NOT NULL REFERENCES presentation_formats(id),
        requested_boxes INT NOT NULL CHECK (requested_boxes >= 0),
        unit_price NUMERIC(12,4) NULL,
        brand_id BIGINT NULL REFERENCES brands(id) ON DELETE SET NULL,
        variety_id BIGINT NULL REFERENCES varieties(id) ON DELETE SET NULL,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order ON sales_order_lines (sales_order_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_order_lines_format ON sales_order_lines (presentation_format_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sales_order_lines`);
  }
}
