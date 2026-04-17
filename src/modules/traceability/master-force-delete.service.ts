import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

type MasterResource =
  | 'quality-grades'
  | 'species'
  | 'producers'
  | 'varieties'
  | 'presentation-formats'
  | 'process-machines'
  | 'process-result-components'
  | 'clients'
  | 'brands'
  | 'packing-suppliers'
  | 'returnable-containers'
  | 'mercados'
  | 'material-categories'
  | 'reception-types'
  | 'document-states';

const RESOURCE_TABLE: Record<MasterResource, string> = {
  'quality-grades': 'quality_grades',
  species: 'species',
  producers: 'producers',
  varieties: 'varieties',
  'presentation-formats': 'presentation_formats',
  'process-machines': 'process_machines',
  'process-result-components': 'process_result_components',
  clients: 'clients',
  brands: 'brands',
  'packing-suppliers': 'packing_suppliers',
  'returnable-containers': 'returnable_containers',
  mercados: 'mercados',
  'material-categories': 'material_categories',
  'reception-types': 'reception_types',
  'document-states': 'document_states',
};

@Injectable()
export class MasterForceDeleteService {
  constructor(private readonly dataSource: DataSource) {}

  private quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  private async tableHasIdColumn(em: EntityManager, tableName: string): Promise<boolean> {
    const rows = (await em.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = 'id'
      LIMIT 1
      `,
      [tableName],
    )) as { '?column?': number }[];
    return rows.length > 0;
  }

  private async referencingFks(em: EntityManager, tableName: string): Promise<{ child_table: string; child_column: string }[]> {
    return (await em.query(
      `
      SELECT tc.table_name AS child_table, kcu.column_name AS child_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = $1
        AND ccu.column_name = 'id'
      `,
      [tableName],
    )) as { child_table: string; child_column: string }[];
  }

  private async forceDeleteRecursive(
    em: EntityManager,
    tableName: string,
    id: number,
    visited: Set<string>,
  ): Promise<void> {
    const visitKey = `${tableName}:${id}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const refs = await this.referencingFks(em, tableName);
    for (const ref of refs) {
      const childTable = ref.child_table;
      const childColumn = ref.child_column;
      const hasId = await this.tableHasIdColumn(em, childTable);
      if (hasId) {
        const childRows = (await em.query(
          `SELECT id FROM ${this.quoteIdentifier(childTable)} WHERE ${this.quoteIdentifier(childColumn)} = $1`,
          [id],
        )) as { id: number }[];
        for (const child of childRows) {
          await this.forceDeleteRecursive(em, childTable, Number(child.id), visited);
        }
      } else {
        await em.query(
          `DELETE FROM ${this.quoteIdentifier(childTable)} WHERE ${this.quoteIdentifier(childColumn)} = $1`,
          [id],
        );
      }
    }

    await em.query(`DELETE FROM ${this.quoteIdentifier(tableName)} WHERE id = $1`, [id]);
  }

  async forceDeleteByResource(resourceRaw: string, id: number) {
    const resource = String(resourceRaw).trim() as MasterResource;
    const tableName = RESOURCE_TABLE[resource];
    if (!tableName) {
      throw new BadRequestException(`Recurso no soportado para force delete: ${resourceRaw}`);
    }

    const existsRows = (await this.dataSource.query(
      `SELECT id FROM ${this.quoteIdentifier(tableName)} WHERE id = $1 LIMIT 1`,
      [id],
    )) as { id: number }[];
    if (!existsRows.length) {
      throw new NotFoundException('Registro no encontrado');
    }

    await this.dataSource.transaction(async (em) => {
      await this.forceDeleteRecursive(em, tableName, id, new Set<string>());
    });

    return { ok: true, forced: true };
  }
}

