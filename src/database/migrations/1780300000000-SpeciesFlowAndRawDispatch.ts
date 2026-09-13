import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bloque 2.5: species.flow_type + RAW inventory allocations/adjustments +
 * SalesOrderLine RAW fields + Dispatch RAW junction / source_kind.
 * Defaults keep all historical Blueberry (PROCESSED / PT_PL) behavior.
 */
export class SpeciesFlowAndRawDispatch1780300000000 implements MigrationInterface {
  name = 'SpeciesFlowAndRawDispatch1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE species
      ADD COLUMN IF NOT EXISTS flow_type VARCHAR(16) NOT NULL DEFAULT 'PROCESSED'
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE species
          ADD CONSTRAINT chk_species_flow_type
          CHECK (flow_type IN ('PROCESSED', 'DIRECT'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_species_flow_type_activo
      ON species (flow_type, activo)
    `);
    // Data-only backfill: orange-like names/codes → DIRECT. No runtime hardcodes.
    await queryRunner.query(`
      UPDATE species
      SET flow_type = 'DIRECT'
      WHERE flow_type = 'PROCESSED'
        AND (
          UPPER(TRIM(codigo)) LIKE '%ORAN%'
          OR UPPER(TRIM(nombre)) LIKE '%ORANGE%'
          OR UPPER(TRIM(nombre)) LIKE '%NARANJA%'
        )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reception_line_direct_allocations (
        id BIGSERIAL PRIMARY KEY,
        dispatch_id BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
        reception_line_id BIGINT NOT NULL REFERENCES reception_lines(id) ON DELETE RESTRICT,
        lb_allocated NUMERIC(14,3) NOT NULL CHECK (lb_allocated > 0),
        lot_code_snapshot VARCHAR(96) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dispatch_id, reception_line_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rl_direct_alloc_line
      ON reception_line_direct_allocations (reception_line_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rl_direct_alloc_dispatch
      ON reception_line_direct_allocations (dispatch_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reception_line_adjustments (
        id BIGSERIAL PRIMARY KEY,
        reception_line_id BIGINT NOT NULL REFERENCES reception_lines(id) ON DELETE CASCADE,
        adjustment_type VARCHAR(24) NOT NULL
          CHECK (adjustment_type IN ('LOSS', 'REJECTION', 'CORRECTION')),
        lb_delta NUMERIC(14,3) NOT NULL,
        reason TEXT NULL,
        created_by VARCHAR(80) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rl_adjustments_line
      ON reception_line_adjustments (reception_line_id)
    `);

    await queryRunner.query(`
      ALTER TABLE sales_order_lines
      ADD COLUMN IF NOT EXISTS line_kind VARCHAR(16) NOT NULL DEFAULT 'PT_FORMAT'
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sales_order_lines
          ADD CONSTRAINT chk_sales_order_lines_line_kind
          CHECK (line_kind IN ('PT_FORMAT', 'RAW_WEIGHT'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE sales_order_lines
      ADD COLUMN IF NOT EXISTS requested_lb NUMERIC(14,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE sales_order_lines
      ADD COLUMN IF NOT EXISTS species_id BIGINT NULL REFERENCES species(id) ON DELETE RESTRICT
    `);
    // Allow nullable presentation_format / boxes for RAW lines.
    await queryRunner.query(`
      ALTER TABLE sales_order_lines
      ALTER COLUMN presentation_format_id DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE sales_order_lines
      ALTER COLUMN requested_boxes DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE sales_order_lines
      ALTER COLUMN requested_boxes SET DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE sales_order_lines SET requested_boxes = 0 WHERE requested_boxes IS NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sales_order_lines
          ADD CONSTRAINT chk_sales_order_lines_kind_shape
          CHECK (
            (line_kind = 'PT_FORMAT' AND presentation_format_id IS NOT NULL AND requested_boxes IS NOT NULL AND requested_boxes >= 0)
            OR
            (line_kind = 'RAW_WEIGHT' AND species_id IS NOT NULL AND requested_lb IS NOT NULL AND requested_lb > 0)
          );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_order_lines_species
      ON sales_order_lines (species_id)
    `);

    await queryRunner.query(`
      ALTER TABLE dispatches
      ADD COLUMN IF NOT EXISTS source_kind VARCHAR(16) NOT NULL DEFAULT 'PT_PL'
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE dispatches
          ADD CONSTRAINT chk_dispatches_source_kind
          CHECK (source_kind IN ('PT_PL', 'RAW'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatch_reception_lines (
        dispatch_id BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
        reception_line_id BIGINT NOT NULL REFERENCES reception_lines(id) ON DELETE RESTRICT,
        lb_dispatched NUMERIC(14,3) NOT NULL CHECK (lb_dispatched > 0),
        unit_price NUMERIC(12,4) NULL,
        PRIMARY KEY (dispatch_id, reception_line_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dispatch_reception_lines_line
      ON dispatch_reception_lines (reception_line_id)
    `);

    await queryRunner.query(`
      ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS reception_line_id BIGINT NULL REFERENCES reception_lines(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoice_items DROP COLUMN IF EXISTS reception_line_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS dispatch_reception_lines`);
    await queryRunner.query(`ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS chk_dispatches_source_kind`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS source_kind`);
    await queryRunner.query(`ALTER TABLE sales_order_lines DROP CONSTRAINT IF EXISTS chk_sales_order_lines_kind_shape`);
    await queryRunner.query(`ALTER TABLE sales_order_lines DROP CONSTRAINT IF EXISTS chk_sales_order_lines_line_kind`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sales_order_lines_species`);
    await queryRunner.query(`ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS species_id`);
    await queryRunner.query(`ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS requested_lb`);
    await queryRunner.query(`ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS line_kind`);
    await queryRunner.query(`DROP TABLE IF EXISTS reception_line_adjustments`);
    await queryRunner.query(`DROP TABLE IF EXISTS reception_line_direct_allocations`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_species_flow_type_activo`);
    await queryRunner.query(`ALTER TABLE species DROP CONSTRAINT IF EXISTS chk_species_flow_type`);
    await queryRunner.query(`ALTER TABLE species DROP COLUMN IF EXISTS flow_type`);
  }
}
