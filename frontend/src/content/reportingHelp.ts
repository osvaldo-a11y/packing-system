/**
 * Textos de ayuda para Reportes y la guía del sistema (solo UX; no cambia fórmulas).
 */

export type ReportHelpId =
  | 'cajas-pt'
  | 'cajas-despacho'
  | 'cajas-pt-detalle'
  | 'pallet-tarja'
  | 'rendimiento'
  | 'empaque-formato'
  | 'liquidacion-interna'
  | 'costo-formato-facturado'
  | 'ventas-despacho'
  | 'margen-cliente'
  | 'documentos'
  | 'fin-del-dia';

/** Una línea corta para badges “Fuente de verdad”. */
export const REPORT_SOURCE_TRUTH: Record<ReportHelpId, string> = {
  'cajas-pt': 'pt_tag_items + procesos (fecha_proceso en período)',
  'cajas-despacho': 'invoice_items en despachos facturados (fecha despacho en período)',
  'cajas-pt-detalle': 'pt_tag_items línea a línea (misma base que cajas PT agregado)',
  'pallet-tarja': 'ítems de despacho con costo de empaque por unidad PT',
  rendimiento: 'fruit_processes — rendimiento packout; merma = campos registrados en BD',
  'empaque-formato': 'consumos de empaque por formato (operativo)',
  'liquidacion-interna':
    'líneas de factura del período + trazabilidad (unidad PT → proceso → pallet / repallet → productor)',
  'costo-formato-facturado':
    'facturación del período + recetas de empaque + costo packing por especie (tabla o filtro manual)',
  'ventas-despacho': 'ventas y costos agregados por despacho en el período filtrado',
  'margen-cliente':
    'líneas de factura por cliente + prorrateo de costo por formato del período (sin reparto por productor)',
  documentos:
    'libro Excel/CSV/PDF operativo del período; PDF liquidación productor; factura/PL en Despachos',
  'fin-del-dia': 'pt_tags del día + despachos marcados despachados + existencias en cámara (fecha operativa)',
};

export type GlossaryEntry = {
  id: ReportHelpId;
  name: string;
  meaning: string;
  source: string;
  includes: string;
  excludes: string;
};

export function getReportGlossaryEntry(id: ReportHelpId, lang: 'es' | 'en' = 'es'): GlossaryEntry | undefined {
  return REPORT_GLOSSARY(lang).find((e) => e.id === id);
}

export function REPORT_GLOSSARY(lang: 'es' | 'en'): GlossaryEntry[] {
  if (lang === 'en') return EN_REPORT_GLOSSARY;
  return ES_REPORT_GLOSSARY;
}

const EN_REPORT_GLOSSARY: GlossaryEntry[] = [
  {
    id: 'fin-del-dia',
    name: 'End of day (Reports → Operations)',
    meaning: 'Daily operations summary by client and format: packed, cold-storage and dispatched.',
    source: 'PT units dated today, dispatches counted as sent that day, stock in warehouse.',
    includes: 'Copy report per client; daily planning KPIs and available RM in process.',
    excludes: 'Does not use settlement filters (close from/to dates); does not replace producer settlement.',
  },
  {
    id: 'cajas-pt',
    name: 'PT boxes by producer (PT units)',
    meaning: 'Boxes produced at plant per PT process lines, grouped by producer.',
    source: 'Operational level: pt_tag_items linked to processes with date in period.',
    includes: 'Only production in PT unit / process; consistent with PT stock generated at plant.',
    excludes: 'Does not include boxes that only passed through dispatch/invoice without that operational PT link.',
  },
  {
    id: 'cajas-despacho',
    name: 'Dispatched boxes by producer (invoicing)',
    meaning: 'Invoiced boxes in period dispatches, with producer resolved as in settlement.',
    source: 'Invoice lines in dispatches (commercial-logistics).',
    includes: 'Same producer resolution as settlement (PT unit, process, pallet, re-pallet when applicable).',
    excludes: 'Not «PT unit boxes» in production sense; may differ from production if commercial flow shifted dates or mixed origins.',
  },
  {
    id: 'cajas-pt-detalle',
    name: 'PT boxes detail by operation',
    meaning: 'Line-by-line view of pt_tag_items with process, PT unit and format.',
    source: 'pt_tag_items + process/PT unit metadata.',
    includes: 'Fine audit of operation vs aggregate by producer.',
    excludes: 'Does not replace invoicing report.',
  },
  {
    id: 'pallet-tarja',
    name: 'Average pallet cost per PT unit',
    meaning: 'Packaging cost associated with PT units in dispatch items.',
    source: 'Dispatch / load logistics.',
    includes: 'Logistics cost analysis per PT unit in dispatch.',
    excludes: 'Not recipe packaging cost nor financial settlement by producer.',
  },
  {
    id: 'rendimiento',
    name: 'Packout yield and recorded waste',
    meaning: 'Average yield over intake and waste explicitly recorded in system.',
    source: 'fruit_processes and waste fields in DB.',
    includes: 'Alerts per plant thresholds.',
    excludes: 'Does not calculate theoretical «residual waste» (intake − destinations) if not recorded.',
  },
  {
    id: 'empaque-formato',
    name: 'Packaging by format',
    meaning: 'Packaging material consumption per format code.',
    source: 'Operational packaging movements/consumptions.',
    includes: 'Material tracking by format.',
    excludes: 'Not invoiced monetary cost nor settlement.',
  },
  {
    id: 'liquidacion-interna',
    name: 'Settlement by producer (internal)',
    meaning: 'Boxes, lbs, sales and costs prorated by producer per period invoicing.',
    source: 'Invoice lines + traceability to producer.',
    includes:
      'Expandable summary by producer, dispatch/format detail (dispatch date, BOL), pre-export auditor; exports in global view.',
    excludes:
      'Producer delivery PDF and executive PDF are generated from Close → By producer or Documents; internal operational PDF is not settlement.',
  },
  {
    id: 'costo-formato-facturado',
    name: 'Cost by invoiced format',
    meaning: 'Material + packing cost per format per invoiced volume in period.',
    source: 'Period invoicing + recipes + packing rate per species or manual price in filters.',
    includes: 'Operational summary table and grouped breakdown by recipe in Close → Format analysis.',
    excludes: 'Not physical stock cost nor plant cost outside the invoiced period.',
  },
  {
    id: 'ventas-despacho',
    name: 'Sales by dispatch',
    meaning: 'Total sales and associated costs per dispatch for shipment analysis.',
    source: 'Aggregation per dispatch from period invoicing.',
    includes: 'Compare dispatches within the date range (dense table in Close).',
    excludes: 'Does not break down by producer (that is settlement).',
  },
  {
    id: 'margen-cliente',
    name: 'Client margin',
    meaning: 'Sales minus total costs per dispatch client, with optional format detail.',
    source: 'Invoice lines per client + same format costs as settlement (prorated by client boxes in format).',
    includes: 'Summary and detail by packaging_code in Close → Client analysis.',
    excludes: 'Does not split by producer; internal use, not a document for third parties.',
  },
  {
    id: 'documentos',
    name: 'Settlement (delivery) and documents',
    meaning:
      'Full report Excel workbook, operational PDFs for the period and settlement PDF; saved reports.',
    source: 'Same filters as «Refresh close» / Generate; dispatch PDFs in Dispatches module.',
    includes:
      'Export ALL (multi-sheet Excel from generate), CSV, internal PDF, summary PDF, producer settlement PDF (all or one producer if filter indicates), save/sync view.',
    excludes:
      'Does not include the 4-sheet settlement Excel (that is in Close → global). Operations does not use the settlement period.',
  },
];

