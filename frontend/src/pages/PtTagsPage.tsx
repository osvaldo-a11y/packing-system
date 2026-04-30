import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clipboard,
  ChevronDown,
  FileDown,
  Info,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson, downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatLb } from '@/lib/number-format';
import { downloadZplFile, fetchTarjaZpl, printTarjaZplOrDownload } from '@/lib/tarja-zpl-print';
import {
  contentCard,
  emptyStatePanel,
  filterInputClass,
  filterPanel,
  filterSelectClass,
  kpiCard,
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
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import type { FruitProcessRow } from './ProcessesPage';

/** Unidad PT = producto físico (pallet); solo destinos de producto terminado. */
const RESULTADOS_PT = ['cajas', 'IQF'] as const;

function labelPtProductoPt(r: (typeof RESULTADOS_PT)[number]) {
  if (r === 'cajas') return 'Cajas (producto terminado)';
  return 'IQF (producto terminado)';
}

function labelProcesoEstadoParaSelector(p: FruitProcessRow) {
  const st = p.process_status ?? 'borrador';
  if (st === 'borrador') return 'borrador';
  if (st === 'confirmado') return 'confirmado';
  return st;
}
const FORMAT_CODE_RE = /^(\d+)x(\d+)oz$/i;
const FORMAT_ALIAS_RE = /^pinta\s+(regular|low\s+profile)$/i;

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const createTagSchema = z.object({
  process_id: z.coerce.number().int().positive({ message: 'Elegí un proceso origen' }),
  fecha: z.string().min(1, 'Requerido'),
  resultado: z.enum(RESULTADOS_PT),
  format_code: z
    .string()
    .min(1)
    .refine((s) => FORMAT_CODE_RE.test(s) || FORMAT_ALIAS_RE.test(s), {
      message: 'Usá NxMoz (ej. 4x16oz) o PINTA REGULAR / PINTA LOW PROFILE',
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

/** Misma regla que Σ packout en proceso: no duplicar cajas de la tarja solo-etiqueta de repallet. */
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

type FormatBreakdownRow = { format: string; cajas: number };

type EndOfDayClientRow = {
  label: string;
  packed: FormatBreakdownRow[];
  cooler: FormatBreakdownRow[];
  shipped: FormatBreakdownRow[];
};

/** Clave estable para agrupar formatos (mayúsc/minus/ espacios). */
function normFormatKey(raw: string): string {
  const t = raw.trim();
  return t ? t.toLowerCase() : '—';
}

/** Título legible si no hay maestro (entrada ya en minúsculas salvo '—'). */
function titleCaseFormatFallback(normKey: string): string {
  if (normKey === '—') return '—';
  if (normKey === 'sin formato') return 'Sin formato';
  return normKey
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function mergeFormatIntoMap(target: Map<string, number>, rawFormat: string, cajas: number) {
  const nk = normFormatKey(rawFormat);
  target.set(nk, (target.get(nk) ?? 0) + cajas);
}

function mapToSortedBreakdown(
  m: Map<string, number>,
  canonicalByNorm: Map<string, string>,
): FormatBreakdownRow[] {
  return [...m.entries()]
    .filter(([, cajas]) => cajas > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nk, cajas]) => {
      const format =
        nk === '—'
          ? '—'
          : (canonicalByNorm.get(nk) ?? titleCaseFormatFallback(nk));
      return { format, cajas };
    });
}

function subtractFormatMaps(base: Map<string, number>, discount: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of base) {
    const next = v - (discount.get(k) ?? 0);
    if (next > 0) out.set(k, next);
  }
  return out;
}

function shippedCajasByFormat(
  d: DispatchDayRow,
  formatByTarjaId: Map<number, string>,
): Map<string, number> {
  const out = new Map<string, number>();
  const invLines = d.invoice?.lines;
  if (invLines && invLines.length > 0) {
    for (const li of invLines) {
      const cajas = Number(li.cajas) || 0;
      if (cajas <= 0) continue;
      let fc = (li.packaging_code ?? '').trim();
      if (!fc && li.tarja_id != null && Number(li.tarja_id) > 0) {
        fc = formatByTarjaId.get(Number(li.tarja_id)) ?? '';
      }
      mergeFormatIntoMap(out, fc || 'sin formato', cajas);
    }
    return out;
  }
  for (const it of d.items ?? []) {
    const cajas = Number(it.cajas_despachadas ?? it.cajas ?? 0);
    if (cajas <= 0) continue;
    const tid = Number(it.tarja_id);
    const fc =
      Number.isFinite(tid) && tid > 0 ? formatByTarjaId.get(tid) ?? 'sin formato' : 'sin formato';
    mergeFormatIntoMap(out, fc, cajas);
  }
  return out;
}

function totalCajasFromFormatMap(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

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

function OperationalTagBadge({ tag }: { tag: PtTagApi }) {
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
      {ok ? 'Disponible' : 'Sin cajas'}
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

function CommercialStatusBadge({ state }: { state: CommercialAssignment }) {
  const meta = {
    none: {
      label: 'Sin asignación',
      title: 'Esta unidad aún no tiene destino comercial definido (cliente previsto).',
      className: 'border-rose-200/90 bg-rose-50 text-rose-900',
    },
    partial: {
      label: 'Parcial',
      title:
        'Cliente previsto cargado; conviene completar marca o BOL/referencia para cerrar la asignación operativa.',
      className: 'border-amber-200/90 bg-amber-50 text-amber-950',
    },
    full: {
      label: 'Asignado',
      title: 'Destino comercial indicado: cliente y marca o BOL/referencia.',
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const canEditTag = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [tagOpen, setTagOpen] = useState(false);
  const [bulkCreateProgress, setBulkCreateProgress] = useState<{ cur: number; total: number } | null>(null);
  const [editTag, setEditTag] = useState<PtTagApi | null>(null);
  const [search, setSearch] = useState('');
  const [lineageOpen, setLineageOpen] = useState(false);
  const [lineageData, setLineageData] = useState<TagLineageApi | null>(null);
  const [detailTag, setDetailTag] = useState<PtTagApi | null>(null);
  const prevTagOpenRef = useRef(false);
  /** Evita condición de carrera: al abrir con el trigger «Nueva», Radix llama onOpenChange(true) antes que setEditTag(null) del botón y el modal quedaba en modo edición. */
  const openPtModalForEditRef = useRef(false);

  const [filterProducer, setFilterProducer] = useState(0);
  const [filterFormat, setFilterFormat] = useState('');
  const [filterClient, setFilterClient] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState<'todas' | 'disponible' | 'sin_cajas'>('todas');
  const [opsDayKey, setOpsDayKey] = useState<string>(() => toLocalDayKey(new Date()));

  const { data: tags, isPending, isError, error } = useQuery({
    queryKey: ['pt-tags'],
    queryFn: fetchPtTags,
  });

  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: fetchProcesses,
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

  const formatMeta = useMemo(() => {
    const m = new Map<string, { descripcion: string | null }>();
    for (const f of presFormats ?? []) {
      m.set(f.format_code.trim().toLowerCase(), { descripcion: f.descripcion ?? null });
    }
    return m;
  }, [presFormats]);

  /** Un solo texto por formato: mismo código que en maestros (primera variante guardada). */
  const formatCanonicalByNorm = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of presFormats ?? []) {
      const code = f.format_code.trim();
      if (!code) continue;
      const nk = code.toLowerCase();
      if (!m.has(nk)) m.set(nk, code);
    }
    return m;
  }, [presFormats]);

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
  }, [tags, search, filterProducer, filterFormat, filterClient, filterEstado]);

  const formatByTarjaId = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of tags ?? []) {
      m.set(t.id, (t.format_code ?? '').trim() || '—');
    }
    return m;
  }, [tags]);

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

  const operationalDaily = useMemo(() => {
    const tagList = tags ?? [];
    let packedToday = 0;
    for (const t of tagList) {
      if (toLocalDayKey(t.fecha) !== opsDayKey) continue;
      if (!countsTowardPtProductionTotals(t)) continue;
      packedToday += t.total_cajas;
    }
    let shippedToday = 0;
    for (const d of dispatchesList ?? []) {
      const ts = d.despachado_at || d.fecha_despacho;
      if (toLocalDayKey(ts) !== opsDayKey) continue;
      if (d.status && d.status !== 'despachado') continue;
      shippedToday += totalCajasFromFormatMap(shippedCajasByFormat(d, formatByTarjaId));
    }
    const coolerBoxes = Math.max(0, packedToday - shippedToday);
    const pendingLb = (processes ?? []).reduce((s, p) => {
      const st = p.process_status ?? 'borrador';
      if (st === 'cerrado') return s;
      const lb = Number(p.lb_pt_restante);
      return s + (Number.isFinite(lb) && lb > 0 ? lb : 0);
    }, 0);
    return { packedToday, coolerBoxes, shippedToday, pendingLb };
  }, [tags, dispatchesList, processes, formatByTarjaId, opsDayKey]);

  const endOfDayByClient = useMemo((): EndOfDayClientRow[] => {
    type Agg = { label: string; packed: Map<string, number>; cooler: Map<string, number>; shipped: Map<string, number> };
    const clientMap = new Map<string, Agg>();

    function keyForClient(id: number | null | undefined, nombre: string | null | undefined): string {
      if (id != null && Number(id) > 0) return `id:${id}`;
      const n = (nombre ?? '').trim();
      return n ? `n:${n.toUpperCase()}` : 'n:SIN CLIENTE';
    }

    function labelFor(key: string, nombre: string | null | undefined) {
      if (key.startsWith('id:')) {
        const id = Number(key.slice(3));
        const c = (commercialClients ?? []).find((x) => x.id === id);
        return (c?.nombre ?? nombre ?? `Cliente #${id}`).trim().toUpperCase();
      }
      return (nombre ?? 'SIN CLIENTE').trim().toUpperCase() || 'SIN CLIENTE';
    }

    const ensure = (key: string, nombre: string | null | undefined) => {
      const cur = clientMap.get(key);
      if (cur) return cur;
      const a: Agg = {
        label: labelFor(key, nombre),
        packed: new Map(),
        cooler: new Map(),
        shipped: new Map(),
      };
      clientMap.set(key, a);
      return a;
    };

    for (const t of tags ?? []) {
      if (toLocalDayKey(t.fecha) !== opsDayKey) continue;
      if (!countsTowardPtProductionTotals(t)) continue;
      const cid = t.client_id != null ? Number(t.client_id) : 0;
      const cn = cid > 0 ? (commercialClients ?? []).find((c) => c.id === cid)?.nombre ?? null : null;
      const key = keyForClient(cid > 0 ? cid : null, cn);
      const cell = ensure(key, cn);
      const fc = (t.format_code ?? '').trim() || '—';
      mergeFormatIntoMap(cell.packed, fc, t.total_cajas);
    }

    for (const d of dispatchesList ?? []) {
      const ts = d.despachado_at || d.fecha_despacho;
      if (toLocalDayKey(ts) !== opsDayKey) continue;
      if (d.status && d.status !== 'despachado') continue;
      const nombre = (d.client_nombre ?? d.cliente_nombre ?? '').trim();
      const cid = d.client_id != null ? Number(d.client_id) : 0;
      const key = keyForClient(cid > 0 ? cid : null, nombre || null);
      const cell = ensure(key, nombre || null);
      const byF = shippedCajasByFormat(d, formatByTarjaId);
      for (const [fc, cajas] of byF) {
        mergeFormatIntoMap(cell.shipped, fc, cajas);
      }
    }

    for (const a of clientMap.values()) {
      a.cooler = subtractFormatMaps(a.packed, a.shipped);
    }

    return [...clientMap.values()]
      .map((a) => ({
        label: a.label,
        packed: mapToSortedBreakdown(a.packed, formatCanonicalByNorm),
        cooler: mapToSortedBreakdown(a.cooler, formatCanonicalByNorm),
        shipped: mapToSortedBreakdown(a.shipped, formatCanonicalByNorm),
      }))
      .filter((r) => r.packed.length + r.cooler.length + r.shipped.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tags, dispatchesList, commercialClients, formatByTarjaId, formatCanonicalByNorm, opsDayKey]);

  const endOfDayPlainText = useMemo(() => {
    function linesFor(prefix: string, rows: FormatBreakdownRow[]): string[] {
      return rows.map((row) => `${prefix}: ${row.cajas} · ${row.format}`);
    }
    const blocks = endOfDayByClient.map((r) => {
      const inner = [
        r.label,
        ...linesFor('Packed', r.packed),
        ...linesFor('Cooler', r.cooler),
        ...linesFor('Shipped', r.shipped),
      ];
      return inner.join('\n');
    });
    return blocks.join('\n\n');
  }, [endOfDayByClient]);

  const pendingCajasEst = useMemo(() => {
    const vals = activePresFormats
      .map((f) => Number(f.net_weight_lb_per_box))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg <= 0) return null;
    const lb = operationalDaily.pendingLb;
    if (lb <= 0) return null;
    return Math.round(lb / avg);
  }, [activePresFormats, operationalDaily.pendingLb]);

  const openTagIdFromUrl = Number(searchParams.get('open') || '') || null;

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

  const unassignedPtCount = useMemo(
    () => (tags ?? []).filter((t) => commercialAssignment(t) === 'none').length,
    [tags],
  );

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

  const selectedPresFormat = useMemo(() => {
    const fc = watchedTagFormatCode?.trim().toLowerCase() ?? '';
    return (presFormats ?? []).find((f) => f.format_code.trim().toLowerCase() === fc);
  }, [presFormats, watchedTagFormatCode]);

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
  /** Tope de cajas para esta unidad: usa lb restante para PT (entrada − ya cargado en otras tarjas), no la entrada bruta. */
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
    tagForm.setValue('cajas_generadas', maxCajasDesdeProcesoCreate, { shouldValidate: true });
  }, [tagOpen, editTag, createProcessId, watchedTagFormatCode, maxCajasDesdeProcesoCreate, tagForm]);

  /** Cajas por pallet físico: solo desde mantenedor (formato); el POST/PUT sigue enviando el valor numérico. */
  useEffect(() => {
    if (!tagOpen) return;
    const fc = watchedTagFormatCode?.trim().toLowerCase() ?? '';
    const fmt = (presFormats ?? []).find((f) => f.format_code.trim().toLowerCase() === fc);
    const max = fmt?.max_boxes_per_pallet != null ? Number(fmt.max_boxes_per_pallet) : NaN;
    const v = Number.isFinite(max) && max >= 1 ? max : 1;
    tagForm.setValue('cajas_por_pallet', v, { shouldValidate: true });
  }, [tagOpen, watchedTagFormatCode, presFormats, tagForm]);

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
        ...(body.client_id != null && body.client_id > 0 ? { client_id: body.client_id } : {}),
        ...(body.brand_id != null && body.brand_id > 0 ? { brand_id: body.brand_id } : {}),
        ...(body.bol?.trim() ? { bol: body.bol.trim() } : {}),
      };
      const itemPayload = { process_id: body.process_id, cajas_generadas: cajas };
      let created = 0;
      try {
        for (let i = 0; i < bulk; i++) {
          setBulkCreateProgress({ cur: i + 1, total: bulk });
          try {
            const tag = await apiJson<PtTagApi>('/api/pt-tags', {
              method: 'POST',
              body: JSON.stringify(basePayload),
            });
            await apiJson(`/api/pt-tags/${tag.id}/items`, {
              method: 'POST',
              body: JSON.stringify(itemPayload),
            });
            created += 1;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            throw new Error(
              created > 0
                ? `Se crearon ${created} de ${bulk} unidades. Falló la ${created + 1}.ª: ${msg}`
                : msg,
            );
          }
        }
      } finally {
        setBulkCreateProgress(null);
      }
      return { bulk, created };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      if (data.created > 1) {
        toast.success(`${data.created} unidades PT creadas y vinculadas al proceso`);
      } else {
        toast.success('Unidad PT creada y vinculada al proceso');
      }
      setTagOpen(false);
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
      toast.success('Unidad PT actualizada');
      setEditTag(null);
      setTagOpen(false);
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
    const name =
      variant === 'etiqueta' ? `unidad-pt-${tag.id}-etiqueta.pdf` : `unidad-pt-${tag.id}-detalle.pdf`;
    try {
      await downloadPdf(`/api/documents/pt-tags/${tag.id}/pdf${q}`, name);
      toast.success(variant === 'etiqueta' ? 'PDF etiqueta Unidad PT descargado' : 'PDF detalle / trazabilidad descargado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error PDF');
    }
  }

  async function printPtTagLabel(tag: PtTagApi) {
    try {
      const result = await printTarjaZplOrDownload(tag.id, { template: 'standard', copies: 1 });
      if (result.mode === 'sent_to_local_service') {
        toast.success(
          `Etiqueta enviada${result.printer ? ` a ${result.printer}` : ''}${result.jobId ? ` · job ${result.jobId}` : ''}`,
        );
        return;
      }
      toast.info('Servicio local no disponible; se descargó ZPL para imprimir manualmente.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo imprimir etiqueta');
    }
  }

  async function downloadPtTagZpl(tag: PtTagApi) {
    try {
      const zpl = await fetchTarjaZpl(tag.id, 'standard');
      downloadZplFile(`unidad-pt-${tag.id}.zpl`, zpl);
      toast.success('Archivo ZPL descargado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar ZPL');
    }
  }

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
    return (
      <div className="font-inter">
        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 px-5 py-4 text-sm text-rose-900">
          <p className="font-semibold">Error al cargar unidades PT</p>
          <p className="mt-1 text-rose-800/90">{error instanceof Error ? error.message : 'Reintentá más tarde.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-inter space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className={pageTitle}>Unidad PT</h1>
            <button
              type="button"
              className={pageInfoButton}
              title="Alta de tarja TAR-… y vínculo a proceso; genera pallet PF-… y stock en Existencias PT. Flujo: repalet, packing lists, BOL, despacho."
              aria-label="Ayuda Unidad PT"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className={pageSubtitle}>Tarjas, formato y vínculo al proceso de fruta.</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
                Nueva unidad PT
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[min(92vh,900px)] w-full max-w-[min(1100px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]">
              <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-6 pb-3.5 pt-5 pr-14 text-left">
                <DialogTitle className="text-lg">{editTag ? `Editar ${editTag.tag_code}` : 'Nueva unidad PT'}</DialogTitle>
                <DialogDescription className="text-pretty text-[13px] leading-snug text-muted-foreground">
                  {editTag ? (
                    <>
                      Cambiá fecha, tipo, formato, proceso y cajas (una sola línea) o datos comerciales. Unidades unidas: no se editan líneas
                      aquí.
                    </>
                  ) : (
                    <>
                      Crear nueva unidad de producto terminado. Definí formato, origen y cantidad. El sistema calcula el resto automáticamente.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={tagForm.handleSubmit((v) => {
                  if (editTag) {
                    const hasDest =
                      (v.client_id ?? 0) > 0 || !!(v.bol?.trim()) || (v.brand_id ?? 0) > 0;
                    if (!hasDest) {
                      toast.warning('Se recomienda asignar destino comercial (cliente, BOL o referencia) para trazabilidad.');
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
                    toast.warning('Se recomienda asignar destino comercial (cliente, BOL o referencia) para trazabilidad.');
                  }
                  createTagMut.mutate(v);
                })}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-4">
                    {/* 1 · Formato */}
                    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                          1
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Formato</h3>
                      </div>
                      <div className="grid gap-3.5 lg:grid-cols-2 lg:items-start">
                        <div className="grid gap-1.5">
                          <Label className="text-xs" htmlFor="tag-fecha">
                            Fecha
                          </Label>
                          <Input id="tag-fecha" type="datetime-local" className="h-9" {...tagForm.register('fecha')} />
                          {tagForm.formState.errors.fecha && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.fecha.message}</p>
                          )}
                        </div>
                        <div className="grid gap-1.5 rounded-lg border border-border/50 bg-muted/15 px-2.5 py-2">
                          <Label className="text-[11px] font-normal text-muted-foreground">Tipo de producto PT</Label>
                          <select
                            className="flex min-h-8 w-full rounded border-0 bg-transparent px-0 py-0.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
                            {...tagForm.register('resultado')}
                          >
                            {RESULTADOS_PT.map((r) => (
                              <option key={r} value={r}>
                                {labelPtProductoPt(r)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1.5 lg:col-span-2">
                          <Label className="text-xs" htmlFor="format_code">
                            Formato de presentación *
                          </Label>
                          {activePresFormats.length > 0 ? (
                            <select
                              id="format_code"
                              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={tagForm.watch('format_code')}
                              onChange={(e) => tagForm.setValue('format_code', e.target.value, { shouldValidate: true })}
                            >
                              {activePresFormats.map((f) => (
                                <option key={f.id} value={f.format_code}>
                                  {f.format_code}
                                  {f.descripcion ? ` — ${f.descripcion}` : ''}
                                  {f.net_weight_lb_per_box != null ? ` · ${f.net_weight_lb_per_box} lb/caja` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              placeholder="NxMoz (ej. 4x16oz) o PINTA REGULAR / PINTA LOW PROFILE"
                              {...tagForm.register('format_code')}
                            />
                          )}
                          {tagForm.formState.errors.format_code && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.format_code.message}</p>
                          )}
                          <p className="leading-tight text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/75">Cajas/pallet (maestro):</span>{' '}
                            <span className="tabular-nums font-semibold text-foreground/90">{tagForm.watch('cajas_por_pallet')}</span>
                            {selectedPresFormat?.max_boxes_per_pallet == null ? ' · sin tope en formato (se usa 1)' : null} ·{' '}
                            <span className="font-mono text-foreground/70">{watchedTagFormatCode || '—'}</span>
                          </p>
                          {tagForm.formState.errors.cajas_por_pallet && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.cajas_por_pallet.message}</p>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* 2 · Proceso origen */}
                    <section className="rounded-xl border border-border bg-muted/15 p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                          2
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Proceso origen</h3>
                      </div>
                      <div className="grid gap-3">
                        <div className="grid gap-1.5">
                          <Label className="text-xs" htmlFor="tag-process">
                            Proceso *
                          </Label>
                          <select
                            id="tag-process"
                            disabled={!!editTag && editTag.items.length > 1}
                            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                            {...tagForm.register('process_id', { valueAsNumber: true })}
                          >
                            <option value={0}>Elegir proceso…</option>
                            {(editTag
                              ? editTag.items.length > 1
                                ? processesForTagModal
                                : processesForEditSelect
                              : availableProcesses
                            ).map((p) => (
                              <option key={p.id} value={p.id}>
                                [{labelProcesoEstadoParaSelector(p)}] #{p.id} · {p.variedad_nombre ?? '—'} · entrada{' '}
                                {fmtLbCell(p.lb_entrada ?? p.peso_procesado_lb)}
                                {p.lb_pt_restante != null && String(p.lb_pt_restante).trim() !== ''
                                  ? ` · restante PT ${fmtLbCell(p.lb_pt_restante)}`
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
                            Varias líneas de proceso: no se editan aquí.
                          </p>
                        ) : null}
                        {!editTag && availableProcesses.length === 0 ? (
                          <p className="text-xs leading-snug text-amber-800 dark:text-amber-200">
                            No hay procesos disponibles (borrador/confirmado con lb para PT).
                          </p>
                        ) : null}

                        {selectedProcForCreate && (editTag ? editTag.items.length === 1 : true) ? (
                          <div className="space-y-2">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-transparent px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Lb disponibles (PT)</p>
                                <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground">
                                  {selectedProcForCreate.lb_pt_restante != null &&
                                  String(selectedProcForCreate.lb_pt_restante).trim() !== ''
                                    ? fmtLbCell(selectedProcForCreate.lb_pt_restante)
                                    : fmtLbCell(selectedProcForCreate.lb_entrada ?? selectedProcForCreate.peso_procesado_lb)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-transparent px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                                  Cajas sugeridas (tope)
                                </p>
                                <p className="mt-0.5 flex items-baseline gap-1.5 text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground">
                                  {maxCajasDesdeProcesoCreate != null ? (
                                    <>
                                      {maxCajasDesdeProcesoCreate}
                                      <span className="text-sm font-semibold text-muted-foreground">cajas</span>
                                    </>
                                  ) : (
                                    <span className="text-lg font-normal text-muted-foreground">—</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <p className="text-[10px] leading-tight text-muted-foreground">
                              {editTag && editTag.items.length === 1
                                ? 'Incluye lb ya cargados en otras tarjas; el servidor valida el tope.'
                                : 'Si hay más unidades PT con este proceso, el restante se actualiza al guardar.'}
                            </p>
                            {procesoVsTopeHint ? (
                              <div
                                className={cn(
                                  'rounded-md border-l-[3px] px-2.5 py-2 text-[11px] leading-snug',
                                  procesoVsTopeHint.tone === 'danger' &&
                                    'border-l-rose-500 bg-rose-50 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100',
                                  procesoVsTopeHint.tone === 'tight' &&
                                    'border-l-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
                                  procesoVsTopeHint.tone === 'close' &&
                                    'border-l-orange-400 bg-orange-50/90 text-orange-950 dark:bg-orange-950/25 dark:text-orange-100',
                                  procesoVsTopeHint.tone === 'ok' &&
                                    'border-l-emerald-600 bg-emerald-50/80 text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-100',
                                )}
                              >
                                <p className="font-semibold">{procesoVsTopeHint.label}</p>
                                <p className="mt-0.5 opacity-90">{procesoVsTopeHint.detail}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {/* 3 · Cantidad (cajas) */}
                    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                          3
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Cantidad</h3>
                      </div>
                      <div className="grid max-w-md gap-2">
                        <Label htmlFor="cajas_generadas" className="text-xs font-medium">
                          Cajas a cargar *
                        </Label>
                        <Input
                          id="cajas_generadas"
                          type="number"
                          min={1}
                          max={maxCajasDesdeProcesoCreate ?? undefined}
                          step={1}
                          disabled={!!editTag && editTag.items.length > 1}
                          className={cn(
                            'h-12 rounded-lg border-input text-center text-xl font-semibold tabular-nums tracking-tight',
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
                            Máximo sugerido según proceso:{' '}
                            <span className="font-semibold text-foreground">{maxCajasDesdeProcesoCreate}</span> cajas
                          </p>
                        ) : null}
                        {editTag && editTag.items.length > 1 ? (
                          <p className="text-[11px] leading-tight text-muted-foreground">Varias líneas; no se edita aquí.</p>
                        ) : editTag ? (
                          <p className="text-[11px] leading-tight text-muted-foreground">Validación en servidor (lb / packout).</p>
                        ) : null}
                        {tagForm.formState.errors.cajas_generadas ? (
                          <p className="text-xs text-destructive">{tagForm.formState.errors.cajas_generadas.message}</p>
                        ) : null}
                      </div>
                    </section>

                    {/* 4 · Comercial (opcional) */}
                    <section className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Comercial</span>
                        <span className="text-[10px] text-muted-foreground/80">opcional</span>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-muted-foreground">Cliente</Label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input/80 bg-background px-2 py-1 text-xs"
                            {...tagForm.register('client_id', { valueAsNumber: true })}
                          >
                            <option value={0}>Sin definir</option>
                            {(commercialClients ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.codigo} — {c.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-muted-foreground">Marca</Label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input/80 bg-background px-2 py-1 text-xs"
                            {...tagForm.register('brand_id', { valueAsNumber: true })}
                          >
                            <option value={0}>Sin definir</option>
                            {(brandsForTagClient ?? []).map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.codigo} — {b.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1 sm:col-span-2">
                          <Label htmlFor="tag-bol-prev" className="text-[11px] text-muted-foreground">
                            Referencia / BOL prevista
                          </Label>
                          <Input
                            id="tag-bol-prev"
                            placeholder="Opcional"
                            className="h-9 rounded-md text-xs"
                            {...tagForm.register('bol')}
                          />
                        </div>
                      </div>
                    </section>

                    {/* 5 · Varias unidades (solo alta; peso bajo) */}
                    {!editTag && (
                      <section className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3">
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">Varias unidades a la vez</span>
                          <span className="text-[10px] text-muted-foreground/90">Mismo dato que arriba · secuencial</span>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="grid w-[120px] gap-1">
                            <Label htmlFor="tag-bulk-units" className="text-[11px] text-muted-foreground">
                              Unidades idénticas
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
                          </div>
                          {tagForm.formState.errors.bulk_units && (
                            <p className="text-xs text-destructive">{tagForm.formState.errors.bulk_units.message}</p>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Lectura mantenedor: colapsable */}
                    <details className="group rounded-lg border border-border/60 bg-muted/15 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/30">
                        <span>Mantenedor (solo lectura)</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="grid gap-2 border-t border-border/50 px-3 pb-2.5 pt-2 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tipo de caja</p>
                          <p className="mt-0.5 text-xs font-medium text-foreground">
                            {selectedPresFormat?.box_kind === 'mano'
                              ? 'Mano'
                              : selectedPresFormat?.box_kind === 'maquina'
                                ? 'Máquina'
                                : 'Sin definir'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Etiqueta clamshell</p>
                          <p className="mt-0.5 text-xs font-medium text-foreground">
                            {selectedPresFormat?.clamshell_label_kind === 'generica'
                              ? 'Genérica'
                              : selectedPresFormat?.clamshell_label_kind === 'marca'
                                ? 'Marca'
                                : 'Sin definir'}
                          </p>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>

                <DialogFooter className="shrink-0 gap-2 border-t border-border bg-muted/15 px-6 py-3">
                  <Button type="button" variant="outline" onClick={() => setTagOpen(false)}>
                    Cancelar
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
                        ? 'Guardando…'
                        : 'Guardar cambios'
                      : createTagMut.isPending
                        ? bulkCreateProgress
                          ? `Creando ${bulkCreateProgress.cur}/${bulkCreateProgress.total}…`
                          : 'Creando…'
                        : bulkUnitsSubmitLabel > 1
                          ? `Crear ${bulkUnitsSubmitLabel} unidades PT`
                          : 'Crear unidad PT'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <section
        className="grid gap-3 xl:grid-cols-2 xl:gap-5 @container/daily"
        aria-labelledby="pt-daily-ops"
      >
        <h2 id="pt-daily-ops" className="sr-only">
          Operación del día
        </h2>
        <div className={cn(contentCard, 'px-3 py-3 sm:px-5 sm:py-4')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Resumen del día (operación)</p>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-slate-500">Fecha</Label>
              <Input
                type="date"
                className="h-8 w-[150px] bg-white"
                value={opsDayKey}
                onChange={(e) => setOpsDayKey(e.target.value || toLocalDayKey(new Date()))}
              />
            </div>
          </div>
          <p className="mt-1 max-xl:text-[10px] text-[11px] leading-snug text-slate-400">
            Packed y despachado: fecha seleccionada. Saldo: packed - shipped del mismo día (sin arrastre de días anteriores).
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
              <p className={kpiLabel}>Packed día</p>
              <p className={cn(kpiValueMd, 'max-xl:text-xl')}>{formatCount(operationalDaily.packedToday)}</p>
              <p className={kpiFootnote}>Cajas</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
              <p className={kpiLabel}>Saldo del día</p>
              <p className={cn(kpiValueMd, 'max-xl:text-xl')}>{formatCount(operationalDaily.coolerBoxes)}</p>
              <p className={kpiFootnote}>Packed - Shipped</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
              <p className={kpiLabel}>Shipped día</p>
              <p className={cn(kpiValueMd, 'max-xl:text-xl')}>{formatCount(operationalDaily.shippedToday)}</p>
              <p className={kpiFootnote}>Cajas (factura o ítems)</p>
            </div>
          </div>
        </div>
        <div className={cn(contentCard, 'flex flex-col px-3 py-3 sm:px-5 sm:py-4')}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Fin del día por cliente</p>
              <p className="mt-1 max-xl:text-[10px] text-[11px] leading-snug text-slate-400">
                Fecha seleccionada ({opsDayKey}). Formatos unificados con maestros; línea: cantidad · formato. Pegá en WhatsApp, Excel o correo.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5"
              onClick={() => {
                void navigator.clipboard.writeText(endOfDayPlainText);
                toast.success('Resumen copiado al portapapeles');
              }}
            >
              <Clipboard className="h-3.5 w-3.5" />
              Copiar resumen
            </Button>
          </div>
          <pre className="mt-3 max-h-[min(48vh,320px)] max-xl:max-h-[38vh] flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200/80 bg-slate-50/80 p-2.5 font-mono text-[10px] leading-relaxed text-slate-800 sm:p-3 sm:text-[11px]">
            {endOfDayPlainText || `Sin datos para ${opsDayKey}.`}
          </pre>
        </div>
      </section>

      <div
        className={cn(
          contentCard,
          'flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5',
        )}
      >
        <p className="text-sm font-medium text-slate-800">Proyección · pendiente por embalar</p>
        <div className="text-left sm:text-right">
          <p className="text-base font-semibold tabular-nums text-slate-900 sm:text-lg">
            Pendiente mañana: {formatLb(operationalDaily.pendingLb, 2)} lb
          </p>
          {pendingCajasEst != null ? (
            <p className="text-[11px] text-slate-500">
              ~{formatCount(pendingCajasEst)} cajas (estim. lb ÷ neto medio formatos activos)
            </p>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="pt-kpis" className="space-y-4">
        <h2 id="pt-kpis" className="sr-only">
          Indicadores del listado filtrado
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Unidades (listado)</p>
            <p className={kpiValueLg}>{formatCount(listKpis.unidades)}</p>
            <p className={kpiFootnote}>Filtradas</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={kpiValueLg}>{formatCount(listKpis.cajas)}</p>
            <p className={kpiFootnote}>Sin doble conteo repallet</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Peso total (lb)</p>
            <p className={kpiValueLg}>{formatLb(listKpis.lb, 2)}</p>
            <p className={kpiFootnote}>Neto declarado</p>
          </div>
          <div
            className={cn(
              kpiCard,
              listKpis.sinCliente > 0 ? 'border-amber-200/80 bg-amber-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Sin cliente</p>
            <p className={cn(kpiValueLg, listKpis.sinCliente > 0 ? 'text-amber-950' : '')}>
              {formatCount(listKpis.sinCliente)}
            </p>
            <p className={kpiFootnote}>Comercial pendiente</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100/90 bg-slate-50/40 px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Con cajas</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-slate-800">{formatCount(listKpis.conCajas)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100/90 bg-slate-50/40 px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sin cajas</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-slate-800">{formatCount(listKpis.sinCajas)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100/90 bg-slate-50/40 px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Uniones</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-slate-800">{formatCount(listKpis.uniones)}</p>
          </div>
        </div>
      </section>

      {unassignedPtCount > 0 ? (
        <div className="rounded-2xl border border-amber-100/90 bg-amber-50/35 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">Global:</span>{' '}
          {unassignedPtCount} unidad{unassignedPtCount === 1 ? '' : 'es'} sin cliente previsto en todo el sistema.
        </div>
      ) : null}

      <div className={filterPanel}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Filtrá por productor, formato, cliente previsto o estado de cajas."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="grid min-w-0 flex-1 gap-1.5 lg:min-w-[220px] lg:max-w-sm">
            <Label className="text-[11px] font-medium text-slate-500">Buscar</Label>
            <Input
              className={filterInputClass}
              placeholder="Código, formato, BOL, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-1.5 lg:w-[200px]">
            <Label className="text-[11px] font-medium text-slate-500">Productor</Label>
            <select
              className={filterSelectClass}
              value={filterProducer}
              onChange={(e) => setFilterProducer(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {(producersList ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo ? `${p.codigo} · ` : ''}
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5 lg:w-[200px]">
            <Label className="text-[11px] font-medium text-slate-500">Formato</Label>
            <select
              className={filterSelectClass}
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
            >
              <option value="">Todos</option>
              {formatOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5 lg:min-w-[220px] lg:max-w-[260px]">
            <Label className="text-[11px] font-medium text-slate-500">Cliente previsto</Label>
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
              <option value="">Todos</option>
              <option value="-1">Sin cliente</option>
              {(commercialClients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5 lg:w-[200px]">
            <Label className="text-[11px] font-medium text-slate-500">Estado cajas</Label>
            <select
              className={filterSelectClass}
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as typeof filterEstado)}
            >
              <option value="todas">Todas</option>
              <option value="disponible">Con cajas (disponible)</option>
              <option value="sin_cajas">Sin cajas</option>
            </select>
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="pt-listado">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="pt-listado" className={sectionTitle}>
            Unidades PT
          </h2>
          <span className={cn(sectionHint, '!mt-0')}>Click en fila para detalle</span>
        </div>
        {filteredTags.length === 0 ? (
          <div className={cn(emptyStatePanel, 'py-14')}>No hay resultados. Creá una unidad o ajustá filtros.</div>
        ) : (
          <div className={cn(tableShell, 'overflow-x-auto')}>
            <Table className="min-w-[1180px] [&_td]:py-3.5 [&_td:last-child]:w-[52px] [&_td:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:bg-slate-50/90 [&_th]:py-3 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_th:last-child]:text-right">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Productor</TableHead>
                  <TableHead>Variedad</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead className="text-right tabular-nums">Cajas</TableHead>
                  <TableHead className="text-right tabular-nums">Lb</TableHead>
                  <TableHead>Proceso</TableHead>
                  <TableHead>Comercial</TableHead>
                  <TableHead className="whitespace-nowrap">Unión</TableHead>
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
                      <OperationalTagBadge tag={tag} />
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
                        <CommercialStatusBadge state={commercialAssignment(tag)} />
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
                          Sí
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {commercialAssignment(tag) === 'none' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mr-1 h-8 gap-1 rounded-lg border-amber-200/90 bg-amber-50/80 px-2 text-[11px] font-medium text-amber-950 hover:bg-amber-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/existencias-pt/inventario');
                              toast.info('Existencias PT: inventario, repalet o packing lists.', { duration: 7000 });
                            }}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Destino
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100">
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
                                Editar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                openLineage(tag);
                              }}
                            >
                              <Waypoints className="mr-2 h-4 w-4" />
                              Ver trazabilidad
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                void printPtTagLabel(tag);
                              }}
                            >
                              <Printer className="mr-2 h-4 w-4" />
                              Imprimir etiqueta PT
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                void downloadPtTagZpl(tag);
                              }}
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              Descargar ZPL etiqueta
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                void downloadPtPdf(tag, 'detalle');
                              }}
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              PDF detalle / trazabilidad
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                void downloadPtPdf(tag, 'etiqueta');
                              }}
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              PDF etiqueta pallet
                            </DropdownMenuItem>
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
            <DialogTitle className="font-mono text-base">{detailTag?.tag_code}</DialogTitle>
            <div className="space-y-1 text-left text-sm text-slate-600">
              <span className="block">
                <span className="font-medium text-slate-800">ID</span>{' '}
                <span className="font-mono tabular-nums">{detailTag?.id}</span>
                {' · '}
                <span className="font-medium text-slate-800">Código</span>{' '}
                <span className="font-mono">{detailTag?.tag_code}</span>
              </span>
              <span className="block text-slate-500">
                Unión de tarjas:{' '}
                {detailTag?.es_union_tarjas ? <strong className="text-slate-800">Sí</strong> : <span>No</span>}
              </span>
              {detailTag?.excluida_suma_packout ? (
                <span className="block text-xs font-medium text-violet-900">
                  Etiqueta repallet (unificada): no duplica cajas en totales de producción.
                </span>
              ) : null}
            </div>
          </DialogHeader>
          {detailTag && (
            <div className="space-y-4 text-sm">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Inventario cámara</strong> (pestaña) concentra stock y herramientas (repaletizaje, packing list, BOL); la asignación
                comercial temprana nace aquí y se confirma más adelante en logística y despacho.
              </p>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Capa productiva (desde proceso)
                </h3>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Proceso origen</p>
                  {detailTag.items.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {detailTag.items.map((it) => {
                        const proc = processById.get(it.process_id);
                        return (
                          <li key={it.id} className="rounded-md border border-border/80 bg-background px-2 py-2">
                            <span className="font-medium">Proceso #{it.process_id}</span>
                            {proc ? (
                              <span className="text-muted-foreground">
                                {' '}
                                · {new Date(proc.fecha_proceso).toLocaleDateString('es')}
                              </span>
                            ) : null}
                            <div className="mt-1 text-xs text-muted-foreground">
                              Cajas en línea: {it.cajas_generadas} · Pallets línea: {it.pallets_generados}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      Sin procesos vinculados. Las nuevas unidades PT deben crearse desde este módulo eligiendo el proceso en el alta.
                    </p>
                  )}
                </div>
                <dl className="grid gap-2">
                  <DetailRow label="Productor" value={tagProducerLabel(detailTag, producerById)} />
                  <DetailRow
                    label="Especie"
                    value={<EspeciesCell items={detailTag.items} processById={processById} />}
                  />
                  <DetailRow
                    label="Variedad"
                    value={
                      <VariedadesCell
                        items={detailTag.items}
                        processById={processById}
                      />
                    }
                  />
                  <DetailRow label="Formato" value={<span className="font-mono">{detailTag.format_code}</span>} />
                  <DetailRow label="Cajas (total)" value={String(detailTag.total_cajas)} />
                  <DetailRow label="LB" value={fmtLbCell(detailTag.net_weight_lb)} />
                  <DetailRow
                    label="Notas de proceso"
                    value={<NotasCell items={detailTag.items} processById={processById} />}
                  />
                </dl>
              </section>

              <section
                className={cn(
                  'space-y-2 rounded-lg border-2 p-3',
                  commercialAssignment(detailTag) === 'none'
                    ? 'border-red-300/90 bg-red-50/90 dark:border-red-800 dark:bg-red-950/25'
                    : commercialAssignment(detailTag) === 'partial'
                      ? 'border-amber-300/80 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
                      : 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Asignación comercial temprana
                  </h3>
                  <CommercialStatusBadge state={commercialAssignment(detailTag)} />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Fecha, tipo PT, formato, proceso, cajas (una sola línea), cliente, marca y BOL se pueden editar desde la lista
                  (Editar) o se cargan al crear / unir unidades.
                </p>
                {commercialAssignment(detailTag) === 'none' ? (
                  <p className="text-xs font-medium text-red-800 dark:text-red-200">
                    Sin cliente previsto: definí destino en una nueva unidad o coordiná en pedidos / pallet para no perder trazabilidad
                    operativa.
                  </p>
                ) : null}
                <dl className="grid gap-2">
                  <DetailRow label="Cliente previsto" value={clientLabel(detailTag)} />
                  <DetailRow
                    label="Pedido / orden prevista"
                    value="—"
                    hint="Hoy no hay un campo de pedido en la unidad PT. Coordiná en Pedidos o usá BOL prevista como referencia."
                  />
                  <DetailRow
                    label="BOL prevista (referencia comercial)"
                    value={detailTag.bol?.trim() || '—'}
                    hint="Opcional en esta etapa. La BOL definitiva se confirma en despacho, no la reemplaza este dato."
                  />
                  <DetailRow label="Marca" value={brandLabel(detailTag) ?? '—'} />
                  <DetailRow
                    label="Tipo de empaque / presentación"
                    value={
                      formatMeta.get(detailTag.format_code.trim().toLowerCase())?.descripcion?.trim() ||
                      `Formato ${detailTag.format_code}`
                    }
                    hint="Descripción del formato de presentación. Detalle fino de etiquetas suele cerrarse en Existencias PT / despacho."
                  />
                  <DetailRow
                    label="Clamshell especial"
                    value="—"
                    hint="No se registra en esta entidad. Definilo al armar pallet o envío si aplica."
                  />
                  <DetailRow
                    label="Etiqueta especial"
                    value="—"
                    hint="No se registra en esta entidad. Existencias PT o despacho para etiquetado definitivo."
                  />
                </dl>
              </section>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => openLineage(detailTag)}>
                  <Waypoints className="mr-1 h-3.5 w-3.5" />
                  Trazabilidad
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void downloadPtPdf(detailTag, 'detalle')}>
                  <FileDown className="mr-1 h-3.5 w-3.5" />
                  PDF detalle
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void downloadPtPdf(detailTag, 'etiqueta')}>
                  <FileDown className="mr-1 h-3.5 w-3.5" />
                  PDF etiqueta
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
                    Editar
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailTag(null)}>
              Cerrar
            </Button>
          </DialogFooter>
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
            <DialogTitle>Trazabilidad unidad PT #{lineageData?.tarja_id}</DialogTitle>
          </DialogHeader>
          {lineageData && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Origen (ancestros)</p>
                {lineageData.ancestors.length === 0 ? (
                  <p className="text-muted-foreground">Ninguno</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {lineageData.ancestors.map((a) => (
                      <li key={`${a.tarja_id}-${a.relation}`}>
                        Unidad PT #{a.tarja_id} · {a.relation}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-medium">Derivados (descendientes)</p>
                {lineageData.descendants.length === 0 ? (
                  <p className="text-muted-foreground">Ninguno</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {lineageData.descendants.map((a) => (
                      <li key={`${a.tarja_id}-${a.relation}`}>
                        Unidad PT #{a.tarja_id} · {a.relation}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLineageOpen(false)}>
              Cerrar
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

function NotasCell({
  items,
  processById,
}: {
  items: PtTagItemApi[];
  processById: Map<number, FruitProcessRow>;
}) {
  const parts = items
    .map((it) => {
      const n = processById.get(it.process_id)?.nota?.trim();
      return n ? `Proceso #${it.process_id}: ${n}` : null;
    })
    .filter((x): x is string => !!x);
  if (parts.length === 0) return '—';
  return (
    <ul className="list-inside list-disc space-y-1">
      {parts.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );
}
