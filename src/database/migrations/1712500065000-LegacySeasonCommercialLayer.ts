import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 — capa comercial/alias histórica + temporada 2025 legacy.
 * Aditiva: no modifica tablas transaccionales ni lógica de cálculo 2026.
 */
export class LegacySeasonCommercialLayer1712500065000 implements MigrationInterface {
  name = 'LegacySeasonCommercialLayer1712500065000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legacy_value_aliases (
        id BIGSERIAL PRIMARY KEY,
        kind VARCHAR(20) NOT NULL,
        raw_value VARCHAR(200) NOT NULL,
        resolved_id BIGINT NULL,
        resolved_code VARCHAR(80) NULL,
        season_year INT NULL,
        notes TEXT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT legacy_value_aliases_kind_check
          CHECK (kind IN ('producer', 'format', 'brand', 'variety'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_alias_global
        ON legacy_value_aliases (kind, raw_value)
        WHERE season_year IS NULL AND active = TRUE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_alias_season
        ON legacy_value_aliases (kind, raw_value, season_year)
        WHERE season_year IS NOT NULL AND active = TRUE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS season_settlement_lines (
        id BIGSERIAL PRIMARY KEY,
        season_year INT NOT NULL,
        producer_id BIGINT NOT NULL REFERENCES producers(id),
        producer_raw VARCHAR(200) NOT NULL,
        brand_id BIGINT NULL REFERENCES brands(id),
        brand_raw VARCHAR(120) NULL,
        variety_id BIGINT NULL REFERENCES varieties(id),
        variety_raw VARCHAR(120) NULL,
        format_code VARCHAR(80) NOT NULL,
        format_raw VARCHAR(80) NOT NULL,
        ship_date DATE NOT NULL,
        pick_type VARCHAR(10) NULL,
        bol VARCHAR(120) NOT NULL,
        pallet_ref VARCHAR(120) NOT NULL DEFAULT '',
        customer_raw VARCHAR(200) NULL,
        market_raw VARCHAR(120) NULL,
        boxes INT NOT NULL,
        pounds NUMERIC(14,4) NOT NULL,
        unit_price NUMERIC(14,6) NULL,
        revenue NUMERIC(14,2) NOT NULL,
        grower_return NUMERIC(14,2) NOT NULL,
        pack_fee NUMERIC(14,2) NOT NULL,
        material_cost NUMERIC(14,2) NOT NULL,
        grade_raw VARCHAR(80) NULL,
        invoice_ref VARCHAR(120) NULL,
        notes TEXT NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'legacy_final_charge',
        row_hash VARCHAR(64) NOT NULL,
        excel_row_number INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT season_settlement_lines_pick_type_check
          CHECK (pick_type IS NULL OR pick_type IN ('hand', 'machine'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_season_settlement_line_hash
        ON season_settlement_lines (season_year, row_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ssl_season_year ON season_settlement_lines (season_year)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ssl_season_producer ON season_settlement_lines (season_year, producer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ssl_season_format ON season_settlement_lines (season_year, format_code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ssl_season_bol ON season_settlement_lines (season_year, bol)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS season_mass_balance (
        id BIGSERIAL PRIMARY KEY,
        season_year INT NOT NULL,
        producer_id BIGINT NOT NULL REFERENCES producers(id),
        producer_name VARCHAR(200) NOT NULL,
        receptions INT NOT NULL DEFAULT 0,
        lb_received NUMERIC(14,3) NOT NULL DEFAULT 0,
        processes INT NOT NULL DEFAULT 0,
        lb_processed NUMERIC(14,3) NOT NULL DEFAULT 0,
        lb_packout NUMERIC(14,3) NOT NULL DEFAULT 0,
        lb_waste NUMERIC(14,3) NOT NULL DEFAULT 0,
        pct_packout NUMERIC(8,2) NOT NULL DEFAULT 0,
        lb_invoiced NUMERIC(14,3) NOT NULL DEFAULT 0,
        difference NUMERIC(14,3) NOT NULL DEFAULT 0,
        source VARCHAR(40) NOT NULL DEFAULT 'legacy_physical',
        loaded_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_season_mass_balance_producer UNIQUE (season_year, producer_id)
      )
    `);

    await queryRunner.query(`
      INSERT INTO seasons (year, label, status, source, opened_at, notes)
      VALUES (2025, 'Temporada 2025 (legacy)', 'closing', 'legacy', NOW(),
        'Fase 2 — carga comercial Final Charge histórico')
      ON CONFLICT (year) DO NOTHING
    `);

    /** Piloto 2025: solo FAITH FARMS histórico (2023 trae el resto). */
    await queryRunner.query(`
      INSERT INTO producers (codigo, nombre, activo)
      SELECT 'HIST-FAITH'::varchar, 'FAITH FARMS'::varchar, false
      WHERE NOT EXISTS (
        SELECT 1 FROM producers p
        WHERE UPPER(TRIM(p.codigo)) = 'HIST-FAITH'
           OR UPPER(TRIM(p.nombre)) = 'FAITH FARMS'
      )
    `);

    await queryRunner.query(`
      INSERT INTO presentation_formats (format_code, species_id, descripcion, activo, net_weight_lb_per_box)
      SELECT 'Bulk3.6 Kg', 2, 'Bulk histórico 3.6 Kg (legacy import)', true, 7.94
      WHERE NOT EXISTS (
        SELECT 1 FROM presentation_formats pf WHERE UPPER(TRIM(pf.format_code)) = 'BULK3.6 KG'
      )
    `);

    await this.seedProducerAliases(queryRunner);
    await this.seedFormatAliases(queryRunner);
  }

  private async seedProducerAliases(queryRunner: QueryRunner): Promise<void> {
    /** raw Excel (uppercase) → producers.codigo */
    const pairs: Array<[string, string]> = [
      ['PINEBLOOM FARM', 'PB'],
      ['JDS FARMS', 'JDS'],
      ['HIERS BERRY FARM', 'HBF'],
      ['K & K FARMS', 'KK'],
      ['RENTZ FARMS', 'RF'],
      ['JER', 'JER'],
      ['NUBBINTOWN FARMS', 'NF'],
      ['FAITH FARMS', 'HIST-FAITH'],
    ];

    for (const [raw, codigo] of pairs) {
      await queryRunner.query(
        `
        INSERT INTO legacy_value_aliases (kind, raw_value, resolved_id, season_year, notes)
        SELECT 'producer', $1::varchar, p.id, 2025, $3::text
        FROM producers p
        WHERE UPPER(TRIM(p.codigo)) = UPPER(TRIM($2::varchar))
          AND NOT EXISTS (
            SELECT 1 FROM legacy_value_aliases a
            WHERE a.kind = 'producer'
              AND UPPER(TRIM(a.raw_value)) = UPPER(TRIM($1::varchar))
              AND a.season_year = 2025
          )
        LIMIT 1
        `,
        [raw.toUpperCase(), codigo, `Final Charge 2025 → codigo ${codigo}`],
      );
    }
  }

  private async seedFormatAliases(queryRunner: QueryRunner): Promise<void> {
    /** raw Excel (uppercase) → resolved_code canónico */
    const formatMap: Array<[string, string]> = [
      ['12x18', '12x18oz'],
      ['8x18', '8x18oz'],
      ['9.8oz', '12x9.8oz'],
      ['6oz', '12x6oz'],
      ['Pint', 'PINT REGULAR'],
      ['PINT LOW PROFILE', 'PINT LOW PROFILE'],
      ['Bulk3.6 Kg', 'Bulk3.6 Kg'],
    ];

    for (const [raw, resolved] of formatMap) {
      await queryRunner.query(
        `
        INSERT INTO legacy_value_aliases (kind, raw_value, resolved_code, season_year, notes)
        SELECT 'format', $1::varchar, $2::varchar, 2025, $3::text
        WHERE NOT EXISTS (
          SELECT 1 FROM legacy_value_aliases a
          WHERE a.kind = 'format'
            AND UPPER(TRIM(a.raw_value)) = UPPER(TRIM($1::varchar))
            AND a.season_year = 2025
        )
        `,
        [raw.toUpperCase(), resolved, `Final Charge 2025 format → ${resolved}`],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS season_mass_balance`);
    await queryRunner.query(`DROP TABLE IF EXISTS season_settlement_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS legacy_value_aliases`);
    await queryRunner.query(`DELETE FROM seasons WHERE year = 2025 AND source = 'legacy'`);
  }
}
