import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bloque 2.5A — solo species.flow_type (PROCESSED | DIRECT).
 *
 * Evidencia pre-migration (DB local post-migraciones baseline @ 4a288a1d):
 *   id=1  codigo=_MIG  nombre='Especie (dato legado)'  activo=true
 * No existe registro Orange/Naranja inequívoco en fuentes inspeccionables
 * (seeds, migrations, DB local). Por eso NO hay backfill DIRECT por LIKE '%ORAN%'.
 * Todos los históricos quedan PROCESSED vía DEFAULT. DIRECT se asigna por Masters
 * cuando exista la especie destino (o data-migration posterior con PK exacta).
 */
export class SpeciesFlowType1780310000000 implements MigrationInterface {
  name = 'SpeciesFlowType1780310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE species
      ADD COLUMN IF NOT EXISTS flow_type VARCHAR(16) NOT NULL DEFAULT 'PROCESSED'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE species
          ADD CONSTRAINT chk_species_flow_type
          CHECK (flow_type IN ('PROCESSED', 'DIRECT'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Índice compuesto para listados masters filtrados por flujo + activo (justificado).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_species_flow_type_activo
      ON species (flow_type, activo)
    `);

    // Garantiza históricos: cualquier NULL residual → PROCESSED (idempotente).
    await queryRunner.query(`
      UPDATE species
      SET flow_type = 'PROCESSED'
      WHERE flow_type IS NULL OR TRIM(flow_type) = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_species_flow_type_activo`);
    await queryRunner.query(`ALTER TABLE species DROP CONSTRAINT IF EXISTS chk_species_flow_type`);
    await queryRunner.query(`ALTER TABLE species DROP COLUMN IF EXISTS flow_type`);
  }
}
