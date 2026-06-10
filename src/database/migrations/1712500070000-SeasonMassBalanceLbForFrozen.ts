import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 4b — stream FOR FROZEN en recepciones (2023+) y derivado frozen→congelado. */
export class SeasonMassBalanceLbForFrozen1712500070000 implements MigrationInterface {
  name = 'SeasonMassBalanceLbForFrozen1712500070000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE season_mass_balance
        ADD COLUMN IF NOT EXISTS lb_for_frozen NUMERIC(14,3) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE season_mass_balance
        ADD COLUMN IF NOT EXISTS lb_frozen_to_frozen NUMERIC(14,3) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE season_mass_balance DROP COLUMN IF EXISTS lb_frozen_to_frozen
    `);
    await queryRunner.query(`
      ALTER TABLE season_mass_balance DROP COLUMN IF EXISTS lb_for_frozen
    `);
  }
}
