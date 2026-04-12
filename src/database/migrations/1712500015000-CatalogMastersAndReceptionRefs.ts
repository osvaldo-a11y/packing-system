import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mercados, categorías de material, tipos de recepción, estados de documento.
 * Clientes: país + mercado; materiales: FK categoría; recepciones: FK estado/tipo/mercado.
 */
export class CatalogMastersAndReceptionRefs1712500015000 implements MigrationInterface {
  name = 'CatalogMastersAndReceptionRefs1712500015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mercados (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO mercados (codigo, nombre) VALUES
      ('USA', 'USA'),
      ('EU', 'Europa'),
      ('ASIA', 'Asia'),
      ('LOCAL', 'Local')
    `);

    await queryRunner.query(`
      CREATE TABLE material_categories (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO material_categories (codigo, nombre) VALUES
      ('clamshell', 'Clamshell'),
      ('caja', 'Caja'),
      ('bolsa', 'Bolsa'),
      ('etiqueta', 'Etiqueta'),
      ('tape', 'Tape'),
      ('corner_board', 'Corner board'),
      ('otro', 'Otro')
    `);

    await queryRunner.query(`
      CREATE TABLE reception_types (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO reception_types (codigo, nombre) VALUES
      ('hand_picking', 'Mano'),
      ('machine_picking', 'Máquina'),
      ('mixto', 'Mixto')
    `);

    await queryRunner.query(`
      CREATE TABLE document_states (
        id BIGSERIAL PRIMARY KEY,
        codigo VARCHAR(40) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO document_states (codigo, nombre) VALUES
      ('borrador', 'Borrador'),
      ('confirmado', 'Confirmado'),
      ('cerrado', 'Cerrado'),
      ('anulado', 'Anulado')
    `);

    await queryRunner.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS pais VARCHAR(120) NULL`);
    await queryRunner.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS mercado_id BIGINT NULL REFERENCES mercados(id)
    `);

    await queryRunner.query(`
      ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS material_category_id BIGINT NULL
        REFERENCES material_categories(id)
    `);
    await queryRunner.query(`
      UPDATE packaging_materials m
      SET material_category_id = c.id
      FROM material_categories c
      WHERE m.categoria::text = c.codigo
    `);
    await queryRunner.query(`
      ALTER TABLE packaging_materials ALTER COLUMN material_category_id SET NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE packaging_materials DROP COLUMN categoria`);
    await queryRunner.query(`DROP TYPE IF EXISTS material_category`);

    await queryRunner.query(`
      ALTER TABLE receptions ADD COLUMN IF NOT EXISTS document_state_id BIGINT NULL REFERENCES document_states(id)
    `);
    await queryRunner.query(`
      ALTER TABLE receptions ADD COLUMN IF NOT EXISTS reception_type_id BIGINT NULL REFERENCES reception_types(id)
    `);
    await queryRunner.query(`
      ALTER TABLE receptions ADD COLUMN IF NOT EXISTS mercado_id BIGINT NULL REFERENCES mercados(id)
    `);

    await queryRunner.query(`
      UPDATE receptions r
      SET document_state_id = ds.id
      FROM document_states ds
      WHERE r.document_state_id IS NULL
        AND ds.codigo = CASE
          WHEN r.reception_status IN ('borrador', 'confirmado', 'cerrado', 'anulado') THEN r.reception_status
          ELSE 'borrador'
        END
    `);
    await queryRunner.query(`
      UPDATE receptions r
      SET reception_type_id = rt.id
      FROM reception_types rt
      WHERE r.reception_type_id IS NULL
        AND rt.codigo = CASE
          WHEN r.harvest_type = 'machine_picking' THEN 'machine_picking'
          WHEN r.harvest_type = 'mixto' THEN 'mixto'
          ELSE 'hand_picking'
        END
    `);
    await queryRunner.query(`
      UPDATE receptions SET mercado_id = (SELECT id FROM mercados WHERE codigo = 'USA' LIMIT 1)
      WHERE mercado_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE receptions ALTER COLUMN document_state_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE receptions ALTER COLUMN reception_type_id SET NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS reception_status`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS harvest_type`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS marketer_code`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS fruit_pick_type`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE receptions ADD COLUMN IF NOT EXISTS reception_status VARCHAR(20) NOT NULL DEFAULT 'borrador'
    `);
    await queryRunner.query(`
      ALTER TABLE receptions ADD COLUMN IF NOT EXISTS harvest_type VARCHAR(24) NOT NULL DEFAULT 'hand_picking'
    `);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS marketer_code VARCHAR(64) NULL`);
    await queryRunner.query(`ALTER TABLE receptions ADD COLUMN IF NOT EXISTS fruit_pick_type VARCHAR(64) NULL`);

    await queryRunner.query(`
      UPDATE receptions r
      SET reception_status = ds.codigo
      FROM document_states ds
      WHERE r.document_state_id = ds.id
    `);
    await queryRunner.query(`
      UPDATE receptions r
      SET harvest_type = rt.codigo
      FROM reception_types rt
      WHERE r.reception_type_id = rt.id
    `);

    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS mercado_id`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS reception_type_id`);
    await queryRunner.query(`ALTER TABLE receptions DROP COLUMN IF EXISTS document_state_id`);

    await queryRunner.query(`CREATE TYPE material_category AS ENUM (
      'clamshell', 'caja', 'bolsa', 'etiqueta', 'tape', 'corner_board', 'otro'
    )`);
    await queryRunner.query(`
      ALTER TABLE packaging_materials ADD COLUMN categoria material_category NOT NULL DEFAULT 'otro'
    `);
    await queryRunner.query(`
      UPDATE packaging_materials m
      SET categoria = c.codigo::material_category
      FROM material_categories c
      WHERE m.material_category_id = c.id
    `);
    await queryRunner.query(`ALTER TABLE packaging_materials DROP COLUMN material_category_id`);

    await queryRunner.query(`ALTER TABLE clients DROP COLUMN IF EXISTS mercado_id`);
    await queryRunner.query(`ALTER TABLE clients DROP COLUMN IF EXISTS pais`);

    await queryRunner.query(`DROP TABLE IF EXISTS document_states`);
    await queryRunner.query(`DROP TABLE IF EXISTS reception_types`);
    await queryRunner.query(`DROP TABLE IF EXISTS material_categories`);
    await queryRunner.query(`DROP TABLE IF EXISTS mercados`);
  }
}
