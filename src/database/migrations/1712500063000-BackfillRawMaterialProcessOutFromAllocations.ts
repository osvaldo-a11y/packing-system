import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Procesos importados con `fruit_process_line_allocations` pero sin `process_out` en kardex MP:
 * alinea movimientos para que el saldo coincida con recepción sin procesar.
 */
export class BackfillRawMaterialProcessOutFromAllocations1712500063000 implements MigrationInterface {
  name = 'BackfillRawMaterialProcessOutFromAllocations1712500063000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO raw_material_movements (
        reception_line_id,
        fruit_process_id,
        quantity_delta_lb,
        movement_kind,
        ref_type,
        ref_id,
        nota
      )
      SELECT
        a.reception_line_id,
        a.process_id,
        (-a.lb_allocated::numeric),
        'process_out',
        'fruit_process',
        a.process_id,
        'Backfill: asignación a proceso sin movimiento MP previo.'
      FROM fruit_process_line_allocations a
      WHERE NOT EXISTS (
        SELECT 1
        FROM raw_material_movements m
        WHERE m.reception_line_id = a.reception_line_id
          AND m.fruit_process_id = a.process_id
          AND m.movement_kind = 'process_out'
      )
    `);

    await queryRunner.query(`
      INSERT INTO raw_material_movements (
        reception_line_id,
        fruit_process_id,
        quantity_delta_lb,
        movement_kind,
        ref_type,
        ref_id,
        nota
      )
      SELECT
        rl.id,
        NULL,
        rl.net_lb::numeric,
        'reception_in',
        'reception',
        rl.reception_id,
        'Backfill: recepción confirmada/cerrada sin entrada en kardex MP.'
      FROM reception_lines rl
      INNER JOIN receptions r ON r.id = rl.reception_id
      INNER JOIN document_states ds ON ds.id = r.document_state_id
      WHERE ds.codigo IN ('confirmado', 'cerrado')
        AND rl.net_lb::numeric > 0
        AND NOT EXISTS (
          SELECT 1
          FROM raw_material_movements m
          WHERE m.reception_line_id = rl.id
            AND m.movement_kind = 'reception_in'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM raw_material_movements
      WHERE nota IN (
        'Backfill: asignación a proceso sin movimiento MP previo.',
        'Backfill: recepción confirmada/cerrada sin entrada en kardex MP.'
      )
    `);
  }
}
