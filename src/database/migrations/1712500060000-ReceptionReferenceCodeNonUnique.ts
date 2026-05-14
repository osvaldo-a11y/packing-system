import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `reference_code` puede repetirse entre recepciones (ej. mismo día mano y máquina).
 * La unicidad operativa queda en `reception_lines.lot_code` (incluye reception_id en el código generado por la app).
 */
export class ReceptionReferenceCodeNonUnique1712500060000 implements MigrationInterface {
  name = 'ReceptionReferenceCodeNonUnique1712500060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_receptions_reference_code`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_receptions_reference_code
      ON receptions(reference_code)
      WHERE reference_code IS NOT NULL AND TRIM(reference_code) <> ''
    `);
  }
}
