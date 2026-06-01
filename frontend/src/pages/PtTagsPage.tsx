import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileDown,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  CircleCheck,
  RefreshCw,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson, downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
import { canOperate, canSupervise } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { isoInLocalDateRange, localDateYmd } from '@/lib/date-filter';
import { formatCount, formatLb } from '@/lib/number-format';
import {
  downloadZplFile,
  fetchTarjaTemplateCatalog,
  fetchTarjaZpl,
  getConfiguredZebraPrinterName,
  getLastPrintServiceProbeSummary,
  getLocalPrinters,
  printServiceSourceLabel,
  type LocalPrintersProbeResult,
  type LocalPrintServiceStatusPayload,
  loadLastPrintPayload,
  printTarjaZplOrDownload,
  resolvePrinterForLocalJob,
  saveLastPrintPayload,
  suggestPrinterNameForTarjaPrint,
  TARJA_LABEL_TEMPLATE_OPTIONS,
  TARJA_TEMPLATE_UI,
  tarjaTemplateHelp,
  type LocalPrinterInfo,
  type TarjaLabelTemplate,
} from '@/lib/tarja-zpl-print';
import {
  emptyStatePanel,
  filterInputClass,
  filterPanel,
  filterSelectClass,
  kpiCard,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  operationalModalBodyClass,
  operationalModalContentClass,
  operationalModalFooterClass,
  operationalModalFormClass,
  operationalModalHeaderClass,
  operationalModalSectionCard,
  operationalModalSectionHeadingRow,
  operationalModalSectionMuted,
  operationalModalStepBadge,
  operationalModalStepTitle,
  operationalModalTitleClass,
  pageHeaderRow,
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

/** Unidad PT = producto físico (pallet); solo destinos de producto terminado. */
const RESULTADOS_PT = ['cajas', 'IQF'] as const;

function labelPtProductoPt(
  r: (typeof RESULTADOS_PT)[number],
  t: (key: string) => string
) {
  if (r === 'cajas') return t('ptTag.ptType.cajas');
  return t('ptTag.ptType.iqf');
}

function labelProcesoEstadoParaSelector(
  p: FruitProcessRow,
  t: (key: string) => string
) {
  const st = p.process_status ?? 'borrador';
  if (st === 'borrador') return t('ptTag.processStatus.borrador');
  if (st === 'confirmado') return t('ptTag.processStatus.confirmado');
  return st;
}
const FORMAT_CODE_RE = /^(\d+)x(\d+(?:\.\d+)?)oz$/i;
const FORMAT_ALIAS_RE = /^pint(?:a)?\s+(regular|low\s+profile)$/i;

function normalizeFormatKeyPt(formatCode: string): string {
  return formatCode.trim().toLowerCase().replace(/\s+/g, '');
}

/** Cajas por pallet físico (maestro o reglas 12x18oz / 12x6oz / resto). */
function boxesPerPalletForFormatCodePt(
  formatCode: string,
  presFormats: { format_code: string; max_boxes_per_pallet?: number | null }[] | undefined,
): number {
  const fc = normalizeFormatKeyPt(formatCode);
  const fmt = (presFormats ?? []).find((f) => normalizeFormatKeyPt(f.format_code) === fc);
  const fromMaster = fmt?.max_boxes_per_pallet != null ? Number(fmt.max_boxes_per_pallet) : NaN;
  if (Number.isFinite(fromMaster) && fromMaster >= 1) return fromMaster;
  if (fc === '12x18oz') return 100;
  if (fc === '12x6oz') return 240;
  return 144;
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const createTagSchema = z.object({
  process_id: z.coerce.number().int().positive({ message: 'Elegí un proceso origen' }),
  fecha: z.string().min(1, 'Requerido'),
  resultado: z.enum(RESULTADOS_PT),
  format_code: z
    .string()
    .min(1)
    .refine((s) => FORMAT_CODE_RE.test(s) || FORMAT_ALIAS_RE.test(s), {
      message: 'Usá NxMoz (ej. 4x16oz) o PINT REGULAR / PINT LOW PROFILE',
    }),
  cajas_por_pallet: z.coerce
    .number()
    .int()
    .min(1, 'Indicá cajas por pallet (mín. 1) antes de crear la unidad.'),
  /** Total de cajas que cargás en esta unidad PT (no el tope del proceso por sí solo). */
  cajas_generadas: z.coerce.number().int().min(1, 'Indicá cuántas cajas cargás en esta unidad PT'),
  /** Asignación comercial temprana (opcional; mismo contrato que POST /api/pt-tags) */
  client_id: z.coerce.number().int().min(0).default(0),
  brand_id: z.coerce.number().int().min(0).default(0),
  bol: z.string().max(80).optional(),
  /** Solo alta: repetir la misma unidad N veces (creación secuencial). */
  bulk_units: z.coerce.number().int().min(1).max(100).default(1),
});

type CreateTagForm = z.infer<typeof createTagSchema>;
type UpdateTagForm = {
  format_code: string;
  cajas_por_pallet: number;
  fecha: string;
  resultado: string;
  client_id: number;
  brand_id: number;
  bol: string;
  process_id?: number;
  cajas_generadas?: number;
};

export type PtTagItemApi = {
  id: number;
  tarja_id: number;
  process_id: number;
  productor_id: number;
  cajas_generadas: number;
  pallets_generados: number;
  process: {
    id: number;
    peso_procesado_lb: string;
    merma_lb: string;
    resultado: string;
    fecha_proceso: string;
  } | null;
};

export type PtTagApi = {
  id: number;
  tag_code: string;
  /** Resultado de unión de 2+ unidades PT (merge); no duplicar cajas/lb con las fuentes en cierres. */
  es_union_tarjas?: boolean;
  /** Etiqueta repallet unificada: no suma al packout del proceso (API). */
  excluida_suma_packout?: boolean;
  fecha: string;
  resultado: string;
  format_code: string;
  cajas_por_pallet: number;
  total_cajas: number;
  total_pallets: number;
  client_id?: number | null;
  brand_id?: number | null;
  bol?: string | null;
  net_weight_lb?: string | null;
  items: PtTagItemApi[];
};

/** Misma regla que Î£ packout en proceso: no duplicar cajas de la tarja solo-etiqueta de repallet. */
export function countsTowardPtProductionTotals(t: PtTagApi): boolean {
  return !t.excluida_suma_packout;
}

export type TagLineageApi = {
  tarja_id: number;
  ancestors: { tarja_id: number; relation: string }[];
  descendants: { tarja_id: number; relation: string }[];
};

function formatTagDateShort(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

type DispatchDayRow = {
  id: number;
  fecha_despacho: string;
  despachado_at?: string | null;
  status?: string;
  cliente_nombre?: string | null;
  client_nombre?: string | null;
  client_id?: number | null;
  items: Array<{ cajas?: number; cajas_despachadas?: number; tarja_id?: number }>;
  invoice?: {
    lines?: Array<{
      cajas?: number | string | null;
      packaging_code?: string | null;
      tarja_id?: number | null;
    }>;
  } | null;
};

function tagVarietyLabel(t: PtTagApi, processById: Map<number, FruitProcessRow>) {
  const names = new Set<string>();
  for (const it of t.items) {
    const p = processById.get(it.process_id);
    const v = p?.variedad_nombre?.trim();
    if (v) names.add(v);
  }
  if (names.size === 0) return '—';
  if (names.size === 1) return [...names][0];
  return `Varios (${names.size})`;
}

function tagProcessRefLabel(t: PtTagApi) {
  const ids = [...new Set(t.items.map((i) => i.process_id))];
  if (ids.length === 0) return '—';
  if (ids.length === 1) return `#${ids[0]}`;
  return `${ids.length} proc.`;
}

function OperationalTagBadge({
  tag,
  t,
}: {
  tag: PtTagApi;
  t: (key: string) => string;
}) {
  const ok = tag.total_cajas > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
        ok
          ? 'border-emerald-200/80 bg-emerald-50 text-emerald-900'
          : 'border-slate-200/90 bg-slate-100 text-slate-700',
      )}
    >
      {ok ? t('ptTag.operationalBadge.available') : t('ptTag.operationalBadge.noBoxes')}
    </span>
  );
}

type ProducerOption = { id: number; nombre: string; codigo: string | null };

function fetchPtTags() {
  return apiJson<PtTagApi[]>('/api/pt-tags');
}

function fetchProcesses() {
  return apiJson<FruitProcessRow[]>('/api/processes');
}

function fmtLbCell(v: string | number | null | undefined) {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return formatLb(n, 2);
}

function tagProducerLabel(t: PtTagApi, producerById: Map<number, string>) {
  const ids = [...new Set(t.items.map((i) => i.productor_id))];
  if (ids.length === 0) return '—';
  if (ids.length === 1) return producerById.get(ids[0]) ?? `#${ids[0]}`;
  return `Varios (${ids.length})`;
}

function compactTagStateTone(
  tag: PtTagApi,
  t: (key: string) => string
): { label: string; badge: string; bar: string } {
  const assignment = commercialAssignment(tag);
  if (tag.total_cajas <= 0) {
    return {
      label: t('ptTag.compactTone.pending'),
      badge: 'border-amber-200 bg-amber-50 text-amber-900',
      bar: 'bg-amber-400',
    };
  }
  if (assignment === 'full') {
    return {
      label: t('ptTag.compactTone.definitive'),
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      bar: 'bg-emerald-400',
    };
  }
  if (assignment === 'partial') {
    return {
      label: t('ptTag.compactTone.incomplete'),
      badge: 'border-amber-200 bg-amber-50 text-amber-900',
      bar: 'bg-amber-400',
    };
  }
  return {
    label: t('ptTag.compactTone.pending'),
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    bar: 'bg-slate-300',
  };
}

function compactTagTraceability(
  tag: PtTagApi,
  dispatchedTagIds: Set<number>,
  t: (key: string) => string
): string {
  if (dispatchedTagIds.has(tag.id)) return t('ptTag.traceability.dispatch');
  if (tag.es_union_tarjas || tag.excluida_suma_packout) return t('ptTag.traceability.repallet');
  if ((tag.bol ?? '').trim()) return t('ptTag.traceability.packingList');
  return t('ptTag.traceability.direct');
}

/** Asignación comercial temprana (solo datos ya guardados en la unidad PT). */
type CommercialAssignment = 'none' | 'partial' | 'full';

function commercialAssignment(t: PtTagApi): CommercialAssignment {
  const cid = t.client_id != null ? Number(t.client_id) : 0;
  if (!cid || cid <= 0) return 'none';
  const hasBol = !!(t.bol?.trim());
  const bid = t.brand_id != null ? Number(t.brand_id) : 0;
  if (hasBol || bid > 0) return 'full';
  return 'partial';
}

function CommercialStatusBadge({
  state,
  t,
}: {
  state: CommercialAssignment;
  t: (key: string) => string;
}) {
  const meta = {
    none: {
      label: t('ptTag.commercialBadge.noneLabel'),
      title: t('ptTag.commercialBadge.noneTitle'),
      className: 'border-rose-200/90 bg-rose-50 text-rose-900',
    },
    partial: {
      label: t('ptTag.commercialBadge.partialLabel'),
      title: t('ptTag.commercialBadge.partialTitle'),
      className: 'border-amber-200/90 bg-amber-50 text-amber-950',
    },
    full: {
      label: t('ptTag.commercialBadge.fullLabel'),
      title: t('ptTag.commercialBadge.fullTitle'),
      className: 'border-emerald-200/80 bg-emerald-50 text-emerald-900',
    },
  }[state];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
        meta.className,
      )}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

