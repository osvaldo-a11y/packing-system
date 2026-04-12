import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Comprueba referencias antes de desactivar un maestro (baja lógica).
 * Mensajes orientados a operadores.
 */
@Injectable()
export class MasterUsageService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async cnt(sql: string, params: unknown[]): Promise<number> {
    const r = await this.ds.query(sql, params);
    return Number(r[0]?.c ?? 0);
  }

  private async assertNoRefs(
    checks: { sql: string; params: unknown[]; label: string }[],
    entityLabel: string,
  ): Promise<void> {
    const parts: string[] = [];
    for (const { sql, params, label } of checks) {
      const n = await this.cnt(sql, params);
      if (n > 0) parts.push(`${n} ${label}`);
    }
    if (parts.length) {
      throw new BadRequestException(
        `No se puede desactivar ${entityLabel}: está en uso (${parts.join('; ')}).`,
      );
    }
  }

  async assertCanDeactivateMercado(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        { sql: `SELECT COUNT(*)::int AS c FROM clients WHERE mercado_id = $1`, params: [id], label: 'cliente(s)' },
        { sql: `SELECT COUNT(*)::int AS c FROM receptions WHERE mercado_id = $1`, params: [id], label: 'recepción(es)' },
      ],
      'este mercado',
    );
  }

  async assertCanDeactivateMaterialCategory(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM packaging_materials WHERE material_category_id = $1`,
          params: [id],
          label: 'material(es) de empaque',
        },
      ],
      'esta categoría',
    );
  }

  async assertCanDeactivateReceptionType(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM receptions WHERE reception_type_id = $1`,
          params: [id],
          label: 'recepción(es)',
        },
      ],
      'este tipo de recepción',
    );
  }

  async assertCanDeactivateDocumentState(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM receptions WHERE document_state_id = $1`,
          params: [id],
          label: 'recepción(es)',
        },
      ],
      'este estado de documento',
    );
  }

  async assertCanDeactivateSpecies(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM reception_lines WHERE species_id = $1`,
          params: [id],
          label: 'línea(s) de recepción',
        },
        {
          sql: `SELECT COUNT(*)::int AS c FROM fruit_processes fp
            INNER JOIN varieties v ON v.id = fp.variedad_id
            WHERE v.species_id = $1 AND fp.deleted_at IS NULL`,
          params: [id],
          label: 'proceso(s) de fruta (vía variedad)',
        },
      ],
      'esta especie',
    );
  }

  async assertCanDeactivateProducer(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        { sql: `SELECT COUNT(*)::int AS c FROM receptions WHERE producer_id = $1`, params: [id], label: 'recepción(es)' },
        {
          sql: `SELECT COUNT(*)::int AS c FROM fruit_processes WHERE productor_id = $1 AND deleted_at IS NULL`,
          params: [id],
          label: 'proceso(s) de fruta',
        },
      ],
      'este productor',
    );
  }

  async assertCanDeactivateVariety(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        { sql: `SELECT COUNT(*)::int AS c FROM receptions WHERE variety_id = $1`, params: [id], label: 'recepción(es)' },
        {
          sql: `SELECT COUNT(*)::int AS c FROM reception_lines WHERE variety_id = $1`,
          params: [id],
          label: 'línea(s) de recepción',
        },
        {
          sql: `SELECT COUNT(*)::int AS c FROM fruit_processes WHERE variedad_id = $1 AND deleted_at IS NULL`,
          params: [id],
          label: 'proceso(s) de fruta',
        },
      ],
      'esta variedad',
    );
  }

  async assertCanDeactivateQualityGrade(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM reception_lines WHERE quality_grade_id = $1`,
          params: [id],
          label: 'línea(s) de recepción',
        },
      ],
      'esta calidad',
    );
  }

  async assertCanDeactivatePresentationFormat(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM packaging_materials WHERE presentation_format_id = $1`,
          params: [id],
          label: 'material(es) de empaque',
        },
        {
          sql: `SELECT COUNT(*)::int AS c FROM final_pallets WHERE presentation_format_id = $1`,
          params: [id],
          label: 'pallet(s) final(es)',
        },
      ],
      'este formato',
    );
  }

  async assertCanDeactivateClient(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        { sql: `SELECT COUNT(*)::int AS c FROM brands WHERE client_id = $1`, params: [id], label: 'marca(s)' },
        { sql: `SELECT COUNT(*)::int AS c FROM dispatches WHERE client_id = $1`, params: [id], label: 'despacho(s)' },
        { sql: `SELECT COUNT(*)::int AS c FROM pt_tags WHERE client_id = $1`, params: [id], label: 'unidad(es) PT' },
        {
          sql: `SELECT COUNT(*)::int AS c FROM final_pallets WHERE client_id = $1`,
          params: [id],
          label: 'pallet(s) final(es)',
        },
        {
          sql: `SELECT COUNT(*)::int AS c FROM finished_pt_stock WHERE client_id = $1`,
          params: [id],
          label: 'registro(s) de stock PT',
        },
      ],
      'este cliente',
    );
  }

  async assertCanDeactivateBrand(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        { sql: `SELECT COUNT(*)::int AS c FROM pt_tags WHERE brand_id = $1`, params: [id], label: 'unidad(es) PT' },
        {
          sql: `SELECT COUNT(*)::int AS c FROM final_pallets WHERE brand_id = $1`,
          params: [id],
          label: 'pallet(s) final(es)',
        },
        {
          sql: `SELECT COUNT(*)::int AS c FROM finished_pt_stock WHERE brand_id = $1`,
          params: [id],
          label: 'registro(s) de stock PT',
        },
      ],
      'esta marca',
    );
  }

  async assertCanDeactivateProcessMachine(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM fruit_processes WHERE process_machine_id = $1 AND deleted_at IS NULL`,
          params: [id],
          label: 'proceso(s) de fruta',
        },
      ],
      'esta línea / máquina',
    );
  }

  async assertCanDeactivateProcessResultComponent(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM fruit_process_component_values WHERE component_id = $1`,
          params: [id],
          label: 'valor(es) en proceso(s)',
        },
        {
          sql: `SELECT COUNT(*)::int AS c FROM species_process_result_components WHERE component_id = $1`,
          params: [id],
          label: 'enlace(s) especie–componente',
        },
      ],
      'este componente de resultado',
    );
  }

  async assertCanDeactivatePackingSupplier(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM packing_material_suppliers WHERE supplier_id = $1`,
          params: [id],
          label: 'vínculo(s) material–proveedor',
        },
      ],
      'este proveedor',
    );
  }

  async assertCanDeactivateReturnableContainer(id: number): Promise<void> {
    await this.assertNoRefs(
      [
        {
          sql: `SELECT COUNT(*)::int AS c FROM reception_lines WHERE returnable_container_id = $1`,
          params: [id],
          label: 'línea(s) de recepción',
        },
      ],
      'este envase',
    );
  }
}
