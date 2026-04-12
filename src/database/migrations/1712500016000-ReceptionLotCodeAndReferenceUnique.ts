import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lote por línea (referencia + -L{n}); referencia única cuando existe.
 */
export class ReceptionLotCodeAndReferenceUnique1712500016000 implements MigrationInterface {
  name = 'ReceptionLotCodeAndReferenceUnique1712500016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE receptions r
      SET reference_code = TRIM(r.reference_code) || '-' || r.id::text
      WHERE r.id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(COALESCE(reference_code, ''))) ORDER BY id) AS rn
          FROM receptions
          WHERE reference_code IS NOT NULL AND TRIM(reference_code) <> ''
        ) x WHERE rn > 1
      )
    `);

    await queryRunner.query(`
      ALTER TABLE reception_lines ADD COLUMN IF NOT EXISTS lot_code VARCHAR(96) NULL
    `);

    await queryRunner.query(`
      UPDATE reception_lines rl
      SET lot_code = COALESCE(NULLIF(TRIM(r.reference_code), ''), 'R' || r.id::text) || '-L' || (rl.line_order + 1)::text
      FROM receptions r
      WHERE r.id = rl.reception_id AND rl.lot_code IS NULL
    `);

    await queryRunner.query(`
      UPDATE reception_lines rl
      SET lot_code = lot_code || '-' || rl.id::text
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY lot_code ORDER BY id) AS rn
          FROM reception_lines
        ) y WHERE rn > 1
      )
    `);

    await queryRunner.query(`ALTER TABLE reception_lines ALTER COLUMN lot_code SET NOT NULL`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_lines_lot_code ON reception_lines(lot_code)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_receptions_reference_code
      ON receptions(reference_code)
      WHERE reference_code IS NOT NULL AND TRIM(reference_code) <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_receptions_reference_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_reception_lines_lot_code`);
    await queryRunner.query(`ALTER TABLE reception_lines DROP COLUMN IF EXISTS lot_code`);
  }
}