export function PtTagsPage() {
  const { t, i18n } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const canEditTag = canSupervise(role);
  const canDeleteTag = canOperate(role);
  const queryClient = useQueryClient();
  const [tagOpen, setTagOpen] = useState(false);
  const [bulkCreateProgress, setBulkCreateProgress] = useState<{ cur: number; total: number } | null>(null);
  const [editTag, setEditTag] = useState<PtTagApi | null>(null);
  const [search, setSearch] = useState('');
  const [lineageOpen, setLineageOpen] = useState(false);
  const [lineageData, setLineageData] = useState<TagLineageApi | null>(null);
  const [printTag, setPrintTag] = useState<PtTagApi | null>(null);
  const [printTemplate, setPrintTemplate] = useState<TarjaLabelTemplate>('standard');
  const [printCopies, setPrintCopies] = useState(1);
  const [printPrinterName, setPrintPrinterName] = useState('');
  const [localPrinters, setLocalPrinters] = useState<LocalPrinterInfo[]>([]);
  const [localServiceState, setLocalServiceState] = useState<
    'idle' | 'ok' | 'no_printer' | 'unavailable' | 'error'
  >('idle');
  const [localServiceMessage, setLocalServiceMessage] = useState('');
  const [localPrintService, setLocalPrintService] = useState<LocalPrintServiceStatusPayload | null>(null);
  const [printingTag, setPrintingTag] = useState(false);
  const [printRememberPrinter, setPrintRememberPrinter] = useState(true);
  const [printRememberTemplate, setPrintRememberTemplate] = useState(true);
  /** Por defecto el combo solo lista Zebras; al activar muestra Fax/PDF/etc. */
  const [showAllPrinters, setShowAllPrinters] = useState(false);
  const [localDefaultPrinter, setLocalDefaultPrinter] = useState<string | undefined>(undefined);
  const [probingPrintService, setProbingPrintService] = useState(false);
  const [detailTag, setDetailTag] = useState<PtTagApi | null>(null);
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<PtTagApi | null>(null);
  const prevTagOpenRef = useRef(false);
  /** Evita condición de carrera: al abrir con el trigger «Nueva», Radix llama onOpenChange(true) antes que setEditTag(null) del botón y el modal quedaba en modo edición. */
  const openPtModalForEditRef = useRef(false);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterProducer, setFilterProducer] = useState(0);
  const [filterFormat, setFilterFormat] = useState('');
  const [filterClient, setFilterClient] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState<'todas' | 'disponible' | 'sin_cajas'>('todas');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');

  const { data: tags, isPending, isError, error } = useQuery({
    queryKey: ['pt-tags'],
    queryFn: fetchPtTags,
  });

  const { data: tarjaTemplateCatalog } = useQuery({
    queryKey: ['labels', 'templates'],
    queryFn: fetchTarjaTemplateCatalog,
    staleTime: 10 * 60_000,
  });

  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: fetchProcesses,
    staleTime: 45_000,
  });

  const { data: dispatchesList } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => apiJson<DispatchDayRow[]>('/api/dispatches'),
    staleTime: 60_000,
  });

  const { data: presFormats } = useQuery({
    queryKey: ['masters', 'formats'],
    queryFn: () =>
      apiJson<
        {
          id: number;
          format_code: string;
          activo: boolean;
          descripcion?: string | null;
          net_weight_lb_per_box?: string | null;
          max_boxes_per_pallet?: number | null;
          box_kind?: 'mano' | 'maquina' | null;
          clamshell_label_kind?: 'generica' | 'marca' | null;
        }[]
      >('/api/masters/presentation-formats'),
  });

  const { data: commercialClients } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string }[]>('/api/masters/clients'),
  });

  const { data: brandsList } = useQuery({
    queryKey: ['masters', 'brands'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string }[]>('/api/masters/brands'),
  });

  const { data: producersList } = useQuery({
    queryKey: ['masters', 'producers'],
    queryFn: () => apiJson<ProducerOption[]>('/api/masters/producers'),
  });

  const processById = useMemo(() => {
    const m = new Map<number, FruitProcessRow>();
    for (const p of processes ?? []) m.set(p.id, p);
    return m;
  }, [processes]);

  const producerById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of producersList ?? []) m.set(p.id, p.nombre);
    return m;
  }, [producersList]);

  const activePresFormats = useMemo(() => (presFormats ?? []).filter((f) => f.activo), [presFormats]);

  const tarjaPrintTemplateChoices = useMemo(() => {
    const rows =
      tarjaTemplateCatalog ??
      TARJA_LABEL_TEMPLATE_OPTIONS.map((t) => ({
        id: t.id,
        title: t.label,
        description: tarjaTemplateHelp(t.id),
      }));
    return rows.map((row) => ({
      id: row.id,
      title: TARJA_TEMPLATE_UI[row.id].title,
      description: TARJA_TEMPLATE_UI[row.id].blurb,
    }));
  }, [tarjaTemplateCatalog]);

  const zebraPrinterList = useMemo(() => localPrinters.filter((p) => p.isZebra), [localPrinters]);

  /** Procesos abiertos: primera unidad PT, o una adicional si el API indica lb restante (`puede_nueva_unidad_pt`). */
  const availableProcesses = useMemo(() => {
    return (processes ?? [])
      .filter((p) => {
        const st = p.process_status ?? 'borrador';
        if (st === 'cerrado') return false;
        if (st !== 'borrador' && st !== 'confirmado') return false;
        const canAssign =
          p.puede_nueva_unidad_pt === true ||
          (p.tarja_id == null && p.puede_nueva_unidad_pt !== false);
        return canAssign;
      })
      .sort((a, b) => b.id - a.id);
  }, [processes]);

  /** En edición el proceso ya está vinculado: incluirlo aunque no esté en «disponibles para alta». */
  const processesForTagModal = useMemo(() => {
    if (!editTag?.items[0]) return availableProcesses;
    const pid = editTag.items[0].process_id;
    if (availableProcesses.some((x) => x.id === pid)) return availableProcesses;
    const p = (processes ?? []).find((x) => x.id === pid);
    return p ? [...availableProcesses, p] : availableProcesses;
  }, [editTag, availableProcesses, processes]);

  /** Edición una sola línea: procesos libres o ya vinculados a esta unidad PT (para poder cambiar de proceso). */
  const processesForEditSelect = useMemo(() => {
    if (!editTag?.items[0] || editTag.items.length > 1) return processesForTagModal;
    const tid = editTag.id;
    const linePid = editTag.items[0].process_id;
    const filtered = (processes ?? [])
      .filter((p) => {
        const st = p.process_status ?? 'borrador';
        if (st === 'cerrado') return false;
        if (st !== 'borrador' && st !== 'confirmado') return false;
        const linked = p.tarja_id != null ? Number(p.tarja_id) : null;
        if (linked != null && linked !== tid) return false;
        if (linked != null && linked === tid) return true;
        return p.puede_nueva_unidad_pt === true;
      })
      .sort((a, b) => b.id - a.id);
    if (filtered.some((x) => x.id === linePid)) return filtered;
    const p = (processes ?? []).find((x) => x.id === linePid);
    return p ? [...filtered, p] : filtered;
  }, [editTag, processes, processesForTagModal]);

  const formatOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tags ?? []) set.add(t.format_code);
    return [...set].sort();
  }, [tags]);

  const filteredTags = useMemo(() => {
    if (!tags) return [];
    let list = tags;

    if (filterDateFrom || filterDateTo) {
      list = list.filter((t) => isoInLocalDateRange(t.fecha, filterDateFrom, filterDateTo));
    }

    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
      (t) =>
        t.tag_code.toLowerCase().includes(s) ||
        t.format_code.toLowerCase().includes(s) ||
          String(t.id).includes(s) ||
          (t.bol?.toLowerCase().includes(s) ?? false),
      );
    }

    if (filterProducer > 0) {
      list = list.filter((t) => t.items.some((i) => i.productor_id === filterProducer));
    }

    if (filterFormat.trim()) {
      const fc = filterFormat.trim().toLowerCase();
      list = list.filter((t) => t.format_code.trim().toLowerCase() === fc);
    }

    if (filterClient !== null) {
      if (filterClient === -1) list = list.filter((t) => t.client_id == null || Number(t.client_id) <= 0);
      else list = list.filter((t) => Number(t.client_id) === filterClient);
    }

    if (filterEstado === 'disponible') list = list.filter((t) => t.total_cajas > 0);
    if (filterEstado === 'sin_cajas') list = list.filter((t) => t.total_cajas <= 0);

    return list;
  }, [tags, filterDateFrom, filterDateTo, search, filterProducer, filterFormat, filterClient, filterEstado]);

  const listKpis = useMemo(() => {
    const rows = filteredTags;
    let cajas = 0;
    let lb = 0;
    let sinCliente = 0;
    let conCajas = 0;
    let sinCajas = 0;
    let uniones = 0;
    for (const t of rows) {
      if (commercialAssignment(t) === 'none') sinCliente++;
      if (t.es_union_tarjas) uniones++;
      if (!countsTowardPtProductionTotals(t)) {
        if (t.total_cajas <= 0) sinCajas++;
        continue;
      }
      cajas += t.total_cajas;
      const w = Number(t.net_weight_lb);
      if (Number.isFinite(w)) lb += w;
      if (t.total_cajas > 0) conCajas++;
      else sinCajas++;
    }
    return {
      unidades: rows.length,
      cajas,
      lb,
      sinCliente,
      conCajas,
      sinCajas,
      uniones,
    };
  }, [filteredTags]);

  const dispatchedTagIds = useMemo(() => {
    const set = new Set<number>();
    for (const d of dispatchesList ?? []) {
      const ts = d.despachado_at || d.fecha_despacho;
      if (!ts) continue;
      for (const it of d.items ?? []) {
        const tid = Number(it.tarja_id);
        if (Number.isFinite(tid) && tid > 0) set.add(tid);
      }
      for (const ln of d.invoice?.lines ?? []) {
        const tid = Number(ln.tarja_id);
        if (Number.isFinite(tid) && tid > 0) set.add(tid);
      }
    }
    return set;
  }, [dispatchesList]);

  const groupedTagsByFormat = useMemo(() => {
    const map = new Map<
      string,
      {
        format: string;
        tags: PtTagApi[];
        totalCajas: number;
        totalLb: number;
        definitivas: number;
        pendientes: number;
        clientSummary: string;
      }
    >();
    for (const t of filteredTags) {
      const key = t.format_code?.trim() || '—';
      const cur = map.get(key) ?? {
        format: key,
        tags: [],
        totalCajas: 0,
        totalLb: 0,
        definitivas: 0,
        pendientes: 0,
        clientSummary: '—',
      };
      cur.tags.push(t);
      cur.totalCajas += Number.isFinite(t.total_cajas) ? t.total_cajas : 0;
      const lb = Number(t.net_weight_lb);
      if (Number.isFinite(lb)) cur.totalLb += lb;
      const assignment = commercialAssignment(t);
      if (t.total_cajas > 0 && assignment !== 'none') cur.definitivas += 1;
      else cur.pendientes += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .map((g) => {
        const clientSet = new Set<string>();
        for (const tag of g.tags) {
          const c = clientLabel(tag);
          if (c && c !== t('ptTag.clientSummary.none')) clientSet.add(c);
        }
        const arr = [...clientSet];
        const clientSummary = arr.length === 0
          ? t('ptTag.clientSummary.none')
          : arr.length === 1
            ? arr[0]
            : t('ptTag.clientSummary.multiple');
        return {
          ...g,
          clientSummary,
          tags: g.tags.slice().sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime() || b.id - a.id),
        };
      })
      .sort((a, b) => b.totalCajas - a.totalCajas);
  }, [filteredTags]);

  const openTagIdFromUrl = Number(searchParams.get('open') || '') || null;

  useEffect(() => {
    const prod = Number(searchParams.get('producerId') || '');
    if (prod > 0) setFilterProducer(prod);
    const procHint = Number(searchParams.get('processId') || '');
    if (procHint > 0) setSearch(String(procHint));
  }, [searchParams]);

  useEffect(() => {
    if (!openTagIdFromUrl || !tags?.length) return;
    const t = tags.find((x) => x.id === openTagIdFromUrl);
    if (!t) return;
    openPtModalForEditRef.current = true;
    setEditTag(t);
    setTagOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
  }, [openTagIdFromUrl, tags, setSearchParams]);

  const tagForm = useForm<CreateTagForm>({
    resolver: zodResolver(createTagSchema),
    defaultValues: {
      process_id: 0,
      fecha: toDatetimeLocalValue(new Date().toISOString()),
      resultado: 'cajas',
      format_code: '4x16oz',
      cajas_por_pallet: 1,
      cajas_generadas: 1,
      client_id: 0,
      brand_id: 0,
      bol: '',
      bulk_units: 1,
    },
  });

  const tagClientId = tagForm.watch('client_id');
  const watchedBulkUnits = tagForm.watch('bulk_units');
  const watchedTagFormatCode = tagForm.watch('format_code');
  const bulkUnitsSubmitLabel = Math.min(100, Math.max(1, Math.floor(Number(watchedBulkUnits) || 1)));
  const { data: brandsForTagClient } = useQuery({
    queryKey: ['masters', 'brands', 'pt-tag', tagClientId],
    queryFn: () =>
      tagClientId > 0
        ? apiJson<{ id: number; codigo: string; nombre: string }[]>(
            `/api/masters/brands?for_client_id=${tagClientId}`,
          )
        : apiJson<{ id: number; codigo: string; nombre: string }[]>('/api/masters/brands'),
    enabled: tagOpen,
  });

  useEffect(() => {
    const justOpened = tagOpen && !prevTagOpenRef.current;
    prevTagOpenRef.current = tagOpen;
    if (!justOpened) return;
    if (editTag) {
      const firstItem = editTag.items[0];
      const res = editTag.resultado;
      const resultadoPt = RESULTADOS_PT.includes(res as (typeof RESULTADOS_PT)[number]) ? res : 'cajas';
      const fc = editTag.format_code.trim().toLowerCase();
      const fmt = (presFormats ?? []).find((f) => f.format_code.trim().toLowerCase() === fc);
      const cpp =
        fmt?.max_boxes_per_pallet != null && Number(fmt.max_boxes_per_pallet) >= 1
          ? Number(fmt.max_boxes_per_pallet)
          : 1;
      cajasSeedKeyRef.current = 'edit';
      tagForm.reset({
        process_id: firstItem?.process_id ?? 0,
        fecha: toDatetimeLocalValue(editTag.fecha),
        resultado: resultadoPt as CreateTagForm['resultado'],
        format_code: editTag.format_code,
        cajas_por_pallet: cpp,
        cajas_generadas: firstItem?.cajas_generadas ?? 1,
        client_id: editTag.client_id != null && Number(editTag.client_id) > 0 ? Number(editTag.client_id) : 0,
        brand_id: editTag.brand_id != null && Number(editTag.brand_id) > 0 ? Number(editTag.brand_id) : 0,
        bol: editTag.bol ?? '',
        bulk_units: 1,
      });
    } else {
      cajasSeedKeyRef.current = '';
      cajasGeneradasUserTouchedForSeedRef.current = false;
      tagForm.reset({
        process_id: 0,
        fecha: toDatetimeLocalValue(new Date().toISOString()),
        resultado: 'cajas',
        format_code: activePresFormats[0]?.format_code ?? '4x16oz',
        cajas_por_pallet: 1,
        cajas_generadas: 1,
        client_id: 0,
        brand_id: 0,
        bol: '',
        bulk_units: 1,
      });
    }
  }, [tagOpen, editTag, activePresFormats, presFormats, tagForm]);

  useEffect(() => {
    if (!tagOpen || editTag) return;
    const first = activePresFormats[0]?.format_code;
    if (!first) return;
    const cur = tagForm.getValues('format_code')?.trim().toLowerCase() ?? '';
    const ok = activePresFormats.some((f) => f.format_code.trim().toLowerCase() === cur);
    if (!ok) tagForm.setValue('format_code', first, { shouldValidate: true });
  }, [tagOpen, editTag, activePresFormats, tagForm]);

  useEffect(() => {
    if (!tagOpen) return;
    const bid = tagForm.getValues('brand_id');
    if (!bid || bid <= 0) return;
    const list = brandsForTagClient ?? [];
    if (!list.some((b) => b.id === bid)) tagForm.setValue('brand_id', 0);
  }, [tagOpen, tagClientId, brandsForTagClient, tagForm]);

  const createProcessId = tagForm.watch('process_id');
  const selectedProcForCreate = useMemo(
    () => (processes ?? []).find((p) => p.id === createProcessId),
    [processes, createProcessId],
  );
  const netLbPerBoxCreate = useMemo(() => {
    const fc = watchedTagFormatCode?.trim().toLowerCase() ?? '';
    const fmt = (presFormats ?? []).find((f) => f.format_code.trim().toLowerCase() === fc);
    const nw = fmt?.net_weight_lb_per_box != null ? Number(fmt.net_weight_lb_per_box) : NaN;
    if (Number.isFinite(nw) && nw > 0) return nw;
    return null;
  }, [presFormats, watchedTagFormatCode]);
  /** Tope de cajas para esta unidad: usa lb restante para PT (entrada âˆ’ ya cargado en otras tarjas), no la entrada bruta. */
  const maxCajasDesdeProcesoCreate = useMemo(() => {
    if (!selectedProcForCreate || netLbPerBoxCreate == null || netLbPerBoxCreate <= 0) return null;
    const entrada = Number(selectedProcForCreate.lb_entrada ?? selectedProcForCreate.peso_procesado_lb);
    if (!Number.isFinite(entrada) || entrada <= 0) return 0;
    const lbRest =
      selectedProcForCreate.lb_pt_restante != null && String(selectedProcForCreate.lb_pt_restante).trim() !== ''
        ? Number(selectedProcForCreate.lb_pt_restante)
        : entrada;
    if (!Number.isFinite(lbRest) || lbRest <= 0) return 0;

    if (editTag && editTag.items.length === 1) {
      const item = editTag.items[0];
      const fcTag = editTag.format_code.trim().toLowerCase();
      const fmtTag = (presFormats ?? []).find((f) => f.format_code.trim().toLowerCase() === fcTag);
      const nwTag = fmtTag?.net_weight_lb_per_box != null ? Number(fmtTag.net_weight_lb_per_box) : NaN;
      const netEx = Number.isFinite(nwTag) && nwTag > 0 ? nwTag : netLbPerBoxCreate;
      const thisLineLb = item.cajas_generadas * netEx;
      const pool = lbRest + thisLineLb;
      return Math.max(0, Math.floor(pool / netLbPerBoxCreate + 1e-9));
    }

    return Math.max(0, Math.floor(lbRest / netLbPerBoxCreate + 1e-9));
  }, [selectedProcForCreate, netLbPerBoxCreate, editTag, presFormats]);

  const cajasPorPalletFormato = useMemo(
    () => boxesPerPalletForFormatCodePt(watchedTagFormatCode ?? '', presFormats),
    [watchedTagFormatCode, presFormats],
  );

  /** Valor inicial del campo: 1 pallet del formato; si queda menos lb, el remanente. */
  const cajasInicialesSugeridas = useMemo(() => {
    if (maxCajasDesdeProcesoCreate == null || maxCajasDesdeProcesoCreate < 1) return 1;
    return Math.min(maxCajasDesdeProcesoCreate, Math.max(1, cajasPorPalletFormato));
  }, [maxCajasDesdeProcesoCreate, cajasPorPalletFormato]);

  const watchedCajasGeneradas = tagForm.watch('cajas_generadas');
  /** Feedback visual: cajas indicadas vs tope sugerido (solo lectura). */
  const procesoVsTopeHint = useMemo(() => {
    if (!selectedProcForCreate || createProcessId <= 0) return null;
    if (editTag && editTag.items.length > 1) return null;
    if (maxCajasDesdeProcesoCreate == null || maxCajasDesdeProcesoCreate < 1) return null;
    const req = Math.floor(Number(watchedCajasGeneradas));
    if (!Number.isFinite(req) || req < 1) return null;
    const max = maxCajasDesdeProcesoCreate;
    if (req > max) {
      return {
        tone: 'danger' as const,
        label: 'Supera el tope sugerido',
        detail: `Indicaste ${req} cajas; el máximo sugerido es ${max}.`,
      };
    }
    if (req === max) {
      return {
        tone: 'tight' as const,
        label: 'Justo en el tope',
        detail: 'Usás el margen disponible según lb y formato.',
      };
    }
    const margin = max - req;
    const tightBand = Math.max(1, Math.floor(max * 0.08));
    if (margin <= tightBand) {
      return {
        tone: 'close' as const,
        label: 'Poco margen',
        detail: `Quedan ~${margin} caja${margin === 1 ? '' : 's'} bajo el tope sugerido.`,
      };
    }
    return {
      tone: 'ok' as const,
      label: 'Hay margen',
      detail: `Podés subir hasta ${max} cajas (tope sugerido).`,
    };
  }, [
    selectedProcForCreate,
    createProcessId,
    editTag,
    maxCajasDesdeProcesoCreate,
    watchedCajasGeneradas,
  ]);

  /**
   * Sugerencia inicial de cajas al elegir proceso + formato (solo alta nueva).
   * La clave es solo proceso|formato: si incluimos lb_pt_restante, un refetch de /processes
   * cambia la clave y vuelve a pisar lo que el usuario ya escribió (p. ej. 100 → máximo).
   */
  const cajasSeedKeyRef = useRef('');
  /** Evita pisar lo que el usuario ya cargó cuando el tope calculado llega tarde (formatos/async). */
  const cajasGeneradasUserTouchedForSeedRef = useRef(false);

  useEffect(() => {
    if (!tagOpen || editTag) return;
    cajasGeneradasUserTouchedForSeedRef.current = false;
  }, [createProcessId, watchedTagFormatCode, tagOpen, editTag]);

  useEffect(() => {
    if (!tagOpen) {
      if (!editTag) cajasSeedKeyRef.current = '';
      return;
    }
    if (editTag) return;
    if (cajasGeneradasUserTouchedForSeedRef.current) return;
    if (!createProcessId || createProcessId <= 0) return;
    if (maxCajasDesdeProcesoCreate == null || maxCajasDesdeProcesoCreate < 1) return;
    const fc = watchedTagFormatCode?.trim().toLowerCase() ?? '';
    const key = `${createProcessId}|${fc}`;
    if (cajasSeedKeyRef.current === key) return;
    cajasSeedKeyRef.current = key;
    tagForm.setValue('cajas_generadas', cajasInicialesSugeridas, { shouldValidate: true });
  }, [tagOpen, editTag, createProcessId, watchedTagFormatCode, cajasInicialesSugeridas, tagForm]);

  /** Cajas por pallet físico: maestro o reglas por código de formato. */
  useEffect(() => {
    if (!tagOpen) return;
    tagForm.setValue('cajas_por_pallet', cajasPorPalletFormato, { shouldValidate: true });
  }, [tagOpen, watchedTagFormatCode, cajasPorPalletFormato, tagForm]);

  const createTagMut = useMutation({
    mutationFn: async (body: CreateTagForm) => {
      const cajas = Math.floor(Number(body.cajas_generadas));
      if (!Number.isFinite(cajas) || cajas < 1) {
        throw new Error('Indicá cuántas cajas cargás en esta unidad PT (número válido ≥ 1).');
      }
      const bulk = Math.min(100, Math.max(1, Math.floor(Number(body.bulk_units ?? 1))));
      const basePayload = {
          fecha: new Date(body.fecha).toISOString(),
        resultado: body.resultado,
        format_code: body.format_code,
        cajas_por_pallet: body.cajas_por_pallet,
        process_id: body.process_id,
        cajas_generadas: cajas,
        ...(body.client_id != null && body.client_id > 0 ? { client_id: body.client_id } : {}),
        ...(body.brand_id != null && body.brand_id > 0 ? { brand_id: body.brand_id } : {}),
        ...(body.bol?.trim() ? { bol: body.bol.trim() } : {}),
      };
      const createdTags: PtTagApi[] = [];
      try {
        for (let i = 0; i < bulk; i++) {
          setBulkCreateProgress({ cur: i + 1, total: bulk });
          try {
            const tag = await apiJson<PtTagApi>('/api/pt-tags', {
              method: 'POST',
              body: JSON.stringify(basePayload),
            });
            createdTags.push(tag);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            throw new Error(
              createdTags.length > 0
                ? `Se crearon ${createdTags.length} de ${bulk} unidades. Falló la ${createdTags.length + 1}.ª: ${msg}`
                : msg,
            );
          }
        }
      } finally {
        setBulkCreateProgress(null);
      }
      return { bulk, created: createdTags.length, createdTags };
    },
    onSuccess: (data) => {
      setTagOpen(false);
      if (data.created > 1) {
        toast.success(t('ptTag.toast.createdBulk', { count: data.created }));
      } else {
        toast.success(t('ptTag.toast.created'));
      }
      if (data.createdTags.length > 0) {
        startTransition(() => {
          queryClient.setQueryData<PtTagApi[]>(['pt-tags'], (old) => {
            const prev = old ?? [];
            const seen = new Set(prev.map((t) => t.id));
            const prepend = data.createdTags.filter((t) => !seen.has(t.id));
            return prepend.length > 0 ? [...prepend, ...prev] : prev;
          });
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      if (data.createdTags.length === 0) {
        void queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      }
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });

  const updateTagMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateTagForm }) =>
      apiJson(`/api/pt-tags/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('ptTag.toast.updated'));
      setEditTag(null);
      setTagOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePtTagMut = useMutation({
    mutationFn: (id: number) => apiJson<{ ok: true }>(`/api/pt-tags/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('ptTag.toast.deleted'));
      setDeleteConfirmTag(null);
      setDetailTag((cur) => (cur?.id === id ? null : cur));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function clientLabel(t: PtTagApi) {
    const id = t.client_id != null ? Number(t.client_id) : null;
    if (!id || id <= 0) return '—';
    const c = (commercialClients ?? []).find((x) => x.id === id);
    return c ? `${c.codigo} · ${c.nombre}` : `#${id}`;
  }

  function brandLabel(t: PtTagApi) {
    const id = t.brand_id != null ? Number(t.brand_id) : null;
    if (!id || id <= 0) return null;
    return (brandsList ?? []).find((b) => b.id === id)?.nombre ?? `#${id}`;
  }

  function openLineage(tag: PtTagApi) {
    void (async () => {
      try {
        const data = await apiJson<TagLineageApi>(`/api/pt-tags/${tag.id}/lineage`);
        setLineageData(data);
        setLineageOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error');
      }
    })();
  }

  async function downloadPtPdf(tag: PtTagApi, variant: 'detalle' | 'etiqueta') {
    const q = variant === 'etiqueta' ? '?variant=etiqueta' : '';
    const langParam = i18n.language.startsWith('en') ? 'en' : 'es';
    const separator = q.startsWith('?') ? '&' : '?';
    const name =
      variant === 'etiqueta' ? `unidad-pt-${tag.id}-etiqueta.pdf` : `unidad-pt-${tag.id}-detalle.pdf`;
    try {
      await downloadPdf(`/api/documents/pt-tags/${tag.id}/pdf${q}${separator}lang=${langParam}`, name);
      toast.success(variant === 'etiqueta' ? t('ptTag.toast.pdfLabelReady') : t('ptTag.toast.pdfDetailReady'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ptTag.toast.pdfDetailReady'));
    }
  }

  async function printPtTagLabel(tag: PtTagApi, options?: { template?: TarjaLabelTemplate; printerName?: string; copies?: number }) {
    try {
      const result = await printTarjaZplOrDownload(tag.id, {
        template: options?.template ?? 'standard',
        copies: options?.copies ?? 1,
        printerName: options?.printerName,
        onPrintQueued: () => toast.success(t('ptTag.toast.printQueued')),
      });
      if (result.mode === 'sent_to_local_service') {
        return;
      }
      if (result.mode === 'queued_remote') {
        toast.success(t('ptTag.toast.printQueued'), {
          description: result.message,
          duration: 10_000,
        });
        return;
      }
      const archivo = result.filename;
      const descRespaldo = `Se descargó ${archivo} como respaldo. Podés imprimirlo manualmente desde el equipo de planta.`;
      const sinBrowserPrint =
        'No hace falta Zebra Browser Print: en este PC ejecutá run-print-service.bat (carpeta local-zebra-print-service del proyecto, con Node) y volvé a «Imprimir».';
      if (result.reason === 'service_unavailable') {
        toast.warning(t('ptTag.toast.printServiceUnavailable'), {
          description: `${sinBrowserPrint} ${descRespaldo}`,
          duration: 12_000,
        });
        return;
      }
      toast.error(t('ptTag.toast.printError'), {
        description: [result.message, descRespaldo].filter(Boolean).join(' · '),
        duration: 10_000,
      });
    } catch (e) {
      toast.error(t('ptTag.toast.printError'), {
        description: e instanceof Error ? e.message : t('ptTag.toast.printError'),
      });
    }
  }

  async function reprintLastPtTagPayload() {
    const last = loadLastPrintPayload();
    if (!last) {
      toast.error(t('ptTag.toast.noPreviousPrint'));
      return;
    }
    const tag = (tags ?? []).find((t) => t.id === last.tarjaId);
    if (!tag) {
      toast.error(t('ptTag.toast.tagNotFound'));
      return;
    }
    const printersResp = await getLocalPrinters();
    const list = printersResp.status === 'ok' ? printersResp.printers : [];
    const def = printersResp.status === 'ok' ? printersResp.defaultPrinter : undefined;
    const zebras = list.filter((p) => p.isZebra);
    const resolved = resolvePrinterForLocalJob({
      selectedName: last.printerName ?? '',
      allPrinters: list,
      zebraOnlyMode: zebras.length > 0,
      defaultPrinter: def,
      envPreferredPrinter: getConfiguredZebraPrinterName(),
    });
    void printPtTagLabel(tag, {
      template: last.template,
      copies: last.copies,
      printerName: resolved.trim() ? resolved : undefined,
    });
  }

  async function downloadPtTagZpl(tag: PtTagApi, template: TarjaLabelTemplate = 'standard') {
    try {
      const zpl = await fetchTarjaZpl(tag.id, template);
      downloadZplFile(`unidad-pt-${tag.id}.zpl`, zpl);
      toast.success(t('ptTag.toast.zplReady'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ptTag.toast.zplError'));
    }
  }

  function applyLocalPrintersProbe(resp: LocalPrintersProbeResult, persistedPrinter?: string) {
    if (resp.status === 'ok' || resp.status === 'no_printer') {
      setLocalPrintService(resp.printService);
      setLocalPrinters(resp.printers);
      setLocalDefaultPrinter(resp.defaultPrinter);
      if (resp.status === 'no_printer') {
        setLocalServiceState('no_printer');
        setLocalServiceMessage(resp.message);
        setPrintPrinterName('');
        return;
      }
      setLocalServiceState('ok');
      setLocalServiceMessage('');
      const autoName = resp.printService.printer?.trim() ?? '';
      const zebras = resp.printers.filter((p) => p.isZebra);
      const pool = zebras.length > 0 ? zebras : resp.printers;
      const pPersist = persistedPrinter?.trim();
      const validPersisted =
        pPersist && pool.some((p) => p.name === pPersist) ? pPersist : undefined;
      if (autoName && (!validPersisted || validPersisted === autoName)) {
        setPrintPrinterName(autoName);
      } else {
        setPrintPrinterName(
          suggestPrinterNameForTarjaPrint({
            printers: pool,
            defaultPrinter: resp.defaultPrinter,
            persistedPrinterName: validPersisted,
            envPreferredPrinter: getConfiguredZebraPrinterName(),
          }) || autoName,
        );
      }
      return;
    }
    setLocalServiceState(resp.status);
    setLocalPrintService(null);
    setLocalServiceMessage(
      resp.status === 'unavailable' || resp.status === 'error'
        ? resp.message?.trim() || getLastPrintServiceProbeSummary()
        : '',
    );
    setLocalPrinters([]);
  }

  async function refreshPrintServiceStatus() {
    setProbingPrintService(true);
    try {
      const persisted =
        printRememberPrinter && printPrinterName.trim() ? printPrinterName.trim() : undefined;
      const resp = await getLocalPrinters();
      applyLocalPrintersProbe(resp, persisted);
    } finally {
      setProbingPrintService(false);
    }
  }

  function openPrintDialog(tag: PtTagApi) {
    const last = loadLastPrintPayload();
    const rememberP = last?.rememberPrinter !== false;
    const rememberT = last?.rememberTemplate !== false;
    const persistedPrinter = rememberP ? last?.printerName : undefined;
    setPrintRememberPrinter(rememberP);
    setPrintRememberTemplate(rememberT);
    setPrintTag(tag);
    setShowAllPrinters(false);
    setLocalDefaultPrinter(undefined);
    setPrintTemplate(rememberT && last?.template ? last.template : 'standard');
    setPrintCopies(last?.copies ?? 1);
    setPrintPrinterName(persistedPrinter?.trim() ? persistedPrinter.trim() : '');
    setLocalServiceState('idle');
    setLocalServiceMessage('');
    setLocalPrintService(null);
    setLocalPrinters([]);
    void (async () => {
      setProbingPrintService(true);
      try {
        const resp = await getLocalPrinters();
        applyLocalPrintersProbe(resp, persistedPrinter?.trim() ? persistedPrinter.trim() : undefined);
      } finally {
        setProbingPrintService(false);
      }
    })();
  }

  useEffect(() => {
    if (printTag == null || localServiceState !== 'ok') return;
    if (zebraPrinterList.length !== 1) return;
    setPrintPrinterName(zebraPrinterList[0].name);
  }, [printTag, localServiceState, zebraPrinterList]);

  useEffect(() => {
    if (printTag == null || localServiceState !== 'ok' || showAllPrinters) return;
    if (zebraPrinterList.length <= 1) return;
    const raw = printPrinterName.trim();
    if (!raw) return;
    if (zebraPrinterList.some((z) => z.name === raw)) return;
    setPrintPrinterName(
      suggestPrinterNameForTarjaPrint({
        printers: zebraPrinterList,
        defaultPrinter: localDefaultPrinter,
        envPreferredPrinter: getConfiguredZebraPrinterName(),
      }),
    );
  }, [
    printTag,
    printPrinterName,
    localServiceState,
    showAllPrinters,
    zebraPrinterList,
    localDefaultPrinter,
  ]);

  useEffect(() => {
    if (printTag == null) {
      setShowAllPrinters(false);
      setLocalDefaultPrinter(undefined);
      setLocalPrintService(null);
    }
  }, [printTag]);

  const canPrintToLocalService = localServiceState === 'ok';

  if (isPending) {
    return (
      <div className="font-inter space-y-8">
        <Skeleton className="h-10 w-full max-w-md rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : 'Reintentá más tarde.';
    return (
      <div className="font-inter">
        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 px-5 py-4 text-sm text-rose-900">
          <p className="font-semibold">Error al cargar unidades PT</p>
          <p className="mt-1 whitespace-pre-wrap text-rose-800/90">{msg}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-rose-800/85">
            <li>
              En desarrollo: API en <code className="rounded bg-rose-100/80 px-1">http://127.0.0.1:3000</code> y front
              con proxy Vite (<code className="rounded bg-rose-100/80 px-1">npm run dev:web</code> o{' '}
              <code className="rounded bg-rose-100/80 px-1">npm run dev:full</code>).
            </li>
            <li>
              Si definiste <code className="rounded bg-rose-100/80 px-1">VITE_API_URL</code>, debe ser alcanzable
              (mismo protocolo que la página: http/https).
            </li>
            <li>Sesión: si el token venció, cerrá sesión y volvé a entrar.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="font-inter space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className={pageTitle}>{t('ptTag.pageTitle')}</h1>
            <button
              type="button"
              className={pageInfoButton}
              title="Alta de tarja TAR-… y vínculo a proceso; genera pallet PF-… y stock en Existencias PT. Flujo: repalet, packing lists, BOL, despacho."
              aria-label={t('ptTag.pageTitle')}
            >
              <Info className="h-4 w-4" />
            </button>
        </div>
          <p className={pageSubtitle}>{t('ptTag.pageSubtitle')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canOperate(role) ? (
          <Dialog
            open={tagOpen}
            onOpenChange={(open) => {
              setTagOpen(open);
              if (!open) {
                setEditTag(null);
                openPtModalForEditRef.current = false;
                return;
              }
              // open === true
              if (!openPtModalForEditRef.current) {
                setEditTag(null);
              }
              openPtModalForEditRef.current = false;
            }}
          >
          <DialogTrigger asChild>
              <Button type="button" className="h-10 shrink-0 gap-2 rounded-xl px-5 shadow-sm">
              <Plus className="h-4 w-4" />
                {t('ptTag.newButton')}
            </Button>
          </DialogTrigger>
            <DialogContent
              className={cn(
                operationalModalContentClass,
                'min-h-0 max-h-[min(96vh,1000px)] max-w-[min(1280px,calc(100vw-2rem))] sm:max-w-[min(1280px,calc(100vw-2rem))] [&>button]:hidden',
              )}
            >
              <DialogHeader className={operationalModalHeaderClass}>
                <div className="flex items-center justify-between">
                  <DialogTitle className={cn(operationalModalTitleClass, 'flex items-center gap-2')}>
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    {editTag ? t('ptTag.dialog.titleEdit', { code: editTag.tag_code }) : t('ptTag.dialog.titleNew')}
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={() => setTagOpen(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                    aria-label={t('ptTag.dialog.closeAriaLabel')}
                  >
                    <X size={16} />
                  </button>
                </div>
            </DialogHeader>
              <form
                onSubmit={tagForm.handleSubmit((v) => {
                  if (editTag) {
                    const hasDest =
                      (v.client_id ?? 0) > 0 || !!(v.bol?.trim()) || (v.brand_id ?? 0) > 0;
                    if (!hasDest) {
                      toast.warning(t('ptTag.toast.destinationWarning'));
                    }
                    const body: UpdateTagForm = {
                      format_code: v.format_code.trim(),
                      cajas_por_pallet: v.cajas_por_pallet,
                      fecha: new Date(v.fecha).toISOString(),
                      resultado: v.resultado,
                      client_id: v.client_id ?? 0,
                      brand_id: v.brand_id ?? 0,
                      bol: v.bol?.trim() ?? '',
                    };
                    if (editTag.items.length === 1) {
                      body.process_id = v.process_id;
                      body.cajas_generadas = v.cajas_generadas;
                    }
                    updateTagMut.mutate({ id: editTag.id, body });
                    return;
                  }
                  const hasDest =
                    (v.client_id ?? 0) > 0 || !!(v.bol?.trim()) || (v.brand_id ?? 0) > 0;
                  if (!hasDest) {
                    toast.warning(t('ptTag.toast.destinationWarning'));
                  }
                  createTagMut.mutate(v);
                })}
                className={operationalModalFormClass}
              >
                <div className={cn(operationalModalBodyClass, 'lg:overflow-hidden lg:px-8 lg:py-5')}>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:grid lg:max-h-[min(82vh,860px)] lg:grid-cols-2 lg:gap-6 lg:overflow-hidden">
                    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:min-h-0 lg:overflow-hidden lg:pr-1">
                    {/* 1 · Formato */}
                    <section className={operationalModalSectionCard}>
                      <div className={operationalModalSectionHeadingRow}>
                        <span className={operationalModalStepBadge}>1</span>
                        <h3 className={operationalModalStepTitle}>{t('ptTag.dialog.step1')}</h3>
                      </div>
                      <div className="grid gap-3.5 lg:grid-cols-2 lg:items-start">
                        <div className="grid gap-1.5">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor="tag-fecha">
                            {t('ptTag.dialog.fieldDate')}
                          </Label>
                          <Input id="tag-fecha" type="datetime-local" className="h-9" {...tagForm.register('fecha')} />
                {tagForm.formState.errors.fecha && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.fecha.message}</p>
                )}
              </div>
                        <div className="grid gap-1.5 rounded-lg border border-border/50 bg-muted/15 px-2.5 py-2">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('ptTag.dialog.fieldProductType')}</Label>
                <select
                            className="flex min-h-8 w-full rounded border-0 bg-transparent px-0 py-0.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
                  {...tagForm.register('resultado')}
                >
                            {RESULTADOS_PT.map((r) => (
                    <option key={r} value={r}>
                                {labelPtProductoPt(r, t)}
                    </option>
                  ))}
                </select>
              </div>
                        <div className="grid gap-1.5 lg:col-span-2">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor="format_code">
                            {t('ptTag.dialog.fieldFormat')}
                          </Label>
                          {activePresFormats.length > 0 ? (
                            <select
                              id="format_code"
                              className="min-w-0 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={tagForm.watch('format_code')}
                              onChange={(e) => tagForm.setValue('format_code', e.target.value, { shouldValidate: true })}
                            >
                              {activePresFormats.map((f) => (
                                <option key={f.id} value={f.format_code}>
                                  {f.format_code}
                                  {f.descripcion ? ` — ${f.descripcion}` : ''}
                                  {f.net_weight_lb_per_box != null ? ` · ${f.net_weight_lb_per_box} ${t('ptTag.formatSelector.lbPerBox')}` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              placeholder="NxMoz (ej. 4x16oz) o PINT REGULAR / PINT LOW PROFILE"
                              {...tagForm.register('format_code')}
                            />
                          )}
                {tagForm.formState.errors.format_code && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.format_code.message}</p>
                          )}
                          <p className="leading-tight text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/75">{t('ptTag.dialog.formatHint')}</span>{' '}
                            <span className="tabular-nums font-semibold text-foreground/90">{tagForm.watch('cajas_por_pallet')}</span>
                            {' · '}
                            <span className="font-mono text-foreground/70">{watchedTagFormatCode || '—'}</span>
                          </p>
                          {tagForm.formState.errors.cajas_por_pallet && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.cajas_por_pallet.message}</p>
                )}
              </div>
              </div>
                    </section>

                    {/* 2 · Proceso origen */}
                    <section className={cn(operationalModalSectionMuted, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
                      <div className={operationalModalSectionHeadingRow}>
                        <span className={operationalModalStepBadge}>2</span>
                        <h3 className={operationalModalStepTitle}>{t('ptTag.dialog.step2')}</h3>
                      </div>
                      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto">
                        <div className="grid gap-1.5">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor="tag-process">
                            {t('ptTag.dialog.fieldProcess')}
                          </Label>
                          <select
                            id="tag-process"
                            disabled={!!editTag && editTag.items.length > 1}
                            className="min-w-0 flex h-auto min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
                            {...tagForm.register('process_id', { valueAsNumber: true })}
                          >
                            <option value={0}>{t('ptTag.dialog.choosePlaceholder')}</option>
                            {(editTag
                              ? editTag.items.length > 1
                                ? processesForTagModal
                                : processesForEditSelect
                              : availableProcesses
                            ).map((p) => (
                              <option key={p.id} value={p.id}>
                                [{labelProcesoEstadoParaSelector(p, t)}] #{p.id} · {p.variedad_nombre ?? '—'} · {t('ptTag.processSelector.entrada')}{' '}
                                {fmtLbCell(p.lb_entrada ?? p.peso_procesado_lb)}
                                {p.lb_pt_restante != null && String(p.lb_pt_restante).trim() !== ''
                                  ? ` · ${t('ptTag.processSelector.restantePt')} ${fmtLbCell(p.lb_pt_restante)}`
                                  : ''}{' '}
                                · {new Date(p.fecha_proceso).toLocaleDateString('es')}
                              </option>
                            ))}
                          </select>
                          {tagForm.formState.errors.process_id ? (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.process_id.message}</p>
                          ) : null}
                        </div>

                        {editTag && editTag.items.length > 1 ? (
                          <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                            {t('ptTag.dialog.multiProcessWarning')}
                          </p>
                        ) : null}
                        {!editTag && availableProcesses.length === 0 ? (
                          <p className="text-xs leading-snug text-amber-800 dark:text-amber-200">
                            {t('ptTag.dialog.noProcesses')}
                          </p>
                        ) : null}

                        {selectedProcForCreate && (editTag ? editTag.items.length === 1 : true) ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                {t('ptTag.dialog.lbAvailable')}{' '}
                                {selectedProcForCreate.lb_pt_restante != null &&
                                String(selectedProcForCreate.lb_pt_restante).trim() !== ''
                                  ? fmtLbCell(selectedProcForCreate.lb_pt_restante)
                                  : fmtLbCell(selectedProcForCreate.lb_entrada ?? selectedProcForCreate.peso_procesado_lb)}
                              </span>
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                {t('ptTag.dialog.suggestedBoxes')} {maxCajasDesdeProcesoCreate ?? '—'}
                              </span>
                            </div>
                            {procesoVsTopeHint ? (
                              <div
                                className={cn(
                                  'rounded-md border px-2.5 py-1.5 text-[11px] font-medium',
                                  procesoVsTopeHint.tone === 'ok'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-rose-200 bg-rose-50 text-rose-700',
                                )}
                              >
                                {procesoVsTopeHint.tone === 'ok'
                                  ? t('ptTag.dialog.marginOk', { max: maxCajasDesdeProcesoCreate ?? 0 })
                                  : t('ptTag.dialog.noMargin')}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </section>
                    </div>

                    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain lg:min-h-0 lg:pr-1">
                    {/* 3 · Cantidad (cajas) */}
                    <section className={operationalModalSectionCard}>
                      <div className={operationalModalSectionHeadingRow}>
                        <span className={operationalModalStepBadge}>3</span>
                        <h3 className={operationalModalStepTitle}>{t('ptTag.dialog.step3')}</h3>
                      </div>
                      <div className="grid max-w-md gap-2">
                        <Label htmlFor="cajas_generadas" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t('ptTag.dialog.fieldBoxes')}
                        </Label>
                        <Input
                          id="cajas_generadas"
                          type="number"
                          min={1}
                          max={maxCajasDesdeProcesoCreate ?? undefined}
                          step={1}
                          disabled={!!editTag && editTag.items.length > 1}
                          className={cn(
                            'h-12 rounded-lg border-input text-center text-[18px] font-medium tabular-nums tracking-tight',
                            editTag && editTag.items.length > 1 ? 'disabled:cursor-not-allowed disabled:opacity-70' : '',
                          )}
                          {...(() => {
                            const reg = tagForm.register('cajas_generadas', { valueAsNumber: true });
                            return {
                              ...reg,
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                if (!editTag) cajasGeneradasUserTouchedForSeedRef.current = true;
                                void reg.onChange(e);
                              },
                            };
                          })()}
                        />
                        {maxCajasDesdeProcesoCreate != null && !(editTag && editTag.items.length > 1) ? (
                          <p className="text-[11px] leading-tight text-muted-foreground">
                            {t('ptTag.dialog.maxSuggested')}{' '}
                            <span className="font-semibold text-foreground">{maxCajasDesdeProcesoCreate}</span>{' '}
                            {t('ptTag.dialog.maxNote')}
                            {!editTag && maxCajasDesdeProcesoCreate > cajasPorPalletFormato ? (
                              <>
                                {' '}
                                {t('ptTag.dialog.initialValue')}{' '}
                                <span className="font-semibold text-foreground">{cajasPorPalletFormato}</span>{' '}
                                {t('ptTag.dialog.onePallet')}
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {editTag && editTag.items.length > 1 ? (
                          <p className="text-[11px] leading-tight text-muted-foreground">{t('ptTag.dialog.multiLinesNote')}</p>
                        ) : editTag ? (
                          <p className="text-[11px] leading-tight text-muted-foreground">{t('ptTag.dialog.serverValidation')}</p>
                        ) : null}
                        {tagForm.formState.errors.cajas_generadas ? (
                          <p className="text-xs text-destructive">{tagForm.formState.errors.cajas_generadas.message}</p>
                        ) : null}
                        {!editTag ? (
                          <div className="mt-2 grid gap-1.5">
                            <Label htmlFor="tag-bulk-units" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t('ptTag.dialog.bulkUnitsLabel')}
                            </Label>
                            <Input
                              id="tag-bulk-units"
                              type="number"
                              min={1}
                              max={100}
                              step={1}
                              inputMode="numeric"
                              className="h-10 rounded-md border-input/80 text-center text-base font-semibold tabular-nums"
                              {...tagForm.register('bulk_units', { valueAsNumber: true })}
                            />
                            <p className="text-[10px] leading-tight text-muted-foreground">
                              {t('ptTag.dialog.bulkUnitsHint')}
                            </p>
                            {tagForm.formState.errors.bulk_units && (
                              <p className="text-xs text-destructive">{tagForm.formState.errors.bulk_units.message}</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {/* 4 · Comercial (opcional) */}
                    <section className={cn(operationalModalSectionMuted, 'shrink-0')}>
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <span className={operationalModalStepBadge}>4</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('ptTag.dialog.step4')}</span>
                        <span className="text-[10px] text-muted-foreground/80">{t('ptTag.dialog.step4Optional')}</span>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-muted-foreground">{t('ptTag.dialog.fieldClient')}</Label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input/80 bg-background px-2 py-1 text-xs"
                            {...tagForm.register('client_id', { valueAsNumber: true })}
                          >
                            <option value={0}>{t('ptTag.dialog.clientUndefined')}</option>
                            {(commercialClients ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.codigo} — {c.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-muted-foreground">{t('ptTag.dialog.fieldBrand')}</Label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input/80 bg-background px-2 py-1 text-xs"
                            {...tagForm.register('brand_id', { valueAsNumber: true })}
                          >
                            <option value={0}>{t('ptTag.dialog.brandUndefined')}</option>
                            {(brandsForTagClient ?? []).map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.codigo} — {b.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1 sm:col-span-2">
                          <Label htmlFor="tag-bol-prev" className="text-[11px] text-muted-foreground">
                            {t('ptTag.dialog.fieldBol')}
                          </Label>
                          <Input
                            id="tag-bol-prev"
                            placeholder={t('ptTag.dialog.fieldBolPlaceholder')}
                            className="h-9 rounded-md text-xs"
                            {...tagForm.register('bol')}
                          />
                        </div>
                      </div>
                    </section>

                    </div>
                  </div>
                </div>

                <DialogFooter className={cn(operationalModalFooterClass, 'gap-2')}>
                <Button type="button" variant="outline" onClick={() => setTagOpen(false)}>
                  {t('ptTag.dialog.cancelButton')}
                </Button>
                  <Button
                    type="submit"
                    disabled={
                      editTag
                        ? updateTagMut.isPending
                        : createTagMut.isPending || availableProcesses.length === 0
                    }
                  >
                    {editTag
                      ? updateTagMut.isPending
                        ? t('ptTag.dialog.savingButton')
                        : t('ptTag.dialog.saveButton')
                      : createTagMut.isPending
                        ? bulkCreateProgress
                          ? t('ptTag.dialog.creatingBulkButton', {
                              cur: bulkCreateProgress.cur,
                              total: bulkCreateProgress.total,
                            })
                          : t('ptTag.dialog.creatingButton')
                        : bulkUnitsSubmitLabel > 1
                          ? t('ptTag.dialog.createBulkButton', { n: bulkUnitsSubmitLabel })
                          : t('ptTag.dialog.createButton')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="pt-kpis" className="space-y-4">
        <h2 id="pt-kpis" className="sr-only">
          {t('ptTag.srKpis')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cn(kpiCard, 'border-blue-200 bg-blue-50')}>
            <p className={kpiLabel}>{t('ptTag.kpi.units')}</p>
            <p className={cn(kpiValueLg, 'text-blue-700')}>{formatCount(listKpis.unidades)}</p>
            <p className={kpiFootnote}>{t('ptTag.kpi.unitsNote')}</p>
      </div>
          <div className={cn(kpiCard, 'border-green-200 bg-green-50')}>
            <p className={kpiLabel}>{t('ptTag.kpi.boxes')}</p>
            <p className={cn(kpiValueLg, 'text-green-700')}>{formatCount(listKpis.cajas)}</p>
            <p className={kpiFootnote}>{t('ptTag.kpi.boxesNote')}</p>
          </div>
          <div className={cn(kpiCard, 'border-blue-200 bg-blue-50')}>
            <p className={kpiLabel}>{t('ptTag.kpi.lb')}</p>
            <p className={cn(kpiValueLg, 'text-blue-700')}>{formatLb(listKpis.lb, 2)}</p>
            <p className={kpiFootnote}>{t('ptTag.kpi.lbNote')}</p>
          </div>
          <div
            className={cn(
              kpiCard,
              listKpis.sinCliente > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50',
            )}
          >
            <p className={kpiLabel}>{t('ptTag.kpi.pending')}</p>
            <p className={cn(kpiValueLg, listKpis.sinCliente > 0 ? 'text-amber-700' : 'text-green-700')}>
              {formatCount(listKpis.sinCliente)}
            </p>
            <p className={kpiFootnote}>{t('ptTag.kpi.pendingNote')}</p>
          </div>
        </div>
      </section>

      <div className={filterPanel}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('ptTag.filters.title')}</span>
        </div>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="grid min-w-[9.5rem] gap-1.5">
            <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.dateFrom')}</Label>
            <Input
              type="date"
              className={cn(filterInputClass, 'h-9')}
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div className="grid min-w-[9.5rem] gap-1.5">
            <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.dateTo')}</Label>
            <Input
              type="date"
              className={cn(filterInputClass, 'h-9')}
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => {
              const d = localDateYmd();
              setFilterDateFrom(d);
              setFilterDateTo(d);
            }}
          >
            {t('ptTag.filters.today')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 text-slate-600"
            onClick={() => {
              setFilterDateFrom('');
              setFilterDateTo('');
            }}
          >
            {t('ptTag.filters.clearDates')}
          </Button>
        </div>
        <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.search')}</Label>
            <Input
              className={filterInputClass}
              placeholder={t('ptTag.filters.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.producer')}</Label>
            <select
              className={filterSelectClass}
              value={filterProducer}
              onChange={(e) => setFilterProducer(Number(e.target.value))}
            >
              <option value={0}>{t('ptTag.filters.producerAll')}</option>
              {(producersList ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo ? `${p.codigo} · ` : ''}
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.format')}</Label>
            <select
              className={filterSelectClass}
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
            >
              <option value="">{t('ptTag.filters.formatAll')}</option>
              {formatOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.boxState')}</Label>
            <select
              className={filterSelectClass}
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as typeof filterEstado)}
            >
              <option value="todas">{t('ptTag.filters.boxStateAll')}</option>
              <option value="disponible">{t('ptTag.filters.boxStateAvailable')}</option>
              <option value="sin_cajas">{t('ptTag.filters.boxStateEmpty')}</option>
            </select>
          </div>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">{t('ptTag.filters.moreFilters')}</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[11px] font-medium text-slate-500">{t('ptTag.filters.expectedClient')}</Label>
              <select
                className={filterSelectClass}
                value={filterClient === null ? '' : filterClient === -1 ? '-1' : String(filterClient)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') setFilterClient(null);
                  else if (v === '-1') setFilterClient(-1);
                  else setFilterClient(Number(v));
                }}
              >
                <option value="">{t('ptTag.filters.clientAll')}</option>
                <option value="-1">{t('ptTag.filters.clientNone')}</option>
                {(commercialClients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </div>

      <section className="space-y-3" aria-labelledby="pt-listado">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="pt-listado" className={sectionTitle}>
              {t('ptTag.table.title')}
            </h2>
            <span className={cn(sectionHint, '!mt-0')}>{t('ptTag.table.hint')}</span>
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
                {t('ptTag.table.viewCompact')}
              </Button>
              <Button
                type="button"
                variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-md px-3 text-xs"
                onClick={() => setViewMode('detailed')}
              >
                {t('ptTag.table.viewDetailed')}
              </Button>
                    </div>
            <details className="group">
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
                {t('ptTag.table.criteria')}
              </summary>
              <div className="mt-1 rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600 shadow-sm">
                <p><span className="font-semibold text-emerald-700">{t('ptTag.table.criteriaDefinitive')}</span> {t('ptTag.criteria.definitiveDesc')}</p>
                <p><span className="font-semibold text-amber-700">{t('ptTag.table.criteriaPending')}</span> {t('ptTag.criteria.pendingDesc')}</p>
                <p><span className="font-semibold text-violet-700">{t('ptTag.table.criteriaRepallet')}</span> {t('ptTag.criteria.repalletDesc')}</p>
                <p><span className="font-semibold text-sky-700">{t('ptTag.table.criteriaDirect')}</span> {t('ptTag.criteria.directDesc')}</p>
                <p><span className="font-semibold text-slate-700">{t('ptTag.table.criteriaBol')}</span> {t('ptTag.criteria.bolDesc')}</p>
                <p><span className="font-semibold text-slate-700">{t('ptTag.table.criteriaNoRoute')}</span> {t('ptTag.criteria.noRouteDesc')}</p>
                  </div>
            </details>
          </div>
        </div>
        {filteredTags.length === 0 ? (
          <div className={cn(emptyStatePanel, 'py-14')}>{t('ptTag.table.empty')}</div>
        ) : viewMode === 'compact' ? (
          <div className="space-y-2.5">
            {groupedTagsByFormat.map((group) => (
              <div key={group.format} className="overflow-hidden rounded-lg border border-slate-200/85 bg-white">
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/85">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-slate-900">{group.format}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatCount(group.totalCajas)} {t('ptTag.table.groupBoxes')} · {formatLb(group.totalLb, 2)}{' '}
                      {t('ptTag.table.groupLb')} · {formatCount(group.tags.length)} {t('ptTag.table.groupUnits')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                      {t('ptTag.table.groupDefinitive')} {formatCount(group.definitivas)}
                    </span>
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                      {t('ptTag.table.groupPending')} {formatCount(group.pendientes)}
                    </span>
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {group.clientSummary}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead>{t('ptTag.table.colState')}</TableHead>
                        <TableHead>{t('ptTag.table.colCode')}</TableHead>
                        <TableHead>{t('ptTag.table.colClient')}</TableHead>
                        <TableHead>{t('ptTag.table.colProducer')}</TableHead>
                        <TableHead>{t('ptTag.table.colVariety')}</TableHead>
                        <TableHead className="text-right">{t('ptTag.table.colBoxes')}</TableHead>
                        <TableHead className="text-right">{t('ptTag.table.colLb')}</TableHead>
                        <TableHead>{t('ptTag.table.colTrace')}</TableHead>
                        <TableHead className="text-right">{t('ptTag.table.colActions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.tags.map((tag) => {
                        const tone = compactTagStateTone(tag, t);
                        const trace = compactTagTraceability(tag, dispatchedTagIds, t);
                        return (
                          <TableRow key={tag.id} className={cn(tableBodyRow, 'cursor-pointer hover:bg-slate-50/70')} onClick={() => setDetailTag(tag)}>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className={cn('h-5 w-1.5 rounded-full', tone.bar)} />
                                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', tone.badge)}>
                                  {tone.label}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <p className="font-mono text-sm font-semibold text-slate-900">{tag.tag_code}</p>
                              <p className="text-[10px] text-slate-500">#{tag.id} · {formatTagDateShort(tag.fecha)}</p>
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-700">{clientLabel(tag)}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-800">{tagProducerLabel(tag, producerById)}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-700">{tagVarietyLabel(tag, processById)}</TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm font-semibold text-slate-900">{formatCount(tag.total_cajas)}</TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm font-semibold text-slate-900">{fmtLbCell(tag.net_weight_lb)}</TableCell>
                            <TableCell className="py-2.5">
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                {trace}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => setDetailTag(tag)}>
                                  {t('ptTag.table.actionDetail')}
                      </Button>
                                <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => openPrintDialog(tag)}>
                                  {t('ptTag.table.actionPrint')}
                    </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-600 hover:bg-slate-100">
                                      <MoreHorizontal className="h-4 w-4" />
                                      <span className="sr-only">Acciones</span>
                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    {canEditTag && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          openPtModalForEditRef.current = true;
                                          setEditTag(tag);
                                          setTagOpen(true);
                                        }}
                                      >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        {t('ptTag.table.actionEdit')}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => openLineage(tag)}>
                                      <Waypoints className="mr-2 h-4 w-4" />
                                      {t('ptTag.table.actionTraceability')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void downloadPtPdf(tag, 'detalle')}>
                                      <FileDown className="mr-2 h-4 w-4" />
                                      {t('ptTag.table.actionPdfDetail')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void downloadPtPdf(tag, 'etiqueta')}>
                                      <FileDown className="mr-2 h-4 w-4" />
                                      {t('ptTag.table.actionPdfLabel')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void downloadPtTagZpl(tag)}>
                                      <FileDown className="mr-2 h-4 w-4" />
                                      {t('ptTag.table.actionZpl')}
                                    </DropdownMenuItem>
                                    {canDeleteTag ? (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setDeleteConfirmTag(tag)}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          {t('ptTag.table.actionDelete')}
                                        </DropdownMenuItem>
                                      </>
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
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(tableShell, 'overflow-x-auto')}>
            <Table className="min-w-[1140px] [&_td]:py-2.5 [&_td:last-child]:w-[52px] [&_td:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:bg-slate-50/90 [&_th]:py-2 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_th:last-child]:text-right">
                        <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead>{t('ptTag.table.colState')}</TableHead>
                  <TableHead>{t('ptTag.table.colDate')}</TableHead>
                  <TableHead>{t('ptTag.table.colCode')}</TableHead>
                            <TableHead>{t('ptTag.table.colProducer')}</TableHead>
                  <TableHead>{t('ptTag.table.colVariety')}</TableHead>
                  <TableHead>{t('ptTag.table.colFormat')}</TableHead>
                  <TableHead className="text-right tabular-nums">{t('ptTag.table.colBoxes')}</TableHead>
                  <TableHead className="text-right tabular-nums">{t('ptTag.table.colLb')}</TableHead>
                  <TableHead>{t('ptTag.table.colProcess')}</TableHead>
                  <TableHead>{t('ptTag.table.colCommercial')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('ptTag.table.colUnion')}</TableHead>
                  <TableHead className="text-right"> </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                {filteredTags.map((tag) => (
                  <TableRow
                    key={tag.id}
                    className={cn(tableBodyRow, 'cursor-pointer')}
                    onClick={() => setDetailTag(tag)}
                  >
                    <TableCell>
                      <OperationalTagBadge tag={tag} t={t} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-slate-600">{formatTagDateShort(tag.fecha)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-semibold text-slate-900">{tag.tag_code}</span>
                        <span className="font-mono text-[11px] text-slate-400">#{tag.id}</span>
                        {tag.excluida_suma_packout ? (
                          <span
                            className="inline-flex rounded border border-violet-200/90 bg-violet-50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-violet-900"
                            title="Etiqueta unificada de repallet: las cajas no se suman otra vez en el total de producción"
                          >
                            Repallet
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm font-medium text-slate-900">
                      {tagProducerLabel(tag, producerById)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm text-slate-700">
                      {tagVarietyLabel(tag, processById)}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800">{tag.format_code}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium text-slate-900">{tag.total_cajas}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-800">{fmtLbCell(tag.net_weight_lb)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-slate-600" title={tag.items.map((i) => `#${i.process_id}`).join(', ')}>
                      {tagProcessRefLabel(tag)}
                    </TableCell>
                    <TableCell className="min-w-[140px]">
                      <div className="flex flex-col gap-1">
                        <CommercialStatusBadge state={commercialAssignment(tag)} t={t} />
                        <span className="truncate text-[11px] text-slate-500" title={clientLabel(tag)}>
                          {clientLabel(tag)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {tag.es_union_tarjas ? (
                        <span
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                          title="Unión de 2+ tarjas"
                        >
                          {t('ptTag.table.unionYes')}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-600 hover:bg-slate-100">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Acciones</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {canEditTag && (
                              <DropdownMenuItem
                                onClick={() => {
                                  openPtModalForEditRef.current = true;
                                  setEditTag(tag);
                                  setTagOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('ptTag.table.actionEdit')}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => openLineage(tag)}>
                              <Waypoints className="mr-2 h-4 w-4" />
                              {t('ptTag.table.actionTraceability')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void downloadPtPdf(tag, 'detalle')}>
                              <FileDown className="mr-2 h-4 w-4" />
                              {t('ptTag.table.actionPdfDetail')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void downloadPtPdf(tag, 'etiqueta')}>
                              <FileDown className="mr-2 h-4 w-4" />
                              {t('ptTag.table.actionPdfLabel')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void downloadPtTagZpl(tag)}>
                              <FileDown className="mr-2 h-4 w-4" />
                              {t('ptTag.table.actionZpl')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintDialog(tag)}>
                              <Printer className="mr-2 h-4 w-4" />
                              {t('ptTag.table.actionPrint')}
                            </DropdownMenuItem>
                            {canDeleteTag ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteConfirmTag(tag)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t('ptTag.table.actionDelete')}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
        </div>
      )}
      </section>

      <Dialog
        open={detailTag != null}
        onOpenChange={(o) => {
          if (!o) setDetailTag(null);
        }}
      >
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="font-mono text-base">{detailTag?.tag_code}</DialogTitle>
              {detailTag ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                    commercialAssignment(detailTag) === 'none'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                  )}
                >
                  {commercialAssignment(detailTag) === 'none' ? t('ptTag.detail.available') : t('ptTag.detail.assigned')}
                </span>
              ) : null}
            </div>
            <div className="text-left text-sm text-slate-600">
              <span className="font-medium text-slate-800">ID:</span>{' '}
              <span className="font-mono tabular-nums">{detailTag?.id}</span>
              {' · '}
              <span className="font-medium text-slate-800">Código:</span>{' '}
              <span className="font-mono">{detailTag?.tag_code}</span>
            </div>
          </DialogHeader>
          {detailTag && (
            <div className="space-y-4 text-sm">
              <section className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ptTag.detail.sectionProduct')}</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <DetailRow
                    label={t('ptTag.detail.labelProcessOrigin')}
                    value={
                      detailTag.items.length > 0
                        ? `#${detailTag.items[0].process_id} · ${
                            processById.get(detailTag.items[0].process_id)
                              ? new Date(processById.get(detailTag.items[0].process_id)!.fecha_proceso).toLocaleDateString('es')
                              : '—'
                          }`
                        : '—'
                    }
                  />
                  <DetailRow
                    label={t('ptTag.detail.labelLineBoxes')}
                    value={
                      detailTag.items.length > 0
                        ? `${detailTag.items[0].cajas_generadas} · ${t('ptTag.detail.labelBoxesPallets')} ${detailTag.items[0].pallets_generados}`
                        : '—'
                    }
                  />
                  <DetailRow label={t('ptTag.detail.labelProducer')} value={tagProducerLabel(detailTag, producerById)} />
                  <DetailRow label={t('ptTag.detail.labelSpecies')} value={<EspeciesCell items={detailTag.items} processById={processById} />} />
                  <DetailRow label={t('ptTag.detail.labelVariety')} value={<VariedadesCell items={detailTag.items} processById={processById} />} />
                  <DetailRow label={t('ptTag.detail.labelFormat')} value={<span className="font-mono">{detailTag.format_code}</span>} />
                  <DetailRow
                    label={t('ptTag.detail.labelPtType')}
                    value={labelPtProductoPt(
                      RESULTADOS_PT.includes(detailTag.resultado as (typeof RESULTADOS_PT)[number])
                        ? (detailTag.resultado as (typeof RESULTADOS_PT)[number])
                        : 'cajas',
                      t,
                    )}
                  />
                  <DetailRow label={t('ptTag.detail.labelBoxesTotal')} value={String(detailTag.total_cajas)} />
                  <DetailRow label={t('ptTag.detail.labelLb')} value={fmtLbCell(detailTag.net_weight_lb)} />
                </dl>
              </section>

              <section className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ptTag.detail.sectionCommercial')}</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <DetailRow label={t('ptTag.detail.labelClient')} value={clientLabel(detailTag)} />
                  <DetailRow label={t('ptTag.detail.labelBrand')} value={brandLabel(detailTag) ?? '—'} />
                  <DetailRow label={t('ptTag.detail.labelBol')} value={detailTag.bol?.trim() || '—'} />
                  <DetailRow label={t('ptTag.detail.labelPlannedOrder')} value="—" />
                  <DetailRow label={t('ptTag.detail.labelClamshell')} value="—" />
                  <DetailRow label={t('ptTag.detail.labelLabel')} value="—" />
                </dl>
              </section>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => openLineage(detailTag)}>
                  <Waypoints className="mr-1 h-3.5 w-3.5" />
                  {t('ptTag.detail.actionTraceability')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void downloadPtPdf(detailTag, 'detalle')}>
                  <FileDown className="mr-1 h-3.5 w-3.5" />
                  {t('ptTag.detail.actionPdfDetail')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void downloadPtPdf(detailTag, 'etiqueta')}>
                  <FileDown className="mr-1 h-3.5 w-3.5" />
                  {t('ptTag.detail.actionPdfLabel')}
                </Button>
                {canEditTag && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailTag(null);
                      openPtModalForEditRef.current = true;
                      setEditTag(detailTag);
                      setTagOpen(true);
                    }}
                  >
                    {t('ptTag.detail.actionEdit')}
                  </Button>
                )}
                {canDeleteTag ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirmTag(detailTag)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {t('ptTag.detail.actionDelete')}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
              <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailTag(null)}>
              {t('ptTag.detail.closeButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmTag != null}
        onOpenChange={(o) => {
          if (!o) setDeleteConfirmTag(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ptTag.delete.title')}</DialogTitle>
            <DialogDescription>{t('ptTag.delete.description')}</DialogDescription>
          </DialogHeader>
          {deleteConfirmTag ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold text-slate-900">
              {deleteConfirmTag.tag_code}
              <span className="ml-2 font-normal text-slate-500">#{deleteConfirmTag.id}</span>
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmTag(null)}>
                  {t('ptTag.delete.cancelButton')}
                </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteConfirmTag || deletePtTagMut.isPending}
              onClick={() => {
                if (!deleteConfirmTag) return;
                deletePtTagMut.mutate(deleteConfirmTag.id);
              }}
            >
              {deletePtTagMut.isPending ? t('ptTag.delete.deletingButton') : t('ptTag.delete.deleteButton')}
                </Button>
              </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={printTag != null}
        onOpenChange={(o) => {
          if (!o) setPrintTag(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ptTag.print.title')}</DialogTitle>
            <DialogDescription>
              {printTag ? `${printTag.tag_code} — ${printTag.format_code}` : t('ptTag.print.title')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>{t('ptTag.print.labelTypeLabel')}</Label>
              <select
                className={filterSelectClass}
                value={printTemplate}
                onChange={(e) => setPrintTemplate(e.target.value as TarjaLabelTemplate)}
              >
                {tarjaPrintTemplateChoices.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {tarjaPrintTemplateChoices.find((t) => t.id === printTemplate)?.description}
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={printRememberTemplate}
                  onChange={(e) => setPrintRememberTemplate(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {t('ptTag.print.rememberTemplate')}
              </label>
            </div>
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="mb-0">{t('ptTag.print.printerLabel')}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs text-slate-600"
                  disabled={probingPrintService}
                  onClick={() => void refreshPrintServiceStatus()}
                >
                  {probingPrintService ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {t('ptTag.print.refreshButton')}
                </Button>
              </div>
              {localServiceState === 'idle' && probingPrintService ? (
                <p className="text-xs text-slate-500">{t('ptTag.print.searching')}</p>
              ) : null}
              {localServiceState === 'ok' &&
              zebraPrinterList.length > 1 &&
              !showAllPrinters ? (
              <div className="grid gap-2">
                  <div className="flex gap-2.5 rounded-lg border border-emerald-200/90 bg-emerald-50 px-3 py-2.5">
                    <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-emerald-950">{t('ptTag.print.readyTitle')}</p>
                      <p className="text-xs text-emerald-700">
                        {t('ptTag.print.printerCount', { count: zebraPrinterList.length })}
                      </p>
              </div>
                  </div>
                  <select
                    className={filterSelectClass}
                    value={printPrinterName}
                    onChange={(e) => setPrintPrinterName(e.target.value)}
                  >
                    {zebraPrinterList.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                        {p.isDefault ? ` ${t('ptTag.print.defaultSuffix')}` : ''}
                        {localPrintService?.printer === p.name ? ` ${t('ptTag.print.suggestedSuffix')}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="w-fit text-left text-xs font-medium text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-900"
                    onClick={() => setShowAllPrinters(true)}
                  >
                    {t('ptTag.print.showAll')}
                  </button>
                </div>
              ) : null}
              {localServiceState === 'ok' &&
              zebraPrinterList.length === 1 &&
              !showAllPrinters ? (
                <div className="flex gap-2.5 rounded-lg border border-emerald-200/90 bg-emerald-50 px-3 py-2.5">
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-950">{t('ptTag.print.readyTitle')}</p>
                    <p className="truncate text-sm text-emerald-900" title={zebraPrinterList[0].name}>
                      {zebraPrinterList[0].name}
                    </p>
                    {printServiceSourceLabel(localPrintService?.source) ? (
                      <p className="mt-0.5 text-xs text-emerald-700">
                        {printServiceSourceLabel(localPrintService?.source)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {localServiceState === 'no_printer' ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-snug text-rose-950">
                  <p className="font-medium">{t('ptTag.print.noZebra')}</p>
                  <p className="mt-1 text-xs text-rose-800">{localServiceMessage}</p>
                  {localPrintService?.available_printers && localPrintService.available_printers.length > 0 ? (
                    <ul className="mt-2 max-h-28 list-inside list-disc overflow-y-auto space-y-0.5 text-xs text-rose-900/90">
                      {localPrintService.available_printers.map((name) => (
                        <li key={name} className="truncate" title={name}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {localServiceState === 'ok' &&
              zebraPrinterList.length === 0 &&
              !localPrintService?.printer &&
              !showAllPrinters ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800">
                  {t('ptTag.print.noZebraFallback')}{' '}
                  <button
                    type="button"
                    className="font-medium text-sky-700 underline decoration-sky-700/50 underline-offset-2 hover:text-sky-800"
                    onClick={() => setShowAllPrinters(true)}
                  >
                    {t('ptTag.print.showAllPrinters')}
                  </button>
                </div>
              ) : null}
              {localServiceState === 'ok' && showAllPrinters ? (
                <>
                  <select
                    className={filterSelectClass}
                    value={printPrinterName}
                    onChange={(e) => setPrintPrinterName(e.target.value)}
                    disabled={localServiceState !== 'ok'}
                  >
                    <option value="">
                      {showAllPrinters ? t('ptTag.print.defaultPrinter') : t('ptTag.print.autoPrinter')}
                    </option>
                    {(showAllPrinters ? localPrinters : zebraPrinterList).map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                        {p.isDefault ? ` ${t('ptTag.print.defaultSuffix')}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="w-fit text-left text-xs font-medium text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-900"
                    onClick={() =>
                      setShowAllPrinters((v) => {
                        const next = !v;
                        if (!next && printPrinterName && !zebraPrinterList.some((z) => z.name === printPrinterName)) {
                          setPrintPrinterName(
                            suggestPrinterNameForTarjaPrint({
                              printers: zebraPrinterList.length > 0 ? zebraPrinterList : localPrinters,
                              defaultPrinter: localDefaultPrinter,
                              envPreferredPrinter: getConfiguredZebraPrinterName(),
                            }),
                          );
                        }
                        return next;
                      })
                    }
                  >
                    {showAllPrinters ? t('ptTag.print.showZebraOnly') : t('ptTag.print.showAllPrinters')}
                  </button>
                </>
              ) : null}
              {localServiceState === 'ok' ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={printRememberPrinter}
                    onChange={(e) => setPrintRememberPrinter(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t('ptTag.print.rememberPrinter')}
                </label>
              ) : null}
              {localServiceState === 'unavailable' || localServiceState === 'error' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                  <p className="font-medium">{t('ptTag.print.serviceUnavailableTitle')}</p>
                  <p className="mt-1 text-xs leading-snug text-amber-900">
                    {t('ptTag.print.serviceUnavailableDesc')}
                  </p>
                  {localServiceMessage ? (
                    <p className="mt-2 border-t border-amber-200/80 pt-2 text-[11px] leading-snug text-amber-950/90">
                      {localServiceMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>{t('ptTag.print.copiesLabel')}</Label>
              <Input
                type="number"
                min={1}
                max={99}
                className={filterInputClass}
                value={printCopies}
                onChange={(e) => setPrintCopies(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
              />
              <p className="text-xs text-slate-500">
                {t('ptTag.print.copiesHint')}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={!printTag}
              onClick={() => {
                if (!printTag) return;
                void downloadPtTagZpl(printTag, printTemplate);
              }}
            >
              {t('ptTag.print.downloadZpl')}
                </Button>
            <Button
              type="button"
              disabled={!printTag || printingTag || !canPrintToLocalService}
              title={!canPrintToLocalService ? 'Sin impresora Zebra detectada en el servicio local' : undefined}
              onClick={() => {
                if (!printTag || !canPrintToLocalService) return;
                setPrintingTag(true);
                const zebraOnlyMode = !showAllPrinters && zebraPrinterList.length > 0;
                const resolvedPrinter =
                  resolvePrinterForLocalJob({
                    selectedName: printPrinterName,
                    allPrinters: localPrinters,
                    zebraOnlyMode,
                    defaultPrinter: localDefaultPrinter,
                    envPreferredPrinter: getConfiguredZebraPrinterName(),
                  }) ||
                  localPrintService?.printer?.trim() ||
                  '';
                saveLastPrintPayload({
                  tarjaId: printTag.id,
                  template: printTemplate,
                  printerName: printRememberPrinter ? (printPrinterName.trim() || undefined) : undefined,
                  copies: printCopies,
                  rememberPrinter: printRememberPrinter,
                  rememberTemplate: printRememberTemplate,
                });
                void printPtTagLabel(printTag, {
                  template: printTemplate,
                  printerName: resolvedPrinter,
                  copies: printCopies,
                }).finally(() => setPrintingTag(false));
              }}
            >
              {printingTag ? t('ptTag.print.printingButton') : t('ptTag.print.printButton')}
                </Button>
              </DialogFooter>
          {loadLastPrintPayload() != null ? (
            <button
              type="button"
              className="-mt-2 w-full px-6 text-center text-xs font-medium text-sky-700 underline decoration-sky-700/35 underline-offset-2 hover:text-sky-900"
              onClick={() => void reprintLastPtTagPayload()}
            >
              {t('ptTag.print.reprintLast')}
            </button>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={lineageOpen}
        onOpenChange={(o) => {
          setLineageOpen(o);
          if (!o) setLineageData(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('ptTag.lineage.titlePrefix')}
              {lineageData?.tarja_id}
            </DialogTitle>
          </DialogHeader>
          {lineageData && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">{t('ptTag.lineage.originsTitle')}</p>
                {lineageData.ancestors.length === 0 ? (
                  <p className="text-muted-foreground">{t('ptTag.lineage.noOrigins')}</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {lineageData.ancestors.map((a) => (
                      <li key={`${a.tarja_id}-${a.relation}`}>
                        {t('ptTag.lineage.unitPrefix')}
                        {a.tarja_id} · {a.relation}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-medium">{t('ptTag.lineage.derivedTitle')}</p>
                {lineageData.descendants.length === 0 ? (
                  <p className="text-muted-foreground">{t('ptTag.lineage.noDerived')}</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {lineageData.descendants.map((a) => (
                      <li key={`${a.tarja_id}-${a.relation}`}>
                        {t('ptTag.lineage.unitPrefix')}
                        {a.tarja_id} · {a.relation}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLineageOpen(false)}>
              {t('ptTag.lineage.closeButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function DetailRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function EspeciesCell({
  items,
  processById,
}: {
  items: PtTagItemApi[];
  processById: Map<number, FruitProcessRow>;
}) {
  const names = [
    ...new Set(
      items
        .map((it) => processById.get(it.process_id)?.especie_nombre)
        .filter((x): x is string => !!x && x.trim() !== ''),
    ),
  ];
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return names.join(' · ');
}

function VariedadesCell({
  items,
  processById,
}: {
  items: PtTagItemApi[];
  processById: Map<number, FruitProcessRow>;
}) {
  const names = [
    ...new Set(
      items
        .map((it) => processById.get(it.process_id)?.variedad_nombre)
        .filter((x): x is string => !!x && x.trim() !== ''),
    ),
  ];
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return names.join(' · ');
}

