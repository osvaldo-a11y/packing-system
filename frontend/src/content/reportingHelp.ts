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
  | 'documentos';

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
  documentos: 'PDF liquidación (mismos filtros que Generar); factura/PL en módulo Despachos',
};

export type GlossaryEntry = {
  id: ReportHelpId;
  name: string;
  meaning: string;
  source: string;
  includes: string;
  excludes: string;
};

export function getReportGlossaryEntry(id: ReportHelpId): GlossaryEntry | undefined {
  return REPORT_GLOSSARY.find((e) => e.id === id);
}

export const REPORT_GLOSSARY: GlossaryEntry[] = [
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
    includes: 'Misma resolución de productor que liquidación (unidad PT, proceso, pallet, repallet cuando aplica).',
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
    includes: 'Resumen y detalle por despacho/formato; PDF interno.',
    excludes: 'No es el PDF simplificado para entregar al productor (otro flujo en Documentos).',
  },
  {
    id: 'costo-formato-facturado',
    name: 'Costo por formato facturado',
    meaning: 'Costo de materiales + packing por formato según volumen facturado en el período.',
    source: 'Facturación del período + recetas + tabla packing por especie o precio manual.',
    includes: 'Desglose por receta cuando aplica.',
    excludes: 'No es costo de stock físico ni de planta fuera del período facturado.',
  },
  {
    id: 'ventas-despacho',
    name: 'Ventas por despacho',
    meaning: 'Totales de venta y costos asociados por despacho para análisis de margen operativo del envío.',
    source: 'Agregación por despacho desde facturación del período.',
    includes: 'Comparar despachos entre sí en el rango de fechas.',
    excludes: 'No desglosa por productor (eso es liquidación).',
  },
  {
    id: 'margen-cliente',
    name: 'Margen por cliente',
    meaning: 'Ventas menos costos totales por cliente del despacho, con detalle opcional por formato.',
    source: 'Líneas de factura por cliente + mismos costos por formato que liquidación (prorrateo por cajas de cliente en formato).',
    includes: 'Resumen y detalle por packaging_code.',
    excludes: 'No reparte por productor; uso interno, no documento para terceros.',
  },
  {
    id: 'documentos',
    name: 'Liquidación (entrega) y documentos',
    meaning: 'PDF para productor y enlaces a factura/packing list por despacho.',
    source: 'Mismos filtros que Generar; PDFs de despacho generados en módulo Despachos.',
    includes: 'Descarga de liquidación productor; acceso a despachos.',
    excludes: 'Tablas numéricas detalladas están en Financiero → liquidación interna.',
  },
];

export type FlowStage = {
  title: string;
  summary: string;
  born: string[];
  carries: string[];
  reports: string[];
};

