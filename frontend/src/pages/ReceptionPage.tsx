import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eye, Info, Pencil, Plus, Printer, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson, downloadPdf } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatCount, formatLb } from '@/lib/number-format';
import {
  badgePill,
  btnToolbarPrimary,
  contentCard,
  emptyStatePanel,
  errorStateCard,
  filterInputClass,
  filterPanel,
  formReadonlyValueClass,
  filterSelectClass,
  kpiCard,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
  kpiValueMd,
  modalFormLineCard,
  modalFormLineDeleteButton,
  modalFormPrimaryButton,
  modalFormSoftGreenButton,
  operationalModalBodyClass,
  operationalModalContentClass,
  operationalModalDescriptionClass,
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
  signalsPanel,
  signalsTitle,
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function DocumentStateBadge({ codigo, nombre }: { codigo?: string | null; nombre?: string | null }) {
  const c = String(codigo ?? '').toLowerCase();
  const map: Record<string, string> = {
    borrador: 'border-slate-200 bg-slate-100 text-slate-800',
    confirmado: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
    cerrado: 'border-violet-200/85 bg-violet-50 text-violet-900',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
  };
  const label = nombre?.trim() || codigo || '—';
  return (
    <span className={cn(badgePill, map[c] ?? 'border-slate-200 bg-slate-50 text-slate-800')} title={label}>
      {label}
    </span>
  );
}

function receptionNetLb(r: ReceptionRow): number {
  let t = 0;
  for (const ln of r.lines ?? []) {
    const n = Number(ln.net_lb);
    if (Number.isFinite(n)) t += n;
  }
  return t;
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

function variedadCabecera(r: ReceptionRow): string {
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

function lineFromApi(ln: ReceptionLineRow): LineDraft {
  return {
    species_id: ln.species_id,
    variety_id: ln.variety_id,
    quality_grade_id: ln.quality_grade_id ?? 0,
    gross_lb: ln.gross_lb != null ? String(ln.gross_lb) : '',
    net_lb: ln.net_lb != null ? String(ln.net_lb) : '',
    quantity: ln.quantity != null ? String(ln.quantity) : '',
    returnable_container_id: ln.returnable_container_id ?? ln.returnable_container?.id ?? 0,
    temperature_str: ln.temperature_f != null ? String(ln.temperature_f) : '',
    lot_code: ln.lot_code ?? null,
  };
}

export function ReceptionPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [serverReference, setServerReference] = useState<string | null>(null);
  const [copyFromPreviousLine, setCopyFromPreviousLine] = useState(true);
  const [applyVarietyToInvolvedLines, setApplyVarietyToInvolvedLines] = useState(true);
  const [viewStateCodigo, setViewStateCodigo] = useState<string | null>(null);
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([emptyLine()]);

  const { data: receptions, isPending, isError, error } = useQuery({
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

  const activeContainers = useMemo(
    () => (returnableContainers ?? []).filter((c) => c.activo !== false),
    [returnableContainers],
  );

  const [filterProducer, setFilterProducer] = useState(0);
  const [filterVariety, setFilterVariety] = useState(0);
  const [filterTipo, setFilterTipo] = useState(0);
  const [filterUso, setFilterUso] = useState<'todos' | 'abierto' | 'cerrado'>('todos');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const filteredReceptions = useMemo(() => {
    let list = receptions ?? [];
    if (filterProducer > 0) list = list.filter((r) => r.producer_id === filterProducer);
    if (filterVariety > 0) {
      list = list.filter((r) => r.lines?.some((ln) => ln.variety_id === filterVariety));
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
  }, [receptions, filterProducer, filterVariety, filterTipo, filterUso, search]);

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
      const rtCodigo = r.reception_type?.codigo ?? '';
      const producerName = r.producer?.nombre ?? '—';
      for (const ln of r.lines ?? []) {
        const n = Number(ln.net_lb);
        if (!Number.isFinite(n)) continue;
        totalNet += n;
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
        text: `${formatCount(receptionKpis.nSinLineas)} recepción(es) sin líneas en la vista — revisá carga o filtros.`,
      });
    }
    if (nNetZero > 0) {
      lines.push({
        key: 'net-zero',
        tone: 'warn',
        text: `${formatCount(nNetZero)} recepción(es) con líneas pero lb netos no suman positivo — revisá pesadas.`,
      });
    }
    if (nSinProductor > 0) {
      lines.push({
        key: 'sin-prod',
        tone: 'warn',
        text: `${formatCount(nSinProductor)} recepción(es) sin nombre de productor en maestro.`,
      });
    }
    if (receptionKpis.nAnulado > 0) {
      lines.push({
        key: 'anulados',
        tone: 'info',
        text: `${formatCount(receptionKpis.nAnulado)} documento(s) anulado(s) en la vista actual.`,
      });
    }
    return lines;
  }, [filteredReceptions, receptionKpis.nSinLineas, receptionKpis.nAnulado]);

  function usoRecepcionLabel(r: ReceptionRow): { short: string; title: string } {
    const c = r.document_state?.codigo;
    if (c === 'cerrado') return { short: 'Cerrado', title: 'Recepción cerrada: no debería usarse para nuevos procesos.' };
    if (c === 'anulado') return { short: 'Anulado', title: 'Documento anulado.' };
    return { short: 'Abierto', title: 'Recepción disponible para proceso mientras haya saldo en líneas.' };
  }

  const form = useForm<HeaderForm>({
    resolver: zodResolver(headerSchema),
    defaultValues: {
      received_at: toDatetimeLocalValue(new Date().toISOString()),
      document_number: '',
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

  const buildPayload = (h: HeaderForm, lines: Record<string, unknown>[]) => ({
    received_at: new Date(h.received_at).toISOString(),
    document_number: h.document_number?.trim() || undefined,
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
      toast.success('Recepción registrada');
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiJson(`/api/receptions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      toast.success('Recepción actualizada');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      toast.success('Estado actualizado');
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setViewOnly(false);
    setViewStateCodigo(null);
    setServerReference(null);
    setLineDrafts([emptyLine()]);
    form.reset({
      received_at: toDatetimeLocalValue(new Date().toISOString()),
      document_number: '',
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
    setViewStateCodigo(null);
    setServerReference(null);
    setLineDrafts([emptyLine()]);
    form.reset({
      received_at: toDatetimeLocalValue(new Date().toISOString()),
      document_number: '',
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
      if (r.document_state?.codigo !== 'borrador') {
        toast.error('Solo se editan recepciones en borrador.');
        return;
      }
      setEditingId(id);
      setViewOnly(false);
      setServerReference(r.reference_code ?? null);
      setViewStateCodigo(r.document_state?.codigo ?? null);
      form.reset({
        received_at: toDatetimeLocalValue(r.received_at),
        document_number: r.document_number ?? '',
        producer_id: r.producer_id,
        notes: r.notes ?? '',
        plant_code: r.plant_code ?? DEFAULT_PLANT,
        document_state_id: r.document_state_id,
        reception_type_id: r.reception_type_id,
        mercado_id: r.mercado_id ?? 0,
      });
      if (r.lines?.length) {
        setLineDrafts(r.lines.map(lineFromApi));
      } else {
        setLineDrafts([emptyLine()]);
      }
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar');
    }
  }

  async function openView(id: number) {
    try {
      const r = await apiJson<ReceptionRow>(`/api/receptions/${id}`);
      setEditingId(id);
      setViewOnly(true);
      setServerReference(r.reference_code ?? null);
      setViewStateCodigo(r.document_state?.codigo ?? null);
      form.reset({
        received_at: toDatetimeLocalValue(r.received_at),
        document_number: r.document_number ?? '',
        producer_id: r.producer_id,
        notes: r.notes ?? '',
        plant_code: r.plant_code ?? DEFAULT_PLANT,
        document_state_id: r.document_state_id,
        reception_type_id: r.reception_type_id,
        mercado_id: r.mercado_id ?? 0,
      });
      if (r.lines?.length) {
        setLineDrafts(r.lines.map(lineFromApi));
      } else {
        setLineDrafts([emptyLine()]);
      }
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar');
    }
  }

  function onSubmit(h: HeaderForm) {
    if (viewOnly) return;
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

    const payload = buildPayload(h, lines);
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

  const watchedDocumentStateId = form.watch('document_state_id');
  const docStateBadgeLabel =
    (documentStates ?? []).find((s) => s.id === watchedDocumentStateId)?.nombre?.trim() ||
    (documentStates ?? []).find((s) => s.id === watchedDocumentStateId)?.codigo?.trim() ||
    '—';

  const receptionDialogTitle =
    viewOnly && editingId != null
      ? `Recepción #${editingId} (solo lectura)`
      : editingId != null
        ? `Editar recepción #${editingId}`
        : 'Registrar recepción';

  const helpTitle =
    'Informe PDF formal para el productor. Cerrado (documento): estado «cerrado» — cierre administrativo; no usar para nuevos procesos. Abierto: aún no cerrado; el saldo de lb por línea se controla al crear procesos. Una recepción queda consumida en la práctica cuando no queda MP disponible en sus líneas; el documento puede seguir «abierto» hasta que operación cierre el estado.';

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
            <CardTitle>Error</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : 'Reintentá más tarde.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent
          className={cn(
            operationalModalContentClass,
            'min-h-0 max-h-[min(96vh,1000px)] max-w-[min(1280px,calc(100vw-2rem))] sm:max-w-[min(1280px,calc(100vw-2rem))]',
          )}
        >
          <DialogHeader className={operationalModalHeaderClass}>
            <DialogTitle className={operationalModalTitleClass}>{receptionDialogTitle}</DialogTitle>
            <DialogDescription className={operationalModalDescriptionClass}>
              {viewOnly
                ? 'Solo lectura: cabecera, líneas y totales.'
                : editingId != null
                  ? 'Editá borrador: cabecera, líneas y observaciones.'
                  : 'Alta de materia prima en planta: cabecera, líneas y observaciones.'}{' '}
              <span className="font-medium text-foreground/90">Estado: {docStateBadgeLabel}.</span>
            </DialogDescription>
            <details className="group text-[13px] text-muted-foreground">
              <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                  <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  Estados del documento, PDF y consumo en proceso
                </span>
              </summary>
              <p className="mt-2 max-w-prose text-pretty leading-snug">{helpTitle}</p>
            </details>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className={operationalModalFormClass}>
            <div className={cn(operationalModalBodyClass, 'lg:overflow-hidden lg:px-8 lg:py-6 lg:pb-7')}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:grid lg:max-h-[min(82vh,860px)] lg:grid-cols-[minmax(min(340px,100%),min(460px,42vw))_minmax(0,1fr)] lg:items-start lg:gap-8 lg:overflow-hidden lg:pb-1">
                <section
                  className={cn(
                    operationalModalSectionCard,
                    'min-h-0 w-full lg:flex lg:max-h-[min(78vh,820px)] lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5',
                  )}
                >
                  <div className={cn(operationalModalSectionHeadingRow, 'mb-4')}>
                    <span className={operationalModalStepBadge}>1</span>
                    <h3 className={operationalModalStepTitle}>Documento</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">Fecha y hora</label>
                      <Input
                        type="datetime-local"
                        disabled={viewOnly}
                        className={filterInputClass}
                        {...form.register('received_at')}
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-1">
                      <label className="block text-xs font-medium text-slate-600">Productor (grower)</label>
                      <select
                        className={filterSelectClass}
                        disabled={viewOnly}
                        {...form.register('producer_id', { valueAsNumber: true })}
                      >
                        <option value={0}>Elegir…</option>
                        {sortedProducers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">Estado del documento</label>
                      <select
                        className={filterSelectClass}
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

                    <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-1">
                      <label className="block text-xs font-medium text-slate-600">Referencia</label>
                      <div className={cn(formReadonlyValueClass, 'cursor-default text-slate-700')}>
                        {serverReference ??
                          (editingId == null ? 'Se asignará al guardar (productor + fecha + correlativo)' : '—')}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">Planta</label>
                      <input type="hidden" {...form.register('plant_code')} />
                      <div
                        className={cn(
                          'flex min-h-10 w-full min-w-0 items-center whitespace-normal break-words rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium leading-snug text-slate-800 shadow-sm',
                          viewOnly ? 'opacity-80' : '',
                        )}
                      >
                        {String(form.watch('plant_code') ?? '').trim() || '—'}
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">Mercado</label>
                      <select
                        className={filterSelectClass}
                        disabled={viewOnly}
                        {...form.register('mercado_id', { valueAsNumber: true })}
                      >
                        <option value={0}>— (por defecto USA en servidor)</option>
                        {(mercados ?? [])
                          .filter((m) => m.activo !== false)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre} ({m.codigo})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">Tipo de recepción fruta</label>
                      <select
                        className={filterSelectClass}
                        disabled={viewOnly}
                        {...form.register('reception_type_id', { valueAsNumber: true })}
                      >
                        {(receptionTypes ?? [])
                          .filter((t) => t.activo !== false)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-1">
                      <label className="block text-xs font-medium text-slate-600">Documento / guía</label>
                      <Input
                        disabled={viewOnly}
                        className={filterInputClass}
                        {...form.register('document_number')}
                      />
                    </div>
                  </div>
                </section>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:min-h-0 lg:max-h-[min(78vh,820px)] lg:overflow-hidden">
                  <section
                    className={cn(operationalModalSectionMuted, 'flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-[240px]')}
                  >
                  <div className="mb-4 flex shrink-0 flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-start gap-2">
                      <span className={operationalModalStepBadge}>2</span>
                      <div>
                        <h3 className={operationalModalStepTitle}>Líneas de partida</h3>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          Especie, variedad, pesos y envase por fila.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={copyFromPreviousLine}
                          disabled={viewOnly}
                          onChange={(e) => setCopyFromPreviousLine(e.target.checked)}
                        />
                        Copiar última línea
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={applyVarietyToInvolvedLines}
                          disabled={viewOnly}
                          onChange={(e) => setApplyVarietyToInvolvedLines(e.target.checked)}
                        />
                        Aplicar variedad a líneas involucradas
                      </label>
                      <button
                        type="button"
                        className={modalFormSoftGreenButton}
                        disabled={viewOnly}
                        onClick={() =>
                          setLineDrafts((d) => {
                            const prev = d[d.length - 1];
                            const next =
                              copyFromPreviousLine && prev && prev.species_id > 0
                                ? { ...prev, lot_code: undefined }
                                : emptyLine();
                            return [...d, next];
                          })
                        }
                      >
                        + Línea
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pt-2">
                    <div className="space-y-4">
                    {lineDrafts.map((L, idx) => (
                      <div key={idx} className={cn(modalFormLineCard, 'space-y-3.5')}>
                        {L.lot_code ? (
                          <p className="font-mono text-[11px] text-slate-500">Lote: {L.lot_code}</p>
                        ) : null}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end lg:gap-x-4 lg:gap-y-3">
                          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-4">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Especie</label>
                            <select
                              className={filterSelectClass}
                              disabled={viewOnly}
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
                                  {s.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-4">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Variedad</label>
                            <select
                              className={filterSelectClass}
                              disabled={viewOnly}
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
                              {sortedVarieties
                                .filter((v) => L.species_id <= 0 || v.species_id === L.species_id)
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.nombre}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-3">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Calidad</label>
                            <select
                              className={filterSelectClass}
                              disabled={viewOnly}
                              value={L.quality_grade_id}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, quality_grade_id: v } : x)));
                              }}
                            >
                              <option value={0}>—</option>
                              {(qualityGrades ?? []).map((q) => (
                                <option key={q.id} value={q.id}>
                                  {q.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex min-w-0 items-end sm:col-span-2 lg:col-span-1 lg:justify-end">
                            <button
                              type="button"
                              className={modalFormLineDeleteButton}
                              aria-label={`Eliminar línea ${idx + 1}`}
                              title="Eliminar línea"
                              onClick={() => setLineDrafts((d) => d.filter((_, i) => i !== idx))}
                              disabled={viewOnly || lineDrafts.length <= 1}
                            >
                              <X className="h-4 w-4 shrink-0" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:items-end">
                          <div className="min-w-0 space-y-1.5">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Bruto (lb)</label>
                            <Input
                              placeholder="Opcional"
                              disabled={viewOnly}
                              className={filterInputClass}
                              value={L.gross_lb}
                              onChange={(e) =>
                                setLineDrafts((d) =>
                                  d.map((x, i) => (i === idx ? { ...x, gross_lb: e.target.value } : x)),
                                )
                              }
                            />
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Neto (lb)</label>
                            <Input
                              disabled={viewOnly}
                              className={filterInputClass}
                              value={L.net_lb}
                              onChange={(e) =>
                                setLineDrafts((d) =>
                                  d.map((x, i) => (i === idx ? { ...x, net_lb: e.target.value } : x)),
                                )
                              }
                            />
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Cantidad</label>
                            <Input
                              disabled={viewOnly}
                              className={filterInputClass}
                              value={L.quantity}
                              onChange={(e) =>
                                setLineDrafts((d) =>
                                  d.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)),
                                )
                              }
                            />
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Envase</label>
                            <select
                              className={filterSelectClass}
                              disabled={viewOnly}
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
                          <div className="min-w-0 space-y-1.5">
                            <label className="block text-xs font-medium tracking-tight text-slate-700">Temp. (°F)</label>
                            <Input
                              disabled={viewOnly}
                              className={filterInputClass}
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
                    ))}
                    </div>
                  </div>
                </section>

                <section className={cn(operationalModalSectionCard, 'shrink-0')}>
                  <div className={cn(operationalModalSectionHeadingRow, 'mb-3')}>
                    <span className={operationalModalStepBadge}>3</span>
                    <h3 className={operationalModalStepTitle}>Observaciones</h3>
                  </div>
                  <label className="sr-only" htmlFor="reception-notes">
                    Texto libre
                  </label>
                  <textarea
                    id="reception-notes"
                    rows={3}
                    disabled={viewOnly}
                    className={cn(filterInputClass, 'h-auto min-h-[84px] resize-y py-2.5')}
                    placeholder="Opcional"
                    {...form.register('notes')}
                  />
                </section>

                {viewOnly && viewStateCodigo === 'confirmado' && editingId != null && cerradoStateId > 0 ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
                    <span>Documento confirmado: podés cerrarlo para dejarlo solo lectura definitivo.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={transitionMut.isPending}
                      onClick={() => transitionMut.mutate({ id: editingId, document_state_id: cerradoStateId })}
                    >
                      {transitionMut.isPending ? 'Aplicando…' : 'Pasar a Cerrado'}
                    </Button>
                  </div>
                ) : null}
                </div>
              </div>
            </div>

            <DialogFooter
              className={cn(
                operationalModalFooterClass,
                'flex flex-col gap-4 border-border/90 bg-muted/20 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
              )}
            >
              <div className="order-2 flex min-w-0 flex-col gap-2.5 sm:order-1 sm:max-w-[min(40rem,100%)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Totales en pantalla</p>
                <div className="flex flex-wrap gap-3 sm:gap-3.5">
                  <div className="min-w-[7rem] flex-1 rounded-xl border border-sky-100/90 bg-gradient-to-br from-white to-sky-50/40 px-3.5 py-3 shadow-sm ring-1 ring-slate-100/80 sm:flex-initial">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Neto</p>
                    <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none text-slate-900">
                      {formatLb(lineTotals.net, 2)}{' '}
                      <span className="text-xs font-normal text-slate-500">lb</span>
                    </p>
                  </div>
                  <div className="min-w-[7rem] flex-1 rounded-xl border border-violet-100/90 bg-gradient-to-br from-white to-violet-50/35 px-3.5 py-3 shadow-sm ring-1 ring-slate-100/80 sm:flex-initial">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bruto</p>
                    <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none text-slate-900">
                      {formatLb(lineTotals.gross, 2)}{' '}
                      <span className="text-xs font-normal text-slate-500">lb</span>
                    </p>
                  </div>
                  <div className="min-w-[7rem] flex-1 rounded-xl border border-teal-100/90 bg-gradient-to-br from-white to-teal-50/35 px-3.5 py-3 shadow-sm ring-1 ring-slate-100/80 sm:flex-initial">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Envases</p>
                    <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none text-slate-900">{formatCount(lineTotals.qty)}</p>
                  </div>
                </div>
              </div>
              <div className="order-1 flex flex-wrap items-center justify-end gap-2 sm:order-2 sm:shrink-0">
                <Button type="button" variant="outline" onClick={() => closeDialog()}>
                  {viewOnly ? 'Cerrar' : 'Cancelar'}
                </Button>
                {!viewOnly ? (
                  <button
                    type="submit"
                    className={modalFormPrimaryButton}
                    disabled={createMut.isPending || updateMut.isPending}
                  >
                    {createMut.isPending || updateMut.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                ) : null}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <h2 className={pageTitle}>Recepciones</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>Ingreso de materia prima a planta: pesos, lotes y trazabilidad hacia proceso.</p>
            <button type="button" className={pageInfoButton} title={helpTitle} aria-label="Ayuda recepciones">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Button className={cn(btnToolbarPrimary, 'shrink-0')} onClick={() => openNew()}>
          <Plus className="h-4 w-4" />
          Nueva recepción
        </Button>
      </div>

      <section aria-labelledby="rec-kpis" className="space-y-3">
        <h2 id="rec-kpis" className="sr-only">
          Indicadores
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Recepciones totales</p>
            <p className={kpiValueLg}>{formatCount(receptionKpis.nRecepciones)}</p>
            <p className={kpiFootnote}>En vista actual</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Borradores</p>
            <p className={kpiValueLg}>{formatCount(receptionKpis.nBorrador)}</p>
            <p className={kpiFootnote}>Estado documento</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Confirmadas</p>
            <p className={kpiValueLg}>{formatCount(receptionKpis.nConfirmado)}</p>
            <p className={kpiFootnote}>Listas operativamente</p>
          </div>
          <div
            className={cn(
              kpiCard,
              receptionKpis.nCerrado > 0 ? 'border-violet-200/85 bg-violet-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Cerradas</p>
            <p className={cn(kpiValueLg, receptionKpis.nCerrado > 0 ? 'text-violet-950' : '')}>
              {formatCount(receptionKpis.nCerrado)}
            </p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Cierre administrativo</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Lb netas recibidas</p>
            <p className={kpiValueMd}>{formatLb(receptionKpis.totalNet, 2)}</p>
            <p className={kpiFootnote}>Suma líneas (filtro)</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Productores activos</p>
            <p className={kpiValueMd}>{formatCount(receptionKpis.nProductores)}</p>
            <p className={kpiFootnote}>En vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Líneas / lotes</p>
            <p className={kpiValueMd}>{formatCount(receptionKpis.nLineasTotal)}</p>
            <p className={kpiFootnote}>Lotes distintos: {formatCount(receptionKpis.nLotesDistinct)}</p>
          </div>
          <div
            className={cn(
              kpiCardSm,
              receptionKpis.nAnulado > 0 ? 'border-rose-200/90 bg-rose-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Anulados</p>
            <p className={cn(kpiValueMd, receptionKpis.nAnulado > 0 ? 'text-rose-900' : '')}>
              {formatCount(receptionKpis.nAnulado)}
            </p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Documentos anulados</p>
          </div>
        </div>
      </section>

      {receptionAlertLines.length > 0 ? (
        <div className={signalsPanel}>
          <p className={signalsTitle}>Señales operativas</p>
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

      <div className={filterPanel}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Productor, variedad en línea, tipo de recepción, uso documento y búsqueda libre."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-2 lg:grid-cols-12 lg:items-end">
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Productor</Label>
            <select className={filterSelectClass} value={filterProducer} onChange={(e) => setFilterProducer(Number(e.target.value))}>
              <option value={0}>Todos</option>
              {(producers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Variedad (línea)</Label>
            <select className={filterSelectClass} value={filterVariety} onChange={(e) => setFilterVariety(Number(e.target.value))}>
              <option value={0}>Todas</option>
              {(varieties ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Tipo fruta</Label>
            <select className={filterSelectClass} value={filterTipo} onChange={(e) => setFilterTipo(Number(e.target.value))}>
              <option value={0}>Todos</option>
              {(receptionTypes ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Uso documento</Label>
            <select className={filterSelectClass} value={filterUso} onChange={(e) => setFilterUso(e.target.value as typeof filterUso)}>
              <option value="todos">Todos</option>
              <option value="abierto">Solo abiertos</option>
              <option value="cerrado">Solo cerrados</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label className="text-xs text-slate-500">Buscar</Label>
            <Input
              className={filterInputClass}
              placeholder="Ref., guía, productor, nota, lote…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="rec-tabla">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
          <h2 id="rec-tabla" className={sectionTitle}>
            Historial operativo
          </h2>
          <p className={sectionHint}>
            {filteredReceptions.length} registro(s) · lb netas suman líneas; cabecera bruto/neto si el servidor lo envía
          </p>
          </div>
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
        </div>
        {!filteredReceptions.length ? (
          <p className={emptyStatePanel}>Sin recepciones con el filtro actual.</p>
        ) : viewMode === 'compact' ? (
          <div className="space-y-2.5">
            {compactGroups.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-lg border border-slate-200/85 bg-white">
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/85">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{group.producerName}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatCount(group.receptions.length)} recepción(es) · {formatLb(group.totalNet, 2)} lb netas
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.pendingCount > 0 ? (
                      <span className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        Pendiente: {formatCount(group.pendingCount)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="min-w-[146px]">Estado</TableHead>
                        <TableHead className="whitespace-nowrap">Fecha</TableHead>
                        <TableHead className="min-w-[110px]">Variedad</TableHead>
                        <TableHead className="min-w-[180px]">Guía / lote</TableHead>
                        <TableHead className="text-right tabular-nums">Lb netas</TableHead>
                        <TableHead className="w-[200px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.receptions.map((r) => {
                        const uso = usoRecepcionLabel(r);
                        const tone = receptionVisualTone(r);
                        const netLb = receptionNetLb(r);
                        const isLowNet = netLb > 0 && netLb < 400;
                        return (
                          <Fragment key={r.id}>
                            <TableRow className={cn(tableBodyRow, 'border-b border-slate-100/80 transition-colors', tone.rowHover)}>
                              <TableCell className="max-w-[180px] py-2 align-top">
                                <div className="flex flex-col gap-1">
                                  <span className={cn('h-1 w-8 rounded-full', tone.leftBar)} />
                                  <DocumentStateBadge codigo={r.document_state?.codigo} nombre={r.document_state?.nombre} />
                                  <span
                                    className={cn('inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold', tone.usoBadge)}
                                    title={uso.title}
                                  >
                                    {uso.short}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 align-top text-xs text-slate-700">{formatReceptionDate(r.received_at)}</TableCell>
                              <TableCell className="max-w-[120px] py-2 align-top text-xs text-slate-700">{variedadCabecera(r)}</TableCell>
                              <TableCell className="max-w-[200px] py-2 align-top font-mono text-xs text-slate-800">
                                {r.reference_code ?? r.document_number ?? '—'}
                                {lotesResumen(r) !== '—' ? <p className="mt-0.5 text-[9px] text-slate-500">Lote: {lotesResumen(r)}</p> : null}
                              </TableCell>
                              <TableCell className={cn('py-2 align-top text-right tabular-nums', isLowNet ? 'text-amber-700' : 'text-slate-900')}>
                                <span className="text-[15px] font-semibold leading-none">{formatLb(netLb, 2)}</span>
                              </TableCell>
                              <TableCell className="py-2 align-top">
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  {r.document_state?.codigo === 'borrador' ? (
                                    <Button type="button" variant="default" size="sm" className="h-7 gap-1 rounded-lg" onClick={() => openEdit(r.id)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                      Editar
                                    </Button>
                                  ) : (
                                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-lg border-slate-200" onClick={() => openView(r.id)}>
                                      <Eye className="h-3.5 w-3.5" />
                                      Ver
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 rounded-lg border-slate-200"
                                    onClick={async () => {
                                      try {
                                        await downloadPdf(`/api/documents/receptions/${r.id}/pdf`, `informe-recepcion-${r.id}.pdf`);
                                        toast.success('Informe listo');
                                      } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'Error al descargar');
                                      }
                                    }}
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                    Informe
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 rounded-lg px-2 text-xs font-normal text-slate-600 hover:text-slate-900"
                                    onClick={() =>
                                      setExpandedRows((prev) => ({
                                        ...prev,
                                        [r.id]: !prev[r.id],
                                      }))
                                    }
                                  >
                                    {expandedRows[r.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    Ver detalle
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {expandedRows[r.id] ? (
                              <TableRow className="bg-slate-50/55">
                                <TableCell colSpan={6} className="py-2">
                                  <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                                    <p><span className="font-semibold text-slate-800">ID:</span> #{r.id}</p>
                                    <p><span className="font-semibold text-slate-800">Tipo:</span> {r.reception_type?.nombre ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">Mercado:</span> {r.mercado?.nombre ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">Planta:</span> {r.plant_code ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">Doc/guía:</span> {r.document_number ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">Referencia:</span> {r.reference_code ?? '—'}</p>
                                    <p><span className="font-semibold text-slate-800">Líneas:</span> {formatCount(r.lines?.length ?? 0)}</p>
                                    <p><span className="font-semibold text-slate-800">Lotes:</span> {lotesDetalle(r)}</p>
                                  </div>
                                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
                                    <span className="font-semibold text-slate-800">Observaciones:</span> {r.notes?.trim() || '—'}
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
          <div className={tableShell}>
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[168px]">Estado</TableHead>
                  <TableHead className="whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="min-w-[140px]">Productor</TableHead>
                  <TableHead className="min-w-[120px]">Guía / lote</TableHead>
                  <TableHead className="min-w-[100px]">Variedad</TableHead>
                  <TableHead className="text-right tabular-nums">Lb netas</TableHead>
                  {viewMode === 'detailed' ? <TableHead className="min-w-[140px]">Observaciones</TableHead> : null}
                  <TableHead className="w-[200px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceptions.map((r) => {
                  const uso = usoRecepcionLabel(r);
                  const tone = receptionVisualTone(r);
                  const netLb = receptionNetLb(r);
                  const isLowNet = netLb > 0 && netLb < 400;
                  return (
                    <Fragment key={r.id}>
                      <TableRow className={cn(tableBodyRow, 'border-b border-slate-100/80 transition-colors', tone.rowHover)}>
                        <TableCell className="max-w-[200px] py-2.5 align-top">
                          <div className="flex flex-col gap-1">
                            <span className={cn('h-1 w-8 rounded-full', tone.leftBar)} />
                            <DocumentStateBadge codigo={r.document_state?.codigo} nombre={r.document_state?.nombre} />
                            <span
                              className={cn('inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold', tone.usoBadge)}
                              title={uso.title}
                            >
                              {uso.short}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 align-top text-xs text-slate-700">{formatReceptionDate(r.received_at)}</TableCell>
                        <TableCell className="max-w-[180px] py-2.5 align-top">
                          <p className="truncate text-sm font-medium text-slate-900" title={r.producer?.nombre ?? ''}>
                            {r.producer?.nombre ?? '—'}
                          </p>
                          {viewMode === 'detailed' ? <p className="font-mono text-[11px] text-slate-400">#{r.id}</p> : null}
                        </TableCell>
                        <TableCell className="max-w-[180px] py-2.5 align-top font-mono text-xs text-slate-800">
                          {r.reference_code ?? r.document_number ?? '—'}
                          {lotesResumen(r) !== '—' ? <p className="mt-0.5 text-[9px] text-slate-500">Lote: {lotesResumen(r)}</p> : null}
                        </TableCell>
                        <TableCell className="max-w-[120px] py-2.5 align-top text-xs text-slate-700">{variedadCabecera(r)}</TableCell>
                        <TableCell className={cn('py-2.5 align-top text-right tabular-nums', isLowNet ? 'text-amber-700' : 'text-slate-900')}>
                          <span className="text-[15px] font-semibold leading-none">
                            {formatLb(netLb, 2)}
                          </span>
                        </TableCell>
                        {viewMode === 'detailed' ? (
                          <TableCell className="max-w-[220px] py-2.5 align-top">
                            <p className="line-clamp-2 text-[11px] leading-snug text-slate-500" title={r.notes?.trim() ?? ''}>
                              {r.notes?.trim() || '—'}
                            </p>
                          </TableCell>
                        ) : null}
                        <TableCell className="py-2.5 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {r.document_state?.codigo === 'borrador' ? (
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="h-8 gap-1 rounded-lg"
                                onClick={() => openEdit(r.id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 rounded-lg border-slate-200"
                                onClick={() => openView(r.id)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Ver
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 rounded-lg border-slate-200"
                              onClick={async () => {
                                try {
                                  await downloadPdf(`/api/documents/receptions/${r.id}/pdf`, `informe-recepcion-${r.id}.pdf`);
                                  toast.success('Informe listo');
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : 'Error al descargar');
                                }
                              }}
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Informe
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 rounded-lg px-2 text-xs font-normal text-slate-600 hover:text-slate-900"
                              onClick={() =>
                                setExpandedRows((prev) => ({
                                  ...prev,
                                  [r.id]: !prev[r.id],
                                }))
                              }
                            >
                              {expandedRows[r.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              Ver detalle
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows[r.id] ? (
                        <TableRow className="bg-slate-50/55">
                          <TableCell colSpan={8} className="py-2.5">
                            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                              <p><span className="font-semibold text-slate-800">ID:</span> #{r.id}</p>
                              <p><span className="font-semibold text-slate-800">Tipo:</span> {r.reception_type?.nombre ?? '—'}</p>
                              <p><span className="font-semibold text-slate-800">Mercado:</span> {r.mercado?.nombre ?? '—'}</p>
                              <p><span className="font-semibold text-slate-800">Planta:</span> {r.plant_code ?? '—'}</p>
                              <p><span className="font-semibold text-slate-800">Doc/guía:</span> {r.document_number ?? '—'}</p>
                              <p><span className="font-semibold text-slate-800">Referencia:</span> {r.reference_code ?? '—'}</p>
                              <p><span className="font-semibold text-slate-800">Líneas:</span> {formatCount(r.lines?.length ?? 0)}</p>
                              <p><span className="font-semibold text-slate-800">Lotes:</span> {lotesDetalle(r)}</p>
                            </div>
                            <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
                              <span className="font-semibold text-slate-800">Observaciones:</span> {r.notes?.trim() || '—'}
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
        )}
      </section>

      <section aria-labelledby="rec-analisis" className="space-y-3">
        <div>
          <h2 id="rec-analisis" className={sectionTitle}>
            Análisis de volumen
          </h2>
          <p className={sectionHint}>
            Derivado del filtro actual · promedio{' '}
            {receptionKpis.avgLbPorRecepcion != null ? formatLb(receptionKpis.avgLbPorRecepcion, 2) : '—'} lb por recepción
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className={contentCard}>
            <CardHeader className="space-y-3 pb-4 pt-5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                Manual vs máquina (lb netos)
              </CardDescription>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Manual</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">{formatLb(receptionKpis.lbManual, 2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Máquina</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">{formatLb(receptionKpis.lbMaquina, 2)}</p>
                </div>
              </div>
              {receptionKpis.lbOtroTipo > 0.001 ? (
                <p className="text-xs text-slate-500">
                  Otros tipos:{' '}
                  <span className="font-medium tabular-nums text-slate-800">{formatLb(receptionKpis.lbOtroTipo, 2)}</span> lb
                </p>
              ) : null}
            </CardHeader>
          </Card>
          <Card className={contentCard}>
            <CardHeader className="space-y-2 pb-4 pt-5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                Top variedades (lb)
              </CardDescription>
              <ol className="list-none space-y-2 text-sm">
                {receptionKpis.topVariedades.length === 0 ? (
                  <li className="text-slate-500">Sin líneas en el filtro.</li>
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
                Top productores (lb)
              </CardDescription>
              <ol className="list-none space-y-2 text-sm">
                {receptionKpis.topProductores.length === 0 ? (
                  <li className="text-slate-500">Sin datos.</li>
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
    </div>
  );
}
