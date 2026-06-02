import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaterialPriceTargetPerBox1780200000000 implements MigrationInterface {
  name = 'MaterialPriceTargetPerBox1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'material_price_targets'
            AND column_name = 'target_price_lb'
        ) THEN
          ALTER TABLE material_price_targets
          RENAME COLUMN target_price_lb TO target_price_per_box;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'material_price_targets'
            AND column_name = 'target_price_per_box'
        ) THEN
          ALTER TABLE material_price_targets
          RENAME COLUMN target_price_per_box TO target_price_lb;
        END IF;
      END $$;
    `);
  }
}
