import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, HelpCircle, Info, Link2Off, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson, downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
import { DataTable } from '@/components/data/DataTable';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatLb, formatPercent } from '@/lib/number-format';
import {
  contentCard,
  emptyStateBanner,
  filterInputClass,
  filterSelectClass,
  kpiCard,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  kpiValueMd,
  pageInfoButton,
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
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
  signalsTitle,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

/** Mínimo para cruzar con /existencias-pt (evita import circular con ExistenciasPtPage). */
type ExistenciaSnapRow = {
  tarja_ids?: number[];
  dispatch_id: number | null;
  status: string;
};

export type EligibleMpLine = {
  reception_line_id: number;
  reception_id: number;
  received_at: string;
  line_order: number;
  available_lb: number;
  net_lb_line: string;
  /** Lote de recepción (trazabilidad). */
  lot_code: string;
  species_id: number | null;
  species_nombre: string | null;
  variety_nombre: string | null;
};

type SpeciesProcessComponentRow = {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  master_activo: boolean;
};

type ProducerOption = { id: number; nombre: string; codigo: string | null };

export type ProcessMachineOption = {
  id: number;
  codigo: string;
  nombre: string;
  kind: 'single' | 'double';
  activo: boolean;
};

type ProcessAllocationApi = { reception_line_id: number; lot_code: string; lb_allocated: string };

export type FruitProcessRow = {
  id: number;
  recepcion_id: number;
  reception_line_id: number | null;
  process_machine_id?: number | null;
  process_machine_codigo?: string | null;
  process_machine_nombre?: string | null;
  process_machine_kind?: string | null;
  fecha_proceso: string;
  productor_id: number;
  variedad_id: number;
  especie_id: number | null;
  especie_nombre: string | null;
  productor_nombre: string | null;
  variedad_nombre: string | null;
  temperatura_f: string | null;
  nota: string | null;
  process_status?: 'borrador' | 'confirmado' | 'cerrado';
  allocations?: ProcessAllocationApi[];
  lb_entrada: string | null;
  lb_iqf: string | null;
  lb_packout: string | null;
  lb_packout_planned?: string | null;
  lb_packout_asociado?: string | null;
  lb_packout_restante?: string | null;
  lb_sobrante: string | null;
  peso_procesado_lb: string;
  merma_lb: string;
  porcentaje_procesado: string;
  resultado: string;
  tarja_id: number | null;
  /** True si aún queda lb de entrada para cargar en otra unidad PT (varias tarjas por proceso). */
  puede_nueva_unidad_pt?: boolean;
  /** Lb ya cargadas en tarjas PT (suma por formato). */
  lb_pt_asignadas?: string | null;
  /** Lb de entrada aún disponibles para nuevas tarjas PT. */
  lb_pt_restante?: string | null;
  lb_producto_terminado?: string | null;
  lb_desecho?: string | null;
  lb_merma_balance?: string | null;
  balance_closed?: boolean;
  received_at?: string | null;
  reception_ref_suggestion?: string | null;
  /** Referencia estilo recepción (código guardado o productor+MMDD, ej. PB0407). */
  reception_ref_for_pallet?: string | null;
  entrada_lb_basis?: string | null;
  lb_packout_asociado_pct_of_entrada?: string;
  lb_packout_restante_pct_of_entrada?: string;
  components?: Array<{
    id: number;
    codigo: string;
    nombre: string;
    lb_value: string;
    pct_of_entrada?: string;
  }>;
  created_at: string;
};

/** Listado /api/pt-tags (misma forma que Unidad PT). */
type PtTagListRow = {
  id: number;
  tag_code: string;
  format_code: string;
  fecha: string;
  total_cajas: number;
  /** Alineado al backend: no suma al packout del proceso (etiqueta repallet unificada). */
  excluida_suma_packout?: boolean;
  client_id?: number | null;
  brand_id?: number | null;
  bol?: string | null;
  net_weight_lb?: string | null;
  items: Array<{
    id: number;
    tarja_id: number;
    process_id: number;
    productor_id: number;
    cajas_generadas: number;
    pallets_generados: number;
  }>;
};

function processRowMatchesGlobalSearch(r: FruitProcessRow, s: string): boolean {
  if (!s) return true;
  if (String(r.id).includes(s)) return true;
  if (r.productor_nombre?.toLowerCase().includes(s)) return true;
  if (r.variedad_nombre?.toLowerCase().includes(s)) return true;
  if (r.especie_nombre?.toLowerCase().includes(s)) return true;
  if (r.nota?.toLowerCase().includes(s)) return true;
  for (const a of r.allocations ?? []) {
    if (a.lot_code?.toLowerCase().includes(s)) return true;
  }
  return false;
}

function palletDisponibleDeposito(r: ExistenciaSnapRow): boolean {
  return r.status === 'definitivo' && (r.dispatch_id == null || Number(r.dispatch_id) <= 0);
}

function tagOperativoLabel(
  tagId: number,
  tag: PtTagListRow,
  exRows: ExistenciaSnapRow[] | undefined,
): { label: string; detail: string } {
  const rows = exRows ?? [];
  const hits = rows.filter((row) => (row.tarja_ids ?? []).some((tid) => Number(tid) === tagId));
  if (hits.some((h) => h.dispatch_id != null && Number(h.dispatch_id) > 0)) {
    return { label: 'En despacho', detail: 'Pallet asociado a despacho' };
  }
  if (hits.some((h) => h.status === 'asignado_pl')) {
    return { label: 'Asignado', detail: 'Reservado en packing list' };
  }
  if (hits.some((h) => palletDisponibleDeposito(h))) {
    return { label: 'Disponible', detail: 'Stock en cámara / depósito' };
  }
  const cid = tag.client_id != null ? Number(tag.client_id) : 0;
  if (cid > 0) {
    return { label: 'Asignado', detail: 'Cliente previsto en unidad PT' };
  }
  return { label: 'Sin asignación', detail: 'Sin cliente en tarja' };
}

function fmtLb2(v: string | number | null | undefined) {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return formatLb(n, 2);
}

function formatProcessDateShort(iso: string) {
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

function ProcessStatusBadge({ status }: { status?: string }) {
  const s = (status ?? 'borrador') as 'borrador' | 'confirmado' | 'cerrado';
  const map = {
    borrador: 'border-slate-200/90 bg-slate-100 text-slate-700',
    confirmado: 'border-sky-200/70 bg-sky-50 text-sky-900',
    cerrado: 'border-emerald-200/70 bg-emerald-50 text-emerald-900',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize leading-none',
        map[s] ?? map.borrador,
      )}
    >
      {s}
    </span>
  );
}

function rendimientoVisualTone(pct: number | null): {
  badge: string;
  text: string;
  bar: string;
  label: string;
} {
  if (pct == null || !Number.isFinite(pct)) {
    return { badge: 'border-slate-200 bg-slate-50 text-slate-700', text: 'text-slate-700', bar: 'bg-slate-300', label: '—' };
  }
  if (pct >= 90) {
    return { badge: 'border-emerald-200 bg-emerald-50 text-emerald-900', text: 'text-emerald-900', bar: 'bg-emerald-400', label: 'Rend. OK' };
  }
  if (pct >= 75) {
    return { badge: 'border-amber-200 bg-amber-50 text-amber-900', text: 'text-amber-900', bar: 'bg-amber-400', label: 'Atención' };
  }
  return { badge: 'border-rose-200 bg-rose-50 text-rose-900', text: 'text-rose-900', bar: 'bg-rose-400', label: 'Bajo · Atención' };
}

function parseRendimientoPct(r: FruitProcessRow): number | null {
  const v = Number(r.porcentaje_procesado);
  if (Number.isFinite(v)) return v;
  const entrada = Number(r.lb_entrada ?? r.peso_procesado_lb);
  const pack = Number(r.lb_packout_asociado ?? r.lb_packout ?? 0);
  if (!Number.isFinite(entrada) || entrada <= 0 || !Number.isFinite(pack)) return null;
  return (pack / entrada) * 100;
}

/** Merma registrada (lb), alineada a reporting: lb_sobrante + lb_merma_balance, o merma_lb si la suma es ~0. */
function mermaRegistradaLb(r: FruitProcessRow): number {
  const EPS = 1e-6;
  const lbM = Number(r.lb_sobrante ?? 0) + Number(r.lb_merma_balance ?? 0);
  if (lbM > EPS) return lbM;
  return Number(r.merma_lb ?? 0);
}

