import { MigrationInterface, QueryRunner } from 'typeorm';

/** Si `1712500059000` quedó registrada más de una vez en `migrations`, conserva el id mínimo. */
export class DedupHistoricalImportCatalogMigrationRow1712500059100 implements MigrationInterface {
  name = 'DedupHistoricalImportCatalogMigrationRow1712500059100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM migrations a
      WHERE a.name = 'HistoricalImportCatalogSeedsAndMigrationDedup1712500059000'
        AND a.id > (
          SELECT MIN(b.id)
          FROM migrations b
          WHERE b.name = 'HistoricalImportCatalogSeedsAndMigrationDedup1712500059000'
        )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
