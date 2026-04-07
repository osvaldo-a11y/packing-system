"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPackagingModule1712500001000 = void 0;
class AddPackagingModule1712500001000 {
    constructor() {
        this.name = 'AddPackagingModule1712500001000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE material_category AS ENUM ('clamshell','caja','etiqueta','tape','corner_board','otro')`);
        await queryRunner.query(`
      CREATE TABLE packaging_materials (
        id BIGSERIAL PRIMARY KEY,
        nombre_material VARCHAR(80) NOT NULL,
        categoria material_category NOT NULL,
        descripcion TEXT NULL,
        unidad_medida VARCHAR(20) NOT NULL,
        costo_unitario NUMERIC(12,4) NOT NULL,
        cantidad_disponible NUMERIC(14,3) NOT NULL DEFAULT 0,
        activo BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);
        await queryRunner.query(`
      CREATE TABLE packaging_recipes (
        id BIGSERIAL PRIMARY KEY,
        format_code VARCHAR(20) NOT NULL UNIQUE,
        descripcion TEXT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);
        await queryRunner.query(`
      CREATE TABLE packaging_recipe_items (
        id BIGSERIAL PRIMARY KEY,
        recipe_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        qty_per_unit NUMERIC(14,4) NOT NULL,
        base_unidad VARCHAR(20) NOT NULL,
        CONSTRAINT uq_pri_recipe_material UNIQUE (recipe_id, material_id)
      )
    `);
        await queryRunner.query(`
      CREATE TABLE packaging_pallet_consumptions (
        id BIGSERIAL PRIMARY KEY,
        tarja_id BIGINT NOT NULL,
        dispatch_tag_item_id BIGINT NULL,
        recipe_id BIGINT NOT NULL,
        pallet_count INT NOT NULL DEFAULT 1,
        boxes_count INT NOT NULL DEFAULT 0,
        tape_linear_meters NUMERIC(12,3) NOT NULL DEFAULT 0,
        corner_boards_qty INT NOT NULL DEFAULT 0,
        labels_qty INT NOT NULL DEFAULT 0,
        material_cost_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE TABLE packaging_cost_breakdowns (
        id BIGSERIAL PRIMARY KEY,
        consumption_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        qty_used NUMERIC(14,4) NOT NULL,
        unit_cost NUMERIC(12,4) NOT NULL,
        line_total NUMERIC(14,2) NOT NULL
      )
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS packaging_cost_breakdowns`);
        await queryRunner.query(`DROP TABLE IF EXISTS packaging_pallet_consumptions`);
        await queryRunner.query(`DROP TABLE IF EXISTS packaging_recipe_items`);
        await queryRunner.query(`DROP TABLE IF EXISTS packaging_recipes`);
        await queryRunner.query(`DROP TABLE IF EXISTS packaging_materials`);
        await queryRunner.query(`DROP TYPE IF EXISTS material_category`);
    }
}
exports.AddPackagingModule1712500001000 = AddPackagingModule1712500001000;
//# sourceMappingURL=1712500001000-AddPackagingModule.js.map