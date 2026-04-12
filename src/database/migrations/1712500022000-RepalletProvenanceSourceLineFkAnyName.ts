import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Asegura que no quede FK sobre source_line_id (nombres distintos según quién creó la tabla).
 */
export class RepalletProvenanceSourceLineFkAnyName1712500022000 implements MigrationInterface {
  name = 'RepalletProvenanceSourceLineFkAnyName1712500022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT DISTINCT c.conname AS cname
          FROM pg_constraint c
          JOIN pg_class rel ON rel.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = rel.relnamespace
          JOIN LATERAL unnest(c.conkey) AS ck(attnum) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck.attnum
          WHERE n.nspname = 'public'
            AND rel.relname = 'repallet_line_provenance'
            AND c.contype = 'f'
            AND a.attname = 'source_line_id'
        ) LOOP
          EXECUTE format('ALTER TABLE repallet_line_provenance DROP CONSTRAINT IF EXISTS %I', r.cname);
        END LOOP;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    /* no restauramos FK: incompatible con borrar líneas antes del insert de trazabilidad */
  }
}
