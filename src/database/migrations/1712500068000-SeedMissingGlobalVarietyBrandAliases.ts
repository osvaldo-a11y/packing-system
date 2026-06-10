import { MigrationInterface, QueryRunner } from 'typeorm';

/** Completa alias globales de variedad/marca si 1712500067000 corrió con lookup solo por codigo. */
export class SeedMissingGlobalVarietyBrandAliases1712500068000 implements MigrationInterface {
  name = 'SeedMissingGlobalVarietyBrandAliases1712500068000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varietyMap: Array<[string, string[]]> = [
      ['Beauty', ['BT', 'BEAUTY']],
      ['Farthing', ['FAR', 'FARTHING']],
      ['Ga Dawn', ['GD', 'GEORGIA DAWN']],
      ['Kee Crisp', ['KC', 'KEE CRISP']],
      ['Legacy', ['LEG', 'LEGACY']],
      ['Patracia', ['PATR', 'PATRACIA']],
      ['Pop', ['POP']],
      ['Rebel', ['REBEL']],
      ['San Joaquin', ['SANJOAQUIN', 'SAN JOAQUIN']],
      ['Sentinel', ['SEN', 'SENTINEL']],
    ];
    for (const [raw, codigos] of varietyMap) {
      let varietyId: string | null = null;
      for (const codigo of codigos) {
        const rows = (await queryRunner.query(
          `SELECT id FROM varieties
           WHERE UPPER(TRIM(codigo)) = UPPER(TRIM($1::varchar))
              OR UPPER(TRIM(nombre)) = UPPER(TRIM($2::varchar))
           LIMIT 1`,
          [codigo, raw],
        )) as Array<{ id: string }>;
        if (rows[0]?.id) {
          varietyId = rows[0].id;
          break;
        }
      }
      if (!varietyId) continue;
      await queryRunner.query(
        `
        INSERT INTO legacy_value_aliases (kind, raw_value, resolved_id, season_year, notes)
        SELECT 'variety', $1::varchar, $2::bigint, NULL, $3::text
        WHERE NOT EXISTS (
          SELECT 1 FROM legacy_value_aliases a
          WHERE a.kind = 'variety'
            AND UPPER(TRIM(a.raw_value)) = UPPER(TRIM($1::varchar))
            AND a.season_year IS NULL
        )
        `,
        [raw.toUpperCase(), varietyId, `Global variety → ${raw}`],
      );
    }

    const brandMap: Array<[string, string[]]> = [
      ['ALPINE FRESH - HEB', ['ALP-HEB', 'ALPINE HEB']],
      ['CONSALO', ['FW-CN', 'CONSALO']],
    ];
    for (const [raw, codigos] of brandMap) {
      let brandId: string | null = null;
      for (const codigo of codigos) {
        const rows = (await queryRunner.query(
          `SELECT id FROM brands
           WHERE UPPER(TRIM(codigo)) = UPPER(TRIM($1::varchar))
              OR UPPER(TRIM(nombre)) = UPPER(TRIM($2::varchar))
           LIMIT 1`,
          [codigo, raw],
        )) as Array<{ id: string }>;
        if (rows[0]?.id) {
          brandId = rows[0].id;
          break;
        }
      }
      if (!brandId) continue;
      await queryRunner.query(
        `
        INSERT INTO legacy_value_aliases (kind, raw_value, resolved_id, season_year, notes)
        SELECT 'brand', $1::varchar, $2::bigint, NULL, $3::text
        WHERE NOT EXISTS (
          SELECT 1 FROM legacy_value_aliases a
          WHERE a.kind = 'brand'
            AND UPPER(TRIM(a.raw_value)) = UPPER(TRIM($1::varchar))
            AND a.season_year IS NULL
        )
        `,
        [raw.toUpperCase(), brandId, `Global brand → ${raw}`],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM legacy_value_aliases
      WHERE season_year IS NULL
        AND kind IN ('variety', 'brand')
        AND notes LIKE 'Global %'
        AND raw_value IN (
          'BEAUTY','FARTHING','GA DAWN','KEE CRISP','LEGACY','PATRACIA','POP','REBEL','SAN JOAQUIN','SENTINEL',
          'ALPINE FRESH - HEB','CONSALO'
        )
    `);
  }
}
