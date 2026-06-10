import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2b — productores históricos 2023/2024, formato 2 POUND, alias globales
 * (productor/formato/marca/variedad) y temporadas legacy 2023/2024.
 */
export class LegacySeasonAliases2023_20241712500067000 implements MigrationInterface {
  name = 'LegacySeasonAliases2023_20241712500067000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const histProducers: Array<[string, string]> = [
      ['HIST-RIVERVIEW', 'RIVERVIEW PLANTATION'],
      ['HIST-JET', 'JET FARMS INC'],
      ['HIST-JIMMYWEBB', 'JIMMY WEBB'],
      ['HIST-LOSTCREEK', 'LOST CREEK FARMS'],
    ];
    for (const [codigo, nombre] of histProducers) {
      await queryRunner.query(
        `
        INSERT INTO producers (codigo, nombre, activo)
        SELECT $1::varchar, $2::varchar, false
        WHERE NOT EXISTS (
          SELECT 1 FROM producers p
          WHERE UPPER(TRIM(p.codigo)) = UPPER(TRIM($1::varchar))
             OR UPPER(TRIM(p.nombre)) = UPPER(TRIM($2::varchar))
        )
        `,
        [codigo, nombre],
      );
    }

    await queryRunner.query(`
      INSERT INTO presentation_formats (format_code, species_id, descripcion, activo, net_weight_lb_per_box)
      SELECT '2 POUND', 2, 'Bulk histórico 2 lb (legacy import)', true, 2.0
      WHERE NOT EXISTS (
        SELECT 1 FROM presentation_formats pf WHERE UPPER(TRIM(pf.format_code)) = '2 POUND'
      )
    `);

    const newBrands: Array<[string, string]> = [
      ['ALPINE', 'ALPINE'],
      ['FOREST', 'FOREST'],
      ['FRESHWAVE', 'FRESH WAVE'],
      ['TWINSRIVER', 'TWINS RIVER'],
    ];
    for (const [codigo, nombre] of newBrands) {
      await queryRunner.query(
        `
        INSERT INTO brands (codigo, nombre)
        SELECT $1::varchar, $2::varchar
        WHERE NOT EXISTS (
          SELECT 1 FROM brands b
          WHERE UPPER(TRIM(b.codigo)) = UPPER(TRIM($1::varchar))
             OR UPPER(TRIM(b.nombre)) = UPPER(TRIM($2::varchar))
        )
        `,
        [codigo, nombre],
      );
    }

    const newVarieties: Array<[string, string]> = [
      ['REBEL', 'Rebel'],
      ['SANJOAQUIN', 'San Joaquin'],
    ];
    for (const [codigo, nombre] of newVarieties) {
      await queryRunner.query(
        `
        INSERT INTO varieties (species_id, codigo, nombre, activo)
        SELECT 2, $1::varchar, $2::varchar, true
        WHERE NOT EXISTS (
          SELECT 1 FROM varieties v
          WHERE UPPER(TRIM(v.codigo)) = UPPER(TRIM($1::varchar))
             OR UPPER(TRIM(v.nombre)) = UPPER(TRIM($2::varchar))
        )
        `,
        [codigo, nombre],
      );
    }

    await this.seedGlobalProducerAliases(queryRunner);
    await this.seedGlobalFormatAliases(queryRunner);
    await this.seedGlobalBrandAliases(queryRunner);
    await this.seedGlobalVarietyAliases(queryRunner);

    await queryRunner.query(`
      INSERT INTO seasons (year, label, status, source, opened_at, notes)
      VALUES
        (2024, 'Temporada 2024 (legacy)', 'closing', 'legacy', NOW(), 'Fase 2b — carga comercial Final Charge'),
        (2023, 'Temporada 2023 (legacy)', 'closing', 'legacy', NOW(), 'Fase 2b — carga comercial Final Charge')
      ON CONFLICT (year) DO NOTHING
    `);
  }

  private async seedGlobalProducerAliases(queryRunner: QueryRunner): Promise<void> {
    const pairs: Array<[string, string]> = [
      ['PINEBLOOM FARM', 'PB'],
      ['JDS FARMS', 'JDS'],
      ['HIERS BERRY FARM', 'HBF'],
      ['K & K FARMS', 'KK'],
      ['RENTZ FARMS', 'RF'],
      ['JER', 'JER'],
      ['NUBBINTOWN FARMS', 'NF'],
      ['FAITH FARMS', 'HIST-FAITH'],
      ['JET FARMS INC', 'HIST-JET'],
      ['JIMMY WEBB', 'HIST-JIMMYWEBB'],
      ['LOST CREEK FARMS', 'HIST-LOSTCREEK'],
      ['RIVERVIEW PLANTATION', 'HIST-RIVERVIEW'],
    ];
    for (const [raw, codigo] of pairs) {
      await queryRunner.query(
        `
        INSERT INTO legacy_value_aliases (kind, raw_value, resolved_id, season_year, notes)
        SELECT 'producer', $1::varchar, p.id, NULL, $3::text
        FROM producers p
        WHERE UPPER(TRIM(p.codigo)) = UPPER(TRIM($2::varchar))
          AND NOT EXISTS (
            SELECT 1 FROM legacy_value_aliases a
            WHERE a.kind = 'producer'
              AND UPPER(TRIM(a.raw_value)) = UPPER(TRIM($1::varchar))
              AND a.season_year IS NULL
          )
        LIMIT 1
        `,
        [raw.toUpperCase(), codigo, `Global producer → codigo ${codigo}`],
      );
    }
  }

  private async seedGlobalFormatAliases(queryRunner: QueryRunner): Promise<void> {
    const formatMap: Array<[string, string]> = [
      ['12x18', '12x18oz'],
      ['8x18', '8x18oz'],
      ['9.8oz', '12x9.8oz'],
      ['6oz', '12x6oz'],
      ['6 OZ', '12x6oz'],
      ['Pint', 'PINT REGULAR'],
      ['PINT', 'PINT REGULAR'],
      ['PINT LOW PROFILE', 'PINT LOW PROFILE'],
      ['Bulk3.6 Kg', 'Bulk3.6 Kg'],
      ['2 pound', '2 POUND'],
      ['2 POUND', '2 POUND'],
    ];
    for (const [raw, resolved] of formatMap) {
      await queryRunner.query(
        `
        INSERT INTO legacy_value_aliases (kind, raw_value, resolved_code, season_year, notes)
        SELECT 'format', $1::varchar, $2::varchar, NULL, $3::text
        WHERE NOT EXISTS (
          SELECT 1 FROM legacy_value_aliases a
          WHERE a.kind = 'format'
            AND UPPER(TRIM(a.raw_value)) = UPPER(TRIM($1::varchar))
            AND a.season_year IS NULL
        )
        `,
        [raw.toUpperCase(), resolved, `Global format → ${resolved}`],
      );
    }
  }

  private async seedGlobalBrandAliases(queryRunner: QueryRunner): Promise<void> {
    /** raw Excel → brands.codigo candidato (orden de preferencia) */
    const brandMap: Array<[string, string[]]> = [
      ['ALPINE', ['ALPINE', 'ALP-FB']],
      ['ALPINE FRESH - HEB', ['ALP-HEB']],
      ['CONSALO', ['FW-CN']],
      ['FOREST', ['FOREST']],
      ['FRESH WAVE', ['FRESHWAVE']],
      ['PINEBLOOM', ['PINEBLOOM']],
      ['TWINS RIVER', ['TWINSRIVER']],
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

  private async seedGlobalVarietyAliases(queryRunner: QueryRunner): Promise<void> {
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

    await queryRunner.query(
      `
      INSERT INTO legacy_value_aliases (kind, raw_value, resolved_id, season_year, notes)
      SELECT 'variety', 'MULTIVARIETY', NULL, NULL, 'Marcador sin variedad única'
      WHERE NOT EXISTS (
        SELECT 1 FROM legacy_value_aliases a
        WHERE a.kind = 'variety'
          AND UPPER(TRIM(a.raw_value)) = 'MULTIVARIETY'
          AND a.season_year IS NULL
      )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM legacy_value_aliases
      WHERE season_year IS NULL
        AND notes LIKE 'Global %'
    `);
    await queryRunner.query(`
      DELETE FROM legacy_value_aliases
      WHERE season_year IS NULL AND raw_value = 'MULTIVARIETY'
    `);
    await queryRunner.query(`DELETE FROM seasons WHERE year IN (2023, 2024) AND source = 'legacy'`);
    await queryRunner.query(`DELETE FROM varieties WHERE codigo IN ('REBEL', 'SANJOAQUIN')`);
    await queryRunner.query(`DELETE FROM brands WHERE codigo IN ('ALPINE', 'FOREST', 'FRESHWAVE', 'TWINSRIVER')`);
    await queryRunner.query(`DELETE FROM presentation_formats WHERE UPPER(format_code) = '2 POUND'`);
    await queryRunner.query(`
      DELETE FROM producers
      WHERE codigo IN ('HIST-RIVERVIEW', 'HIST-JET', 'HIST-JIMMYWEBB', 'HIST-LOSTCREEK')
    `);
  }
}
