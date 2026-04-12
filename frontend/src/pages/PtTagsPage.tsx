import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Info, MapPin, MoreHorizontal, Pencil, Plus, Waypoints } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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
import {
  emptyStatePanel,
  filterInputClass,
  filterPanel,
  filterSelectClass,
  kpiCard,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
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
    .refine((s) => FORMAT_CODE_RE.test(s), { message: 'Patrón NxMoz, ej. 4x16oz' }),
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
  const { role } = useAuth();
  const canEditTag = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [tagOpen, setTagOpen] = useState(false);
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

  const { data: tags, isPending, isError, error } = useQuery({
    queryKey: ['pt-tags'],
    queryFn: fetchPtTags,
  });

  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: fetchProcesses,
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

  const listKpis = useMemo(() => {
    const rows = filteredTags;
    let cajas = 0;
    let lb = 0;
    let sinCliente = 0;
    let conCajas = 0;
    let sinCajas = 0;
    let uniones = 0;
    for (const t of rows) {
      cajas += t.total_cajas;
      const w = Number(t.net_weight_lb);
      if (Number.isFinite(w)) lb += w;
      if (commercialAssignment(t) === 'none') sinCliente++;
      if (t.total_cajas > 0) conCajas++;
      else sinCajas++;
      if (t.es_union_tarjas) uniones++;
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
    },
  });

  const tagClientId = tagForm.watch('client_id');
  const watchedTagFormatCode = tagForm.watch('format_code');
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
      });
    } else {
      cajasSeedKeyRef.current = '';
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

  /**
   * Sugerencia inicial de cajas al elegir proceso + formato (solo alta nueva).
   * La clave es solo proceso|formato: si incluimos lb_pt_restante, un refetch de /processes
   * cambia la clave y vuelve a pisar lo que el usuario ya escribió (p. ej. 100 → máximo).
   */
  const cajasSeedKeyRef = useRef('');
  useEffect(() => {
    if (!tagOpen) {
      if (!editTag) cajasSeedKeyRef.current = '';
      return;
    }
    if (editTag) return;
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
      const tag = await apiJson<PtTagApi>('/api/pt-tags', {
        method: 'POST',
        body: JSON.stringify({
          fecha: new Date(body.fecha).toISOString(),
          resultado: body.resultado,
          format_code: body.format_code,
          cajas_por_pallet: body.cajas_por_pallet,
          ...(body.client_id != null && body.client_id > 0 ? { client_id: body.client_id } : {}),
          ...(body.brand_id != null && body.brand_id > 0 ? { brand_id: body.brand_id } : {}),
          ...(body.bol?.trim() ? { bol: body.bol.trim() } : {}),
        }),
      });
      await apiJson(`/api/pt-tags/${tag.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          process_id: body.process_id,
          cajas_generadas: body.cajas_generadas,
        }),
      });
      return tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success('Unidad PT creada y vinculada al proceso');
      setTagOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
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
            <DialogContent className="flex max-h-[min(92vh,880px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
              <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pb-4 pt-6 pr-14 text-left">
                <DialogTitle>{editTag ? `Editar ${editTag.tag_code}` : 'Nueva unidad PT'}</DialogTitle>
                <DialogDescription className="text-pretty">
                  {editTag ? (
                    <>
                      Podés modificar <strong>fecha</strong>, <strong>tipo PT</strong>, <strong>formato</strong>,{' '}
                      <strong>proceso</strong> y <strong>cajas</strong> cuando hay una sola línea de proceso;{' '}
                      <strong>comercial</strong> (cliente, marca, BOL). Unión de varias tarjas: proceso y cajas por línea no se editan
                      aquí.
                    </>
                  ) : (
                    <>
                      Se genera <span className="font-mono">TAR-…</span> y el pallet <span className="font-mono">PF-…</span> en Existencias al
                      vincular el proceso. Elegí formato (el tope de cajas por pallet viene del maestro) y cuántas cajas cargás en total en
                      esta unidad; opcional destino comercial en la cabecera.
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
                  <div className="space-y-6">
                    <section className="rounded-xl border border-border bg-muted/20 p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-baseline gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          1
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Proceso origen</h3>
                        <span className="text-xs text-muted-foreground">
                          Procesos en borrador o confirmado con lb restante para PT; podés usar el mismo proceso en varias unidades y con
                          distintos formatos si no superás la entrada.
                        </span>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="tag-process">Proceso *</Label>
                        <select
                          id="tag-process"
                          disabled={!!editTag && editTag.items.length > 1}
                          className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
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
                          <p className="text-sm text-destructive">{tagForm.formState.errors.process_id.message}</p>
                        ) : null}
                        {editTag && editTag.items.length > 1 ? (
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            Esta unidad tiene varias líneas de proceso (p. ej. unión de tarjas). El proceso y las cajas por línea no se
                            editan desde este formulario.
                          </p>
                        ) : null}
                        {!editTag && availableProcesses.length === 0 ? (
                          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                            No hay procesos disponibles. Se listan procesos en <strong>borrador</strong> o <strong>confirmado</strong> con{' '}
                            <strong>lb restantes para PT</strong> (o sin tarja aún). Los <strong>cerrados</strong> no aparecen.
                          </p>
                        ) : null}
                        {!editTag && selectedProcForCreate && maxCajasDesdeProcesoCreate != null ? (
                          <p className="text-xs text-muted-foreground">
                            Tope para <strong>esta</strong> unidad:{' '}
                            <strong>{maxCajasDesdeProcesoCreate}</strong> cajas (lb restante para PT{' '}
                            {selectedProcForCreate.lb_pt_restante != null
                              ? fmtLbCell(selectedProcForCreate.lb_pt_restante)
                              : fmtLbCell(selectedProcForCreate.lb_entrada ?? selectedProcForCreate.peso_procesado_lb)}{' '}
                            ÷ lb/caja del formato). Si ya tenés otras unidades PT con el mismo proceso, el restante se actualiza al
                            guardar.
                          </p>
                        ) : null}
                        {editTag && editTag.items.length === 1 && selectedProcForCreate && maxCajasDesdeProcesoCreate != null ? (
                          <p className="text-xs text-muted-foreground">
                            Tope para esta línea con el formato elegido: <strong>{maxCajasDesdeProcesoCreate}</strong> cajas (considera lb
                            ya cargadas en otras tarjas). El servidor valida el tope final.
                          </p>
                        ) : null}
                        <div className="grid gap-2 sm:col-span-2">
                          <Label htmlFor="cajas_generadas">Cajas a cargar en esta unidad PT *</Label>
                          <Input
                            id="cajas_generadas"
                            type="number"
                            min={1}
                            max={maxCajasDesdeProcesoCreate ?? undefined}
                            step={1}
                            disabled={!!editTag && editTag.items.length > 1}
                            className={
                              editTag && editTag.items.length > 1
                                ? 'disabled:cursor-not-allowed disabled:opacity-70'
                                : undefined
                            }
                            {...tagForm.register('cajas_generadas', { valueAsNumber: true })}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {editTag && editTag.items.length > 1
                              ? 'Total agregado de varias líneas; no se edita aquí.'
                              : editTag
                                ? 'Total de cajas de la línea (una sola línea de proceso). Validación en servidor según lb y packout.'
                                : 'Total de cajas que asignás a esta tarja. No se rellena sola con el máximo del proceso: el valor por defecto es el tope solo como referencia; podés bajarlo (p. ej. 100).'}
                          </p>
                          {tagForm.formState.errors.cajas_generadas ? (
                            <p className="text-sm text-destructive">{tagForm.formState.errors.cajas_generadas.message}</p>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-baseline gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          2
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Tarja y formato</h3>
                        <span className="text-xs text-muted-foreground">
                          Fecha de la unidad, tipo PT y presentación (cajas por pallet según mantenedor del formato)
                        </span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="tag-fecha">Fecha</Label>
                          <Input id="tag-fecha" type="datetime-local" {...tagForm.register('fecha')} />
                          {tagForm.formState.errors.fecha && (
                            <p className="text-sm text-destructive">{tagForm.formState.errors.fecha.message}</p>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>Tipo de producto PT</Label>
                          <select
                            className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            {...tagForm.register('resultado')}
                          >
                            {RESULTADOS_PT.map((r) => (
                              <option key={r} value={r}>
                                {labelPtProductoPt(r)}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-muted-foreground">
                            Suele ser <span className="font-semibold">Cajas</span>; el stock consolidado lo ves en Inventario cámara.
                          </p>
                        </div>
                        <div className="grid gap-2 sm:col-span-2">
                          <Label htmlFor="format_code">Formato de presentación (N×Moz) *</Label>
                          {activePresFormats.length > 0 ? (
                            <select
                              id="format_code"
                              className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            <Input placeholder="NxMoz, ej. 4x16oz" {...tagForm.register('format_code')} />
                          )}
                          {tagForm.formState.errors.format_code && (
                            <p className="text-sm text-destructive">{tagForm.formState.errors.format_code.message}</p>
                          )}
                        </div>
                        <div className="grid gap-2 sm:col-span-2">
                          <Label>Cajas por pallet físico (mantenedor)</Label>
                          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                            <span className="font-semibold tabular-nums">{tagForm.watch('cajas_por_pallet')}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              cajas por pallet — definido en <strong>Mantenedores → Formatos</strong> para{' '}
                              <span className="font-mono">{watchedTagFormatCode || '—'}</span>
                              {selectedPresFormat?.max_boxes_per_pallet != null
                                ? ''
                                : ' (sin tope en maestro: se usa 1; conviene cargar max. cajas/pallet en el formato)'}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            No se ingresa a mano: al cambiar el formato se toma el tope del maestro. El total de cajas de la unidad es el
                            campo de la sección 1 (solo en el alta).
                          </p>
                          {tagForm.formState.errors.cajas_por_pallet && (
                            <p className="text-sm text-destructive">{tagForm.formState.errors.cajas_por_pallet.message}</p>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          ·
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Lectura del mantenedor</h3>
                        <span className="text-xs text-muted-foreground">Solo informativo según el formato elegido</span>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Misma lectura que en otros formularios de stock: tipo de caja y etiqueta clamshell.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground">Tipo de caja (empaque)</Label>
                          <p className="text-sm font-medium">
                            {selectedPresFormat?.box_kind === 'mano'
                              ? 'Mano'
                              : selectedPresFormat?.box_kind === 'maquina'
                                ? 'Máquina'
                                : 'Sin definir — Mantenedores → Formatos'}
                          </p>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground">Etiqueta clamshell</Label>
                          <p className="text-sm font-medium">
                            {selectedPresFormat?.clamshell_label_kind === 'generica'
                              ? 'Genérica'
                              : selectedPresFormat?.clamshell_label_kind === 'marca'
                                ? 'Marca'
                                : 'Sin definir — Mantenedores → Formatos'}
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-muted/20 p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-baseline gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          3
                        </span>
                        <h3 className="text-sm font-semibold tracking-tight">Comercial (opcional)</h3>
                        <span className="text-xs text-muted-foreground">Cliente, marca y referencia prevista</span>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {editTag
                          ? 'Podés asignar o cambiar cliente, marca y referencia; se guardan al pulsar Guardar cambios.'
                          : 'La lista de marcas se filtra según el cliente (incluye marcas genéricas).'}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Cliente comercial (previsto)</Label>
                          <select
                            className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                        <div className="grid gap-2">
                          <Label>Marca (etiqueta clamshell)</Label>
                          <select
                            className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                        <div className="grid gap-2 sm:col-span-2">
                          <Label htmlFor="tag-bol-prev">BOL prevista / referencia comercial</Label>
                          <Input
                            id="tag-bol-prev"
                            placeholder="Ej. referencia de orden o comentario corto"
                            {...tagForm.register('bol')}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Referencia en planta; no reemplaza la BOL definitiva del despacho.
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <DialogFooter className="shrink-0 gap-2 border-t border-border bg-muted/15 px-6 py-4">
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
                        ? 'Creando…'
                        : 'Crear unidad PT'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
            <p className={kpiFootnote}>Suma en vista</p>
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
                      <span className="font-mono text-sm font-semibold text-slate-900">{tag.tag_code}</span>
                      <span className="ml-2 font-mono text-[11px] text-slate-400">#{tag.id}</span>
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
