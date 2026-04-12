import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `source_line_id` guarda el id de línea al momento del movimiento; la fila en
 * `final_pallet_lines` puede borrarse al consumir el repaletizaje. Una FK a
 * `final_pallet_lines` impide insertar la trazabilidad después del DELETE.
 */
export class RepalletProvenanceSourceLineNoFk1712500021000 implements MigrationInterface {
  name = 'RepalletProvenanceSourceLineNoFk1712500021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE repallet_line_provenance
      DROP CONSTRAINT IF EXISTS repallet_line_provenance_source_line_id_fkey
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE repallet_line_provenance
      ADD CONSTRAINT repallet_line_provenance_source_line_id_fkey
      FOREIGN KEY (source_line_id) REFERENCES final_pallet_lines(id) ON DELETE SET NULL
    `);
  }
}
