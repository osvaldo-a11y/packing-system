import { useMemo, useState } from 'react';
import { Info, ListOrdered } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
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
        <div>
          <h2 id="pl-tabla" className={sectionTitle}>
            Listado operativo
          </h2>
          <p className={sectionHint}>
            {filtered.length} registro(s) · columna condición resume BOL y notas
          </p>
        </div>

        {!data?.length ? (
          <p className={emptyStatePanel}>No hay packing lists. Creá uno desde inventario cámara.</p>
        ) : !filtered.length ? (
          <p className={emptyStatePanel}>Sin coincidencias con el filtro.</p>
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
