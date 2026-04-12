import { useQuery, useQueries } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CircleAlert,
  ClipboardList,
  Factory,
  GitBranch,
  Import,
  Info,
  Library,
  Tag,
  Truck,
  User,
} from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, isAccessTokenExpired } from '@/api';
import { useAuth } from '@/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  emptyStateBanner,
  kpiCardLg,
  kpiFootnoteLead,
  kpiGrid6,
  kpiLabel,
  kpiValueXl,
  pageStack,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import type { DispatchApi } from '@/pages/DispatchesPage';
import type { FruitProcessRow } from '@/pages/ProcessesPage';
import type { ReceptionRow } from '@/pages/ReceptionPage';

type TraceDashboard = {
  counts: {
    receptions: number;
    reception_lines: number;
    fruit_processes: number;
    pt_tags: number;
    dispatches: number;
    packaging_materials: number;
    final_pallets: number;
    packaging_material_movements: number;
  };
  materials_low_stock: Array<{
    id: number;
    nombre_material: string;
    cantidad_disponible: string;
    unidad_medida: string;
    categoria: string;
  }>;
  chain_hint: string;
};

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function todayLabel() {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}

function parseActivityTs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

type ActivityRow = {
  id: string;
  at: number;
  whenLabel: string;
  kind: string;
  detail: string;
  to: string;
};

function buildActivityRows(
  receptions: ReceptionRow[] | undefined,
  processes: FruitProcessRow[] | undefined,
  dispatches: DispatchApi[] | undefined,
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  (receptions ?? []).forEach((r) => {
    const at = parseActivityTs(r.created_at);
    rows.push({
      id: `r-${r.id}`,
      at,
      whenLabel: formatShortDate(r.created_at),
      kind: 'Recepción',
      detail: r.reference_code?.trim() || `#${r.id}`,
      to: '/receptions',
    });
  });
  (processes ?? []).forEach((p) => {
    const at = parseActivityTs(p.fecha_proceso);
    const st = p.process_status ? ` · ${p.process_status}` : '';
    rows.push({
      id: `p-${p.id}`,
      at,
      whenLabel: formatShortDate(p.fecha_proceso),
      kind: 'Proceso',
      detail: `#${p.id}${st}`,
      to: '/processes',
    });
  });
  (dispatches ?? []).forEach((d) => {
    const raw = d.despachado_at ?? d.confirmed_at ?? d.fecha_despacho;
    const at = parseActivityTs(raw);
    rows.push({
      id: `d-${d.id}`,
      at,
      whenLabel: formatShortDate(raw ?? d.fecha_despacho),
      kind: 'Despacho',
      detail: d.numero_bol?.trim() || `#${d.id}`,
      to: '/dispatches',
    });
  });
  return rows.sort((a, b) => b.at - a.at).slice(0, 6);
}

const KPI_LEGENDS: Record<string, string> = {
  receptions: 'Total en sistema',
  processes: 'Total en sistema',
  pt_tags: 'Tarjas registradas',
  camera: 'Unidades en cámara',
  dispatches: 'Total en sistema',
};

