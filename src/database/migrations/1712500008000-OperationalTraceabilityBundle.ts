import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Maestros (proveedores packing, clientes, marcas, envases), formato con peso neto/caja,
 * recepción (cosecha, tipo peso, calidad export/proceso), proceso balance, tarjas extendidas,
 * kardex materia prima, repaletización, cliente en despacho.
 */
export class OperationalTraceabilityBundle1712500008000 implements MigrationInterface {
  name = 'OperationalTraceabilityBundle1712500008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE material_category ADD VALUE 'bolsa';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE packing_suppliers (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(200) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE packing_material_suppliers (
        material_id BIGINT NOT NULL REFERENCES packaging_materials(id) ON DELETE CASCADE,
        supplier_id BIGINT NOT NULL REFERENCES packing_suppliers(id) ON DELETE CASCADE,
        PRIMARY KEY (material_id, supplier_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE clients (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(200) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE brands (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        label_material_id BIGINT NULL REFERENCES packaging_materials(id),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE returnable_containers (
        id BIGSERIAL PRIMARY KEY,
        tipo VARCHAR(80) NOT NULL,
        capacidad VARCHAR(40) NULL,
        requiere_retorno BOOLEAN NOT NULL DEFAULT FALSE,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE presentation_formats
        ADD COLUMN IF NOT EXISTS net_weight_lb_per_box NUMERIC(12,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE quality_grades
        ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'both'
    `);

    await queryRunner.query(`
      ALTER TABLE receptions
        ADD COLUMN IF NOT EXISTS harvest_type VARCHAR(24) NOT NULL DEFAULT 'hand_picking'
    `);
    await queryRunner.query(`
      ALTER TABLE receptions
        ADD COLUMN IF NOT EXISTS weight_basis VARCHAR(16) NOT NULL DEFAULT 'net_lb'
    `);
    await queryRunner.query(`
      ALTER TABLE receptions
        ADD COLUMN IF NOT EXISTS quality_intent VARCHAR(20) NOT NULL DEFAULT 'exportacion'
    `);

    await queryRunner.query(`
      ALTER TABLE fruit_processes
        ADD COLUMN IF NOT EXISTS lb_producto_terminado NUMERIC(14,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
        ADD COLUMN IF NOT EXISTS lb_desecho NUMERIC(14,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
        ADD COLUMN IF NOT EXISTS lb_jugo NUMERIC(14,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
        ADD COLUMN IF NOT EXISTS lb_merma_balance NUMERIC(14,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
        ADD COLUMN IF NOT EXISTS balance_closed BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await queryRunner.query(`
      CREATE TABLE fruit_process_line_allocations (
        id BIGSERIAL PRIMARY KEY,
        process_id BIGINT NOT NULL REFERENCES fruit_processes(id) ON DELETE CASCADE,
        reception_line_id BIGINT NOT NULL REFERENCES reception_lines(id),
        lb_allocated NUMERIC(14,3) NOT NULL,
        CONSTRAINT uq_fpla_process_line UNIQUE (process_id, reception_line_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_fpla_line ON fruit_process_line_allocations(reception_line_id)`);

    await queryRunner.query(`
      CREATE TABLE raw_material_movements (
        id BIGSERIAL PRIMARY KEY,
        reception_line_id BIGINT NULL REFERENCES reception_lines(id),
        fruit_process_id BIGINT NULL REFERENCES fruit_processes(id),
        quantity_delta_lb NUMERIC(14,3) NOT NULL,
        movement_kind VARCHAR(16) NOT NULL,
        ref_type VARCHAR(40) NULL,
        ref_id BIGINT NULL,
        nota TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_rmm_line ON raw_material_movements(reception_line_id)`);

    await queryRunner.query(`
      ALTER TABLE pt_tags
        ADD COLUMN IF NOT EXISTS client_id BIGINT NULL REFERENCES clients(id)
    `);
    await queryRunner.query(`
      ALTER TABLE pt_tags
        ADD COLUMN IF NOT EXISTS brand_id BIGINT NULL REFERENCES brands(id)
    `);
    await queryRunner.query(`
      ALTER TABLE pt_tags
        ADD COLUMN IF NOT EXISTS bol VARCHAR(80) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE pt_tags
        ADD COLUMN IF NOT EXISTS net_weight_lb NUMERIC(14,3) NULL
    `);

    await queryRunner.query(`
      CREATE TABLE pt_tag_merges (
        id BIGSERIAL PRIMARY KEY,
        result_tarja_id BIGINT NOT NULL REFERENCES pt_tags(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE pt_tag_merge_sources (
        merge_id BIGINT NOT NULL REFERENCES pt_tag_merges(id) ON DELETE CASCADE,
        source_tarja_id BIGINT NOT NULL REFERENCES pt_tags(id),
        PRIMARY KEY (merge_id, source_tarja_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE pt_tag_lineage (
        id BIGSERIAL PRIMARY KEY,
        ancestor_tarja_id BIGINT NOT NULL REFERENCES pt_tags(id),
        descendant_tarja_id BIGINT NOT NULL REFERENCES pt_tags(id),
        relation VARCHAR(24) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ptl_desc ON pt_tag_lineage(descendant_tarja_id)`);

    await queryRunner.query(`
      ALTER TABLE dispatches
        ADD COLUMN IF NOT EXISTS client_id BIGINT NULL REFERENCES clients(id)
    `);

    await queryRunner.query(`
      CREATE TABLE finished_pt_stock (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NULL REFERENCES clients(id),
        format_code VARCHAR(20) NOT NULL,
        brand_id BIGINT NULL REFERENCES brands(id),
        boxes INT NOT NULL DEFAULT 0,
        net_lb NUMERIC(14,3) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_finished_pt_stock_dims
      ON finished_pt_stock (COALESCE(client_id, -1), format_code, COALESCE(brand_id, -1))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finished_pt_stock`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS client_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_tag_lineage`);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_tag_merge_sources`);
    await queryRunner.query(`DROP TABLE IF EXISTS pt_tag_merges`);
    await queryRunner.query(`ALTER TABLE pt_tags DROP COLUMN IF EXISTS net_weight_lb`);
    await queryRunner.query(`ALTER TABLE pt_tags DROP COLUMN IF EXISTS bol`);
    await queryRunner.query(`ALTER TABLE pt_tags DROP COLUMN IF EXISTS brand_id`);
    await queryRunner.query(`ALTER TABLE pt_tags DROP COLUMN IF EXISTS client_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS raw_material_movements`);
    await queryRunner.query(`DROP TABLE IF EXISTS fruit_process_line_allocations`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS balance_closed`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_merma_balance`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_jugo`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_desecho`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_producto_terminado`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS quality_intent`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS weight_basis`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS harvest_type`);
    await queryRunner.query(`ALTER TABLE quality_grades DROP COLUMN IF EXISTS purpose`);
    await queryRunner.query(`ALTER TABLE presentation_formats DROP COLUMN IF EXISTS net_weight_lb_per_box`);
    await queryRunner.query(`DROP TABLE IF EXISTS packing_material_suppliers`);
    await queryRunner.query(`DROP TABLE IF EXISTS packing_suppliers`);
    await queryRunner.query(`DROP TABLE IF EXISTS returnable_containers`);
    await queryRunner.query(`DROP TABLE IF EXISTS brands`);
    await queryRunner.query(`DROP TABLE IF EXISTS clients`);
  }
}