export const SYSTEM_FLOW_STAGES: FlowStage[] = [
  {
    title: 'Recepción',
    summary: 'Ingreso de fruta a planta y vínculo con origen (lote, productor implícito o explícito según configuración).',
    born: ['Peso/volumen de entrada', 'Calidad declarada', 'Identificación de lote o recepción'],
    carries: ['Lo que alimenta procesos posteriores como “entrada” trazable'],
    reports: ['Trazabilidad hacia proceso (indirecto en reportes de proceso/rendimiento si aplica)'],
  },
  {
    title: 'Proceso (fruit_processes)',
    summary: 'Transformación de entrada en destinos (PT, subproductos); es donde se mide rendimiento packout y se registra merma explícita.',
    born: ['Peso procesado', 'Rendimiento packout %', 'Merma en lb (si se carga)', 'Variedad/calidad del proceso'],
    carries: ['Vínculo a unidades PT generadas en ese proceso'],
    reports: ['Rendimiento y merma registrada', 'Empaque por formato (consumo operativo asociado al flujo)'],
  },
  {
    title: 'Unidad PT',
    summary: 'Unidad de identificación de cajas PT producidas; ancla operativa fuerte para “cajas por productor” en planta.',
    born: ['Líneas pt_tag_items (cajas por formato en la unidad)', 'Relación unidad PT ↔ proceso'],
    carries: ['Hacia existencia PT y hacia despacho cuando la factura referencia unidad PT/proceso/pallet'],
    reports: ['Cajas PT por productor', 'Detalle cajas PT por operación'],
  },
  {
    title: 'Unidad PT (folio) / repalet',
    summary: 'Agrupación logística de cajas; el repalet puede reconstruir procedencia cuando hay mezcla.',
    born: ['Pallet como unidad de depósito/salida', 'Líneas de procedencia en repalet si aplica'],
    carries: ['Puente hacia packing list y despacho; resolución de productor en facturación si la línea lleva final_pallet_id'],
    reports: ['Cajas despachadas / liquidación / margen (cuando la línea de factura resuelve por pallet o repalet)'],
  },
  {
    title: 'Packing list PT',
    summary: 'Documento de carga de lo que sale hacia cliente vinculado a pallets/cajas.',
    born: ['Listado de ítems PT en el envío'],
    carries: ['Coherencia con despacho y factura comercial'],
    reports: ['Indirecto: validación en Despachos; no es una tabla separada en Reportes con el mismo nombre'],
  },
  {
    title: 'Despacho',
    summary: 'Envío comercial; fecha de despacho y cliente anclan la facturación del período.',
    born: ['Cabecera de despacho', 'Cliente', 'Fecha', 'Vínculo a ítems facturables'],
    carries: ['Pallets/unidades PT/procesos referenciados en líneas'],
    reports: ['Cajas despachadas por productor', 'Ventas por despacho', 'Costo pallet/unidad PT (logístico)'],
  },
  {
    title: 'Factura (invoice lines)',
    summary: 'Líneas con cajas, precio, packaging_code; base del período financiero.',
    born: ['Ventas monetarias', 'Cajas y lb facturados', 'Referencias unidad PT/proceso/pallet en línea'],
    carries: ['Entrada a costo por formato, liquidación y margen por cliente'],
    reports: ['Costo por formato facturado', 'Liquidación por productor', 'Margen por cliente', 'Ventas por despacho'],
  },
  {
    title: 'Reportes (módulo)',
    summary: 'Vista unificada por período/filtros: operativo vs financiero vs documentos; siempre interpretar la “fuente de verdad” del informe.',
    born: ['Ningún dato nuevo: agrega y etiqueta lo ya existente'],
    carries: ['—'],
    reports: ['Todos los listados bajo Generar; export CSV/Excel/PDF'],
  },
  {
    title: 'Liquidación por productor',
    summary: 'Asignación de ventas y costos a productor según trazabilidad de líneas de factura.',
    born: ['Neto por productor en el período (según reglas de prorrateo)'],
    carries: ['Desde factura + resolución unidad PT/proceso/pallet/repalet'],
    reports: ['Liquidación interna (tablas + PDF interno)', 'PDF productor en Documentos'],
  },
  {
    title: 'Margen por cliente',
    summary: 'Mismo motor de costo por formato que liquidación, agrupado por cliente del despacho.',
    born: ['Margen y costos por cliente (y por formato en detalle)'],
    carries: ['Desde facturación + costos prorrateados por formato'],
    reports: ['Margen por cliente — resumen y detalle'],
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
export const VALIDATION_SCENARIOS: ValidationScenario[] = [
  {
    id: 'A',
    title: 'Flujo lineal: proceso → unidad PT → despacho único en el período',
    setup:
      'Un proceso en el rango de fechas con unidades PT; un despacho facturado en el mismo período cuyas líneas referencian esas unidades o pallets coherentes.',
    expectDispatches: 'En Despachos: el envío aparece con cliente y fecha; ítems con cajas alineadas a lo producido.',
    expectInvoices: 'Líneas con packaging_code y cajas que alimentan facturación del período.',
    expectFormatCost:
      'En Reportes → Costo por formato facturado: formatos con cajas > 0 en el período; costo coherente con recetas y packing por especie.',
    expectLiquidacion:
      'Liquidación interna: productores con cajas/ventas si la trazabilidad de línea resuelve productor; PDF interno/ productor alineados al mismo filtro.',
    expectMargen:
      'Margen por cliente: el cliente del despacho con ventas y margen; detalle por formato coincide con líneas facturadas.',
  },
  {
    id: 'B',
    title: 'Mezcla o repalet: varios orígenes en un mismo pallet/despacho',
    setup:
      'Pallet o despacho con líneas que requieren repallet o prorrateo entre productores o formatos.',
    expectDispatches: 'Despacho único con varias líneas o pallets; totales de cajas cuadran con factura.',
    expectInvoices: 'Líneas con distintos packaging_code o referencias a pallet/unidad PT; facturación del período correcta.',
    expectFormatCost:
      'Costo por formato: prorrateo por volumen facturado del formato en el período; revisar notas de prorrateo en margen detalle si aplica.',
    expectLiquidacion:
      'Liquidación: filas por productor pueden ser fracción si hubo mezcla; neto debe ser interpretable con el detalle por despacho/formato.',
    expectMargen:
      'Margen por cliente: agregado por cliente; el detalle por formato explica el reparto sin duplicar lógica de liquidación por productor.',
  },
];
