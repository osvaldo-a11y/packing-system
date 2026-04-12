import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Packout solo desde tarjas; proceso = MP + contexto operativo.
 * Elimina formato/cajas en proceso y tabla PT yield 1:1.
 */
export class ProcessRemovePackoutFromProcess1712500018000 implements MigrationInterface {
  name = 'ProcessRemovePackoutFromProcess1712500018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fruit_process_pt_yield`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS packout_box_count`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS presentation_format_id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
