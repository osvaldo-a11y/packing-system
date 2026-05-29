import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normaliza alias pint: PINTA → PINT y limpia descripciones de catálogo en formatos pint.
 */
export class RenamePintPresentationFormats1748000000005 implements MigrationInterface {
  name = 'RenamePintPresentationFormats1748000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE presentation_formats
      SET format_code = 'PINT REGULAR', descripcion = NULL
      WHERE LOWER(TRIM(format_code)) IN ('pinta regular', 'pint regular')
    `);
    await queryRunner.query(`
      UPDATE presentation_formats
      SET format_code = 'PINT LOW PROFILE', descripcion = NULL
      WHERE LOWER(TRIM(format_code)) IN ('pinta low profile', 'pint low profile')
    `);
    await queryRunner.query(`
      UPDATE pt_tags
      SET format_code = 'pint regular'
      WHERE LOWER(TRIM(format_code)) IN ('pinta regular', 'pint regular')
    `);
    await queryRunner.query(`
      UPDATE pt_tags
      SET format_code = 'pint low profile'
      WHERE LOWER(TRIM(format_code)) IN ('pinta low profile', 'pint low profile')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE presentation_formats
      SET format_code = 'PINTA REGULAR',
          descripcion = COALESCE(descripcion, 'Clamshell pinta regular')
      WHERE LOWER(TRIM(format_code)) = 'pint regular'
    `);
    await queryRunner.query(`
      UPDATE presentation_formats
      SET format_code = 'PINTA LOW PROFILE',
          descripcion = COALESCE(descripcion, 'Clamshell pinta low profile')
      WHERE LOWER(TRIM(format_code)) = 'pint low profile'
    `);
    await queryRunner.query(`
      UPDATE pt_tags SET format_code = 'pinta regular' WHERE LOWER(TRIM(format_code)) = 'pint regular'
    `);
    await queryRunner.query(`
      UPDATE pt_tags SET format_code = 'pinta low profile' WHERE LOWER(TRIM(format_code)) = 'pint low profile'
    `);
  }
}
