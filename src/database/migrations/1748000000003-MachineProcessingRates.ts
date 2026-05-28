import { MigrationInterface, QueryRunner } from 'typeorm';

export class MachineProcessingRates1748000000003 implements MigrationInterface {
  name = 'MachineProcessingRates1748000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS machine_processing_rates (
        id BIGSERIAL PRIMARY KEY,
        rate_per_lb NUMERIC(12,6) NOT NULL,
        species_id BIGINT NULL REFERENCES species(id),
        season VARCHAR(40) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        notes VARCHAR(200) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_processing_rates_species_season
      ON machine_processing_rates(COALESCE(species_id::text, 'all'), COALESCE(season, ''))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_machine_processing_rates_species_season`);
    await queryRunner.query(`DROP TABLE IF EXISTS machine_processing_rates`);
  }
}
