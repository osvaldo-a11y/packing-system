import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, Filter, Info, Layers, ListOrdered, RotateCcw, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { PineBoxesIcon, PineCubeIcon, PineDocumentIcon, PinePlusIcon, PineSnowflakeIcon, PineWeightIcon } from '@/components/icons/pinebloom';
import { appBranding } from '@/lib/branding';
import { toast } from 'sonner';
import { apiJson } from '@/api';
import { OperateOnly } from '@/components/OperateOnly';
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
import { localDateYmd } from '@/lib/date-filter';
import { formatCount, formatLb } from '@/lib/number-format';
import {
  emptyStatePanel,
  errorStatePanel,
  filterInputClass,
  filterSelectClass,
  kpiCard,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  operationalModalBodyClass,
  operationalModalContentClass,
  operationalModalDescriptionClass,
  operationalModalFooterClass,
  operationalModalFormClass,
  operationalModalHeaderClass,
  operationalModalTitleClass,
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
  /** Productor(es) desde líneas → proceso (viene en listado; no depende del prefetch de trazabilidad). */
  productor_label?: string | null;
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

/** Normaliza código de formato para reglas de cajas/pallet (sin espacios, minúsculas). */
function normalizeFormatKey(formatCode: string): string {
  return formatCode.trim().toLowerCase().replace(/\s+/g, '');
}

/** Cajas por pallet según formato (resumen de selección en existencias). */
function boxesPerPalletForFormatCode(formatCode: string): number {
  const fc = normalizeFormatKey(formatCode);
  if (fc === '12x18oz') return 100;
  if (fc === '12x6oz') return 240;
  return 144;
}

/** Pallets equivalentes del total de cajas seleccionadas en ese formato. */
function equivalentPalletsForFormatTotal(formatCode: string, totalBoxes: number): number {
  const cap = boxesPerPalletForFormatCode(formatCode);
  if (!Number.isFinite(totalBoxes) || totalBoxes <= 0 || cap <= 0) return 0;
  return Math.ceil(totalBoxes / cap);
}

function BoxesHighlightCell({ r }: { r: ExistenciaPtRow }) {
  const fromMaster =
    r.max_boxes_per_pallet != null ? Number(r.max_boxes_per_pallet) : null;
  const max =
    fromMaster != null && Number.isFinite(fromMaster) && fromMaster > 0
      ? fromMaster
      : boxesPerPalletForFormatCode(r.format_code ?? '');
  const hasCap = max > 0;
  const full = hasCap && r.boxes >= max;
  const partial = hasCap && r.boxes > 0 && r.boxes < max;
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

function PalletStatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    definitivo: 'border-emerald-200/80 bg-emerald-50 text-emerald-900',
    borrador: 'border-slate-200 bg-slate-100 text-slate-700',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
    repaletizado: 'border-violet-200/80 bg-violet-50 text-violet-900',
    revertido: 'border-amber-200/80 bg-amber-50 text-amber-950',
    asignado_pl: 'border-sky-200/80 bg-sky-50 text-sky-900',
  };
  const labelMap: Record<string, string> = {
    definitivo: t('existenciasPt.palletStatus.definitivo'),
    borrador: t('existenciasPt.palletStatus.borrador'),
    anulado: t('existenciasPt.palletStatus.anulado'),
    repaletizado: t('existenciasPt.palletStatus.repaletizado'),
    revertido: t('existenciasPt.palletStatus.revertido'),
    asignado_pl: t('existenciasPt.palletStatus.asignado_pl'),
  };
  return (
    <span
      className={cn(
        'inline-flex max-w-[140px] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize leading-none',
        map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800',
      )}
      title={status}
    >
      {labelMap[s] ?? status}
    </span>
  );
}

