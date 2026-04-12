import { MigrationInterface, QueryRunner } from 'typeorm';

/** Envase retornable opcional por línea de recepción. */
export class ReceptionLineReturnableContainer1712500009000 implements MigrationInterface {
  name = 'ReceptionLineReturnableContainer1712500009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE reception_lines
      ADD COLUMN IF NOT EXISTS returnable_container_id BIGINT NULL
      REFERENCES returnable_containers(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE reception_lines DROP COLUMN IF EXISTS returnable_container_id`);
  }
}