const ES_REPORT_GLOSSARY: GlossaryEntry[] = [
  {
    id: 'fin-del-dia',
    name: 'Fin del día (Reportes → Operación)',
    meaning: 'Resumen del día operativo por cliente y formato: empacado, cámara y despachado.',
    source: 'Unidades PT con fecha del día, despachos que cuentan como enviados ese día, stock en depósito.',
    includes: 'Copiar informe por cliente; KPIs de planificación diaria y MP disponible en proceso.',
    excludes: 'No usa filtros de liquidación (fechas desde/hasta del cierre); no reemplaza liquidación por productor.',
  },
  {
    id: 'cajas-pt',
    name: 'Cajas PT por productor (unidades PT)',
    meaning: 'Cajas producidas en planta según líneas PT del proceso, agrupadas por productor.',
    source: 'Nivel operativo: pt_tag_items vinculadas a procesos con fecha en el período.',
    includes: 'Solo producción en unidad PT / proceso; coherente con existencia PT generada en planta.',
    excludes: 'No incluye cajas que solo pasaron por despacho/factura sin ese vínculo operativo en el criterio de agregado.',
  },
  {
    id: 'cajas-despacho',
    name: 'Cajas despachadas por productor (facturación)',
    meaning: 'Cajas facturadas en despachos del período, con productor resuelto como en liquidación.',
    source: 'Líneas de factura en despachos (logístico-comercial).',
    includes: 'Misma resolución de productor que liquidación (unidad PT, proceso, pallet, repalet cuando aplica).',
    excludes: 'No es “cajas PT en unidad” en sentido de producción; puede diferir de producción si el flujo comercial desfasó fechas o mezcló orígenes.',
  },
  {
    id: 'cajas-pt-detalle',
    name: 'Detalle cajas PT por operación',
    meaning: 'Vista línea a línea de pt_tag_items con proceso, unidad PT y formato.',
    source: 'pt_tag_items + metadatos de proceso/unidad PT.',
    includes: 'Auditoría fina de operación vs agregado por productor.',
    excludes: 'No sustituye al reporte de facturación.',
  },
  {
    id: 'pallet-tarja',
    name: 'Costo promedio pallet por unidad PT',
    meaning: 'Costo de empaque asociado a unidades PT en ítems de despacho.',
    source: 'Despacho / logística de carga.',
    includes: 'Análisis de costo logístico por unidad PT en despacho.',
    excludes: 'No es costo de receta de empaque ni liquidación financiera por productor.',
  },
  {
    id: 'rendimiento',
    name: 'Rendimiento packout y merma registrada',
    meaning: 'Rendimiento promedio sobre entrada y merma explícitamente cargada en sistema.',
    source: 'fruit_processes y campos de merma en BD.',
    includes: 'Alertas según umbrales de planta.',
    excludes: 'No calcula “merma residual” teórica (entrada − destinos) si no está cargada.',
  },
  {
    id: 'empaque-formato',
    name: 'Empaque por formato',
    meaning: 'Consumo de materiales de empaque por código de formato.',
    source: 'Movimientos/consumos operativos de empaque.',
    includes: 'Seguimiento de materiales por formato.',
    excludes: 'No es costo monetario facturado ni liquidación.',
  },
  {
    id: 'liquidacion-interna',
    name: 'Liquidación por productor (interna)',
    meaning: 'Cajas, lb, ventas y costos prorrateados por productor según facturación del período.',
    source: 'Líneas de factura + trazabilidad hasta productor.',
    includes:
      'Resumen expandible por productor, detalle por despacho/formato (fecha despacho, BOL), auditor previo a exportar; exportaciones en vista global.',
    excludes:
      'El PDF de entrega al productor y el PDF ejecutivo se generan desde Cierre → Por productor o Documentos; el PDF interno operativo no es liquidación.',
  },
  {
    id: 'costo-formato-facturado',
    name: 'Costo por formato facturado',
    meaning: 'Costo de materiales + packing por formato según volumen facturado en el período.',
    source: 'Facturación del período + recetas + tabla packing por especie o precio manual en filtros.',
    includes: 'Tabla resumen operativa y desglose agrupado por receta en Cierre → Análisis por formato.',
    excludes: 'No es costo de stock físico ni de planta fuera del período facturado.',
  },
  {
    id: 'ventas-despacho',
    name: 'Ventas por despacho',
    meaning: 'Totales de venta y costos asociados por despacho para análisis del envío.',
    source: 'Agregación por despacho desde facturación del período.',
    includes: 'Comparar despachos entre sí en el rango de fechas (tabla densa en Cierre).',
    excludes: 'No desglosa por productor (eso es liquidación).',
  },
  {
    id: 'margen-cliente',
    name: 'Margen por cliente',
    meaning: 'Ventas menos costos totales por cliente del despacho, con detalle opcional por formato.',
    source: 'Líneas de factura por cliente + mismos costos por formato que liquidación (prorrateo por cajas de cliente en formato).',
    includes: 'Resumen y detalle por packaging_code en Cierre → Análisis por cliente.',
    excludes: 'No reparte por productor; uso interno, no documento para terceros.',
  },
  {
    id: 'documentos',
    name: 'Liquidación (entrega) y documentos',
    meaning:
      'Libro Excel del reporte completo, PDFs operativos del período y PDF de liquidación; reportes guardados.',
    source: 'Mismos filtros que «Actualizar cierre» / Generar; PDFs de despacho en módulo Despachos.',
    includes:
      'Exportar TODO (Excel multi-hoja del generate), CSV, PDF interno, PDF resumen, PDF liquidación productor (todos o un productor si el filtro lo indica), guardar/sincronizar vista.',
    excludes:
      'No incluye el Excel de liquidación de 4 hojas (eso está en Cierre → global). Operación no usa el período de liquidación.',
  },
];


/** Mapa de navegación de la aplicación (menú lateral). */
export type AppNavItem = {
  label: string;
  path: string;
  purpose: string;
  notes?: string;
};

export type AppNavGroup = {
  id: string;
  label: string;
  items: AppNavItem[];
};

export function APP_NAV_GROUPS(lang: 'es' | 'en'): AppNavGroup[] {
  if (lang === 'en') return EN_APP_NAV_GROUPS;
  return ES_APP_NAV_GROUPS;
}

