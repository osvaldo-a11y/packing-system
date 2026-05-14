import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FruitProcessCsvProcessRef1712500061000 implements MigrationInterface {
  name = 'FruitProcessCsvProcessRef1712500061000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD COLUMN IF NOT EXISTS csv_process_ref INT NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN fruit_processes.csv_process_ref IS
        'Número de proceso en CSV de import (process_id / auto_process_id); cruce PT por día + ref.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fruit_processes DROP COLUMN IF EXISTS csv_process_ref`);
  }
}
