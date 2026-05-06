import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo: variedades operativas MULTI / BEAUTY, columna descripcion en varieties,
 * y corrección de reception_lines importadas con nota + GD.
 */
export class VarietyDescripcionMultiBeauty1712500057000 implements MigrationInterface {
  name = 'VarietyDescripcionMultiBeauty1712500057000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE varieties ADD COLUMN IF NOT EXISTS descripcion TEXT NULL`);

    await queryRunner.query(`
      INSERT INTO varieties (species_id, codigo, nombre, activo, descripcion)
      SELECT 2, 'MULTI', 'Multivariety', true, 'Lote con mezcla de variedades'
      WHERE NOT EXISTS (
        SELECT 1 FROM varieties v
        WHERE v.species_id = 2 AND v.codigo IS NOT NULL AND LOWER(TRIM(v.codigo)) = 'multi'
      )
    `);

    await queryRunner.query(`
      INSERT INTO varieties (species_id, codigo, nombre, activo, descripcion)
      SELECT 2, 'BEAUTY', 'Beauty', true, NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM varieties v
        WHERE v.species_id = 2 AND v.codigo IS NOT NULL AND LOWER(TRIM(v.codigo)) = 'beauty'
      )
    `);

    await queryRunner.query(`
      UPDATE reception_lines rl
      SET variety_id = v.id
      FROM varieties v
      WHERE v.species_id = 2
        AND LOWER(TRIM(v.codigo)) = 'multi'
        AND rl.variety_id = 3
        AND TRIM(rl.multivariety_note) = 'MULTI'
    `);

    await queryRunner.query(`
      UPDATE reception_lines rl
      SET variety_id = v.id
      FROM varieties v
      WHERE v.species_id = 2
        AND LOWER(TRIM(v.codigo)) = 'beauty'
        AND TRIM(rl.multivariety_note) = 'BEAUTY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE reception_lines rl
      SET variety_id = 3, multivariety_note = 'MULTI'
      WHERE rl.variety_id IN (
        SELECT id FROM varieties WHERE species_id = 2 AND LOWER(TRIM(codigo)) = 'multi'
      )
    `);
    await queryRunner.query(`
      UPDATE reception_lines rl
      SET variety_id = 3, multivariety_note = 'BEAUTY'
      WHERE rl.variety_id IN (
        SELECT id FROM varieties WHERE species_id = 2 AND LOWER(TRIM(codigo)) = 'beauty'
      )
    `);
    await queryRunner.query(`
      DELETE FROM varieties
      WHERE species_id = 2
        AND codigo IS NOT NULL
        AND LOWER(TRIM(codigo)) IN ('multi', 'beauty')
    `);
    await queryRunner.query(`ALTER TABLE varieties DROP COLUMN IF EXISTS descripcion`);
  }
}
