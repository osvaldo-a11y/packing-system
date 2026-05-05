/**
 * Tokens de UI homogéneos para módulos operativos (headers, KPIs, filtros, tablas).
 * Mantener consistencia visual; la lógica de negocio vive en cada página.
 *
 * Guía interna: `frontend/docs/VISUAL_SYSTEM.md`
 */

/** Contenedor vertical estándar entre secciones (el ancho lo limita AppLayout). */
export const pageStack = 'space-y-8';

/** Fila de título + acciones (desktop: acciones a la derecha). */
export const pageHeaderRow = 'flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between';

/** Título principal de módulo (único estilo en toda la app). */
export const pageTitle = 'text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]';

/** Subtítulo bajo el título. */
export const pageSubtitle = 'text-xs text-slate-400 sm:text-[13px]';

/** Botón circular de ayuda / info (tooltip). */
export const pageInfoButton =
  'rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200';

/** Grillas KPI estándar. */
export const kpiGrid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4';
export const kpiGrid3 = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
export const kpiGrid6 = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';

/** Card KPI fila principal (4 cols). */
export const kpiCard =
  'flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm';

/** Card KPI filas secundarias / más compactas. */
export const kpiCardSm =
  'flex min-h-[120px] flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm';

/** Dashboard u otros layouts con celdas más altas. */
export const kpiCardLg =
  'flex min-h-[148px] flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm';

export const kpiLabel = 'text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400';

export const kpiValueLg =
  'text-[1.75rem] font-semibold tabular-nums leading-none tracking-tight text-slate-900';

export const kpiValueMd = 'text-[1.65rem] font-semibold tabular-nums leading-none text-slate-900';

/** Valor XL (p. ej. dashboard 6 KPIs). */
export const kpiValueXl =
  'tabular-nums text-[2rem] font-semibold leading-none tracking-tight text-slate-900 sm:text-[2.125rem]';

export const kpiFootnote = 'text-[11px] text-slate-400';
export const kpiFootnoteLead = 'mt-3 text-[11px] leading-snug text-slate-400';

/** Panel de filtros unificado. */
export const filterPanel =
  'rounded-2xl border border-slate-100 bg-white/90 px-4 py-4 shadow-sm sm:px-5';

export const filterLabel = 'text-xs text-slate-500';

export const filterSelectClass =
  'h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:opacity-50';

export const filterInputClass =
  'h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200';

/** Valor sólo lectura multilinea (referencias calculadas en formularios). */
export const formReadonlyValueClass =
  'min-h-10 w-full min-w-0 whitespace-normal break-words rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono leading-snug text-slate-800 shadow-sm';

/** Contenedor de tabla con borde y scroll. */
export const tableShell =
  'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none';

export const tableHeaderRow = 'border-slate-100 hover:bg-transparent';
export const tableBodyRow = 'border-slate-100/90 hover:bg-slate-50/60';
export const tableCellComfortable = 'py-3.5 align-top';

/** Bloques “señales operativas” / alertas compactas. */
export const signalsPanel = 'space-y-2 rounded-2xl border border-slate-100 bg-slate-50/40 px-4 py-3';
export const signalsTitle = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400';

export const sectionTitle = 'text-base font-semibold text-slate-900';
export const sectionHint = 'mt-0.5 text-[11px] text-slate-400';

/** Botones en barra de herramientas del header. */
export const btnToolbarPrimary = 'h-10 gap-2 rounded-xl shadow-sm';
export const btnToolbarOutline = 'h-10 rounded-xl border-slate-200 bg-white shadow-sm';

/** Píldora de estado homogénea (base; combinar con colores). */
export const badgePill =
  'inline-flex max-w-[160px] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize leading-none';

/** Estados de página reutilizables (vacío / error / carga genérica). */
export const emptyStatePanel =
  'rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 py-12 text-center text-sm text-slate-500';

export const errorStatePanel =
  'rounded-2xl border border-rose-200/85 bg-rose-50/50 px-4 py-3 text-sm text-rose-900';

/** Contenedor de mensaje de error con título (p. ej. fallo de query). */
export const errorStateCard =
  'rounded-2xl border border-rose-200/90 bg-white px-4 py-4 shadow-sm sm:px-5';

/** Título h2 en guías / secciones largas de documentación. */
export const sectionHeadingLg = 'text-lg font-semibold tracking-tight text-slate-900';

/** Mensaje vacío compacto (banner inline, p. ej. “Sin alertas” en dashboard). */
export const emptyStateBanner =
  'rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-4 py-3 text-center text-[13px] text-slate-500';

/** Card de contenido estático (acerca, bloques de guía). */
export const contentCard = 'rounded-2xl border border-slate-100 bg-white shadow-sm';

/** Bloque vacío secundario dentro de formularios / paneles (texto más pequeño). */
export const emptyStateInset =
  'rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 p-3 text-sm text-slate-600';

/* ——— Modales de formulario operativo (patrón base reutilizable) ——— */

/** Contenedor del `DialogContent`: ancho generoso 4×2 layout mental, mín. ~800px en desktop. */
export const modalFormShell =
  'flex w-[min(100vw-1.25rem,56rem)] max-w-4xl min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl sm:min-w-[800px]';

