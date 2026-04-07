"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlantSettings1712500003000 = void 0;
class PlantSettings1712500003000 {
    constructor() {
        this.name = 'PlantSettings1712500003000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plant_settings (
        id BIGSERIAL PRIMARY KEY,
        yield_tolerance_percent NUMERIC(8,4) NOT NULL DEFAULT 5,
        min_yield_percent NUMERIC(8,4) NOT NULL DEFAULT 70,
        max_merma_percent NUMERIC(8,4) NOT NULL DEFAULT 15,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      INSERT INTO plant_settings (yield_tolerance_percent, min_yield_percent, max_merma_percent)
      SELECT 5, 70, 15
      WHERE NOT EXISTS (SELECT 1 FROM plant_settings LIMIT 1)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS plant_settings`);
    }
}
exports.PlantSettings1712500003000 = PlantSettings1712500003000;
//# sourceMappingURL=1712500003000-PlantSettings.js.map