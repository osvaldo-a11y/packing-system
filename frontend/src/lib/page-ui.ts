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
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:opacity-50';

export const filterInputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200';

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
