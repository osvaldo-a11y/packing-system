import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShipToDispatch1780100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE dispatches
        ADD COLUMN IF NOT EXISTS ship_to_name    VARCHAR(120) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS ship_to_address TEXT         DEFAULT NULL;
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE dispatches
        DROP COLUMN IF EXISTS ship_to_name,
        DROP COLUMN IF EXISTS ship_to_address;
    `);
  }
}