const EN_APP_NAV_GROUPS: AppNavGroup[] = [
  {
    id: 'principal',
    label: 'Main',
    items: [
      {
        label: 'Home',
        path: '/',
        purpose: 'Dashboard with daily/weekly KPIs, stock alerts, orders and quick access to critical modules.',
      },
    ],
  },
  {
    id: 'config',
    label: 'Configuration',
    items: [
      {
        label: 'Plant',
        path: '/plant',
        purpose: 'Yield and waste thresholds that feed alerts in process reports.',
        notes: 'Edit: admin role.',
      },
      {
        label: 'Masters',
        path: '/masters',
        purpose: 'Catalogs: producers, clients, species, varieties, presentation formats, qualities.',
        notes: 'Base for report filters, recipes and settlement traceability.',
      },
    ],
  },
  {
    id: 'packaging',
    label: 'Packaging',
    items: [
      {
        label: 'Materials',
        path: '/packaging/materials',
        purpose: 'Packaging materials catalog and available stock.',
      },
      {
        label: 'Kardex',
        path: '/packaging/kardex',
        purpose: 'Materials inflow/outflow movements.',
      },
      {
        label: 'Recipes',
        path: '/packaging/recipes',
        purpose: 'Consumption recipe per format; feeds material cost in Close.',
      },
      {
        label: 'Consumptions',
        path: '/packaging/consumptions',
        purpose: 'Operational record of consumption per format/process.',
        notes: 'Related to «Packaging by format» in Excel export (not settlement).',
      },
    ],
  },
  {
    id: 'operacion',
    label: 'Operations',
    items: [
      {
        label: 'Receptions',
        path: '/receptions',
        purpose: 'Fruit intake at plant; origin of subsequent processes.',
      },
      {
        label: 'Processes',
        path: '/processes',
        purpose: 'Transformation (packout, recorded waste, PT destinations); generates PT units.',
      },
      {
        label: 'PT Unit',
        path: '/pt-tags',
        purpose: 'Create and edit PT units (tarjas): boxes per format, client, process.',
        notes: 'Strong anchor for production and traceability to invoice.',
      },
      {
        label: 'PT Stock',
        path: '/existencias-pt/inventario',
        purpose: 'Inventory in cold storage, re-palletizing and PT packing lists before commercial dispatch.',
        notes: 'Sub-routes: inventory, re-palletize, packing-lists, detail by folio.',
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Commercial',
    items: [
      {
        label: 'Sales orders',
        path: '/sales-orders',
        purpose: 'Commercial orders: boxes ordered vs produced, reserved and dispatched.',
        notes: 'Progress per order at /sales-orders/:id/avance.',
      },
      {
        label: 'Dispatches',
        path: '/dispatches',
        purpose: 'Dispatch, invoice, commercial packing list; dispatch date defines the financial period.',
        notes: 'Invoice and packing list PDFs are generated here, not in Reports.',
      },
    ],
  },
  {
    id: 'analisis',
    label: 'Analytics',
    items: [
      {
        label: 'Reports',
        path: '/reporting',
        purpose: 'Four tabs: Operations, Decision, Close and Documents (see tab guide).',
      },
    ],
  },
  {
    id: 'sistema',
    label: 'System',
    items: [
      {
        label: 'System guide',
        path: '/guide/sistema',
        purpose: 'This document: data flow, modules and validation.',
      },
      {
        label: 'About',
        path: '/about',
        purpose: 'Application version and credits.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administration (admin only)',
    items: [
      {
        label: 'Bulk import',
        path: '/bulk-import',
        purpose: 'CSV import of receptions, processes, PT units, stock, orders and dispatches.',
        notes: 'Appears at the bottom of the side menu and in the mobile menu; downloadable template per entity.',
      },
    ],
  },
];

const ES_APP_NAV_GROUPS: AppNavGroup[] = [
  {
    id: 'principal',
    label: 'Principal',
    items: [
      {
        label: 'Inicio',
        path: '/',
        purpose: 'Panel con KPIs del día/semana, alertas de stock, pedidos y accesos rápidos a módulos críticos.',
      },
    ],
  },
  {
    id: 'config',
    label: 'Configuración',
    items: [
      {
        label: 'Planta',
        path: '/plant',
        purpose: 'Umbrales de rendimiento y merma que alimentan alertas en reportes de proceso.',
        notes: 'Edición: rol admin.',
      },
      {
        label: 'Mantenedores',
        path: '/masters',
        purpose: 'Catálogos: productores, clientes, especies, variedades, formatos de presentación, calidades.',
        notes: 'Base para filtros de reportes, recetas y trazabilidad en liquidación.',
      },
    ],
  },
  {
    id: 'packaging',
    label: 'Empaque',
    items: [
      {
        label: 'Materiales',
        path: '/packaging/materials',
        purpose: 'Catálogo de insumos de empaque y stock disponible.',
      },
      {
        label: 'Kardex',
        path: '/packaging/kardex',
        purpose: 'Movimientos de entrada/salida de materiales.',
      },
      {
        label: 'Recetas',
        path: '/packaging/recipes',
        purpose: 'Receta de consumo por formato; alimenta costo de materiales en Cierre.',
      },
      {
        label: 'Consumos',
        path: '/packaging/consumptions',
        purpose: 'Registro operativo de consumo por formato/proceso.',
        notes: 'Relacionado con «Empaque por formato» en export Excel (no es liquidación).',
      },
    ],
  },
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      {
        label: 'Recepciones',
        path: '/receptions',
        purpose: 'Ingreso de fruta a planta; origen de procesos posteriores.',
      },
      {
        label: 'Procesos',
        path: '/processes',
        purpose: 'Transformación (packout, merma registrada, destinos PT); genera unidades PT.',
      },
      {
        label: 'Unidad PT',
        path: '/pt-tags',
        purpose: 'Alta y edición de unidades PT (tarjas): cajas por formato, cliente, proceso.',
        notes: 'Ancla fuerte para producción y trazabilidad hacia factura.',
      },
      {
        label: 'Existencias PT',
        path: '/existencias-pt/inventario',
        purpose: 'Inventario en cámara, repaletizado y packing lists PT antes del despacho comercial.',
        notes: 'Subrutas: inventario, repaletizar, packing-lists, detalle por folio.',
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    items: [
      {
        label: 'Pedidos',
        path: '/sales-orders',
        purpose: 'Pedidos comerciales: cajas pedidas vs producidas, reservadas y despachadas.',
        notes: 'Avance por pedido en /sales-orders/:id/avance.',
      },
      {
        label: 'Despachos',
        path: '/dispatches',
        purpose: 'Despacho, factura, packing list comercial; fecha de despacho define el período financiero.',
        notes: 'PDF de factura y packing list se generan aquí, no en Reportes.',
      },
    ],
  },
  {
    id: 'analisis',
    label: 'Análisis',
    items: [
      {
        label: 'Reportes',
        path: '/reporting',
        purpose: 'Cuatro pestañas: Operación, Decisión, Cierre y Documentos (ver guía de pestañas).',
      },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      {
        label: 'Guía del sistema',
        path: '/guide/sistema',
        purpose: 'Este documento: flujo de datos, módulos y validación.',
      },
      {
        label: 'Acerca de',
        path: '/about',
        purpose: 'Versión y créditos de la aplicación.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administración (solo admin)',
    items: [
      {
        label: 'Carga masiva',
        path: '/bulk-import',
        purpose: 'Importación CSV de recepciones, procesos, unidades PT, existencias, pedidos y despachos.',
        notes: 'Aparece al final del menú lateral y en el menú móvil; plantilla descargable por entidad.',
      },
    ],
  },
];


/** Pestañas del módulo Reportes (estado actual de la UI). */
export type ReportingTabGuide = {
  id: 'operacion' | 'decision' | 'cierre' | 'documentos';
  label: string;
  answers: string;
  dateBasis: string;
  sections: string[];
  exports?: string;
};

export function REPORTING_TABS_GUIDE(lang: 'es' | 'en'): ReportingTabGuide[] {
  if (lang === 'en') return EN_REPORTING_TABS_GUIDE;
  return ES_REPORTING_TABS_GUIDE;
}

const EN_REPORTING_TABS_GUIDE: ReportingTabGuide[] = [
  {
    id: 'operacion',
    label: 'Operations',
    answers: 'What happened today at the plant and what was dispatched?',
    dateBasis: 'Current operative date (selector in end-of-day), not the close period from/to dates.',
    sections: [
      'End of day: table by client with packed, cold-storage and dispatched; copy report.',
      'Daily planning: packed/cold-storage/shipped KPIs and available RM in process.',
      'Suggested order: end of day first, then shift KPIs.',
    ],
    exports: 'Full Excel workbook for the settlement period: Documents tab (same filters as Close).',
  },
  {
    id: 'decision',
    label: 'Decision',
    answers: 'What is best to produce or offer with current RM and formats?',
    dateBasis: 'Commercial offer calculator and RM context; no financial close filters.',
    sections: [
      'Simulation / commercial offer (calculator block).',
      'Does not include settlement or financial period tables — that is in Close.',
    ],
    exports: 'Same as Operations: bulk exports in Documents.',
  },
  {
    id: 'cierre',
    label: 'Close',
    answers: 'How much did each producer earn and how did the period close?',
    dateBasis:
      'Settlement period: from/to date, pagination (up to 9,999 rows per page in API) and optional filters (producer, client, format, manual packing price). Export language: follows app language (es/en).',
    sections: [
      'Two-column config (desktop): packing rates (USD/lb, format surcharges, material adjustments) and period with «Refresh close».',
      'Close status + settlement auditor (packing, materials, traceability).',
      'View selector: Global settlement vs By producer (responsive; subtitles visible from sm).',
      'Global view: expandable final settlement, Exports block (Excel/CSV/PDF settlement for all), collapsible analysis by client/format/dispatch.',
      'By producer view: selector, export-ready status, producer PDF, executive PDF, producer Excel, «View in global» link.',
      'Technical diagnostic (admin only): traceability and backend debug JSON.',
    ],
    exports:
      'Global → Settlement Excel (4 sheets, all producers), detail CSV, settlement PDF. By producer → producer PDF, executive PDF, producer Excel. Full workbook and internal PDF → Documents tab.',
  },
  {
    id: 'documentos',
    label: 'Documents',
    answers: 'How do I export and save the period work?',
    dateBasis: 'Reflects the last «Refresh close» / generated in memory with active filters.',
    sections: [
      'Period view: PT vs dispatched KPIs, PT boxes sample, normalized technical dataset.',
      'Export ALL (generate Excel with translated settlement sheets), CSV, internal PDF, summary PDF, producer settlement PDF.',
      'Saved reports: load, rename (supervisor/admin), delete (admin).',
    ],
    exports:
      'Excel/CSV/PDF of full dataset; settlement PDF via same endpoint as Close (lang es/en). Invoice and commercial packing list in Dispatches.',
  },
];

const ES_REPORTING_TABS_GUIDE: ReportingTabGuide[] = [
  {
    id: 'operacion',
    label: 'Operación',
    answers: '¿Qué pasó hoy en planta y qué salió despachado?',
    dateBasis: 'Fecha operativa del día (selector en fin del día), no el período desde/hasta del cierre.',
    sections: [
      'Fin del día: tabla por cliente con empacado, cámara y despachado; copiar informe.',
      'Planificación diaria: KPIs packed / cámara / shipped y MP disponible en proceso.',
      'Orden sugerido: fin del día primero, luego KPIs del turno.',
    ],
    exports: 'Libro Excel completo del período de liquidación: pestaña Documentos (mismos filtros que Cierre).',
  },
  {
    id: 'decision',
    label: 'Decisión',
    answers: '¿Qué conviene producir u ofertar con el MP y formatos actuales?',
    dateBasis: 'Calculadora de oferta comercial y contexto de MP; sin filtros económicos del cierre.',
    sections: [
      'Simulación / oferta comercial (bloque de calculadora).',
      'No incluye liquidación ni tablas financieras del período — eso está en Cierre.',
    ],
    exports: 'Igual que Operación: exportaciones masivas en Documentos.',
  },
  {
    id: 'cierre',
    label: 'Cierre',
    answers: '¿Cuánto ganó cada productor y cómo cerró el período?',
    dateBasis:
      'Período de liquidación: fecha desde/hasta, paginación (hasta 9 999 filas por página en API) y filtros opcionales (productor, cliente, formato, precio packing manual). Idioma de exportes: según idioma de la app (es/en).',
    sections: [
      'Configuración en dos columnas (desktop): tarifas de packing (USD/lb, recargos por formato, ajustes de materiales) y período con «Actualizar cierre».',
      'Estado del cierre + auditor de liquidación (packing, materiales, trazabilidad).',
      'Selector de vista: Liquidación global vs Por productor (responsive; subtítulos visibles desde sm).',
      'Vista global: liquidación final expandible, exportaciones (Excel/CSV/PDF liquidación de todos), análisis por cliente/formato/despacho.',
      'Vista por productor: selector, estado de exportación, PDF productor, PDF ejecutivo, Excel productor, enlace «Ver en global».',
      'Diagnóstico técnico (solo admin): trazabilidad y JSON de depuración del backend.',
    ],
    exports:
      'Vista global → Excel liquidación (4 hojas, todos los productores), CSV detalle, PDF liquidación. Vista por productor → PDF productor, PDF ejecutivo, Excel productor. Libro completo y PDF interno → pestaña Documentos.',
  },
  {
    id: 'documentos',
    label: 'Documentos',
    answers: '¿Cómo exporto y guardo el trabajo del período?',
    dateBasis: 'Refleja el último «Actualizar cierre» / generado en memoria con los filtros activos.',
    sections: [
      'Vista del período: KPIs PT vs despachado, muestra de cajas PT, dataset técnico normalizado.',
      'Exportar TODO (Excel del generate con hojas de liquidación traducidas), CSV, PDF interno, PDF resumen, PDF liquidación productor.',
      'Reportes guardados: cargar, renombrar (supervisor/admin), eliminar (admin).',
    ],
    exports:
      'Excel/CSV/PDF operativo del dataset completo; PDF liquidación vía mismo endpoint que Cierre (`lang` es/en). Factura y packing list comercial en Despachos.',
  },
];


/** Pasos recomendados dentro del tab Cierre. */
export function CIERRE_WORKFLOW_STEPS(lang: 'es' | 'en'): { step: number; title: string; detail: string }[] {
  if (lang === 'en') return EN_CIERRE_WORKFLOW_STEPS;
  return ES_CIERRE_WORKFLOW_STEPS;
}

const EN_CIERRE_WORKFLOW_STEPS: { step: number; title: string; detail: string }[] = [
  {
    step: 1,
    title: 'Configure packing rates',
    detail:
      'In the «Packing rates» card, review USD/lb per species and season. If using manual price in filters, that value takes priority over the table.',
  },
  {
    step: 2,
    title: 'Set period and filters',
    detail:
      'From/to dates, page and limit in «Settlement period». Optional filters: producer, client, format, quality, manual packing price.',
  },
  {
    step: 3,
    title: 'Refresh close',
    detail: 'Click «Refresh close» to regenerate settlement, format costs and margins with those filters.',
  },
  {
    step: 4,
    title: 'Review auditor',
    detail:
      'The auditor summarizes packing, materials and traceability issues before exporting. Fix data in Dispatches / PT Unit / PT Stock according to the type of finding.',
  },
  {
    step: 5,
    title: 'Choose global or by-producer view',
    detail:
      'Global: totals, expandable table, collapsible analyses (client, format, dispatch) and Exports block. By producer: selector, producer PDF, executive PDF (management summary), producer Excel and filtered table.',
  },
  {
    step: 6,
    title: 'Export or save',
    detail:
      'Global → Settlement Excel (summary, sales by dispatch, costs, by format), detail CSV with TOTAL row, settlement PDF (all). By producer → producer and executive PDFs and Excel. Documents → full report Excel, internal/summary PDF. Save view: supervisor/admin.',
  },
];

const ES_CIERRE_WORKFLOW_STEPS: { step: number; title: string; detail: string }[] = [
  {
    step: 1,
    title: 'Configurar tarifas de packing',
    detail:
      'En la tarjeta «Tarifas de packing», revisá USD/lb por especie y temporada. Si usás precio manual en filtros, ese valor tiene prioridad sobre la tabla.',
  },
  {
    step: 2,
    title: 'Definir período y filtros',
    detail:
      'Fechas desde/hasta, página y límite en «Período de liquidación». Filtros opcionales: productor, cliente, formato, calidad, precio packing manual.',
  },
  {
    step: 3,
    title: 'Actualizar cierre',
    detail: 'Pulsá «Actualizar cierre» para regenerar liquidación, costos por formato y márgenes con esos filtros.',
  },
  {
    step: 4,
    title: 'Revisar auditor',
    detail:
      'El auditor resume problemas de packing, materiales y trazabilidad antes de exportar. Corregí datos en Despachos / Unidad PT / Existencias según el tipo de hallazgo.',
  },
  {
    step: 5,
    title: 'Elegir vista global o por productor',
    detail:
      'Global: totales, tabla expandible, análisis colapsables (cliente, formato, despacho) y bloque Exportaciones. Por productor: selector, PDF productor, PDF ejecutivo (resumen gerencial), Excel paginado del productor y tabla filtrada.',
  },
  {
    step: 6,
    title: 'Exportar o guardar',
    detail:
      'Global → Excel liquidación (resumen, ventas por despacho, costos, por formato), CSV con detalle y fila TOTAL, PDF liquidación (todos). Por productor → PDFs y Excel del productor. Documentos → libro Excel del reporte, PDF interno/resumen. Guardar vista: supervisor/admin.',
  },
];


/** Matriz de exportaciones — referencia para la guía del sistema. */
export type ExportGuideRow = {
  location: string;
  label: string;
  format: string;
  scope: string;
  technical?: string;
};

export function CIERRE_EXPORTS_GUIDE(lang: 'es' | 'en'): ExportGuideRow[] {
  if (lang === 'en') return EN_CIERRE_EXPORTS_GUIDE;
  return ES_CIERRE_EXPORTS_GUIDE;
}

const EN_CIERRE_EXPORTS_GUIDE: ExportGuideRow[] = [
  {
    location: 'Close → Global settlement → Exports',
    label: 'Excel settlement',
    format: 'XLSX (client, ExcelJS)',
    scope: 'All producers in period; 4 sheets: summary, sales by dispatch, costs, by format.',
    technical:
      'GET /api/reporting/producer-settlement?page=1&limit=9999&lang=… → downloadSettlementExcelAll. Nombre: liquidacion-todos.xlsx / packing-settlement-all.xlsx.',
  },
  {
    location: 'Close → Global settlement → Exports',
    label: 'CSV',
    format: 'CSV UTF-8 with BOM',
    scope: 'Dispatch/format detail for all producers + TOTAL row from summary.',
    technical: 'Misma API producer-settlement; armado en navegador.',
  },
  {
    location: 'Close → Global settlement → Exports',
    label: 'Settlement PDF',
    format: 'PDF',
    scope: 'Formal settlement for all producers (producer variant, no producer_id).',
    technical: 'GET /api/reporting/producer-settlement/pdf?variant=producer&lang=es|en',
  },
  {
    location: 'Close → By producer',
    label: 'Producer PDF',
    format: 'PDF',
    scope: 'One producer — delivery document (sales, costs, no technical note column).',
    technical: '…/pdf?variant=producer&productor_id=…',
  },
  {
    location: 'Close → By producer',
    label: 'Executive PDF',
    format: 'PDF',
    scope: 'One producer — management summary (executive variant).',
    technical: '…/pdf?variant=executive&productor_id=…',
  },
  {
    location: 'Close → By producer',
    label: 'Producer Excel',
    format: 'XLSX',
    scope: 'One producer — same 4 sheets as global Excel, filtered data.',
    technical: 'Paginación API 100 filas hasta completar detalle y costos por formato.',
  },
];

const ES_CIERRE_EXPORTS_GUIDE: ExportGuideRow[] = [
  {
    location: 'Cierre → Liquidación global → Exportaciones',
    label: 'Excel liquidación',
    format: 'XLSX (cliente, ExcelJS)',
    scope: 'Todos los productores del período; 4 hojas: resumen, ventas por despacho, costos, por formato.',
    technical:
      'GET /api/reporting/producer-settlement?page=1&limit=9999&lang=… → downloadSettlementExcelAll. Nombre: liquidacion-todos.xlsx / packing-settlement-all.xlsx.',
  },
  {
    location: 'Cierre → Liquidación global → Exportaciones',
    label: 'CSV',
    format: 'CSV UTF-8 con BOM',
    scope: 'Detalle por despacho/formato de todos los productores + fila TOTAL desde resumen.',
    technical: 'Misma API producer-settlement; armado en navegador.',
  },
  {
    location: 'Cierre → Liquidación global → Exportaciones',
    label: 'PDF liquidación',
    format: 'PDF',
    scope: 'Liquidación formal para todos los productores (variante producer, sin productor_id).',
    technical: 'GET /api/reporting/producer-settlement/pdf?variant=producer&lang=es|en',
  },
  {
    location: 'Cierre → Por productor',
    label: 'PDF productor',
    format: 'PDF',
    scope: 'Un productor — documento de entrega (ventas, costos, sin columna nota técnica).',
    technical: '…/pdf?variant=producer&productor_id=…',
  },
  {
    location: 'Cierre → Por productor',
    label: 'PDF ejecutivo',
    format: 'PDF',
    scope: 'Un productor — resumen gerencial (variante executive).',
    technical: '…/pdf?variant=executive&productor_id=…',
  },
  {
    location: 'Cierre → Por productor',
    label: 'Excel productor',
    format: 'XLSX',
    scope: 'Un productor — mismas 4 hojas que el Excel global, datos filtrados.',
    technical: 'Paginación API 100 filas hasta completar detalle y costos por formato.',
  },
];


export function DOCUMENTOS_EXPORTS_GUIDE(lang: 'es' | 'en'): ExportGuideRow[] {
  if (lang === 'en') return EN_DOCUMENTOS_EXPORTS_GUIDE;
  return ES_DOCUMENTOS_EXPORTS_GUIDE;
}

const EN_DOCUMENTOS_EXPORTS_GUIDE: ExportGuideRow[] = [
  {
    location: 'Reports → Documents',
    label: 'Export ALL (Excel)',
    format: 'XLSX',
    scope: 'Full dataset from last generate (operations + settlement + margins, translated sheets).',
    technical: 'GET /api/reporting/export?format=xlsx&lang=…',
  },
  {
    location: 'Reports → Documents',
    label: 'Internal PDF',
    format: 'PDF',
    scope: 'Complete operational tables for the period (internal profile).',
    technical: 'GET /api/reporting/export?format=pdf&pdf_profile=internal',
  },
  {
    location: 'Reports → Documents',
    label: 'Summary PDF',
    format: 'PDF',
    scope: 'External summary with less operational detail (external profile).',
    technical: 'GET /api/reporting/export?format=pdf&pdf_profile=external',
  },
  {
    location: 'Reports → Documents',
    label: 'Producer settlement PDF',
    format: 'PDF',
    scope: 'Settlement per active filters (if producer_id in filters, one producer only).',
    technical: 'GET /api/reporting/producer-settlement/pdf?variant=producer',
  },
];

const ES_DOCUMENTOS_EXPORTS_GUIDE: ExportGuideRow[] = [
  {
    location: 'Reportes → Documentos',
    label: 'Exportar TODO (Excel)',
    format: 'XLSX',
    scope: 'Dataset completo del último generate (operación + liquidación + márgenes, hojas traducidas).',
    technical: 'GET /api/reporting/export?format=xlsx&lang=…',
  },
  {
    location: 'Reportes → Documentos',
    label: 'PDF interno',
    format: 'PDF',
    scope: 'Tablas operativas completas del período (perfil internal).',
    technical: 'GET /api/reporting/export?format=pdf&pdf_profile=internal',
  },
  {
    location: 'Reportes → Documentos',
    label: 'PDF resumen',
    format: 'PDF',
    scope: 'Resumen externo con menos detalle operativo (perfil external).',
    technical: 'GET /api/reporting/export?format=pdf&pdf_profile=external',
  },
  {
    location: 'Reportes → Documentos',
    label: 'PDF liquidación productor',
    format: 'PDF',
    scope: 'Liquidación según filtros activos (si hay productor_id en filtros, un solo productor).',
    technical: 'GET /api/reporting/producer-settlement/pdf?variant=producer',
  },
];


/** Resolución de productor en liquidación (referencia para usuarios admin). */
export function TRACEABILITY_RESOLUTION_RULES(lang: 'es' | 'en'): { code: string; when: string }[] {
  if (lang === 'en') return EN_TRACEABILITY_RESOLUTION_RULES;
  return ES_TRACEABILITY_RESOLUTION_RULES;
}

const EN_TRACEABILITY_RESOLUTION_RULES: { code: string; when: string }[] = [
  { code: 'pt_tag_items / tarja', when: 'Invoice line references PT unit: producer from PT items of that tarja.' },
  { code: 'fruit_process_direct', when: 'Line declares process: producer from the fruit process.' },
  { code: 'final_pallet / repallet_multi_producer', when: 'Pallet or re-pallet with mix: amounts may be prorated by boxes of origin.' },
  { code: 'sin_tarja / unassigned', when: 'No clear link: sales and costs in «no PT unit / unassigned» row in settlement.' },
];

const ES_TRACEABILITY_RESOLUTION_RULES: { code: string; when: string }[] = [
  { code: 'pt_tag_items / tarja', when: 'La línea de factura referencia unidad PT: productor desde ítems PT de esa tarja.' },
  { code: 'fruit_process_direct', when: 'La línea declara proceso: productor del proceso de fruta.' },
  { code: 'final_pallet / repallet_multi_producer', when: 'Pallet o repalet con mezcla: montos pueden prorratearse por cajas de procedencia.' },
  { code: 'sin_tarja / sin asignar', when: 'Sin vínculo claro: ventas y costos en fila «sin unidad PT / sin asignar» en liquidación.' },
];


export type FlowStage = {
  title: string;
  summary: string;
  born: string[];
  carries: string[];
  reports: string[];
};

export function SYSTEM_FLOW_STAGES(lang: 'es' | 'en'): FlowStage[] {
  if (lang === 'en') return EN_SYSTEM_FLOW_STAGES;
  return ES_SYSTEM_FLOW_STAGES;
}

const EN_SYSTEM_FLOW_STAGES: FlowStage[] = [
  {
    title: 'Reception',
    summary: 'Fruit intake at plant; record and lines that feed processes.',
    born: ['Intake weight/volume', 'Declared quality', 'Reception reference'],
    carries: ['Traceable input toward fruit_processes'],
    reports: ['Indirect in yield/waste if process links the reception'],
  },
  {
    title: 'Process (fruit_processes)',
    summary: 'Transformation of intake into destinations (PT, byproducts); packout yield and waste only if recorded.',
    born: ['Processed weight', 'Packout yield %', 'Waste in lbs (if recorded)', 'Process variety/quality'],
    carries: ['Link to PT units generated in that process'],
    reports: ['Yield and waste (Excel export)', 'Packaging by format (operational consumption)'],
  },
  {
    title: 'PT Unit',
    summary: 'Finished product tarja: boxes per format, client and process; created in /pt-tags.',
    born: ['pt_tag_items lines', 'PT unit ↔ process relation', 'excluded_sum_packout flag if applicable'],
    carries: ['Toward cold-storage inventory and toward invoice when line references tarja/process'],
    reports: ['Boxes PT by producer', 'Boxes PT detail', 'End of day (packed today)'],
  },
  {
    title: 'PT Stock (cold storage & re-palletize)',
    summary: 'Stock in warehouse, re-palletizing and PT packing lists before commercial dispatch.',
    born: ['Pallets in inventory', 'Origin lines in re-pallet', 'PT packing list'],
    carries: ['Logistics bridge to dispatch; resolved by final_pallet_id in invoicing'],
    reports: ['End of day (cold storage)', 'Settlement when line resolves by pallet/re-pallet'],
  },
  {
    title: 'Sales orders',
    summary: 'Commercial commitment of boxes per client; progress tracking vs production and dispatch.',
    born: ['Boxes ordered', 'Commercial order status'],
    carries: ['Operational reference; does not replace dispatch invoicing'],
    reports: ['Progress at /sales-orders/:id/avance', 'KPIs on Home'],
  },
  {
    title: 'Dispatch & invoice',
    summary: 'Commercial shipment with dispatch date; invoice lines with packaging_code and prices.',
    born: ['Dispatch header', 'Client', 'Monetary sales', 'Invoiced boxes and lbs'],
    carries: ['Financial period base in Reports → Close'],
    reports: [
      'Dispatched boxes by producer',
      'Sales by dispatch',
      'Format cost invoiced',
      'Settlement by producer',
      'Client margin',
    ],
  },
  {
    title: 'Reports — module',
    summary:
      'Four tabs with different questions: Operations (day), Decision (offer/RM), Close (financial period), Documents (export). Always distinguish operative source vs invoicing.',
    born: ['No new data: aggregates, labels and exports existing data'],
    carries: ['—'],
    reports: [
      'Operations: end of day and daily KPIs',
      'Decision: commercial calculator',
      'Close: settlement, auditor, margins and costs',
      'Documents: Excel/CSV/PDF and saved reports',
      'Glossary and source of truth on screen and in this guide',
    ],
  },
];

const ES_SYSTEM_FLOW_STAGES: FlowStage[] = [
  {
    title: 'Recepción',
    summary: 'Ingreso de fruta a planta; documento y líneas que alimentan procesos.',
    born: ['Peso/volumen de entrada', 'Calidad declarada', 'Referencia de recepción'],
    carries: ['Entrada trazable hacia fruit_processes'],
    reports: ['Indirecto en rendimiento/merma si el proceso enlaza la recepción'],
  },
  {
    title: 'Proceso (fruit_processes)',
    summary: 'Transformación de entrada en destinos (PT, subproductos); rendimiento packout y merma solo si se registran.',
    born: ['Peso procesado', 'Rendimiento packout %', 'Merma en lb (si se carga)', 'Variedad/calidad del proceso'],
    carries: ['Vínculo a unidades PT generadas en ese proceso'],
    reports: ['Rendimiento y merma (export Excel)', 'Empaque por formato (consumo operativo)'],
  },
  {
    title: 'Unidad PT',
    summary: 'Tarja de producto terminado: cajas por formato, cliente y proceso; alta en /pt-tags.',
    born: ['Líneas pt_tag_items', 'Relación unidad PT ↔ proceso', 'Flag excluida_suma_packout si aplica'],
    carries: ['Hacia existencias en cámara y hacia factura cuando la línea referencia tarja/proceso'],
    reports: ['Cajas PT por productor', 'Detalle cajas PT', 'Fin del día (empacado del día)'],
  },
  {
    title: 'Existencias PT (cámara y repalet)',
    summary: 'Stock en depósito, repaletizado y packing lists antes del despacho comercial.',
    born: ['Pallets en inventario', 'Líneas de procedencia en repalet', 'Packing list PT'],
    carries: ['Puente logístico hacia despacho; resolución por final_pallet_id en facturación'],
    reports: ['Fin del día (cámara)', 'Liquidación cuando la línea resuelve por pallet/repalet'],
  },
  {
    title: 'Pedidos comerciales',
    summary: 'Compromiso de cajas por cliente; seguimiento de avance vs producción y despacho.',
    born: ['Cajas pedidas', 'Estado comercial del pedido'],
    carries: ['Referencia operativa; no reemplaza facturación del despacho'],
    reports: ['Avance en /sales-orders/:id/avance', 'KPIs en Inicio'],
  },
  {
    title: 'Despacho y factura',
    summary: 'Envío comercial con fecha de despacho; líneas de factura con packaging_code y precios.',
    born: ['Cabecera de despacho', 'Cliente', 'Ventas monetarias', 'Cajas y lb facturados'],
    carries: ['Base del período financiero en Reportes → Cierre'],
    reports: [
      'Cajas despachadas por productor',
      'Ventas por despacho',
      'Costo por formato facturado',
      'Liquidación por productor',
      'Margen por cliente',
    ],
  },
  {
    title: 'Reportes — módulo',
    summary:
      'Cuatro pestañas con distintas preguntas: Operación (día), Decisión (oferta/MP), Cierre (período financiero), Documentos (exportar). Siempre distinguir fuente operativa vs facturación.',
    born: ['Ningún dato nuevo: agrega, etiqueta y exporta lo existente'],
    carries: ['—'],
    reports: [
      'Operación: fin del día y KPIs diarios',
      'Decisión: calculadora comercial',
      'Cierre: liquidación, auditor, márgenes y costos',
      'Documentos: Excel/CSV/PDF y guardados',
      'Glosario y fuente de verdad en pantalla y en esta guía',
    ],
  },
];


export type ValidationScenario = {
  id: string;
  title: string;
  setup: string;
  expectDispatches: string;
  expectInvoices: string;
  expectFormatCost: string;
  expectLiquidacion: string;
  expectMargen: string;
};

/** Escenarios orientativos para validar datos con la siembra / datos reales del entorno. */
export function VALIDATION_SCENARIOS(lang: 'es' | 'en'): ValidationScenario[] {
  if (lang === 'en') return EN_VALIDATION_SCENARIOS;
  return ES_VALIDATION_SCENARIOS;
}

const EN_VALIDATION_SCENARIOS: ValidationScenario[] = [
  {
    id: 'A',
    title: 'Linear flow: process → PT unit → single dispatch in period',
    setup:
      'One process in date range with PT units; one invoiced dispatch in same period whose lines reference those units or coherent pallets.',
    expectDispatches: 'In Dispatches: the shipment appears with client and date; items with boxes aligned to production.',
    expectInvoices: 'Lines with packaging_code and boxes feeding period invoicing.',
    expectFormatCost:
      'Reports → Close → Format analysis: formats with boxes > 0; cost consistent with recipes and packing rate per species.',
    expectLiquidacion:
      'Close → global view: producers with boxes/sales if traceability resolves; auditor without criticals; Excel/CSV/PDF settlement in Exports; producer/executive PDFs in By producer view.',
    expectMargen:
      'Close → Client analysis: dispatch client with sales and margin; format detail with proration note if applicable.',
  },
  {
    id: 'B',
    title: 'Mix or re-pallet: multiple origins in same pallet/dispatch',
    setup: 'Pallet or dispatch with lines requiring re-palletizing or proration between producers or formats.',
    expectDispatches: 'Single dispatch with multiple lines or pallets; total boxes match invoice.',
    expectInvoices: 'Lines with different packaging_code or references to pallet/PT unit; correct period invoicing.',
    expectFormatCost:
      'Format cost: proration by invoiced volume; check notes in margin detail and auditor rows for materials/packing.',
    expectLiquidacion:
      'Settlement: rows split by producer; expand row (dispatch date, BOL in detail); by-producer view with executive PDF and paginated Excel.',
    expectMargen:
      'Client margin: aggregated by client; format detail without duplicating producer settlement logic.',
  },
  {
    id: 'C',
    title: 'Daily operative close vs period financial close',
    setup: 'Production and dispatches on different dates within the same calendar week.',
    expectDispatches: 'Dispatches with fecha_despacho within the chosen settlement period.',
    expectInvoices: 'Only lines from period dispatches enter Close; may not match a single operative day.',
    expectFormatCost: 'Format costs only on volume invoiced in period, not on everything packed at plant.',
    expectLiquidacion:
      'Operations → end of day: packed/dispatched for ONE day. Close: settlement for from/to range. Compare «PT Boxes − dispatched» KPI in Documents.',
    expectMargen: 'Do not mix Close margin with end-of-day totals; they are different time cuts.',
  },
];

const ES_VALIDATION_SCENARIOS: ValidationScenario[] = [
  {
    id: 'A',
    title: 'Flujo lineal: proceso → unidad PT → despacho único en el período',
    setup:
      'Un proceso en el rango de fechas con unidades PT; un despacho facturado en el mismo período cuyas líneas referencian esas unidades o pallets coherentes.',
    expectDispatches: 'En Despachos: el envío aparece con cliente y fecha; ítems con cajas alineadas a lo producido.',
    expectInvoices: 'Líneas con packaging_code y cajas que alimentan facturación del período.',
    expectFormatCost:
      'Reportes → Cierre → Análisis por formato: formatos con cajas > 0; costo coherente con recetas y packing por especie.',
    expectLiquidacion:
      'Cierre → vista global: productores con cajas/ventas si la trazabilidad resuelve; auditor sin críticos; Excel/CSV/PDF liquidación en Exportaciones; PDF productor/ejecutivo en vista Por productor.',
    expectMargen:
      'Cierre → Análisis por cliente: cliente del despacho con ventas y margen; detalle por formato con nota de prorrateo si aplica.',
  },
  {
    id: 'B',
    title: 'Mezcla o repalet: varios orígenes en un mismo pallet/despacho',
    setup:
      'Pallet o despacho con líneas que requieren repalet o prorrateo entre productores o formatos.',
    expectDispatches: 'Despacho único con varias líneas o pallets; totales de cajas cuadran con factura.',
    expectInvoices: 'Líneas con distintos packaging_code o referencias a pallet/unidad PT; facturación del período correcta.',
    expectFormatCost:
      'Costo por formato: prorrateo por volumen facturado; revisar notas en margen detalle y filas del auditor de materiales/packing.',
    expectLiquidacion:
      'Liquidación: filas fraccionadas por productor; expandir fila (fecha despacho, BOL en detalle); vista por productor con PDF ejecutivo y Excel paginado.',
    expectMargen:
      'Margen por cliente: agregado por cliente; detalle por formato sin duplicar lógica de liquidación por productor.',
  },
  {
    id: 'C',
    title: 'Cierre del día operativo vs cierre financiero del período',
    setup:
      'Producción y despachos en fechas distintas dentro de la misma semana calendario.',
    expectDispatches: 'Despachos con fecha_despacho dentro del período de liquidación elegido.',
    expectInvoices: 'Solo líneas de despachos del período entran en Cierre; pueden no coincidir con un solo día operativo.',
    expectFormatCost: 'Costos por formato solo sobre volumen facturado en el período, no sobre todo lo empacado en planta.',
    expectLiquidacion:
      'Operación → fin del día: cuadra empacado/despachado de UN día. Cierre: liquidación del rango desde/hasta. Comparar KPI «Cajas PT − despachadas» en Documentos.',
    expectMargen:
      'No mezclar margen de Cierre con totales del fin del día; son cortes temporales distintos.',
  },
];


export function ROLES_SUMMARY(lang: 'es' | 'en'): { role: string; canDo: string[] }[] {
  if (lang === 'en') return EN_ROLES_SUMMARY;
  return ES_ROLES_SUMMARY;
}

const EN_ROLES_SUMMARY: { role: string; canDo: string[] }[] = [
  {
    role: 'viewer',
    canDo: [
      'Read all screens and operational data',
      'Generate reports, export Excel/PDF, mass balance',
      'Cannot edit masters, processes, dispatches, or packing rates',
    ],
  },
  {
    role: 'operator',
    canDo: [
      'Read reports and export',
      'Operate receptions, processes, PT, dispatches per screen permissions',
      'Cannot save reports or edit packing rates in Close',
    ],
  },
  {
    role: 'supervisor',
    canDo: [
      'Everything in operator',
      'Edit tarjas and orders',
      'Save and rename reports',
      'Configure packing rates in Close (if UI allows with their session)',
    ],
  },
  {
    role: 'admin',
    canDo: [
      'Everything in supervisor',
      'Plant parameters',
      'Delete saved reports',
      'Bulk CSV import',
      'Technical settlement diagnostic in Close',
    ],
  },
];

const ES_ROLES_SUMMARY: { role: string; canDo: string[] }[] = [
  {
    role: 'viewer',
    canDo: [
      'Ver todas las pantallas y datos operativos',
      'Generar reportes, exportar Excel/PDF y balance de masas',
      'No editar maestros, procesos, despachos ni tarifas de packing',
    ],
  },
  {
    role: 'operator',
    canDo: [
      'Leer reportes y exportar',
      'Operar recepciones, procesos, PT, despachos según permisos de pantalla',
      'No guardar reportes ni editar tarifas de packing en Cierre',
    ],
  },
  {
    role: 'supervisor',
    canDo: [
      'Todo lo de operator',
      'Editar tarjas y pedidos',
      'Guardar y renombrar reportes',
      'Configurar tarifas de packing en Cierre (si la UI lo permite con su sesión)',
    ],
  },
  {
    role: 'admin',
    canDo: [
      'Todo lo de supervisor',
      'Parámetros de planta',
      'Eliminar reportes guardados',
      'Carga masiva CSV',
      'Diagnóstico técnico de liquidación en Cierre',
    ],
  },
];