export function DashboardPage() {
  const { username, role, token } = useAuth();
  const canLoadTrace = Boolean(token && !isAccessTokenExpired(token));

  const {
    data: trace,
    isPending: tracePending,
    isError: traceError,
    error: traceErr,
  } = useQuery({
    queryKey: ['traceability', 'dashboard'],
    queryFn: () => apiJson<TraceDashboard>('/api/traceability/dashboard'),
    retry: 1,
    enabled: canLoadTrace,
  });

  const [recQuery, procQuery, dispQuery] = useQueries({
    queries: [
      {
        queryKey: ['receptions'],
        queryFn: () => apiJson<ReceptionRow[]>('/api/receptions'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['processes'],
        queryFn: () => apiJson<FruitProcessRow[]>('/api/processes'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['dispatches'],
        queryFn: () => apiJson<DispatchApi[]>('/api/dispatches'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
    ],
  });

  const activityRows = useMemo(
    () => buildActivityRows(recQuery.data, procQuery.data, dispQuery.data),
    [recQuery.data, procQuery.data, dispQuery.data],
  );

  const openProcessesCount = useMemo(() => {
    const list = procQuery.data ?? [];
    return list.filter((p) => p.process_status === 'borrador' || p.process_status === 'confirmado').length;
  }, [procQuery.data]);

  const counts = trace?.counts;
  const lowStock = trace?.materials_low_stock ?? [];
  const criticalMaterials = lowStock.length;

  const kpiItems = counts
    ? ([
        { key: 'receptions', label: 'Recepciones', value: counts.receptions, warn: false },
        { key: 'processes', label: 'Procesos', value: counts.fruit_processes, warn: false },
        { key: 'pt_tags', label: 'Unidades PT', value: counts.pt_tags, warn: false },
        { key: 'camera', label: 'En cámara', value: counts.final_pallets, warn: false },
        { key: 'dispatches', label: 'Despachos', value: counts.dispatches, warn: false },
        {
          key: 'critical_mat',
          label: 'Materiales críticos',
          value: criticalMaterials,
          warn: criticalMaterials > 0,
        },
      ] as const)
    : null;

  const flowSteps = counts
    ? ([
        { label: 'Recepción', short: 'Ingreso', n: counts.receptions },
        { label: 'Proceso', short: 'Fruta', n: counts.fruit_processes },
        { label: 'Unidad PT', short: 'Tarja', n: counts.pt_tags },
        { label: 'Despacho', short: 'Salida', n: counts.dispatches },
      ] as const)
    : null;

  const activityLoading = recQuery.isPending || procQuery.isPending || dispQuery.isPending;

  return (
    <div className={cn('font-inter', pageStack)}>
        {/* Header — ligero, secundario frente a KPIs */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">Pinebloom Packing</p>
            <h1 className={pageTitle}>Dashboard operativo</h1>
            <p className={cn('max-w-md', pageSubtitle)}>Volumen y alertas del día.</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <User className="h-4 w-4 text-slate-400" aria-hidden />
              <span className="max-w-[200px] truncate font-medium text-slate-800">{username ?? 'Sesión'}</span>
              {role ? (
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">
                  {role}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Calendar className="h-3.5 w-3.5 opacity-70" aria-hidden />
              <span className="capitalize">{todayLabel()}</span>
            </div>
          </div>
        </header>

        {/* KPIs — protagonismo principal */}
        <section aria-labelledby="kpi-heading" className="space-y-4">
          <h2 id="kpi-heading" className="sr-only">
            Indicadores principales
          </h2>
          {tracePending && (
            <div className={kpiGrid6}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[148px] rounded-2xl" />
              ))}
            </div>
          )}
          {traceError && (
            <div className="rounded-2xl border border-slate-100 bg-rose-50/50 px-4 py-3 text-sm text-rose-900">
              No se pudo cargar el resumen. {traceErr instanceof Error ? traceErr.message : ''}
            </div>
          )}
          {kpiItems && (
            <div className={kpiGrid6}>
              {kpiItems.map(({ key, label, value, warn }) => (
                <div
                  key={key}
                  className={cn(
                    kpiCardLg,
                    warn ? 'border-amber-200/60 bg-amber-50/35' : '',
                  )}
                >
                  <div>
                    <p className={kpiLabel}>{label}</p>
                    <p className={cn('mt-3', kpiValueXl, warn ? 'text-amber-900' : '')}>{value ?? '—'}</p>
                  </div>
                  <p className={kpiFootnoteLead}>
                    {key === 'critical_mat'
                      ? criticalMaterials > 0
                        ? 'Bajo umbral de stock'
                        : 'Sin incidencias'
                      : KPI_LEGENDS[key] ?? '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!tracePending && !traceError && trace && !trace.counts && (
            <p className="text-xs text-slate-400">Sin datos de conteos.</p>
          )}
        </section>

        {/* Alertas — severidad clara, compactas */}
        <section aria-labelledby="alerts-heading" className="space-y-3">
          <h2 id="alerts-heading" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Alertas
          </h2>
          {!canLoadTrace && (
            <p className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500">
              Iniciá sesión para ver KPIs y alertas.
            </p>
          )}
          {canLoadTrace && tracePending && <Skeleton className="h-16 w-full rounded-2xl" />}
          {canLoadTrace && trace && !tracePending && (
            <div className="space-y-2.5">
              {lowStock.length > 0 && (
                <div className="flex gap-3 rounded-2xl border border-rose-100/90 bg-rose-50/40 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100/80 text-rose-700">
                    <CircleAlert className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-rose-950">Stock crítico</p>
                      <Link
                        to="/packaging/materials"
                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rose-800 hover:text-rose-950"
                      >
                        Abrir materiales
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {lowStock.slice(0, 2).map((m) => (
                        <li
                          key={m.id}
                          className="truncate text-[13px] text-rose-950/90"
                          title={`${m.nombre_material} · ${m.cantidad_disponible} ${m.unidad_medida}`}
                        >
                          <span className="font-medium">{m.nombre_material}</span>
                          <span className="text-rose-900/75">
                            {' '}
                            · {m.cantidad_disponible} {m.unidad_medida}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {lowStock.length > 2 && (
                      <p className="mt-1.5 text-[11px] text-rose-800/70">+{lowStock.length - 2} más</p>
                    )}
                  </div>
                </div>
              )}
              {openProcessesCount > 0 && (
                <div className="flex gap-3 rounded-2xl border border-amber-100/90 bg-amber-50/35 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 text-amber-800">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-amber-950">Procesos abiertos</p>
                      <Link
                        to="/processes"
                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-amber-900 hover:text-amber-950"
                      >
                        Revisar
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <p className="mt-1 text-[13px] text-amber-950/85">
                      {openProcessesCount} pendiente{openProcessesCount === 1 ? '' : 's'} de cierre.
                    </p>
                  </div>
                </div>
              )}
              {counts && counts.pt_tags > 0 && counts.dispatches === 0 && (
                <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200/80">
                    <Info className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Sin despachos aún</p>
                      <Link
                        to="/dispatches"
                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Despachos
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-500">Unidades PT en sistema, despacho pendiente.</p>
                  </div>
                </div>
              )}
              {lowStock.length === 0 && openProcessesCount === 0 && !(counts && counts.pt_tags > 0 && counts.dispatches === 0) && (
                <p className={emptyStateBanner}>Sin alertas.</p>
              )}
            </div>
          )}
        </section>

        {/* Flujo — pipeline ejecutivo */}
        <section aria-labelledby="flow-heading" className="space-y-4">
          <div>
            <h2 id="flow-heading" className={sectionTitle}>
              Flujo operativo
            </h2>
            <p className={sectionHint}>Volumen acumulado por etapa.</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-6 sm:px-6 sm:py-8">
            {!counts && tracePending && <Skeleton className="h-28 w-full rounded-xl" />}
            {flowSteps && (
              <div className="flex flex-col items-stretch lg:flex-row lg:items-center lg:justify-between">
                {flowSteps.map((step, idx) => (
                  <Fragment key={step.label}>
                    <div className="flex flex-1 flex-col items-center px-2 py-3 text-center lg:min-w-0 lg:py-1">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 text-xs font-semibold tabular-nums text-slate-500">
                        {idx + 1}
                      </span>
                      <span className="mt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{step.label}</span>
                      <span className="mt-0.5 text-[10px] text-slate-400">{step.short}</span>
                      <span className="mt-3 text-[1.75rem] font-semibold tabular-nums tracking-tight text-slate-900 sm:text-[2rem]">
                        {step.n}
                      </span>
                      <span className="mt-1 text-[10px] text-slate-400">registros</span>
                    </div>
                    {idx < flowSteps.length - 1 && (
                      <div
                        className="mx-auto h-8 w-px shrink-0 bg-slate-200/80 lg:mx-2 lg:h-px lg:w-6 lg:min-w-[1.25rem] lg:bg-slate-200/70"
                        aria-hidden
                      />
                    )}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Accesos rápidos — agrupados, secundarios */}
        <section aria-labelledby="quick-heading" className="space-y-3">
          <h2 id="quick-heading" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Accesos rápidos
          </h2>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/receptions">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <Import className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nueva recepción</span>
                    <span className="text-[11px] font-normal text-slate-400">Ingreso</span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/processes">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nuevo proceso</span>
                    <span className="text-[11px] font-normal text-slate-400">Fruta</span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/pt-tags">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <Tag className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nueva unidad PT</span>
                    <span className="text-[11px] font-normal text-slate-400">Tarja</span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/dispatches">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <Truck className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nuevo despacho</span>
                    <span className="text-[11px] font-normal text-slate-400">Salida</span>
                  </span>
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Actividad — compacta, menor peso */}
        <section aria-labelledby="activity-heading" className="space-y-3">
          <div>
            <h2 id="activity-heading" className="text-sm font-medium text-slate-500">
              Actividad reciente
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Últimos eventos (mixtos).</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-2 sm:px-5">
            {activityLoading && (
              <div className="space-y-2 py-3">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            )}
            {!activityLoading && activityRows.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400">Sin datos.</p>
            )}
            {!activityLoading && activityRows.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {activityRows.map((row) => (
                  <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5">
                    <span className="w-32 shrink-0 text-[11px] tabular-nums text-slate-400">{row.whenLabel}</span>
                    <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {row.kind}
                    </span>
                    <Link
                      to={row.to}
                      className="min-w-0 flex-1 truncate text-sm text-slate-800 underline-offset-2 hover:underline"
                    >
                      {row.detail}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Footer enlaces */}
        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-8 text-[11px] text-slate-400">
          <Link to="/plant" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <Factory className="h-3.5 w-3.5" />
            Planta
          </Link>
          <Link to="/masters" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <Library className="h-3.5 w-3.5" />
            Mantenedores
          </Link>
          <Link to="/reporting" className="text-slate-500 transition-colors hover:text-slate-700">
            Reportes
          </Link>
          <Link to="/guide/sistema" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <GitBranch className="h-3.5 w-3.5" />
            Guía
          </Link>
          <Link to="/about" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <Info className="h-3.5 w-3.5" />
            Acerca
          </Link>
        </footer>
    </div>
  );
}