/** Cabecera modal: título + acciones; borde inferior. */
export const modalFormHeader =
  'flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3.5';

/** Cuerpo scrollable del formulario dentro del modal. */
export const modalFormScrollBody = 'min-h-0 flex-1 overflow-y-auto px-6 py-4';

/** Separador entre bloques de campos (p. ej. tras cabecera principal). */
export const modalFormSectionRule = 'border-b border-slate-200 pb-4';

/** Tarjeta de sección en modal (misma familia visual que Materiales / ajuste Kardex). */
export const modalFormSectionCard = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';

/** Rótulo de sección tipo “1. Material” en ajuste de inventario. */
export const modalFormSectionEyebrow = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

/** Bloque por línea editable (fondo suave, borde claro). */
export const modalFormLineCard = 'rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-3.5';

/** Label de campo estándar (cabecera principal). */
export const modalFormFieldLabel =
  'mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground';

/** Label compacto en grillas de líneas (tabla-ligera). */
export const modalLineFieldLabel =
  'mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground';

/** Input / select compacto (13px). */
export const modalFormControl =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

/** Campo solo lectura (referencia, planta, etc.). */
export const modalFormControlReadonly =
  'h-9 w-full cursor-default rounded-md border border-input bg-muted/80 px-2.5 py-1.5 text-[13px] text-muted-foreground';

/** Título de subsección dentro del modal (p. ej. “Líneas de partida”). */
export const modalFormSectionTitle = 'text-sm font-semibold tracking-tight text-foreground';

/** Fila de línea editable: fondo secundario, borde redondeado (legado; preferir `modalFormLineCard` + grid). */
export const modalFormLineRow =
  'flex flex-wrap items-end gap-x-2 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5';

/** Pie sticky: totales + acciones. */
export const modalFormFooter =
  'flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-slate-50/90 px-6 py-3 sm:flex-row sm:items-center sm:justify-between';

export const modalFormFooterTotals = 'text-xs tabular-nums text-muted-foreground';

/** Primario operativo (verde marca; fallback si el tema `primary` es otro tono). */
export const modalFormPrimaryButton =
  'h-9 rounded-md bg-[#1D9E75] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#178f6a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/35 disabled:pointer-events-none disabled:opacity-50';

/** Botón “agregar” suave (p. ej. + Línea). */
export const modalFormSoftGreenButton =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[13px] font-medium text-emerald-900 shadow-sm transition-colors hover:bg-emerald-100 disabled:pointer-events-none disabled:opacity-50';

/** Eliminar fila (solo ícono). */
export const modalFormLineDeleteButton =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:pointer-events-none disabled:opacity-40';

/** Badge de estado documento (borrador / confirmado) en cabecera modal. */
export const modalFormStateBadge =
  'inline-flex max-w-[200px] truncate rounded-md border border-green-100 bg-green-50 px-2.5 py-1 text-[11px] font-semibold capitalize leading-none text-green-800';

/* ——— Modal operativo grande (misma cáscara que «Nueva unidad PT») ——— */

/** `DialogContent`: ancho ~1100px, columna flex, sin padding (header/body/footer llevan el ritmo). */
export const operationalModalContentClass =
  'flex max-h-[min(92vh,900px)] w-full min-w-0 max-w-[min(1100px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]';

/** Cabecera con espacio a la derecha para la X por defecto de Radix (`pr-14`). */
export const operationalModalHeaderClass =
  'min-w-0 shrink-0 space-y-1.5 border-b border-border px-6 pb-3.5 pt-5 pr-14 text-left';

export const operationalModalTitleClass = 'text-lg';

export const operationalModalDescriptionClass =
  'text-pretty text-[13px] leading-snug text-muted-foreground';

/** Formulario que ocupa el alto restante entre header y footer. */
export const operationalModalFormClass = 'flex min-h-0 flex-1 flex-col';

/** Área scroll con el mismo padding que unidad PT. */
export const operationalModalBodyClass = 'min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-4';

/** Stack vertical de secciones dentro del body. */
export const operationalModalBodyStackClass = 'space-y-4';

/** Pie con borde superior y fondo suave (como unidad PT). */
export const operationalModalFooterClass =
  'min-w-0 shrink-0 gap-2 border-t border-border bg-muted/15 px-6 py-3';

/** Sección tipo paso 1 / 3 unidad PT — card sobre fondo claro. */
export const operationalModalSectionCard =
  'min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm';

/** Sección tipo paso 2 unidad PT — bloque alternado. */
export const operationalModalSectionMuted =
  'min-w-0 rounded-xl border border-border bg-muted/15 p-4 shadow-sm';

/** Fila del número de paso + título de sección. */
export const operationalModalSectionHeadingRow = 'mb-3 flex flex-wrap items-center gap-2';

/** Círculo numerado (1, 2, 3…). */
export const operationalModalStepBadge =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary';

/** Título al lado del paso. */
export const operationalModalStepTitle = 'text-sm font-semibold tracking-tight';
