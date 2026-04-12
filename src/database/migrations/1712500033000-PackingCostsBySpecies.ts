import { MigrationInterface, QueryRunner } from 'typeorm';

export class PackingCostsBySpecies1712500033000 implements MigrationInterface {
  name = 'PackingCostsBySpecies1712500033000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS packing_costs (
        id BIGSERIAL PRIMARY KEY,
        species_id BIGINT NOT NULL REFERENCES species(id),
        season VARCHAR(40) NULL,
        price_per_lb NUMERIC(12,6) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_costs_species_season
      ON packing_costs(species_id, COALESCE(season, ''))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_packing_costs_species_season`);
    await queryRunner.query(`DROP TABLE IF EXISTS packing_costs`);
  }
}
