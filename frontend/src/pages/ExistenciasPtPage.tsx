import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Layers, ListOrdered, RotateCcw, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatLb } from '@/lib/number-format';
import {
  btnToolbarOutline,
  btnToolbarPrimary,
  emptyStatePanel,
  errorStatePanel,
  filterPanel,
  filterSelectClass,
  kpiCard,
  kpiFootnote,
  kpiGrid,
  kpiLabel,
  kpiValueLg,
  operationalModalBodyClass,
  operationalModalContentClass,
  operationalModalDescriptionClass,
  operationalModalFooterClass,
  operationalModalFormClass,
  operationalModalHeaderClass,
  operationalModalTitleClass,
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
import type { FruitProcessRow } from './ProcessesPage';
import type { PtTagApi } from './PtTagsPage';

type MasterSpecies = { id: number; codigo: string; nombre: string };
type MasterVariety = { id: number; species_id: number; nombre: string };
type ClientRow = { id: number; codigo: string; nombre: string; activo: boolean };
type FormatRow = {
  id: number;
  format_code: string;
  species_id: number | null;
  activo: boolean;
};

export type ExistenciaPtRow = {
  id: number;
  corner_board_code: string;
  /** Primera TAR si hay varias (compat). */
  tag_code?: string | null;
  /** Códigos TAR resueltos desde líneas → proceso → pt_tags (+ pt_tag_items). */
  unidad_pt_codigos?: string[];
  tarja_ids?: number[];
  trazabilidad_pt?: 'unica' | 'varias' | 'sin_trazabilidad';
  /** Columna principal: TAR, resumen de varias, o identificador logístico si no hay PT. */
  codigo_unidad_pt_display?: string;
  codigo_logistico?: string;
  mensaje_trazabilidad?: string | null;
  /** no: stock normal; resultado: pallet nuevo post-repallet; origen: consumido en repallet (no duplicar en cierres). */
  repalletizaje?: 'no' | 'resultado' | 'origen';
  species_id: number | null;
  species_nombre: string | null;
  variedades_label: string;
  presentation_format_id: number | null;
  format_code: string | null;
  client_id: number | null;
  client_nombre: string | null;
  /** Marca / submarca (cabecera pallet), si existe. */
  brand_nombre?: string | null;
  boxes: number;
  pounds: number;
  status: string;
  bol: string | null;
  /** Pedido de planificación (cabecera del pallet). */
  planned_sales_order_id: number | null;
  planned_order_number: string | null;
  dispatch_id: number | null;
  dispatch_bol: string | null;
  /** Pedido vinculado al despacho cuando el pallet ya salió. */
  sales_order_number: string | null;
  /** Máx. cajas por pallet según formato de presentación (si aplica). */
  max_boxes_per_pallet?: number | null;
};

function canBulkBol(r: ExistenciaPtRow): boolean {
  return r.status === 'definitivo' && (r.dispatch_id == null || Number(r.dispatch_id) <= 0);
}

function fmtLb(v: number) {
  if (!Number.isFinite(v)) return '—';
  return formatLb(v, 2);
}

function BoxesHighlightCell({ r }: { r: ExistenciaPtRow }) {
  const max = r.max_boxes_per_pallet != null ? Number(r.max_boxes_per_pallet) : null;
  const hasCap = max != null && Number.isFinite(max) && max > 0;
  const full = hasCap && r.boxes >= max!;
  const partial = hasCap && r.boxes > 0 && r.boxes < max!;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={cn(
          'inline-flex min-w-[2.5rem] justify-end rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums',
          !hasCap
            ? 'bg-slate-100/90 text-slate-900'
            : full
              ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/90'
              : 'bg-orange-50 text-orange-950 ring-1 ring-orange-200/90',
        )}
        title={hasCap ? `Formato: máx. ${max} cajas / pallet` : 'Sin tope de cajas en maestro'}
      >
        {r.boxes}
      </span>
      {hasCap ? (
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-wide',
            full ? 'text-emerald-800' : partial ? 'text-orange-800' : 'text-slate-500',
          )}
        >
          {full ? 'Completo' : partial ? 'Parcial' : '—'}
        </span>
      ) : (
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">—</span>
      )}
    </div>
  );
}

function PalletStatusBadge({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    definitivo: 'border-emerald-200/80 bg-emerald-50 text-emerald-900',
    borrador: 'border-slate-200 bg-slate-100 text-slate-700',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
    repaletizado: 'border-violet-200/80 bg-violet-50 text-violet-900',
    revertido: 'border-amber-200/80 bg-amber-50 text-amber-950',
    asignado_pl: 'border-sky-200/80 bg-sky-50 text-sky-900',
  };
  return (
    <span
      className={cn(
        'inline-flex max-w-[140px] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize leading-none',
        map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800',
      )}
      title={status}
    >
      {status}
    </span>
  );
}

