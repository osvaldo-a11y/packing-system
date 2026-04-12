import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcessResultComponentsBySpecies1712500013000 implements MigrationInterface {
  name = 'ProcessResultComponentsBySpecies1712500013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS process_result_components (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(32) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS species_process_result_components (
        id BIGSERIAL PRIMARY KEY,
        species_id BIGINT NOT NULL REFERENCES species(id) ON DELETE CASCADE,
        component_id BIGINT NOT NULL REFERENCES process_result_components(id) ON DELETE CASCADE,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_species_process_component UNIQUE (species_id, component_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sprc_species_id ON species_process_result_components(species_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sprc_component_id ON species_process_result_components(component_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fruit_process_component_values (
        id BIGSERIAL PRIMARY KEY,
        fruit_process_id BIGINT NOT NULL REFERENCES fruit_processes(id) ON DELETE CASCADE,
        component_id BIGINT NOT NULL REFERENCES process_result_components(id) ON DELETE CASCADE,
        lb_value NUMERIC(14,3) NOT NULL DEFAULT 0,
        CONSTRAINT uq_fpcv_process_component UNIQUE (fruit_process_id, component_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fpcv_process_id ON fruit_process_component_values(fruit_process_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fpcv_component_id ON fruit_process_component_values(component_id)
    `);

    await queryRunner.query(`
      INSERT INTO process_result_components (codigo, nombre, activo, sort_order)
      VALUES
        ('IQF', 'Lb IQF', true, 10),
        ('MERMA', 'Lb merma', true, 20),
        ('JUGO', 'Lb jugo', true, 30)
      ON CONFLICT (codigo) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO species_process_result_components (species_id, component_id, activo)
      SELECT s.id, c.id, c.codigo IN ('IQF', 'MERMA')
      FROM species s
      CROSS JOIN process_result_components c
      WHERE c.codigo IN ('IQF', 'MERMA', 'JUGO')
      ON CONFLICT (species_id, component_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fpcv_component_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fpcv_process_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS fruit_process_component_values`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_sprc_component_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sprc_species_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS species_process_result_components`);

    await queryRunner.query(`DROP TABLE IF EXISTS process_result_components`);
  }
}
