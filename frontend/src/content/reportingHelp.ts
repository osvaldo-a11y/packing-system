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
  documentos: 'PDF liquidación (mismos filtros que Generar); factura/PL en módulo Despachos',
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

export function getReportGlossaryEntry(id: ReportHelpId): GlossaryEntry | undefined {
  return REPORT_GLOSSARY.find((e) => e.id === id);
}

export const REPORT_GLOSSARY: GlossaryEntry[] = [
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
    includes: 'Resumen expandible por productor, detalle por despacho/formato, auditor previo a exportar.',
    excludes: 'No es el PDF simplificado para entregar al productor (ver Documentos / vista Por productor).',
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
    meaning: 'Exportaciones del período generado y PDF de liquidación para productor.',
    source: 'Mismos filtros que «Actualizar cierre» / Generar; PDFs de despacho en módulo Despachos.',
    includes: 'Excel completo, CSV, PDF interno/resumen, PDF liquidación productor, reportes guardados.',
    excludes: 'Las tablas interactivas detalladas están en Cierre; Operación no usa el período de liquidación.',
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

export const APP_NAV_GROUPS: AppNavGroup[] = [
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

export const REPORTING_TABS_GUIDE: ReportingTabGuide[] = [
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
    dateBasis: 'Período de liquidación: fecha desde/hasta, paginación y filtros opcionales (productor, cliente, formato, precio packing manual).',
    sections: [
      'Tarifas de packing por especie (USD/lb) y período con «Actualizar cierre».',
      'Estado del cierre + auditor de liquidación (packing, materiales, trazabilidad).',
      'Vista global: liquidación expandible, exportaciones, análisis por cliente/formato/despacho.',
      'Vista por productor: selector, PDF/Excel del informe y liquidación filtrada a un productor.',
      'Diagnóstico técnico (solo admin): trazabilidad y JSON de depuración del backend.',
    ],
    exports: 'Bloque Exportaciones en vista global; también Documentos para Excel/PDF masivos.',
  },
  {
    id: 'documentos',
    label: 'Documentos',
    answers: '¿Cómo exporto y guardo el trabajo del período?',
    dateBasis: 'Refleja el último «Actualizar cierre» / generado en memoria con los filtros activos.',
    sections: [
      'Vista del período: KPIs PT vs despachado, muestra de cajas PT, dataset técnico normalizado.',
      'Exportar TODO (Excel), CSV, PDF interno, PDF resumen, PDF liquidación productor.',
      'Reportes guardados: cargar, renombrar (supervisor/admin), eliminar (admin).',
    ],
    exports: 'Todos los formatos listados arriba; factura y packing list comercial siguen en Despachos.',
  },
];

/** Pasos recomendados dentro del tab Cierre. */
export const CIERRE_WORKFLOW_STEPS: { step: number; title: string; detail: string }[] = [
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
      'Global: totales, tabla expandible, análisis por cliente/formato/despacho y exportaciones del período. Por productor: informe individual y PDF/Excel del productor elegido.',
  },
  {
    step: 6,
    title: 'Exportar o guardar',
    detail:
      'Exportaciones en Cierre (global) o en Documentos (libro completo y PDFs). Guardar vista: supervisor/admin. Sincronizar guardado antiguo tras regenerar.',
  },
];

/** Resolución de productor en liquidación (referencia para usuarios admin). */
export const TRACEABILITY_RESOLUTION_RULES: { code: string; when: string }[] = [
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

export const SYSTEM_FLOW_STAGES: FlowStage[] = [
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
export const VALIDATION_SCENARIOS: ValidationScenario[] = [
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
      'Cierre → vista global: productores con cajas/ventas si la trazabilidad resuelve; auditor sin críticos; PDF desde Documentos o exportaciones del cierre.',
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
      'Liquidación: filas fraccionadas por productor; expandir fila y revisar detalle operativo + desglose por formato; vista por productor para un solo productor.',
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

export const ROLES_SUMMARY: { role: string; canDo: string[] }[] = [
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
