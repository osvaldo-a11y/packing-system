"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitPackingModules1712500000000 = void 0;
class InitPackingModules1712500000000 {
    constructor() {
        this.name = 'InitPackingModules1712500000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE process_result AS ENUM ('IQF','jugo','perdido','otro')`);
        await queryRunner.query(`
      CREATE TABLE fruit_processes (
        id BIGSERIAL PRIMARY KEY,
        recepcion_id BIGINT NOT NULL,
        fecha_proceso TIMESTAMP NOT NULL,
        productor_id BIGINT NOT NULL,
        variedad_id BIGINT NOT NULL,
        peso_procesado_lb NUMERIC(12,2) NOT NULL,
        merma_lb NUMERIC(12,2) NOT NULL DEFAULT 0,
        porcentaje_procesado NUMERIC(8,4) NOT NULL,
        resultado process_result NOT NULL,
        tarja_id BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP NULL
      )
    `);
        await queryRunner.query(`
      CREATE TABLE pt_tags (
        id BIGSERIAL PRIMARY KEY,
        tag_code VARCHAR(64) NOT NULL UNIQUE,
        fecha TIMESTAMP NOT NULL,
        resultado process_result NOT NULL,
        format_code VARCHAR(20) NOT NULL,
        cajas_por_pallet INT NOT NULL DEFAULT 100,
        total_cajas INT NOT NULL DEFAULT 0,
        total_pallets INT NOT NULL DEFAULT 0
      )
    `);
        await queryRunner.query(`
      CREATE TABLE pt_tag_items (
        id BIGSERIAL PRIMARY KEY,
        tarja_id BIGINT NOT NULL,
        process_id BIGINT NOT NULL,
        productor_id BIGINT NOT NULL,
        cajas_generadas INT NOT NULL,
        pallets_generados INT NOT NULL,
        CONSTRAINT uq_pti_unique_process_per_tag UNIQUE (tarja_id, process_id)
      )
    `);
        await queryRunner.query(`
      CREATE TABLE sales_orders (
        id BIGSERIAL PRIMARY KEY,
        order_number VARCHAR(40) NOT NULL UNIQUE,
        cliente_id BIGINT NOT NULL
      )
    `);
        await queryRunner.query(`
      CREATE TABLE dispatches (
        id BIGSERIAL PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        cliente_id BIGINT NOT NULL,
        fecha_despacho TIMESTAMP NOT NULL,
        numero_bol VARCHAR(50) NOT NULL UNIQUE,
        temperatura_f NUMERIC(6,2) NOT NULL
      )
    `);
        await queryRunner.query(`
      CREATE TABLE dispatch_tag_items (
        id BIGSERIAL PRIMARY KEY,
        dispatch_id BIGINT NOT NULL,
        tarja_id BIGINT NOT NULL,
        cajas_despachadas INT NOT NULL,
        pallets_despachados INT NOT NULL,
        unit_price NUMERIC(12,4) NOT NULL,
        pallet_cost NUMERIC(12,4) NOT NULL,
        CONSTRAINT uq_dti_dispatch_tag UNIQUE (dispatch_id, tarja_id)
      )
    `);
        await queryRunner.query(`
      CREATE TABLE packing_lists (
        id BIGSERIAL PRIMARY KEY,
        dispatch_id BIGINT NOT NULL UNIQUE,
        packing_number VARCHAR(40) NOT NULL UNIQUE,
        printable_payload JSONB NULL
      )
    `);
        await queryRunner.query(`
      CREATE TABLE invoices (
        id BIGSERIAL PRIMARY KEY,
        dispatch_id BIGINT NOT NULL UNIQUE,
        invoice_number VARCHAR(40) NOT NULL UNIQUE,
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0
      )
    `);
        await queryRunner.query(`
      CREATE TABLE invoice_items (
        id BIGSERIAL PRIMARY KEY,
        invoice_id BIGINT NOT NULL,
        tarja_id BIGINT NOT NULL,
        cajas INT NOT NULL,
        unit_price NUMERIC(12,4) NOT NULL,
        line_subtotal NUMERIC(14,2) NOT NULL,
        pallet_cost_total NUMERIC(14,2) NOT NULL
      )
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS invoice_items`);
        await queryRunner.query(`DROP TABLE IF EXISTS invoices`);
        await queryRunner.query(`DROP TABLE IF EXISTS packing_lists`);
        await queryRunner.query(`DROP TABLE IF EXISTS dispatch_tag_items`);
        await queryRunner.query(`DROP TABLE IF EXISTS dispatches`);
        await queryRunner.query(`DROP TABLE IF EXISTS sales_orders`);
        await queryRunner.query(`DROP TABLE IF EXISTS pt_tag_items`);
        await queryRunner.query(`DROP TABLE IF EXISTS pt_tags`);
        await queryRunner.query(`DROP TABLE IF EXISTS fruit_processes`);
        await queryRunner.query(`DROP TYPE IF EXISTS process_result`);
    }
}
exports.InitPackingModules1712500000000 = InitPackingModules1712500000000;
//# sourceMappingURL=1712500000000-InitPackingModules.js.map