function RepalletEstadoCell({
  r,
  t,
}: {
  r: ExistenciaPtRow;
  t: (key: string) => string;
}) {
  if (r.repalletizaje === 'resultado') {
    return (
      <span
        className="inline-flex rounded-full border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900"
        title={t('existenciasPt.repallet.resultTitle')}
      >
        {t('existenciasPt.repallet.result')}
      </span>
    );
  }
  if (r.repalletizaje === 'origen') {
    return (
      <span
        className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-950"
        title={t('existenciasPt.repallet.originTitle')}
      >
        {t('existenciasPt.repallet.origin')}
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}

function logisticaResumen(
  r: ExistenciaPtRow,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (r.dispatch_bol?.trim()) return t('existenciasPt.logistica.bol', { value: r.dispatch_bol.trim() });
  if (r.sales_order_number?.trim()) return t('existenciasPt.logistica.order', { value: r.sales_order_number.trim() });
  if (r.planned_order_number?.trim()) return t('existenciasPt.logistica.plan', { value: r.planned_order_number.trim() });
  if (r.dispatch_id != null && r.dispatch_id > 0) return t('existenciasPt.logistica.dispatch', { value: r.dispatch_id });
  return '—';
}

function DisponibilidadBadge({
  r,
  t,
}: {
  r: ExistenciaPtRow;
  t: (key: string) => string;
}) {
  if (canBulkBol(r)) {
    return (
      <span
        className="inline-flex max-w-[140px] truncate rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900"
        title={t('existenciasPt.disponibilidad.inDepositTitle')}
      >
        {t('existenciasPt.disponibilidad.inDeposit')}
      </span>
    );
  }
  if (r.status === 'asignado_pl') {
    return (
      <span
        className="inline-flex max-w-[140px] truncate rounded-full border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900"
        title={t('existenciasPt.disponibilidad.reservedPlTitle')}
      >
        {t('existenciasPt.disponibilidad.reservedPl')}
      </span>
    );
  }
  if (r.dispatch_id != null && r.dispatch_id > 0) {
    return (
      <span
        className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800"
        title={t('existenciasPt.disponibilidad.dispatchedTitle')}
      >
        {t('existenciasPt.disponibilidad.dispatched')}
      </span>
    );
  }
  return <span className="text-[11px] text-slate-400">—</span>;
}

function LogisticaCell({
  r,
  t,
}: {
  r: ExistenciaPtRow;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const line1 = logisticaResumen(r, t);
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

function compactStateTone(
  r: ExistenciaPtRow,
  t: (key: string) => string
): { bar: string; label: string; badge: string } {
  const s = String(r.status || '').toLowerCase();
  if (s === 'anulado') {
    return { bar: 'bg-rose-400', label: t('existenciasPt.compactTone.problem'), badge: 'border-rose-200 bg-rose-50 text-rose-900' };
  }
  if (r.dispatch_id != null && Number(r.dispatch_id) > 0) {
    return { bar: 'bg-slate-400', label: t('existenciasPt.compactTone.dispatched'), badge: 'border-slate-200 bg-slate-100 text-slate-800' };
  }
  if (s === 'asignado_pl' || r.planned_sales_order_id != null) {
    return { bar: 'bg-sky-400', label: t('existenciasPt.compactTone.committed'), badge: 'border-sky-200 bg-sky-50 text-sky-900' };
  }
  if (s === 'borrador' || s === 'revertido') {
    return { bar: 'bg-amber-400', label: t('existenciasPt.compactTone.pending'), badge: 'border-amber-200 bg-amber-50 text-amber-900' };
  }
  return { bar: 'bg-emerald-400', label: t('existenciasPt.compactTone.available'), badge: 'border-emerald-200 bg-emerald-50 text-emerald-900' };
}

function compactTraceabilityBadges(
  r: ExistenciaPtRow,
  t: (key: string) => string
): string[] {
  const out: string[] = [];
  if (r.repalletizaje === 'resultado' || r.repalletizaje === 'origen') out.push(t('existenciasPt.traceability.repallet'));
  if (r.dispatch_id != null && Number(r.dispatch_id) > 0) out.push(t('existenciasPt.traceability.dispatched'));
  else if (r.status === 'asignado_pl' || r.planned_order_number?.trim()) out.push(t('existenciasPt.traceability.inPl'));
  if (r.sales_order_number?.trim()) out.push(t('existenciasPt.traceability.inOrder'));
  if (out.length === 0) out.push(t('existenciasPt.traceability.noCommit'));
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
  fechaDesde: string;
  fechaHasta: string;
}) {
  const sp = new URLSearchParams();
  if (params.speciesId > 0) sp.set('species_id', String(params.speciesId));
  if (params.varietyId > 0) sp.set('variety_id', String(params.varietyId));
  if (params.formatId > 0) sp.set('presentation_format_id', String(params.formatId));
  if (params.clientId > 0) sp.set('client_id', String(params.clientId));
  if (params.fechaDesde.trim()) sp.set('fecha_desde', params.fechaDesde.trim());
  if (params.fechaHasta.trim()) sp.set('fecha_hasta', params.fechaHasta.trim());
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
  fechaDesde: string;
  fechaHasta: string;
}) {
  const sp = new URLSearchParams();
  if (params.speciesId > 0) sp.set('species_id', String(params.speciesId));
  if (params.varietyId > 0) sp.set('variety_id', String(params.varietyId));
  if (params.formatId > 0) sp.set('presentation_format_id', String(params.formatId));
  if (params.clientId > 0) sp.set('client_id', String(params.clientId));
  if (params.fechaDesde.trim()) sp.set('fecha_desde', params.fechaDesde.trim());
  if (params.fechaHasta.trim()) sp.set('fecha_hasta', params.fechaHasta.trim());
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
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [speciesId, setSpeciesId] = useState(0);
  const [varietyId, setVarietyId] = useState(0);
  const [formatId, setFormatId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [status, setStatus] = useState('');
  const [soloDeposito, setSoloDeposito] = useState(true);
  const [excluirAnulados, setExcluirAnulados] = useState(true);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bolFilter, setBolFilter] = useState('');
  const [bolDialogOpen, setBolDialogOpen] = useState(false);
  const [bolInput, setBolInput] = useState('');
  const [unitsForPalletId, setUnitsForPalletId] = useState<number | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

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
        fechaDesde: filterDateFrom,
        fechaHasta: filterDateTo,
      }),
    [speciesId, varietyId, formatId, clientId, status, soloDeposito, excluirAnulados, filterDateFrom, filterDateTo],
  );

  useEffect(() => {
    setSelectedIds(new Set());
    setBolFilter('');
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
    () =>
      buildReservedPlQuery({
        speciesId,
        varietyId,
        formatId,
        clientId,
        fechaDesde: filterDateFrom,
        fechaHasta: filterDateTo,
      }),
    [speciesId, varietyId, formatId, clientId, filterDateFrom, filterDateTo],
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

  const filteredRows = useMemo(() => {
    const list = rows ?? [];
    const b = bolFilter.trim().toLowerCase();
    if (!b) return list;
    return list.filter((r) => (r.bol ?? '').trim().toLowerCase() === b);
  }, [rows, bolFilter]);

  useEffect(() => {
    const visible = new Set(filteredRows.map((r) => r.id));
    setSelectedIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [filteredRows]);

  const bolOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of rows ?? []) {
      const t = (r.bol ?? '').trim();
      if (t) uniq.add(t);
    }
    return [...uniq].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const kpiTotals = useMemo(() => {
    const list = filteredRows;
    const cajas = list.reduce((s, r) => s + r.boxes, 0);
    const lb = list.reduce((s, r) => s + r.pounds, 0);
    return { cajas, lb };
  }, [filteredRows]);

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

  const prefetchTraceIds = useMemo(() => filteredRows.slice(0, TRACE_PREFETCH).map((r) => r.id), [filteredRows]);

  const tracePrefetchQueries = useQueries({
    queries: prefetchTraceIds.map((id) => ({
      queryKey: ['final-pallet-traceability', id],
      queryFn: () => apiJson<PalletTraceabilityResponse>(`/api/final-pallets/${id}/traceability`),
      staleTime: 5 * 60_000,
      enabled: prefetchTraceIds.length > 0,
    })),
  });

  function producerLabelForPallet(row: ExistenciaPtRow): string {
    const fromList = row.productor_label?.trim();
    if (fromList) return fromList;
    const idx = prefetchTraceIds.indexOf(row.id);
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

  const eligibleRows = useMemo(() => filteredRows.filter(canBulkBol), [filteredRows]);

  const bulkBolMut = useMutation({
    mutationFn: (bol: string) =>
      apiJson<{ updated: number }>('/api/final-pallets/bulk-assign-bol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_pallet_ids: [...selectedIds], bol }),
      }),
    onSuccess: (data) => {
      toast.success(t('existenciasPt.toast.bolAssigned', { count: data.updated }));
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
      toast.success(t('existenciasPt.toast.plCreated'));
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

  const totalEnListado = filteredRows.length;

  const selectionByFormat = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRows) {
      if (!selectedIds.has(r.id)) continue;
      const fmt = (r.format_code ?? '—').trim() || '—';
      const rowBoxes = Number.isFinite(r.boxes) ? r.boxes : 0;
      m.set(fmt, (m.get(fmt) ?? 0) + rowBoxes);
    }
    return [...m.entries()]
      .map(([fmt, boxes]) => [fmt, { boxes, pallets: equivalentPalletsForFormatTotal(fmt, boxes) }] as const)
      .sort((a, b) => b[1].boxes - a[1].boxes);
  }, [filteredRows, selectedIds]);

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
    for (const r of filteredRows) {
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
        const principalClient =
          sortedClients.length === 0
            ? t('existenciasPt.clientSummary.none')
            : sortedClients.length === 1
              ? sortedClients[0][0]
              : t('existenciasPt.clientSummary.multiple');
        const sortedRows = g.rows
          .slice()
          .sort((a, b) => (a.client_nombre ?? '').localeCompare(b.client_nombre ?? '') || b.id - a.id);
        return {
          ...g,
          rows: sortedRows,
          principalClient,
          pallets: equivalentPalletsForFormatTotal(g.format, g.totalBoxes),
        };
      })
      .sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredRows, t]);

  const todayYmd = localDateYmd();
  const todayActive = filterDateFrom === todayYmd && filterDateTo === todayYmd;
  const seeAllActive = !filterDateFrom && !filterDateTo;

  return (
    <div className="space-y-5 max-lg:overflow-x-hidden lg:-mx-7 lg:min-h-[calc(100vh-52px)] lg:space-y-0 lg:bg-[#F9F7F5] lg:px-7">
      <header
        data-stock-mobile-hero
        className="relative overflow-hidden rounded-[14px] border border-[var(--stone-300)] bg-white/55 px-3.5 pb-2.5 pt-3 lg:hidden"
      >
        <div className="relative z-[1]">
          <h1 className="font-serif text-[31px] font-semibold leading-none tracking-[-0.55px] text-[var(--ink)]">
            {t('nav.items.existenciasPt')}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 text-[14px] leading-snug text-[var(--ink-muted)]">
            <span>{t('existenciasPt.pageSubtitle')}</span>
            <button
              type="button"
              className={pageInfoButton}
              title="El pallet nace en Unidad PT (PF-…). Por defecto: definitivo, sin despacho. KPIs y reservas PL en paralelo a la API."
              aria-label={t('nav.items.existenciasPt')}
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <Button asChild className="mt-2 h-[42px] w-full gap-2 rounded-[10px] bg-[var(--olive-700)] px-4 text-[15px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]">
            <Link to="/pt-tags">
              <PinePlusIcon size={20} strokeWidth={2.1} />
              {t('existenciasPt.ptUnitButton')}
            </Link>
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="h-10 rounded-[8px] border-[var(--stone-300)] bg-white px-2 text-[12px] font-semibold shadow-none">
              <Link to="/existencias-pt/repaletizar" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                {t('existenciasPt.repalletButton')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-[8px] border-[var(--stone-300)] bg-white px-2 text-[12px] font-semibold shadow-none">
              <Link to="/existencias-pt/packing-lists" className="gap-1.5">
                <ListOrdered className="h-3.5 w-3.5" />
                {t('existenciasPt.plButton')}
              </Link>
            </Button>
          </div>
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
        data-stock-mobile-tabs
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
        data-stock-desktop-hero
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
              {t('nav.items.existenciasPt')}
            </h1>
            <button
              type="button"
              className={cn(pageInfoButton, 'lg:mt-1')}
              title="El pallet nace en Unidad PT (PF-…). Por defecto: definitivo, sin despacho. KPIs y reservas PL en paralelo a la API."
              aria-label={t('nav.items.existenciasPt')}
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className={cn(pageSubtitle, 'lg:max-w-[38rem] lg:font-serif lg:text-[22px] lg:leading-tight lg:text-[var(--ink-muted)]')}>
            {t('existenciasPt.pageSubtitle')}
          </p>
        </div>
        <div className="relative z-[1] flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline" className="h-10 min-w-[148px] rounded-[var(--radius-md)] border-[var(--stone-300)] bg-white px-4 text-[13px] font-semibold shadow-none hover:bg-[var(--stone-100)]">
              <Link to="/existencias-pt/repaletizar" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                {t('existenciasPt.repalletButton')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 min-w-[168px] rounded-[var(--radius-md)] border-[var(--stone-300)] bg-white px-4 text-[13px] font-semibold shadow-none hover:bg-[var(--stone-100)]">
              <Link to="/existencias-pt/packing-lists" className="gap-2">
                <ListOrdered className="h-4 w-4" />
                {t('existenciasPt.plButton')}
              </Link>
            </Button>
          </div>
          <Button asChild className="h-[52px] min-w-[216px] rounded-[var(--radius-md)] bg-[var(--olive-700)] px-6 text-[16px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]">
            <Link to="/pt-tags" className="gap-2">
              <Tag className="h-6 w-6" />
              {t('existenciasPt.ptUnitButton')}
            </Link>
          </Button>
        </div>
      </header>

      <nav
        data-stock-desktop-tabs
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

      <section data-stock-mobile-kpis aria-labelledby="ex-kpis" className="space-y-2 lg:hidden">
        <h2 id="ex-kpis" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
          {t('existenciasPt.srKpis')}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: t('existenciasPt.kpi.inCamera'),
              value: isPending ? '—' : formatCount(totalEnListado),
              note: t('existenciasPt.kpi.inCameraNote'),
              Icon: PineSnowflakeIcon,
              card: 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
              well: 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
            },
            {
              label: t('existenciasPt.kpi.totalBoxes'),
              value: isPending ? '—' : formatCount(kpiTotals.cajas),
              note: t('existenciasPt.kpi.totalBoxesNote'),
              Icon: PineCubeIcon,
              card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
              well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
            },
            {
              label: t('existenciasPt.kpi.totalLb'),
              value: isPending ? '—' : fmtLb(kpiTotals.lb),
              note: t('existenciasPt.kpi.totalLbNote'),
              Icon: PineWeightIcon,
              card: 'border-[var(--stone-300)] bg-[var(--stone-100)]',
              well: 'bg-[#DED9CF] text-[#41443F]',
            },
            {
              label: t('existenciasPt.kpi.ptUnits'),
              value: kpiPtDisponibles == null ? '—' : formatCount(kpiPtDisponibles),
              note: t('existenciasPt.kpi.ptUnitsNote'),
              Icon: PineBoxesIcon,
              card: 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
              well: 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
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
                <p className="mt-1 font-serif text-[24px] font-bold tabular-nums leading-none tracking-[-0.65px] text-[var(--ink)]">{value}</p>
                <p className="mt-1 text-[11px] leading-tight text-[var(--ink-muted)]">{note}</p>
              </div>
            </div>
          ))}
        </div>
        <div
          data-stock-mobile-reserved
          className="flex min-h-[48px] items-center justify-between gap-3 rounded-[10px] border border-[var(--stone-200)] bg-white/70 px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--harvest-200)] text-[var(--harvest-700)]" aria-hidden>
              <PineDocumentIcon size={18} className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('existenciasPt.kpi.reservedPl')}</p>
              <p className="truncate text-[10px] text-[var(--ink-muted)]">{t('existenciasPt.kpi.reservedPlNote')}</p>
            </div>
          </div>
          <p
            className={cn(
              'shrink-0 font-serif text-[22px] font-semibold tabular-nums leading-none',
              kpiUnidadesReservadasPl == null || kpiUnidadesReservadasPl === 0
                ? 'text-[var(--ink)]'
                : 'text-[var(--harvest-700)]',
            )}
          >
            {kpiUnidadesReservadasPl == null ? '—' : formatCount(kpiUnidadesReservadasPl)}
          </p>
        </div>
      </section>

      <section
        data-stock-desktop-kpis
        aria-labelledby="ex-kpis-desktop"
        className="hidden space-y-2.5 lg:block lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white/45 lg:px-[14px] lg:py-2.5"
      >
        <h2 id="ex-kpis-desktop" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
          {t('existenciasPt.srKpis')}
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: t('existenciasPt.kpi.inCamera'),
              value: isPending ? '—' : formatCount(totalEnListado),
              note: t('existenciasPt.kpi.inCameraNote'),
              Icon: PineSnowflakeIcon,
              card: 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
              well: 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
            },
            {
              label: t('existenciasPt.kpi.totalBoxes'),
              value: isPending ? '—' : formatCount(kpiTotals.cajas),
              note: t('existenciasPt.kpi.totalBoxesNote'),
              Icon: PineCubeIcon,
              card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
              well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
            },
            {
              label: t('existenciasPt.kpi.totalLb'),
              value: isPending ? '—' : fmtLb(kpiTotals.lb),
              note: t('existenciasPt.kpi.totalLbNote'),
              Icon: PineWeightIcon,
              card: 'border-[var(--stone-300)] bg-[var(--stone-100)]',
              well: 'bg-[#DED9CF] text-[#41443F]',
            },
            {
              label: t('existenciasPt.kpi.ptUnits'),
              value: kpiPtDisponibles == null ? '—' : formatCount(kpiPtDisponibles),
              note: t('existenciasPt.kpi.ptUnitsNote'),
              Icon: PineBoxesIcon,
              card: 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
              well: 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
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
        <div className="grid grid-cols-1">
          <div className="flex min-h-[42px] items-center justify-between gap-4 rounded-[8px] border border-[var(--stone-200)] bg-white/65 px-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--harvest-200)] text-[var(--harvest-700)]" aria-hidden>
                <PineDocumentIcon size={18} className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('existenciasPt.kpi.reservedPl')}</p>
                <p className="truncate text-[10px] text-[var(--ink-muted)]">{t('existenciasPt.kpi.reservedPlNote')}</p>
              </div>
            </div>
            <p
              className={cn(
                'shrink-0 font-serif text-[20px] font-semibold tabular-nums leading-none',
                kpiUnidadesReservadasPl == null || kpiUnidadesReservadasPl === 0
                  ? 'text-[var(--ink)]'
                  : 'text-[var(--harvest-700)]',
              )}
            >
              {kpiUnidadesReservadasPl == null ? '—' : formatCount(kpiUnidadesReservadasPl)}
            </p>
          </div>
        </div>
      </section>

      <div
        data-stock-mobile-filters
        className="space-y-2 rounded-[12px] border border-[var(--stone-300)] bg-white/70 p-3 lg:hidden"
      >
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={todayActive ? 'default' : 'outline'}
            className={cn(
              'h-11 gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold',
              todayActive
                ? 'bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]'
                : 'border-[var(--stone-300)] bg-white',
            )}
            onClick={() => {
              const d = localDateYmd();
              setFilterDateFrom(d);
              setFilterDateTo(d);
            }}
          >
            <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t('existenciasPt.filters.today')}
          </Button>
          <Button
            type="button"
            variant={seeAllActive ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-11 rounded-[8px] px-3 text-[13px] font-semibold',
              seeAllActive
                ? 'bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]'
                : 'border-[var(--stone-300)] bg-white',
            )}
            onClick={() => {
              setFilterDateFrom('');
              setFilterDateTo('');
            }}
          >
            {t('existenciasPt.filters.clearDates')}
          </Button>
        </div>
        <select
          className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')}
          value={bolFilter}
          onChange={(e) => setBolFilter(e.target.value)}
          title="Filtra en el listado ya cargado (máx. 500 filas). No cambia la consulta al servidor."
          aria-label={t('existenciasPt.filters.bol')}
        >
          <option value="">{t('existenciasPt.filters.bol')} · {t('existenciasPt.filters.bolAll')}</option>
          {bolOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 w-full gap-1.5 rounded-[8px] border-[var(--stone-300)] bg-white px-4 text-[12px] font-semibold"
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          <Filter className="h-4 w-4" strokeWidth={2} aria-hidden />
          {showMoreFilters ? t('existenciasPt.filters.hideFilters') : t('existenciasPt.filters.moreFilters')}
          <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', showMoreFilters ? 'rotate-180' : '')} />
        </Button>
        {showMoreFilters ? (
          <div className="grid gap-2 border-t border-[var(--stone-200)] pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.dateFrom')}</Label>
                <Input type="date" className={cn(filterInputClass, 'h-11 border-[var(--stone-300)] bg-white text-[12px]')} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.dateTo')}</Label>
                <Input type="date" className={cn(filterInputClass, 'h-11 border-[var(--stone-300)] bg-white text-[12px]')} value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.species')}</Label>
              <select
                className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')}
                value={speciesId}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeciesId(v);
                  setVarietyId(0);
                }}
              >
                <option value={0}>{t('existenciasPt.filters.speciesAll')}</option>
                {(species ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.variety')}</Label>
              <select className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')} value={varietyId} onChange={(e) => setVarietyId(Number(e.target.value))}>
                <option value={0}>{t('existenciasPt.filters.varietyAll')}</option>
                {(varieties ?? [])
                  .filter((v) => (speciesId > 0 ? v.species_id === speciesId : true))
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.format')}</Label>
              <select className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')} value={formatId} onChange={(e) => setFormatId(Number(e.target.value))}>
                <option value={0}>{t('existenciasPt.filters.formatAll')}</option>
                {(formats ?? [])
                  .filter((f) => f.activo)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.format_code}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.client')}</Label>
              <select className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')} value={clientId} onChange={(e) => setClientId(Number(e.target.value))}>
                <option value={0}>{t('existenciasPt.filters.clientAll')}</option>
                {(clients ?? [])
                  .filter((c) => c.activo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.status')}</Label>
              <select
                className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')}
                disabled={soloDeposito}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">{t('existenciasPt.filters.statusAll')}</option>
                <option value="borrador">borrador</option>
                <option value="definitivo">definitivo</option>
                <option value="anulado">anulado</option>
                <option value="repaletizado">repaletizado</option>
                <option value="revertido">revertido</option>
                <option value="asignado_pl">asignado_pl (packing list)</option>
              </select>
              {soloDeposito ? (
                <p className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.statusFixed')}</p>
              ) : null}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-snug text-[var(--ink)]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[var(--stone-300)]"
                checked={soloDeposito}
                onChange={(e) => {
                  setSoloDeposito(e.target.checked);
                  if (e.target.checked) setStatus('');
                }}
              />
              {t('existenciasPt.filters.depositOnly')}
            </label>
            {!soloDeposito ? (
              <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-snug text-[var(--ink)]">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-[var(--stone-300)]"
                  checked={excluirAnulados}
                  onChange={(e) => setExcluirAnulados(e.target.checked)}
                />
                {t('existenciasPt.filters.excludeVoided')}
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        data-stock-desktop-filters
        className="mt-3 hidden min-h-[62px] rounded-[10px] border border-[var(--stone-300)] bg-white/70 px-3.5 py-[11px] lg:block"
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={todayActive ? 'default' : 'outline'}
            className={cn(
              'h-10 min-w-[104px] gap-1.5 rounded-md px-4 text-[13px] font-semibold',
              todayActive
                ? 'bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]'
                : 'border-[var(--stone-300)] bg-white',
            )}
            onClick={() => {
              const d = localDateYmd();
              setFilterDateFrom(d);
              setFilterDateTo(d);
            }}
          >
            <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t('existenciasPt.filters.today')}
          </Button>
          <Button
            type="button"
            variant={seeAllActive ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-10 min-w-[104px] rounded-md px-4 text-[13px] font-semibold',
              seeAllActive
                ? 'bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]'
                : 'border-[var(--stone-300)] bg-white',
            )}
            onClick={() => {
              setFilterDateFrom('');
              setFilterDateTo('');
            }}
          >
            {t('existenciasPt.filters.clearDates')}
          </Button>
          <div className="min-w-[16rem] flex-1">
            <select
              className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
              value={bolFilter}
              onChange={(e) => setBolFilter(e.target.value)}
              title="Filtra en el listado ya cargado (máx. 500 filas). No cambia la consulta al servidor."
              aria-label={t('existenciasPt.filters.bol')}
            >
              <option value="">{t('existenciasPt.filters.bol')} · {t('existenciasPt.filters.bolAll')}</option>
              {bolOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
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
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.dateFrom')}</Label>
              <Input type="date" className={cn(filterInputClass, 'h-10 border-[var(--stone-300)] bg-white')} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.dateTo')}</Label>
              <Input type="date" className={cn(filterInputClass, 'h-10 border-[var(--stone-300)] bg-white')} value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.species')}</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                value={speciesId}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeciesId(v);
                  setVarietyId(0);
                }}
              >
                <option value={0}>{t('existenciasPt.filters.speciesAll')}</option>
                {(species ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.variety')}</Label>
              <select className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')} value={varietyId} onChange={(e) => setVarietyId(Number(e.target.value))}>
                <option value={0}>{t('existenciasPt.filters.varietyAll')}</option>
                {(varieties ?? [])
                  .filter((v) => (speciesId > 0 ? v.species_id === speciesId : true))
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.format')}</Label>
              <select className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')} value={formatId} onChange={(e) => setFormatId(Number(e.target.value))}>
                <option value={0}>{t('existenciasPt.filters.formatAll')}</option>
                {(formats ?? [])
                  .filter((f) => f.activo)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.format_code}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.client')}</Label>
              <select className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')} value={clientId} onChange={(e) => setClientId(Number(e.target.value))}>
                <option value={0}>{t('existenciasPt.filters.clientAll')}</option>
                {(clients ?? [])
                  .filter((c) => c.activo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-span-3 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('existenciasPt.filters.status')}</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                disabled={soloDeposito}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">{t('existenciasPt.filters.statusAll')}</option>
                <option value="borrador">borrador</option>
                <option value="definitivo">definitivo</option>
                <option value="anulado">anulado</option>
                <option value="repaletizado">repaletizado</option>
                <option value="revertido">revertido</option>
                <option value="asignado_pl">asignado_pl (packing list)</option>
              </select>
              {soloDeposito ? (
                <p className="text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.filters.statusFixed')}</p>
              ) : null}
            </div>
            <div className="col-span-9 flex flex-wrap items-center gap-4 pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--ink)]">
                <input
                  type="checkbox"
                  className="rounded border-[var(--stone-300)]"
                  checked={soloDeposito}
                  onChange={(e) => {
                    setSoloDeposito(e.target.checked);
                    if (e.target.checked) setStatus('');
                  }}
                />
                {t('existenciasPt.filters.depositOnly')}
              </label>
              {!soloDeposito ? (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--ink)]">
                  <input
                    type="checkbox"
                    className="rounded border-[var(--stone-300)]"
                    checked={excluirAnulados}
                    onChange={(e) => setExcluirAnulados(e.target.checked)}
                  />
                  {t('existenciasPt.filters.excludeVoided')}
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-40 flex flex-col gap-2 rounded-xl border border-slate-200 bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:mt-3 lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-white/90 lg:shadow-none">
          {selectionByFormat.length > 0 ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-800">
              {selectionByFormat.map(([fmt, sel]) => (
                <span key={fmt} className="tabular-nums">
                  <span className="font-mono font-semibold text-slate-900">{fmt}</span>
                  <span className="text-slate-500"> · </span>
                  <span className="font-semibold text-slate-900">{formatCount(sel.boxes)}</span>
                  <span className="text-slate-600"> {t('existenciasPt.selection.boxes')}</span>
                  <span className="text-slate-500"> · </span>
                  <span className="font-semibold text-slate-900">{sel.pallets}</span>
                  <span className="text-slate-600">
                    {sel.pallets === 1 ? ` ${t('existenciasPt.selection.pallet')}` : ` ${t('existenciasPt.selection.pallets')}`}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-2 text-sm sm:border-0 sm:pt-0">
            <span className="font-semibold tabular-nums text-slate-800">
              {selectedIds.size} {t('existenciasPt.selection.selected')}
            </span>
            <OperateOnly>
            <Button type="button" size="sm" className="h-9 rounded-lg" onClick={() => setBolDialogOpen(true)}>
              {t('existenciasPt.selection.assignBol')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 rounded-lg"
              disabled={createPlMut.isPending}
              onClick={() => createPlMut.mutate()}
            >
              {createPlMut.isPending ? t('existenciasPt.selection.creating') : t('existenciasPt.selection.createPl')}
            </Button>
            </OperateOnly>
            <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setSelectedIds(new Set())}>
              {t('existenciasPt.selection.clearSelection')}
            </Button>
          </div>
        </div>
      ) : null}

      <section
        data-stock-desktop-list
        data-stock-mobile-list
        className="space-y-0 overflow-hidden rounded-[12px] border border-[var(--stone-300)] bg-white lg:mt-[19px] lg:space-y-0 lg:overflow-hidden lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white"
        aria-labelledby="ex-inventario"
      >
        <div className="block border-b border-[var(--stone-200)] p-3 lg:flex lg:min-h-[60px] lg:flex-wrap lg:items-center lg:justify-between lg:gap-2 lg:border-b lg:border-[var(--stone-200)] lg:px-[14px] lg:py-2">
          <div className="lg:flex lg:items-baseline lg:gap-4">
            <h3 id="ex-inventario" className={cn(sectionTitle, 'max-lg:font-serif max-lg:text-[20px] max-lg:font-semibold max-lg:leading-tight max-lg:text-[var(--ink)] lg:font-serif lg:text-[21px] lg:leading-tight lg:text-[var(--ink)]')}>
              {t('existenciasPt.table.title')}
            </h3>
            <p className={cn(sectionHint, 'max-lg:mt-1 max-lg:text-[11px] max-lg:text-[var(--ink-muted)] lg:mt-0 lg:text-[12px] lg:text-[var(--ink-muted)]')}>
              {t('existenciasPt.table.hint', {
                filtered: filteredRows.length,
                extra:
                  (rows?.length ?? 0) !== filteredRows.length
                    ? t('existenciasPt.table.hintExtra', { total: rows?.length ?? 0 })
                    : '',
              })}
            </p>
          </div>
          <div className="mt-3 flex w-full flex-col gap-2 lg:mt-0 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center">
            <button
              type="button"
              className={cn(pageInfoButton, 'hidden lg:inline-flex')}
              title="Pallets = total de cajas del formato ÷ tope (12x18oz 100, 12x6oz 240, resto 144). Unidades seleccionadas = filas marcadas."
              aria-label="Ayuda productor en tabla"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 max-lg:rounded-[8px] max-lg:border-[var(--stone-300)] lg:w-auto lg:border-[var(--stone-300)]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 rounded-md px-3 text-xs lg:h-9 lg:px-3.5 lg:text-[12px] max-lg:flex-1 max-lg:shadow-none',
                  viewMode === 'compact' ? 'bg-[#1D9E75] text-white hover:bg-[#1D9E75] hover:text-white max-lg:bg-[var(--olive-700)] max-lg:hover:bg-[var(--olive-600)] lg:bg-[var(--olive-700)] lg:hover:bg-[var(--olive-600)]' : '',
                )}
                onClick={() => setViewMode('compact')}
              >
                {t('existenciasPt.table.viewCompact')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 rounded-md px-3 text-xs lg:h-9 lg:px-3.5 lg:text-[12px] max-lg:flex-1 max-lg:shadow-none',
                  viewMode === 'detailed' ? 'bg-[#1D9E75] text-white hover:bg-[#1D9E75] hover:text-white max-lg:bg-[var(--olive-700)] max-lg:hover:bg-[var(--olive-600)] lg:bg-[var(--olive-700)] lg:hover:bg-[var(--olive-600)]' : '',
                )}
                onClick={() => setViewMode('detailed')}
              >
                {t('existenciasPt.table.viewDetailed')}
              </Button>
            </div>
            <details className="group w-full lg:w-auto">
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 max-lg:flex max-lg:h-11 max-lg:items-center max-lg:justify-center max-lg:border-[var(--stone-300)] max-lg:px-2.5 max-lg:py-2 max-lg:text-[12px] max-lg:font-semibold max-lg:text-[var(--ink-muted)] max-lg:hover:bg-[var(--stone-100)] lg:h-9 lg:border-[var(--stone-300)] lg:px-3 lg:text-[12px] lg:leading-7 lg:text-[var(--ink-muted)] [&::-webkit-details-marker]:hidden">
                {t('existenciasPt.table.criteria')}
              </summary>
              <div className="mt-1 max-w-[min(22rem,calc(100vw-2rem))] space-y-1 rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600 shadow-sm lg:border-[var(--stone-300)] lg:shadow-none">
                <p>
                  <span className="font-semibold text-emerald-700">{t('existenciasPt.table.criteriaAvailable')}</span>{' '}
                  {t('existenciasPt.table.criteriaAvailableDesc')}
                </p>
                <p>
                  <span className="font-semibold text-sky-700">{t('existenciasPt.table.criteriaInPl')}</span>{' '}
                  {t('existenciasPt.table.criteriaInPlDesc')}
                </p>
                <p>
                  <span className="font-semibold text-amber-800">{t('existenciasPt.table.criteriaInOrder')}</span>{' '}
                  {t('existenciasPt.table.criteriaInOrderDesc')}
                </p>
                <p>
                  <span className="font-semibold text-slate-600">{t('existenciasPt.table.criteriaDispatched')}</span>{' '}
                  {t('existenciasPt.table.criteriaDispatchedDesc')}
                </p>
                <p>
                  <span className="font-semibold text-violet-700">{t('existenciasPt.table.criteriaRepallet')}</span>{' '}
                  {t('existenciasPt.table.criteriaRepalletDesc')}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">{t('existenciasPt.table.criteriaNoCommit')}</span>{' '}
                  {t('existenciasPt.table.criteriaNoCommitDesc')}
                </p>
              </div>
            </details>
          </div>
        </div>
          {isPending ? (
            <div className="space-y-2 lg:p-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : isError ? (
            <div role="alert" className={cn(errorStatePanel, 'lg:m-3')}>
              {(error as Error)?.message ?? t('existenciasPt.table.loadError')}
            </div>
          ) : !rows?.length ? (
            <p data-stock-mobile-empty className={cn(emptyStatePanel, 'max-lg:mx-3 max-lg:mb-3 max-lg:flex max-lg:min-h-[170px] max-lg:items-center max-lg:justify-center max-lg:rounded-[11px] max-lg:border-[var(--stone-200)] max-lg:bg-[#FBFCFD] max-lg:px-5 max-lg:py-10 max-lg:text-[13px] max-lg:leading-snug max-lg:text-[var(--bluegray-700)] lg:m-3 lg:min-h-[180px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:py-16 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]')}>{t('existenciasPt.table.empty')}</p>
          ) : !filteredRows.length ? (
            <p className={cn(emptyStatePanel, 'max-lg:mx-3 max-lg:mb-3 max-lg:flex max-lg:min-h-[170px] max-lg:items-center max-lg:justify-center max-lg:rounded-[11px] max-lg:border-[var(--stone-200)] max-lg:bg-[#FBFCFD] max-lg:px-5 max-lg:py-10 max-lg:text-[13px] max-lg:leading-snug max-lg:text-[var(--bluegray-700)] lg:m-3 lg:min-h-[180px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:py-16 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]')}>{t('existenciasPt.table.emptyBol')}</p>
          ) : (
            <>
            <div className="lg:hidden space-y-2.5 bg-[#F9F7F5] p-3">
              {filteredRows.map((r) => {
                const tone = compactStateTone(r, t);
                const producerCell = producerLabelForPallet(r);
                const vu = verUnidadesVisibility(r);
                const codeDisplay =
                  r.codigo_unidad_pt_display?.trim() ||
                  r.tag_code?.trim() ||
                  r.corner_board_code ||
                  `PF-${r.id}`;
                const logLine = logisticaResumen(r, t);
                return (
                  <article key={r.id} data-stock-mobile-card className="overflow-hidden rounded-[11px] border border-[var(--stone-300)] bg-white">
                    <div className="flex items-start justify-between gap-3 border-b border-[var(--stone-200)] px-3 py-3">
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', tone.badge)}>
                        {tone.label}
                      </span>
                      <div className="text-right">
                        <p className="font-serif text-[18px] font-semibold tabular-nums leading-none text-[var(--ink)]">
                          {formatCount(r.boxes)} {t('existenciasPt.selection.boxes')}
                        </p>
                        <p className="mt-1 text-[11px] tabular-nums text-[var(--ink-muted)]">{fmtLb(r.pounds)} lb</p>
                      </div>
                    </div>
                    <div className="px-3 py-3">
                      <p className="font-serif text-[18px] font-semibold leading-tight text-[var(--ink)]">{codeDisplay}</p>
                      <p className="mt-1 text-[13px] font-semibold text-[var(--ink)]">{r.format_code ?? '—'}</p>
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        {(r.species_nombre?.trim() || '—') + ' · ' + (r.variedades_label?.trim() || '—')}
                      </p>
                      <p className="mt-1.5 truncate text-[12px] text-[var(--ink-muted)]">{r.client_nombre?.trim() || '—'}</p>
                      <p className="truncate text-[12px] text-[var(--ink-muted)]">{logLine}</p>
                      {viewMode === 'detailed' ? (
                        <div className="mt-3 grid gap-1.5 rounded-[8px] border border-[var(--stone-200)] bg-white px-3 py-2.5 text-[11px] text-[var(--ink-muted)]">
                          <p><span className="font-semibold text-[var(--ink)]">{t('existenciasPt.table.colProducer')}:</span> {producerCell}</p>
                          <p><span className="font-semibold text-[var(--ink)]">{t('existenciasPt.table.colLocation')}:</span> {r.corner_board_code?.trim() || '—'}</p>
                          <p><span className="font-semibold text-[var(--ink)]">{t('existenciasPt.table.colState')}:</span> {r.status}</p>
                        </div>
                      ) : null}
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <Button asChild className="h-10 rounded-[8px] bg-[var(--olive-700)] text-[13px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]">
                          <Link to={`/existencias-pt/detalle/${r.id}`}>{t('existenciasPt.table.actionDetail')}</Link>
                        </Button>
                        {vu === 'hide' ? (
                          <span className="inline-flex items-center text-[11px] text-[var(--ink-muted)]">{t('existenciasPt.table.noDetailPt')}</span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-[8px] border-[var(--stone-300)] bg-white px-3 text-[12px] shadow-none"
                            disabled={vu === 'wait'}
                            onClick={() => setUnitsForPalletId(r.id)}
                          >
                            {t('existenciasPt.table.actionUnits')}
                          </Button>
                        )}
                      </div>
                      <details className="mt-2 border-t border-[var(--stone-200)] pt-2">
                        <summary className="cursor-pointer list-none text-[12px] font-semibold text-[var(--ink-muted)]">
                          Más datos <span aria-hidden>›</span>
                        </summary>
                        <div className="mt-2 space-y-1 text-[11px] text-[var(--ink-muted)]">
                          <p>{t('existenciasPt.table.colProducer')}: {producerCell}</p>
                          <p>{t('existenciasPt.table.colLocation')}: {r.corner_board_code?.trim() || '—'}</p>
                          <p>{t('existenciasPt.table.colCondition')}: {tone.label}</p>
                          {r.bol?.trim() ? <p>BOL: {r.bol.trim()}</p> : null}
                          {canBulkBol(r) ? (
                            <label className="flex items-center gap-2 pt-1">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-[var(--stone-300)]"
                                checked={selectedIds.has(r.id)}
                                onChange={() => toggleRow(r.id)}
                              />
                              {t('existenciasPt.table.selectRowTitle')}
                            </label>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden lg:block">
          {viewMode === 'compact' ? (
            <div className="space-y-4 lg:space-y-3 lg:p-3">
              {groupedByFormat.map((group) => (
                <div key={group.format} className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:rounded-[10px] lg:border-[var(--stone-300)]">
                  <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:border-[var(--stone-200)] lg:bg-[var(--stone-50)]">
                    <p className="font-mono text-sm font-semibold text-slate-900">{group.format}</p>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{formatCount(group.totalBoxes)}</span>{' '}
                      {t('existenciasPt.selection.boxes')}
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{fmtLb(group.totalLb)}</span> lb
                    </p>
                    <p className="text-xs text-slate-600">
                      {formatCount(group.pallets)} {t('existenciasPt.selection.pallets')}
                    </p>
                    <p className="text-xs text-slate-600">
                      {t('existenciasPt.table.clientLabel')}{' '}
                      <span className="font-medium text-slate-900">{group.principalClient}</span>
                    </p>
                    {group.hasCommitted ? (
                      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900">
                        {t('existenciasPt.table.committed')}
                      </span>
                    ) : null}
                    {group.hasDispatched ? (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800">
                        {t('existenciasPt.table.withDispatches')}
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
                            title={t('existenciasPt.table.selectAllTitle')}
                          />
                        </TableHead>
                        <TableHead>{t('existenciasPt.table.colState')}</TableHead>
                        <TableHead>{t('existenciasPt.table.colPtUnit')}</TableHead>
                        <TableHead>{t('existenciasPt.table.colClient')}</TableHead>
                        <TableHead>{t('existenciasPt.table.colProducer')}</TableHead>
                        <TableHead>{t('existenciasPt.table.colVariety')}</TableHead>
                        <TableHead className="text-right">{t('existenciasPt.table.colBoxesAvail')}</TableHead>
                        <TableHead className="text-right">{t('existenciasPt.table.colLb')}</TableHead>
                        <TableHead>{t('existenciasPt.table.colLocation')}</TableHead>
                        <TableHead>{t('existenciasPt.table.colTrace')}</TableHead>
                        <TableHead className="text-right">{t('existenciasPt.table.colActions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((r) => {
                        const tone = compactStateTone(r, t);
                        const producerCell = producerLabelForPallet(r);
                        const vu = verUnidadesVisibility(r);
                        const codeDisplay =
                          r.codigo_unidad_pt_display?.trim() ||
                          r.tag_code?.trim() ||
                          r.corner_board_code ||
                          `PF-${r.id}`;
                        const traceBadges = compactTraceabilityBadges(r, t);
                        return (
                          <TableRow key={r.id} className={cn(tableBodyRow, 'relative lg:h-16 lg:border-[var(--stone-200)] lg:hover:bg-[var(--stone-50)]/70')}>
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
                                <Button asChild type="button" variant="outline" size="sm" className="h-7 rounded-md px-2 text-[11px] lg:h-8 lg:border-[var(--olive-700)] lg:bg-[var(--olive-700)] lg:px-2.5 lg:text-white lg:hover:bg-[var(--olive-600)]">
                                  <Link to={`/existencias-pt/detalle/${r.id}`}>{t('existenciasPt.table.actionDetail')}</Link>
                                </Button>
                                {vu === 'hide' ? (
                                  <span className="inline-flex items-center text-[11px] text-slate-400">
                                    {t('existenciasPt.table.noDetailPt')}
                                  </span>
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
                                    {t('existenciasPt.table.actionUnits')}
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
            <div className={cn(tableShell, 'lg:rounded-none lg:border-0')}>
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
                        title={t('existenciasPt.table.selectAllTitle')}
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px]">{t('existenciasPt.table.colCode')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('existenciasPt.table.colState')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('existenciasPt.table.colFormat')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('existenciasPt.table.colBoxes')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right tabular-nums">{t('existenciasPt.table.colLb')}</TableHead>
                    <TableHead className="min-w-[100px]">{t('existenciasPt.table.colClient')}</TableHead>
                    <TableHead className="min-w-[88px]">{t('existenciasPt.table.colLocation')}</TableHead>
                    <TableHead className="min-w-[120px]">{t('existenciasPt.table.colProducer')}</TableHead>
                    <TableHead className="min-w-[100px]">{t('existenciasPt.table.colVariety')}</TableHead>
                    <TableHead className="min-w-[100px]">{t('existenciasPt.table.colCondition')}</TableHead>
                    <TableHead className="min-w-[120px]">{t('existenciasPt.table.colLogistics')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('existenciasPt.table.colRepallet')}</TableHead>
                    <TableHead className="w-[132px] text-right">{t('existenciasPt.table.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => {
                    const producerCell = producerLabelForPallet(r);
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
                                ? t('existenciasPt.table.selectRowTitle')
                                : t('existenciasPt.table.selectRowDisabled')
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
                          <PalletStatusBadge status={r.status} t={t} />
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
                          <DisponibilidadBadge r={r} t={t} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <LogisticaCell r={r} t={t} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <RepalletEstadoCell r={r} t={t} />
                        </TableCell>
                        <TableCell className="py-3.5 text-right">
                          {vu === 'hide' ? (
                            <span
                              className="inline-block max-w-[118px] text-left text-[11px] leading-snug text-slate-400"
                              title="Este stock proviene de líneas sin vínculo a unidad PT por proceso (modelo actual). No hay listado de tarjas que mostrar."
                            >
                              {t('existenciasPt.table.noDetailPt')}
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
                                  ? t('existenciasPt.table.checkingTrace')
                                  : t('existenciasPt.table.viewPtUnits')
                              }
                            >
                              <Layers className="h-3.5 w-3.5" />
                              {t('existenciasPt.table.actionUnits')}
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
            </div>
            </>
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
              {t('existenciasPt.unitsDialog.title', { code: unitsDialogPalletCode || '—' })}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setUnitsForPalletId(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              aria-label={t('existenciasPt.unitsDialog.closeAriaLabel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={cn(operationalModalFormClass)}>
            <div className={cn(operationalModalBodyClass, 'max-h-[min(58vh,520px)] overflow-y-auto lg:px-8')}>
          <div className="space-y-2 text-sm">
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t('existenciasPt.unitsDialog.hint')}
            </p>
            <details className="group text-[13px] text-muted-foreground">
              <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                  <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  {t('existenciasPt.unitsDialog.moreContext')}
                </span>
              </summary>
              <p className="mt-2 max-w-prose text-pretty leading-snug">
                {t('existenciasPt.unitsDialog.moreContextDesc')}
              </p>
            </details>
            {unitsForPalletId != null && traceUnitsPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : traceUnitsError ? (
              <div role="alert" className={errorStatePanel}>
                {t('existenciasPt.unitsDialog.loadError')}
              </div>
            ) : ptUnitsInDialog.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t('existenciasPt.unitsDialog.emptyDesc')}
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
                        {t('existenciasPt.unitsDialog.unitBoxes', { count: u.total_cajas })}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" asChild>
                      <Link to="/pt-tags">{t('existenciasPt.unitsDialog.goToPtUnit')}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
            </div>
          <DialogFooter className={operationalModalFooterClass}>
            <Button type="button" variant="outline" onClick={() => setUnitsForPalletId(null)}>
              {t('existenciasPt.unitsDialog.closeButton')}
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
            <DialogTitle className={operationalModalTitleClass}>{t('existenciasPt.bolDialog.title')}</DialogTitle>
            <DialogDescription className={operationalModalDescriptionClass}>
              {t('existenciasPt.bolDialog.description', { count: selectedIds.size })}
            </DialogDescription>
            <details className="group text-[13px] text-muted-foreground">
              <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                  <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  {t('existenciasPt.bolDialog.scopeTitle')}
                </span>
              </summary>
              <p className="mt-2 max-w-prose text-pretty leading-snug">
                {t('existenciasPt.bolDialog.scopeDesc')}
              </p>
            </details>
          </DialogHeader>
          <div className={cn(operationalModalFormClass)}>
          <div className={cn(operationalModalBodyClass, 'lg:px-8')}>
          <div className="grid gap-2 py-2">
            <Label htmlFor="bulk-bol">{t('existenciasPt.bolDialog.bolLabel')}</Label>
            <Input
              id="bulk-bol"
              placeholder={t('existenciasPt.bolDialog.bolPlaceholder')}
              value={bolInput}
              onChange={(e) => setBolInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          </div>
          <DialogFooter className={cn(operationalModalFooterClass, 'gap-2 sm:gap-0')}>
            <Button type="button" variant="outline" onClick={() => setBolDialogOpen(false)}>
              {t('existenciasPt.bolDialog.cancelButton')}
            </Button>
            <Button
              type="button"
              disabled={bulkBolMut.isPending || selectedIds.size === 0}
              onClick={() => bulkBolMut.mutate(bolInput)}
            >
              {bulkBolMut.isPending ? t('existenciasPt.bolDialog.savingButton') : t('existenciasPt.bolDialog.applyButton')}
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
