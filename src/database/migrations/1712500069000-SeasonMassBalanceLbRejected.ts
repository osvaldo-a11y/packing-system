import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 4 — rechazo en recepciones (Quality=WASTE) en balance de masas. */
export class SeasonMassBalanceLbRejected1712500069000 implements MigrationInterface {
  name = 'SeasonMassBalanceLbRejected1712500069000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE season_mass_balance
        ADD COLUMN IF NOT EXISTS lb_rejected NUMERIC(14,3) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE season_mass_balance DROP COLUMN IF EXISTS lb_rejected
    `);
  }
}
