import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría de transiciones: confirmado (cierre operativo del documento) vs despachado (salida efectiva).
 */
export class DispatchConfirmTimestamps1712500028000 implements MigrationInterface {
  name = 'DispatchConfirmTimestamps1712500028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatches
        ADD COLUMN IF NOT EXISTS dispatch_confirmed_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS dispatch_despachado_at TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS dispatch_despachado_at`);
    await queryRunner.query(`ALTER TABLE dispatches DROP COLUMN IF EXISTS dispatch_confirmed_at`);
  }
}
