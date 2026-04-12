import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReceptionLinesQualityDashboard1712500005000 implements MigrationInterface {
  name = 'ReceptionLinesQualityDashboard1712500005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE quality_grades (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(32) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE reception_lines (
        id BIGSERIAL PRIMARY KEY,
        reception_id BIGINT NOT NULL REFERENCES receptions(id) ON DELETE CASCADE,
        line_order INT NOT NULL DEFAULT 0,
        species_id BIGINT NOT NULL REFERENCES species(id),
        variety_id BIGINT NOT NULL REFERENCES varieties(id),
        quality_grade_id BIGINT NULL REFERENCES quality_grades(id),
        multivariety_note VARCHAR(160) NULL,
        format_code VARCHAR(32) NULL,
        quantity INT NULL,
        gross_lb NUMERIC(14,3) NOT NULL DEFAULT 0,
        tare_lb NUMERIC(14,3) NOT NULL DEFAULT 0,
        net_lb NUMERIC(14,3) NOT NULL DEFAULT 0,
        temperature_f NUMERIC(8,2) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_reception_lines_reception ON reception_lines(reception_id)`);

    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS reference_code VARCHAR(64) NULL`);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS plant_code VARCHAR(64) NULL`);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS marketer_code VARCHAR(64) NULL`);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS fruit_pick_type VARCHAR(64) NULL`);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS lbs_reference NUMERIC(12,2) NULL`);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS lbs_difference NUMERIC(12,2) NULL`);
    await queryRunner.query(
      `ALTER TABLE receptions ADD COLUMN IF NOT EXISTS reception_status VARCHAR(20) NOT NULL DEFAULT 'borrador'`,
    );

    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS reception_line_id BIGINT NULL`);
    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD CONSTRAINT fk_fruit_processes_reception_line
      FOREIGN KEY (reception_line_id) REFERENCES reception_lines(id)
    `);

    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS temperatura_f NUMERIC(8,2) NULL`);
    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS nota TEXT NULL`);
    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS lb_entrada NUMERIC(14,3) NULL`);
    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS lb_iqf NUMERIC(14,3) NULL`);
    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS lb_packout NUMERIC(14,3) NULL`);
    await queryRunner.query(`ALTER TABLE fruit_processes ADD COLUMN IF NOT EXISTS lb_sobrante NUMERIC(14,3) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fruit_processes DROP CONSTRAINT IF EXISTS fk_fruit_processes_reception_line`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_sobrante`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_packout`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_iqf`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS lb_entrada`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS nota`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS temperatura_f`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS reception_line_id`);

    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS reception_status`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS lbs_difference`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS lbs_reference`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS fruit_pick_type`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS marketer_code`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS plant_code`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS reference_code`);

    await queryRunner.query(`DROP TABLE IF EXISTS reception_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS quality_grades`);
  }
}
