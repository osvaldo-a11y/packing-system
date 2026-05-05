import { useMemo, useState } from 'react';
import { Info, ListOrdered, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
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
  btnToolbarOutline,
  emptyStatePanel,
  errorStateCard,
  filterInputClass,
  filterPanel,
  filterSelectClass,
  kpiCard,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  kpiValueMd,
  pageHeaderRow,
  pageInfoButton,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
  signalsTitle,
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

function plCompactRowTone(r: PtPackingListSummary): {
  bar: string;
  badgeClass: string;
  shortLabel: string;
} {
  const st = String(r.status || '').toLowerCase();
  const hasRev = !!r.reversed_at;
  if (st === 'anulado') {
    return {
      bar: 'bg-rose-500',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-900',
      shortLabel: 'Anulado',
    };
  }
  if (st === 'confirmado') {
    const dispatched = r.dispatch_id != null && Number(r.dispatch_id) > 0;
    if (dispatched) {
      return {
        bar: hasRev ? 'bg-violet-500' : 'bg-slate-400',
        badgeClass: 'border-slate-200 bg-slate-100 text-slate-800',
        shortLabel: 'En despacho',
      };
    }
    return {
      bar: hasRev ? 'bg-violet-500' : 'bg-emerald-500',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      shortLabel: 'Completo',
    };
  }
  if ((r.pallet_count ?? 0) === 0) {
    return {
      bar: hasRev ? 'bg-violet-500' : 'bg-slate-300',
      badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
      shortLabel: 'Pendiente',
    };
  }
  return {
    bar: hasRev ? 'bg-violet-500' : 'bg-sky-500',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-900',
    shortLabel: 'En proceso',
  };
}

function plCompletenessLabel(r: PtPackingListSummary): string {
  const st = String(r.status || '').toLowerCase();
  const rev = r.reversed_at && st !== 'anulado' ? ' · Reversa' : '';
  if (st === 'anulado') return 'Anulado';
  if (st === 'confirmado') {
    return (r.dispatch_id != null && Number(r.dispatch_id) > 0 ? 'Despachado' : 'Confirmado') + rev;
  }
  if ((r.pallet_count ?? 0) === 0) return 'Vacío' + rev;
  return 'En armado' + rev;
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

function PlStatusBadge({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    borrador: 'border-slate-200 bg-slate-100 text-slate-800',
    confirmado: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
  };
  return (
    <span className={cn(badgePill, map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800')} title={status}>
      {status}
    </span>
  );
}

function notesPreview(notes: string | null): { text: string; title?: string } {
  const n = notes?.trim();
  if (!n) return { text: '' };
  if (n.length <= 48) return { text: n, title: n };
  return { text: `${n.slice(0, 48)}…`, title: n };
}

function PlAdvanceBar({ pct, hasReversal }: { pct: number; hasReversal?: boolean }) {
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
      className="flex min-w-[100px] max-w-[140px] flex-col gap-0.5"
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
}: {
  numeroBol: string | null | undefined;
  notes: string | null;
  dispatchId: number | null | undefined;
}) {
  const np = notesPreview(notes);
  const bol = numeroBol?.trim();
  return (
    <div className="max-w-[220px] space-y-1.5">
      {dispatchId != null && dispatchId > 0 ? (
        <span className="inline-flex rounded-full border border-sky-200/90 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900">
          En despacho
        </span>
      ) : null}
      <div className="font-mono text-xs text-slate-800">{bol ? `BOL ${bol}` : 'Sin BOL'}</div>
      {np.text ? (
        <p className="text-xs leading-snug text-slate-500" title={np.title}>
          {np.text}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">Sin notas</p>
      )}
    </div>
  );
}

export function PtPackingListsPage() {
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterClientId, setFilterClientId] = useState(0);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');

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
    const clientes = new Set<number>();
    for (const r of list) {
      const st = String(r.status || '').toLowerCase();
      if (st === 'borrador') borrador++;
      else if (st === 'confirmado') confirmado++;
      else if (st === 'anulado') anulado++;
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

  const helpTitle =
    'Listados logísticos independientes del despacho y la factura. Crear desde inventario cámara (Existencias PT). Flujo: borrador → confirmado (descuenta stock PT). Reversa solo si ningún pallet está en despacho. Pedido y despacho se vinculan cuando el PL se incluye en un despacho.';

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
    <div className="space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <h2 className={pageTitle}>Existencias PT · Packing Lists PT</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>Preparación comercial, BOL y stock PT antes del despacho.</p>
            <button type="button" className={pageInfoButton} title={helpTitle} aria-label="Ayuda packing lists PT">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline" size="sm" className={btnToolbarOutline}>
            <Link to="/existencias-pt/inventario" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Inventario cámara
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="pl-kpis" className="space-y-4">
        <h2 id="pl-kpis" className="sr-only">
          Indicadores
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Packing lists totales</p>
            <p className={kpiValueLg}>{formatCount(kpis.total)}</p>
            <p className={kpiFootnote}>En vista actual</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Borradores</p>
            <p className={kpiValueLg}>{formatCount(kpis.borrador)}</p>
            <p className={kpiFootnote}>Sin confirmar</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Confirmados</p>
            <p className={kpiValueLg}>{formatCount(kpis.confirmado)}</p>
            <p className={kpiFootnote}>Stock PT aplicado</p>
          </div>
          <div
            className={cn(
              kpiCard,
              kpis.enDespacho > 0 ? 'border-sky-200/90 bg-sky-50/50' : '',
            )}
          >
            <p className={kpiLabel}>En despacho</p>
            <p className={cn(kpiValueLg, kpis.enDespacho > 0 ? 'text-sky-950' : '')}>{formatCount(kpis.enDespacho)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Vinculados a un despacho</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={kpiValueMd}>{formatCount(kpis.totalCajas)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Peso total (lb)</p>
            <p className={kpiValueMd}>{formatLb(kpis.totalLb, 2)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Clientes (vista)</p>
            <p className={kpiValueMd}>{formatCount(kpis.clientesActivos)}</p>
            <p className={kpiFootnote}>Con cliente asignado</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Pedidos vinculados</p>
            <p className={kpiValueMd}>{formatCount(kpis.conPedido)}</p>
            <p className={kpiFootnote}>Con orden en despacho</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className={cn(
              kpiCardSm,
              kpis.anulado > 0 ? 'border-slate-200/90 bg-slate-50/50' : '',
            )}
          >
            <p className={kpiLabel}>Anulados</p>
            <p className={cn(kpiValueMd, 'text-slate-800')}>{formatCount(kpis.anulado)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Cerrados operativamente</p>
          </div>
          <div
            className={cn(
              kpiCardSm,
              kpis.conReversa > 0 ? 'border-violet-200/85 bg-violet-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Con reversa</p>
            <p className={cn(kpiValueMd, kpis.conReversa > 0 ? 'text-violet-950' : 'text-slate-800')}>
              {formatCount(kpis.conReversa)}
            </p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Histórico registrado</p>
          </div>
        </div>
      </section>

      <div className={filterPanel}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Estado, cliente y búsqueda por código, BOL, notas, pedido o despacho."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-2 lg:grid-cols-12 lg:items-end">
          <div className="grid gap-2 lg:col-span-3">
            <Label className="text-xs text-slate-500">Estado</Label>
            <select className={filterSelectClass} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="borrador">Borrador</option>
              <option value="confirmado">Confirmado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label className="text-xs text-slate-500">Cliente</Label>
            <select
              className={filterSelectClass}
              value={filterClientId}
              onChange={(e) => setFilterClientId(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {clientOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-5">
            <Label className="text-xs text-slate-500">Buscar</Label>
            <Input
              className={filterInputClass}
              placeholder="Código, BOL, cliente, pedido, despacho…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="pl-tabla">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="pl-tabla" className={sectionTitle}>
              Listado operativo
            </h2>
            <p className={sectionHint}>
              {filtered.length} registro(s)
              {viewMode === 'detailed' ? ' · tabla completa con condición comercial' : ' · compacta por cliente y avance'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <Button
                type="button"
                variant={viewMode === 'compact' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-md px-3 text-xs"
                onClick={() => setViewMode('compact')}
              >
                Compacta
              </Button>
              <Button
                type="button"
                variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-md px-3 text-xs"
                onClick={() => setViewMode('detailed')}
              >
                Detallada
              </Button>
            </div>
            <details className="group">
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                Ver criterios
              </summary>
              <div className="mt-1 max-w-[min(22rem,calc(100vw-2rem))] space-y-1 rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600 shadow-sm">
                <p>
                  <span className="font-semibold text-emerald-700">Completo:</span> Packing List confirmado / listo
                </p>
                <p>
                  <span className="font-semibold text-sky-700">En proceso:</span> Packing List en borrador o preparación
                </p>
                <p>
                  <span className="font-semibold text-rose-700">Anulado:</span> Packing List cancelado
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Avance 100%:</span> confirmado
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Avance en progreso:</span> borrador
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Avance 0%:</span> anulado
                </p>
              </div>
            </details>
          </div>
        </div>

        {!data?.length ? (
          <p className={emptyStatePanel}>No hay packing lists. Creá uno desde inventario cámara.</p>
        ) : !filtered.length ? (
          <p className={emptyStatePanel}>Sin coincidencias con el filtro.</p>
        ) : viewMode === 'compact' ? (
          <div className="space-y-4">
            {groupedByClient.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
                  <p className="text-sm font-semibold text-slate-900">{group.clientLabel}</p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{formatCount(group.totalBoxes)}</span> cajas
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{formatLb(group.totalLb, 2)}</span> lb
                  </p>
                  <p className="text-xs text-slate-600">{formatCount(group.plCount)} packing lists</p>
                  {group.hasEmptyBorrador ? (
                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                      Incompletos (vacíos)
                    </span>
                  ) : group.hasBorrador ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                      En proceso
                    </span>
                  ) : null}
                  {group.hasReversa ? (
                    <span className="inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
                      Con reversa
                    </span>
                  ) : null}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-[120px]">Estado</TableHead>
                      <TableHead className="min-w-[140px]">PL / fecha</TableHead>
                      <TableHead className="min-w-[120px]">Formatos</TableHead>
                      <TableHead className="text-right tabular-nums">Cajas</TableHead>
                      <TableHead className="text-right tabular-nums">Lb</TableHead>
                      <TableHead className="min-w-[120px]">Avance</TableHead>
                      <TableHead className="w-[100px]">Cumpl.</TableHead>
                      <TableHead className="w-[200px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((r) => {
                      const tone = plCompactRowTone(r);
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
                                  Reversa
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
                                title="Muchos resultados: usá filtros o abrí el detalle para ver formatos"
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
                            <span className="text-[11px] font-medium text-slate-600">{plCompletenessLabel(r)}</span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <Button asChild type="button" size="sm" variant="default" className="h-7 rounded-md px-2 text-[11px]">
                                <Link to={detailUrl}>Ver detalle</Link>
                              </Button>
                              {st === 'borrador' ? (
                                <Button asChild type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-[11px]">
                                  <Link to={detailUrl}>Preparar</Link>
                                </Button>
                              ) : null}
                              {r.dispatch_id != null && r.dispatch_id > 0 ? (
                                <Button asChild type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-[11px]">
                                  <Link to="/dispatches" title={`Despacho #${r.dispatch_id}`}>
                                    Despacho
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
                                    aria-label="Más acciones"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {r.orden_id != null && r.orden_id > 0 ? (
                                    <DropdownMenuItem asChild>
                                      <Link to={`/sales-orders/${r.orden_id}/avance`}>Ver pedido</Link>
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem asChild>
                                    <Link to="/dispatches">Ir a Despachos</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {r.reversed_at ? (
                                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                      Reversa: {new Date(r.reversed_at).toLocaleString('es')}
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      void navigator.clipboard?.writeText(r.list_code);
                                    }}
                                  >
                                    Copiar código PL
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
          <div className={tableShell}>
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[200px]">Estado</TableHead>
                  <TableHead className="whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="min-w-[140px]">Cliente</TableHead>
                  <TableHead className="min-w-[120px]">Pedido</TableHead>
                  <TableHead className="min-w-[120px]">Código</TableHead>
                  <TableHead className="text-right tabular-nums">Cajas</TableHead>
                  <TableHead className="text-right tabular-nums">Peso (lb)</TableHead>
                  <TableHead className="min-w-[100px] text-right tabular-nums">Pallets</TableHead>
                  <TableHead className="min-w-[220px]">Condición comercial</TableHead>
                  <TableHead className="whitespace-nowrap">Despacho</TableHead>
                  <TableHead className="w-[108px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className={tableBodyRow}>
                    <TableCell className="max-w-[220px] py-3.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PlStatusBadge status={r.status} />
                        {r.reversed_at ? (
                          <span
                            className="inline-flex rounded-full border border-violet-200/85 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900"
                            title={new Date(r.reversed_at).toLocaleString('es')}
                          >
                            Reversa
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
                      <CondicionCell numeroBol={r.numero_bol} notes={r.notes} dispatchId={r.dispatch_id} />
                    </TableCell>
                    <TableCell className="py-3.5">
                      {r.dispatch_id != null && r.dispatch_id > 0 ? (
                        <Link
                          className="font-mono text-xs font-semibold text-slate-800 underline decoration-slate-200 underline-offset-2 hover:text-primary"
                          to="/dispatches"
                          title={`Ver en módulo Despachos (despacho #${r.dispatch_id})`}
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
                        <Link to={`/existencias-pt/packing-lists/${r.id}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {(sinCliente > 0 || borradoresVacios > 0) && (
        <div className="space-y-2">
          {sinCliente > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/40 px-4 py-3 text-sm text-amber-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p>
                <span className="font-semibold">{sinCliente}</span> PL sin cliente comercial (no anulados). Revisá en
                detalle o inventario.
              </p>
            </div>
          ) : null}
          {borradoresVacios > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <p>
                <span className="font-semibold">{borradoresVacios}</span> borrador{borradoresVacios === 1 ? '' : 'es'} sin
                pallets — completá desde inventario o eliminá si no aplica.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
