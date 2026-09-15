import {
  zodResolver } from '@hookform/resolvers/zod';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileText,
  Info,
  Leaf,
  Lock,
  MoreHorizontal,
  Plus,
  Printer,
  Scale,
  Trash2,
  Truck,
  User,
  X,
  Search,
  Filter,
  CalendarRange,
  List,
  LayoutGrid,
  Ellipsis,
} from 'lucide-react';
import { Fragment,
  useEffect,
  useMemo,
  useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson,
  downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
import { canOperate,
  isAdmin } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card,
  CardDescription,
  CardHeader,
  CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { isoInLocalDateRange,
  localDateYmd } from '@/lib/date-filter';
import { formatCount,
  formatLb } from '@/lib/number-format';
import { processTokens } from '@/lib/process-tokens';
import {
  badgePill,
  contentCard,
  emptyStatePanel,
  errorStateCard,
  filterInputClass,
  filterPanel,
  filterSelectClass,
  kpiCardSm,
  kpiLabel,
  kpiValueMd,
  modalFormLineCard,
  modalFormPrimaryButton,
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
  pageInfoButton,
  sectionHint,
  sectionTitle,
  signalsPanel,
  signalsTitle,
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { PinebloomHero } from '@/components/brand/PinebloomHero';
import {
  PineCalendarIcon,
  PineClockIcon,
  PineCopyIcon,
  PineDocumentIcon,
  PineEllipsisIcon,
  PineLeafIcon,
  PinePersonIcon,
  PinePlusIcon,
  PineTrashIcon,
  PineTruckIcon,
  PineUsersIcon,
  PineWeightIcon,
} from '@/components/icons/pinebloom';
import { FieldRow } from '@/components/brand/FieldRow';
import { appBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const receptionTok = processTokens.reception;

function weekStartYmd(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return localDateYmd(x);
}

function DocumentStateBadge({
  codigo,
  nombre,
  className,
}: {
  codigo?: string | null;
  nombre?: string | null;
  className?: string;
}) {
  const { t } = useTranslation('common');
  const c = String(codigo ?? '').toLowerCase();
  const knownCodes = ['borrador', 'confirmado', 'cerrado', 'anulado'] as const;
  const label = (knownCodes as readonly string[]).includes(c)
    ? t(`documentStatus.${c}`)
    : (nombre?.trim() || codigo || '—');
  const cfg: Record<string, { className: string; Icon: typeof CircleDashed }> = {
    borrador: {
      className: 'border-slate-200 bg-slate-50 text-slate-700',
      Icon: CircleDashed,
    },
    confirmado: {
      className: 'border-sky-200 bg-sky-50 text-sky-800',
      Icon: FileText,
    },
    cerrado: {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      Icon: Lock,
    },
    anulado: {
      className: 'border-rose-200 bg-rose-50 text-rose-800',
      Icon: Ban,
    },
  };
  const entry = cfg[c];
  const Icon = entry?.Icon ?? CircleDashed;
  return (
    <span
      className={cn(
        badgePill,
        'inline-flex items-center gap-1 px-2 py-0.5 text-[10px]',
        entry?.className ?? 'border-slate-200 bg-slate-50 text-slate-800',
        className,
      )}
      title={label}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

/** Parse lb desde API (string decimal); tolera miles con punto y coma decimal. */
function parseApiLbString(s: string | null | undefined): number {
  if (s == null || s === '') return 0;
  const t = String(s).trim();
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  let normalized: string;
  if (lastComma !== -1 && lastComma > lastDot) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = t.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function sumLinesNetLb(r: ReceptionRow): number {
  let t = 0;
  for (const ln of r.lines ?? []) {
    t += parseApiLbString(ln.net_lb);
  }
  return t;
}

/** Neto mostrado: suma líneas; si es 0, usa neto de cabecera (`net_weight_lb`) que el servidor guarda. */
function receptionNetLb(r: ReceptionRow): number {
  const lineSum = sumLinesNetLb(r);
  if (lineSum > 0) return lineSum;
  const hdr = parseApiLbString(r.net_weight_lb);
  if (hdr > 0) return hdr;
  return lineSum;
}

function formatReceptionDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function lotesResumen(r: ReceptionRow): string {
  const set = new Set<string>();
  for (const ln of r.lines ?? []) {
    const lc = ln.lot_code?.trim();
    if (lc) set.add(lc);
  }
  if (set.size === 0) return '—';
  const arr = [...set];
  if (arr.length <= 2) return arr.join(' · ');
  return `${arr.slice(0, 2).join(' · ')} +${arr.length - 2}`;
}

function lotesDetalle(r: ReceptionRow): string {
  const set = new Set<string>();
  for (const ln of r.lines ?? []) {
    const lc = ln.lot_code?.trim();
    if (lc) set.add(lc);
  }
  if (set.size === 0) return '—';
  return [...set].join(' · ');
}

function especieCabecera(r: ReceptionRow): string {
  const fromLine = (r.lines ?? [])
    .map((ln) => ln.species?.nombre?.trim() || '')
    .find((n) => n.length > 0);
  if (fromLine) return fromLine;
  return r.variety?.species?.nombre?.trim() || r.variety?.species?.codigo?.trim() || '—';
}

function receptionSpeciesId(r: ReceptionRow): number {
  const fromLine = (r.lines ?? []).map((ln) => ln.species_id).find((id) => id > 0);
  if (fromLine && fromLine > 0) return fromLine;
  return r.variety?.species?.id ?? 0;
}

function variedadCabecera(r: ReceptionRow): string {
  const fromLine = (r.lines ?? [])
    .map((ln) => ln.variety?.nombre?.trim() || '')
    .find((n) => n.length > 0);
  if (fromLine) return fromLine;
  return r.variety?.nombre?.trim() || '—';
}

function receptionVisualTone(r: ReceptionRow): {
  leftBar: string;
  rowHover: string;
  usoBadge: string;
} {
  const state = r.document_state?.codigo ?? '';
  if (state === 'borrador') {
    return {
      leftBar: 'bg-amber-300',
      rowHover: 'hover:bg-amber-50/60',
      usoBadge: 'border-amber-200/90 bg-amber-50 text-amber-900',
    };
  }
  if (state === 'confirmado') {
    return {
      leftBar: 'bg-emerald-400',
      rowHover: 'hover:bg-emerald-50/55',
      usoBadge: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
    };
  }
  if (state === 'cerrado') {
    return {
      leftBar: 'bg-violet-400',
      rowHover: 'hover:bg-violet-50/45',
      usoBadge: 'border-violet-200/85 bg-violet-50 text-violet-900',
    };
  }
  if (state === 'anulado') {
    return {
      leftBar: 'bg-rose-400',
      rowHover: 'hover:bg-rose-50/45',
      usoBadge: 'border-rose-200/90 bg-rose-50 text-rose-900',
    };
  }
  return {
    leftBar: 'bg-sky-400',
    rowHover: 'hover:bg-sky-50/55',
    usoBadge: 'border-sky-200/80 bg-sky-50 text-sky-900',
  };
}

const DEFAULT_PLANT = 'PINEBLOOM FARMS';
const compactFieldLabelClass = 'mb-1 block text-[10px] uppercase tracking-[0.05em] text-muted-foreground';

export type ReceptionLineRow = {
  id: number;
  line_order: number;
  species_id: number;
  variety_id: number;
  quality_grade_id?: number | null;
  gross_lb: string;
  tare_lb: string;
  net_lb: string;
  format_code: string | null;
  quantity: number | null;
  temperature_f: string | null;
  returnable_container_id?: number | null;
  species?: { nombre: string };
  variety?: { nombre: string };
  quality_grade?: { codigo: string; nombre: string } | null;
  returnable_container?: { id: number; tipo: string; capacidad: string | null } | null;
  lot_code?: string | null;
};

export type ReceptionRow = {
  id: number;
  received_at: string;
  document_number: string | null;
  producer_id: number;
  variety_id: number;
  gross_weight_lb: string | null;
  net_weight_lb: string | null;
  notes: string | null;
  reference_code: string | null;
  plant_code: string | null;
  mercado_id: number | null;
  document_state_id: number;
  reception_type_id: number;
  created_at: string;
  document_state?: { id: number; codigo: string; nombre: string };
  reception_type?: { id: number; codigo: string; nombre: string };
  mercado?: { id: number; codigo: string; nombre: string } | null;
  producer: { id: number; nombre: string; codigo: string | null };
  variety: {
    id: number;
    nombre: string;
    codigo: string | null;
    species: { id: number; codigo: string; nombre: string };
  };
  lines?: ReceptionLineRow[];
};

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const headerSchema = z.object({
  received_at: z.string().min(1),
  document_number: z.string().optional(),
  reference_code: z.string().max(64).optional(),
  producer_id: z.coerce.number().int().positive(),
  notes: z.string().optional(),
  plant_code: z.string().optional(),
  document_state_id: z.coerce.number().int().min(0),
  reception_type_id: z.coerce.number().int().min(0),
  mercado_id: z.coerce.number().int().min(0),
});

type HeaderForm = z.infer<typeof headerSchema>;

type LineDraft = {
  species_id: number;
  variety_id: number;
  quality_grade_id: number;
  gross_lb: string;
  net_lb: string;
  quantity: string;
  returnable_container_id: number;
  temperature_str: string;
  lot_code?: string | null;
};

const emptyLine = (): LineDraft => ({
  species_id: 0,
  variety_id: 0,
  quality_grade_id: 0,
  gross_lb: '',
  net_lb: '',
  quantity: '',
  returnable_container_id: 0,
  temperature_str: '',
  lot_code: undefined,
});

function formatLbInput(v?: string | number | null): string {
  if (v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n % 1 === 0 ? String(Math.trunc(n)) : String(parseFloat(n.toFixed(2)));
}

function asIntId(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : fallback;
}

function lineFromApi(ln: ReceptionLineRow): LineDraft {
  return {
    species_id: asIntId(ln.species_id),
    variety_id: asIntId(ln.variety_id),
    quality_grade_id: ln.quality_grade_id != null ? asIntId(ln.quality_grade_id) : 0,
    gross_lb: formatLbInput(ln.gross_lb),
    net_lb: formatLbInput(ln.net_lb),
    quantity: ln.quantity != null ? String(ln.quantity) : '',
    returnable_container_id: asIntId(ln.returnable_container_id ?? ln.returnable_container?.id, 0),
    temperature_str: ln.temperature_f != null ? String(ln.temperature_f) : '',
    lot_code: ln.lot_code ?? null,
  };
}

/**
 * Borrador del modal alineado con lo que guardó el servidor:
 * - import CSV “solo encabezado” deja `lines` vacías pero pesos/variedad en cabecera;
 * - si las líneas tienen neto 0 pero el encabezado tiene `net_weight_lb`, el listado usa ese neto — el formulario debe mostrarlo en la primera línea para poder editar.
 */
function lineDraftsFromReception(r: ReceptionRow): LineDraft[] {
  const apiLines = r.lines ?? [];
  if (apiLines.length > 0) {
    const drafts = apiLines.map(lineFromApi);
    const lineNetSum = sumLinesNetLb(r);
    const headerNet = parseApiLbString(r.net_weight_lb);
    if (lineNetSum <= 0 && headerNet > 0) {
      const next = drafts.slice();
      const first = { ...next[0] };
      first.net_lb = formatLbInput(headerNet);
      if (!first.gross_lb.trim() && r.gross_weight_lb) {
        first.gross_lb = formatLbInput(r.gross_weight_lb);
      }
      next[0] = first;
      return next;
    }
    return drafts;
  }
  const speciesId = r.variety?.species?.id ?? 0;
  const varietyId = r.variety_id ?? 0;
  return [
    {
      species_id: speciesId,
      variety_id: varietyId,
      quality_grade_id: 0,
      gross_lb: formatLbInput(r.gross_weight_lb),
      net_lb: formatLbInput(r.net_weight_lb),
      quantity: '',
      returnable_container_id: 0,
      temperature_str: '',
      lot_code: undefined,
    },
  ];
}

export function ReceptionPage() {
  const { t, i18n } = useTranslation('common');
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isAdminRole = isAdmin(role);
  const canOperateReception = canOperate(role);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  /** Admin en recepción no borrador: modal editable solo para cambiar estado documento. */
  const [adminStateOnlyEdit, setAdminStateOnlyEdit] = useState(false);
  const [serverReference, setServerReference] = useState<string | null>(null);
  const [applyVarietyToInvolvedLines, setApplyVarietyToInvolvedLines] = useState(true);
  const [viewStateCodigo, setViewStateCodigo] = useState<string | null>(null);
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([emptyLine()]);

  const { data: receptions, isPending, isError, error, refetch } = useQuery({
    queryKey: ['receptions'],
    queryFn: () => apiJson<ReceptionRow[]>('/api/receptions'),
  });

  const { data: producers } = useQuery({
    queryKey: ['masters', 'producers'],
    queryFn: () => apiJson<{ id: number; nombre: string; codigo: string | null }[]>('/api/masters/producers'),
  });

  const { data: varieties } = useQuery({
    queryKey: ['masters', 'varieties'],
    queryFn: () => apiJson<{ id: number; nombre: string; species_id: number; species: { nombre: string } }[]>('/api/masters/varieties'),
  });

  const { data: speciesList } = useQuery({
    queryKey: ['masters', 'species'],
    queryFn: () => apiJson<{ id: number; nombre: string; codigo: string }[]>('/api/masters/species'),
  });

  const { data: qualityGrades } = useQuery({
    queryKey: ['masters', 'quality-grades'],
    queryFn: () => apiJson<{ id: number; nombre: string; codigo: string }[]>('/api/masters/quality-grades'),
  });

  const { data: returnableContainers } = useQuery({
    queryKey: ['masters', 'returnable-containers'],
    queryFn: () => apiJson<{ id: number; tipo: string; capacidad: string | null; activo: boolean }[]>('/api/masters/returnable-containers'),
  });

  const { data: documentStates } = useQuery({
    queryKey: ['masters', 'document-states'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/document-states'),
  });

  const { data: receptionTypes } = useQuery({
    queryKey: ['masters', 'reception-types'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/reception-types'),
  });

  const { data: mercados } = useQuery({
    queryKey: ['masters', 'mercados'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/mercados'),
  });

  const borradorStateId = useMemo(
    () => (documentStates ?? []).find((s) => s.codigo === 'borrador')?.id ?? 0,
    [documentStates],
  );
  const handPickTypeId = useMemo(
    () => (receptionTypes ?? []).find((t) => t.codigo === 'hand_picking')?.id ?? 0,
    [receptionTypes],
  );
  const machinePickTypeId = useMemo(
    () => (receptionTypes ?? []).find((t) => t.codigo === 'machine_picking')?.id ?? 0,
    [receptionTypes],
  );
  const defaultMercadoId = useMemo(
    () => (mercados ?? []).find((m) => m.codigo === 'USA')?.id ?? 0,
    [mercados],
  );

  const cerradoStateId = useMemo(
    () => (documentStates ?? []).find((s) => s.codigo === 'cerrado')?.id ?? 0,
    [documentStates],
  );
  const confirmadoStateId = useMemo(
    () => (documentStates ?? []).find((s) => s.codigo === 'confirmado')?.id ?? 0,
    [documentStates],
  );

  const activeContainers = useMemo(
    () => (returnableContainers ?? []).filter((c) => c.activo !== false),
    [returnableContainers],
  );

  const todayYmd = localDateYmd();
  const [filterDateFrom, setFilterDateFrom] = useState(todayYmd);
  const [filterDateTo, setFilterDateTo] = useState(todayYmd);
  const [datePreset, setDatePreset] = useState<'today' | 'week' | 'all'>('today');
  const [filterProducer, setFilterProducer] = useState(0);
  const [filterSpecies, setFilterSpecies] = useState(0);
  const [filterVariety, setFilterVariety] = useState(0);
  const [filterTipo, setFilterTipo] = useState(0);
  const [filterUso, setFilterUso] = useState<'todos' | 'abierto' | 'cerrado'>('todos');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('detailed');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [closedSuccessId, setClosedSuccessId] = useState<number | null>(null);

  function applyDatePreset(preset: 'today' | 'week' | 'all') {
    setDatePreset(preset);
    if (preset === 'today') {
      const d = localDateYmd();
      setFilterDateFrom(d);
      setFilterDateTo(d);
      return;
    }
    if (preset === 'week') {
      setFilterDateFrom(weekStartYmd());
      setFilterDateTo(localDateYmd());
      return;
    }
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  const filteredReceptions = useMemo(() => {
    let list = receptions ?? [];
    if (filterDateFrom || filterDateTo) {
      list = list.filter((r) => isoInLocalDateRange(r.received_at, filterDateFrom, filterDateTo));
    }
    if (filterProducer > 0) list = list.filter((r) => r.producer_id === filterProducer);
    if (filterSpecies > 0) {
      list = list.filter((r) => receptionSpeciesId(r) === filterSpecies);
    }
    if (filterVariety > 0) {
      list = list.filter((r) => r.lines?.some((ln) => ln.variety_id === filterVariety) || r.variety_id === filterVariety);
    }
    if (filterTipo > 0) list = list.filter((r) => r.reception_type_id === filterTipo);
    if (filterUso === 'abierto') {
      list = list.filter((r) => r.document_state?.codigo !== 'cerrado' && r.document_state?.codigo !== 'anulado');
    }
    if (filterUso === 'cerrado') {
      list = list.filter((r) => r.document_state?.codigo === 'cerrado');
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const ref = `${r.reference_code ?? ''} ${r.document_number ?? ''}`.toLowerCase();
        return (
          String(r.id).includes(q) ||
          ref.includes(q) ||
          (r.producer?.nombre?.toLowerCase().includes(q) ?? false) ||
          (r.notes?.toLowerCase().includes(q) ?? false) ||
          (r.variety?.nombre?.toLowerCase().includes(q) ?? false) ||
          (r.lines ?? []).some((ln) => (ln.lot_code?.toLowerCase().includes(q) ?? false))
        );
      });
    }
    return list;
  }, [receptions, filterDateFrom, filterDateTo, filterProducer, filterSpecies, filterVariety, filterTipo, filterUso, search]);

  const compactGroups = useMemo(() => {
    const byProducer = new Map<
      string,
      {
        key: string;
        producerName: string;
        receptions: ReceptionRow[];
        totalNet: number;
        pendingCount: number;
      }
    >();
    for (const r of filteredReceptions) {
      const producerName = r.producer?.nombre?.trim() || '—';
      const key = `${r.producer_id || 0}:${producerName}`;
      const bucket = byProducer.get(key) ?? {
        key,
        producerName,
        receptions: [],
        totalNet: 0,
        pendingCount: 0,
      };
      bucket.receptions.push(r);
      bucket.totalNet += receptionNetLb(r);
      if (r.document_state?.codigo === 'borrador') bucket.pendingCount += 1;
      byProducer.set(key, bucket);
    }
    return [...byProducer.values()]
      .map((g) => ({
        ...g,
        receptions: g.receptions.slice().sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()),
      }))
      .sort((a, b) => b.totalNet - a.totalNet);
  }, [filteredReceptions]);

  const receptionKpis = useMemo(() => {
    let totalNet = 0;
    const byVariety = new Map<string, number>();
    const byProducer = new Map<string, number>();
    let lbManual = 0;
    let lbMaquina = 0;
    let lbOtroTipo = 0;
    let nBorrador = 0;
    let nConfirmado = 0;
    let nCerrado = 0;
    let nAnulado = 0;
    let nSinLineas = 0;
    let nLineasTotal = 0;
    const lotesDistinct = new Set<string>();

    for (const r of filteredReceptions) {
      const st = r.document_state?.codigo ?? '';
      if (st === 'borrador') nBorrador++;
      else if (st === 'confirmado') nConfirmado++;
      else if (st === 'cerrado') nCerrado++;
      else if (st === 'anulado') nAnulado++;
      const nL = r.lines?.length ?? 0;
      nLineasTotal += nL;
      if (nL === 0) nSinLineas++;
      for (const ln of r.lines ?? []) {
        const lc = ln.lot_code?.trim();
        if (lc) lotesDistinct.add(lc);
      }
    }

    for (const r of filteredReceptions) {
      totalNet += receptionNetLb(r);
    }

    for (const r of filteredReceptions) {
      const displayNet = receptionNetLb(r);
      const rtCodigo = r.reception_type?.codigo ?? '';
      const producerName = r.producer?.nombre ?? '—';
      let allocated = 0;
      for (const ln of r.lines ?? []) {
        const n = parseApiLbString(ln.net_lb);
        if (n <= 0) continue;
        allocated += n;
        const vn = ln.variety?.nombre ?? '—';
        byVariety.set(vn, (byVariety.get(vn) ?? 0) + n);
        byProducer.set(producerName, (byProducer.get(producerName) ?? 0) + n);
        if (
          (handPickTypeId > 0 && r.reception_type_id === handPickTypeId) ||
          rtCodigo === 'hand_picking'
        ) {
          lbManual += n;
        } else if (
          (machinePickTypeId > 0 && r.reception_type_id === machinePickTypeId) ||
          rtCodigo === 'machine_picking'
        ) {
          lbMaquina += n;
        } else {
          lbOtroTipo += n;
        }
      }
      const rest = Math.max(0, displayNet - allocated);
      if (rest > 0.0001) {
        const vn = r.variety?.nombre ?? '—';
        byVariety.set(vn, (byVariety.get(vn) ?? 0) + rest);
        byProducer.set(producerName, (byProducer.get(producerName) ?? 0) + rest);
        if (
          (handPickTypeId > 0 && r.reception_type_id === handPickTypeId) ||
          rtCodigo === 'hand_picking'
        ) {
          lbManual += rest;
        } else if (
          (machinePickTypeId > 0 && r.reception_type_id === machinePickTypeId) ||
          rtCodigo === 'machine_picking'
        ) {
          lbMaquina += rest;
        } else {
          lbOtroTipo += rest;
        }
      }
    }
    const nRecepciones = filteredReceptions.length;
    const producerIds = new Set(filteredReceptions.map((r) => r.producer_id));
    const nProductores = producerIds.size;
    const avgLbPorRecepcion = nRecepciones > 0 ? totalNet / nRecepciones : null;
    const topVariedades = [...byVariety.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topProductores = [...byProducer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      totalNet,
      byVariety,
      byProducer,
      lbManual,
      lbMaquina,
      lbOtroTipo,
      nRecepciones,
      nProductores,
      avgLbPorRecepcion,
      topVariedades,
      topProductores,
      nBorrador,
      nConfirmado,
      nCerrado,
      nAnulado,
      nSinLineas,
      nLineasTotal,
      nLotesDistinct: lotesDistinct.size,
    };
  }, [filteredReceptions, handPickTypeId, machinePickTypeId]);

  const todayOpsKpis = useMemo(() => {
    const today = localDateYmd();
    const todays = (receptions ?? []).filter((r) => isoInLocalDateRange(r.received_at, today, today));
    let totalNet = 0;
    let pending = 0;
    const producers = new Set<number>();
    for (const r of todays) {
      totalNet += receptionNetLb(r);
      const st = r.document_state?.codigo ?? '';
      if (st === 'borrador' || st === 'confirmado') pending += 1;
      if (r.producer_id > 0) producers.add(r.producer_id);
    }
    return {
      count: todays.length,
      pending,
      totalNet,
      producers: producers.size,
    };
  }, [receptions]);

  const receptionAlertLines = useMemo(() => {
    const lines: { key: string; tone: 'warn' | 'info'; text: string }[] = [];
    let nNetZero = 0;
    let nSinProductor = 0;
    for (const r of filteredReceptions) {
      if ((r.lines?.length ?? 0) > 0 && receptionNetLb(r) <= 0) nNetZero++;
      if (!r.producer?.nombre?.trim()) nSinProductor++;
    }
    if (receptionKpis.nSinLineas > 0) {
      lines.push({
        key: 'sin-lineas',
        tone: 'warn',
        text: t('reception.alerts.noLines', { count: formatCount(receptionKpis.nSinLineas) }),
      });
    }
    if (nNetZero > 0) {
      lines.push({
        key: 'net-zero',
        tone: 'warn',
        text: t('reception.alerts.netZero', { count: formatCount(nNetZero) }),
      });
    }
    if (nSinProductor > 0) {
      lines.push({
        key: 'sin-prod',
        tone: 'warn',
        text: t('reception.alerts.noProducer', { count: formatCount(nSinProductor) }),
      });
    }
    if (receptionKpis.nAnulado > 0) {
      lines.push({
        key: 'anulados',
        tone: 'info',
        text: t('reception.alerts.voided', { count: formatCount(receptionKpis.nAnulado) }),
      });
    }
    return lines;
  }, [filteredReceptions, receptionKpis.nSinLineas, receptionKpis.nAnulado, t]);

  const form = useForm<HeaderForm>({
    resolver: zodResolver(headerSchema),
    defaultValues: {
      received_at: toDatetimeLocalValue(new Date().toISOString()),
      document_number: '',
      reference_code: '',
      producer_id: 0,
      notes: '',
      plant_code: DEFAULT_PLANT,
      document_state_id: 0,
      reception_type_id: 0,
      mercado_id: 0,
    },
  });

  useEffect(() => {
    if (!borradorStateId || !handPickTypeId) return;
    const cur = form.getValues();
    if (cur.document_state_id <= 0) form.setValue('document_state_id', borradorStateId);
    if (cur.reception_type_id <= 0) form.setValue('reception_type_id', handPickTypeId);
    if (cur.mercado_id <= 0 && defaultMercadoId > 0) form.setValue('mercado_id', defaultMercadoId);
  }, [borradorStateId, handPickTypeId, defaultMercadoId, form]);

  const parseLb = (s?: string) => {
    const t = s?.trim();
    if (!t) return undefined;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const buildPayload = (h: HeaderForm, lines: Record<string, unknown>[], forCreate: boolean) => ({
    received_at: new Date(h.received_at).toISOString(),
    document_number: h.document_number?.trim() || undefined,
    ...(forCreate && h.reference_code?.trim() ? { reference_code: h.reference_code.trim() } : {}),
    producer_id: h.producer_id,
    notes: h.notes?.trim() || undefined,
    plant_code: h.plant_code?.trim() || undefined,
    document_state_id: h.document_state_id,
    reception_type_id: h.reception_type_id,
    mercado_id: h.mercado_id > 0 ? h.mercado_id : undefined,
    weight_basis: 'net_lb',
    quality_intent: 'exportacion',
    lines,
  });

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiJson('/api/receptions', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('reception.toast.created'));
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiJson(`/api/receptions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('reception.toast.updated'));
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionMut = useMutation({
    mutationFn: ({ id, document_state_id }: { id: number; document_state_id: number }) =>
      apiJson(`/api/receptions/${id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ document_state_id }),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      if (vars.document_state_id === cerradoStateId && cerradoStateId > 0) {
        toast.success(t('reception.toast.closedOk'));
        setClosedSuccessId(vars.id);
        closeDialog();
        return;
      }
      if (vars.document_state_id === confirmadoStateId && confirmadoStateId > 0) {
        toast.success(t('reception.toast.confirmed'));
      } else {
        toast.success(t('reception.toast.stateUpdated'));
      }
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmReceptionMut = useMutation({
    mutationFn: ({ id, document_state_id }: { id: number; document_state_id: number }) =>
      apiJson(`/api/receptions/${id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ document_state_id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Borrador → confirmado → cerrado para la lista dada; una invalidación al final (sin N toasts). */
  const bulkConfirmCloseDraftsMut = useMutation({
    mutationFn: async (drafts: ReceptionRow[]) => {
      if (!confirmadoStateId || !cerradoStateId) {
        throw new Error('Catálogo de estados incompleto (confirmado/cerrado).');
      }
      let closed = 0;
      const failures: string[] = [];
      for (const r of drafts) {
        if (!r.lines?.length) {
          failures.push(`#${r.id}: sin líneas de detalle`);
          continue;
        }
        if (!r.reference_code?.trim()) {
          failures.push(`#${r.id}: sin referencia`);
          continue;
        }
        try {
          await apiJson(`/api/receptions/${r.id}/state`, {
            method: 'PATCH',
            body: JSON.stringify({ document_state_id: confirmadoStateId }),
          });
          await apiJson(`/api/receptions/${r.id}/state`, {
            method: 'PATCH',
            body: JSON.stringify({ document_state_id: cerradoStateId }),
          });
          closed += 1;
        } catch (e) {
          failures.push(`#${r.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { closed, failures };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      if (data.closed > 0) {
        toast.success(`${data.closed} recepción(es) confirmadas y cerradas.`);
      }
      if (data.failures.length > 0) {
        const sample = data.failures.slice(0, 5).join(' · ');
        const more = data.failures.length > 5 ? ` (+${data.failures.length - 5} más)` : '';
        toast.error(`Algunas no se pudieron cerrar: ${sample}${more}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adminPatchStateMut = useMutation({
    mutationFn: ({ id, document_state_id }: { id: number; document_state_id: number }) =>
      apiJson(`/api/receptions/${id}/state-admin`, {
        method: 'PATCH',
        body: JSON.stringify({ document_state_id }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('reception.toast.stateUpdated'));
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function confirmReceptionFromList(id: number) {
    if (!confirmadoStateId) return;
    try {
      await confirmReceptionMut.mutateAsync({ id, document_state_id: confirmadoStateId });
      toast.success(t('reception.toast.confirmed'));
    } catch {
      // manejado por onError
    }
  }

  async function printReceptionPdf(id: number) {
    try {
      await downloadPdf(
        `/api/documents/receptions/${id}/pdf?lang=${i18n.language.startsWith('en') ? 'en' : 'es'}`,
        `informe-recepcion-${id}.pdf`,
      );
      toast.success(t('reception.toast.reportReady'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('reception.toast.downloadError'));
    }
  }

  function primaryActionLabel(codigo?: string | null) {
    const c = String(codigo ?? '').toLowerCase();
    if (c === 'borrador') return t('reception.table.actionContinue');
    if (c === 'confirmado') return t('reception.table.actionReviewClose');
    return t('reception.table.actionView');
  }

  function runPrimaryAction(r: ReceptionRow) {
    const c = r.document_state?.codigo ?? '';
    if (c === 'borrador' && (canOperateReception || isAdminRole)) {
      void openEdit(r.id);
      return;
    }
    void openView(r.id);
  }

  async function confirmAllDraftsFromList() {
    if (!confirmadoStateId || !cerradoStateId) return;
    const drafts = filteredReceptions.filter((r) => r.document_state?.codigo === 'borrador');
    if (!drafts.length) return;
    const ok = window.confirm(
      `¿Confirmar y cerrar ${drafts.length} recepción(es) en borrador de la vista actual?\n\n` +
        `Cada una pasará a «confirmado» y luego a «cerrado» (cierre documental). Las que no tengan líneas o referencia se omiten y se reportan al final.`,
    );
    if (!ok) return;
    await bulkConfirmCloseDraftsMut.mutateAsync(drafts);
  }

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setViewOnly(false);
    setAdminStateOnlyEdit(false);
    setViewStateCodigo(null);
    setServerReference(null);
    setLineDrafts([emptyLine()]);
    form.reset({
      received_at: toDatetimeLocalValue(new Date().toISOString()),
      document_number: '',
      reference_code: '',
      producer_id: 0,
      notes: '',
      plant_code: DEFAULT_PLANT,
      document_state_id: borradorStateId || 0,
      reception_type_id: handPickTypeId || 0,
      mercado_id: defaultMercadoId || 0,
    });
  }

  function openNew() {
    setEditingId(null);
    setViewOnly(false);
    setAdminStateOnlyEdit(false);
    setViewStateCodigo(null);
    setServerReference(null);
    setLineDrafts([emptyLine()]);
    form.reset({
      received_at: toDatetimeLocalValue(new Date().toISOString()),
      document_number: '',
      reference_code: '',
      producer_id: 0,
      notes: '',
      plant_code: DEFAULT_PLANT,
      document_state_id: borradorStateId || 0,
      reception_type_id: handPickTypeId || 0,
      mercado_id: defaultMercadoId || 0,
    });
    setOpen(true);
  }

  async function openEdit(id: number) {
    try {
      const r = await apiJson<ReceptionRow>(`/api/receptions/${id}`);
      const codigo = r.document_state?.codigo ?? '';
      if (codigo !== 'borrador') {
        if (!isAdminRole) {
          toast.error('Solo se editan recepciones en borrador.');
          return;
        }
        setAdminStateOnlyEdit(true);
        setEditingId(id);
        setViewOnly(false);
        setServerReference(r.reference_code ?? null);
        setViewStateCodigo(codigo || null);
        form.reset({
          received_at: toDatetimeLocalValue(r.received_at),
          document_number: r.document_number ?? '',
          reference_code: '',
          producer_id: r.producer_id,
          notes: r.notes ?? '',
          plant_code: r.plant_code ?? DEFAULT_PLANT,
          document_state_id: r.document_state_id,
          reception_type_id: r.reception_type_id,
          mercado_id: r.mercado_id ?? 0,
        });
        setLineDrafts(lineDraftsFromReception(r));
        setOpen(true);
        return;
      }
      setAdminStateOnlyEdit(false);
      setEditingId(id);
      setViewOnly(false);
      setServerReference(r.reference_code ?? null);
      setViewStateCodigo(codigo || null);
      form.reset({
        received_at: toDatetimeLocalValue(r.received_at),
        document_number: r.document_number ?? '',
        reference_code: '',
        producer_id: r.producer_id,
        notes: r.notes ?? '',
        plant_code: r.plant_code ?? DEFAULT_PLANT,
        document_state_id: r.document_state_id,
        reception_type_id: r.reception_type_id,
        mercado_id: r.mercado_id ?? 0,
      });
      setLineDrafts(lineDraftsFromReception(r));
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar');
    }
  }

  async function openView(id: number) {
    try {
      const r = await apiJson<ReceptionRow>(`/api/receptions/${id}`);
      setAdminStateOnlyEdit(false);
      setEditingId(id);
      setViewOnly(true);
      setServerReference(r.reference_code ?? null);
      setViewStateCodigo(r.document_state?.codigo ?? null);
      form.reset({
        received_at: toDatetimeLocalValue(r.received_at),
        document_number: r.document_number ?? '',
        reference_code: '',
        producer_id: r.producer_id,
        notes: r.notes ?? '',
        plant_code: r.plant_code ?? DEFAULT_PLANT,
        document_state_id: r.document_state_id,
        reception_type_id: r.reception_type_id,
        mercado_id: r.mercado_id ?? 0,
      });
      setLineDrafts(lineDraftsFromReception(r));
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar');
    }
  }

  function onSubmit(h: HeaderForm) {
    if (viewOnly) return;
    if (adminStateOnlyEdit) {
      if (editingId == null) return;
      if (h.document_state_id <= 0) {
        toast.error('Elegí un estado de documento válido.');
        return;
      }
      adminPatchStateMut.mutate({ id: editingId, document_state_id: h.document_state_id });
      return;
    }
    if (h.document_state_id <= 0 || h.reception_type_id <= 0) {
      toast.error('Esperá a que carguen los catálogos (estado / tipo de recepción) o recargá la página.');
      return;
    }
    if (lineDrafts.length === 0) {
      toast.error('Agregá al menos una línea.');
      return;
    }
    const lines: Record<string, unknown>[] = [];
    for (let i = 0; i < lineDrafts.length; i++) {
      const L = lineDrafts[i];
      if (L.species_id <= 0 || L.variety_id <= 0) {
        toast.error(`Línea ${i + 1}: especie y variedad son obligatorias`);
        return;
      }
      if (L.quality_grade_id <= 0) {
        toast.error(`Línea ${i + 1}: calidad es obligatoria`);
        return;
      }
      const net = parseLb(L.net_lb);
      if (net == null || net <= 0) {
        toast.error(`Línea ${i + 1}: neto lb es obligatorio y debe ser mayor que 0`);
        return;
      }
      const qty = Number.parseInt(L.quantity.trim(), 10);
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error(`Línea ${i + 1}: cantidad (lugs/envases) es obligatoria y debe ser ≥ 1`);
        return;
      }
      if (L.returnable_container_id <= 0) {
        toast.error(`Línea ${i + 1}: envase es obligatorio`);
        return;
      }
      const gross = parseLb(L.gross_lb);
      const linePayload: Record<string, unknown> = {
        species_id: L.species_id,
        variety_id: L.variety_id,
        quality_grade_id: L.quality_grade_id,
        net_lb: net,
        quantity: qty,
        returnable_container_id: L.returnable_container_id,
      };
      if (gross != null) linePayload.gross_lb = gross;
      const temp = parseLb(L.temperature_str);
      if (temp != null) linePayload.temperature_f = temp;
      lines.push(linePayload);
    }

    const payload = buildPayload(h, lines, editingId == null);
    if (editingId != null) {
      updateMut.mutate({ id: editingId, payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const sortedProducers = useMemo(
    () => (producers ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [producers],
  );
  const sortedVarieties = useMemo(
    () => (varieties ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [varieties],
  );

  const lineTotals = useMemo(() => {
    let net = 0;
    let gross = 0;
    let qty = 0;
    for (const L of lineDrafts) {
      const n = parseLb(L.net_lb);
      const g = parseLb(L.gross_lb);
      const q = Number.parseInt(L.quantity.trim(), 10);
      if (n != null) net += n;
      if (g != null) gross += g;
      if (Number.isFinite(q) && q > 0) qty += q;
    }
    return { net, gross, qty };
  }, [lineDrafts]);

  const lockNonStateFields = viewOnly || adminStateOnlyEdit;

  const showConfirmReceptionButton =
    !viewOnly && !adminStateOnlyEdit && editingId != null && viewStateCodigo === 'borrador' && confirmadoStateId > 0;

  /** Doc./guía o, si no hay, la referencia del sistema; el #id es siempre el id interno de base. */
  const receptionHumanLabel =
    (form.watch('document_number') ?? '').trim() || (serverReference ?? '').trim() || '';

  const receptionDialogTitle =
    viewOnly && editingId != null
      ? receptionHumanLabel
        ? t('reception.dialog.viewOnly', { label: receptionHumanLabel, id: editingId })
        : t('reception.dialog.viewOnlyNoLabel', { id: editingId })
      : adminStateOnlyEdit && editingId != null
        ? t('reception.dialog.adminState', { id: editingId })
        : editingId != null
          ? receptionHumanLabel
            ? t('reception.dialog.editWithLabel', { label: receptionHumanLabel, id: editingId })
            : t('reception.dialog.editNoLabel', { id: editingId })
          : t('reception.dialog.new');

  const helpTitle = t('reception.helpTitle');

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <Card className={errorStateCard}>
          <CardHeader>
            <CardTitle>{t('reception.loadErrorTitle')}</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : '—'}</CardDescription>
            <div className="pt-2">
              <Button type="button" variant="outline" onClick={() => void refetch()}>
                {t('reception.loadErrorRetry')}
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-0">
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent
          hideCloseButton
          fullScreenMobile
          className={cn(
            operationalModalContentClass,
            'min-h-0 max-h-[min(96vh,1000px)] max-w-[min(1024px,calc(100vw-2rem))] sm:max-w-[min(1024px,calc(100vw-2rem))] lg:max-w-[min(1050px,calc(100vw-2rem))] lg:rounded-[12px] lg:border-[var(--stone-300)] lg:shadow-[0_18px_55px_rgba(32,39,34,0.18)] [&>button]:hidden',
          )}
        >
          <DialogHeader className={cn(operationalModalHeaderClass, 'relative overflow-hidden border-b border-[var(--stone-200)] bg-[var(--stone-50)] px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4 lg:min-h-[112px] lg:px-7 lg:pb-5 lg:pt-5')}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--stone-300)] md:hidden" aria-hidden />
            <img
              src={appBranding.landscapeUrl}
              alt=""
              className="pointer-events-none absolute inset-y-0 right-[-4%] h-full w-[70%] max-w-none object-contain object-right object-bottom opacity-100 contrast-[1.08] brightness-[0.96] [mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_100%)] md:hidden lg:block lg:right-[-1%] lg:w-[58%] lg:opacity-[0.72] lg:contrast-[0.98] lg:brightness-[1.02] lg:[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.18)_18%,rgba(0,0,0,0.7)_42%,black_68%)] lg:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.18)_18%,rgba(0,0,0,0.7)_42%,black_68%)]"
              aria-hidden
            />
            <div className="relative z-[1] flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <DialogTitle className={cn(operationalModalTitleClass, 'flex items-center gap-2.5 lg:text-[26px] lg:leading-tight')}>
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--olive-700)]" aria-hidden />
                  {receptionDialogTitle}
                </DialogTitle>
                <p className="text-[13px] text-[var(--ink-muted)] lg:text-[14px]">
                  {t('reception.dialog.subtitle', { defaultValue: 'Registra la fruta que ingresa a la operación.' })}
                </p>
                <p className="max-w-[9.5rem] text-[10px] font-medium uppercase leading-[1.45] tracking-[0.18em] text-[var(--sage-700,#6B7A55)] sm:max-w-[14rem] sm:text-[11px] lg:hidden">
                  <span className="block">FRUTA DE</span>
                  <span className="block">NUESTRA TIERRA.</span>
                  <span className="block">UN FUTURO</span>
                  <span className="block">MÁS BRILLANTE.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeDialog()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--sage-100)] lg:h-9 lg:w-9"
                aria-label={t('reception.dialog.closeAriaLabel')}
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>

          {adminStateOnlyEdit ? (
            <div className="mx-6 -mt-1 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950">
              {t('reception.dialog.adminNotice')}
            </div>
          ) : null}

          <form onSubmit={form.handleSubmit(onSubmit)} className={operationalModalFormClass}>
            <div className={cn(operationalModalBodyClass, 'min-w-0 overflow-y-auto px-0 py-0 max-md:px-0 sm:px-2')}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
                <section
                  className={cn(
                    operationalModalSectionCard,
                    'min-h-0 w-full border-b border-border px-[14px] py-[14px] sm:px-4',
                  )}
                >
                  <div className={cn(operationalModalSectionHeadingRow, 'mb-3 lg:mb-4 lg:gap-3')}>
                    <span className={cn(operationalModalStepBadge, 'lg:h-9 lg:w-9 lg:text-[14px]')}>1</span>
                    <div>
                      <h3 className={cn(operationalModalStepTitle, 'lg:text-[21px]')}>{t('reception.dialog.stepOriginTitle', { defaultValue: t('reception.dialog.stepOrigin') })}</h3>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground lg:text-[12px]">
                        {t('reception.dialog.stepOriginHint')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-[10px]">
                    <div className="overflow-hidden rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] md:hidden">
                      <FieldRow icon={User} label={t('reception.dialog.fieldProducer')} required>
                        <select
                          className="w-full text-right text-sm"
                          disabled={lockNonStateFields}
                          {...form.register('producer_id', { valueAsNumber: true })}
                        >
                          <option value={0}>{t('reception.dialog.choosePlaceholder')}</option>
                          {sortedProducers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </FieldRow>
                      <FieldRow icon={FileText} label={t('reception.dialog.fieldReference')} required>
                        {editingId == null && !viewOnly ? (
                          <Input
                            className="h-9 border-0 bg-transparent px-0 text-right font-mono text-xs uppercase shadow-none"
                            maxLength={64}
                            placeholder={t('reception.dialog.fieldReferencePlaceholder')}
                            autoComplete="off"
                            {...form.register('reference_code')}
                          />
                        ) : (
                          <span className="block text-right font-mono text-xs">{serverReference ?? '—'}</span>
                        )}
                      </FieldRow>
                      <FieldRow icon={CalendarDays} label={t('reception.dialog.fieldDatetime')} required>
                        <Input
                          type="datetime-local"
                          disabled={lockNonStateFields}
                          className="h-9 border-0 bg-transparent px-0 text-right text-xs shadow-none"
                          {...form.register('received_at')}
                        />
                      </FieldRow>
                      <FieldRow icon={Leaf} label={t('reception.dialog.fieldFruitType')}>
                        <select
                          className="w-full text-right text-sm"
                          disabled={lockNonStateFields}
                          {...form.register('reception_type_id', { valueAsNumber: true })}
                        >
                          {(receptionTypes ?? [])
                            .filter((rt) => rt.activo !== false)
                            .map((rt) => (
                              <option key={rt.id} value={rt.id}>
                                {rt.codigo === 'hand_picking'
                                  ? t('reception.dialog.fruitTypeHand')
                                  : rt.codigo === 'machine_picking'
                                    ? t('reception.dialog.fruitTypeMachine')
                                    : rt.nombre}
                              </option>
                            ))}
                        </select>
                      </FieldRow>
                      <details className="group border-b-0">
                        <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-3.5 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
                          <span className="inline-flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-[var(--stone-100)] text-[var(--ink-muted)]" aria-hidden>
                            <Ellipsis className="h-4 w-4" strokeWidth={1.85} />
                          </span>
                          <span className="w-[34%] min-w-0 shrink-0 text-[13px] font-medium text-[var(--ink)]">
                            {t('reception.dialog.moreData', { defaultValue: 'Más datos' })}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-[var(--ink-muted)]">
                            Campo, transportista, vehículo…
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform group-open:rotate-90" aria-hidden />
                        </summary>
                        <div className="space-y-2 border-t border-[var(--stone-200)]/70 bg-[var(--stone-50)] px-3.5 py-3">
                          <div className="min-w-0 space-y-1">
                            <label className={compactFieldLabelClass}>{t('reception.dialog.fieldDoc')}</label>
                            <Input
                              disabled={lockNonStateFields}
                              className="h-9 rounded-md border border-[var(--stone-300)] px-2 text-xs"
                              maxLength={10}
                              placeholder={t('reception.dialog.fieldDocPlaceholder')}
                              {...form.register('document_number')}
                            />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <label className={compactFieldLabelClass}>{t('reception.dialog.fieldMarket')}</label>
                            <select
                              className="h-9 w-full rounded-md border border-[var(--stone-300)] px-2 text-xs"
                              disabled={lockNonStateFields}
                              {...form.register('mercado_id', { valueAsNumber: true })}
                            >
                              <option value={0}>—</option>
                              {(mercados ?? [])
                                .filter((m) => m.activo !== false)
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.codigo || m.nombre}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </details>
                    </div>
                    <div className="hidden grid-cols-1 gap-[10px] sm:grid-cols-2 md:grid lg:grid-cols-2">
                      <div className="min-w-0 space-y-1.5 lg:flex lg:h-11 lg:items-center lg:space-y-0 lg:overflow-hidden lg:rounded-[8px] lg:border lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)]">
                        <span className="hidden h-full w-11 shrink-0 items-center justify-center border-r border-[var(--stone-200)] text-[var(--olive-700)] lg:inline-flex" aria-hidden>
                          <PinePersonIcon size={19} />
                        </span>
                        <label className={cn(compactFieldLabelClass, 'lg:w-[112px] lg:shrink-0 lg:px-3 lg:text-[12px] lg:font-semibold lg:text-[var(--ink)]')}>
                          {t('reception.dialog.fieldProducer')} <span className="text-red-700">*</span>
                        </label>
                        <select
                          className="h-8 w-full rounded-md border border-border px-2 py-1.5 text-xs lg:h-full lg:min-w-0 lg:flex-1 lg:border-0 lg:bg-white/65 lg:px-3 lg:text-[13px] lg:shadow-none lg:outline-none"
                          disabled={lockNonStateFields}
                          {...form.register('producer_id', { valueAsNumber: true })}
                        >
                          <option value={0}>{t('reception.dialog.choosePlaceholder')}</option>
                          {sortedProducers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0 space-y-1.5 lg:flex lg:h-11 lg:items-center lg:space-y-0 lg:overflow-hidden lg:rounded-[8px] lg:border lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)]">
                        <span className="hidden h-full w-11 shrink-0 items-center justify-center border-r border-[var(--stone-200)] text-[var(--olive-700)] lg:inline-flex" aria-hidden>
                          <PineDocumentIcon size={19} />
                        </span>
                        <label className={cn(compactFieldLabelClass, 'lg:w-[132px] lg:shrink-0 lg:px-3 lg:text-[12px] lg:font-semibold lg:text-[var(--ink)]')}>
                          {t('reception.dialog.fieldReference')} <span className="text-red-700">*</span>
                        </label>
                        {editingId == null && !viewOnly ? (
                          <div className="space-y-0.5 lg:h-full lg:min-w-0 lg:flex-1 lg:space-y-0">
                            <Input
                              className="h-8 rounded-md border border-border px-2 py-1.5 font-mono text-xs uppercase lg:h-full lg:border-0 lg:bg-white/65 lg:px-3 lg:text-[13px] lg:shadow-none"
                              maxLength={64}
                              placeholder={t('reception.dialog.fieldReferencePlaceholder')}
                              autoComplete="off"
                              {...form.register('reference_code')}
                            />
                            <p className="text-[10px] leading-tight text-muted-foreground lg:hidden">
                              {t('reception.dialog.fieldReferenceHint')}
                            </p>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'flex h-8 items-center rounded-md border border-border bg-background px-2 py-1.5 text-xs',
                              serverReference ? 'font-mono text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {serverReference ??
                              (editingId == null ? t('reception.dialog.referenceAutoAssign') : '—')}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1.5 lg:flex lg:h-11 lg:items-center lg:space-y-0 lg:overflow-hidden lg:rounded-[8px] lg:border lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)]">
                        <span className="hidden h-full w-11 shrink-0 items-center justify-center border-r border-[var(--stone-200)] text-[var(--olive-700)] lg:inline-flex" aria-hidden>
                          <PineCalendarIcon size={19} />
                        </span>
                        <label className={cn(compactFieldLabelClass, 'lg:w-[112px] lg:shrink-0 lg:px-3 lg:text-[12px] lg:font-semibold lg:text-[var(--ink)]')}>
                          {t('reception.dialog.fieldDatetime')} <span className="text-red-700">*</span>
                        </label>
                        <Input
                          type="datetime-local"
                          disabled={lockNonStateFields}
                          className="h-8 rounded-md border border-border px-2 py-1.5 text-xs lg:h-full lg:min-w-0 lg:flex-1 lg:border-0 lg:bg-white/65 lg:px-3 lg:text-[13px] lg:shadow-none"
                          {...form.register('received_at')}
                        />
                      </div>
                      <div className="min-w-0 space-y-1.5 lg:flex lg:h-11 lg:items-center lg:space-y-0 lg:overflow-hidden lg:rounded-[8px] lg:border lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)]">
                        <span className="hidden h-full w-11 shrink-0 items-center justify-center border-r border-[var(--stone-200)] text-[var(--olive-700)] lg:inline-flex" aria-hidden>
                          <PineLeafIcon size={19} />
                        </span>
                        <label className={cn(compactFieldLabelClass, 'lg:w-[112px] lg:shrink-0 lg:px-3 lg:text-[12px] lg:font-semibold lg:text-[var(--ink)]')}>
                          {t('reception.dialog.fieldFruitType')} <span className="text-red-700">*</span>
                        </label>
                        <select
                          className="h-8 w-full rounded-md border border-border px-2 py-1.5 text-xs max-md:min-h-11 lg:h-full lg:min-w-0 lg:flex-1 lg:border-0 lg:bg-white/65 lg:px-3 lg:text-[13px] lg:shadow-none lg:outline-none"
                          disabled={lockNonStateFields}
                          {...form.register('reception_type_id', { valueAsNumber: true })}
                        >
                          {(receptionTypes ?? [])
                            .filter((rt) => rt.activo !== false)
                            .map((rt) => (
                              <option key={rt.id} value={rt.id}>
                                {rt.codigo === 'hand_picking'
                                  ? t('reception.dialog.fruitTypeHand')
                                  : rt.codigo === 'machine_picking'
                                    ? t('reception.dialog.fruitTypeMachine')
                                    : rt.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <details className="group mt-2 hidden rounded-md border border-border/70 bg-muted/20 px-3 py-2 md:block lg:overflow-hidden lg:rounded-[8px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:p-0">
                      <summary className="cursor-pointer select-none text-[12px] font-semibold text-slate-700 lg:flex lg:h-11 lg:list-none lg:items-center lg:gap-3 lg:px-3.5">
                        <PineEllipsisIcon size={18} className="hidden shrink-0 text-[var(--olive-700)] lg:block" />
                        <span className="lg:text-[13px] lg:text-[var(--ink)]">
                          {t('reception.dialog.moreData', { defaultValue: 'Más datos' })}
                        </span>
                        <span className="hidden min-w-0 flex-1 truncate text-right text-[11px] font-normal text-[var(--ink-muted)] lg:block">
                          Documento, mercado y estado
                        </span>
                        <ChevronRight className="hidden h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform group-open:rotate-90 lg:block" aria-hidden />
                      </summary>
                      <div className="mt-3 grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:mt-0 lg:grid-cols-3 lg:border-t lg:border-[var(--stone-200)] lg:bg-white/55 lg:p-3">
                      <div className="min-w-0 space-y-1.5">
                        <label className={compactFieldLabelClass}>{t('reception.dialog.fieldDoc')}</label>
                        <Input
                          disabled={lockNonStateFields}
                          className="h-8 rounded-md border border-border px-2 py-1.5 text-xs"
                          maxLength={10}
                          placeholder={t('reception.dialog.fieldDocPlaceholder')}
                          {...form.register('document_number')}
                        />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <label className={compactFieldLabelClass}>{t('reception.dialog.fieldMarket')}</label>
                        <select
                          className="h-8 w-full rounded-md border border-border px-2 py-1.5 text-xs"
                          disabled={lockNonStateFields}
                          {...form.register('mercado_id', { valueAsNumber: true })}
                        >
                          <option value={0}>—</option>
                          {(mercados ?? [])
                            .filter((m) => m.activo !== false)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.codigo || m.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <label className={compactFieldLabelClass}>{t('reception.dialog.fieldDocState')}</label>
                        <select
                          className="h-8 w-full rounded-md border border-border px-2 py-1.5 text-xs"
                          disabled={viewOnly}
                          {...form.register('document_state_id', { valueAsNumber: true })}
                        >
                          {(documentStates ?? [])
                            .filter((s) => s.activo !== false)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                      </div>
                    </details>
                    <input type="hidden" {...form.register('plant_code')} />
                  </div>
                </section>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
                  <section
                    className={cn(operationalModalSectionMuted, 'flex min-h-0 flex-1 flex-col border-b border-border px-[14px] py-[14px] sm:px-4 lg:bg-white')}
                  >
                    <div className="mb-4 flex shrink-0 flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between lg:items-start">
                      <div className="flex min-w-0 flex-wrap items-start gap-2">
                        <span className={cn(operationalModalStepBadge, 'lg:h-9 lg:w-9 lg:text-[14px]')}>2</span>
                        <div>
                          <h3 className={cn(operationalModalStepTitle, 'lg:text-[21px]')}>{t('reception.dialog.sectionLines')}</h3>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground lg:text-[12px]">
                            {t('reception.dialog.stepFruitHint')} · {t('reception.dialog.stepWeightHint')}
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                        <div className="flex w-full flex-nowrap items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-[46px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--olive-700)] px-3 text-[13px] font-semibold text-white hover:bg-[var(--olive-600)] disabled:opacity-50 lg:min-w-[170px] lg:px-4"
                            disabled={lockNonStateFields}
                            onClick={() =>
                              setLineDrafts((d) => {
                                return [...d, emptyLine()];
                              })
                            }
                          >
                            <PinePlusIcon size={18} className="hidden lg:block" />
                            <span>{t('reception.dialog.addLine').replace(/^\+\s*/, '')}</span>
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-[46px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--stone-300)] bg-white px-3 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--stone-100)] disabled:opacity-50 lg:min-w-[190px] lg:px-4"
                            disabled={lockNonStateFields || lineDrafts.length === 0}
                            onClick={() =>
                              setLineDrafts((d) => {
                                const prev = d[d.length - 1];
                                if (!prev) return [...d, emptyLine()];
                                return [...d, { ...prev, lot_code: undefined }];
                              })
                            }
                          >
                            <PineCopyIcon size={18} className="hidden lg:block" />
                            {t('reception.dialog.copyLastLine')}
                          </button>
                        </div>
                        <label className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--sage-100)] px-3 py-2 text-[12px] text-[var(--ink)]">
                          <Leaf className="h-3.5 w-3.5 shrink-0 text-[var(--olive-700)] lg:hidden" aria-hidden />
                          <PineLeafIcon size={17} className="hidden shrink-0 text-[var(--olive-700)] lg:block" aria-hidden />
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={applyVarietyToInvolvedLines}
                            disabled={lockNonStateFields}
                            onChange={(e) => setApplyVarietyToInvolvedLines(e.target.checked)}
                          />
                          <span className="min-w-0 flex-1 leading-snug">{t('reception.dialog.applyVariety')}</span>
                          <span
                            className={cn(
                              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              applyVarietyToInvolvedLines
                                ? 'border-[var(--olive-700)] bg-[var(--olive-700)] text-white'
                                : 'border-[var(--stone-300)] bg-white',
                            )}
                            aria-hidden
                          >
                            {applyVarietyToInvolvedLines ? '✓' : ''}
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-visible pt-1">
                      <div className="space-y-4">
                        {lineDrafts.map((L, idx) => {
                          const varietiesForSpecies = sortedVarieties.filter(
                            (v) => L.species_id <= 0 || v.species_id === L.species_id,
                          );
                          return (
                            <div key={idx} className={cn(modalFormLineCard, 'space-y-3 rounded-md bg-muted/30 p-3 lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:p-3.5')}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-700 lg:font-serif lg:text-[18px] lg:text-[var(--ink)]">
                                  {t('reception.dialog.lineLabel', { n: idx + 1 })}
                                </p>
                                <button
                                  type="button"
                                  className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 lg:h-8 lg:w-auto lg:gap-1.5 lg:border-transparent lg:bg-transparent lg:px-2 lg:text-[12px] lg:text-red-700"
                                  aria-label={t('reception.dialog.deleteLineAriaLabel', { n: idx + 1 })}
                                  title={t('reception.dialog.deleteLineTitle')}
                                  onClick={() => setLineDrafts((d) => d.filter((_, i) => i !== idx))}
                                  disabled={lockNonStateFields || lineDrafts.length <= 1}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0 lg:hidden" />
                                  <PineTrashIcon size={17} className="hidden shrink-0 lg:block" />
                                  <span className="hidden lg:inline">Eliminar</span>
                                </button>
                              </div>
                              {L.lot_code ? (
                                <p className="font-mono text-[11px] text-slate-500">
                                  {t('reception.dialog.lotPrefix')} {L.lot_code}
                                </p>
                              ) : null}

                              <div className="rounded-md border border-border/70 bg-white/70 p-2.5 lg:rounded-[8px] lg:border-[var(--stone-200)] lg:p-3">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:text-[11px]">
                                  {t('reception.dialog.stepFruit')}
                                </p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:gap-2.5 lg:[&_label]:text-[10px]">
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colSpecies')}
                                    </label>
                                    <select
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      title={
                                        (speciesList ?? []).find((s) => s.id === L.species_id)?.nombre ??
                                        (speciesList ?? []).find((s) => s.id === L.species_id)?.codigo ??
                                        '—'
                                      }
                                      disabled={lockNonStateFields}
                                      value={L.species_id}
                                      onChange={(e) => {
                                        const sid = Number(e.target.value);
                                        const firstV = sortedVarieties.find((v) => v.species_id === sid);
                                        setLineDrafts((d) =>
                                          d.map((x, i) =>
                                            i === idx ? { ...x, species_id: sid, variety_id: firstV?.id ?? 0 } : x,
                                          ),
                                        );
                                      }}
                                    >
                                      <option value={0}>—</option>
                                      {(speciesList ?? []).map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.nombre || s.codigo}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colVariety')}
                                    </label>
                                    <select
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      title={sortedVarieties.find((v) => v.id === L.variety_id)?.nombre ?? '—'}
                                      disabled={lockNonStateFields}
                                      value={L.variety_id}
                                      onChange={(e) => {
                                        const vid = Number(e.target.value);
                                        setLineDrafts((d) => {
                                          if (!applyVarietyToInvolvedLines) {
                                            return d.map((x, i) => (i === idx ? { ...x, variety_id: vid } : x));
                                          }
                                          const src = d[idx];
                                          if (!src || src.species_id <= 0) {
                                            return d.map((x, i) => (i === idx ? { ...x, variety_id: vid } : x));
                                          }
                                          return d.map((x) =>
                                            x.species_id === src.species_id ? { ...x, variety_id: vid } : x,
                                          );
                                        });
                                      }}
                                    >
                                      <option value={0}>—</option>
                                      {varietiesForSpecies.map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.nombre}
                                        </option>
                                      ))}
                                    </select>
                                    {L.species_id > 0 && varietiesForSpecies.length === 0 ? (
                                      <p className="text-[10px] text-amber-700">{t('reception.dialog.noVarieties')}</p>
                                    ) : null}
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colQuality')}
                                    </label>
                                    <select
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      title={
                                        (qualityGrades ?? []).find((q) => q.id === L.quality_grade_id)?.codigo ??
                                        (qualityGrades ?? []).find((q) => q.id === L.quality_grade_id)?.nombre ??
                                        '—'
                                      }
                                      disabled={lockNonStateFields}
                                      value={L.quality_grade_id}
                                      onChange={(e) => {
                                        const v = Number(e.target.value);
                                        setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, quality_grade_id: v } : x)));
                                      }}
                                    >
                                      <option value={0}>—</option>
                                      {(qualityGrades ?? []).map((q) => (
                                        <option key={q.id} value={q.id}>
                                          {q.codigo || q.nombre}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-md border border-border/70 bg-white/70 p-2.5 lg:rounded-[8px] lg:border-[var(--stone-200)] lg:p-3">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:text-[11px]">
                                  {t('reception.dialog.stepWeight')}
                                </p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2.5 lg:[&_label]:text-[10px]">
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colGrossLb')}
                                    </label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="0"
                                      disabled={lockNonStateFields}
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs font-medium lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      value={L.gross_lb}
                                      onChange={(e) =>
                                        setLineDrafts((d) =>
                                          d.map((x, i) => (i === idx ? { ...x, gross_lb: e.target.value } : x)),
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colNetLb')}
                                    </label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      disabled={lockNonStateFields}
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs font-medium lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      value={L.net_lb}
                                      onChange={(e) =>
                                        setLineDrafts((d) =>
                                          d.map((x, i) => (i === idx ? { ...x, net_lb: e.target.value } : x)),
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colQty')}
                                    </label>
                                    <Input
                                      disabled={lockNonStateFields}
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs font-medium lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      value={L.quantity}
                                      onChange={(e) =>
                                        setLineDrafts((d) =>
                                          d.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)),
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colContainer')}
                                    </label>
                                    <select
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      title={(() => {
                                        const c = activeContainers.find((x) => x.id === L.returnable_container_id);
                                        if (!c) return '—';
                                        return `${c.tipo}${c.capacidad ? ` · ${c.capacidad}` : ''}`;
                                      })()}
                                      disabled={lockNonStateFields}
                                      value={L.returnable_container_id}
                                      onChange={(e) => {
                                        const v = Number(e.target.value);
                                        setLineDrafts((d) =>
                                          d.map((x, i) => (i === idx ? { ...x, returnable_container_id: v } : x)),
                                        );
                                      }}
                                    >
                                      <option value={0}>—</option>
                                      {activeContainers.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.tipo}
                                          {c.capacidad ? ` · ${c.capacidad}` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <label className="block text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                      {t('reception.dialog.colTemp')}
                                    </label>
                                    <Input
                                      disabled={lockNonStateFields}
                                      className="h-8 min-w-0 w-full rounded-md border border-border px-2 py-1.5 text-xs lg:h-11 lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:px-3 lg:text-[13px]"
                                      value={L.temperature_str}
                                      onChange={(e) =>
                                        setLineDrafts((d) =>
                                          d.map((x, i) => (i === idx ? { ...x, temperature_str: e.target.value } : x)),
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  <section className={cn(operationalModalSectionCard, 'shrink-0 px-[14px] py-[14px] sm:px-4')}>
                    <div className={cn(operationalModalSectionHeadingRow, 'mb-3')}>
                      <span className={cn(operationalModalStepBadge, 'lg:h-9 lg:w-9 lg:text-[14px]')}>3</span>
                      <div>
                        <h3 className={cn(operationalModalStepTitle, 'lg:text-[21px]')}>{t('reception.dialog.stepReview')}</h3>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          {t('reception.dialog.stepReviewHint')}
                        </p>
                      </div>
                    </div>
                    <div className="mb-3 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-800">{t('reception.dialog.reviewSummary')}</p>
                      <p className="mt-1">
                        {t('reception.dialog.footerNet')}{' '}
                        <span className="font-medium">{formatLb(lineTotals.net, 2)} lb</span>
                        {' · '}
                        {t('reception.dialog.footerGross')}{' '}
                        <span className="font-medium">{formatLb(lineTotals.gross, 2)} lb</span>
                        {' · '}
                        {t('reception.dialog.footerContainers')}{' '}
                        <span className="font-medium">{formatCount(lineTotals.qty)}</span>
                        {' · '}
                        {formatCount(lineDrafts.length)} {t('reception.dialog.sectionLines').toLowerCase()}
                      </p>
                    </div>
                    <label className={compactFieldLabelClass} htmlFor="reception-notes">
                      {t('reception.dialog.notesLabel')}
                    </label>
                    <textarea
                      id="reception-notes"
                      rows={2}
                      disabled={lockNonStateFields}
                      className="h-auto min-h-[56px] w-full resize-y rounded-md border border-border px-2 py-1.5 text-xs"
                      placeholder={t('reception.dialog.notesPlaceholder')}
                      {...form.register('notes')}
                    />
                  </section>

                  {viewOnly && viewStateCodigo === 'confirmado' && editingId != null && cerradoStateId > 0 ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
                      <span>{t('reception.dialog.confirmNotice')}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={transitionMut.isPending}
                        onClick={() => transitionMut.mutate({ id: editingId, document_state_id: cerradoStateId })}
                      >
                        {transitionMut.isPending ? t('reception.dialog.closingApplying') : t('reception.dialog.closingButton')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <DialogFooter
              className={cn(
                operationalModalFooterClass,
                '!flex !flex-col gap-1.5 border-t border-[var(--stone-200)] bg-[var(--stone-50)] px-3.5 py-2 sm:!flex-row sm:items-center sm:justify-between',
                'sticky bottom-0 z-10 lg:min-h-[64px] lg:px-5 lg:py-2.5',
              )}
            >
              <div className="order-1 flex w-full flex-nowrap items-center gap-2 sm:order-2 sm:w-auto sm:justify-end">
                {showConfirmReceptionButton ? (
                  <Button
                    type="button"
                    className="bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]"
                    disabled={transitionMut.isPending}
                    onClick={() => transitionMut.mutate({ id: editingId as number, document_state_id: confirmadoStateId })}
                  >
                    <CheckCircle className="mr-1.5 h-4 w-4" />
                    {transitionMut.isPending ? t('reception.dialog.confirmingButton') : t('reception.dialog.confirmReceptionButton')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-h-10 w-[36%] flex-none rounded-[var(--radius-md)] border-[var(--stone-300)] bg-[var(--stone-100)] text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--stone-200)] sm:w-auto lg:h-11 lg:min-h-11 lg:min-w-[120px] lg:bg-white lg:px-5"
                  onClick={() => closeDialog()}
                >
                  {viewOnly ? t('reception.dialog.closeButton') : t('reception.dialog.cancelButton')}
                </Button>
                {!viewOnly ? (
                  <button
                    type="submit"
                    className={cn(
                      modalFormPrimaryButton,
                      'inline-flex h-10 min-h-10 w-[62%] flex-none items-center justify-center gap-2 text-[13px] sm:w-auto lg:h-11 lg:min-h-11 lg:min-w-[210px] lg:px-5 lg:text-[14px]',
                    )}
                    disabled={createMut.isPending || updateMut.isPending || adminPatchStateMut.isPending}
                  >
                    {!createMut.isPending && !updateMut.isPending && !adminPatchStateMut.isPending && !adminStateOnlyEdit ? (
                      <>
                        <Truck className="h-4 w-4 lg:hidden" aria-hidden />
                        <PineTruckIcon size={19} className="hidden lg:block" aria-hidden />
                      </>
                    ) : null}
                    {createMut.isPending || updateMut.isPending || adminPatchStateMut.isPending
                      ? t('reception.dialog.savingButton')
                      : adminStateOnlyEdit
                        ? t('reception.dialog.saveStateButton')
                        : t('reception.dialog.saveReception', { defaultValue: t('reception.dialog.saveButton') })}
                  </button>
                ) : null}
              </div>
              <div className="order-2 flex items-center gap-1.5 text-[9px] text-[var(--ink-muted)] sm:order-1 lg:text-[11px]">
                <Scale className="h-3 w-3 shrink-0" aria-hidden />
                <span>
                  {t('reception.dialog.footerNet')} <span className="font-medium text-[var(--ink)]">{formatLb(lineTotals.net, 2)} lb</span>
                  {' · '}{t('reception.dialog.footerGross')} <span className="font-medium text-[var(--ink)]">{formatLb(lineTotals.gross, 2)} lb</span>
                  {' · '}{t('reception.dialog.footerContainers')} <span className="font-medium text-[var(--ink)]">{formatCount(lineTotals.qty)}</span>
                </span>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closedSuccessId != null}
        onOpenChange={(o) => {
          if (!o) setClosedSuccessId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className={cn('h-5 w-5', receptionTok.ink)} />
              {t('reception.closedSuccessTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className={cn('w-full text-white', receptionTok.accent)}
              onClick={() => {
                const id = closedSuccessId;
                setClosedSuccessId(null);
                if (id != null) void openView(id);
              }}
            >
              {t('reception.closedSuccessView')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                const id = closedSuccessId;
                if (id != null) void printReceptionPdf(id);
              }}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              {t('reception.closedSuccessPdf')}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setClosedSuccessId(null)}>
              {t('reception.closedSuccessBack')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      
      <PinebloomHero
        title={t('reception.pageTitle')}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{t('reception.pageSubtitle')}</span>
            <button type="button" className={pageInfoButton} title={helpTitle} aria-label={helpTitle}>
              <Info className="h-4 w-4" />
            </button>
          </span>
        }
        compact
        wideLandscape
        receptionsDesktop
        showSeal={false}
        claimLines={['FRUTA DE NUESTRA TIERRA.', 'UN FUTURO MÁS BRILLANTE.']}
        actions={
          canOperateReception ? (
            <Button
              className={cn(
                'h-10 shrink-0 gap-2 rounded-[var(--radius-md)] bg-[var(--olive-700)] px-4 text-sm font-semibold text-white shadow-none hover:bg-[var(--olive-600)] lg:h-[52px] lg:min-w-[216px] lg:px-6 lg:text-[16px]',
              )}
              onClick={() => openNew()}
            >
              <Plus className="h-5 w-5 lg:h-6 lg:w-6" />
              {t('reception.newButton')}
            </Button>
          ) : null
        }
      />

      <section
        aria-labelledby="rec-kpis"
        className="space-y-3 lg:mt-0 lg:space-y-2.5 lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white/45 lg:px-[14px] lg:py-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rec-kpis" className="font-serif text-[18px] font-semibold text-[var(--ink)] lg:text-[20px]">
            {t('reception.srKpis')}
          </h2>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs lg:px-2 lg:text-[12px]" onClick={() => setShowSummary((v) => !v)}>
            {showSummary ? t('reception.hideSummary') : t('reception.viewSummary')}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
          <div className="flex min-h-[118px] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--sage-200)] bg-[var(--sage-100)] px-3.5 py-3.5 lg:items-center lg:gap-5 lg:py-3">
            <span className="inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--sage-200)] text-[var(--pine-950)] lg:h-[76px] lg:w-[76px] lg:rounded-[9px]" aria-hidden>
              <PineTruckIcon size={39} className="lg:h-[44px] lg:w-[44px]" />
            </span>
            <div className="min-w-0 pt-0.5 lg:pt-0">
              <p className="text-[12px] font-semibold text-[var(--ink)] lg:font-serif lg:text-[14px] lg:font-medium">{t('reception.kpi.todayShort')}</p>
              <p className="mt-1 font-serif text-[30px] font-bold tabular-nums leading-none text-[var(--ink)] lg:text-[34px]">{formatCount(todayOpsKpis.count)}</p>
              <p className="mt-1.5 text-[12px] text-[var(--ink-muted)] lg:mt-1">{t('reception.kpi.receptionsUnit', { defaultValue: 'recepciones' })}</p>
            </div>
          </div>

          <div className="flex min-h-[118px] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--harvest-200)] bg-[var(--harvest-100)] px-3.5 py-3.5 lg:items-center lg:gap-5 lg:py-3">
            <span className="inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--harvest-200)] text-[var(--harvest-700)] lg:h-[76px] lg:w-[76px] lg:rounded-[9px]" aria-hidden>
              <PineClockIcon size={38} />
            </span>
            <div className="min-w-0 pt-0.5 lg:pt-0">
              <p className="text-[12px] font-semibold text-[var(--ink)] lg:font-serif lg:text-[14px] lg:font-medium">{t('reception.kpi.pendingShort')}</p>
              <p className={cn('mt-1 font-serif text-[30px] font-bold tabular-nums leading-none lg:text-[34px]', todayOpsKpis.pending > 0 ? 'text-[var(--harvest-700)]' : 'text-[var(--ink)]')}>{formatCount(todayOpsKpis.pending)}</p>
              <p className="mt-1.5 text-[12px] text-[var(--ink-muted)] lg:mt-1">{t('reception.kpi.pendingUnit', { defaultValue: 'por procesar' })}</p>
            </div>
          </div>

          <div className="flex min-h-[118px] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--bluegray-200)] bg-[var(--bluegray-100)] px-3.5 py-3.5 lg:items-center lg:gap-5 lg:py-3">
            <span className="inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--bluegray-200)] text-[var(--bluegray-700)] lg:h-[76px] lg:w-[76px] lg:rounded-[9px]" aria-hidden>
              <PineWeightIcon size={38} />
            </span>
            <div className="min-w-0 pt-0.5 lg:pt-0">
              <p className="text-[12px] font-semibold text-[var(--ink)] lg:font-serif lg:text-[14px] lg:font-medium">{t('reception.kpi.weightShort')}</p>
              <p className="mt-1 font-serif text-[26px] font-bold tabular-nums leading-none text-[var(--ink)] lg:text-[30px]">{formatLb(todayOpsKpis.totalNet, 2)}</p>
              <p className="mt-1.5 text-[12px] text-[var(--ink-muted)] lg:mt-1">lb total recibido</p>
            </div>
          </div>

          <div className="flex min-h-[118px] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--sage-200)] bg-[var(--stone-100)] px-3.5 py-3.5 lg:items-center lg:gap-5 lg:py-3">
            <span className="inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--sage-200)] text-[var(--olive-700)] lg:h-[76px] lg:w-[76px] lg:rounded-[9px]" aria-hidden>
              <PineUsersIcon size={40} />
            </span>
            <div className="min-w-0 pt-0.5 lg:pt-0">
              <p className="text-[12px] font-semibold text-[var(--ink)] lg:font-serif lg:text-[14px] lg:font-medium">{t('reception.kpi.producersShort')}</p>
              <p className="mt-1 font-serif text-[30px] font-bold tabular-nums leading-none text-[var(--ink)] lg:text-[34px]">{formatCount(todayOpsKpis.producers)}</p>
              <p className="mt-1.5 text-[12px] text-[var(--ink-muted)] lg:mt-1">{t('reception.kpi.todayUnit', { defaultValue: 'hoy' })}</p>
            </div>
          </div>
        </div>

        {showSummary ? (
          <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.total')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nRecepciones)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.drafts')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nBorrador)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.confirmed')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nConfirmado)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.closed')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nCerrado)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.netLb')}</p>
                <p className={kpiValueMd}>{formatLb(receptionKpis.totalNet, 2)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.producers')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nProductores)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.lines')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nLineasTotal)}</p>
              </div>
              <div className={kpiCardSm}>
                <p className={kpiLabel}>{t('reception.kpi.voided')}</p>
                <p className={kpiValueMd}>{formatCount(receptionKpis.nAnulado)}</p>
              </div>
            </div>
            {receptionAlertLines.length > 0 ? (
              <div className={signalsPanel}>
                <p className={signalsTitle}>{t('reception.alerts.title')}</p>
                <ul className="space-y-2">
                  {receptionAlertLines.map((a) => (
                    <li
                      key={a.key}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-[13px] leading-snug',
                        a.tone === 'warn'
                          ? 'border-amber-200/90 bg-white text-amber-950'
                          : 'border-slate-200/90 bg-white text-slate-700',
                      )}
                    >
                      {a.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className={cn(filterPanel, 'mt-1 space-y-3 py-3.5 lg:mt-3 lg:min-h-[64px] lg:px-3.5 lg:py-[11px]')}>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['today', t('reception.filters.presetToday'), CalendarDays] as const,
              ['week', t('reception.filters.presetWeek'), CalendarRange] as const,
              ['all', t('reception.filters.presetAll'), List] as const,
            ]
          ).map(([key, label, Icon]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={datePreset === key ? 'default' : 'outline'}
              className={cn(
                'h-9 gap-1.5 rounded-md px-3 text-[13px] font-semibold lg:h-10 lg:min-w-[104px] lg:px-4',
                datePreset === key ? cn('text-white', receptionTok.accent, 'hover:opacity-95') : '',
              )}
              onClick={() => applyDatePreset(key)}
            >
              <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2} aria-hidden />
              {label}
            </Button>
          ))}
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)] lg:left-3 lg:h-4 lg:w-4" aria-hidden />
            <Input
              className={cn(filterInputClass, 'h-9 pl-8 lg:h-10 lg:pl-10')}
              placeholder={t('reception.filters.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('reception.filters.search')}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 lg:h-10 lg:min-w-[146px] lg:px-4"
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2} aria-hidden />

            {showMoreFilters ? t('reception.filters.hideFilters') : t('reception.filters.moreFilters')}
            <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', showMoreFilters ? 'rotate-180' : '')} />
          </Button>
        </div>
        {showMoreFilters ? (
          <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.dateFrom')}</Label>
              <Input
                type="date"
                className={cn(filterInputClass, 'h-8')}
                value={filterDateFrom}
                onChange={(e) => {
                  setDatePreset('all');
                  setFilterDateFrom(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.dateTo')}</Label>
              <Input
                type="date"
                className={cn(filterInputClass, 'h-8')}
                value={filterDateTo}
                onChange={(e) => {
                  setDatePreset('all');
                  setFilterDateTo(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.producer')}</Label>
              <select className={filterSelectClass} value={filterProducer} onChange={(e) => setFilterProducer(Number(e.target.value))}>
                <option value={0}>{t('reception.filters.producerAll')}</option>
                {(producers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.species')}</Label>
              <select className={filterSelectClass} value={filterSpecies} onChange={(e) => setFilterSpecies(Number(e.target.value))}>
                <option value={0}>{t('reception.filters.speciesAll')}</option>
                {(speciesList ?? []).map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.nombre || sp.codigo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.variety')}</Label>
              <select className={filterSelectClass} value={filterVariety} onChange={(e) => setFilterVariety(Number(e.target.value))}>
                <option value={0}>{t('reception.filters.varietyAll')}</option>
                {(varieties ?? [])
                  .filter((v) => filterSpecies <= 0 || v.species_id === filterSpecies)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.fruitType')}</Label>
              <select className={filterSelectClass} value={filterTipo} onChange={(e) => setFilterTipo(Number(e.target.value))}>
                <option value={0}>{t('reception.filters.fruitTypeAll')}</option>
                {(receptionTypes ?? []).map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label className="text-xs text-slate-500">{t('reception.filters.usage')}</Label>
              <select className={filterSelectClass} value={filterUso} onChange={(e) => setFilterUso(e.target.value as typeof filterUso)}>
                <option value="todos">{t('reception.filters.usageAll')}</option>
                <option value="abierto">{t('reception.filters.usageOpen')}</option>
                <option value="cerrado">{t('reception.filters.usageClosed')}</option>
              </select>
            </div>
          </div>
        ) : null}
      </div>

      <section
        className="space-y-3 lg:mt-[19px] lg:space-y-0 lg:overflow-hidden lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white"
        aria-labelledby="rec-tabla"
      >
        <div className="flex flex-wrap items-end justify-between gap-2 lg:min-h-[60px] lg:items-center lg:border-b lg:border-[var(--stone-200)] lg:px-[14px] lg:py-2">
          <div className="lg:flex lg:items-baseline lg:gap-4">
            <h2 id="rec-tabla" className={cn(sectionTitle, 'lg:font-serif lg:text-[21px] lg:leading-tight')}>
              {datePreset === 'today' ? t('reception.workTodayTitle') : t('reception.table.title')}
            </h2>
            <p className={cn(sectionHint, 'lg:hidden')}>{t('reception.workTodayHint', { count: filteredReceptions.length })}</p>
            <p className="hidden text-[12px] text-[var(--ink-muted)] lg:block">
              {filteredReceptions.length} {filteredReceptions.length === 1 ? 'recepción' : 'recepciones'}
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="mr-1 text-[12px] text-[var(--ink-muted)]">Ordenar por</span>
            <Button type="button" variant="outline" size="sm" className="h-9 min-w-[116px] justify-between gap-2 px-3 text-[12px] font-medium">
              Más reciente
              <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'detailed' ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-9 w-9 p-0',
                viewMode === 'detailed' && 'bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]',
              )}
              onClick={() => setViewMode('detailed')}
              aria-label={t('reception.table.viewDetailed')}
            >
              <List className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'compact' ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-9 w-9 p-0',
                viewMode === 'compact' && 'bg-[var(--olive-700)] text-white hover:bg-[var(--olive-600)]',
              )}
              onClick={() => setViewMode('compact')}
              aria-label={t('reception.table.viewCompact')}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            {isAdminRole || canOperateReception ? (
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs lg:h-10 lg:min-w-[142px] lg:px-4"
                  onClick={() => setShowMoreActions((v) => !v)}
                >
                  <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
                  {t('reception.moreActions')}
                </Button>
                {showMoreActions ? (
                  <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-white p-2 shadow-md">
                    {receptionKpis.nBorrador > 0 && confirmadoStateId > 0 && cerradoStateId > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start gap-1.5 px-2 py-2 text-left text-xs text-green-700"
                        onClick={() => {
                          setShowMoreActions(false);
                          void confirmAllDraftsFromList();
                        }}
                        disabled={bulkConfirmCloseDraftsMut.isPending || confirmReceptionMut.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        {t('reception.table.confirmAllButton')}
                      </Button>
                    ) : (
                      <p className="px-2 py-1 text-xs text-muted-foreground">—</p>
                    )}
                    <div className="mt-1 flex gap-1 border-t border-border/60 pt-1">
                      <Button
                        type="button"
                        variant={viewMode === 'compact' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        onClick={() => setViewMode('compact')}
                      >
                        {t('reception.table.viewCompact')}
                      </Button>
                      <Button
                        type="button"
                        variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        onClick={() => setViewMode('detailed')}
                      >
                        {t('reception.table.viewDetailed')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                <Button
                  type="button"
                  variant={viewMode === 'compact' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 rounded-md px-3 text-xs"
                  onClick={() => setViewMode('compact')}
                >
                  {t('reception.table.viewCompact')}
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 rounded-md px-3 text-xs"
                  onClick={() => setViewMode('detailed')}
                >
                  {t('reception.table.viewDetailed')}
                </Button>
              </div>
            )}
          </div>
        </div>
        {!filteredReceptions.length ? (
          <p className={emptyStatePanel}>
            {datePreset === 'today' && !search && filterProducer === 0 && filterSpecies === 0
              ? t('reception.emptyToday')
              : (receptions?.length ?? 0) === 0
                ? t('reception.emptyAll')
                : t('reception.emptyFiltered')}
          </p>
        ) : viewMode === 'compact' ? (
          <div className="space-y-2.5">
            {compactGroups.map((group, gi) => (
              <div key={group.key} className="overflow-hidden rounded-lg border border-slate-200/85 bg-white">
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-2 text-[12px] backdrop-blur supports-[backdrop-filter]:bg-muted/35">
                  <div className="min-w-0 truncate text-slate-800">
                    <span
                      className={cn(
                        'mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle',
                        ['bg-teal-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500'][gi % 4],
                      )}
                    />
                    <span className="font-semibold">{group.producerName}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span>{formatCount(group.receptions.length)} {t('reception.table.groupReceptions')}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span>{formatLb(group.totalNet, 2)} {t('reception.table.groupNetLb')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.pendingCount > 0 ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {formatCount(group.pendingCount)} {t('reception.table.groupPending')}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2 p-2 md:hidden">
                  {group.receptions.map((r) => {
                    const tone = receptionVisualTone(r);
                    const netLb = receptionNetLb(r);
                    return (
                      <div key={r.id} className={cn('rounded-lg border border-border/70 p-3', tone.rowHover)}>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <DocumentStateBadge codigo={r.document_state?.codigo} nombre={r.document_state?.nombre} />
                          <span className={cn('text-sm font-semibold tabular-nums', netLb > 0 && netLb < 400 ? 'text-amber-700' : 'text-slate-900')}>
                            {formatLb(netLb, 2)} lb
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{formatReceptionDate(r.received_at)}</p>
                        <p className="mt-1 text-sm text-slate-800">
                          {especieCabecera(r)} · {variedadCabecera(r)}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-700">
                          {r.reference_code ?? r.document_number ?? '—'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className={cn('h-10 min-w-[7.5rem] gap-1.5 px-3 text-[13px] font-bold text-white', receptionTok.accent)}
                            onClick={() => runPrimaryAction(r)}
                          >
                            {primaryActionLabel(r.document_state?.codigo)}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => void printReceptionPdf(r.id)}>
                                <Printer className="mr-2 h-3.5 w-3.5" />
                                {t('reception.table.actionReport')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="min-w-[146px]">{t('reception.table.colState')}</TableHead>
                        <TableHead className="whitespace-nowrap">{t('reception.table.colDate')}</TableHead>
                        <TableHead className="min-w-[100px]">{t('reception.table.colSpecies')}</TableHead>
                        <TableHead className="min-w-[110px]">{t('reception.table.colVariety')}</TableHead>
                        <TableHead className="min-w-[180px]">{t('reception.table.colGuide')}</TableHead>
                        <TableHead className="text-right tabular-nums">{t('reception.table.colNetLb')}</TableHead>
                        <TableHead className="w-[200px] text-right">{t('reception.table.colActions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.receptions.map((r) => {
                        const tone = receptionVisualTone(r);
                        const netLb = receptionNetLb(r);
                        const isLowNet = netLb > 0 && netLb < 400;
                        return (
                          <Fragment key={r.id}>
                            <TableRow className={cn(tableBodyRow, 'h-[68px] border-b border-slate-100/80 transition-colors', tone.rowHover)}>
                              <TableCell className="max-w-[180px] py-3 align-middle">
                                <div className="flex flex-col gap-1">
                                  <span className={cn('h-1 w-8 rounded-full', tone.leftBar)} />
                                  <DocumentStateBadge codigo={r.document_state?.codigo} nombre={r.document_state?.nombre} />
                                </div>
                              </TableCell>
                              <TableCell className="py-3 align-middle text-xs text-slate-700">{formatReceptionDate(r.received_at)}</TableCell>
                              <TableCell className="max-w-[100px] py-3 align-middle text-xs text-slate-700">{especieCabecera(r)}</TableCell>
                              <TableCell className="max-w-[120px] py-3 align-middle text-xs text-slate-700">{variedadCabecera(r)}</TableCell>
                              <TableCell className="max-w-[200px] py-3 align-middle font-mono text-xs text-slate-800">
                                {r.reference_code ?? r.document_number ?? '—'}
                                {lotesResumen(r) !== '—' ? <p className="mt-0.5 text-[9px] text-slate-500">{t('reception.table.lotPrefix')} {lotesResumen(r)}</p> : null}
                              </TableCell>
                              <TableCell className={cn('py-3 align-middle text-right tabular-nums', isLowNet ? 'text-amber-700' : 'text-slate-900')}>
                                <span className="text-[15px] font-semibold leading-none">{formatLb(netLb, 2)}</span>
                              </TableCell>
                              <TableCell className="py-3 align-middle">
                                <div className="flex flex-col items-end gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className={cn('h-10 min-w-[7.5rem] gap-1.5 px-3 text-[13px] font-bold text-white', receptionTok.accent)}
                                    onClick={() => runPrimaryAction(r)}
                                  >
                                    {primaryActionLabel(r.document_state?.codigo)}
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">{t('reception.table.moreActions', { defaultValue: 'Más acciones' })}</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      {r.document_state?.codigo === 'borrador' && canOperateReception ? (
                                        <DropdownMenuItem onClick={() => void confirmReceptionFromList(r.id)}>
                                          <CheckCircle className="mr-2 h-3.5 w-3.5" />
                                          {t('reception.table.actionConfirm')}
                                        </DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuItem onClick={() => void printReceptionPdf(r.id)}>
                                        <Printer className="mr-2 h-3.5 w-3.5" />
                                        {t('reception.table.actionReport')}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          setExpandedRows((prev) => ({
                                            ...prev,
                                            [r.id]: !prev[r.id],
                                          }))
                                        }
                                      >
                                        {expandedRows[r.id] ? <ChevronDown className="mr-2 h-3.5 w-3.5" /> : <ChevronRight className="mr-2 h-3.5 w-3.5" />}
                                        {t('reception.table.actionDetail')}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            </TableRow>
                            {expandedRows[r.id] ? (
                              <TableRow className="bg-slate-50/55">
                                <TableCell colSpan={7} className="py-2">
                                  <div className="grid grid-cols-4 gap-2 text-xs text-slate-600">
                                    <p><span className="font-semibold text-slate-800">{t('reception.table.detailId')}</span> #{r.id}</p>
                                    <p><span className="font-semibold text-slate-800">{t('reception.table.detailType')}</span> {r.reception_type?.nombre ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">{t('reception.table.detailDoc')}</span> {r.document_number ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">{t('reception.table.detailMarket')}</span> {r.mercado?.nombre ?? '—'}</p>
                                    <p className="col-span-2"><span className="font-semibold text-slate-800">{t('reception.table.detailReference')}</span> {r.reference_code ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">{t('reception.table.detailLines')}</span> {formatCount(r.lines?.length ?? 0)}</p>
                                    <p className="col-span-1"><span className="font-semibold text-slate-800">{t('reception.table.detailPlant')}</span> {r.plant_code ?? '—'}</p>
                                    <p className="col-span-2"><span className="font-semibold text-slate-800">{t('reception.table.detailLots')}</span> {lotesDetalle(r)}</p>
                                  </div>
                                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
                                    <span className="font-semibold text-slate-800">{t('reception.table.detailNotes')}</span> {r.notes?.trim() || '—'}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {filteredReceptions.map((r) => {
                const tone = receptionVisualTone(r);
                const netLb = receptionNetLb(r);
                return (
                  <div key={r.id} className={cn('rounded-xl border border-slate-200 bg-white p-3.5 shadow-none', tone.rowHover)}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <DocumentStateBadge codigo={r.document_state?.codigo} nombre={r.document_state?.nombre} />
                      <span className={cn('text-sm font-semibold tabular-nums', netLb > 0 && netLb < 400 ? 'text-amber-700' : 'text-slate-900')}>
                        {formatLb(netLb, 2)} lb
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-slate-900">{r.producer?.nombre ?? '—'}</p>
                    <p className="mt-1 text-xs text-slate-600">{formatReceptionDate(r.received_at)}</p>
                    <p className="mt-1 text-sm text-slate-800">
                      {especieCabecera(r)} · {variedadCabecera(r)}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-700">
                      {r.reference_code ?? r.document_number ?? '—'}
                    </p>
                    {r.notes?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{r.notes.trim()}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className={cn('h-10 min-w-[7.5rem] gap-1.5 px-3 text-[13px] font-bold text-white', receptionTok.accent)}
                        onClick={() => runPrimaryAction(r)}
                      >
                        {primaryActionLabel(r.document_state?.codigo)}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void printReceptionPdf(r.id)}>
                            <Printer className="mr-2 h-3.5 w-3.5" />
                            {t('reception.table.actionReport')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={cn(tableShell, 'hidden md:block lg:rounded-none lg:border-0')}>
              <Table className="w-full min-w-0 table-fixed lg:[&_td]:!py-3 lg:[&_th]:!h-12 lg:[&_th]:!py-3 lg:[&_th]:leading-none">
                <TableHeader>
                  <TableRow className={tableHeaderRow}>
                    <TableHead className="w-[112px]">{t('reception.table.colState')}</TableHead>
                    <TableHead className="w-[110px] whitespace-nowrap">{t('reception.table.colDate')}</TableHead>
                    <TableHead className="w-[145px]">{t('reception.table.colProducer')}</TableHead>
                    <TableHead className="w-[115px]">{t('reception.table.colGuide')}</TableHead>
                    <TableHead className="w-[105px]">{t('reception.table.colSpecies')}</TableHead>
                    <TableHead className="w-[90px]">{t('reception.table.colVariety')}</TableHead>
                    <TableHead className="w-[95px] text-right tabular-nums">{t('reception.table.colNetLb')}</TableHead>
                    <TableHead className="w-[155px]">{t('reception.table.colNotes')}</TableHead>
                    <TableHead className="w-[210px] text-center">{t('reception.table.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceptions.map((r) => {
                    const tone = receptionVisualTone(r);
                    const netLb = receptionNetLb(r);
                    const isLowNet = netLb > 0 && netLb < 400;
                    return (
                      <Fragment key={r.id}>
                        <TableRow className={cn(tableBodyRow, 'h-[68px] border-b border-slate-100/80 transition-colors lg:h-[78px]', tone.rowHover)}>
                          <TableCell className="max-w-[200px] py-2 align-top">
                            <div className="flex flex-col gap-1">
                              <span className={cn('h-1 w-8 rounded-full lg:h-[5px] lg:w-[42px]', tone.leftBar)} />
                              <DocumentStateBadge
                                codigo={r.document_state?.codigo}
                                nombre={r.document_state?.nombre}
                                className="lg:min-h-6 lg:px-2.5 lg:py-1 lg:text-[11px] lg:[&>svg]:h-3.5 lg:[&>svg]:w-3.5"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="py-3 align-middle text-xs text-slate-700 lg:text-[13px] lg:leading-[1.35]">{formatReceptionDate(r.received_at)}</TableCell>
                          <TableCell className="max-w-[180px] py-3 align-middle lg:py-1.5">
                            <div className="flex min-w-0 items-start gap-1.5" title={r.producer?.nombre ?? ''}>
                              <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--olive-600)]" aria-hidden />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium leading-tight text-slate-900 lg:leading-[1.25]">{r.producer?.nombre ?? '—'}</p>
                                <p className="truncate text-[11px] leading-tight text-slate-500 lg:text-[12px] lg:leading-snug">
                                  {r.producer?.codigo ? `#${r.producer.codigo}` : r.producer_id ? `#${r.producer_id}` : '—'}
                                  {' · '}#{r.id}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[180px] py-2 align-top font-mono text-xs text-slate-800 lg:text-[13px]">
                            {r.reference_code ?? r.document_number ?? '—'}
                            {lotesResumen(r) !== '—' ? <p className="mt-0.5 text-[9px] text-slate-500 lg:text-[11px] lg:leading-snug">{t('reception.table.lotPrefix')} {lotesResumen(r)}</p> : null}
                          </TableCell>
                          <TableCell className="max-w-[100px] py-3 align-middle text-xs text-slate-700 lg:text-[13px]">{especieCabecera(r)}</TableCell>
                          <TableCell className="max-w-[120px] py-3 align-middle text-xs text-slate-700 lg:text-[13px]">{variedadCabecera(r)}</TableCell>
                          <TableCell className={cn('py-3 align-middle text-right tabular-nums', isLowNet ? 'text-amber-700' : 'text-slate-900')}>
                            <span className="text-[15px] font-semibold leading-none lg:text-[16px]">
                              {formatLb(netLb, 2)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px] py-2 align-top">
                            <p className="line-clamp-2 text-[11px] leading-snug text-slate-500 lg:text-[12px] lg:leading-[1.45]" title={r.notes?.trim() ?? ''}>
                              {r.notes?.trim() || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="py-3 align-middle lg:!px-2">
                            <div className="flex flex-col items-end gap-1 lg:flex-row lg:items-center lg:justify-end lg:gap-3">
                              <Button
                                type="button"
                                size="sm"
                                className={cn('h-10 min-w-[7.5rem] gap-1.5 px-3 text-[13px] font-bold text-white lg:h-[42px] lg:min-w-[135px] lg:px-4', receptionTok.accent)}
                                onClick={() => runPrimaryAction(r)}
                              >
                                {primaryActionLabel(r.document_state?.codigo)}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 lg:h-[42px] lg:w-11 lg:rounded-[var(--radius-md)] lg:border lg:border-[var(--stone-300)] lg:bg-white">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">{t('reception.table.moreActions', { defaultValue: 'Más acciones' })}</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {r.document_state?.codigo === 'borrador' && canOperateReception ? (
                                    <DropdownMenuItem onClick={() => void confirmReceptionFromList(r.id)}>
                                      <CheckCircle className="mr-2 h-3.5 w-3.5" />
                                      {t('reception.table.actionConfirm')}
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem onClick={() => void printReceptionPdf(r.id)}>
                                    <Printer className="mr-2 h-3.5 w-3.5" />
                                    {t('reception.table.actionReport')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setExpandedRows((prev) => ({
                                        ...prev,
                                        [r.id]: !prev[r.id],
                                      }))
                                    }
                                  >
                                    {expandedRows[r.id] ? <ChevronDown className="mr-2 h-3.5 w-3.5" /> : <ChevronRight className="mr-2 h-3.5 w-3.5" />}
                                    {t('reception.table.actionDetail')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedRows[r.id] ? (
                          <TableRow className="bg-slate-50/55">
                            <TableCell colSpan={9} className="py-2">
                              <div className="grid grid-cols-4 gap-2 text-xs text-slate-600">
                                <p><span className="font-semibold text-slate-800">{t('reception.table.detailId')}</span> #{r.id}</p>
                                <p><span className="font-semibold text-slate-800">{t('reception.table.detailType')}</span> {r.reception_type?.nombre ?? '—'}</p>
                                <p><span className="font-semibold text-slate-800">{t('reception.table.detailDoc')}</span> {r.document_number ?? '—'}</p>
                                <p><span className="font-semibold text-slate-800">{t('reception.table.detailMarket')}</span> {r.mercado?.nombre ?? '—'}</p>
                                <p className="col-span-2"><span className="font-semibold text-slate-800">{t('reception.table.detailReference')}</span> {r.reference_code ?? '—'}</p>
                                <p><span className="font-semibold text-slate-800">{t('reception.table.detailLines')}</span> {formatCount(r.lines?.length ?? 0)}</p>
                                <p><span className="font-semibold text-slate-800">{t('reception.table.detailPlant')}</span> {r.plant_code ?? '—'}</p>
                                <p className="col-span-2"><span className="font-semibold text-slate-800">{t('reception.table.detailLots')}</span> {lotesDetalle(r)}</p>
                              </div>
                              <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
                                <span className="font-semibold text-slate-800">{t('reception.table.detailNotes')}</span> {r.notes?.trim() || '—'}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="hidden h-[54px] items-center justify-end gap-3 border-t border-[var(--stone-200)] px-4 pb-0.5 text-[12px] text-[var(--ink-muted)] lg:flex">
                <span>
                  Mostrando {filteredReceptions.length > 0 ? 1 : 0}–{filteredReceptions.length} de {filteredReceptions.length}
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-[42px] w-[42px] p-0 text-[var(--ink-muted)]" aria-label="Página anterior">
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </Button>
                <span className="inline-flex h-[42px] min-w-[50px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--stone-300)] bg-white px-2 font-medium text-[var(--ink)]">
                  1
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-[42px] w-[42px] p-0 text-[var(--ink-muted)]" aria-label="Página siguiente">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {showSummary ? (
      <section aria-labelledby="rec-analisis" className="space-y-3">
        <div>
          <h2 id="rec-analisis" className={sectionTitle}>
            {t('reception.analysis.title')}
          </h2>
          <p className={sectionHint}>
            {t('reception.analysis.hint', {
              avg: receptionKpis.avgLbPorRecepcion != null ? formatLb(receptionKpis.avgLbPorRecepcion, 2) : '—',
            })}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className={contentCard}>
            <CardHeader className="space-y-3 pb-4 pt-5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                {t('reception.analysis.manualVsMachine')}
              </CardDescription>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">{t('reception.analysis.manual')}</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">{formatLb(receptionKpis.lbManual, 2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">{t('reception.analysis.machine')}</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">{formatLb(receptionKpis.lbMaquina, 2)}</p>
                </div>
              </div>
              {receptionKpis.lbOtroTipo > 0.001 ? (
                <p className="text-xs text-slate-500">
                  {t('reception.analysis.otherTypes')}{' '}
                  <span className="font-medium tabular-nums text-slate-800">{formatLb(receptionKpis.lbOtroTipo, 2)}</span> lb
                </p>
              ) : null}
            </CardHeader>
          </Card>
          <Card className={contentCard}>
            <CardHeader className="space-y-2 pb-4 pt-5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                {t('reception.analysis.topVarieties')}
              </CardDescription>
              <ol className="list-none space-y-2 text-sm">
                {receptionKpis.topVariedades.length === 0 ? (
                  <li className="text-slate-500">{t('reception.analysis.topVarietiesEmpty')}</li>
                ) : (
                  receptionKpis.topVariedades.map(([name, lb], i) => (
                    <li key={name} className="flex min-w-0 justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <span className="min-w-0 truncate font-medium text-slate-800" title={name}>
                        {i + 1}. {name}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">{formatLb(lb, 2)}</span>
                    </li>
                  ))
                )}
              </ol>
            </CardHeader>
          </Card>
          <Card className={contentCard}>
            <CardHeader className="space-y-2 pb-4 pt-5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                {t('reception.analysis.topProducers')}
              </CardDescription>
              <ol className="list-none space-y-2 text-sm">
                {receptionKpis.topProductores.length === 0 ? (
                  <li className="text-slate-500">{t('reception.analysis.topProducersEmpty')}</li>
                ) : (
                  receptionKpis.topProductores.map(([name, lb], i) => (
                    <li key={name} className="flex min-w-0 justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <span className="min-w-0 truncate font-medium text-slate-800" title={name}>
                        {i + 1}. {name}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">{formatLb(lb, 2)}</span>
                    </li>
                  ))
                )}
              </ol>
            </CardHeader>
          </Card>
        </div>
      </section>
      ) : null}
    </div>
  );
}
