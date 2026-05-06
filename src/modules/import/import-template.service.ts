import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityMetadata } from 'typeorm';
import { Client } from '../traceability/operational.entities';
import { PresentationFormat, Producer, Species, Variety } from '../traceability/traceability.entities';
import { Dispatch, SalesOrder } from '../dispatch/dispatch.entities';
import { FinalPallet } from '../final-pallet/final-pallet.entities';
import { FruitProcess, PtTag } from '../process/process.entities';
import { Reception } from '../traceability/traceability.entities';
import { escapeCsvCell } from './import-csv.util';

export type ImportEntityKey =
  | 'receptions'
  | 'processes'
  | 'pt-tags'
  | 'final-pallets'
  | 'sales-orders'
  | 'dispatches';

const ENTITY_BY_KEY: Record<ImportEntityKey, Function> = {
  receptions: Reception,
  processes: FruitProcess,
  'pt-tags': PtTag,
  'final-pallets': FinalPallet,
  'sales-orders': SalesOrder,
  dispatches: Dispatch,
};

const SKIP_PROPS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'created_at',
  'updated_at',
  'deleted_at',
]);

export interface TemplateColumn {
  propertyName: string;
  dbType: string;
  isNullable: boolean;
  enumValues?: string[];
}

@Injectable()
export class ImportTemplateService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  resolveEntity(key: ImportEntityKey): Function {
    return ENTITY_BY_KEY[key];
  }

  listColumns(key: ImportEntityKey): TemplateColumn[] {
    const meta = this.ds.getMetadata(ENTITY_BY_KEY[key]);
    return this.columnsFromMetadata(meta);
  }

  private columnsFromMetadata(meta: EntityMetadata): TemplateColumn[] {
    const out: TemplateColumn[] = [];
    for (const col of meta.columns) {
      const prop = col.propertyName;
      if (SKIP_PROPS.has(prop)) continue;
      if (col.isGenerated && col.isPrimary) continue;

      let enumValues: string[] | undefined;
      const en = col.enum as unknown;
      if (Array.isArray(en)) {
        enumValues = en.map(String);
      } else if (en && typeof en === 'object') {
        enumValues = Object.values(en as Record<string, string>).map(String);
      }

      const dbType =
        col.type instanceof Function ? (col.type as Function).name : String(col.type ?? 'unknown');

      out.push({
        propertyName: prop,
        dbType,
        isNullable: Boolean(col.isNullable),
        enumValues,
      });
    }
    return out;
  }

  async buildTemplateCsv(key: ImportEntityKey): Promise<{ filename: string; body: string }> {
    const delim: ',' | ';' = ',';
    const cols = this.listColumns(key);
    const extra = this.extraTemplateColumns(key);
    const headers = [...cols.map((c) => c.propertyName), ...extra.map((e) => e.name)];

    const descRow = [...cols.map((c) => this.describeColumnMeta(c)), ...extra.map((e) => e.desc)];
    const ex1 = [...cols.map((c) => this.exampleValue(key, c, 1)), ...extra.map((e) => e.ex1)];
    const ex2 = [...cols.map((c) => this.exampleValue(key, c, 2)), ...extra.map((e) => e.ex2)];

    const lines: string[][] = [headers, descRow, ex1, ex2];
    const catalog = await this.buildCatalogLines(delim);
    const csvLines = [...lines, ...catalog.map((r) => [r])].map((row) =>
      row.map((cell) => escapeCsvCell(cell, delim)).join(delim),
    );

    const body = csvLines.join('\n') + '\n';
    const filename = `plantilla-${key}.csv`;
    return { filename, body };
  }

  getImportHeaders(key: ImportEntityKey): string[] {
    const cols = this.listColumns(key);
    const extra = this.extraTemplateColumns(key);
    return [...cols.map((c) => c.propertyName), ...extra.map((e) => e.name)];
  }

  private extraTemplateColumns(key: ImportEntityKey): Array<{ name: string; desc: string; ex1: string; ex2: string }> {
    if (key === 'receptions') {
      return [
        {
          name: 'reception_reference',
          desc: '# string | requerido(no) | clave de agrupación para encabezado y líneas',
          ex1: 'PB-20260427-001',
          ex2: 'PB-20260427-002',
        },
        { name: 'species_id', desc: '# int|string | requerido(no) | línea recepción: especie id/código', ex1: 'ARA', ex2: 'ARA' },
        {
          name: 'line_variety_id',
          desc: '# int|string | línea recepción: variedad id/código (evita colisión con variety_id del encabezado)',
          ex1: 'GD',
          ex2: 'POP',
        },
        { name: 'quality_grade_id', desc: '# int|string | requerido(no) | línea recepción: calidad id/código', ex1: 'FRESH_BERRIES', ex2: 'IQF_A' },
        {
          name: 'returnable_container_id',
          desc: '# int|string | requerido(no) | línea recepción: envase id/tipo',
          ex1: 'BIN',
          ex2: 'BIN',
        },
        { name: 'quantity', desc: '# int | requerido(no) | línea recepción: cantidad envases', ex1: '120', ex2: '80' },
        { name: 'gross_lb', desc: '# decimal | requerido(no) | línea recepción: bruto lb', ex1: '1250', ex2: '830' },
        { name: 'tare_lb', desc: '# decimal | requerido(no) | línea recepción: tara lb', ex1: '50', ex2: '30' },
        { name: 'net_lb', desc: '# decimal | requerido(no) | línea recepción: neto lb', ex1: '1200', ex2: '800' },
        { name: 'temperature_f', desc: '# decimal | requerido(no) | línea recepción: temperatura', ex1: '34', ex2: '33' },
      ];
    }
    if (key === 'sales-orders') {
      return [
        {
          name: 'order_reference',
          desc: '# string | requerido(no) | clave agrupación pedido + líneas',
          ex1: 'SO-20260427-001',
          ex2: 'SO-20260427-002',
        },
        {
          name: 'presentation_format_id',
          desc: '# int|string | requerido(no) | línea pedido: formato id/format_code',
          ex1: '12x18oz',
          ex2: '8x18oz',
        },
        { name: 'unit_price', desc: '# decimal | requerido(no) | línea pedido: precio por caja', ex1: '18.75', ex2: '19.2' },
        { name: 'brand_id', desc: '# int|string | requerido(no) | línea pedido: marca id/código', ex1: 'BRAND01', ex2: '' },
        { name: 'variety_id', desc: '# int|string | requerido(no) | línea pedido: variedad id/código', ex1: 'GD', ex2: 'FAR' },
      ];
    }
    return [];
  }

  private describeColumnMeta(c: TemplateColumn): string {
    const req = c.isNullable ? 'no' : 'si';
    const typInfo = c.enumValues?.length ? `enum(${c.enumValues.join('|')})` : c.dbType;
    const hint = this.shortHint(c.propertyName);
    return `# ${typInfo} | requerido(${req}) | ${hint}`;
  }

  private shortHint(prop: string): string {
    const hints: Record<string, string> = {
      received_at: 'fecha/hora recepción (ISO 8601)',
      producer_id: 'FK productores.id',
      variety_id: 'FK varieties.id',
      document_state_id: 'FK document_states.id (sin líneas: usar borrador)',
      reception_type_id: 'FK reception_types.id',
      mercado_id: 'FK mercados.id opcional',
      recepcion_id: 'FK receptions.id',
      productor_id: 'FK productores.id',
      variedad_id: 'FK varieties.id',
      peso_procesado_lb: 'lb ingresadas al proceso (texto decimal)',
      resultado: 'IQF|cajas|jugo|perdido|otro',
      reception_line_id: 'FK reception_lines.id — una línea por fila de import',
      tag_code: 'código único de unidad PT',
      format_code: 'formato presentación (ej. 12x4.4oz)',
      cliente_id: 'FK clients.id (pedidos/despachos)',
      orden_id: 'FK sales_orders.id',
      presentation_format_id: 'FK presentation_formats.id',
      species_id: 'FK species.id',
      quality_grade_id: 'FK quality_grades.id',
      brand_id: 'FK brands.id',
      client_id: 'FK clients.id',
      tarja_id: 'FK pt_tags.id',
      dispatch_id: 'FK dispatches.id',
      pt_packing_list_id: 'FK pt_packing_lists.id',
      planned_sales_order_id: 'FK sales_orders.id',
    };
    return hints[prop] ?? `campo ${prop}`;
  }

  private exampleValue(key: ImportEntityKey, c: TemplateColumn, variant: 1 | 2): string {
    const v = variant === 1;
    if (c.enumValues?.length) {
      return v ? c.enumValues[0] : c.enumValues[Math.min(1, c.enumValues.length - 1)];
    }
    const p = c.propertyName;
    const samples: Record<ImportEntityKey, Record<string, [string, string]>> = {
      receptions: {
        received_at: ['2024-07-10T15:00:00.000Z', '2024-07-11T16:30:00.000Z'],
        document_number: ['GR-240710-01', 'GR-240711-02'],
        producer_id: ['PB', 'JDS'],
        variety_id: ['GD', 'FAR'],
        gross_weight_lb: ['22000.50', '18500.00'],
        net_weight_lb: ['21800.25', '18350.75'],
        notes: ['Lote histórico IQF', 'Segunda carga'],
        reference_code: ['', ''],
        plant_code: ['PL1', 'PL1'],
        mercado_id: ['USA', 'USA'],
        lbs_reference: ['22000', '18500'],
        lbs_difference: ['0', '-25'],
        document_state_id: ['borrador', 'borrador'],
        reception_type_id: ['hand_picking', 'hand_picking'],
        weight_basis: ['net_lb', 'net_lb'],
        quality_intent: ['exportacion', 'proceso'],
      },
      processes: {
        recepcion_id: ['10', '11'],
        fecha_proceso: ['2024-07-12T10:00:00.000Z', '2024-07-13T11:00:00.000Z'],
        productor_id: ['PB', 'JDS'],
        variedad_id: ['GD', 'FAR'],
        peso_procesado_lb: ['5000.00', '3200.50'],
        merma_lb: ['120.00', '80.00'],
        porcentaje_procesado: ['0.0000', '0.0000'],
        resultado: ['IQF', 'cajas'],
        tarja_id: ['', ''],
        reception_line_id: ['101', '102'],
        process_machine_id: ['1', ''],
        temperatura_f: ['32.00', '31.50'],
        nota: ['Proceso histórico', ''],
        lb_entrada: ['5000.000', '3200.500'],
        lb_iqf: ['', ''],
        lb_sobrante: ['', ''],
        lb_packout: ['', ''],
        lb_producto_terminado: ['', ''],
        lb_desecho: ['', ''],
        lb_jugo: ['', ''],
        lb_merma_balance: ['', ''],
        balance_closed: ['false', 'false'],
        process_status: ['borrador', 'borrador'],
      },
      'pt-tags': {
        tag_code: ['TAR-240001', 'TAR-240002'],
        fecha: ['2024-07-12T12:00:00.000Z', '2024-07-13T09:00:00.000Z'],
        resultado: ['IQF', 'IQF'],
        format_code: ['12x4.4oz', '8x4.4oz'],
        cajas_por_pallet: ['56', '60'],
        total_cajas: ['560', '480'],
        total_pallets: ['10', '8'],
        client_id: ['ALPINE', 'FRESHWAVE'],
        brand_id: ['', 'BRAND01'],
        bol: ['BOL-7788', 'BOL-7789'],
        net_weight_lb: ['2464.000', '2112.000'],
      },
      'final-pallets': {
        status: ['borrador', 'definitivo'],
        species_id: ['ARA', 'ARA'],
        quality_grade_id: ['FRESH_BERRIES', 'IQF_A'],
        corner_board_code: ['', ''],
        clamshell_label: ['BLUE ARÁNDANO', 'BLUE ARÁNDANO'],
        brand_id: ['BRAND01', 'BRAND01'],
        dispatch_unit: ['18x500g', '12x4.4oz'],
        packing_type: ['IQF', 'IQF'],
        market: ['USA', 'USA'],
        bol: ['BOL-7790', ''],
        planned_sales_order_id: ['', ''],
        client_id: ['ALPINE', 'ALPINE'],
        fruit_quality_mode: ['proceso', 'proceso'],
        presentation_format_id: ['12x18oz', '8x18oz'],
        dispatch_id: ['', ''],
        pt_packing_list_id: ['', ''],
        tarja_id: ['50', '51'],
      },
      'sales-orders': {
        order_number: ['SO-HIST-001', 'SO-HIST-002'],
        cliente_id: ['ALPINE', 'FRESHWAVE'],
        requested_pallets: ['20', '15'],
        requested_boxes: ['', ''],
      },
      dispatches: {
        orden_id: ['1', '2'],
        cliente_id: ['ALPINE', 'FRESHWAVE'],
        fecha_despacho: ['2024-08-01T08:00:00.000Z', '2024-08-02T09:00:00.000Z'],
        numero_bol: ['BOL-D-240801', 'BOL-D-240802'],
        bol_origin: ['manual_entry', 'manual_entry'],
        temperatura_f: ['32.00', '31.00'],
        thermograph_serial: ['TH-001', 'TH-002'],
        thermograph_notes: ['', ''],
        final_pallet_unit_prices: ['', ''],
        client_id: ['ALPINE', 'ALPINE'],
        status: ['borrador', 'borrador'],
        dispatch_confirmed_at: ['', ''],
        dispatch_despachado_at: ['', ''],
      },
    };

    const perKey = samples[key];
    if (perKey && perKey[p]) {
      return v ? perKey[p][0] : perKey[p][1];
    }

    if (/.*_id$/.test(p)) return v ? '1' : '2';
    if (dbTypeIsBool(c.dbType)) return v ? 'false' : 'true';
    if (dbTypeIsNumeric(c.dbType)) return v ? '0' : '1';
    return v ? 'ejemplo' : 'ejemplo2';
  }

  private async buildCatalogLines(delim: ',' | ';'): Promise<string[]> {
    const lim = 250;
    const [producers, species, varieties, formats, clients] = await Promise.all([
      this.ds.getRepository(Producer).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(Species).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(Variety).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(PresentationFormat).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(Client).find({ take: lim, order: { id: 'ASC' } }),
    ]);

    const lines: string[] = [
      '#',
      '# Los datos a importar deben ir ANTES de esta sección (no agregar filas debajo del bloque Catálogos).',
      '# --- Catálogos (instantánea al generar esta plantilla; usar ids en el CSV) ---',
      '# productores: id' + delim + 'codigo' + delim + 'nombre',
      ...producers.map((r) =>
        `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.codigo ?? '', delim)}${delim}${escapeCsvCell(r.nombre, delim)}`,
      ),
      '#',
      '# especies: id' + delim + 'codigo' + delim + 'nombre',
      ...species.map((r) =>
        `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.codigo, delim)}${delim}${escapeCsvCell(r.nombre, delim)}`,
      ),
      '#',
      '# variedades: id' + delim + 'species_id' + delim + 'codigo' + delim + 'nombre',
      ...varieties.map((r) =>
        `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(String(r.species_id), delim)}${delim}${escapeCsvCell(r.codigo ?? '', delim)}${delim}${escapeCsvCell(r.nombre, delim)}`,
      ),
      '#',
      '# formatos presentación: id' + delim + 'format_code' + delim + 'descripcion',
      ...formats.map((r) =>
        `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.format_code, delim)}${delim}${escapeCsvCell(r.descripcion ?? '', delim)}`,
      ),
      '#',
      '# clientes: id' + delim + 'nombre',
      ...clients.map((r) => `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.nombre, delim)}`),
      '#',
      '# Fin catálogos',
    ];
    return lines;
  }
}

function dbTypeIsBool(t: string): boolean {
  const u = t.toLowerCase();
  return u === 'boolean' || u === 'bool';
}

function dbTypeIsNumeric(t: string): boolean {
  const u = t.toLowerCase();
  return u.includes('int') || u.includes('decimal') || u.includes('float') || u.includes('double');
}
