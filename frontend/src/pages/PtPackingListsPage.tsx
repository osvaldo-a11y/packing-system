import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, Filter, Info, ListOrdered, MoreHorizontal } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { PineBoxesIcon, PineCubeIcon, PineDocumentIcon, PineSnowflakeIcon, PineWeightIcon } from '@/components/icons/pinebloom';
import { appBranding } from '@/lib/branding';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatLb } from '@/lib/number-format';
import {
  badgePill,
  emptyStatePanel,
  errorStateCard,
  filterInputClass,
  filterSelectClass,
  kpiCard,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  pageInfoButton,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

export type PtPackingListSummary = {
  id: number;
  list_code: string;
  client_id: number | null;
  client_nombre: string | null;
  list_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  reversed_at: string | null;
  pallet_count: number;
  total_boxes: number;
  total_pounds: number;
  numero_bol?: string | null;
  dispatch_id?: number | null;
  orden_id?: number | null;
  order_number?: string | null;
};

/** Solo pallets para resumen de formatos (mismo endpoint que el detalle). */
type PtPlDetailFormats = { pallets: { format_code: string | null }[] };

const FORMAT_PREFETCH_MAX = 36;

/**
 * Avance visual de preparación usando solo campos del listado (sin denominador de pedido en API).
 * Borrador vacío → bajo; con pallets → medio; con BOL → alto; confirmado → 100%; anulado → 0.
 */
function packingListAdvancePct(r: PtPackingListSummary): number {
  const st = String(r.status || '').toLowerCase();
  if (st === 'anulado') return 0;
  if (st === 'confirmado') {
    // Histórico con reversa: mismo cierre operativo (100%) pero se distingue en barra/tooltip.
    return 100;
  }
  const pallets = r.pallet_count ?? 0;
  const bol = !!(r.numero_bol?.trim());
  if (pallets <= 0) return 10;
  if (!bol) return 55;
  return 90;
}

function summarizeFormatCodesFromPallets(pallets: { format_code: string | null }[]): string {
  const codes = [
    ...new Set(
      pallets
        .map((p) => p.format_code?.trim())
        .filter((x): x is string => !!x && x.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  if (codes.length === 0) return '—';
  if (codes.length === 1) return codes[0];
  if (codes.length === 2) return `${codes[0]} · ${codes[1]}`;
  return `${codes[0]} · ${codes[1]} · +${codes.length - 2}`;
}

function plCompactRowTone(
  r: PtPackingListSummary,
  t: (key: string) => string,
): { bar: string; badgeClass: string; shortLabel: string } {
  const st = String(r.status || '').toLowerCase();
  const hasRev = !!r.reversed_at;
  if (st === 'anulado') {
    return {
      bar: 'bg-rose-500',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-900',
      shortLabel: t('ptPackingLists.tone.voided'),
    };
  }
  if (st === 'confirmado') {
    const dispatched = r.dispatch_id != null && Number(r.dispatch_id) > 0;
    if (dispatched) {
      return {
        bar: hasRev ? 'bg-violet-500' : 'bg-slate-400',
        badgeClass: 'border-slate-200 bg-slate-100 text-slate-800',
        shortLabel: t('ptPackingLists.tone.inDispatch'),
      };
    }
    return {
      bar: hasRev ? 'bg-violet-500' : 'bg-emerald-500',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      shortLabel: t('ptPackingLists.tone.complete'),
    };
  }
  if ((r.pallet_count ?? 0) === 0) {
    return {
      bar: hasRev ? 'bg-violet-500' : 'bg-slate-300',
      badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
      shortLabel: t('ptPackingLists.tone.pending'),
    };
  }
  return {
    bar: hasRev ? 'bg-violet-500' : 'bg-sky-500',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-900',
    shortLabel: t('ptPackingLists.tone.inProgress'),
  };
}

function plCompletenessLabel(
  r: PtPackingListSummary,
  t: (key: string) => string,
): string {
  const st = String(r.status || '').toLowerCase();
  const rev =
    r.reversed_at && st !== 'anulado' ? t('ptPackingLists.completeness.reversalSuffix') : '';
  if (st === 'anulado') return t('ptPackingLists.completeness.voided');
  if (st === 'confirmado') {
    return (
      (r.dispatch_id != null && Number(r.dispatch_id) > 0
        ? t('ptPackingLists.completeness.dispatched')
        : t('ptPackingLists.completeness.confirmed')) + rev
    );
  }
  if ((r.pallet_count ?? 0) === 0) return t('ptPackingLists.completeness.empty') + rev;
  return t('ptPackingLists.completeness.inProgress') + rev;
}

function formatListDate(isoOrYmd: string) {
  try {
    const d = new Date(isoOrYmd.includes('T') ? isoOrYmd : `${isoOrYmd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoOrYmd;
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoOrYmd;
  }
}

function PlStatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    borrador: 'border-slate-200 bg-slate-100 text-slate-800',
    confirmado: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
  };
  const labelMap: Record<string, string> = {
    borrador: t('ptPackingLists.status.borrador'),
    confirmado: t('ptPackingLists.status.confirmado'),
    anulado: t('ptPackingLists.status.anulado'),
  };
  return (
    <span className={cn(badgePill, map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800')} title={status}>
      {labelMap[s] ?? status}
    </span>
  );
}

function notesPreview(notes: string | null): { text: string; title?: string } {
  const n = notes?.trim();
  if (!n) return { text: '' };
  if (n.length <= 48) return { text: n, title: n };
  return { text: `${n.slice(0, 48)}…`, title: n };
}

function PlAdvanceBar({
  pct,
  hasReversal,
  className,
}: {
  pct: number;
  hasReversal?: boolean;
  className?: string;
}) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  const fill = hasReversal
    ? 'bg-violet-500'
    : w >= 100
      ? 'bg-emerald-500'
      : w >= 70
        ? 'bg-sky-500'
        : w >= 25
          ? 'bg-amber-500'
          : 'bg-slate-400';
  return (
    <div
      className={cn('flex min-w-[100px] max-w-[140px] flex-col gap-0.5', className)}
      title={
        hasReversal
          ? 'PL con reversa registrada en historial. Avance según estado actual; barra en violeta para distinguir del flujo activo.'
          : 'Avance visual según estado del PL, pallets cargados y BOL (no incluye meta de pedido en este listado).'
      }
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-right text-[11px] font-semibold tabular-nums text-slate-700">{w}%</span>
    </div>
  );
}

function CondicionCell({
  numeroBol,
  notes,
  dispatchId,
  t,
}: {
  numeroBol: string | null | undefined;
  notes: string | null;
  dispatchId: number | null | undefined;
  t: (key: string) => string;
}) {
  const np = notesPreview(notes);
  const bol = numeroBol?.trim();
  return (
    <div className="max-w-[220px] space-y-1.5">
      {dispatchId != null && dispatchId > 0 ? (
        <span className="inline-flex rounded-full border border-sky-200/90 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900">
          {t('ptPackingLists.condicion.inDispatch')}
        </span>
      ) : null}
      <div className="font-mono text-xs text-slate-800">
        {bol ? `${t('ptPackingLists.condicion.bolPrefix')}${bol}` : t('ptPackingLists.condicion.noBol')}
      </div>
      {np.text ? (
        <p className="text-xs leading-snug text-slate-500" title={np.title}>
          {np.text}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">{t('ptPackingLists.condicion.noNotes')}</p>
      )}
    </div>
  );
}

export function PtPackingListsPage() {
  const { t } = useTranslation('common');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterClientId, setFilterClientId] = useState(0);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['pt-packing-lists'],
    queryFn: () => apiJson<PtPackingListSummary[]>('/api/pt-packing-lists'),
  });

  const clientOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of data ?? []) {
      if (r.client_id != null && r.client_id > 0 && r.client_nombre?.trim()) {
        m.set(r.client_id, r.client_nombre.trim());
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    let list = data;
    if (filterStatus) {
      list = list.filter((r) => String(r.status).toLowerCase() === filterStatus.toLowerCase());
    }
    if (filterClientId > 0) {
      list = list.filter((r) => Number(r.client_id ?? 0) === filterClientId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.list_code.toLowerCase().includes(q) ||
          String(r.id).includes(q) ||
          (r.numero_bol?.toLowerCase().includes(q) ?? false) ||
          (r.client_nombre?.toLowerCase().includes(q) ?? false) ||
          (r.notes?.toLowerCase().includes(q) ?? false) ||
          (r.order_number?.toLowerCase().includes(q) ?? false) ||
          (r.dispatch_id != null && String(r.dispatch_id).includes(q)) ||
          (r.orden_id != null && String(r.orden_id).includes(q)),
      );
    }
    return list;
  }, [data, filterStatus, filterClientId, search]);

  const detailPrefetchIds = useMemo(() => {
    if (filtered.length === 0) return [];
    if (filtered.length <= FORMAT_PREFETCH_MAX) return filtered.map((r) => r.id);
    return [...filtered]
      .sort((a, b) => b.total_boxes - a.total_boxes)
      .slice(0, FORMAT_PREFETCH_MAX)
      .map((r) => r.id);
  }, [filtered]);

  const detailQueries = useQueries({
    queries: detailPrefetchIds.map((id) => ({
      queryKey: ['pt-packing-list', id],
      queryFn: () => apiJson<PtPlDetailFormats>(`/api/pt-packing-lists/${id}`),
      staleTime: 5 * 60_000,
      enabled: viewMode === 'compact' && (data?.length ?? 0) > 0 && detailPrefetchIds.length > 0,
    })),
  });

  const formatSummaryByPlId = useMemo(() => {
    const m = new Map<number, string>();
    for (let i = 0; i < detailPrefetchIds.length; i++) {
      const id = detailPrefetchIds[i];
      const row = detailQueries[i]?.data;
      if (row?.pallets?.length) m.set(id, summarizeFormatCodesFromPallets(row.pallets));
    }
    return m;
  }, [detailPrefetchIds, detailQueries]);

  const prefetchIdSet = useMemo(() => new Set(detailPrefetchIds), [detailPrefetchIds]);

  const groupedByClient = useMemo(() => {
    type G = {
      key: string;
      clientLabel: string;
      clientId: number;
      rows: PtPackingListSummary[];
      totalBoxes: number;
      totalLb: number;
      plCount: number;
      hasBorrador: boolean;
      hasEmptyBorrador: boolean;
      hasReversa: boolean;
    };
    const map = new Map<string, G>();
    for (const r of filtered) {
      const cid = r.client_id != null && r.client_id > 0 ? Number(r.client_id) : 0;
      const key = cid > 0 ? `c-${cid}` : 'sin';
      const clientLabel = cid > 0 ? (r.client_nombre?.trim() || `Cliente #${cid}`) : 'Sin cliente';
      const g =
        map.get(key) ??
        ({
          key,
          clientLabel,
          clientId: cid,
          rows: [],
          totalBoxes: 0,
          totalLb: 0,
          plCount: 0,
          hasBorrador: false,
          hasEmptyBorrador: false,
          hasReversa: false,
        } satisfies G);
      g.rows.push(r);
      g.totalBoxes += Number(r.total_boxes) || 0;
      g.totalLb += Number(r.total_pounds) || 0;
      g.plCount += 1;
      if (r.reversed_at) g.hasReversa = true;
      if (String(r.status || '').toLowerCase() === 'borrador') {
        g.hasBorrador = true;
        if ((r.pallet_count ?? 0) === 0) g.hasEmptyBorrador = true;
      }
      map.set(key, g);
    }
    return [...map.values()]
      .sort((a, b) => b.totalBoxes - a.totalBoxes)
      .map((g) => ({
        ...g,
        rows: g.rows.slice().sort((a, b) => b.id - a.id),
      }));
  }, [filtered]);

  const kpis = useMemo(() => {
    const list = filtered;
    let borrador = 0;
    let confirmado = 0;
    let anulado = 0;
    let conReversa = 0;
    let enDespacho = 0;
    let conPedido = 0;
    let totalCajas = 0;
    let totalLb = 0;
    let confirmadosSinPallets = 0;
    const clientes = new Set<number>();
    for (const r of list) {
      const st = String(r.status || '').toLowerCase();
      if (st === 'borrador') borrador++;
      else if (st === 'confirmado') {
        confirmado++;
        if ((r.pallet_count ?? 0) === 0) confirmadosSinPallets += 1;
      } else if (st === 'anulado') anulado++;
      totalCajas += Number(r.total_boxes) || 0;
      totalLb += Number(r.total_pounds) || 0;
      if (r.client_id != null && r.client_id > 0) clientes.add(r.client_id);
      if (r.reversed_at) conReversa++;
      if (r.dispatch_id != null && r.dispatch_id > 0) enDespacho++;
      if (r.orden_id != null && r.orden_id > 0) conPedido++;
    }

    return {
      total: list.length,
      borrador,
      confirmado,
      anulado,
      conReversa,
      enDespacho,
      conPedido,
      totalCajas,
      totalLb,
      clientesActivos: clientes.size,
      confirmadosSinPallets,
    };
  }, [filtered]);

  const sinCliente = useMemo(
    () => (data ?? []).filter((r) => (r.client_id == null || r.client_id <= 0) && r.status !== 'anulado').length,
    [data],
  );

  const borradoresVacios = useMemo(
    () => (data ?? []).filter((r) => r.status === 'borrador' && (r.pallet_count ?? 0) === 0).length,
    [data],
  );

  const helpTitle = t('ptPackingLists.helpTitle');

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className={errorStateCard}>
        <CardHeader>
          <CardTitle>Error al cargar packing lists</CardTitle>
          <CardDescription>{(error as Error)?.message ?? 'Error'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5 max-lg:overflow-x-hidden lg:-mx-7 lg:min-h-[calc(100vh-52px)] lg:space-y-0 lg:bg-[#F9F7F5] lg:px-7">
      <header
        data-pl-mobile-hero
        className="relative overflow-hidden rounded-[14px] border border-[var(--stone-300)] bg-white/55 px-3.5 pb-2.5 pt-3 lg:hidden"
      >
        <div className="relative z-[1]">
          <h1 className="font-serif text-[31px] font-semibold leading-none tracking-[-0.55px] text-[var(--ink)]">
            {t('existenciasPt.layout.tabPackingLists')}
          </h1>
          <div className="mt-1.5 flex items-start gap-2 text-[14px] leading-snug text-[var(--ink-muted)]">
            <span>{t('ptPackingLists.pageSubtitle')}</span>
            <button
              type="button"
              className={cn(pageInfoButton, 'mt-0.5 shrink-0')}
              title={helpTitle}
              aria-label={t('existenciasPt.layout.tabPackingLists')}
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <Button asChild variant="outline" className="mt-2 h-10 w-full gap-1.5 rounded-[8px] border-[var(--stone-300)] bg-white px-2 text-[12px] font-semibold shadow-none">
            <Link to="/existencias-pt/inventario">
              <ListOrdered className="h-3.5 w-3.5" />
              {t('ptPackingLists.inventoryButton')}
            </Link>
          </Button>
        </div>
        <div className="relative mt-2 h-[70px] overflow-hidden border-t border-[var(--stone-200)]">
          <p className="absolute left-0 top-2 z-[1] w-[132px] text-[9px] font-medium uppercase leading-[1.45] tracking-[0.17em] text-[var(--olive-700)]">
            <span className="block">FRUTA DE NUESTRA</span>
            <span className="block">TIERRA.</span>
            <span className="block">UN FUTURO MÁS</span>
            <span className="block">BRILLANTE.</span>
          </p>
          <img
            src={appBranding.landscapeUrl}
            alt=""
            className="pointer-events-none absolute bottom-[-4px] right-[-3px] h-[76px] w-[228px] max-w-none object-contain object-right-bottom opacity-[0.72] contrast-[0.97] brightness-[1.04] saturate-[0.62] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.25)_18%,black_42%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.25)_18%,black_42%,black_100%)]"
            aria-hidden
          />
        </div>
      </header>

      <nav
        data-pl-mobile-tabs
        className="grid grid-cols-2 gap-1.5 lg:hidden"
        aria-label={t('existenciasPt.layout.navAriaLabel')}
      >
        {[
          { to: '/existencias-pt/inventario', label: t('existenciasPt.layout.tabInventory'), end: true as const },
          { to: '/existencias-pt/repaletizar', label: t('existenciasPt.layout.tabRepallet') },
          { to: '/existencias-pt/packing-lists', label: t('existenciasPt.layout.tabPackingLists'), wide: true },
        ].map(({ to, label, end = false, wide }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'rounded-[8px] px-2 py-2 text-center text-[12px] font-semibold leading-tight',
                wide && 'col-span-2',
                isActive
                  ? 'bg-[var(--olive-700)] text-white'
                  : 'border border-[var(--stone-300)] bg-white text-[var(--ink-muted)]',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <header
        data-pl-desktop-hero
        className="relative hidden overflow-hidden rounded-[14px] border border-[var(--stone-300)] bg-white/55 px-3.5 pb-3 pt-3.5 lg:flex lg:h-[171px] lg:min-h-[171px] lg:items-start lg:justify-between lg:gap-5 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-[var(--stone-200)] lg:bg-transparent lg:px-0 lg:pb-5 lg:pl-2 lg:pt-7"
      >
        <img
          src={appBranding.landscapeUrl}
          alt=""
          className="pointer-events-none absolute right-0 top-1 hidden h-[118%] w-[680px] max-w-[62%] object-contain object-right opacity-[0.78] contrast-[0.96] brightness-[1.03] saturate-[0.68] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] lg:block"
          aria-hidden
        />
        <div className="relative z-[1] min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <h1 className={cn(pageTitle, 'lg:font-serif lg:text-[66px] lg:font-semibold lg:leading-[1.05] lg:tracking-[-0.9px] lg:text-[var(--ink)]')}>
              {t('existenciasPt.layout.tabPackingLists')}
            </h1>
            <button
              type="button"
              className={cn(pageInfoButton, 'lg:mt-1')}
              title={helpTitle}
              aria-label={t('existenciasPt.layout.tabPackingLists')}
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className={cn(pageSubtitle, 'lg:max-w-[38rem] lg:font-serif lg:text-[22px] lg:leading-tight lg:text-[var(--ink-muted)]')}>
            {t('ptPackingLists.pageSubtitle')}
          </p>
        </div>
        <div className="relative z-[1] flex shrink-0 flex-col items-end gap-2">
          <Button asChild variant="outline" className="h-10 min-w-[168px] rounded-[var(--radius-md)] border-[var(--stone-300)] bg-white px-4 text-[13px] font-semibold shadow-none hover:bg-[var(--stone-100)]">
            <Link to="/existencias-pt/inventario" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              {t('ptPackingLists.inventoryButton')}
            </Link>
          </Button>
        </div>
      </header>

      <nav
        data-pl-desktop-tabs
        className="mb-2 hidden lg:flex lg:flex-wrap lg:gap-1"
        aria-label={t('existenciasPt.layout.navAriaLabel')}
      >
        {[
          { to: '/existencias-pt/inventario', label: t('existenciasPt.layout.tabInventory'), end: true as const },
          { to: '/existencias-pt/repaletizar', label: t('existenciasPt.layout.tabRepallet') },
          { to: '/existencias-pt/packing-lists', label: t('existenciasPt.layout.tabPackingLists') },
        ].map(({ to, label, end = false }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'rounded-[8px] px-3 py-1 text-[12px] font-semibold transition-colors',
                isActive
                  ? 'bg-[var(--olive-700)] text-white'
                  : 'border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--stone-100)] hover:text-[var(--ink)]',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <section data-pl-mobile-kpis aria-labelledby="pl-kpis" className="space-y-2 lg:hidden">
        <h2 id="pl-kpis" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
          {t('ptPackingLists.srKpis')}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: t('ptPackingLists.kpi.total'),
              value: formatCount(kpis.total),
              note: t('ptPackingLists.kpi.totalNote'),
              Icon: PineDocumentIcon,
              card: 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
              well: 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
            },
            {
              label: t('ptPackingLists.kpi.drafts'),
              value: formatCount(kpis.borrador),
              note: t('ptPackingLists.kpi.draftsNote'),
              Icon: PineSnowflakeIcon,
              card: 'border-[var(--stone-300)] bg-[var(--stone-100)]',
              well: 'bg-[#DED9CF] text-[#41443F]',
            },
            {
              label: t('ptPackingLists.kpi.confirmed'),
              value: formatCount(kpis.confirmado),
              note: t('ptPackingLists.kpi.confirmedNote'),
              Icon: PineCubeIcon,
              card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
              well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
            },
            {
              label: t('ptPackingLists.kpi.inDispatch'),
              value: formatCount(kpis.enDespacho),
              note: t('ptPackingLists.kpi.inDispatchNote'),
              Icon: PineBoxesIcon,
              card: kpis.enDespacho > 0 ? 'border-sky-200/90 bg-sky-50/50' : 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
              well: kpis.enDespacho > 0 ? 'bg-sky-100 text-sky-950' : 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
            },
          ].map(({ label, value, note, Icon, card, well }) => (
            <div
              key={label}
              className={cn(
                kpiCard,
                'min-h-[112px] flex-row items-start gap-2.5 rounded-[var(--radius-lg)] px-3 py-3',
                card,
              )}
            >
              <span className={cn('inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[9px]', well)} aria-hidden>
                <Icon size={36} className="h-[30px] w-[30px]" />
              </span>
              <div className="min-w-0">
                <p className="font-serif text-[12px] font-semibold leading-tight text-[var(--ink)]">{label}</p>
                <p className="mt-1 font-serif text-[20px] font-bold tabular-nums leading-tight tracking-[-0.65px] text-[var(--ink)]">{value}</p>
                <p className="mt-1 text-[11px] leading-tight text-[var(--ink-muted)]">{note}</p>
              </div>
            </div>
          ))}
        </div>
        <div data-pl-mobile-secondary className="grid grid-cols-1 gap-1.5">
          {[
            { label: t('ptPackingLists.kpi.totalBoxes'), value: formatCount(kpis.totalCajas), note: t('ptPackingLists.kpi.totalBoxesNote'), Icon: PineCubeIcon },
            { label: t('ptPackingLists.kpi.totalWeight'), value: formatLb(kpis.totalLb, 2), note: t('ptPackingLists.kpi.totalWeightNote'), Icon: PineWeightIcon },
            { label: t('ptPackingLists.kpi.clients'), value: formatCount(kpis.clientesActivos), note: t('ptPackingLists.kpi.clientsNote'), Icon: PineDocumentIcon },
            { label: t('ptPackingLists.kpi.linkedOrders'), value: formatCount(kpis.conPedido), note: t('ptPackingLists.kpi.linkedOrdersNote'), Icon: PineBoxesIcon },
          ].map(({ label, value, note, Icon }) => (
            <div key={label} className="flex min-h-[42px] items-center justify-between gap-2 rounded-[8px] border border-[var(--stone-200)] bg-white/65 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--stone-100)] text-[var(--ink-muted)]" aria-hidden>
                  <Icon size={16} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{label}</p>
                  <p className="truncate text-[10px] text-[var(--ink-muted)]">{note}</p>
                </div>
              </div>
              <p className="shrink-0 font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">{value}</p>
            </div>
          ))}
          <div className={cn('flex min-h-[42px] items-center justify-between gap-3 rounded-[8px] border px-3', kpis.anulado > 0 ? 'border-[var(--stone-300)] bg-[var(--stone-100)]' : 'border-[var(--stone-200)] bg-white/65')}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('ptPackingLists.kpi.voided')}</p>
            <p className="font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">{formatCount(kpis.anulado)}</p>
          </div>
          <div className={cn('flex min-h-[42px] items-center justify-between gap-3 rounded-[8px] border px-3', kpis.conReversa > 0 ? 'border-violet-200/85 bg-violet-50/40' : 'border-[var(--stone-200)] bg-white/65')}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('ptPackingLists.kpi.withReversal')}</p>
            <p className={cn('font-serif text-[18px] font-semibold tabular-nums leading-none', kpis.conReversa > 0 ? 'text-violet-950' : 'text-[var(--ink)]')}>{formatCount(kpis.conReversa)}</p>
          </div>
        </div>
      </section>

      <section
        data-pl-desktop-kpis
        aria-labelledby="pl-kpis-desktop"
        className="hidden space-y-2.5 lg:block lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white/45 lg:px-[14px] lg:py-2.5"
      >
        <h2 id="pl-kpis-desktop" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
          {t('ptPackingLists.srKpis')}
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: t('ptPackingLists.kpi.total'),
              value: formatCount(kpis.total),
              note: t('ptPackingLists.kpi.totalNote'),
              Icon: PineDocumentIcon,
              card: 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
              well: 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
            },
            {
              label: t('ptPackingLists.kpi.drafts'),
              value: formatCount(kpis.borrador),
              note: t('ptPackingLists.kpi.draftsNote'),
              Icon: PineSnowflakeIcon,
              card: 'border-[var(--stone-300)] bg-[var(--stone-100)]',
              well: 'bg-[#DED9CF] text-[#41443F]',
            },
            {
              label: t('ptPackingLists.kpi.confirmed'),
              value: formatCount(kpis.confirmado),
              note: t('ptPackingLists.kpi.confirmedNote'),
              Icon: PineCubeIcon,
              card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
              well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
            },
            {
              label: t('ptPackingLists.kpi.inDispatch'),
              value: formatCount(kpis.enDespacho),
              note: t('ptPackingLists.kpi.inDispatchNote'),
              Icon: PineBoxesIcon,
              card: kpis.enDespacho > 0 ? 'border-sky-200/90 bg-sky-50/50' : 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
              well: kpis.enDespacho > 0 ? 'bg-sky-100 text-sky-950' : 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
            },
          ].map(({ label, value, note, Icon, card, well }) => (
            <div
              key={label}
              className={cn(
                kpiCard,
                'lg:flex lg:min-h-[104px] lg:flex-row lg:items-center lg:gap-4 lg:rounded-[var(--radius-lg)] lg:px-3.5 lg:py-3',
                card,
              )}
            >
              <span className={cn('inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[9px]', well)} aria-hidden>
                <Icon size={36} className="h-9 w-9" />
              </span>
              <div className="min-w-0">
                <p className={cn(kpiLabel, 'lg:font-serif lg:text-[13px] lg:font-medium lg:normal-case lg:tracking-normal lg:text-[var(--ink)]')}>{label}</p>
                <p className={cn(kpiValueLg, 'lg:mt-1 lg:font-serif lg:text-[28px] lg:font-bold lg:tabular-nums lg:leading-none lg:tracking-[-0.65px] lg:text-[var(--ink)]')}>
                  {value}
                </p>
                <p className={cn(kpiFootnote, 'lg:mt-1 lg:text-[11px] lg:leading-tight lg:text-[var(--ink-muted)]')}>{note}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: t('ptPackingLists.kpi.totalBoxes'), value: formatCount(kpis.totalCajas), note: t('ptPackingLists.kpi.totalBoxesNote'), Icon: PineCubeIcon },
            { label: t('ptPackingLists.kpi.totalWeight'), value: formatLb(kpis.totalLb, 2), note: t('ptPackingLists.kpi.totalWeightNote'), Icon: PineWeightIcon },
            { label: t('ptPackingLists.kpi.clients'), value: formatCount(kpis.clientesActivos), note: t('ptPackingLists.kpi.clientsNote'), Icon: PineDocumentIcon },
            { label: t('ptPackingLists.kpi.linkedOrders'), value: formatCount(kpis.conPedido), note: t('ptPackingLists.kpi.linkedOrdersNote'), Icon: PineBoxesIcon },
          ].map(({ label, value, note, Icon }) => (
            <div key={label} className="flex min-h-[42px] items-center justify-between gap-2 rounded-[8px] border border-[var(--stone-200)] bg-white/65 px-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--stone-100)] text-[var(--ink-muted)]" aria-hidden>
                  <Icon size={16} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{label}</p>
                  <p className="truncate text-[10px] text-[var(--ink-muted)]">{note}</p>
                </div>
              </div>
              <p className="shrink-0 font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className={cn('flex min-h-[42px] items-center justify-between gap-3 rounded-[8px] border px-3', kpis.anulado > 0 ? 'border-[var(--stone-300)] bg-[var(--stone-100)]' : 'border-[var(--stone-200)] bg-white/65')}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('ptPackingLists.kpi.voided')}</p>
            <p className="font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">{formatCount(kpis.anulado)}</p>
          </div>
          <div className={cn('flex min-h-[42px] items-center justify-between gap-3 rounded-[8px] border px-3', kpis.conReversa > 0 ? 'border-violet-200/85 bg-violet-50/40' : 'border-[var(--stone-200)] bg-white/65')}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('ptPackingLists.kpi.withReversal')}</p>
            <p className={cn('font-serif text-[18px] font-semibold tabular-nums leading-none', kpis.conReversa > 0 ? 'text-violet-950' : 'text-[var(--ink)]')}>{formatCount(kpis.conReversa)}</p>
          </div>
        </div>
      </section>

      <div
        data-pl-mobile-filters
        className="space-y-2 rounded-[12px] border border-[var(--stone-300)] bg-white/70 p-3 lg:hidden"
      >
        <Input
          className={cn(filterInputClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')}
          placeholder={t('ptPackingLists.filters.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('ptPackingLists.filters.search')}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className={cn(filterSelectClass, 'h-11 w-full min-w-0 border-[var(--stone-300)] bg-white text-[13px]')}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label={t('ptPackingLists.filters.status')}
          >
            <option value="">{t('ptPackingLists.filters.status')} · {t('ptPackingLists.filters.statusAll')}</option>
            <option value="borrador">{t('ptPackingLists.filters.statusDraft')}</option>
            <option value="confirmado">{t('ptPackingLists.filters.statusConfirmed')}</option>
            <option value="anulado">{t('ptPackingLists.filters.statusVoided')}</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-w-0 gap-1 rounded-[8px] border-[var(--stone-300)] bg-white px-2 text-[12px] font-semibold"
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span className="truncate">{showMoreFilters ? t('existenciasPt.filters.hideFilters') : t('existenciasPt.filters.moreFilters')}</span>
            <ChevronDown className={cn('ml-auto h-3.5 w-3.5 shrink-0 transition-transform', showMoreFilters ? 'rotate-180' : '')} />
          </Button>
        </div>
        {showMoreFilters ? (
          <div className="grid gap-1 border-t border-[var(--stone-200)] pt-3">
            <Label className="text-[11px] text-[var(--ink-muted)]">{t('ptPackingLists.filters.client')}</Label>
            <select
              className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')}
              value={filterClientId}
              onChange={(e) => setFilterClientId(Number(e.target.value))}
              aria-label={t('ptPackingLists.filters.client')}
            >
              <option value={0}>{t('ptPackingLists.filters.clientAll')}</option>
              {clientOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div
        data-pl-desktop-filters
        className="mt-3 hidden min-h-[62px] rounded-[10px] border border-[var(--stone-300)] bg-white/70 px-3.5 py-[11px] lg:block"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-[16rem] flex-1">
            <Input
              className={cn(filterInputClass, 'h-10 border-[var(--stone-300)] bg-white')}
              placeholder={t('ptPackingLists.filters.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('ptPackingLists.filters.search')}
            />
          </div>
          <select
            className={cn(filterSelectClass, 'h-10 w-[11rem] border-[var(--stone-300)] bg-white')}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label={t('ptPackingLists.filters.status')}
          >
            <option value="">{t('ptPackingLists.filters.status')} · {t('ptPackingLists.filters.statusAll')}</option>
            <option value="borrador">{t('ptPackingLists.filters.statusDraft')}</option>
            <option value="confirmado">{t('ptPackingLists.filters.statusConfirmed')}</option>
            <option value="anulado">{t('ptPackingLists.filters.statusVoided')}</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-w-[146px] gap-1.5 border-[var(--stone-300)] bg-white px-4"
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" strokeWidth={2} aria-hidden />
            {showMoreFilters ? t('existenciasPt.filters.hideFilters') : t('existenciasPt.filters.moreFilters')}
            <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', showMoreFilters ? 'rotate-180' : '')} />
          </Button>
        </div>
        {showMoreFilters ? (
          <div className="mt-3 grid grid-cols-12 items-end gap-2 border-t border-[var(--stone-200)] pt-3">
            <div className="col-span-4 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('ptPackingLists.filters.client')}</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                value={filterClientId}
                onChange={(e) => setFilterClientId(Number(e.target.value))}
              >
                <option value={0}>{t('ptPackingLists.filters.clientAll')}</option>
                {clientOptions.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      <section
        data-pl-mobile-list
        className="space-y-0 overflow-hidden rounded-[12px] border border-[var(--stone-300)] bg-white lg:mt-[14px] lg:space-y-0 lg:overflow-hidden lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white"
        aria-labelledby="pl-tabla"
      >
        <div className="block border-b border-[var(--stone-200)] p-3 lg:flex lg:min-h-[60px] lg:flex-wrap lg:items-center lg:justify-between lg:gap-2 lg:border-b lg:border-[var(--stone-200)] lg:px-[14px] lg:py-2">
          <div>
            <h2 id="pl-tabla" className={cn(sectionTitle, 'max-lg:font-serif max-lg:text-[20px] max-lg:font-semibold max-lg:text-[var(--ink)] lg:font-serif lg:text-[21px] lg:leading-tight lg:text-[var(--ink)]')}>
              {t('ptPackingLists.table.title')}
            </h2>
            <p className={cn(sectionHint, 'max-lg:mt-1 max-lg:text-[11px] max-lg:text-[var(--ink-muted)] lg:mt-0 lg:text-[12px] lg:text-[var(--ink-muted)]')}>
              {viewMode === 'detailed'
                ? t('ptPackingLists.table.hintDetailed', { count: filtered.length })
                : t('ptPackingLists.table.hintCompact', { count: filtered.length })}
            </p>
          </div>
          <div className="mt-3 flex w-full flex-col gap-2 lg:mt-0 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center">
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 max-lg:rounded-[8px] max-lg:border-[var(--stone-300)] lg:w-auto lg:border-[var(--stone-300)]">
              <Button
                type="button"
                variant={viewMode === 'compact' ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 rounded-md px-3 text-xs lg:h-9 lg:px-3.5 lg:text-[12px] max-lg:flex-1 max-lg:shadow-none',
                  viewMode === 'compact' ? 'max-lg:bg-[var(--olive-700)] max-lg:hover:bg-[var(--olive-600)] lg:bg-[var(--olive-700)] lg:hover:bg-[var(--olive-600)]' : '',
                )}
                onClick={() => setViewMode('compact')}
              >
                {t('ptPackingLists.table.viewCompact')}
              </Button>
              <Button
                type="button"
                variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 rounded-md px-3 text-xs lg:h-9 lg:px-3.5 lg:text-[12px] max-lg:flex-1 max-lg:shadow-none',
                  viewMode === 'detailed' ? 'max-lg:bg-[var(--olive-700)] max-lg:hover:bg-[var(--olive-600)] lg:bg-[var(--olive-700)] lg:hover:bg-[var(--olive-600)]' : '',
                )}
                onClick={() => setViewMode('detailed')}
              >
                {t('ptPackingLists.table.viewDetailed')}
              </Button>
            </div>
            <details className="group w-full lg:w-auto">
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 max-lg:flex max-lg:h-11 max-lg:items-center max-lg:justify-center max-lg:border-[var(--stone-300)] max-lg:px-2.5 max-lg:py-2 max-lg:text-[12px] max-lg:font-semibold max-lg:text-[var(--ink-muted)] max-lg:hover:bg-[var(--stone-100)] lg:h-9 lg:border-[var(--stone-300)] lg:px-3 lg:text-[12px] lg:leading-7 lg:text-[var(--ink-muted)] [&::-webkit-details-marker]:hidden">
                {t('ptPackingLists.table.criteria')}
              </summary>
              <div className="mt-1 w-full max-w-none space-y-1 rounded-md border border-slate-200 bg-white p-3 text-[11px] leading-snug text-slate-600 shadow-sm max-lg:border-[var(--stone-300)] max-lg:shadow-none lg:max-w-[min(22rem,calc(100vw-2rem))]">
                <p>
                  <span className="font-semibold text-emerald-700">{t('ptPackingLists.table.criteriaComplete')}</span>{' '}
                  {t('ptPackingLists.table.criteriaCompleteDesc')}
                </p>
                <p>
                  <span className="font-semibold text-sky-700">{t('ptPackingLists.table.criteriaInProgress')}</span>{' '}
                  {t('ptPackingLists.table.criteriaInProgressDesc')}
                </p>
                <p>
                  <span className="font-semibold text-rose-700">{t('ptPackingLists.table.criteriaVoided')}</span>{' '}
                  {t('ptPackingLists.table.criteriaVoidedDesc')}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">{t('ptPackingLists.table.criteria100')}</span>{' '}
                  {t('ptPackingLists.table.criteria100Desc')}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">{t('ptPackingLists.table.criteriaProgress')}</span>{' '}
                  {t('ptPackingLists.table.criteriaProgressDesc')}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">{t('ptPackingLists.table.criteria0')}</span>{' '}
                  {t('ptPackingLists.table.criteria0Desc')}
                </p>
              </div>
            </details>
          </div>
        </div>

        {kpis.totalCajas === 0 && kpis.confirmadosSinPallets > 0 ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {t('ptPackingLists.table.warningNoPallets', { count: formatCount(kpis.confirmadosSinPallets) })}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {t('ptPackingLists.table.warningNoPalletsDesc')}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.length ? (
          <p data-pl-mobile-empty className={cn(emptyStatePanel, 'max-lg:mx-3 max-lg:mb-3 max-lg:flex max-lg:min-h-[170px] max-lg:items-center max-lg:justify-center max-lg:rounded-[11px] max-lg:border-[var(--stone-200)] max-lg:bg-[#FBFCFD] max-lg:px-5 max-lg:py-10 max-lg:text-[13px] max-lg:leading-snug max-lg:text-[var(--bluegray-700)] lg:m-3 lg:min-h-[180px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:py-16 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]')}>{t('ptPackingLists.table.emptyAll')}</p>
        ) : !filtered.length ? (
          <p className={cn(emptyStatePanel, 'max-lg:mx-3 max-lg:mb-3 max-lg:flex max-lg:min-h-[170px] max-lg:items-center max-lg:justify-center max-lg:rounded-[11px] max-lg:border-[var(--stone-200)] max-lg:bg-[#FBFCFD] max-lg:px-5 max-lg:py-10 max-lg:text-[13px] max-lg:leading-snug max-lg:text-[var(--bluegray-700)] lg:m-3 lg:min-h-[180px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:py-16 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]')}>{t('ptPackingLists.table.emptyFilter')}</p>
        ) : (
          <>
            <div className="space-y-3 px-3 pb-3 lg:hidden">
              {viewMode === 'compact'
                ? groupedByClient.map((group) => (
                    <div key={group.key} className="space-y-2">
                      <div className="rounded-[10px] border border-[var(--stone-200)] bg-[var(--stone-50)] px-3 py-2">
                        <p className="font-serif text-[15px] font-semibold text-[var(--ink)]">{group.clientLabel}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                          <span className="font-semibold text-[var(--ink)]">{formatCount(group.totalBoxes)}</span>{' '}
                          {t('ptPackingLists.table.groupBoxes')}
                          {' · '}
                          <span className="font-semibold text-[var(--ink)]">{formatLb(group.totalLb, 2)}</span> lb
                          {' · '}
                          {formatCount(group.plCount)} {t('ptPackingLists.table.groupPl')}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {group.hasEmptyBorrador ? (
                            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                              {t('ptPackingLists.table.groupIncomplete')}
                            </span>
                          ) : group.hasBorrador ? (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                              {t('ptPackingLists.table.groupInProgress')}
                            </span>
                          ) : null}
                          {group.hasReversa ? (
                            <span className="inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
                              {t('ptPackingLists.table.groupWithReversal')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {group.rows.map((r) => {
                        const tone = plCompactRowTone(r, t);
                        const pct = packingListAdvancePct(r);
                        const detailUrl = `/existencias-pt/packing-lists/${r.id}`;
                        const st = String(r.status || '').toLowerCase();
                        const prefetchIdx = detailPrefetchIds.indexOf(r.id);
                        const q = prefetchIdx >= 0 ? detailQueries[prefetchIdx] : undefined;
                        const formatText = prefetchIdSet.has(r.id)
                          ? q?.isPending && !formatSummaryByPlId.has(r.id)
                            ? null
                            : (formatSummaryByPlId.get(r.id) ?? '—')
                          : '—';
                        const bol = r.numero_bol?.trim();
                        return (
                          <article key={r.id} data-pl-mobile-card className="overflow-hidden rounded-[11px] border border-[var(--stone-300)] bg-white">
                            <div className="flex items-start justify-between gap-3 border-b border-[var(--stone-200)] px-3 py-3">
                              <div className="min-w-0 space-y-1">
                                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize', tone.badgeClass)}>
                                  {tone.shortLabel}
                                </span>
                                {r.reversed_at ? (
                                  <span className="ml-1 inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900">
                                    {t('ptPackingLists.table.reversalBadge')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">
                                  {formatCount(r.total_boxes)} {t('ptPackingLists.table.colBoxes').toLowerCase()}
                                </p>
                                <p className="mt-1 text-[11px] tabular-nums text-[var(--ink-muted)]">{formatLb(r.total_pounds, 2)} lb</p>
                              </div>
                            </div>
                            <div className="px-3 py-3">
                              <p className="font-serif text-[18px] font-semibold leading-tight text-[var(--ink)]">{r.list_code}</p>
                              <p className="mt-1 text-[13px] font-semibold text-[var(--ink)]">{r.client_nombre?.trim() || 'Sin cliente'}</p>
                              <p className="text-[12px] tabular-nums text-[var(--ink-muted)]">{formatListDate(r.list_date)}</p>
                              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
                                {t('ptPackingLists.table.colFormats')}: {formatText ?? '—'}
                              </p>
                              <p className="text-[12px] text-[var(--ink-muted)]">
                                {bol ? `${t('ptPackingLists.condicion.bolPrefix')}${bol}` : t('ptPackingLists.condicion.noBol')}
                              </p>
                              {r.orden_id != null && r.orden_id > 0 ? (
                                <p className="text-[12px] text-[var(--ink-muted)]">
                                  {t('ptPackingLists.table.colOrder')}: {r.order_number?.trim() || `#${r.orden_id}`}
                                </p>
                              ) : null}
                              {r.dispatch_id != null && r.dispatch_id > 0 ? (
                                <p className="text-[12px] text-[var(--ink-muted)]">
                                  {t('ptPackingLists.table.colDispatch')} #{r.dispatch_id}
                                </p>
                              ) : null}
                              <div className="mt-2">
                                <PlAdvanceBar pct={pct} hasReversal={!!r.reversed_at && st !== 'anulado'} className="min-w-0 max-w-none w-full" />
                                <p className="mt-1 text-[11px] font-medium text-[var(--ink-muted)]">{plCompletenessLabel(r, t)}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                <Button asChild className="h-10 rounded-[8px] bg-[var(--olive-700)] text-[13px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]">
                                  <Link to={detailUrl}>{st === 'borrador' ? t('ptPackingLists.table.actionPrepare') : t('ptPackingLists.table.actionDetail')}</Link>
                                </Button>
                                {r.dispatch_id != null && r.dispatch_id > 0 ? (
                                  <Button asChild type="button" variant="outline" className="h-10 rounded-[8px] border-[var(--stone-300)] bg-white px-3 text-[12px] shadow-none">
                                    <Link to="/dispatches" title={`Despacho #${r.dispatch_id}`}>
                                      {t('ptPackingLists.table.actionDispatch')}
                                    </Link>
                                  </Button>
                                ) : st === 'borrador' ? (
                                  <Button asChild type="button" variant="outline" className="h-10 rounded-[8px] border-[var(--stone-300)] bg-white px-3 text-[12px] shadow-none">
                                    <Link to={detailUrl}>{t('ptPackingLists.table.actionDetail')}</Link>
                                  </Button>
                                ) : (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button type="button" variant="outline" className="h-10 rounded-[8px] border-[var(--stone-300)] bg-white px-3 text-[12px] shadow-none" aria-label={t('ptPackingLists.table.actionMore')}>
                                        {t('ptPackingLists.table.actionMore')}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      {r.orden_id != null && r.orden_id > 0 ? (
                                        <DropdownMenuItem asChild>
                                          <Link to={`/sales-orders/${r.orden_id}/avance`}>{t('ptPackingLists.table.actionViewOrder')}</Link>
                                        </DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuItem asChild>
                                        <Link to="/dispatches">{t('ptPackingLists.table.actionGoDispatches')}</Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {r.reversed_at ? (
                                        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                          {t('ptPackingLists.table.reversalBadge')}: {new Date(r.reversed_at).toLocaleString('es')}
                                        </DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          void navigator.clipboard?.writeText(r.list_code);
                                        }}
                                      >
                                        {t('ptPackingLists.table.actionCopyCode')}
                                      </DropdownMenuItem>
                                      {r.notes?.trim() ? (
                                        <DropdownMenuItem disabled className="line-clamp-3 text-xs text-muted-foreground">
                                          {r.notes.trim()}
                                        </DropdownMenuItem>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                              {st === 'borrador' || (r.dispatch_id != null && r.dispatch_id > 0) ? (
                                <details className="mt-2 border-t border-[var(--stone-200)] pt-2">
                                  <summary className="cursor-pointer list-none text-[12px] font-semibold text-[var(--ink-muted)]">
                                    {t('ptPackingLists.table.actionMore')} <span aria-hidden>›</span>
                                  </summary>
                                  <div className="mt-2 flex flex-col gap-1">
                                    {r.orden_id != null && r.orden_id > 0 ? (
                                      <Button asChild variant="ghost" className="h-9 justify-start px-2 text-[12px]">
                                        <Link to={`/sales-orders/${r.orden_id}/avance`}>{t('ptPackingLists.table.actionViewOrder')}</Link>
                                      </Button>
                                    ) : null}
                                    <Button asChild variant="ghost" className="h-9 justify-start px-2 text-[12px]">
                                      <Link to="/dispatches">{t('ptPackingLists.table.actionGoDispatches')}</Link>
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="h-9 justify-start px-2 text-[12px]"
                                      onClick={() => {
                                        void navigator.clipboard?.writeText(r.list_code);
                                      }}
                                    >
                                      {t('ptPackingLists.table.actionCopyCode')}
                                    </Button>
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ))
                : filtered.map((r) => {
                    const st = String(r.status || '').toLowerCase();
                    const bol = r.numero_bol?.trim();
                    const np = notesPreview(r.notes);
                    return (
                      <article key={r.id} data-pl-mobile-card className="overflow-hidden rounded-[11px] border border-[var(--stone-300)] bg-white">
                        <div className="flex items-start justify-between gap-3 border-b border-[var(--stone-200)] px-3 py-3">
                          <div className="min-w-0 space-y-1">
                            <PlStatusBadge status={r.status} t={t} />
                            {r.reversed_at ? (
                              <span className="inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900">
                                {t('ptPackingLists.table.reversalBadge')}
                              </span>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">
                              {formatCount(r.total_boxes)} {t('ptPackingLists.table.colBoxes').toLowerCase()}
                            </p>
                            <p className="mt-1 text-[11px] tabular-nums text-[var(--ink-muted)]">{formatLb(r.total_pounds, 2)} lb</p>
                          </div>
                        </div>
                        <div className="px-3 py-3">
                          <p className="font-serif text-[18px] font-semibold leading-tight text-[var(--ink)]">{r.list_code}</p>
                          <p className="mt-1 text-[13px] font-semibold text-[var(--ink)]">{r.client_nombre?.trim() || '—'}</p>
                          <p className="text-[12px] tabular-nums text-[var(--ink-muted)]">{formatListDate(r.list_date)}</p>
                          <p className="mt-1.5 text-[12px] text-[var(--ink-muted)]">
                            {t('ptPackingLists.table.colPallets')}: {formatCount(r.pallet_count)}
                          </p>
                          <p className="text-[12px] text-[var(--ink-muted)]">
                            {bol ? `${t('ptPackingLists.condicion.bolPrefix')}${bol}` : t('ptPackingLists.condicion.noBol')}
                          </p>
                          {r.dispatch_id != null && r.dispatch_id > 0 ? (
                            <p className="text-[12px] text-[var(--ink-muted)]">{t('ptPackingLists.condicion.inDispatch')} #{r.dispatch_id}</p>
                          ) : null}
                          {r.orden_id != null ? (
                            <p className="text-[12px] text-[var(--ink-muted)]">
                              {t('ptPackingLists.table.colOrder')}: {r.order_number?.trim() || `#${r.orden_id}`}
                            </p>
                          ) : null}
                          {np.text ? (
                            <p className="mt-1 text-[12px] leading-snug text-[var(--ink-muted)]" title={np.title}>{np.text}</p>
                          ) : (
                            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{t('ptPackingLists.condicion.noNotes')}</p>
                          )}
                          <div className="mt-3">
                            <Button asChild className="h-10 w-full rounded-[8px] bg-[var(--olive-700)] text-[13px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]">
                              <Link to={`/existencias-pt/packing-lists/${r.id}`}>{st === 'borrador' ? t('ptPackingLists.table.actionPrepare') : t('ptPackingLists.table.actionOpen')}</Link>
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
            </div>
            {viewMode === 'compact' ? (
          <div className="hidden space-y-4 lg:block lg:space-y-3 lg:p-3">
            {groupedByClient.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:rounded-[10px] lg:border-[var(--stone-300)]">
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:border-[var(--stone-200)] lg:bg-[var(--stone-50)]">
                  <p className="text-sm font-semibold text-slate-900">{group.clientLabel}</p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{formatCount(group.totalBoxes)}</span>{' '}
                    {t('ptPackingLists.table.groupBoxes')}
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{formatLb(group.totalLb, 2)}</span> lb
                  </p>
                  <p className="text-xs text-slate-600">
                    {formatCount(group.plCount)} {t('ptPackingLists.table.groupPl')}
                  </p>
                  {group.hasEmptyBorrador ? (
                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                      {t('ptPackingLists.table.groupIncomplete')}
                    </span>
                  ) : group.hasBorrador ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                      {t('ptPackingLists.table.groupInProgress')}
                    </span>
                  ) : null}
                  {group.hasReversa ? (
                    <span className="inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
                      {t('ptPackingLists.table.groupWithReversal')}
                    </span>
                  ) : null}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-[120px]">{t('ptPackingLists.table.colState')}</TableHead>
                      <TableHead className="min-w-[140px]">{t('ptPackingLists.table.colPlDate')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('ptPackingLists.table.colFormats')}</TableHead>
                      <TableHead className="text-right tabular-nums">{t('ptPackingLists.table.colBoxes')}</TableHead>
                      <TableHead className="text-right tabular-nums">{t('ptPackingLists.table.colLb')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('ptPackingLists.table.colProgress')}</TableHead>
                      <TableHead className="w-[100px]">{t('ptPackingLists.table.colFulfillment')}</TableHead>
                      <TableHead className="w-[200px] text-right">{t('ptPackingLists.table.colActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((r) => {
                      const tone = plCompactRowTone(r, t);
                      const pct = packingListAdvancePct(r);
                      const detailUrl = `/existencias-pt/packing-lists/${r.id}`;
                      const st = String(r.status || '').toLowerCase();
                      const prefetchIdx = detailPrefetchIds.indexOf(r.id);
                      const q = prefetchIdx >= 0 ? detailQueries[prefetchIdx] : undefined;
                      const formatText = prefetchIdSet.has(r.id)
                        ? q?.isPending && !formatSummaryByPlId.has(r.id)
                          ? null
                          : (formatSummaryByPlId.get(r.id) ?? '—')
                        : null;
                      return (
                        <TableRow key={r.id} className={cn(tableBodyRow, 'relative')}>
                          <TableCell className="py-2.5 pl-3">
                            <span className={cn('absolute inset-y-1 left-0 w-1 rounded-r-sm', tone.bar)} />
                            <div className="flex flex-col gap-1">
                              <span
                                className={cn(
                                  'inline-flex max-w-[118px] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize',
                                  tone.badgeClass,
                                )}
                                title={r.status}
                              >
                                {tone.shortLabel}
                              </span>
                              {r.reversed_at ? (
                                <span
                                  className="inline-flex w-fit rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900"
                                  title={new Date(r.reversed_at).toLocaleString('es')}
                                >
                                  {t('ptPackingLists.table.reversalBadge')}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[180px] py-2.5">
                            <Link
                              className="font-mono text-xs font-semibold text-slate-900 underline decoration-slate-200 underline-offset-2 hover:text-primary hover:decoration-primary"
                              to={detailUrl}
                            >
                              {r.list_code}
                            </Link>
                            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{formatListDate(r.list_date)}</p>
                          </TableCell>
                          <TableCell className="max-w-[160px] py-2.5">
                            {!prefetchIdSet.has(r.id) ? (
                              <span
                                className="text-[11px] text-slate-400"
                                title={t('ptPackingLists.table.manyResults')}
                              >
                                —
                              </span>
                            ) : formatText === null ? (
                              <Skeleton className="h-4 w-24" />
                            ) : (
                              <span className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-800" title={formatText}>
                                {formatText}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-950">
                            {formatCount(r.total_boxes)}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">
                            {formatLb(r.total_pounds, 2)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <PlAdvanceBar pct={pct} hasReversal={!!r.reversed_at && st !== 'anulado'} />
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-[11px] font-medium text-slate-600">{plCompletenessLabel(r, t)}</span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button asChild type="button" size="sm" variant="default" className="h-7 rounded-md px-2 text-[11px] lg:bg-[var(--olive-700)] lg:hover:bg-[var(--olive-600)]">
                                <Link to={detailUrl}>{t('ptPackingLists.table.actionDetail')}</Link>
                              </Button>
                              {st === 'borrador' ? (
                                <Button asChild type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-[11px]">
                                  <Link to={detailUrl}>{t('ptPackingLists.table.actionPrepare')}</Link>
                                </Button>
                              ) : null}
                              {r.dispatch_id != null && r.dispatch_id > 0 ? (
                                <Button asChild type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-[11px]">
                                  <Link to="/dispatches" title={`Despacho #${r.dispatch_id}`}>
                                    {t('ptPackingLists.table.actionDispatch')}
                                  </Link>
                                </Button>
                              ) : null}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0 rounded-md"
                                    aria-label={t('ptPackingLists.table.actionMore')}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {r.orden_id != null && r.orden_id > 0 ? (
                                    <DropdownMenuItem asChild>
                                      <Link to={`/sales-orders/${r.orden_id}/avance`}>{t('ptPackingLists.table.actionViewOrder')}</Link>
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem asChild>
                                    <Link to="/dispatches">{t('ptPackingLists.table.actionGoDispatches')}</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {r.reversed_at ? (
                                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                      {t('ptPackingLists.table.reversalBadge')}: {new Date(r.reversed_at).toLocaleString('es')}
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      void navigator.clipboard?.writeText(r.list_code);
                                    }}
                                  >
                                    {t('ptPackingLists.table.actionCopyCode')}
                                  </DropdownMenuItem>
                                  {r.notes?.trim() ? (
                                    <DropdownMenuItem disabled className="line-clamp-3 text-xs text-muted-foreground">
                                      {r.notes.trim()}
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
            ) : (
          <div className={cn(tableShell, 'hidden lg:block lg:rounded-none lg:border-0 lg:shadow-none')}>
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[200px]">{t('ptPackingLists.table.colState')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('ptPackingLists.table.colDate')}</TableHead>
                  <TableHead className="min-w-[140px]">{t('ptPackingLists.table.colClient')}</TableHead>
                  <TableHead className="min-w-[120px]">{t('ptPackingLists.table.colOrder')}</TableHead>
                  <TableHead className="min-w-[120px]">{t('ptPackingLists.table.colCode')}</TableHead>
                  <TableHead className="text-right tabular-nums">{t('ptPackingLists.table.colBoxes')}</TableHead>
                  <TableHead className="text-right tabular-nums">{t('ptPackingLists.table.colWeight')}</TableHead>
                  <TableHead className="min-w-[100px] text-right tabular-nums">{t('ptPackingLists.table.colPallets')}</TableHead>
                  <TableHead className="min-w-[220px]">{t('ptPackingLists.table.colCondition')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('ptPackingLists.table.colDispatch')}</TableHead>
                  <TableHead className="w-[108px] text-right">{t('ptPackingLists.table.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className={tableBodyRow}>
                    <TableCell className="max-w-[220px] py-3.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PlStatusBadge status={r.status} t={t} />
                        {r.reversed_at ? (
                          <span
                            className="inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900"
                            title={new Date(r.reversed_at).toLocaleString('es')}
                          >
                            {t('ptPackingLists.table.reversalBadge')}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3.5 text-sm tabular-nums text-slate-700">
                      {formatListDate(r.list_date)}
                    </TableCell>
                    <TableCell className="max-w-[180px] py-3.5 text-sm font-medium text-slate-900">
                      <span className="line-clamp-2">{r.client_nombre?.trim() || '—'}</span>
                    </TableCell>
                    <TableCell className="max-w-[160px] py-3.5 text-sm">
                      {r.orden_id != null && r.order_number?.trim() ? (
                        <Link
                          className="font-medium text-slate-900 underline decoration-slate-200 underline-offset-2 hover:text-primary hover:decoration-primary"
                          to={`/sales-orders/${r.orden_id}/avance`}
                        >
                          {r.order_number}
                        </Link>
                      ) : r.orden_id != null ? (
                        <span className="font-mono text-xs text-slate-600">#{r.orden_id}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Link
                        className="font-mono text-sm font-semibold text-slate-900 underline decoration-slate-200 underline-offset-2 hover:text-primary hover:decoration-primary"
                        to={`/existencias-pt/packing-lists/${r.id}`}
                      >
                        {r.list_code}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm tabular-nums text-slate-900">
                      {formatCount(r.total_boxes)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm tabular-nums text-slate-900">
                      {formatLb(r.total_pounds, 2)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm tabular-nums text-slate-700">
                      {formatCount(r.pallet_count)}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <CondicionCell numeroBol={r.numero_bol} notes={r.notes} dispatchId={r.dispatch_id} t={t} />
                    </TableCell>
                    <TableCell className="py-3.5">
                      {r.dispatch_id != null && r.dispatch_id > 0 ? (
                        <Link
                          className="font-mono text-xs font-semibold text-slate-800 underline decoration-slate-200 underline-offset-2 hover:text-primary"
                          to="/dispatches"
                          title={t('ptPackingLists.table.dispatchTitle', { id: r.dispatch_id })}
                        >
                          #{r.dispatch_id}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-slate-200 text-xs font-medium"
                        asChild
                      >
                        <Link to={`/existencias-pt/packing-lists/${r.id}`}>{t('ptPackingLists.table.actionOpen')}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
            )}
          </>
        )}
      </section>

      {(sinCliente > 0 || borradoresVacios > 0) && (
        <div className="space-y-2 lg:mt-3">
          {sinCliente > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/40 px-4 py-3 text-sm text-amber-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p>{t('ptPackingLists.bottomAlerts.noClient', { count: sinCliente })}</p>
            </div>
          ) : null}
          {borradoresVacios > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <p>
                {borradoresVacios === 1
                  ? t('ptPackingLists.bottomAlerts.emptyDrafts', { count: borradoresVacios })
                  : t('ptPackingLists.bottomAlerts.emptyDraftsPlural', { count: borradoresVacios })}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
