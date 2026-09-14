/**
 * Tokens de UI homogéneos para módulos operativos (headers, KPIs, filtros, tablas).
 * Mantener consistencia visual; la lógica de negocio vive en cada página.
 *
 * Guía interna: `frontend/docs/VISUAL_SYSTEM.md`
 */

/** Contenedor vertical estándar entre secciones (el ancho lo limita AppLayout). */
export const pageStack = 'space-y-5';

/** Fila de título + acciones (desktop: acciones a la derecha). */
export const pageHeaderRow = 'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between';

/** Título principal de módulo (único estilo en toda la app). */
export const pageTitle = 'font-display text-[1.5rem] font-semibold tracking-tight text-[hsl(var(--brand-charcoal))] sm:text-[1.75rem]';

/** Subtítulo bajo el título. */
export const pageSubtitle = 'text-[12px] text-[hsl(var(--brand-muted))] sm:text-[13px]';

/** Botón circular de ayuda / info (tooltip). */
export const pageInfoButton =
  'rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200';

/** Grillas KPI estándar. */
export const kpiGrid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4';
export const kpiGrid3 = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
export const kpiGrid6 = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';

/** Card KPI fila principal (4 cols). */
export const kpiCard =
  'flex min-h-[72px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-none';

/** Card KPI filas secundarias / más compactas. */
export const kpiCardSm =
  'flex min-h-[64px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-none';

/** Dashboard u otros layouts con celdas más altas. */
export const kpiCardLg =
  'flex min-h-[88px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-none';

export const kpiLabel = 'text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400';

export const kpiValueLg =
  'text-[1.35rem] font-semibold tabular-nums leading-none tracking-tight text-slate-900';

export const kpiValueMd = 'text-[1.25rem] font-semibold tabular-nums leading-none text-slate-900';

/** Valor XL (p. ej. dashboard 6 KPIs). */
export const kpiValueXl =
  'tabular-nums text-[2rem] font-semibold leading-none tracking-tight text-slate-900 sm:text-[2.125rem]';

export const kpiFootnote = 'text-[11px] text-slate-400';
export const kpiFootnoteLead = 'mt-3 text-[11px] leading-snug text-slate-400';

/** Panel de filtros unificado. */
export const filterPanel =
  'rounded-xl border border-[var(--stone-200)] bg-white px-3 py-3 shadow-none sm:px-3.5';

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
  'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-none [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none';

export const tableHeaderRow = 'border-slate-100 hover:bg-transparent';
export const tableBodyRow = 'min-h-[68px] border-slate-100/90 hover:bg-slate-50/60';
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

/** Primario operativo (verde oliva Gold Master). */
export const modalFormPrimaryButton =
  'h-11 min-h-11 rounded-[var(--radius-md)] bg-[var(--olive-700)] px-5 text-sm font-semibold text-white shadow-none transition-colors hover:bg-[var(--olive-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive-700)]/35 disabled:pointer-events-none disabled:opacity-50 max-md:h-11 max-md:min-h-11 max-md:basis-[62%] max-md:flex-none max-md:px-4';

/** Botón “agregar” suave (p. ej. + Línea). */
export const modalFormSoftGreenButton =
  'inline-flex h-9 shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--olive-700)]/30 bg-[var(--sage-100)] px-3 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--sage-200)] disabled:pointer-events-none disabled:opacity-50';

/** Eliminar fila (solo ícono). */
export const modalFormLineDeleteButton =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:pointer-events-none disabled:opacity-40';

/** Badge de estado documento (borrador / confirmado) en cabecera modal. */
export const modalFormStateBadge =
  'inline-flex max-w-[200px] truncate rounded-md border border-[var(--sage-200)] bg-[var(--sage-100)] px-2.5 py-1 text-[11px] font-semibold capitalize leading-none text-[var(--olive-700)]';

/* ——— Modal operativo grande (misma cáscara que «Nueva unidad PT») ——— */

/** `DialogContent`: ancho ~1100px, columna flex, sin padding (header/body/footer llevan el ritmo). */
export const operationalModalContentClass =
  'flex max-h-[min(92vh,900px)] w-full min-w-0 max-w-[min(1100px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden bg-[var(--stone-50)] p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]';

/** Cabecera con espacio a la derecha para la X por defecto de Radix (`pr-14`). */
export const operationalModalHeaderClass =
  'min-w-0 shrink-0 space-y-1.5 border-b border-[var(--stone-200)] bg-[var(--stone-50)] px-6 pb-3.5 pt-5 pr-14 text-left';

export const operationalModalTitleClass =
  'font-serif text-[1.35rem] font-bold tracking-tight text-[var(--ink)] sm:text-[1.5rem]';

export const operationalModalDescriptionClass =
  'text-pretty text-[13px] leading-snug text-[var(--ink-muted)]';

/** Formulario que ocupa el alto restante entre header y footer. */
export const operationalModalFormClass = 'flex min-h-0 flex-1 flex-col';

/** Área scroll con el mismo padding que unidad PT. */
export const operationalModalBodyClass = 'min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-4';

/** Stack vertical de secciones dentro del body. */
export const operationalModalBodyStackClass = 'space-y-4';

/** Pie con borde superior y fondo suave (como unidad PT). */
export const operationalModalFooterClass =
  'min-w-0 shrink-0 gap-2 border-t border-[var(--stone-200)] bg-[var(--stone-50)] px-6 py-3';

/** Sección tipo paso 1 / 3 unidad PT — card sobre fondo claro. */
export const operationalModalSectionCard =
  'min-w-0 rounded-[var(--radius-lg)] border border-[var(--stone-200)] bg-white p-4';

/** Sección tipo paso 2 unidad PT — bloque alternado. */
export const operationalModalSectionMuted =
  'min-w-0 rounded-[var(--radius-lg)] border border-[var(--stone-200)] bg-[var(--sage-100)]/50 p-4';

/** Fila del número de paso + título de sección. */
export const operationalModalSectionHeadingRow = 'mb-3 flex flex-wrap items-center gap-2';

/** Círculo numerado (1, 2, 3…). */
export const operationalModalStepBadge =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--olive-700)] text-[13px] font-bold text-white';

/** Título al lado del paso. */
export const operationalModalStepTitle =
  'font-serif text-[17px] font-semibold tracking-tight text-[var(--ink)]';
