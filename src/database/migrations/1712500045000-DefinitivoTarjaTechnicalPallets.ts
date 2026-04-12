import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pallets técnicos vinculados a unidad PT (`tarja_id`) deben quedar en `definitivo` para depósito.
 * Corrige filas históricas en `borrador` que no alinean con `syncTechnicalFinalPalletFromPtTag`.
 * Post-migración: `POST /api/final-pallets/admin/reconcile-tarja-inventory` (admin) para recalcular stock.
 */
export class DefinitivoTarjaTechnicalPallets1712500045000 implements MigrationInterface {
  name = 'DefinitivoTarjaTechnicalPallets1712500045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE final_pallets
      SET status = 'definitivo'
      WHERE tarja_id IS NOT NULL
        AND status = 'borrador'
        AND (dispatch_id IS NULL OR dispatch_id <= 0)
        AND (pt_packing_list_id IS NULL OR pt_packing_list_id <= 0)
    `);
  }

  public async down(): Promise<void> {
    // Corrección de datos: sin reversión segura
  }
}