function RepalletEstadoCell({ r }: { r: ExistenciaPtRow }) {
  if (r.repalletizaje === 'resultado') {
    return (
      <span
        className="inline-flex rounded-full border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900"
        title="Resultado de repaletizaje"
      >
        Resultado
      </span>
    );
  }
  if (r.repalletizaje === 'origen') {
    return (
      <span
        className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-950"
        title="Origen consumido en repallet"
      >
        Origen
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}

function logisticaResumen(r: ExistenciaPtRow): string {
  if (r.dispatch_bol?.trim()) return `BOL ${r.dispatch_bol.trim()}`;
  if (r.sales_order_number?.trim()) return `Pedido ${r.sales_order_number.trim()}`;
  if (r.planned_order_number?.trim()) return `Plan ${r.planned_order_number.trim()}`;
  if (r.dispatch_id != null && r.dispatch_id > 0) return `Desp. #${r.dispatch_id}`;
  return '—';
}

function DisponibilidadBadge({ r }: { r: ExistenciaPtRow }) {
  if (canBulkBol(r)) {
    return (
      <span
        className="inline-flex max-w-[140px] truncate rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900"
        title="Definitivo y sin despacho"
      >
        En depósito
      </span>
    );
  }
  if (r.status === 'asignado_pl') {
    return (
      <span
        className="inline-flex max-w-[140px] truncate rounded-full border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900"
        title="Reservado en packing list"
      >
        Reservado PL
      </span>
    );
  }
  if (r.dispatch_id != null && r.dispatch_id > 0) {
    return (
      <span
        className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800"
        title="Ya despachado"
      >
        Despachado
      </span>
    );
  }
  return <span className="text-[11px] text-slate-400">—</span>;
}

function LogisticaCell({ r }: { r: ExistenciaPtRow }) {
  const line1 = logisticaResumen(r);
  const bol = r.bol?.trim();
  return (
    <div className="max-w-[168px] space-y-0.5">
      <p className="text-xs leading-snug text-slate-700" title={line1}>
        {line1}
      </p>
      {bol ? (
        <p className="truncate font-mono text-[11px] text-slate-400" title={`BOL pallet: ${bol}`}>
          BOL {bol}
        </p>
      ) : null}
    </div>
  );
}

function compactStateTone(r: ExistenciaPtRow): { bar: string; label: string; badge: string } {
  const s = String(r.status || '').toLowerCase();
  if (s === 'anulado') {
    return { bar: 'bg-rose-400', label: 'Problema', badge: 'border-rose-200 bg-rose-50 text-rose-900' };
  }
  if (r.dispatch_id != null && Number(r.dispatch_id) > 0) {
    return { bar: 'bg-slate-400', label: 'Despachado', badge: 'border-slate-200 bg-slate-100 text-slate-800' };
  }
  if (s === 'asignado_pl' || r.planned_sales_order_id != null) {
    return { bar: 'bg-sky-400', label: 'Comprometido', badge: 'border-sky-200 bg-sky-50 text-sky-900' };
  }
  if (s === 'borrador' || s === 'revertido') {
    return { bar: 'bg-amber-400', label: 'Pendiente', badge: 'border-amber-200 bg-amber-50 text-amber-900' };
  }
  return { bar: 'bg-emerald-400', label: 'Disponible', badge: 'border-emerald-200 bg-emerald-50 text-emerald-900' };
}

function compactTraceabilityBadges(r: ExistenciaPtRow): string[] {
  const out: string[] = [];
  if (r.repalletizaje === 'resultado' || r.repalletizaje === 'origen') out.push('Re-paletizado');
  if (r.dispatch_id != null && Number(r.dispatch_id) > 0) out.push('Despachado');
  else if (r.status === 'asignado_pl' || r.planned_order_number?.trim()) out.push('En PL');
  if (r.sales_order_number?.trim()) out.push('En pedido');
  if (out.length === 0) out.push('Sin compromiso');
  return out;
}

function buildQuery(params: {
  speciesId: number;
  varietyId: number;
  formatId: number;
  clientId: number;
  status: string;
  soloDeposito: boolean;
  excluirAnulados: boolean;
}) {
  const sp = new URLSearchParams();
  if (params.speciesId > 0) sp.set('species_id', String(params.speciesId));
  if (params.varietyId > 0) sp.set('variety_id', String(params.varietyId));
  if (params.formatId > 0) sp.set('presentation_format_id', String(params.formatId));
  if (params.clientId > 0) sp.set('client_id', String(params.clientId));
  sp.set('solo_deposito', params.soloDeposito ? '1' : '0');
  if (!params.soloDeposito) {
    if (params.status) sp.set('status', params.status);
    sp.set('excluir_anulados', params.excluirAnulados ? '1' : '0');
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/** Misma vista de filtros que el listado principal, pero pallets reservados por packing list (asignado_pl). */
function buildReservedPlQuery(params: {
  speciesId: number;
  varietyId: number;
  formatId: number;
  clientId: number;
}) {
  const sp = new URLSearchParams();
  if (params.speciesId > 0) sp.set('species_id', String(params.speciesId));
  if (params.varietyId > 0) sp.set('variety_id', String(params.varietyId));
  if (params.formatId > 0) sp.set('presentation_format_id', String(params.formatId));
  if (params.clientId > 0) sp.set('client_id', String(params.clientId));
  sp.set('solo_deposito', '0');
  sp.set('status', 'asignado_pl');
  sp.set('excluir_anulados', '1');
  return `?${sp.toString()}`;
}

type PalletTraceabilityLine = {
  fruit_process_id: number | null;
  productor?: { nombre: string | null; codigo: string | null } | null;
};

type PalletTraceabilityResponse = {
  pallet: {
    id: number;
    corner_board_code: string;
    tarja_ids?: number[];
    unidad_pt_codigos?: string[];
    trazabilidad_pt?: 'unica' | 'varias' | 'sin_trazabilidad';
    codigo_unidad_pt_display?: string;
    mensaje_trazabilidad?: string | null;
  };
  lines: PalletTraceabilityLine[];
};

const TRACE_PREFETCH = 28;

export function ExistenciasPtPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [speciesId, setSpeciesId] = useState(0);
  const [varietyId, setVarietyId] = useState(0);
  const [formatId, setFormatId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [status, setStatus] = useState('');
  const [soloDeposito, setSoloDeposito] = useState(true);
  const [excluirAnulados, setExcluirAnulados] = useState(true);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bolDialogOpen, setBolDialogOpen] = useState(false);
  const [bolInput, setBolInput] = useState('');
  const [unitsForPalletId, setUnitsForPalletId] = useState<number | null>(null);

  const queryStr = useMemo(
    () =>
      buildQuery({
        speciesId,
        varietyId,
        formatId,
        clientId,
        status,
        soloDeposito,
        excluirAnulados,
      }),
    [speciesId, varietyId, formatId, clientId, status, soloDeposito, excluirAnulados],
  );

  useEffect(() => {
    setSelectedIds(new Set());
  }, [queryStr]);

  const { data: species } = useQuery({
    queryKey: ['masters', 'species'],
    queryFn: () => apiJson<MasterSpecies[]>('/api/masters/species'),
  });
  const { data: clients } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<ClientRow[]>('/api/masters/clients'),
  });
  const { data: formats } = useQuery({
    queryKey: ['masters', 'presentation-formats'],
    queryFn: () => apiJson<FormatRow[]>('/api/masters/presentation-formats'),
  });
  const { data: varieties } = useQuery({
    queryKey: ['masters', 'varieties', speciesId],
    queryFn: () =>
      apiJson<MasterVariety[]>(
        speciesId > 0 ? `/api/masters/varieties?species_id=${speciesId}` : '/api/masters/varieties',
      ),
  });

  const { data: rows, isPending, isError, error } = useQuery({
    queryKey: ['existencias-pt', queryStr],
    queryFn: () => apiJson<ExistenciaPtRow[]>(`/api/final-pallets/existencias-pt${queryStr}`),
  });

  const reservedQueryStr = useMemo(
    () => buildReservedPlQuery({ speciesId, varietyId, formatId, clientId }),
    [speciesId, varietyId, formatId, clientId],
  );

  const { data: reservedPlRows, isPending: reservedPlPending } = useQuery({
    queryKey: ['existencias-pt', 'reserved-pl', reservedQueryStr],
    queryFn: () => apiJson<ExistenciaPtRow[]>(`/api/final-pallets/existencias-pt${reservedQueryStr}`),
  });

  const { data: ptTags } = useQuery({
    queryKey: ['pt-tags'],
    queryFn: () => apiJson<PtTagApi[]>('/api/pt-tags'),
  });

  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiJson<FruitProcessRow[]>('/api/processes'),
  });

  const processById = useMemo(() => {
    const m = new Map<number, FruitProcessRow>();
    for (const p of processes ?? []) m.set(p.id, p);
    return m;
  }, [processes]);

  const kpiTotals = useMemo(() => {
    const list = rows ?? [];
    const cajas = list.reduce((s, r) => s + r.boxes, 0);
    const lb = list.reduce((s, r) => s + r.pounds, 0);
    return { cajas, lb };
  }, [rows]);

  const kpiPtDisponibles = useMemo(() => {
    if (!ptTags || !processes) return null;
    const formatCode =
      formatId > 0 ? (formats ?? []).find((f) => f.id === formatId)?.format_code?.trim().toLowerCase() ?? null : null;
    return ptTags.filter((t) => {
      if (t.total_cajas <= 0) return false;
      if (clientId > 0 && Number(t.client_id) !== clientId) return false;
      if (formatCode && t.format_code.trim().toLowerCase() !== formatCode) return false;
      if (speciesId > 0 || varietyId > 0) {
        const ok = t.items.some((it) => {
          const pr = processById.get(it.process_id);
          if (!pr) return false;
          if (speciesId > 0 && Number(pr.especie_id) !== speciesId) return false;
          if (varietyId > 0 && Number(pr.variedad_id) !== varietyId) return false;
          return true;
        });
        if (!ok) return false;
      }
      return true;
    }).length;
  }, [ptTags, processes, clientId, formatId, speciesId, varietyId, formats, processById]);

  const kpiUnidadesReservadasPl = reservedPlPending ? null : (reservedPlRows?.length ?? 0);

  const prefetchTraceIds = useMemo(() => (rows ?? []).slice(0, TRACE_PREFETCH).map((r) => r.id), [rows]);

  const tracePrefetchQueries = useQueries({
    queries: prefetchTraceIds.map((id) => ({
      queryKey: ['final-pallet-traceability', id],
      queryFn: () => apiJson<PalletTraceabilityResponse>(`/api/final-pallets/${id}/traceability`),
      staleTime: 5 * 60_000,
      enabled: prefetchTraceIds.length > 0,
    })),
  });

  function producerLabelForPallet(palletId: number): string {
    const idx = prefetchTraceIds.indexOf(palletId);
    if (idx < 0) return '—';
    const q = tracePrefetchQueries[idx];
    if (q.isPending) return '…';
    if (q.isError || !q.data) return '—';
    const names = [
      ...new Set(
        q.data.lines
          .map((l) => l.productor?.nombre?.trim())
          .filter((x): x is string => !!x && x !== ''),
      ),
    ];
    return names.length ? names.join(' · ') : '—';
  }

  const {
    data: traceForUnitsDialog,
    isPending: traceUnitsPending,
    isError: traceUnitsError,
  } = useQuery({
    queryKey: ['final-pallet-traceability', unitsForPalletId],
    queryFn: () => apiJson<PalletTraceabilityResponse>(`/api/final-pallets/${unitsForPalletId}/traceability`),
    enabled: unitsForPalletId != null && unitsForPalletId > 0,
  });

  const unitsDialogPalletCode = useMemo(() => {
    if (unitsForPalletId == null) return '';
    const r = rows?.find((x) => x.id === unitsForPalletId);
    return (
      r?.corner_board_code?.trim() ||
      r?.codigo_unidad_pt_display?.trim() ||
      r?.tag_code?.trim() ||
      r?.codigo_logistico?.trim() ||
      `PF-${unitsForPalletId}`
    );
  }, [unitsForPalletId, rows]);

  const ptUnitsInDialog = useMemo(() => {
    if (!traceForUnitsDialog || !ptTags) return [];
    const fromApi = traceForUnitsDialog.pallet.tarja_ids;
    const tarjaIds = new Set<number>();
    if (fromApi?.length) {
      for (const tid of fromApi) {
        if (tid > 0 && Number.isFinite(tid)) tarjaIds.add(tid);
      }
    } else {
      for (const ln of traceForUnitsDialog.lines) {
        const pid = ln.fruit_process_id;
        if (!pid) continue;
        const proc = processById.get(pid);
        const tid = proc?.tarja_id != null ? Number(proc.tarja_id) : null;
        if (tid != null && tid > 0 && Number.isFinite(tid)) tarjaIds.add(tid);
      }
    }
    return [...tarjaIds]
      .sort((a, b) => a - b)
      .map((tid) => {
        const tag = ptTags.find((t) => t.id === tid);
        return { id: tid, tag_code: tag?.tag_code ?? `Unidad #${tid}`, total_cajas: tag?.total_cajas ?? 0 };
      });
  }, [traceForUnitsDialog, ptTags, processById]);

  /** Listado API incluye tarja_ids vía proceso + pt_tag_items (misma lógica que columna TAR). */
  function verUnidadesVisibility(row: ExistenciaPtRow): 'allow' | 'hide' | 'wait' {
    if ((row.tarja_ids?.length ?? 0) > 0) return 'allow';
    if (row.trazabilidad_pt === 'sin_trazabilidad') return 'hide';
    const idx = prefetchTraceIds.indexOf(row.id);
    if (idx < 0) return 'allow';
    const q = tracePrefetchQueries[idx];
    if (q.isPending) return 'wait';
    if (q.isError || !q.data) return 'allow';
    const apiIds = q.data.pallet.tarja_ids;
    if (apiIds?.length) return 'allow';
    return 'hide';
  }

  const eligibleRows = useMemo(() => (rows ?? []).filter(canBulkBol), [rows]);

  const bulkBolMut = useMutation({
    mutationFn: (bol: string) =>
      apiJson<{ updated: number }>('/api/final-pallets/bulk-assign-bol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_pallet_ids: [...selectedIds], bol }),
      }),
    onSuccess: (data) => {
      toast.success(`BOL asignado a ${data.updated} registro(s) de Unidad PT.`);
      setBolDialogOpen(false);
      setBolInput('');
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
      qc.invalidateQueries({ queryKey: ['existencias-pt', 'reserved-pl'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPlMut = useMutation({
    mutationFn: () =>
      apiJson<{ id: number; warnings?: string[] }>('/api/pt-packing-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_pallet_ids: [...selectedIds] }),
      }),
    onSuccess: (data) => {
      if (data.warnings?.length) {
        toast.warning(data.warnings.join(' '));
      }
      toast.success('Packing list borrador creado.');
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      qc.invalidateQueries({ queryKey: ['existencias-pt', 'reserved-pl'] });
      navigate(`/existencias-pt/packing-lists/${data.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAllEligible = () => {
    const eligible = eligibleRows;
    if (eligible.length === 0) return;
    const allSelected = eligible.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allSelected) {
        for (const r of eligible) n.delete(r.id);
      } else {
        for (const r of eligible) n.add(r.id);
      }
      return n;
    });
  };

  const allEligibleSelected =
    eligibleRows.length > 0 && eligibleRows.every((r) => selectedIds.has(r.id));

  const selectAllRef = useRef<HTMLInputElement>(null);
  const someEligibleSelected =
    eligibleRows.some((r) => selectedIds.has(r.id)) && !allEligibleSelected;
  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someEligibleSelected;
  }, [someEligibleSelected]);

  const totalEnListado = rows?.length ?? 0;

  const groupedByFormat = useMemo(() => {
    const map = new Map<
      string,
      {
        format: string;
        rows: ExistenciaPtRow[];
        totalBoxes: number;
        totalLb: number;
        pallets: number;
        definitive: number;
        pending: number;
        principalClient: string;
        hasCommitted: boolean;
        hasDispatched: boolean;
      }
    >();
    for (const r of rows ?? []) {
      const fmt = (r.format_code ?? '—').trim() || '—';
      const g = map.get(fmt) ?? {
        format: fmt,
        rows: [],
        totalBoxes: 0,
        totalLb: 0,
        pallets: 0,
        definitive: 0,
        pending: 0,
        principalClient: '—',
        hasCommitted: false,
        hasDispatched: false,
      };
      g.rows.push(r);
      g.totalBoxes += Number.isFinite(r.boxes) ? r.boxes : 0;
      g.totalLb += Number.isFinite(r.pounds) ? r.pounds : 0;
      g.pallets += 1;
      if (String(r.status || '').toLowerCase() === 'definitivo') g.definitive += 1;
      else g.pending += 1;
      if (r.status === 'asignado_pl' || r.planned_sales_order_id != null || r.sales_order_number?.trim()) g.hasCommitted = true;
      if (r.dispatch_id != null && Number(r.dispatch_id) > 0) g.hasDispatched = true;
      map.set(fmt, g);
    }
    return [...map.values()]
      .map((g) => {
        const byClient = new Map<string, number>();
        for (const r of g.rows) {
          const c = r.client_nombre?.trim() || 'Sin cliente';
          byClient.set(c, (byClient.get(c) ?? 0) + r.boxes);
        }
        const sortedClients = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
        const principalClient = sortedClients.length === 0 ? 'Sin cliente' : sortedClients.length === 1 ? sortedClients[0][0] : 'Varios clientes';
        const sortedRows = g.rows
          .slice()
          .sort((a, b) => (a.client_nombre ?? '').localeCompare(b.client_nombre ?? '') || b.id - a.id);
        return { ...g, rows: sortedRows, principalClient };
      })
      .sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [rows]);

  return (
    <div className="space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <h2 className={pageTitle}>Existencias PT · Inventario cámara</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>Stock PT en cámara, BOL, despacho y packing lists.</p>
            <button
              type="button"
              className={pageInfoButton}
              title="El pallet nace en Unidad PT (PF-…). Por defecto: definitivo, sin despacho. KPIs y reservas PL en paralelo a la API."
              aria-label="Ayuda inventario"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline" size="sm" className={btnToolbarOutline}>
            <Link to="/existencias-pt/repaletizar" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Repaletizaje
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className={btnToolbarOutline}>
            <Link to="/existencias-pt/packing-lists" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Packing Lists PT
            </Link>
          </Button>
          <Button asChild size="sm" className={cn(btnToolbarPrimary, 'px-4')}>
            <Link to="/pt-tags" className="gap-2">
              <Tag className="h-4 w-4" />
              Unidad PT
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="ex-kpis" className="space-y-4">
        <h2 id="ex-kpis" className="sr-only">
          Indicadores de inventario
        </h2>
        <div className={kpiGrid}>
          <div className={kpiCard}>
            <p className={kpiLabel}>En cámara (filas)</p>
            <p className={kpiValueLg}>{isPending ? '—' : formatCount(totalEnListado)}</p>
            <p className={kpiFootnote}>Listado actual · máx. 500</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={kpiValueLg}>{isPending ? '—' : formatCount(kpiTotals.cajas)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Peso total (lb)</p>
            <p className={kpiValueLg}>{isPending ? '—' : fmtLb(kpiTotals.lb)}</p>
            <p className={kpiFootnote}>Disponible</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Unidades PT (tarjas)</p>
            <p className={kpiValueLg}>{kpiPtDisponibles == null ? '—' : formatCount(kpiPtDisponibles)}</p>
            <p className={kpiFootnote}>Con cajas · mismos filtros</p>
          </div>
        </div>
        <div className={kpiGrid}>
          <div className="flex min-h-[132px] flex-col justify-between rounded-lg border border-border bg-background p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reservadas packing list</p>
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                kpiUnidadesReservadasPl == null || kpiUnidadesReservadasPl === 0
                  ? 'text-foreground'
                  : 'text-amber-600',
              )}
            >
              {kpiUnidadesReservadasPl == null ? '—' : formatCount(kpiUnidadesReservadasPl)}
            </p>
            <p className="text-[11px] text-muted-foreground">Estado asignado_pl · filtros alineados</p>
          </div>
        </div>
      </section>

      <div className={filterPanel}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Especie, variedad, formato, cliente y estado de pallet."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Especie</Label>
            <select
              className={filterSelectClass}
              value={speciesId}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeciesId(v);
                setVarietyId(0);
              }}
            >
              <option value={0}>Todas</option>
              {(species ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Variedad</Label>
            <select
              className={filterSelectClass}
              value={varietyId}
              onChange={(e) => setVarietyId(Number(e.target.value))}
            >
              <option value={0}>Todas</option>
              {(varieties ?? [])
                .filter((v) => (speciesId > 0 ? v.species_id === speciesId : true))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Formato</Label>
            <select
              className={filterSelectClass}
              value={formatId}
              onChange={(e) => setFormatId(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {(formats ?? [])
                .filter((f) => f.activo)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.format_code}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliente</Label>
            <select
              className={filterSelectClass}
              value={clientId}
              onChange={(e) => setClientId(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {(clients ?? [])
                .filter((c) => c.activo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado</Label>
            <select
              className={filterSelectClass}
              disabled={soloDeposito}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos (según reglas)</option>
              <option value="borrador">borrador</option>
              <option value="definitivo">definitivo</option>
              <option value="anulado">anulado</option>
              <option value="repaletizado">repaletizado</option>
              <option value="revertido">revertido</option>
              <option value="asignado_pl">asignado_pl (packing list)</option>
            </select>
              {soloDeposito ? (
              <p className="text-[11px] text-muted-foreground">
                Fijo: definitivo, sin despacho, cajas/lb &gt; 0.
              </p>
            ) : null}
          </div>
          <div className="grid gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={soloDeposito}
                  onChange={(e) => {
                    setSoloDeposito(e.target.checked);
                    if (e.target.checked) setStatus('');
                  }}
                />
                Solo disponibles en depósito (definitivo y sin despacho)
              </label>
              {!soloDeposito ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={excluirAnulados}
                    onChange={(e) => setExcluirAnulados(e.target.checked)}
                  />
                  Excluir anulados (si no elegís estado)
                </label>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="ex-inventario">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="ex-inventario" className={sectionTitle}>
              Inventario cámara
            </h3>
            <p className={sectionHint}>
              {rows?.length ?? 0} fila(s) · máx. 500
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={pageInfoButton}
              title={`Primeras ${TRACE_PREFETCH} filas con prefetch de trazabilidad para la columna productor.`}
              aria-label="Ayuda productor en tabla"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 rounded-md px-3 text-xs',
                  viewMode === 'compact' ? 'bg-[#1D9E75] text-white hover:bg-[#1D9E75] hover:text-white' : '',
                )}
                onClick={() => setViewMode('compact')}
              >
                Compacta
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 rounded-md px-3 text-xs',
                  viewMode === 'detailed' ? 'bg-[#1D9E75] text-white hover:bg-[#1D9E75] hover:text-white' : '',
                )}
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
                  <span className="font-semibold text-emerald-700">Disponible:</span> stock libre para uso logístico
                </p>
                <p>
                  <span className="font-semibold text-sky-700">En PL:</span> unidad vinculada a Packing List
                </p>
                <p>
                  <span className="font-semibold text-amber-800">En pedido:</span> stock comprometido con pedido
                </p>
                <p>
                  <span className="font-semibold text-slate-600">Despachado:</span> stock ya salido
                </p>
                <p>
                  <span className="font-semibold text-violet-700">Re-paletizado:</span> unidad generada o modificada por repaletizaje
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Sin compromiso:</span> stock sin vínculo comercial/logístico actual
                </p>
              </div>
            </details>
          </div>
        </div>
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
            <span className="font-semibold tabular-nums text-slate-800">{selectedIds.size} seleccionado(s)</span>
            <Button type="button" size="sm" className="h-9 rounded-lg" onClick={() => setBolDialogOpen(true)}>
              Asignar BOL
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 rounded-lg"
              disabled={createPlMut.isPending}
              onClick={() => createPlMut.mutate()}
            >
              {createPlMut.isPending ? 'Creando…' : 'Crear packing list'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setSelectedIds(new Set())}>
              Quitar selección
            </Button>
          </div>
        ) : null}
          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : isError ? (
            <div role="alert" className={errorStatePanel}>
              {(error as Error)?.message ?? 'Error al cargar'}
            </div>
          ) : !rows?.length ? (
            <p className={emptyStatePanel}>No hay Unidades PT que coincidan con los filtros.</p>
          ) : viewMode === 'compact' ? (
            <div className="space-y-4">
              {groupedByFormat.map((group) => (
                <div key={group.format} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
                    <p className="font-mono text-sm font-semibold text-slate-900">{group.format}</p>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{formatCount(group.totalBoxes)}</span> cajas
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{fmtLb(group.totalLb)}</span> lb
                    </p>
                    <p className="text-xs text-slate-600">{formatCount(group.pallets)} pallets</p>
                    <p className="text-xs text-slate-600">
                      Cliente: <span className="font-medium text-slate-900">{group.principalClient}</span>
                    </p>
                    {group.hasCommitted ? (
                      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900">
                        Stock comprometido
                      </span>
                    ) : null}
                    {group.hasDispatched ? (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800">
                        Con despachos
                      </span>
                    ) : null}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="w-11 pl-4 pr-0">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={allEligibleSelected}
                            disabled={eligibleRows.length === 0}
                            onChange={toggleSelectAllEligible}
                            title="Seleccionar filas elegibles (definitivo, sin despacho)"
                          />
                        </TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Unidad PT / Pallet</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Productor</TableHead>
                        <TableHead>Variedad</TableHead>
                        <TableHead className="text-right">Cajas disp.</TableHead>
                        <TableHead className="text-right">Peso (lb)</TableHead>
                        <TableHead>Ubicación</TableHead>
                        <TableHead>Trazabilidad</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((r) => {
                        const tone = compactStateTone(r);
                        const producerCell = producerLabelForPallet(r.id);
                        const vu = verUnidadesVisibility(r);
                        const codeDisplay =
                          r.codigo_unidad_pt_display?.trim() ||
                          r.tag_code?.trim() ||
                          r.corner_board_code ||
                          `PF-${r.id}`;
                        const traceBadges = compactTraceabilityBadges(r);
                        return (
                          <TableRow key={r.id} className={cn(tableBodyRow, 'relative')}>
                            <TableCell className="w-11 py-2.5 pl-4 pr-0">
                              <span className={cn('absolute inset-y-1 left-0 w-1 rounded-r-sm', tone.bar)} />
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 disabled:opacity-40"
                                checked={selectedIds.has(r.id)}
                                disabled={!canBulkBol(r)}
                                onChange={() => toggleRow(r.id)}
                              />
                            </TableCell>
                            <TableCell className="py-2.5">
                              <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', tone.badge)}>
                                {tone.label}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[190px] py-2.5">
                              <Link
                                to={`/existencias-pt/detalle/${r.id}`}
                                className="font-mono text-xs font-semibold text-slate-900 underline decoration-slate-200 underline-offset-2 hover:text-primary hover:decoration-primary"
                              >
                                {codeDisplay}
                              </Link>
                            </TableCell>
                            <TableCell className="max-w-[140px] truncate py-2.5 text-xs text-slate-700">
                              {r.client_nombre?.trim() || '—'}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate py-2.5 text-xs text-slate-700" title={producerCell}>
                              {producerCell}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate py-2.5 text-xs text-slate-700">
                              {r.variedades_label?.trim() || '—'}
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-950">
                              {formatCount(r.boxes)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">
                              {fmtLb(r.pounds)}
                            </TableCell>
                            <TableCell className="max-w-[130px] truncate py-2.5 font-mono text-[11px] text-slate-600">
                              {r.corner_board_code?.trim() || '—'}
                            </TableCell>
                            <TableCell className="max-w-[220px] py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {traceBadges.map((badge) => (
                                  <span
                                    key={`${r.id}-${badge}`}
                                    className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button asChild type="button" variant="outline" size="sm" className="h-7 rounded-md px-2 text-[11px]">
                                  <Link to={`/existencias-pt/detalle/${r.id}`}>Ver detalle</Link>
                                </Button>
                                {vu === 'hide' ? (
                                  <span className="inline-flex items-center text-[11px] text-slate-400">Sin detalle PT</span>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 rounded-md px-2 text-[11px]"
                                    disabled={vu === 'wait'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUnitsForPalletId(r.id);
                                    }}
                                  >
                                    <Layers className="h-3.5 w-3.5" />
                                    Unidades
                                  </Button>
                                )}
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
                    <TableHead className="w-11 pl-4 pr-0">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allEligibleSelected}
                        disabled={eligibleRows.length === 0}
                        onChange={toggleSelectAllEligible}
                        title="Seleccionar filas elegibles (definitivo, sin despacho)"
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px]">Código / unidad</TableHead>
                    <TableHead className="whitespace-nowrap">Estado</TableHead>
                    <TableHead className="whitespace-nowrap">Formato</TableHead>
                    <TableHead className="text-right tabular-nums">Cajas</TableHead>
                    <TableHead className="whitespace-nowrap text-right tabular-nums">Peso (lb)</TableHead>
                    <TableHead className="min-w-[100px]">Cliente</TableHead>
                    <TableHead className="min-w-[88px]">Ubicación</TableHead>
                    <TableHead className="min-w-[120px]">Productor</TableHead>
                    <TableHead className="min-w-[100px]">Variedad</TableHead>
                    <TableHead className="min-w-[100px]">Condición</TableHead>
                    <TableHead className="min-w-[120px]">Logística</TableHead>
                    <TableHead className="whitespace-nowrap">Repallet</TableHead>
                    <TableHead className="w-[132px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const producerCell = producerLabelForPallet(r.id);
                    const vu = verUnidadesVisibility(r);
                    const codeDisplay =
                      r.codigo_unidad_pt_display?.trim() ||
                      r.tag_code?.trim() ||
                      r.corner_board_code ||
                      `PF-${r.id}`;
                    return (
                      <TableRow key={r.id} className={tableBodyRow}>
                        <TableCell className="w-11 py-3.5 pl-4 pr-0 align-middle">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 disabled:opacity-40"
                            checked={selectedIds.has(r.id)}
                            disabled={!canBulkBol(r)}
                            onChange={() => toggleRow(r.id)}
                            title={
                              canBulkBol(r)
                                ? 'Seleccionar para asignación de BOL'
                                : 'Solo definitivos sin despacho'
                            }
                          />
                        </TableCell>
                        <TableCell className="max-w-[200px] py-3.5">
                          <Link
                            to={`/existencias-pt/detalle/${r.id}`}
                            className="font-mono text-sm font-semibold text-slate-900 underline decoration-slate-200 underline-offset-2 hover:text-primary hover:decoration-primary"
                            title={
                              r.trazabilidad_pt === 'sin_trazabilidad'
                                ? `Sin unidad PT vinculada; identificador logístico: ${(r.codigo_logistico ?? r.corner_board_code) || `PF-${r.id}`}`
                                : (r.mensaje_trazabilidad ?? `ID ${r.id}`)
                            }
                          >
                            {codeDisplay}
                          </Link>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                            {r.corner_board_code?.trim() || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5">
                          <PalletStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className="font-mono text-sm font-medium text-slate-800">{r.format_code ?? '—'}</span>
                        </TableCell>
                        <TableCell className="py-3.5">
                          <BoxesHighlightCell r={r} />
                        </TableCell>
                        <TableCell className="py-3.5 text-right text-sm tabular-nums text-slate-900">{fmtLb(r.pounds)}</TableCell>
                        <TableCell className="max-w-[130px] py-3.5 text-sm text-slate-700">
                          {r.client_id != null && r.client_id > 0 && r.client_nombre?.trim() ? (
                            r.client_nombre
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[120px] py-3.5">
                          <span
                            className="font-mono text-xs text-slate-700"
                            title={r.corner_board_code ? `ID interno: ${r.id}` : `PF-${r.id}`}
                          >
                            {r.corner_board_code?.trim() || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] py-3.5 text-sm text-slate-700" title={producerCell}>
                          {producerCell}
                        </TableCell>
                        <TableCell className="max-w-[160px] py-3.5">
                          <div className="text-sm leading-snug text-slate-800">{r.variedades_label?.trim() || '—'}</div>
                          {r.species_nombre?.trim() ? (
                            <div className="mt-0.5 text-[11px] text-slate-400">{r.species_nombre}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <DisponibilidadBadge r={r} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <LogisticaCell r={r} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <RepalletEstadoCell r={r} />
                        </TableCell>
                        <TableCell className="py-3.5 text-right">
                          {vu === 'hide' ? (
                            <span
                              className="inline-block max-w-[118px] text-left text-[11px] leading-snug text-slate-400"
                              title="Este stock proviene de líneas sin vínculo a unidad PT por proceso (modelo actual). No hay listado de tarjas que mostrar."
                            >
                              Sin detalle PT
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 rounded-lg border-slate-200 px-2.5 text-xs font-medium"
                              disabled={vu === 'wait'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnitsForPalletId(r.id);
                              }}
                              title={
                                vu === 'wait'
                                  ? 'Comprobando trazabilidad…'
                                  : 'Ver unidades PT vinculadas vía proceso'
                              }
                            >
                              <Layers className="h-3.5 w-3.5" />
                              Unidades
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
      </section>

      <Dialog
        open={unitsForPalletId != null}
        onOpenChange={(o) => {
          if (!o) setUnitsForPalletId(null);
        }}
      >
        <DialogContent
          className={cn(
            operationalModalContentClass,
            'min-h-0 max-h-[min(90vh,920px)] max-w-[min(720px,calc(100vw-2rem))] sm:max-w-[min(720px,calc(100vw-2rem))] gap-0 p-0 [&>button]:hidden',
          )}
        >
          <div className="flex items-center border-b border-border px-4 py-3">
            <span className="mr-2 h-2 w-2 rounded-full bg-[#1D9E75]" aria-hidden />
            <span className="text-sm font-semibold">
              Unidades PT · {unitsDialogPalletCode || '—'}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setUnitsForPalletId(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={cn(operationalModalFormClass)}>
            <div className={cn(operationalModalBodyClass, 'max-h-[min(58vh,520px)] overflow-y-auto lg:px-8')}>
          <div className="space-y-2 text-sm">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Tarjas vinculadas vía proceso (misma cadena que el detalle del pallet).
            </p>
            <details className="group text-[13px] text-muted-foreground">
              <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                  <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  Más contexto
                </span>
              </summary>
              <p className="mt-2 max-w-prose text-pretty leading-snug">
                Tarjas vinculadas vía proceso de las líneas del registro logístico (misma cadena que la trazabilidad del detalle). El stock
                mostrado en la tabla principal es el de cámara / existencias PT.
              </p>
            </details>
            {unitsForPalletId != null && traceUnitsPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : traceUnitsError ? (
              <div role="alert" className={errorStatePanel}>
                No se pudo cargar la trazabilidad de este registro.
              </div>
            ) : ptUnitsInDialog.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Este stock puede existir sin listado de unidades PT visibles: líneas sin proceso con tarja, o modelo
                cargado antes de la trazabilidad completa. El total de cajas/lb sigue siendo válido para operación.
              </p>
            ) : (
              <ul className="space-y-2">
                {ptUnitsInDialog.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/15 px-3 py-2"
                  >
                    <div>
                      <span className="font-mono font-medium">{u.tag_code}</span>
                      <p className="text-xs text-muted-foreground">
                        {u.total_cajas} cajas en la unidad PT (stock global de la tarja)
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" asChild>
                      <Link to="/pt-tags">Ir a Unidad PT</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
            </div>
          <DialogFooter className={operationalModalFooterClass}>
            <Button type="button" variant="outline" onClick={() => setUnitsForPalletId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bolDialogOpen} onOpenChange={setBolDialogOpen}>
        <DialogContent
          className={cn(
            operationalModalContentClass,
            'min-h-0 max-h-[min(88vh,640px)] max-w-[min(520px,calc(100vw-2rem))] sm:max-w-[min(520px,calc(100vw-2rem))]',
          )}
        >
          <DialogHeader className={operationalModalHeaderClass}>
            <DialogTitle className={operationalModalTitleClass}>Asignar BOL</DialogTitle>
            <DialogDescription className={operationalModalDescriptionClass}>
              Mismo BOL para {selectedIds.size} registro(s) seleccionado(s), solo en estado definitivo sin despacho.
            </DialogDescription>
            <details className="group text-[13px] text-muted-foreground">
              <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                  <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  Alcance y corrección
                </span>
              </summary>
              <p className="mt-2 max-w-prose text-pretty leading-snug">
                Se aplicará el mismo BOL a los seleccionados. Solo aplica a Unidad PT en estado definitivo sin despacho; podés corregirlo
                después desde el detalle o el flujo logístico habitual.
              </p>
            </details>
          </DialogHeader>
          <div className={cn(operationalModalFormClass)}>
          <div className={cn(operationalModalBodyClass, 'lg:px-8')}>
          <div className="grid gap-2 py-2">
            <Label htmlFor="bulk-bol">BOL (pedido)</Label>
            <Input
              id="bulk-bol"
              placeholder="Ej. BOL-2026-0042"
              value={bolInput}
              onChange={(e) => setBolInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          </div>
          <DialogFooter className={cn(operationalModalFooterClass, 'gap-2 sm:gap-0')}>
            <Button type="button" variant="outline" onClick={() => setBolDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={bulkBolMut.isPending || selectedIds.size === 0}
              onClick={() => bulkBolMut.mutate(bolInput)}
            >
              {bulkBolMut.isPending ? 'Guardando…' : 'Aplicar'}
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