/** Columna tabla: componentes activos con lb; respaldo a columnas legacy si no hay filas en `fruit_process_component_values`. */
function processComponentsTableCell(r: FruitProcessRow) {
  const comps = r.components ?? [];
  const parts: string[] = [];
  const titleParts: string[] = [];
  for (const c of comps) {
    const n = Number(c.lb_value);
    if (!Number.isFinite(n) || Math.abs(n) < 0.001) continue;
    const pct = c.pct_of_entrada != null && c.pct_of_entrada !== '—' ? ` · ${c.pct_of_entrada}%` : '';
    parts.push(`${c.nombre}: ${fmtLb2(c.lb_value)} lb${pct}`);
    titleParts.push(`${c.nombre} (${c.codigo}): ${fmtLb2(c.lb_value)} lb — ${c.pct_of_entrada ?? '—'}% de lb entrada`);
  }
  if (parts.length > 0) {
    return (
      <span className="text-xs leading-snug max-w-[min(320px,32vw)] inline-block align-top" title={titleParts.join(' · ')}>
        {parts.join(' · ')}
      </span>
    );
  }
  const legacy: string[] = [];
  if (r.lb_iqf != null && Number(r.lb_iqf) > 0.001) legacy.push(`iqf ${fmtLb2(r.lb_iqf)}`);
  if (r.lb_sobrante != null && Number(r.lb_sobrante) > 0.001) legacy.push(`merma ${fmtLb2(r.lb_sobrante)}`);
  if (legacy.length > 0) {
    return <span className="text-xs leading-snug">{legacy.join(' · ')}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const createProcessSchema = z.object({
  process_machine_id: z.coerce.number().int().min(0).optional(),
  fecha_proceso: z.string().min(1, 'Requerido'),
  nota: z.string().optional(),
});

type CreateProcessForm = z.infer<typeof createProcessSchema>;

const weightsPatchSchema = z.object({
  nota: z.string().optional(),
});

type WeightsPatchForm = z.infer<typeof weightsPatchSchema>;

const ALLOC_EPS = 0.02;

type ProcessStatusUi = 'borrador' | 'confirmado' | 'cerrado';

/** En alta, packout desde tarjas = 0. Si cargás lb en componentes (especie), deben sumar la entrada; si no cargás nada, no aplica esta regla. */
function destinoMatchesEntrada(entrada: number, packFromTags: number, componentsTotal: number): boolean {
  const p = packFromTags ?? 0;
  return Math.abs(entrada - (p + componentsTotal)) <= ALLOC_EPS;
}

function fetchProcesses() {
  return apiJson<FruitProcessRow[]>('/api/processes');
}

function fetchEligibleLines(producerId: number) {
  return apiJson<EligibleMpLine[]>(`/api/processes/eligible-lines?producer_id=${producerId}`);
}

export function ProcessesPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  /** Cerrar y reabrir a borrador vía PATCH; el resto de transiciones sigue siendo solo admin. */
  const canChangeProcessStatus = isAdmin || role === 'supervisor';
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const focusPid = Number(searchParams.get('processId') || '') || null;
  const weightsOpenedFromUrlRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [producerId, setProducerId] = useState(0);
  const [allocDrafts, setAllocDrafts] = useState<Record<number, string>>({});
  const [createComponentsDraft, setCreateComponentsDraft] = useState<Record<number, number>>({});
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightsRow, setWeightsRow] = useState<FruitProcessRow | null>(null);
  const [weightComponentsDraft, setWeightComponentsDraft] = useState<Record<number, number>>({});
  const [adminStatusDraft, setAdminStatusDraft] = useState<ProcessStatusUi>('borrador');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['processes'],
    queryFn: fetchProcesses,
  });

  const { data: producers } = useQuery({
    queryKey: ['masters', 'producers'],
    queryFn: () => apiJson<ProducerOption[]>('/api/masters/producers'),
  });

  const { data: producerIdsWithMp } = useQuery({
    queryKey: ['processes', 'producers-with-eligible-mp'],
    queryFn: () => apiJson<number[]>('/api/processes/producers-with-eligible-mp'),
  });

  const { data: ptTags } = useQuery({
    queryKey: ['pt-tags'],
    queryFn: () => apiJson<PtTagListRow[]>('/api/pt-tags'),
  });

  const navigate = useNavigate();

  const { data: existenciasForModal } = useQuery({
    queryKey: ['existencias-pt', 'process-modal'],
    queryFn: () =>
      apiJson<ExistenciaSnapRow[]>(`/api/final-pallets/existencias-pt?solo_deposito=0&excluir_anulados=1`),
    enabled: weightsOpen && weightsRow != null,
    staleTime: 45_000,
  });

  const { data: commercialClients } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string }[]>('/api/masters/clients'),
  });

  const { data: presFormats } = useQuery({
    queryKey: ['masters', 'formats'],
    queryFn: () => apiJson<{ format_code: string; activo: boolean }[]>('/api/masters/presentation-formats'),
  });

  const [filterProducer, setFilterProducer] = useState(0);
  const [filterVariedad, setFilterVariedad] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterProcessClient, setFilterProcessClient] = useState(0);
  const [filterProcessFormat, setFilterProcessFormat] = useState('');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');

  const producersForCreate = useMemo(() => {
    if (!producers?.length) return [];
    if (!producerIdsWithMp) return producers;
    if (producerIdsWithMp.length === 0) return [];
    return producers.filter((p) => producerIdsWithMp.includes(p.id));
  }, [producers, producerIdsWithMp]);

  const { data: processMachines } = useQuery({
    queryKey: ['masters', 'process-machines'],
    queryFn: () => apiJson<ProcessMachineOption[]>('/api/masters/process-machines'),
    enabled: open,
  });

  const activeMachineByKind = useMemo(() => {
    const out: Partial<Record<'single' | 'double', ProcessMachineOption>> = {};
    for (const m of processMachines ?? []) {
      if (!m.activo) continue;
      if (!out[m.kind]) out[m.kind] = m;
    }
    return out;
  }, [processMachines]);

  const tagById = useMemo(() => {
    const m = new Map<number, PtTagListRow>();
    for (const t of ptTags ?? []) m.set(t.id, t);
    return m;
  }, [ptTags]);

  const linkedPtRowsForModal = useMemo(() => {
    if (!weightsRow || !ptTags) return [];
    const pid = weightsRow.id;
    const out: Array<{ tag: PtTagListRow; item: PtTagListRow['items'][0] }> = [];
    for (const t of ptTags) {
      /** Misma regla que Σ lb packout en servidor (excluye tarja solo-etiqueta repallet). */
      if (t.excluida_suma_packout) continue;
      for (const it of t.items) {
        if (it.process_id !== pid) continue;
        out.push({ tag: t, item: it });
      }
    }
    return out;
  }, [weightsRow, ptTags]);

  const linkedPtModalStats = useMemo(() => {
    let cajas = 0;
    let lbSum = 0;
    const rows = linkedPtRowsForModal.length;
    for (const { tag, item } of linkedPtRowsForModal) {
      cajas += item.cajas_generadas;
      const net = Number(tag.net_weight_lb);
      const tot = tag.total_cajas;
      if (Number.isFinite(net) && net > 0 && tot > 0) {
        lbSum += (net * item.cajas_generadas) / tot;
      }
    }
    return { rows, cajas, lbSum };
  }, [linkedPtRowsForModal]);

  const formatFilterOptions = useMemo(() => {
    const s = new Set<string>();
    for (const f of presFormats ?? []) {
      if (f.activo !== false) s.add(f.format_code);
    }
    for (const t of ptTags ?? []) s.add(t.format_code);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [presFormats, ptTags]);

  const { data: eligibleLines, isFetching: eligibleLoading } = useQuery({
    queryKey: ['processes', 'eligible-lines', producerId],
    queryFn: () => fetchEligibleLines(producerId),
    enabled: open && producerId > 0,
  });

  const form = useForm<CreateProcessForm>({
    resolver: zodResolver(createProcessSchema),
    defaultValues: {
      process_machine_id: 0,
      fecha_proceso: toDatetimeLocalValue(new Date().toISOString()),
      nota: '',
    },
  });

  const createSpeciesId = useMemo(() => {
    for (const ln of eligibleLines ?? []) {
      const raw = (allocDrafts[ln.reception_line_id] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0 && ln.species_id != null && ln.species_id > 0) return ln.species_id;
    }
    return null;
  }, [eligibleLines, allocDrafts]);

  const { data: createSpeciesComponents } = useQuery({
    queryKey: ['masters', 'species', createSpeciesId, 'process-result-components'],
    queryFn: () => apiJson<SpeciesProcessComponentRow[]>(`/api/masters/species/${createSpeciesId}/process-result-components`),
    enabled: open && producerId > 0 && createSpeciesId != null && createSpeciesId > 0,
  });

  const activeCreateComponents = useMemo(
    () => (createSpeciesComponents ?? []).filter((c) => c.activo && c.master_activo),
    [createSpeciesComponents],
  );

  useEffect(() => {
    if (!activeCreateComponents.length) {
      setCreateComponentsDraft({});
      return;
    }
    setCreateComponentsDraft((prev) => {
      const next: Record<number, number> = {};
      for (const c of activeCreateComponents) {
        next[c.id] = prev[c.id] ?? 0;
      }
      return next;
    });
  }, [activeCreateComponents]);

  const createComponentsTotal = useMemo(() => {
    const ids = new Set(activeCreateComponents.map((c) => c.id));
    return Object.entries(createComponentsDraft).reduce((s, [id, v]) => {
      if (!ids.has(Number(id))) return s;
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [activeCreateComponents, createComponentsDraft]);

  const entradaSum = useMemo(() => {
    if (!eligibleLines?.length) return 0;
    let s = 0;
    for (const ln of eligibleLines) {
      const raw = (allocDrafts[ln.reception_line_id] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) s += n;
    }
    return s;
  }, [eligibleLines, allocDrafts]);

  /** En el formulario de alta aún no hay tarjas: packout = 0. */
  const packoutFromTagsCreate = 0;
  const diferenciaRep = entradaSum - packoutFromTagsCreate - createComponentsTotal;

  useEffect(() => {
    setAllocDrafts({});
  }, [producerId]);

  const weightsForm = useForm<WeightsPatchForm>({
    resolver: zodResolver(weightsPatchSchema),
    defaultValues: {},
  });
  const componentsEditTotal = Object.values(weightComponentsDraft).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

  /** Valores de reparto / KPI del modal editar proceso (alineado al PATCH de pesos). */
  const processEditModalSnapshot = useMemo(() => {
    if (!weightsRow) return null;
    const entrada =
      weightsRow.lb_entrada != null && weightsRow.lb_entrada !== ''
        ? Number(weightsRow.lb_entrada)
        : Number(weightsRow.peso_procesado_lb);
    const packTarjas = Number(weightsRow.lb_packout_planned ?? 0);
    const packPallets = Number(weightsRow.lb_packout_asociado ?? 0);
    const packoutProductLb = Math.max(packTarjas, packPallets);
    const components = componentsEditTotal;
    const pendiente = entrada - packoutProductLb - components;
    const ok = Math.abs(pendiente) < ALLOC_EPS;
    const merma = Number(weightsRow.merma_lb ?? 0);
    return {
      entrada,
      lbEnPtPlan: packTarjas,
      packPallets,
      packoutProductLb,
      components,
      pendiente,
      ok,
      merma,
    };
  }, [weightsRow, componentsEditTotal]);

  type CreateMutationBody = CreateProcessForm & {
    allocations: { reception_line_id: number; lb_allocated: number }[];
    producer_id: number;
    components?: { component_id: number; lb_value: number }[];
  };

  const mutation = useMutation({
    mutationFn: (body: CreateMutationBody) => {
      const payload: Record<string, unknown> = {
        producer_id: body.producer_id,
        allocations: body.allocations,
        fecha_proceso: new Date(body.fecha_proceso).toISOString(),
        merma_lb: 0,
      };
      if (body.process_machine_id && body.process_machine_id > 0) {
        payload.process_machine_id = body.process_machine_id;
      }
      if (body.nota?.trim()) payload.nota = body.nota.trim();
      if (body.components?.length) payload.components = body.components;
      return apiJson('/api/processes', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success('Proceso registrado');
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weightsMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: WeightsPatchForm & { components?: Array<{ component_id: number; lb_value: number }> } }) =>
      apiJson(`/api/processes/${id}/weights`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: async (_data, variables) => {
      toast.success('Pesos actualizados');
      await queryClient.invalidateQueries({ queryKey: ['processes'] });
      const list = await queryClient.fetchQuery({
        queryKey: ['processes'],
        queryFn: fetchProcesses,
      });
      const row = list.find((r) => r.id === variables.id);
      if (row) {
        setWeightsRow(row);
        const nextDraft: Record<number, number> = {};
        for (const c of row.components ?? []) {
          nextDraft[c.id] = Number(c.lb_value || 0);
        }
        setWeightComponentsDraft(nextDraft);
        weightsForm.reset({ nota: row.nota ?? '' });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/processes/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success('Proceso confirmado');
      setWeightsOpen(false);
      setWeightsRow(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cerradoMut = useMutation({
    mutationFn: (id: number) =>
      apiJson(`/api/processes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'cerrado' }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success('Proceso cerrado');
      setWeightsOpen(false);
      setWeightsRow(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adminEstadoMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ProcessStatusUi }) =>
      apiJson(`/api/processes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: async (_data, variables) => {
      toast.success('Estado del proceso actualizado');
      await queryClient.invalidateQueries({ queryKey: ['processes'] });
      await queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      const list = await queryClient.fetchQuery({ queryKey: ['processes'], queryFn: fetchProcesses });
      const row = list.find((r) => r.id === variables.id);
      if (row) {
        setWeightsRow(row);
        setAdminStatusDraft((row.process_status ?? 'borrador') as ProcessStatusUi);
        const nextDraft: Record<number, number> = {};
        for (const c of row.components ?? []) {
          nextDraft[c.id] = Number(c.lb_value || 0);
        }
        setWeightComponentsDraft(nextDraft);
        weightsForm.reset({ nota: row.nota ?? '' });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (weightsRow) {
      setAdminStatusDraft((weightsRow.process_status ?? 'borrador') as ProcessStatusUi);
    }
  }, [weightsRow?.id, weightsRow?.process_status]);

  function submitNewProcess(v: CreateProcessForm) {
    if (!producerId || producerId <= 0) {
      toast.error('Elegí un productor.');
      return;
    }
    const allocations: { reception_line_id: number; lb_allocated: number }[] = [];
    for (const ln of eligibleLines ?? []) {
      const raw = (allocDrafts[ln.reception_line_id] ?? '').trim();
      if (!raw) continue;
      const lb = Number(raw);
      if (!Number.isFinite(lb) || lb <= 0) {
        toast.error('Revisá los lb indicados por línea.');
        return;
      }
      if (lb > ln.available_lb + ALLOC_EPS) {
        toast.error(`Línea R${ln.reception_id}: no podés vaciar más que el saldo (${fmtLb2(ln.available_lb)} lb).`);
        return;
      }
      allocations.push({ reception_line_id: ln.reception_line_id, lb_allocated: lb });
    }
    if (allocations.length === 0) {
      toast.error('Indicá lb a vaciar en al menos una línea con saldo.');
      return;
    }
    const sum = allocations.reduce((s, a) => s + a.lb_allocated, 0);
    const userFilledCreateComponents =
      activeCreateComponents.length > 0 && createComponentsTotal > ALLOC_EPS;
    if (
      userFilledCreateComponents &&
      !destinoMatchesEntrada(sum, packoutFromTagsCreate, createComponentsTotal)
    ) {
      toast.error('Lb entrada debe ser igual a componentes (en alta el packout desde unidades PT es 0). O vaciá los componentes.');
      return;
    }
    const sendComponents = userFilledCreateComponents;
    mutation.mutate({
      ...v,
      producer_id: producerId,
      allocations,
      components: sendComponents
        ? activeCreateComponents.map((c) => ({
            component_id: c.id,
            lb_value: createComponentsDraft[c.id] ?? 0,
          }))
        : undefined,
    });
  }

  const openWeights = useCallback(
    (row: FruitProcessRow) => {
      setWeightsRow(row);
      weightsForm.reset({
        nota: row.nota ?? '',
      });
      const nextDraft: Record<number, number> = {};
      for (const c of row.components ?? []) {
        nextDraft[c.id] = Number(c.lb_value || 0);
      }
      setWeightComponentsDraft(nextDraft);
      setWeightsOpen(true);
    },
    [weightsForm],
  );

  useEffect(() => {
    weightsOpenedFromUrlRef.current = false;
  }, [focusPid]);

  useEffect(() => {
    if (!data?.length || !focusPid) return;
    if (weightsOpenedFromUrlRef.current) return;
    const row = data.find((r) => r.id === focusPid);
    if (!row) {
      toast.error(`No se encontró el proceso #${focusPid}.`);
      return;
    }
    weightsOpenedFromUrlRef.current = true;
    openWeights(row);
  }, [data, focusPid, openWeights]);

  const focusRow = focusPid != null ? data?.find((r) => r.id === focusPid) : undefined;

  const varietyOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of data ?? []) {
      if (r.variedad_id && r.variedad_nombre) m.set(r.variedad_id, r.variedad_nombre);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filteredProcesses = useMemo(() => {
    let rows = data ?? [];
    if (filterProducer > 0) rows = rows.filter((r) => r.productor_id === filterProducer);
    if (filterVariedad > 0) rows = rows.filter((r) => r.variedad_id === filterVariedad);
    if (filterStatus === 'vinculable_pt') {
      rows = rows.filter(
        (r) =>
          r.tarja_id == null &&
          !r.balance_closed &&
          (r.process_status ?? 'borrador') !== 'cerrado',
      );
    } else if (filterStatus !== 'todos') {
      rows = rows.filter((r) => (r.process_status ?? 'borrador') === filterStatus);
    }
    if (filterProcessFormat.trim()) {
      const fc = filterProcessFormat.trim().toLowerCase();
      rows = rows.filter((r) => {
        if (r.tarja_id == null) return false;
        const tag = tagById.get(r.tarja_id);
        return tag?.format_code?.trim().toLowerCase() === fc;
      });
    }
    if (filterProcessClient > 0) {
      rows = rows.filter((r) => {
        if (r.tarja_id == null) return false;
        const tag = tagById.get(r.tarja_id);
        return Number(tag?.client_id ?? 0) === filterProcessClient;
      });
    }
    return rows;
  }, [data, filterProducer, filterVariedad, filterStatus, filterProcessFormat, filterProcessClient, tagById]);

  const sortedFilteredProcesses = useMemo(() => {
    return [...filteredProcesses].sort((a, b) => b.id - a.id);
  }, [filteredProcesses]);

  const compactGroups = useMemo(() => {
    const byProducer = new Map<
      string,
      {
        key: string;
        producerName: string;
        rows: FruitProcessRow[];
        lbEntrada: number;
        lbPackout: number;
        weightedRend: number | null;
        count: number;
        borradorCount: number;
        cerradoCount: number;
        hasLowRend: boolean;
        hasHighMerma: boolean;
      }
    >();
    for (const r of filteredProcesses) {
      const producerName = r.productor_nombre?.trim() || `Productor #${r.productor_id}`;
      const key = `${r.productor_id}:${producerName}`;
      const bucket = byProducer.get(key) ?? {
        key,
        producerName,
        rows: [],
        lbEntrada: 0,
        lbPackout: 0,
        weightedRend: null,
        count: 0,
        borradorCount: 0,
        cerradoCount: 0,
        hasLowRend: false,
        hasHighMerma: false,
      };
      const entrada = Number(r.lb_entrada ?? r.peso_procesado_lb);
      const pack = Number(r.lb_packout_asociado ?? r.lb_packout ?? 0);
      const rend = parseRendimientoPct(r);
      const merma = mermaRegistradaLb(r);
      const mermaPct = Number.isFinite(entrada) && entrada > 0 ? (merma / entrada) * 100 : 0;
      bucket.rows.push(r);
      if (Number.isFinite(entrada)) bucket.lbEntrada += entrada;
      if (Number.isFinite(pack)) bucket.lbPackout += pack;
      bucket.count += 1;
      if ((r.process_status ?? 'borrador') === 'borrador') bucket.borradorCount += 1;
      if ((r.process_status ?? 'borrador') === 'cerrado') bucket.cerradoCount += 1;
      if (rend != null && rend < 78) bucket.hasLowRend = true;
      if (mermaPct >= 15) bucket.hasHighMerma = true;
      byProducer.set(key, bucket);
    }

    return [...byProducer.values()]
      .map((g) => {
        const weightedRend = g.lbEntrada > 0 ? (g.lbPackout / g.lbEntrada) * 100 : null;
        return {
          ...g,
          weightedRend,
          rows: g.rows.slice().sort((a, b) => new Date(b.fecha_proceso).getTime() - new Date(a.fecha_proceso).getTime()),
        };
      })
      .sort((a, b) => b.lbEntrada - a.lbEntrada);
  }, [filteredProcesses]);

  const processKpis = useMemo(() => {
    const rows = filteredProcesses;
    const ids = new Set(rows.map((r) => r.id));
    let lbEntrada = 0;
    let lbPack = 0;
    let lbMerma = 0;
    let lbJugo = 0;
    let lbDesecho = 0;
    for (const r of rows) {
      const e = Number(r.lb_entrada ?? r.peso_procesado_lb);
      if (Number.isFinite(e)) lbEntrada += e;
      const p = Number(r.lb_packout_planned ?? r.lb_packout ?? 0);
      if (Number.isFinite(p)) lbPack += p;
      const comps = r.components ?? [];
      const directDes = Number(r.lb_desecho);
      for (const c of comps) {
        const cod = (c.codigo ?? '').toUpperCase();
        const nom = (c.nombre ?? '').toLowerCase();
        const v = Number(c.lb_value);
        if (!Number.isFinite(v)) continue;
        if (cod.includes('JUGO') || nom.includes('jugo')) lbJugo += v;
        else if (cod.includes('MERMA') || nom.includes('merma')) lbMerma += v;
        else if (!(Number.isFinite(directDes) && directDes > 0) && (cod.includes('DESECH') || nom.includes('desecho')))
          lbDesecho += v;
      }
      if (Number.isFinite(directDes) && directDes > 0) lbDesecho += directDes;
    }
    const rendimientoPct = lbEntrada > 0.001 ? (lbPack / lbEntrada) * 100 : null;

    let totalCajas = 0;
    const cajasPorFormato = new Map<string, number>();
    const cajasPorCliente = new Map<string, number>();
    for (const t of ptTags ?? []) {
      for (const it of t.items) {
        if (!ids.has(it.process_id)) continue;
        const cj = it.cajas_generadas ?? 0;
        totalCajas += cj;
        const fk = t.format_code?.trim() || '—';
        cajasPorFormato.set(fk, (cajasPorFormato.get(fk) ?? 0) + cj);
        const cid = t.client_id != null ? Number(t.client_id) : 0;
        const clab =
          cid > 0 ? (commercialClients ?? []).find((c) => c.id === cid)?.nombre ?? `#${cid}` : 'Sin cliente';
        cajasPorCliente.set(clab, (cajasPorCliente.get(clab) ?? 0) + cj);
      }
    }

    const sortedFormato = [...cajasPorFormato.entries()].sort((a, b) => b[1] - a[1]);
    const sortedCliente = [...cajasPorCliente.entries()].sort((a, b) => b[1] - a[1]);
    return {
      lbEntrada,
      lbPack,
      lbMerma,
      lbJugo,
      lbDesecho,
      rendimientoPct,
      totalCajas,
      topFormatos: sortedFormato.slice(0, 3),
      topClientes: sortedCliente.slice(0, 3),
    };
  }, [filteredProcesses, ptTags, commercialClients]);

  const columns = useMemo<ColumnDef<FruitProcessRow>[]>(
    () => [
      {
        id: 'estado',
        header: 'Estado',
        cell: ({ row }) => <ProcessStatusBadge status={row.original.process_status} />,
      },
      {
        id: 'productor',
        header: 'Productor',
        cell: ({ row }) => (
          <span className="font-medium text-slate-900">{row.original.productor_nombre ?? row.original.productor_id}</span>
        ),
      },
      {
        id: 'variedad',
        header: 'Variedad',
        cell: ({ row }) => (
          <span className="text-slate-800">{row.original.variedad_nombre ?? row.original.variedad_id}</span>
        ),
      },
      {
        accessorKey: 'fecha_proceso',
        header: 'Fecha',
        cell: ({ getValue }) => (
          <span className="text-xs text-slate-600">{formatProcessDateShort(getValue() as string)}</span>
        ),
      },
      {
        id: 'lb_in',
        header: 'Lb entrada',
        cell: ({ row }) => <span className="tabular-nums text-slate-800">{fmtLb2(row.original.lb_entrada)}</span>,
      },
      {
        id: 'lb_pack',
        header: 'Lb packout',
        cell: ({ row }) => {
          const fa = fmtLb2(row.original.lb_packout_asociado);
          const fb = fmtLb2(row.original.lb_packout_restante);
          if (fa === '—' && fb === '—') {
            return <span className="text-slate-400">—</span>;
          }
          const body =
            fa === fb || fa === '—' || fb === '—'
              ? `${fa !== '—' ? fa : fb} lb`
              : `${fa} · ${fb} lb`;
          return (
            <span className="tabular-nums text-sm text-slate-800" title="Packout asociado · restante">
              {body}
            </span>
          );
        },
      },
      {
        accessorKey: 'porcentaje_procesado',
        header: 'Rend.',
        cell: ({ row }) => {
          const rend = parseRendimientoPct(row.original);
          const rt = rendimientoVisualTone(rend);
          return (
            <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', rt.badge)}>
              {rend != null ? `${formatPercent(rend, 1)}%` : '—'}
            </span>
          );
        },
      },
      {
        id: 'lb_merma',
        header: 'Merma',
        cell: ({ row }) => {
          const m = mermaRegistradaLb(row.original);
          if (!Number.isFinite(m) || Math.abs(m) < 0.001) {
            return <span className="text-slate-400">—</span>;
          }
          return (
            <span className="tabular-nums text-xs text-slate-700" title="Merma registrada">
              {fmtLb2(m)} lb
            </span>
          );
        },
      },
      {
        id: 'componentes',
        header: 'Componentes',
        cell: ({ row }) => processComponentsTableCell(row.original),
      },
      {
        id: 'acciones',
        header: () => <span className="text-right">Acciones</span>,
        cell: ({ row }) => {
          const cerrado = row.original.process_status === 'cerrado';
          const adminEdit = cerrado && isAdmin;
          return (
            <div className="flex min-w-[148px] items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-slate-200 bg-white px-2.5 text-xs font-medium shadow-sm"
                onClick={() => openWeights(row.original)}
                title={
                  cerrado && !isAdmin
                    ? 'Solo lectura (proceso cerrado)'
                    : adminEdit
                      ? 'Editar (admin): proceso cerrado'
                      : 'Editar proceso'
                }
              >
                {adminEdit ? (
                  <>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </>
                ) : cerrado ? (
                  'Ver'
                ) : (
                  'Editar'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                onClick={async () => {
                  try {
                    await downloadPdf(`/api/documents/processes/${row.original.id}/pdf`, `proceso-${row.original.id}.pdf`);
                    toast.success('PDF descargado');
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Error al descargar');
                  }
                }}
              >
                PDF
              </Button>
            </div>
          );
        },
      },
    ],
    [openWeights, isAdmin],
  );

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
          <p className="font-semibold">Error al cargar procesos</p>
          <p className="mt-1 text-rose-800/90">{error instanceof Error ? error.message : 'Reintentá más tarde.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-inter space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className={pageTitle}>Procesos de fruta</h1>
            <button
              type="button"
              className={pageInfoButton}
              title="Lb entrada = reparto por línea; packout desde unidades PT. Estados: borrador → confirmar → cerrado."
              aria-label="Ayuda sobre procesos"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className={pageSubtitle}>Operación y liquidación por proceso.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setProducerId(0);
              setAllocDrafts({});
              setCreateComponentsDraft({});
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-10 shrink-0 gap-2 rounded-xl px-5 shadow-sm">
              <Plus className="h-4 w-4" />
              Nuevo proceso
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
                  Nuevo proceso
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(submitNewProcess)} className={operationalModalFormClass}>
              <div className={cn(operationalModalBodyClass, 'lg:overflow-hidden lg:px-8 lg:py-6')}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:grid lg:max-h-[min(82vh,860px)] lg:grid-cols-[minmax(min(320px,100%),min(460px,44vw))_minmax(0,1fr)] lg:items-start lg:gap-8 lg:overflow-hidden">
                  <section
                    className={cn(
                      operationalModalSectionMuted,
                      'flex min-h-0 flex-col gap-2 overflow-hidden lg:flex-1 lg:min-h-0',
                    )}
                  >
                    <div className={operationalModalSectionHeadingRow}>
                      <span className={operationalModalStepBadge}>1</span>
                      <h3 className={operationalModalStepTitle}>Origen MP (recepciones)</h3>
                    </div>
                    <div className="grid shrink-0 gap-2">
                      <Label className="text-xs">Productor</Label>
                      <select
                        className={filterSelectClass}
                        value={producerId}
                        onChange={(e) => setProducerId(Number(e.target.value))}
                      >
                        <option value={0}>Elegir productor…</option>
                        {producersForCreate.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                            {p.codigo ? ` (${p.codigo})` : ''}
                          </option>
                        ))}
                      </select>
                      {producerIdsWithMp && producersForCreate.length === 0 ? (
                        <p className="text-sm text-amber-700 dark:text-amber-500">
                          Ningún productor tiene fruta disponible en recepción para procesar. Revisá recepciones abiertas.
                        </p>
                      ) : null}
                      {eligibleLoading && producerId > 0 ? (
                        <p className="text-xs text-muted-foreground">Cargando líneas con saldo…</p>
                      ) : null}
                      {producerId > 0 && eligibleLines && eligibleLines.length === 0 && !eligibleLoading ? (
                        <p className="text-sm text-amber-700 dark:text-amber-500">
                          No hay líneas con saldo disponible para este productor.
                        </p>
                      ) : null}
                    </div>
                      {eligibleLines && eligibleLines.length > 0 ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-card p-3">
                          <Label className="shrink-0 text-sm">Vaciar MP (varias recepciones / líneas)</Label>
                          <p className="shrink-0 text-xs text-muted-foreground">
                            Indicá cuántas lb tomás de cada línea (hasta el saldo disponible). La suma define las{' '}
                            <strong>lb entrada</strong>.
                          </p>
                          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                            {eligibleLines.map((ln) => (
                              <div
                                key={ln.reception_line_id}
                                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 px-2.5 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
                              >
                                <div className="min-w-0 flex-1 break-words text-sm leading-snug text-muted-foreground">
                                  <span className="text-foreground">R{ln.reception_id}</span>
                                  {' · '}
                                  <span className="text-foreground">L{ln.line_order + 1}</span>
                                  {' · '}
                                  <span className="font-mono text-foreground">{ln.lot_code}</span>
                                  <span className="text-muted-foreground">
                                    {' '}
                                    {ln.species_nombre}/{ln.variety_nombre}
                                  </span>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                                  <span className="whitespace-nowrap text-xs text-slate-600">saldo {fmtLb2(ln.available_lb)} lb</span>
                                  <Input
                                    className={cn(filterInputClass, 'h-9 w-[7.5rem] shrink-0 sm:w-32')}
                                    placeholder="lb"
                                    inputMode="decimal"
                                    value={allocDrafts[ln.reception_line_id] ?? ''}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      let v = raw;
                                      const n = Number(String(raw).replace(',', '.'));
                                      if (raw !== '' && Number.isFinite(n) && n > ln.available_lb) {
                                        v = fmtLb2(ln.available_lb);
                                      }
                                      setAllocDrafts((prev) => ({
                                        ...prev,
                                        [ln.reception_line_id]: v,
                                      }));
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                  </section>

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:min-h-0 lg:max-h-[min(82vh,860px)] lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5">
                  <section className={operationalModalSectionCard}>
                    <div className={cn(operationalModalSectionHeadingRow, 'mb-3')}>
                      <span className={operationalModalStepBadge}>2</span>
                      <h3 className={operationalModalStepTitle}>Fecha y línea de proceso</h3>
                    </div>
                    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs" htmlFor="fecha_proceso">
                          Fecha / hora proceso
                        </Label>
                        <Input
                          id="fecha_proceso"
                          type="datetime-local"
                          className={filterInputClass}
                          {...form.register('fecha_proceso')}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Línea de proceso (máquina)</Label>
                        <select className={filterSelectClass} {...form.register('process_machine_id', { valueAsNumber: true })}>
                          <option value={0}>Elegir línea…</option>
                          {activeMachineByKind.single ? <option value={activeMachineByKind.single.id}>Línea single</option> : null}
                          {activeMachineByKind.double ? <option value={activeMachineByKind.double.id}>Línea double</option> : null}
                        </select>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          Configurá máquinas en <strong>Mantenedores → Líneas de proceso</strong>.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className={operationalModalSectionCard}>
                    <div className={cn(operationalModalSectionHeadingRow, 'mb-3')}>
                      <span className={operationalModalStepBadge}>3</span>
                      <h3 className={operationalModalStepTitle}>Entrada y nota</h3>
                    </div>
                    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Lb entrada (suma del reparto)</Label>
                        <Input
                          readOnly
                          className={cn(filterInputClass, 'bg-muted/50')}
                          value={entradaSum > 0 ? fmtLb2(entradaSum) : ''}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Nota</Label>
                        <Input className={filterInputClass} {...form.register('nota')} />
                      </div>
                    </div>
                    {createSpeciesId == null ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Indicá lb en al menos una línea con saldo para determinar la especie y cargar los componentes de resultado.
                      </p>
                    ) : null}
                  </section>

                  <section className={operationalModalSectionMuted}>
                    <div className={cn(operationalModalSectionHeadingRow, 'mb-3')}>
                      <span className={operationalModalStepBadge}>4</span>
                      <h3 className={operationalModalStepTitle}>Componentes (resultado)</h3>
                    </div>
                    {activeCreateComponents.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {activeCreateComponents.map((c) => (
                          <div key={c.id} className="grid gap-1">
                            <Label className="text-xs">{c.nombre}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className={filterInputClass}
                              value={createComponentsDraft[c.id] ?? 0}
                              onChange={(e) =>
                                setCreateComponentsDraft((prev) => ({
                                  ...prev,
                                  [c.id]: Number(e.target.value || 0),
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : createSpeciesId != null ? (
                      <p className="text-xs text-muted-foreground">No hay componentes activos para esta especie en mantenedores.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Los componentes aparecen cuando hay reparto en líneas y la especie queda determinada.
                      </p>
                    )}
                  </section>

                  <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                    {entradaSum > 0 ? (
                      <p className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] leading-snug text-blue-800">
                        En alta no hay unidades PT aún: packout = 0. Si cargás componentes, deben sumar la{' '}
                        <strong className="text-blue-900">lb entrada</strong>.
                      </p>
                    ) : null}
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Calculadora de cuadre</p>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-200/95 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Lb entrada</p>
                        <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums leading-none text-slate-900">
                          {fmtLb2(entradaSum)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200/95 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Lb packout</p>
                        <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums leading-none text-slate-900">
                          {fmtLb2(packoutFromTagsCreate)}
                        </p>
                        <p className="mt-1 text-[9px] leading-tight text-slate-400">Desde PT (en alta: 0)</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/95 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Componentes</p>
                        <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums leading-none text-slate-900">
                          {fmtLb2(createComponentsTotal)}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'rounded-xl border px-3 py-3 shadow-sm',
                          Math.abs(diferenciaRep) < ALLOC_EPS
                            ? 'border-emerald-200/90 bg-emerald-50/60'
                            : 'border-amber-200/80 bg-amber-50/45',
                        )}
                      >
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Diferencia</p>
                        <p className="mt-1 font-mono text-lg font-semibold tabular-nums leading-none text-slate-900">
                          {fmtLb2(diferenciaRep)}
                          <span className="ml-1 text-[10px] font-sans font-normal text-slate-500">lb</span>
                        </p>
                        <p className="mt-1 text-[9px] leading-tight text-slate-500">entrada − packout − componentes</p>
                      </div>
                    </div>
                    {activeCreateComponents.length > 0 ? (
                      <div className="mt-4 space-y-1.5 rounded-lg border border-border/70 bg-muted/15 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Detalle componentes</p>
                        <ul className="space-y-1 text-xs">
                          {activeCreateComponents.map((c) => (
                            <li key={c.id} className="flex justify-between gap-3 tabular-nums">
                              <span className="min-w-0 break-words text-muted-foreground">{c.nombre}</span>
                              <span className="shrink-0 font-mono font-medium">{fmtLb2(createComponentsDraft[c.id] ?? 0)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className={operationalModalFooterClass}>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <section aria-labelledby="proc-kpis" className="space-y-3">
        <h2 id="proc-kpis" className="sr-only">
          Indicadores del listado filtrado
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cn(kpiCard, 'border-blue-200 bg-blue-50')}>
            <p className={kpiLabel}>Lb entrada</p>
            <p className={cn(kpiValueLg, 'text-blue-700')}>{fmtLb2(processKpis.lbEntrada)}</p>
            <p className={kpiFootnote}>Suma filtrada</p>
          </div>
          <div className={cn(kpiCard, 'border-green-200 bg-green-50')}>
            <p className={kpiLabel}>Lb packout</p>
            <p className={cn(kpiValueLg, 'text-green-700')}>{fmtLb2(processKpis.lbPack)}</p>
            <p className={kpiFootnote}>Planificado / acumulado</p>
          </div>
          <div
            className={cn(
              kpiCard,
              processKpis.rendimientoPct != null
                ? processKpis.rendimientoPct >= 90
                  ? 'border-green-200 bg-green-50'
                  : processKpis.rendimientoPct >= 75
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-red-200 bg-red-50'
                : '',
            )}
          >
            <p className={kpiLabel}>Rendimiento</p>
            <p
              className={cn(
                kpiValueLg,
                processKpis.rendimientoPct != null
                  ? processKpis.rendimientoPct >= 90
                    ? 'text-green-700'
                    : processKpis.rendimientoPct >= 75
                      ? 'text-amber-700'
                      : 'text-red-700'
                  : '',
              )}
            >
              {processKpis.rendimientoPct != null ? `${formatPercent(processKpis.rendimientoPct, 2)}%` : '—'}
            </p>
            <p className={kpiFootnote}>Packout / entrada</p>
          </div>
          <div className={cn(kpiCard, 'border-blue-200 bg-blue-50')}>
            <p className={kpiLabel}>Cajas producidas</p>
            <p className={cn(kpiValueLg, 'text-blue-700')}>{formatCount(processKpis.totalCajas)}</p>
            <p className={kpiFootnote}>Desde unidades PT</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div
            className={cn(
              kpiCardSm,
              processKpis.lbEntrada > 0
                ? (processKpis.lbMerma / processKpis.lbEntrada) * 100 > 15
                  ? 'border-red-200 bg-red-50'
                  : (processKpis.lbMerma / processKpis.lbEntrada) * 100 > 8
                    ? 'border-amber-200 bg-amber-50'
                    : ''
                : '',
            )}
          >
            <p className={kpiLabel}>Merma</p>
            <p
              className={cn(
                kpiValueMd,
                processKpis.lbEntrada > 0
                  ? (processKpis.lbMerma / processKpis.lbEntrada) * 100 > 15
                    ? 'text-red-700'
                    : (processKpis.lbMerma / processKpis.lbEntrada) * 100 > 8
                      ? 'text-amber-700'
                      : ''
                  : '',
              )}
            >
              {fmtLb2(processKpis.lbMerma)}
            </p>
            <p className={kpiFootnote}>Vista filtrada</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Jugo</p>
            <p className={kpiValueMd}>{fmtLb2(processKpis.lbJugo)}</p>
            <p className={kpiFootnote}>Vista filtrada</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Desecho</p>
            <p className={kpiValueMd}>{fmtLb2(processKpis.lbDesecho)}</p>
            <p className={kpiFootnote}>Vista filtrada</p>
          </div>
        </div>
      </section>

      {focusPid != null ? (
        <div className="rounded-2xl border border-sky-100/80 bg-sky-50/30 px-4 py-3 sm:px-5">
          {data && !focusRow ? (
            <p className={emptyStateBanner}>No hay proceso #{focusPid} en el listado.</p>
          ) : focusRow ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">#{focusRow.id}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-600">
                  Packout {fmtLb2(focusRow.lb_packout_asociado)} / {fmtLb2(focusRow.lb_packout_restante)} · Ajustá el 100% en editar.
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 shrink-0 rounded-lg"
                onClick={() => openWeights(focusRow)}
              >
                Editar proceso
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Cargando…</p>
          )}
        </div>
      ) : null}

      <Dialog
        open={weightsOpen}
        onOpenChange={(o) => {
          setWeightsOpen(o);
          if (!o) {
            setWeightsRow(null);
            setWeightComponentsDraft({});
          }
        }}
      >
        <DialogContent
          className={cn(
            operationalModalContentClass,
            'min-h-0 max-h-[min(96vh,1000px)] max-w-[min(1280px,calc(100vw-2rem))] sm:max-w-[min(1280px,calc(100vw-2rem))] [&>button]:hidden',
          )}
        >
          <DialogHeader className={operationalModalHeaderClass}>
            <div className="flex items-center justify-between">
              <DialogTitle className={cn(operationalModalTitleClass, 'flex items-center gap-2')}>
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 rounded-full',
                    weightsRow?.process_status === 'cerrado'
                      ? 'bg-[#1D9E75]'
                      : weightsRow?.process_status === 'confirmado'
                        ? 'bg-[#EF9F27]'
                        : 'bg-[#E24B4A]',
                  )}
                />
                Proceso #{weightsRow?.id ?? '—'}
              </DialogTitle>
              <button
                type="button"
                onClick={() => setWeightsOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
            <DialogDescription className="text-[11px] text-muted-foreground">
              {(weightsRow?.productor_nombre ?? '—')} · {(weightsRow?.variedad_nombre ?? '—')} ·{' '}
              {weightsRow?.fecha_proceso ? formatProcessDateShort(weightsRow.fecha_proceso) : '—'} · Entrada:{' '}
              {weightsRow?.lb_entrada != null ? `${fmtLb2(weightsRow.lb_entrada)} lb` : '—'}
            </DialogDescription>
          </DialogHeader>

          {weightsRow && processEditModalSnapshot ? (
            <div className={operationalModalFormClass}>
              <div className={cn(operationalModalBodyClass, 'lg:overflow-hidden lg:px-8 lg:py-5')}>
                <div className="shrink-0 space-y-4 pb-4">
                  <div className="flex min-w-0 flex-wrap gap-2">
                    <div className="min-w-[9.75rem] max-w-full flex-1 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        Entrada
                      </p>
                      <p className="mt-0.5 text-base font-bold tabular-nums leading-none">
                        {fmtLb2(processEditModalSnapshot.entrada)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">lb</p>
                    </div>
                    <div
                      className="min-w-[9.75rem] max-w-full flex-1 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm"
                      title="Lb planificadas en unidades PT (cache). El cuadre usa el máximo entre esto y pallets PF asociados."
                    >
                      <p className="flex flex-wrap items-center gap-x-0.5 gap-y-0 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        En PT
                        <HelpCircle className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                      </p>
                      <p className="mt-0.5 text-base font-bold tabular-nums leading-none">
                        {fmtLb2(processEditModalSnapshot.lbEnPtPlan)}
                      </p>
                      {processEditModalSnapshot.packPallets > processEditModalSnapshot.lbEnPtPlan + 0.01 ? (
                        <p className="mt-0.5 text-[9px] text-amber-700 dark:text-amber-400">PF asoc. &gt; plan PT</p>
                      ) : (
                        <p className="text-[9px] text-muted-foreground">plan</p>
                      )}
                    </div>
                    <div className="min-w-[9.75rem] max-w-full flex-1 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        Componentes
                      </p>
                      <p className="mt-0.5 text-base font-bold tabular-nums leading-none">
                        {fmtLb2(processEditModalSnapshot.components)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">lb (borrador)</p>
                    </div>
                    <div className="min-w-[9.75rem] max-w-full flex-1 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        Pendiente
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-base font-bold tabular-nums leading-none',
                          processEditModalSnapshot.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                        )}
                      >
                        {fmtLb2(processEditModalSnapshot.pendiente)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{processEditModalSnapshot.ok ? 'Cuadrado' : 'Ajustar'}</p>
                    </div>
                    <div className="min-w-[9.75rem] max-w-full flex-1 rounded-lg border border-border bg-muted/25 px-2.5 py-2 sm:min-w-[12rem]">
                      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">Estado</p>
                      <div className="mt-1">
                        <ProcessStatusBadge status={weightsRow.process_status} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:max-h-[min(72vh,780px)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] lg:gap-6 lg:overflow-hidden">
                  <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:min-h-0">
                  <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-3 shadow-sm">
                    <div className="mb-2 flex shrink-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">Unidades PT vinculadas</h3>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {linkedPtModalStats.rows} tarjas · {formatCount(linkedPtModalStats.cajas)} cajas ·{' '}
                          {linkedPtModalStats.rows === 0 ? '—' : fmtLb2(linkedPtModalStats.lbSum)} lb
                        </p>
                      </div>
                      {linkedPtRowsForModal.length > 1 && canChangeProcessStatus ? (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-9 shrink-0 gap-1.5 px-4 text-xs font-semibold"
                          disabled={adminEstadoMut.isPending}
                          onClick={() => {
                            if (!weightsRow) return;
                            adminEstadoMut.mutate({ id: weightsRow.id, status: 'borrador' });
                          }}
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                          Desvincular todas
                        </Button>
                      ) : null}
                    </div>
                    {linkedPtRowsForModal.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Ninguna unidad PT referencia este proceso.</p>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-md border border-border/80">
                        <Table className="min-w-[680px] text-xs [&_td]:py-1.5 [&_th]:h-8 [&_th]:py-1.5 [&_th]:text-[10px]">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="whitespace-nowrap">Unidad PT</TableHead>
                              <TableHead>Formato</TableHead>
                              <TableHead className="text-right tabular-nums">Cajas</TableHead>
                              <TableHead className="text-right tabular-nums">LB (aprox.)</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead className="text-right">Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {linkedPtRowsForModal.map(({ tag, item }) => {
                              const op = tagOperativoLabel(tag.id, tag, existenciasForModal);
                              const lbCell = (() => {
                                const net = Number(tag.net_weight_lb);
                                const tot = tag.total_cajas;
                                if (Number.isFinite(net) && net > 0 && tot > 0) {
                                  return fmtLb2((net * item.cajas_generadas) / tot);
                                }
                                return '—';
                              })();
                              const clientLab =
                                tag.client_id != null && Number(tag.client_id) > 0
                                  ? (commercialClients ?? []).find((c) => c.id === Number(tag.client_id))?.nombre ?? `#${tag.client_id}`
                                  : '—';
                              return (
                                <TableRow key={`${tag.id}-${item.id}`}>
                                  <TableCell className="font-mono font-semibold text-foreground">{tag.tag_code}</TableCell>
                                  <TableCell className="max-w-[120px] truncate" title={tag.format_code}>
                                    {tag.format_code}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{item.cajas_generadas}</TableCell>
                                  <TableCell className="text-right tabular-nums">{lbCell}</TableCell>
                                  <TableCell>
                                    <span className="inline-flex max-w-[120px] flex-col gap-0.5" title={op.detail}>
                                      <span className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold">
                                        {op.label}
                                      </span>
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-[120px] truncate" title={clientLab}>
                                    {clientLab}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {linkedPtRowsForModal.length === 1 && canChangeProcessStatus ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 px-2 text-[10px]"
                                        disabled={adminEstadoMut.isPending}
                                        onClick={() => {
                                          if (!weightsRow) return;
                                          adminEstadoMut.mutate({ id: weightsRow.id, status: 'borrador' });
                                        }}
                                      >
                                        <Link2Off className="h-3 w-3" />
                                        Desligar
                                      </Button>
                                    ) : linkedPtRowsForModal.length > 1 ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 px-2 text-[10px]"
                                        title="Abre la unidad PT para revisar el vínculo."
                                        onClick={() => {
                                          navigate(`/pt-tags?open=${tag.id}`);
                                          setWeightsOpen(false);
                                          setWeightsRow(null);
                                        }}
                                      >
                                        <Link2Off className="h-3 w-3" />
                                        Abrir
                                      </Button>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {linkedPtRowsForModal.length > 1 ? (
                      <details className="mt-2 rounded-md border border-dashed border-border/70 bg-muted/10 [&_summary::-webkit-details-marker]:hidden">
                        <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/30">
                          Varias tarjas: cómo desligar
                        </summary>
                        <p className="border-t border-border/50 px-2 py-2 text-[10px] leading-snug text-muted-foreground">
                          Usá <strong>Desligar / Abrir</strong> por fila o <strong>Desvincular todas</strong> arriba (pasa por borrador en
                          servidor).
                        </p>
                      </details>
                    ) : null}
                  </section>
                  </div>
                  <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain lg:min-h-0 lg:pr-1">
                  {canChangeProcessStatus ? (
                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">Estado del proceso</p>
                        <span className="text-[10px] text-muted-foreground">{isAdmin ? 'Administración' : 'Supervisor'}</span>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="grid gap-1">
                          <Label className="text-[10px] text-muted-foreground">Cambiar a</Label>
                          <select
                            className="flex h-9 min-w-[180px] rounded-md border border-input bg-background px-2 py-1 text-sm"
                            value={adminStatusDraft}
                            onChange={(e) => setAdminStatusDraft(e.target.value as ProcessStatusUi)}
                          >
                            <option value="borrador">borrador</option>
                            <option value="confirmado">confirmado</option>
                            <option value="cerrado">cerrado</option>
                          </select>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-9"
                          disabled={(() => {
                            if (adminEstadoMut.isPending) return true;
                            const cur = weightsRow.process_status ?? 'borrador';
                            const same = adminStatusDraft === cur;
                            const mustReapplyBorrador =
                              same && cur === 'borrador' && weightsRow.tarja_id != null;
                            return same && !mustReapplyBorrador;
                          })()}
                          onClick={() => adminEstadoMut.mutate({ id: weightsRow.id, status: adminStatusDraft })}
                        >
                          {adminEstadoMut.isPending ? 'Aplicando…' : 'Aplicar estado'}
                        </Button>
                      </div>
                      {weightsRow.tarja_id != null && (weightsRow.process_status ?? 'borrador') === 'borrador' ? (
                        <p className="mt-2 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                          Borrador con PT #{weightsRow.tarja_id} aún enlazada: <strong>Aplicar estado</strong> desvincula en servidor.
                        </p>
                      ) : null}
                      <details className="group mt-2 rounded-md border border-border/60 bg-background/50 [&_summary::-webkit-details-marker]:hidden">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40">
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          Ayuda estados y cuadre
                        </summary>
                        <p className="border-t border-border/50 px-2 py-2 text-[11px] leading-snug text-muted-foreground">
                          Pasar a <strong>confirmado</strong> exige cuadre (entrada = packout + componentes). Reabrir a borrador o cerrar
                          son acciones administrativas según rol.
                        </p>
                      </details>
                    </section>
                  ) : null}

                  <form
                    id="process-edit-weights-form"
                    onSubmit={weightsForm.handleSubmit((vals) => {
                      const body: WeightsPatchForm & {
                        components: Array<{ component_id: number; lb_value: number }>;
                      } = {
                        nota: vals.nota,
                        components: Object.entries(weightComponentsDraft).map(([component_id, lb_value]) => ({
                          component_id: Number(component_id),
                          lb_value: Number(lb_value || 0),
                        })),
                      };
                      weightsMut.mutate({ id: weightsRow.id, body });
                    })}
                    className="grid gap-3 border-t border-border/60 pt-4"
                  >
                    <div className="flex min-w-0 flex-wrap gap-3">
                      <div className="flex min-w-0 flex-1 basis-full flex-wrap gap-2 rounded-lg border border-border bg-muted/15 p-3 sm:basis-auto">
                        <div className="min-w-[8.75rem] max-w-full flex-1">
                          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                            Entrada
                          </p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums">{fmtLb2(processEditModalSnapshot.entrada)}</p>
                        </div>
                        <div className="min-w-[8.75rem] max-w-full flex-1" title="Máx. entre PT planificado y pallets PF asociados (cuadre).">
                          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                            En producto
                          </p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums">{fmtLb2(processEditModalSnapshot.packoutProductLb)}</p>
                        </div>
                        <div className="min-w-[8.75rem] max-w-full flex-1">
                          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                            Componentes
                          </p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums">{fmtLb2(processEditModalSnapshot.components)}</p>
                        </div>
                        <div className="min-w-[8.75rem] max-w-full flex-1">
                          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                            Pendiente
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-sm font-bold tabular-nums',
                              processEditModalSnapshot.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                            )}
                          >
                            {fmtLb2(processEditModalSnapshot.pendiente)}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-[10rem] max-w-full flex-1 flex-col justify-center rounded-lg border border-border bg-card px-3 py-2 shadow-sm sm:max-w-none sm:flex-[1_1_11rem]">
                        <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">Merma</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{fmtLb2(processEditModalSnapshot.merma)}</p>
                        <p className="mt-1 text-[9px] text-muted-foreground">Registro del proceso</p>
                      </div>
                    </div>
                    {!processEditModalSnapshot.ok ? (
                      <p className="text-xs text-destructive">Pendiente distinto de 0: ajustá componentes o PT/pallets hasta cuadrar.</p>
                    ) : null}
                    <details className="rounded-md border border-border/60 bg-muted/10 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/30">
                        Detalle técnico del reparto (PT vs PF)
                      </summary>
                      <div className="space-y-1 border-t border-border/50 px-2 py-2 text-[11px] leading-snug text-muted-foreground">
                        <p>
                          PT planificado: {fmtLb2(processEditModalSnapshot.lbEnPtPlan)} · PF asociado:{' '}
                          {fmtLb2(processEditModalSnapshot.packPallets)}. El cuadre usa el máximo de ambos como &quot;ya en producto&quot;.
                        </p>
                        <p>
                          Podés editar componentes y nota en borrador o confirmado hasta cuadrar; luego confirmá o cerrá el proceso desde la
                          barra inferior.
                        </p>
                      </div>
                    </details>
                    {(() => {
                      const st = weightsRow.process_status ?? 'borrador';
                      const canEditWeights = !weightsRow.balance_closed && (st !== 'cerrado' || isAdmin);
                      return (
                        <>
                          {st === 'cerrado' && isAdmin ? (
                            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100">
                              <strong>Admin:</strong> edición con proceso cerrado; sigue el cuadre de lb.
                            </p>
                          ) : null}
                          {(weightsRow.components ?? []).map((c) => (
                            <div key={c.id} className="grid max-w-md gap-1.5">
                              <Label className="text-xs">{c.nombre}</Label>
                              <Input
                                type="number"
                                step="0.001"
                                className="h-9"
                                disabled={!canEditWeights}
                                value={weightComponentsDraft[c.id] ?? 0}
                                onChange={(e) =>
                                  setWeightComponentsDraft((prev) => ({
                                    ...prev,
                                    [c.id]: Number(e.target.value || 0),
                                  }))
                                }
                              />
                            </div>
                          ))}
                          <div className="grid max-w-md gap-1.5">
                            <Label className="text-xs">Nota</Label>
                            <Input className="h-9" disabled={!canEditWeights} {...weightsForm.register('nota')} />
                          </div>
                        </>
                      );
                    })()}
                  </form>
                  </div>
                </div>
              </div>
              <DialogFooter
                className={cn(operationalModalFooterClass, 'flex flex-wrap gap-2 sm:justify-end')}
              >
                <Button type="button" variant="outline" onClick={() => setWeightsOpen(false)}>
                  Cerrar
                </Button>
                {(() => {
                  const st = weightsRow.process_status ?? 'borrador';
                  const canEditWeights = !weightsRow.balance_closed && (st !== 'cerrado' || isAdmin);
                  return (
                    <>
                      {canEditWeights ? (
                        <Button type="submit" form="process-edit-weights-form" disabled={weightsMut.isPending}>
                          {weightsMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                        </Button>
                      ) : null}
                      {weightsRow.process_status === 'borrador' ? (
                        <Button
                          type="button"
                          variant="default"
                          disabled={confirmMut.isPending}
                          onClick={() => confirmMut.mutate(weightsRow.id)}
                        >
                          Confirmar proceso
                        </Button>
                      ) : null}
                      {weightsRow.process_status === 'confirmado' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={cerradoMut.isPending}
                          onClick={() => cerradoMut.mutate(weightsRow.id)}
                        >
                          Marcar cerrado
                        </Button>
                      ) : null}
                    </>
                  );
                })()}
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className={cn(contentCard, 'px-4 py-5 sm:px-5')}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Filtros</span>
          <button
            type="button"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Cerrado: estado cerrado o balance liquidado. Vinculables a PT: sin tarja, balance abierto."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-stretch">
          <div className="min-w-0 flex-[1_1_12rem]">
            <select
              className={filterSelectClass}
              value={filterProducer}
              onChange={(e) => setFilterProducer(Number(e.target.value))}
            >
              <option value={0}>Todos los productores</option>
              {(producers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-[1_1_12rem]">
            <select
              className={filterSelectClass}
              value={filterVariedad}
              onChange={(e) => setFilterVariedad(Number(e.target.value))}
            >
              <option value={0}>Todas las variedades</option>
              {varietyOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-[1_1_10rem]">
            <select
              className={filterSelectClass}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="vinculable_pt">Solo vinculables a PT</option>
              <option value="borrador">borrador</option>
              <option value="confirmado">confirmado</option>
              <option value="cerrado">cerrado</option>
            </select>
          </div>
          <div className="min-w-0 flex-[1_1_12rem]">
            <select
              className={filterSelectClass}
              value={filterProcessFormat}
              onChange={(e) => setFilterProcessFormat(e.target.value)}
              title="Filtra procesos con unidad PT del formato indicado"
            >
              <option value="">Todos los formatos PT</option>
              {formatFilterOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-[1_1_14rem]">
            <select
              className={filterSelectClass}
              value={filterProcessClient}
              onChange={(e) => setFilterProcessClient(Number(e.target.value))}
              title="Filtra procesos con unidad PT asignada a este cliente"
            >
              <option value={0}>Todos los clientes (PT)</option>
              {(commercialClients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="proc-listado">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="proc-listado" className={sectionTitle}>
              Procesos
            </h2>
            <span className={cn(sectionHint, '!mt-0')}>Últimos 500 · control operativo por productor</span>
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
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
                Ver criterios
              </summary>
              <div className="mt-1 rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600 shadow-sm">
                <p><span className="font-semibold text-emerald-700">Rend. bueno:</span> &ge; 80%</p>
                <p><span className="font-semibold text-amber-700">Rend. medio:</span> 65% - 79%</p>
                <p><span className="font-semibold text-rose-700">Rend. bajo:</span> &lt; 65%</p>
                <p><span className="font-semibold text-rose-700">Merma alta:</span> &ge; 15%</p>
              </div>
            </details>
          </div>
        </div>
        {viewMode === 'compact' ? (
          <div className="space-y-2.5">
            {compactGroups.length === 0 ? (
              <p className={emptyStateBanner}>Sin procesos para el filtro actual.</p>
            ) : (
              compactGroups.map((group, gi) => {
                return (
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
                        <span>{formatCount(group.count)} procesos</span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span>{fmtLb2(group.lbEntrada)} lb entrada</span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span>Rend. {group.weightedRend != null ? `${formatPercent(group.weightedRend, 1)}%` : '—'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {group.weightedRend != null && group.weightedRend < 75 ? (
                          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                            Bajo · Atención
                          </span>
                        ) : null}
                        {group.weightedRend != null && group.weightedRend >= 90 ? (
                          <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            Rend. OK
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[980px]">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Estado</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Variedad</TableHead>
                            <TableHead className="text-right">Lb entrada</TableHead>
                            <TableHead className="text-right">Lb packout</TableHead>
                            <TableHead>Rendimiento</TableHead>
                            <TableHead>Componentes / merma</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rows.map((r) => {
                            const rend = parseRendimientoPct(r);
                            const rt = rendimientoVisualTone(rend);
                            const mermaLb = mermaRegistradaLb(r);
                            const entrada = Number(r.lb_entrada ?? r.peso_procesado_lb);
                            const mermaPct = Number.isFinite(entrada) && entrada > 0 ? (mermaLb / entrada) * 100 : null;
                            const highMerma = mermaPct != null && mermaPct >= 15;
                            const compsCount = (r.components ?? []).filter((c) => Number(c.lb_value) > 0.001).length;
                            const cerrado = r.process_status === 'cerrado';
                            const adminEdit = cerrado && isAdmin;
                            return (
                              <TableRow key={r.id} className="border-b border-slate-100/70 hover:bg-slate-50/70">
                                <TableCell className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className={cn('h-5 w-1.5 rounded-full', rt.bar)} />
                                    <ProcessStatusBadge status={r.process_status} />
                                  </div>
                                </TableCell>
                                <TableCell className="py-2.5 text-xs text-slate-700">{formatProcessDateShort(r.fecha_proceso)}</TableCell>
                                <TableCell className="py-2.5 text-xs text-slate-800">{r.variedad_nombre ?? '—'}</TableCell>
                                <TableCell className="py-2.5 text-right font-mono text-sm text-slate-900">{fmtLb2(r.lb_entrada)}</TableCell>
                                <TableCell className="py-2.5 text-right font-mono text-sm text-slate-900">{fmtLb2(r.lb_packout_asociado ?? r.lb_packout)}</TableCell>
                                <TableCell className="py-2.5">
                                  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', rt.badge)}>
                                    {rend != null ? `${formatPercent(rend, 1)}%` : '—'}
                                  </span>
                                </TableCell>
                                <TableCell className="py-2.5 text-xs">
                                  <span className={cn('font-medium', highMerma ? 'text-rose-700' : 'text-slate-700')}>
                                    Merma {fmtLb2(mermaLb)} lb
                                  </span>
                                  <span className="text-slate-500"> · {compsCount} comp.</span>
                                </TableCell>
                                <TableCell className="py-2.5">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1 border-slate-200 bg-white px-2.5 text-xs font-medium shadow-sm"
                                      onClick={() => openWeights(r)}
                                      title={
                                        cerrado && !isAdmin
                                          ? 'Solo lectura (proceso cerrado)'
                                          : adminEdit
                                            ? 'Editar (admin): proceso cerrado'
                                            : 'Editar proceso'
                                      }
                                    >
                                      {adminEdit ? <><Pencil className="h-3.5 w-3.5" />Editar</> : cerrado ? 'Ver' : 'Editar'}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                                      onClick={async () => {
                                        try {
                                          await downloadPdf(`/api/documents/processes/${r.id}/pdf`, `proceso-${r.id}.pdf`);
                                          toast.success('PDF descargado');
                                        } catch (e) {
                                          toast.error(e instanceof Error ? e.message : 'Error al descargar');
                                        }
                                      }}
                                    >
                                      PDF
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className={cn(tableShell, 'overflow-x-auto')}>
            <DataTable
              columns={columns}
              data={sortedFilteredProcesses}
              searchPlaceholder="Buscar por productor, variedad, lote o ID de proceso"
              customGlobalFilter={(row, s) => processRowMatchesGlobalSearch(row, s)}
              initialPageSize={25}
              scrollToRowId={focusPid}
              getRowClassName={(r) => (r.id === focusPid ? 'bg-sky-50/60 ring-1 ring-inset ring-sky-200/70' : undefined)}
              containerClassName="px-3 py-3 sm:px-4"
              tableClassName="min-w-[1180px] [&_td]:py-3 [&_td:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:bg-slate-50/90 [&_th]:py-2.5 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_th:last-child]:text-right"
            />
          </div>
        )}
      </section>

      <section className="space-y-3 pb-2" aria-labelledby="proc-analisis">
        <h2 id="proc-analisis" className={signalsTitle}>
          Análisis · cajas (filtrado)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-4">
            <p className="text-xs font-medium text-slate-600">Top formatos</p>
            <ul className="mt-3 space-y-2.5">
              {processKpis.topFormatos.length === 0 ? (
                <li className="text-sm text-slate-400">Sin datos.</li>
              ) : (
                processKpis.topFormatos.map(([name, n], i) => (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-800" title={name}>
                      {i + 1}. {name}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">{formatCount(n)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-4">
            <p className="text-xs font-medium text-slate-600">Top clientes</p>
            <ul className="mt-3 space-y-2.5">
              {processKpis.topClientes.length === 0 ? (
                <li className="text-sm text-slate-400">Sin datos.</li>
              ) : (
                processKpis.topClientes.map(([name, n], i) => (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-800" title={name}>
                      {i + 1}. {name}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">{formatCount(n)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
