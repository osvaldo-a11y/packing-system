import { MigrationInterface, QueryRunner } from 'typeorm';

/** Máquinas / líneas de proceso (single/double) y vínculo opcional en fruit_processes. */
export class ProcessMachinesAndProcessFk1712500010000 implements MigrationInterface {
  name = 'ProcessMachinesAndProcessFk1712500010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS process_machines (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(32) NOT NULL UNIQUE,
        nombre VARCHAR(160) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD COLUMN IF NOT EXISTS process_machine_id BIGINT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_fruit_processes_process_machine'
        ) THEN
          ALTER TABLE fruit_processes
          ADD CONSTRAINT fk_fruit_processes_process_machine
          FOREIGN KEY (process_machine_id) REFERENCES process_machines(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      INSERT INTO process_machines (codigo, nombre, kind, activo)
      VALUES
        ('IQF-SINGLE', 'IQF línea single', 'single', true),
        ('IQF-DOUBLE', 'IQF línea double', 'double', true)
      ON CONFLICT (codigo) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fruit_processes DROP CONSTRAINT IF EXISTS fk_fruit_processes_process_machine`);
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS process_machine_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS process_machines`);
  }
}
