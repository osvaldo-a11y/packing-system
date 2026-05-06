import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo mínimo para import histórico (Railway / entornos nuevos) y limpieza de fila duplicada
 * en `migrations` para SalesOrderImportMetadata (se conserva el id más bajo).
 */
export class HistoricalImportCatalogSeedsAndMigrationDedup1712500059000 implements MigrationInterface {
  name = 'HistoricalImportCatalogSeedsAndMigrationDedup1712500059000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO clients (codigo, nombre, activo)
      VALUES ('JAEMOR-FARMS', 'JAEMOR FARMS', true)
      ON CONFLICT (codigo) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO brands (codigo, nombre, label_material_id, client_id, activo)
      VALUES ('PINEBLOOM', 'PINEBLOOM FARMS', NULL, NULL, true)
      ON CONFLICT (codigo) DO NOTHING
    `);

    await queryRunner.query(`
      DELETE FROM migrations a
      WHERE a.name = 'SalesOrderImportMetadata1712500058000'
        AND a.id > (
          SELECT MIN(b.id)
          FROM migrations b
          WHERE b.name = 'SalesOrderImportMetadata1712500058000'
        )
    `);
  }

  /**
   * La deduplicación en `migrations` no se revierte. Las semillas pueden quedar referenciadas
   * (pedidos, etc.); no se eliminan en down para evitar romper FK.
   */
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
