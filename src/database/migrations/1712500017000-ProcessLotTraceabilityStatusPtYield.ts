import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lote por línea en allocations; estado de proceso; packout por formato+cajas; registro PT al confirmar.
 */
export class ProcessLotTraceabilityStatusPtYield1712500017000 implements MigrationInterface {
  name = 'ProcessLotTraceabilityStatusPtYield1712500017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fruit_process_line_allocations
      ADD COLUMN IF NOT EXISTS lot_code VARCHAR(96) NULL
    `);
    await queryRunner.query(`
      UPDATE fruit_process_line_allocations f
      SET lot_code = COALESCE(rl.lot_code, 'R' || rl.id::text)
      FROM reception_lines rl
      WHERE rl.id = f.reception_line_id AND (f.lot_code IS NULL OR TRIM(f.lot_code) = '')
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_process_line_allocations ALTER COLUMN lot_code SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD COLUMN IF NOT EXISTS process_status VARCHAR(20) NOT NULL DEFAULT 'borrador'
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD COLUMN IF NOT EXISTS presentation_format_id BIGINT NULL REFERENCES presentation_formats(id)
    `);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD COLUMN IF NOT EXISTS packout_box_count INT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fruit_process_pt_yield (
        id BIGSERIAL PRIMARY KEY,
        fruit_process_id BIGINT NOT NULL UNIQUE REFERENCES fruit_processes(id) ON DELETE CASCADE,
        species_id BIGINT NOT NULL REFERENCES species(id),
        variety_id BIGINT NOT NULL REFERENCES varieties(id),
        quality_grade_id BIGINT NULL REFERENCES quality_grades(id),
        presentation_format_id BIGINT NOT NULL REFERENCES presentation_formats(id),
        box_count INT NOT NULL,
        net_lb NUMERIC(14,3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fruit_process_pt_yield`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS packout_box_count`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS presentation_format_id`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS process_status`);
    await queryRunner.query(`ALTER TABLE fruit_process_line_allocations DROP COLUMN IF EXISTS lot_code`);
  }
}
