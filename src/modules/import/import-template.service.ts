import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityMetadata } from 'typeorm';
import { Brand, Client, ReturnableContainer } from '../traceability/operational.entities';
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
    if (key === 'dispatches') {
      return this.dispatchHistoricalTemplateColumns();
    }
    const meta = this.ds.getMetadata(ENTITY_BY_KEY[key]);
    return this.columnsFromMetadata(meta);
  }

  /** Columnas del import histórico de despachos (`importDispatchHistoricalRow`), no el esquema ORM de `Dispatch`. */
  private dispatchHistoricalTemplateColumns(): TemplateColumn[] {
    return [
      { propertyName: 'order_reference', dbType: 'varchar', isNullable: false },
      { propertyName: 'fecha_despacho', dbType: 'timestamptz', isNullable: false },
      { propertyName: 'numero_bol', dbType: 'varchar', isNullable: false },
      { propertyName: 'total_cajas', dbType: 'int', isNullable: false },
      { propertyName: 'total_amount', dbType: 'decimal', isNullable: false },
      { propertyName: 'cliente_nombre', dbType: 'varchar', isNullable: true },
      { propertyName: 'thermograph_serial', dbType: 'varchar', isNullable: true },
      { propertyName: 'thermograph', dbType: 'varchar', isNullable: true },
      { propertyName: 'temperatura_f', dbType: 'decimal', isNullable: true },
    ];
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

    const descRow = [
      ...cols.map((c) => this.describeColumnMeta(c, key)),
      ...extra.map((e) => e.desc),
    ];
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
          desc:
            '# int|string | requerido(no) | línea: id numérico del bloque «envases retornables», o el tipo (ej. BIN); opcional columna container_codigo con el mismo valor',
          ex1: 'BIN',
          ex2: '1',
        },
        {
          name: 'container_codigo',
          desc: '# string | opcional | alias de returnable_container_id; se busca por tipo y capacidad del catálogo',
          ex1: 'BIN',
          ex2: '',
        },
        { name: 'quantity', desc: '# int | requerido(no) | línea recepción: cantidad envases', ex1: '120', ex2: '80' },
        {
          name: 'gross_lb',
          desc: '# decimal | opcional línea | bruto lb; si vacío se acepta gross_weight_lb de la misma fila',
          ex1: '1250',
          ex2: '830',
        },
        { name: 'tare_lb', desc: '# decimal | opcional línea | tara lb', ex1: '50', ex2: '30' },
        {
          name: 'net_lb',
          desc: '# decimal | requerido(no) | neto lb línea; alias net_weight_lb (misma fila, columnas de encabezado)',
          ex1: '1200',
          ex2: '800',
        },
        { name: 'temperature_f', desc: '# decimal | requerido(no) | línea recepción: temperatura', ex1: '34', ex2: '33' },
        {
          name: 'format_code',
          desc: '# string | opcional | línea: código de formato presentación (catálogo formatos)',
          ex1: '12x18oz',
          ex2: '8x18oz',
        },
        {
          name: 'multivariety_note',
          desc: '# string | opcional | línea: nota multivarietal',
          ex1: '',
          ex2: 'mezcla GD/POP',
        },
      ];
    }
    if (key === 'processes') {
      return [
        {
          name: 'import_action',
          desc: '# string | vacío=alta; borrar|delete|eliminar + process_id (o id) para borrar el proceso (solo borrador, sin PT/pallet/factura/repalet)',
          ex1: '',
          ex2: 'borrar',
        },
        {
          name: 'process_id',
          desc:
            '# int | alta: opcional — fija fruit_processes.id y el mismo valor en csv_process_ref (el CSV de PT puede usar process_id=ese nº + fecha para enlazar). Borrar: import_action=borrar + este id. Alias: fruit_process_id, id, proceso_id, nro_proceso, proceso_numero',
          ex1: '90001',
          ex2: '1',
        },
        {
          name: 'auto_process_id',
          desc:
            '# 1|si|ordinal | alta sin process_id: asigna id 1,2,3… según el orden de filas de alta en este CSV y el mismo nº en csv_process_ref (cruce PT por nº+h día). Rellená la misma columna en todas las filas; combinable con process_id explícito en algunas filas',
          ex1: '',
          ex2: '1',
        },
        {
          name: 'reception_reference',
          desc:
            '# string | opcional si ya indicás recepcion_id o reception_line_id | reference_code o document_number, varias con |',
          ex1: 'PB-20260427-001',
          ex2: 'PB-20260427-001|PB-20260427-002',
        },
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
        {
          name: 'fecha_despacho',
          desc: '# fecha | opcional encabezado | alias legado; también acepta columna fecha_despacho_cliente',
          ex1: '2024-08-15',
          ex2: '',
        },
        {
          name: 'estado',
          desc: '# string | opcional encabezado | alias legado; también acepta columna estado_comercial',
          ex1: 'confirmado',
          ex2: '',
        },
      ];
    }
    if (key === 'pt-tags') {
      return [
        {
          name: 'import_action',
          desc: '# string | vacío=alta; borrar|delete|eliminar + tarja_id (id numérico) o tag_code para eliminar la unidad PT',
          ex1: '',
          ex2: 'borrar',
        },
        {
          name: 'process_id',
          desc:
            '# int | opcional | id real fruit_processes (748…) o ordinal 1,2,3: si no existe id, enésimo borrador del mismo día (primero UTC, si no alcanza mismo día en AR). Orden por id. Alias: id_process_origen, fruit_process_id',
          ex1: '1',
          ex2: '748',
        },
        {
          name: 'process_id_strict',
          desc:
            '# si|true | opcional | solo si escribís si/true/yes: no usar ordinal por día; exige PK real. No pongas el número de proceso (1,2…) acá — dejá vacío para permitir ordinal',
          ex1: '',
          ex2: 'si',
        },
        {
          name: 'cajas_generadas',
          desc: '# int | opcional con process_id | cajas a vincular; si vacío se usa total_cajas o el tope por lb del proceso',
          ex1: '100',
          ex2: '320',
        },
        {
          name: 'pallet_id_origen',
          desc: '# string | opcional | si hay valor: modo histórico PT (columnas históricas de esta fila)',
          ex1: '',
          ex2: 'PALLET-7781',
        },
        {
          name: 'fecha_proceso',
          desc: '# ISO8601 | modo histórico | fecha del proceso asociado',
          ex1: '',
          ex2: '2024-07-12T10:00:00.000Z',
        },
        { name: 'boxes', desc: '# int | modo histórico | cajas en la tarja', ex1: '', ex2: '560' },
        { name: 'net_lb', desc: '# decimal | modo histórico | peso neto lb', ex1: '', ex2: '2464.000' },
        {
          name: 'format_codigo',
          desc: '# string | modo histórico | código formato (debe existir en catálogo)',
          ex1: '',
          ex2: '12x4.4oz',
        },
        {
          name: 'producer_codigo',
          desc: '# int|string | modo histórico | productor id/código si no usás id_process_origen',
          ex1: '',
          ex2: 'PB',
        },
        {
          name: 'id_process_origen',
          desc: '# int | opcional histórico o alta normal | id fruit_process (alias de process_id si no usás esa columna)',
          ex1: '',
          ex2: '42',
        },
        {
          name: 'process_nota',
          desc:
            '# string | opcional alta normal (sin process_id) | nota exacta del fruit_process (columna nota del CSV de procesos); una sola coincidencia',
          ex1: '',
          ex2: 'IMP-PT-042',
        },
        { name: 'bol_referencia', desc: '# string | opcional histórico | prefijo BOL', ex1: '', ex2: 'BOL-7788' },
        {
          name: 'fruit_type',
          desc: '# string | opcional histórico | machine→cajas, otro→IQF',
          ex1: '',
          ex2: 'machine',
        },
        {
          name: 'client_nombre',
          desc: '# string | opcional histórico | nombre cliente (marca por heurística)',
          ex1: '',
          ex2: 'ALPINE FOODS',
        },
      ];
    }
    return [];
  }

  private describeColumnMeta(c: TemplateColumn, entityKey: ImportEntityKey): string {
    const req = c.isNullable ? 'no' : 'si';
    const typInfo = c.enumValues?.length ? `enum(${c.enumValues.join('|')})` : c.dbType;
    const hint =
      entityKey === 'pt-tags'
        ? (this.ptTagColumnHint(c.propertyName) ?? this.shortHint(c.propertyName))
        : this.shortHint(c.propertyName);
    return `# ${typInfo} | requerido(${req}) | ${hint}`;
  }

  /** Descripciones fila 2 de la plantilla CSV solo para columnas ORM de `pt-tags` (evita texto de despacho histórico). */
  private ptTagColumnHint(prop: string): string | null {
    const m: Record<string, string> = {
      tag_code: 'vacío = el servidor asigna código único; si informás valor no puede repetirse',
      fecha: 'fecha/hora de la unidad PT (ISO 8601, ej. 2026-12-05T15:00:00.000Z)',
      resultado: 'IQF|cajas|jugo|perdido|otro; pack máquina/cajas suele ser «cajas»',
      format_code: 'código presentación catálogo (ej. 12x18oz)',
      cajas_por_pallet: 'cajas por pallet físico (≥1). Ej.: 100 cajas en un solo pallet → 100',
      total_cajas:
        'sin process_id en fila: totales de la tarja. con process_id: opcional; si cajas_generadas va vacío se usa como cajas a vincular',
      total_pallets:
        'sin process_id: pallets totales de la tarja. con process_id: se ignora en el alta; totales se recalculan desde ítems vinculados',
      client_id: 'cliente id/código/nombre resoluble (opcional)',
      brand_id: 'marca id/código (opcional)',
      bol: 'BOL o referencia comercial (opcional)',
      net_weight_lb: 'lb netas totales aprox. de la tarja (opcional)',
    };
    return m[prop] ?? null;
  }

  private shortHint(prop: string): string {
    const hints: Record<string, string> = {
      received_at: 'fecha/hora recepción (ISO 8601)',
      gross_weight_lb: 'peso bruto encabezado; en líneas también sirve como gross_lb si gross_lb vacío',
      net_weight_lb: 'peso neto encabezado; en líneas también sirve como net_lb si net_lb vacío',
      producer_id: 'FK productores.id',
      variety_id: 'FK varieties.id',
      document_number: 'documento / guía (opcional); cruce en CSV de procesos',
      reference_code:
        'referencia compartida (ej JDS410, > opcional); puede repetirse entre recepciones; vacío=auto [productor][mesdía]; lote = ref+R{id}+Línea',
      document_state_id: 'FK document_states.id (sin líneas: usar borrador)',
      reception_type_id: 'FK reception_types.id',
      fecha_despacho_cliente: 'fecha despacho cliente; el import también lee columna fecha_despacho',
      estado_comercial: 'estado comercial texto; el import también lee columna estado',
      order_reference: 'pedido/despacho histórico: número de pedido (order_number)',
      total_cajas: 'despacho histórico: total cajas del BOL',
      total_amount: 'despacho histórico: monto total facturado',
      reception_reference:
        'proceso: recepciones por reference_code o document_number, varias con |; si un código cae en varias recepciones, el import usa la de menor receptions.id (nota en el proceso)',
      format_codigo: 'PT histórico: código formato (catálogo)',
      mercado_id: 'FK mercados.id opcional',
      recepcion_id:
        'receptions.id, o document_number, o reference_code; si el mismo reference_code está en varias recepciones (ej. mano/máquina), el import usa la de menor receptions.id y deja nota para revisar líneas en UI',
      productor_id: 'FK productores.id',
      variedad_id: 'FK varieties.id',
      peso_procesado_lb: 'lb ingresadas al proceso (texto decimal)',
      resultado: 'IQF|cajas|jugo|perdido|otro',
      reception_line_id: 'FK reception_lines.id — una línea por fila de import',
      process_id:
        'PT: id real o ordinal 1..500 por día; 1..50000: cruce por csv_process_ref+nº y día. Procesos CSV: process_id guarda también csv_process_ref; auto_process_id=1 asigna id 1,2,3… por orden de fila',
      cajas_generadas: 'Unidad PT: cajas al vincular con process_id; si falta = máximo permitido por lb',
      id_process_origen: 'PT histórico: proceso; en alta normal alias opcional de process_id',
      tag_code: 'código único de unidad PT',
      format_code: 'formato presentación (ej. 12x4.4oz)',
      cliente_id: 'FK clients.id (pedidos/despachos)',
      orden_id: 'FK sales_orders.id',
      presentation_format_id: 'FK presentation_formats.id',
      requested_boxes: 'pedidos: en fila con formato, cajas del renglón; encabezado puede llevar total',
      species_id: 'FK species.id',
      quality_grade_id: 'FK quality_grades.id',
      returnable_container_id:
        'línea recepción: id del catálogo «envases retornables», o texto tipo/capacidad; alias columna container_codigo',
      container_codigo: 'mismo criterio que returnable_container_id (el import une ambas columnas)',
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
        reference_code: ['>JDS410', ''],
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
        tag_code: ['', 'TAR-240002'],
        fecha: ['2026-12-05T12:00:00.000Z', '2024-07-13T09:00:00.000Z'],
        resultado: ['cajas', 'IQF'],
        format_code: ['12x18oz', '8x4.4oz'],
        cajas_por_pallet: ['100', '60'],
        total_cajas: ['100', '480'],
        total_pallets: ['1', '8'],
        client_id: ['', 'FRESHWAVE'],
        brand_id: ['', 'BRAND01'],
        bol: ['', 'BOL-7789'],
        net_weight_lb: ['', '2112.000'],
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
        requested_boxes: ['960', '500'],
        fecha_despacho_cliente: ['2024-08-15T00:00:00.000Z', ''],
        estado_comercial: ['confirmado', ''],
      },
      dispatches: {
        order_reference: ['SO-HIST-001', 'SO-HIST-002'],
        fecha_despacho: ['2024-08-01T08:00:00.000Z', '2024-08-02T09:00:00.000Z'],
        numero_bol: ['BOL-D-240801', 'BOL-D-240802'],
        total_cajas: ['560', '480'],
        total_amount: ['12500.00', '9800.00'],
        cliente_nombre: ['ALPINE', 'FRESHWAVE'],
        thermograph_serial: ['TH-001', 'TH-002'],
        thermograph: ['TH-001', 'TH-002'],
        temperatura_f: ['32.00', '31.00'],
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
    const [producers, species, varieties, formats, returnableContainers, clients, brands] = await Promise.all([
      this.ds.getRepository(Producer).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(Species).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(Variety).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(PresentationFormat).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(ReturnableContainer).find({
        where: { activo: true },
        take: lim,
        order: { tipo: 'ASC', id: 'ASC' },
      }),
      this.ds.getRepository(Client).find({ take: lim, order: { id: 'ASC' } }),
      this.ds.getRepository(Brand).find({ take: lim, order: { id: 'ASC' } }),
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
      '# envases retornables (columnas returnable_container_id o container_codigo): id' +
        delim +
        'tipo' +
        delim +
        'capacidad',
      '# En el CSV podés poner el id numérico, o el tipo (y si hace falta capacidad) tal como aparece acá.',
      ...returnableContainers.map((r) =>
        `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.tipo, delim)}${delim}${escapeCsvCell(r.capacidad ?? '', delim)}`,
      ),
      '#',
      '# clientes: id' + delim + 'nombre',
      ...clients.map((r) => `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.nombre, delim)}`),
      '#',
      '# marcas: id' + delim + 'codigo' + delim + 'nombre',
      ...brands.map((r) =>
        `# ${escapeCsvCell(String(r.id), delim)}${delim}${escapeCsvCell(r.codigo ?? '', delim)}${delim}${escapeCsvCell(r.nombre, delim)}`,
      ),
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
