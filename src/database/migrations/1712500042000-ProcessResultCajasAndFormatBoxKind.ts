import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcessResultCajasAndFormatBoxKind1712500042000 implements MigrationInterface {
  name = 'ProcessResultCajasAndFormatBoxKind1712500042000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE process_result ADD VALUE 'cajas'`);
    await queryRunner.query(`ALTER TABLE presentation_formats ADD COLUMN box_kind VARCHAR(20) NULL`);
    await queryRunner.query(
      `ALTER TABLE presentation_formats ADD COLUMN clamshell_label_kind VARCHAR(20) NULL`,
    );
    await queryRunner.query(`ALTER TABLE pt_tags ALTER COLUMN cajas_por_pallet SET DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pt_tags ALTER COLUMN cajas_por_pallet SET DEFAULT 100`);
    await queryRunner.query(`ALTER TABLE presentation_formats DROP COLUMN IF EXISTS clamshell_label_kind`);
    await queryRunner.query(`ALTER TABLE presentation_formats DROP COLUMN IF EXISTS box_kind`);
  }
}
