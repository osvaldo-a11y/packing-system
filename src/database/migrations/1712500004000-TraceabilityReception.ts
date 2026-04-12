import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recepción como inicio de trazabilidad + mantenedores (especie, productor, variedad, formato presentación).
 * Migra recepcion_id existente en fruit_processes hacia filas reales en receptions.
 */
export class TraceabilityReception1712500004000 implements MigrationInterface {
  name = 'TraceabilityReception1712500004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE species (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(32) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE producers (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(32) NULL,
        nombre VARCHAR(200) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE varieties (
        id BIGSERIAL PRIMARY KEY,
        species_id BIGINT NOT NULL REFERENCES species(id),
        codigo VARCHAR(32) NULL,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE presentation_formats (
        id BIGSERIAL PRIMARY KEY,
        format_code VARCHAR(20) NOT NULL UNIQUE,
        species_id BIGINT NULL REFERENCES species(id),
        descripcion TEXT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE receptions (
        id BIGSERIAL PRIMARY KEY,
        received_at TIMESTAMP NOT NULL,
        document_number VARCHAR(64) NULL,
        producer_id BIGINT NOT NULL REFERENCES producers(id),
        variety_id BIGINT NOT NULL REFERENCES varieties(id),
        gross_weight_lb NUMERIC(12,2) NULL,
        net_weight_lb NUMERIC(12,2) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      INSERT INTO species (codigo, nombre) VALUES ('_MIG', 'Especie (dato legado)')
    `);
    await queryRunner.query(`
      INSERT INTO producers (codigo, nombre) VALUES ('_MIG', 'Productor (dato legado)')
    `);
    await queryRunner.query(`
      INSERT INTO varieties (species_id, codigo, nombre)
      SELECT id, '_MIG', 'Variedad (dato legado)' FROM species WHERE codigo = '_MIG' LIMIT 1
    `);

    await queryRunner.query(`
      INSERT INTO receptions (id, received_at, producer_id, variety_id, document_number, notes)
      SELECT DISTINCT ON (fp.recepcion_id) fp.recepcion_id,
             NOW(),
             (SELECT id FROM producers WHERE codigo = '_MIG' LIMIT 1),
             (SELECT id FROM varieties WHERE codigo = '_MIG' LIMIT 1),
             'MIGRATED',
             'Generado automáticamente al migrar recepcion_id'
      FROM fruit_processes fp
      ORDER BY fp.recepcion_id, fp.id
    `);

    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('receptions', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM receptions), 1)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE fruit_processes
      ADD CONSTRAINT fk_fruit_processes_recepcion
      FOREIGN KEY (recepcion_id) REFERENCES receptions(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fruit_processes DROP CONSTRAINT IF EXISTS fk_fruit_processes_recepcion`);
    await queryRunner.query(`DROP TABLE IF EXISTS receptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_formats`);
    await queryRunner.query(`DROP TABLE IF EXISTS varieties`);
    await queryRunner.query(`DROP TABLE IF EXISTS producers`);
    await queryRunner.query(`DROP TABLE IF EXISTS species`);
  }
}
