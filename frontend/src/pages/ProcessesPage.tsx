import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Info, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson, downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
import { DataTable } from '@/components/data/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCount, formatLb, formatPercent } from '@/lib/number-format';
import {
  contentCard,
  emptyStateBanner,
  emptyStateInset,
  filterSelectClass,
  kpiCard,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  kpiValueMd,
  pageInfoButton,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
  signalsTitle,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

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

type PtTagKpi = {
  id: number;
  format_code: string;
  client_id?: number | null;
  items: Array<{ process_id: number; cajas_generadas: number }>;
};

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
    queryFn: () => apiJson<PtTagKpi[]>('/api/pt-tags'),
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
    const m = new Map<number, PtTagKpi>();
    for (const t of ptTags ?? []) m.set(t.id, t);
    return m;
  }, [ptTags]);

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
        cell: ({ getValue }) => (
          <span className="tabular-nums font-medium text-slate-800">{getValue() != null ? `${getValue()}%` : '—'}</span>
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
        accessorKey: 'id',
        header: 'ID',
        cell: ({ getValue }) => <span className="font-mono text-xs text-slate-500">{getValue() as number}</span>,
      },
      { accessorKey: 'recepcion_id', header: 'Recep.' },
      {
        id: 'rec_line',
        header: 'Línea',
        cell: ({ row }) => {
          const v = row.original.reception_line_id;
          return v != null ? <span className="font-mono text-xs">{v}</span> : <span className="text-slate-400">—</span>;
        },
      },
      {
        id: 'especie',
        header: 'Especie',
        cell: ({ row }) => row.original.especie_nombre ?? '—',
      },
      {
        id: 'componentes',
        header: 'Componentes',
        cell: ({ row }) => processComponentsTableCell(row.original),
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
        id: 'linea_proc',
        header: 'Línea proc.',
        cell: ({ row }) => {
          const r = row.original;
          if (r.process_machine_codigo) {
            return (
              <span className="text-xs text-slate-600">
                {r.process_machine_codigo}
                {r.process_machine_kind ? ` (${r.process_machine_kind})` : ''}
              </span>
            );
          }
          return <span className="text-slate-400">—</span>;
        },
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
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nuevo proceso</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(submitNewProcess)} className="grid gap-3 py-2">
              <div className="grid gap-2">
                  <Label>Productor</Label>
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
                    <p className="text-sm text-amber-700 dark:text-amber-500">No hay líneas con saldo disponible para este productor.</p>
                  ) : null}
                  {eligibleLines && eligibleLines.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <Label className="text-sm">Vaciar MP (varias recepciones / líneas)</Label>
                      <p className="text-xs text-muted-foreground">
                        Indicá cuántas lb tomás de cada línea (hasta el saldo disponible). La suma define las <strong>lb entrada</strong>.
                      </p>
                      <div className="space-y-2 max-h-52 overflow-y-auto">
                        {eligibleLines.map((ln) => (
                          <div key={ln.reception_line_id} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="min-w-[180px] text-muted-foreground">
                              R{ln.reception_id} · L{ln.line_order + 1} ·{' '}
                              <span className="font-mono text-foreground">{ln.lot_code}</span> {ln.species_nombre}/
                              {ln.variety_nombre}
                            </span>
                            <span className="text-xs">saldo {fmtLb2(ln.available_lb)} lb</span>
                            <Input
                              className="h-9 w-28"
                              placeholder="lb"
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
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              <div className="grid gap-2">
                <Label htmlFor="fecha_proceso">Fecha / hora proceso</Label>
                <Input id="fecha_proceso" type="datetime-local" {...form.register('fecha_proceso')} />
              </div>
              <div className="grid gap-2">
                <Label>Línea de proceso (máquina)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register('process_machine_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir línea…</option>
                  {activeMachineByKind.single ? <option value={activeMachineByKind.single.id}>Línea single</option> : null}
                  {activeMachineByKind.double ? <option value={activeMachineByKind.double.id}>Línea double</option> : null}
                </select>
                <p className="text-xs text-muted-foreground">
                  Configurá máquinas en <strong>Mantenedores → Líneas de proceso</strong>.
                </p>
              </div>
              <div className="grid gap-2">
                  <Label>Lb entrada (suma del reparto)</Label>
                  <Input
                    readOnly
                    className="bg-muted/50"
                    value={entradaSum > 0 ? fmtLb2(entradaSum) : ''}
                  />
                </div>
              <div className="grid gap-2">
                <Label>Nota</Label>
                <Input {...form.register('nota')} />
              </div>
              {createSpeciesId == null ? (
                <p className="text-xs text-muted-foreground">
                  Indicá lb en al menos una línea con saldo para determinar la especie y cargar los componentes de resultado.
                </p>
              ) : null}
              {activeCreateComponents.length > 0 ? (
                <div className="grid gap-2">
                  <Label className="text-sm">Componentes (especie)</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {activeCreateComponents.map((c) => (
                      <div key={c.id} className="grid gap-1">
                        <Label className="text-xs">{c.nombre}</Label>
                        <Input
                          type="number"
                          step="0.01"
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
                </div>
              ) : createSpeciesId != null ? (
                <p className="text-xs text-muted-foreground">No hay componentes activos para esta especie en mantenedores.</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                En alta no hay unidades PT aún: packout = 0. Si cargás componentes, deben sumar la <strong>lb entrada</strong>. El packout real se
                acumula en <strong>PT → unidades PT</strong> asociadas al proceso.
              </p>
              <div className={cn(emptyStateInset, 'space-y-1.5')}>
                <div className="font-medium text-slate-900">Calculadora</div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Lb entrada</span>
                  <span className="font-mono font-medium">{fmtLb2(entradaSum)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Lb packout (desde unidades PT; en alta 0)</span>
                  <span className="font-mono">{fmtLb2(packoutFromTagsCreate)}</span>
                </div>
                {activeCreateComponents.map((c) => (
                  <div key={c.id} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{c.nombre}</span>
                    <span className="font-mono">{fmtLb2(createComponentsDraft[c.id] ?? 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-border pt-1.5">
                  <span>Componentes (suma)</span>
                  <span className="font-mono">{fmtLb2(createComponentsTotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Diferencia (entrada − packout − componentes)</span>
                  <span
                    className={`font-mono font-semibold ${Math.abs(diferenciaRep) < ALLOC_EPS ? 'text-green-600 dark:text-green-500' : ''}`}
                  >
                    {fmtLb2(diferenciaRep)}
                  </span>
                </div>
              </div>
              <DialogFooter>
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

      <section aria-labelledby="proc-kpis" className="space-y-4">
        <h2 id="proc-kpis" className="sr-only">
          Indicadores del listado filtrado
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Lb entrada</p>
            <p className={kpiValueLg}>{fmtLb2(processKpis.lbEntrada)}</p>
            <p className={kpiFootnote}>Suma filtrada</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Lb packout</p>
            <p className={kpiValueLg}>{fmtLb2(processKpis.lbPack)}</p>
            <p className={kpiFootnote}>Planificado / acumulado</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Rendimiento</p>
            <p className={kpiValueLg}>
              {processKpis.rendimientoPct != null ? `${formatPercent(processKpis.rendimientoPct, 2)}%` : '—'}
            </p>
            <p className={kpiFootnote}>Packout / entrada</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Cajas producidas</p>
            <p className={kpiValueLg}>{formatCount(processKpis.totalCajas)}</p>
            <p className={kpiFootnote}>Desde unidades PT</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Merma</p>
            <p className={kpiValueMd}>{fmtLb2(processKpis.lbMerma)}</p>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar proceso #{weightsRow?.id ?? '—'}</DialogTitle>
          </DialogHeader>
          {weightsRow && canChangeProcessStatus ? (
            <div className="rounded-lg border border-border bg-muted/25 px-3 py-3 space-y-2">
              <Label className="text-xs font-semibold">
                Estado del proceso {isAdmin ? '(administrador)' : '(supervisor: reabrir a borrador o cerrar)'}
              </Label>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="flex h-10 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={adminStatusDraft}
                  onChange={(e) => setAdminStatusDraft(e.target.value as ProcessStatusUi)}
                >
                  <option value="borrador">borrador</option>
                  <option value="confirmado">confirmado</option>
                  <option value="cerrado">cerrado</option>
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={(() => {
                    if (adminEstadoMut.isPending) return true;
                    const cur = weightsRow.process_status ?? 'borrador';
                    const same = adminStatusDraft === cur;
                    /** Si ya es borrador pero sigue vinculado a una PT, hay que re-aplicar borrador para desvincular en el servidor. */
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
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                  El proceso figura en borrador pero sigue asociado a la unidad PT #{weightsRow.tarja_id}. Pulsá{' '}
                  <strong>Aplicar estado</strong> para desvincularlo y poder usarlo en una unidad PT nueva.
                </p>
              ) : null}
              <p className="text-[11px] text-muted-foreground leading-snug">
                Pasar de <strong>borrador</strong> a <strong>confirmado</strong> sigue exigiendo el cuadre de lb (entrada = packout +
                componentes). El resto permite reabrir o ajustar el flujo administrativamente.
              </p>
            </div>
          ) : null}
          {weightsRow ? (
            <form
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
              className="grid gap-3 py-2"
            >
              {(() => {
                const entrada =
                  weightsRow.lb_entrada != null && weightsRow.lb_entrada !== ''
                    ? Number(weightsRow.lb_entrada)
                    : Number(weightsRow.peso_procesado_lb);
                const packTarjas = Number(weightsRow.lb_packout_planned ?? 0);
                const packPallets = Number(weightsRow.lb_packout_asociado ?? 0);
                /** Misma lógica que el PATCH: max(tarjas, pallets) como lb ya en vía producto (evita doble conteo típico). */
                const packoutProductLb = Math.max(packTarjas, packPallets);
                const disponiblesComponentes = Math.max(0, entrada - packoutProductLb);
                const restante = entrada - packoutProductLb - componentsEditTotal;
                const ok = Math.abs(restante) < ALLOC_EPS;
                return (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm space-y-1.5">
                      <p className="font-medium text-foreground">Reparto de lb netas de entrada</p>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Lb entrada</span>
                        <span className="font-mono font-medium">{fmtLb2(entrada)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Packout unidades PT (cache)</span>
                        <span className="font-mono">{fmtLb2(packTarjas)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:justify-between sm:gap-2">
                        <span className="text-muted-foreground">
                          Pallets finales asociados
                          {weightsRow.tarja_id != null && weightsRow.tarja_id > 0 ? (
                            <span className="text-foreground"> → Unidad PT #{weightsRow.tarja_id}</span>
                          ) : null}
                        </span>
                        <span className="font-mono">{fmtLb2(packPallets)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs border-t border-border pt-1.5">
                        <span className="text-foreground font-medium">
                          Ya en producto (máx. unidades PT · pallets){' '}
                          <span className="font-normal text-muted-foreground">para cuadrar</span>
                        </span>
                        <span className="font-mono font-semibold text-foreground">{fmtLb2(packoutProductLb)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-foreground font-medium">
                          Disponibles para componentes{' '}
                          <span className="font-normal text-muted-foreground">(entrada − ya en producto)</span>
                        </span>
                        <span className="font-mono font-semibold text-foreground">{fmtLb2(disponiblesComponentes)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Suma componentes cargada</span>
                        <span className="font-mono">{fmtLb2(componentsEditTotal)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Pendiente de cuadrar</span>
                        <span className={`font-mono font-semibold ${ok ? 'text-green-600 dark:text-green-500' : 'text-destructive'}`}>
                          {fmtLb2(restante)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Cuando pendiente = 0: entrada = máx.(unidades PT, pallets) + componentes. Si cargaste cajas solo en pallets finales
                        (sin unidades PT), cuenta el <strong>asociado</strong> del listado.
                      </p>
                    </div>
                    {!ok ? (
                      <p className="text-xs text-destructive">
                        Ajustá componentes, unidades PT o pallets hasta que el pendiente sea 0.
                      </p>
                    ) : null}
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                El packout cuenta unidades PT y también libras ya cargadas en <strong>pallets finales</strong> con este proceso. Podés
                cargar o ajustar <strong>componentes y nota</strong> en borrador o confirmado (p. ej. tras vincular la unidad PT) hasta
                cuadrar el pendiente; luego confirmá o marcá cerrado.
              </p>
              {(() => {
                const st = weightsRow.process_status ?? 'borrador';
                const canEditWeights = !weightsRow.balance_closed && (st !== 'cerrado' || isAdmin);
                return (
                  <>
                    {st === 'cerrado' && isAdmin ? (
                      <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100">
                        <strong>Administrador:</strong> podés ajustar componentes y nota aunque el proceso esté cerrado. Sigue aplicando el
                        cuadre de lb (entrada = packout + componentes).
                      </p>
                    ) : null}
                    {(weightsRow.components ?? []).map((c) => (
                      <div key={c.id} className="grid gap-2">
                        <Label className="text-xs">{c.nombre}</Label>
                        <Input
                          type="number"
                          step="0.001"
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
                    <div className="grid gap-2">
                      <Label className="text-xs">Nota</Label>
                      <Input disabled={!canEditWeights} {...weightsForm.register('nota')} />
                    </div>
                    <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => setWeightsOpen(false)}>
                        Cerrar
                      </Button>
                      {canEditWeights ? (
                        <Button type="submit" disabled={weightsMut.isPending}>
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
                    </DialogFooter>
                  </>
                );
              })()}
            </form>
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
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <select
            className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm lg:max-w-[220px]"
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
          <select
            className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm lg:max-w-[200px]"
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
          <select
            className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm lg:max-w-[220px]"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="vinculable_pt">Solo vinculables a PT</option>
            <option value="borrador">borrador</option>
            <option value="confirmado">confirmado</option>
            <option value="cerrado">cerrado</option>
          </select>
          <select
            className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm lg:max-w-[220px]"
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
          <select
            className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm lg:max-w-[260px]"
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

      <section className="space-y-3" aria-labelledby="proc-listado">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="proc-listado" className={sectionTitle}>
            Procesos
          </h2>
          <span className={cn(sectionHint, '!mt-0')}>Últimos 500 · scroll horizontal si aplica</span>
        </div>
        <div className={cn(tableShell, 'overflow-x-auto')}>
          <DataTable
            columns={columns}
            data={filteredProcesses}
            searchPlaceholder="Buscar en procesos…"
            scrollToRowId={focusPid}
            getRowClassName={(r) => (r.id === focusPid ? 'bg-sky-50/60 ring-1 ring-inset ring-sky-200/70' : undefined)}
            containerClassName="px-4 py-4 sm:px-5"
            tableClassName="min-w-[1100px] [&_td]:py-3.5 [&_td:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:bg-slate-50/90 [&_th]:py-3 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_th:last-child]:text-right"
          />
        </div>
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
