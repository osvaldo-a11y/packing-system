import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Info,
  MoreHorizontal,
  Package,
  Plus,
  Truck,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson, downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import {
  dispatchConfirmShouldWarn,
  dispatchHasAnyOperationalAlert,
  palletsCabeceraClienteFueraSinDestino,
  summarizeDispatchPalletRisks,
} from '@/lib/operational-risk';
import { formatCount, formatLb, formatMoney, parseNumeric } from '@/lib/number-format';
import {
  contentCard,
  emptyStatePanel,
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
import type { FinalPalletApi } from '@/types/final-pallet';
import type { FruitProcessRow } from './ProcessesPage';
import type { PtTagApi } from './PtTagsPage';
import type { SalesOrderRow } from './SalesOrdersPage';

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type DispatchItemApi = {
  id: number;
  tarja_id: number;
  /** Código TAR cuando existe en maestro pt_tags. */
  tag_code?: string | null;
  cajas_despachadas: number;
  pallets_despachados: number;
  unit_price: string;
  pallet_cost: string;
};

export type InvoiceLineApi = {
  id: number;
  tarja_id: number | null;
  final_pallet_id?: number | null;
  fruit_process_id?: number | null;
  traceability_note?: string | null;
  /** Presente si el backend lo envía: línea automática con unidad PT o proceso para liquidación. */
  traceability_ok?: boolean;
  cajas: number;
  unit_price: string;
  line_subtotal: string;
  pallet_cost_total: string;
  is_manual: boolean;
  species_id: number | null;
  variety_id: number | null;
  packaging_code: string | null;
  brand: string | null;
  trays: number | null;
  pounds: string | null;
  packing_list_ref: string | null;
  manual_description?: string | null;
  manual_line_kind?: string | null;
  tag_code?: string | null;
  codigo_unidad_pt_display?: string | null;
};

export type DispatchBolOrigin =
  | 'inherited_from_pl'
  | 'manual_entry'
  | 'dispatch_only'
  | 'synced_to_pls'
  | string;

export type DispatchApi = {
  id: number;
  orden_id: number;
  cliente_id: number;
  /** Maestro clients: nombre del cliente pedido (mismo id que cliente_id). */
  cliente_nombre?: string | null;
  client_id?: number | null;
  /** Maestro clients: nombre del cliente comercial (mismo id que client_id). */
  client_nombre?: string | null;
  fecha_despacho: string;
  numero_bol: string;
  bol_origin?: DispatchBolOrigin;
  temperatura_f: string;
  thermograph_serial?: string | null;
  thermograph_notes?: string | null;
  status?: string;
  /** ISO: momento de confirmación (cierre operativo del documento). */
  confirmed_at?: string | null;
  /** ISO: momento en que se registró salida física (despachado). */
  despachado_at?: string | null;
  kind?: 'packing_lists' | 'legacy';
  pt_packing_lists?: Array<{ id: number; list_code: string; numero_bol?: string | null }>;
  final_pallet_unit_prices?: Record<string, number> | null;
  final_pallets?: Array<{
    id: number;
    corner_board_code: string;
    presentation_format_id: number | null;
    format_code: string | null;
    codigo_unidad_pt_display?: string | null;
    tag_code?: string | null;
    trazabilidad_pt?: 'unica' | 'varias' | 'sin_trazabilidad';
  }>;
  items: DispatchItemApi[];
  packing_list: { id: number; packing_number: string } | null;
  invoice: {
    id: number;
    invoice_number: string;
    subtotal: string;
    total_cost: string;
    total: string;
    lines?: InvoiceLineApi[];
  } | null;
};

export type DispatchConfirmResponse = {
  confirmation: {
    dispatch_id: number;
    status: 'confirmado';
    confirmed_at: string;
    linked_pt_packing_lists: Array<{ id: number; list_code: string }>;
    messages: string[];
  };
  dispatches: DispatchApi[];
};

export type DispatchDespacharResponse = {
  transition: {
    dispatch_id: number;
    status: 'despachado';
    despachado_at: string;
    messages: string[];
  };
  dispatches: DispatchApi[];
};

export type DispatchRevertDespachadoResponse = {
  reversion: {
    dispatch_id: number;
    status: 'confirmado';
    messages: string[];
  };
  dispatches: DispatchApi[];
};

const dispatchSchema = z.object({
  orden_id: z.coerce.number().int().positive(),
  cliente_id: z.coerce.number().int().positive(),
  /** Cliente comercial (maestro clients) para stock PT; 0 = no fijar */
  client_id: z.coerce.number().int().min(0).optional(),
  fecha_despacho: z.string().min(1),
  /** Vacío = el backend usa BOL heredado de los PL si existe. */
  numero_bol: z.string().max(50).optional(),
  temperatura_f: z.coerce.number(),
  thermograph_serial: z.string().optional(),
  thermograph_notes: z.string().optional(),
});

const addTagSchema = z
  .object({
    tarja_id: z.coerce.number().int(),
    cajas_despachadas: z.coerce.number().int().min(1),
    pallets_despachados: z.coerce.number().int().min(1),
    unit_price: z.coerce.number().min(0),
    pallet_cost: z.coerce.number().min(0),
  })
  .refine((d) => d.tarja_id > 0, { message: 'Elegí una unidad PT', path: ['tarja_id'] });

const manualInvoiceLineSchema = z.object({
  descripcion: z.string().min(1).max(500),
  cantidad: z.coerce.number().int().min(1),
  unit_price: z.coerce.number().min(0),
  tipo: z.enum(['cargo', 'descuento']),
});

type DispatchForm = z.infer<typeof dispatchSchema>;
type AddTagForm = z.infer<typeof addTagSchema>;
type ManualInvoiceForm = z.infer<typeof manualInvoiceLineSchema>;

function fetchDispatches() {
  return apiJson<DispatchApi[]>('/api/dispatches');
}

function fetchSalesOrders() {
  return apiJson<SalesOrderRow[]>('/api/sales-orders');
}

function fetchPtTags() {
  return apiJson<PtTagApi[]>('/api/pt-tags');
}

/** Formatos únicos con ID para precio por caja (factura comercial). */
function dispatchClienteLabel(d: DispatchApi) {
  return d.client_nombre?.trim() || d.cliente_nombre?.trim() || `Cliente #${d.cliente_id}`;
}

function dispatchTotalCajas(d: DispatchApi) {
  const byItems = d.items.reduce((s, i) => s + i.cajas_despachadas, 0);
  if (byItems > 0) return byItems;
  const byInvoiceLines = (d.invoice?.lines ?? []).reduce((s, ln) => s + (Number(ln.cajas) || 0), 0);
  return byInvoiceLines > 0 ? byInvoiceLines : 0;
}

/** En listado: no confundir 0 cajas con “dato ausente” cuando el origen no aporta cajas. */
function dispatchCajasListDisplay(d: DispatchApi): { text: string; title?: string } {
  const n = dispatchTotalCajas(d);
  if (n === 0) {
    return {
      text: '—',
      title:
        'Cantidad de cajas no disponible desde el origen de este despacho (p. ej. solo packing lists o facturación por lb).',
    };
  }
  return { text: String(n) };
}

/** Suma lb desde líneas de factura si existen; si no, null. */
function dispatchTotalLb(d: DispatchApi) {
  const lines = d.invoice?.lines ?? [];
  let sum = 0;
  for (const l of lines) {
    const x = Number(l.pounds);
    if (Number.isFinite(x)) sum += x;
  }
  return sum > 0 ? sum : null;
}

function dispatchTotalLbFromPtTags(d: DispatchApi, ptTagById: Map<number, PtTagApi>) {
  const seen = new Set<number>();
  let sum = 0;
  for (const it of d.items ?? []) {
    const id = Number(it.tarja_id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const w = Number(ptTagById.get(id)?.net_weight_lb);
    if (Number.isFinite(w) && w > 0) sum += w;
  }
  return sum > 0 ? sum : null;
}

function formatDispatchFechaCell(iso: string) {
  try {
    return new Date(iso).toLocaleString('es', {
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

function orderLabelForDispatch(d: DispatchApi, salesOrders: SalesOrderRow[] | undefined) {
  const o = salesOrders?.find((x) => x.id === d.orden_id);
  return o?.order_number?.trim() ? o.order_number : `#${d.orden_id}`;
}

function packingListSummary(d: DispatchApi): string {
  if (d.pt_packing_lists?.length) {
    return d.pt_packing_lists.map((p) => p.list_code).join(', ');
  }
  if (d.packing_list?.packing_number) return d.packing_list.packing_number;
  return '—';
}

function docTransporteLine(d: DispatchApi): string {
  if (d.invoice?.invoice_number) return `Fact. ${d.invoice.invoice_number}`;
  if (d.thermograph_serial?.trim()) return d.thermograph_serial.trim();
  return '—';
}

function destinoDespachoDisplay(d: DispatchApi): { text: string; title?: string } {
  const n = d.thermograph_notes?.trim();
  if (n) return { text: n.length > 36 ? `${n.slice(0, 36)}…` : n, title: n };
  return { text: '—' };
}

function DispatchKindBadge({ kind }: { kind?: DispatchApi['kind'] }) {
  const pl = kind === 'packing_lists';
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        pl ? 'border-sky-200/90 bg-sky-50 text-sky-900' : 'border-slate-200 bg-slate-100 text-slate-700',
      )}
    >
      {pl ? 'PL' : 'Legacy'}
    </span>
  );
}

function DispatchFlowStatusBadge({ status }: { status?: string }) {
  const s = String(status ?? 'borrador').toLowerCase();
  const map: Record<string, string> = {
    borrador: 'border-slate-200 bg-slate-100 text-slate-800',
    confirmado: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
    despachado: 'border-violet-200/85 bg-violet-50 text-violet-900',
  };
  return (
    <span
      className={cn(
        'inline-flex max-w-[120px] truncate rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize leading-none',
        map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800',
      )}
      title={s}
    >
      {s}
    </span>
  );
}

function displayUnidadPtFromDispatchFp(fp: {
  id: number;
  corner_board_code: string;
  codigo_unidad_pt_display?: string | null;
  tag_code?: string | null;
}) {
  return (
    fp.codigo_unidad_pt_display?.trim() ||
    fp.tag_code?.trim() ||
    fp.corner_board_code?.trim() ||
    `PF-${fp.id}`
  );
}

function uniqueFormatsFromFinalPallets(
  fps: Array<{ presentation_format_id: number | null; format_code?: string | null }>,
) {
  const m = new Map<number, { id: number; format_code: string | null }>();
  for (const fp of fps) {
    if (fp.presentation_format_id != null && fp.presentation_format_id > 0 && !m.has(fp.presentation_format_id)) {
      m.set(fp.presentation_format_id, { id: fp.presentation_format_id, format_code: fp.format_code ?? null });
    }
  }
  return [...m.values()].sort((a, b) => (a.format_code || '').localeCompare(b.format_code || ''));
}

function summarizeDispatchFormatCodes(d: DispatchApi): string {
  const uf = uniqueFormatsFromFinalPallets(d.final_pallets ?? []);
  const codes = uf.map((x) => (x.format_code ?? '').trim()).filter((x): x is string => x.length > 0);
  const sorted = [...new Set(codes)].sort((a, b) => a.localeCompare(b, 'es'));
  if (sorted.length === 0) return '—';
  if (sorted.length === 1) return sorted[0];
  if (sorted.length === 2) return `${sorted[0]} · ${sorted[1]}`;
  return `${sorted[0]} · ${sorted[1]} · +${sorted.length - 2}`;
}

function dispatchCompactRowTone(d: DispatchApi): { bar: string; badgeClass: string; shortLabel: string } {
  const s = String(d.status ?? 'borrador').toLowerCase();
  if (s === 'anulado' || s === 'cancelado') {
    return {
      bar: 'bg-rose-500',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-900',
      shortLabel: 'Anulado',
    };
  }
  if (s === 'despachado') {
    return {
      bar: 'bg-emerald-500',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      shortLabel: 'Ejecutado',
    };
  }
  if (s === 'confirmado') {
    return {
      bar: 'bg-sky-500',
      badgeClass: 'border-sky-200 bg-sky-50 text-sky-900',
      shortLabel: 'Confirmado',
    };
  }
  return {
    bar: 'bg-amber-400',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-950',
    shortLabel: 'Borrador',
  };
}

function dispatchDocCodeLine(d: DispatchApi): string {
  const inv = d.invoice?.invoice_number?.trim();
  if (inv) return inv;
  return `Despacho #${d.id}`;
}

type MasterClient = { id: number; codigo: string; nombre: string };

type LinkablePtPl = {
  id: number;
  list_code: string;
  client_id: number | null;
  client_nombre: string | null;
  list_date: string;
  numero_bol?: string | null;
  pallet_count: number;
};

export function DispatchesPage() {
  const { role } = useAuth();
  const canRevertSalida = role === 'admin' || role === 'supervisor' || role === 'operator';
  const queryClient = useQueryClient();
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [addTagDispatchId, setAddTagDispatchId] = useState<number | null>(null);
  const [invoiceLineDispatchId, setInvoiceLineDispatchId] = useState<number | null>(null);
  const [attachFpDispatchId, setAttachFpDispatchId] = useState<number | null>(null);
  const [fpSelect, setFpSelect] = useState<Record<number, boolean>>({});
  /** Precio/caja por presentation_format_id al vincular pallets (string para inputs). */
  const [fpAttachUnitPrices, setFpAttachUnitPrices] = useState<Record<string, string>>({});
  const [invoicePricesDispatchId, setInvoicePricesDispatchId] = useState<number | null>(null);
  const [dispatchInvoiceUnitPrices, setDispatchInvoiceUnitPrices] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState('');
  const [filterClienteComercial, setFilterClienteComercial] = useState(0);
  const [filterFechaDesde, setFilterFechaDesde] = useState('');
  const [filterFechaHasta, setFilterFechaHasta] = useState('');
  const [selectedPlIds, setSelectedPlIds] = useState<number[]>([]);
  const [bolDialogDispatchId, setBolDialogDispatchId] = useState<number | null>(null);
  const [bolEditValue, setBolEditValue] = useState('');
  const [bolApplyToPls, setBolApplyToPls] = useState(false);
  const [metaDialogDispatchId, setMetaDialogDispatchId] = useState<number | null>(null);
  const [metaFechaDespacho, setMetaFechaDespacho] = useState('');
  const [metaTemperaturaF, setMetaTemperaturaF] = useState('');
  const [metaThermographSerial, setMetaThermographSerial] = useState('');
  const [metaThermographNotes, setMetaThermographNotes] = useState('');
  const [orderLinkDialogDispatchId, setOrderLinkDialogDispatchId] = useState<number | null>(null);
  const [orderLinkOrderId, setOrderLinkOrderId] = useState(0);
  const [orderLinkClientId, setOrderLinkClientId] = useState(0);
  const [orderLinkCommercialClientId, setOrderLinkCommercialClientId] = useState(0);
  const [confirmDispatchId, setConfirmDispatchId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');

  const { data: dispatches, isPending, isError, error } = useQuery({
    queryKey: ['dispatches'],
    queryFn: fetchDispatches,
  });

  const { data: salesOrders } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: fetchSalesOrders,
  });

  const { data: ptTags } = useQuery({
    queryKey: ['pt-tags'],
    queryFn: fetchPtTags,
  });

  const { data: commercialClients } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<MasterClient[]>('/api/masters/clients'),
  });

  const { data: linkablePtPl } = useQuery({
    queryKey: ['dispatches', 'linkable-pt-packing-lists'],
    queryFn: () => apiJson<LinkablePtPl[]>('/api/dispatches/linkable-pt-packing-lists'),
    enabled: dispatchOpen,
  });

  const inheritedBolPreview = useMemo(() => {
    if (!linkablePtPl || selectedPlIds.length === 0) return { value: null as string | null, conflict: false };
    const selected = linkablePtPl.filter((p) => selectedPlIds.includes(p.id));
    const bols = [...new Set(selected.map((p) => (p.numero_bol?.trim() ?? '')).filter(Boolean))];
    if (bols.length > 1) return { value: null, conflict: true };
    return { value: bols.length === 1 ? bols[0]! : null, conflict: false };
  }, [linkablePtPl, selectedPlIds]);

  const { data: allFinalPallets } = useQuery({
    queryKey: ['final-pallets'],
    queryFn: () => apiJson<FinalPalletApi[]>('/api/final-pallets'),
  });

  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiJson<FruitProcessRow[]>('/api/processes'),
  });

  const palletById = useMemo(() => {
    const m = new Map<number, FinalPalletApi>();
    for (const p of allFinalPallets ?? []) m.set(p.id, p);
    return m;
  }, [allFinalPallets]);
  const ptTagById = useMemo(() => {
    const m = new Map<number, PtTagApi>();
    for (const t of ptTags ?? []) m.set(t.id, t);
    return m;
  }, [ptTags]);

  const dispatchForm = useForm<DispatchForm>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: {
      orden_id: 1,
      cliente_id: 1,
      client_id: 0,
      fecha_despacho: toDatetimeLocalValue(new Date().toISOString()),
      numero_bol: '',
      temperatura_f: 34,
      thermograph_serial: '',
      thermograph_notes: '',
    },
  });

  const availableFinalPallets = useMemo(() => {
    const did = attachFpDispatchId;
    return (allFinalPallets ?? []).filter(
      (p) =>
        p.status === 'definitivo' &&
        (p.dispatch_id == null || p.dispatch_id === 0 || (did != null && p.dispatch_id === did)),
    );
  }, [allFinalPallets, attachFpDispatchId]);

  /** Formatos de los pallets marcados en el diálogo de vincular PF. */
  const attachDialogFormats = useMemo(() => {
    if (attachFpDispatchId == null) return [];
    const selected = availableFinalPallets.filter((p) => fpSelect[p.id]);
    return uniqueFormatsFromFinalPallets(selected);
  }, [attachFpDispatchId, availableFinalPallets, fpSelect]);

  const invoiceModalFormats = useMemo(() => {
    const d = dispatches?.find((x) => x.id === invoicePricesDispatchId);
    if (!d) return [];
    return uniqueFormatsFromFinalPallets(d.final_pallets ?? []);
  }, [dispatches, invoicePricesDispatchId]);

  const invoicePricesDispatch = dispatches?.find((x) => x.id === invoicePricesDispatchId);
  const invoicePricesLocked = invoicePricesDispatch?.status === 'despachado';
  const orderLinkDispatch = dispatches?.find((x) => x.id === orderLinkDialogDispatchId);
  const orderLinkSelectedOrder = salesOrders?.find((s) => s.id === orderLinkOrderId);
  const orderLinkClientLabel = orderLinkSelectedOrder?.cliente_nombre?.trim() || `Cliente #${orderLinkClientId}`;

  const tagForm = useForm<AddTagForm>({
    resolver: zodResolver(addTagSchema),
    defaultValues: {
      tarja_id: 0,
      cajas_despachadas: 1,
      pallets_despachados: 1,
      unit_price: 0,
      pallet_cost: 0,
    },
  });

  const manualInvForm = useForm<ManualInvoiceForm>({
    resolver: zodResolver(manualInvoiceLineSchema),
    defaultValues: {
      descripcion: '',
      cantidad: 1,
      unit_price: 0,
      tipo: 'cargo',
    },
  });

  const ordenW = dispatchForm.watch('orden_id');
  const selectedSalesOrder = useMemo(
    () => salesOrders?.find((x) => x.id === ordenW),
    [salesOrders, ordenW],
  );

  useEffect(() => {
    const o = salesOrders?.find((x) => x.id === ordenW);
    if (o) dispatchForm.setValue('cliente_id', o.cliente_id);
  }, [ordenW, salesOrders, dispatchForm]);

  /** Cliente comercial en los PL seleccionados: un solo valor permite heredar; varios distintos = conflicto. */
  const plCommercialPreview = useMemo(() => {
    if (!linkablePtPl || selectedPlIds.length === 0) return { unified: null as number | null, conflict: false };
    const selected = linkablePtPl.filter((p) => selectedPlIds.includes(p.id));
    const ids = [
      ...new Set(
        selected.map((p) => p.client_id).filter((x): x is number => x != null && x > 0),
      ),
    ];
    if (ids.length > 1) return { unified: null, conflict: true };
    if (ids.length === 1) return { unified: ids[0]!, conflict: false };
    return { unified: null, conflict: false };
  }, [linkablePtPl, selectedPlIds]);

  useEffect(() => {
    if (!dispatchOpen) return;
    if (selectedPlIds.length === 0) {
      dispatchForm.setValue('client_id', 0);
      return;
    }
    if (plCommercialPreview.conflict) {
      dispatchForm.setValue('client_id', 0);
      return;
    }
    if (plCommercialPreview.unified != null) {
      dispatchForm.setValue('client_id', plCommercialPreview.unified);
    } else {
      dispatchForm.setValue('client_id', 0);
    }
  }, [dispatchOpen, selectedPlIds, plCommercialPreview, dispatchForm]);

  useEffect(() => {
    if (dispatchOpen && salesOrders?.length) {
      const first = salesOrders[0];
      dispatchForm.reset({
        orden_id: first.id,
        cliente_id: first.cliente_id,
        client_id: 0,
        fecha_despacho: toDatetimeLocalValue(new Date().toISOString()),
        numero_bol: '',
        temperatura_f: 34,
        thermograph_serial: '',
        thermograph_notes: '',
      });
    }
  }, [dispatchOpen, salesOrders, dispatchForm]);

  useEffect(() => {
    if (!dispatchOpen) return;
    if (inheritedBolPreview.conflict) return;
    dispatchForm.setValue('numero_bol', inheritedBolPreview.value ?? '');
  }, [dispatchOpen, selectedPlIds, inheritedBolPreview.value, inheritedBolPreview.conflict, dispatchForm]);

  const createDispatchMut = useMutation({
    mutationFn: (body: DispatchForm & { pt_packing_list_ids: number[] }) => {
      const payload: Record<string, unknown> = {
        pt_packing_list_ids: body.pt_packing_list_ids,
        orden_id: body.orden_id,
        cliente_id: body.cliente_id,
        fecha_despacho: new Date(body.fecha_despacho).toISOString(),
        temperatura_f: body.temperatura_f,
      };
      const nb = body.numero_bol?.trim();
      if (nb) payload.numero_bol = nb;
      const cid = body.client_id;
      if (cid != null && cid > 0) payload.client_id = cid;
      if (body.thermograph_serial?.trim()) payload.thermograph_serial = body.thermograph_serial.trim();
      if (body.thermograph_notes?.trim()) payload.thermograph_notes = body.thermograph_notes.trim();
      return apiJson('/api/dispatches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches', 'linkable-pt-packing-lists'] });
      queryClient.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      toast.success('Despacho creado');
      setDispatchOpen(false);
      setSelectedPlIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispatchBolMut = useMutation({
    mutationFn: async ({
      dispatchId,
      numero_bol,
      apply_to_packing_lists,
    }: {
      dispatchId: number;
      numero_bol: string;
      apply_to_packing_lists: boolean;
    }) =>
      apiJson(`/api/dispatches/${dispatchId}/bol`, {
        method: 'PATCH',
        body: JSON.stringify({ numero_bol, apply_to_packing_lists }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      queryClient.invalidateQueries({ queryKey: ['pt-packing-list'] });
      toast.success('BOL actualizado');
      setBolDialogDispatchId(null);
      setBolApplyToPls(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispatchMetaMut = useMutation({
    mutationFn: async ({
      dispatchId,
      fecha_despacho,
      temperatura_f,
      thermograph_serial,
      thermograph_notes,
    }: {
      dispatchId: number;
      fecha_despacho: string;
      temperatura_f: number;
      thermograph_serial: string;
      thermograph_notes: string;
    }) =>
      apiJson(`/api/dispatches/${dispatchId}/meta`, {
        method: 'PATCH',
        body: JSON.stringify({
          fecha_despacho,
          temperatura_f,
          thermograph_serial,
          thermograph_notes,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Datos operativos del despacho actualizados');
      setMetaDialogDispatchId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispatchOrderLinkMut = useMutation({
    mutationFn: async ({
      dispatchId,
      orden_id,
      cliente_id,
      client_id,
    }: {
      dispatchId: number;
      orden_id: number;
      cliente_id: number;
      client_id: number;
    }) =>
      apiJson(`/api/dispatches/${dispatchId}/order-link`, {
        method: 'PATCH',
        body: JSON.stringify({
          orden_id,
          cliente_id,
          client_id: client_id > 0 ? client_id : 0,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Pedido del despacho corregido');
      setOrderLinkDialogDispatchId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmDispatchMut = useMutation({
    mutationFn: (id: number) =>
      apiJson<DispatchConfirmResponse>('/api/dispatches/' + id + '/confirm', { method: 'POST' }),
    onSuccess: (data) => {
      setConfirmDispatchId(null);
      queryClient.setQueryData(['dispatches'], data.dispatches);
      toast.success('Listo: el despacho pasó a «confirmado»', {
        description: data.confirmation.messages.map((m) => `• ${m}`).join('\n'),
        duration: 18_000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const despacharMut = useMutation({
    mutationFn: (id: number) =>
      apiJson<DispatchDespacharResponse>('/api/dispatches/' + id + '/despachar', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['dispatches'], data.dispatches);
      toast.success('Listo: el despacho pasó a «despachado» (salida física)', {
        description: data.transition.messages.map((m) => `• ${m}`).join('\n'),
        duration: 16_000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revertDespachadoMut = useMutation({
    mutationFn: (id: number) =>
      apiJson<DispatchRevertDespachadoResponse>('/api/dispatches/' + id + '/revert-despachado', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['dispatches'], data.dispatches);
      toast.success('Salida física deshecha — el despacho volvió a «confirmado»', {
        description: data.reversion.messages.map((m) => `• ${m}`).join('\n'),
        duration: 16_000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attachFpMut = useMutation({
    mutationFn: async (dispatchId: number) => {
      const ids = Object.entries(fpSelect)
        .filter(([, v]) => v)
        .map(([k]) => Number(k));
      if (!ids.length) throw new Error('Seleccioná al menos un pallet en depósito (Unidad PT / Existencias).');
      const selectedPallets = availableFinalPallets.filter((p) => fpSelect[p.id]);
      const formatIds = new Set<number>();
      for (const p of selectedPallets) {
        if (p.presentation_format_id != null && p.presentation_format_id > 0) {
          formatIds.add(p.presentation_format_id);
        }
      }
      const prices: Record<string, number> = {};
      for (const fid of formatIds) {
        const raw = (fpAttachUnitPrices[String(fid)] ?? '').trim().replace(',', '.');
        const n = parseFloat(raw);
        prices[String(fid)] = Number.isFinite(n) ? n : 0;
      }
      return apiJson(`/api/dispatches/${dispatchId}/final-pallets`, {
        method: 'POST',
        body: JSON.stringify({ final_pallet_ids: ids, unit_price_by_format_id: prices }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['final-pallets'] });
      toast.success('Unidades PT vinculadas al despacho');
      setAttachFpDispatchId(null);
      setFpSelect({});
      setFpAttachUnitPrices({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispatchUnitPricesMut = useMutation({
    mutationFn: async ({ dispatchId, unit_price_by_format_id }: { dispatchId: number; unit_price_by_format_id: Record<string, number> }) =>
      apiJson(`/api/dispatches/${dispatchId}/unit-prices`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_price_by_format_id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('① Precios guardados. Ejecutá ② Factura y luego ③ PDF si aún no lo hiciste.');
      setInvoicePricesDispatchId(null);
      setDispatchInvoiceUnitPrices({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePricesAndInvoiceMut = useMutation({
    mutationFn: async ({ dispatchId, unit_price_by_format_id }: { dispatchId: number; unit_price_by_format_id: Record<string, number> }) => {
      await apiJson(`/api/dispatches/${dispatchId}/unit-prices`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_price_by_format_id }),
      });
      await apiJson(`/api/dispatches/${dispatchId}/invoice/generate`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Precios guardados y ② Factura generada. Descargá con ③ PDF.');
      setInvoicePricesDispatchId(null);
      setDispatchInvoiceUnitPrices({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTagMut = useMutation({
    mutationFn: ({ dispatchId, body }: { dispatchId: number; body: AddTagForm }) =>
      apiJson(`/api/dispatches/${dispatchId}/tags`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Unidad PT agregada al despacho');
      setAddTagDispatchId(null);
      tagForm.reset({
        tarja_id: 0,
        cajas_despachadas: 1,
        pallets_despachados: 1,
        unit_price: 0,
        pallet_cost: 0,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const packingMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/dispatches/${id}/packing-list/generate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Packing list generada / actualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invoiceMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/dispatches/${id}/invoice/generate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('② Factura lista. Podés descargar el PDF con ③ PDF.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addInvoiceLineMut = useMutation({
    mutationFn: ({ dispatchId, body }: { dispatchId: number; body: ManualInvoiceForm }) => {
      const payload = {
        descripcion: body.descripcion.trim(),
        cantidad: body.cantidad,
        unit_price: body.unit_price,
        ...(body.tipo === 'descuento' ? { tipo: 'descuento' as const } : {}),
      };
      return apiJson(`/api/dispatches/${dispatchId}/invoice/lines`, { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Ajuste manual agregado');
      setInvoiceLineDispatchId(null);
      manualInvForm.reset({
        descripcion: '',
        cantidad: 1,
        unit_price: 0,
        tipo: 'cargo',
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInvoiceLineMut = useMutation({
    mutationFn: ({ dispatchId, lineId }: { dispatchId: number; lineId: number }) =>
      apiJson(`/api/dispatches/${dispatchId}/invoice/lines/${lineId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Línea eliminada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!dispatches) return [];
    let list = dispatches;
    if (filterClienteComercial > 0) {
      list = list.filter((d) => Number(d.client_id ?? 0) === filterClienteComercial);
    }
    if (filterFechaDesde) {
      const start = new Date(filterFechaDesde + 'T00:00:00').getTime();
      list = list.filter((d) => new Date(d.fecha_despacho).getTime() >= start);
    }
    if (filterFechaHasta) {
      const end = new Date(filterFechaHasta + 'T23:59:59.999').getTime();
      list = list.filter((d) => new Date(d.fecha_despacho).getTime() <= end);
    }
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (d) =>
        d.numero_bol.toLowerCase().includes(s) ||
        String(d.id).includes(s) ||
        String(d.cliente_id).includes(s) ||
        (d.cliente_nombre?.toLowerCase().includes(s) ?? false) ||
        (d.client_nombre?.toLowerCase().includes(s) ?? false) ||
        String(d.orden_id).includes(s),
    );
  }, [dispatches, search, filterClienteComercial, filterFechaDesde, filterFechaHasta]);

  const groupedByClient = useMemo(() => {
    type G = {
      key: string;
      label: string;
      rows: DispatchApi[];
      totalBoxes: number;
      totalLb: number;
      count: number;
      lastFechaMs: number;
      hasPending: boolean;
      hasAnulado: boolean;
    };
    const map = new Map<string, G>();
    for (const d of filtered) {
      const label = dispatchClienteLabel(d);
      const key =
        d.client_id != null && Number(d.client_id) > 0
          ? `c-${Number(d.client_id)}`
          : `n-${label.toLowerCase().replace(/\s+/g, ' ').slice(0, 48)}`;
      const t = new Date(d.fecha_despacho).getTime();
      const g =
        map.get(key) ??
        ({
          key,
          label,
          rows: [],
          totalBoxes: 0,
          totalLb: 0,
          count: 0,
          lastFechaMs: 0,
          hasPending: false,
          hasAnulado: false,
        } satisfies G);
      g.rows.push(d);
      g.totalBoxes += dispatchTotalCajas(d);
      const lb = dispatchTotalLbFromPtTags(d, ptTagById);
      if (lb != null) g.totalLb += lb;
      g.count += 1;
      const st = String(d.status ?? 'borrador').toLowerCase();
      if (st === 'borrador') g.hasPending = true;
      if (st === 'anulado' || st === 'cancelado') g.hasAnulado = true;
      if (Number.isFinite(t)) g.lastFechaMs = Math.max(g.lastFechaMs, t);
      map.set(key, g);
    }
    return [...map.values()]
      .sort((a, b) => b.totalBoxes - a.totalBoxes)
      .map((g) => ({
        ...g,
        rows: g.rows
          .slice()
          .sort((a, b) => new Date(b.fecha_despacho).getTime() - new Date(a.fecha_despacho).getTime()),
      }));
  }, [filtered]);

  const dispatchMetricsHoy = useMemo(() => {
    const t0 = new Date();
    const key = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
    let count = 0;
    let cajas = 0;
    let lbSum = 0;
    for (const d of filtered) {
      const fd = new Date(d.fecha_despacho);
      const dk = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}-${String(fd.getDate()).padStart(2, '0')}`;
      if (dk !== key) continue;
      count++;
      cajas += dispatchTotalCajas(d);
      const lb = dispatchTotalLb(d);
      if (lb != null) lbSum += lb;
    }
    return { count, cajas, lb: lbSum > 0 ? lbSum : null as number | null };
  }, [filtered]);

  const dispatchKpis = useMemo(() => {
    const list = filtered;
    let totalCajas = 0;
    let totalLbSum = 0;
    let lbRows = 0;
    let totalVentas = 0;
    let ventasConTotal = 0;
    const byClienteCajas = new Map<string, number>();
    const byClienteValor = new Map<string, number>();
    let conAlertas = 0;
    let confirmadosSolo = 0;
    let despachadosSolo = 0;
    let pendientes = 0;
    for (const d of list) {
      totalCajas += dispatchTotalCajas(d);
      const lb = dispatchTotalLb(d);
      if (lb != null) {
        totalLbSum += lb;
        lbRows++;
      }
      const lab = dispatchClienteLabel(d);
      const cajas = dispatchTotalCajas(d);
      if (cajas > 0) {
        byClienteCajas.set(lab, (byClienteCajas.get(lab) ?? 0) + cajas);
      }
      const inv = parseNumeric(d.invoice?.total);
      if (inv != null && inv > 0) {
        totalVentas += inv;
        ventasConTotal++;
        byClienteValor.set(lab, (byClienteValor.get(lab) ?? 0) + inv);
      }
      const opRisk = summarizeDispatchPalletRisks(
        {
          client_id: d.client_id,
          numero_bol: d.numero_bol ?? '',
          final_pallets: d.final_pallets,
          pt_packing_lists: d.pt_packing_lists,
        },
        palletById,
        processes,
        ptTags,
      );
      if (dispatchHasAnyOperationalAlert(opRisk)) conAlertas++;
      const st = d.status ?? 'borrador';
      if (st === 'borrador') pendientes++;
      else if (st === 'despachado') despachadosSolo++;
      else if (st === 'confirmado') confirmadosSolo++;
      else confirmadosSolo++;
    }
    const totalLb = lbRows > 0 ? totalLbSum : null;
    const avgPricePerLb =
      totalLb != null && totalLb > 0 && totalVentas > 0 ? totalVentas / totalLb : null;
    const topClientesCajas = [...byClienteCajas.entries()]
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topClientesValor = [...byClienteValor.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      totalDespachos: list.length,
      totalCajas,
      totalLb,
      totalVentas: ventasConTotal > 0 ? totalVentas : null,
      avgPricePerLb,
      topClientesCajas,
      topClientesValor,
      conAlertas,
      confirmados: confirmadosSolo,
      despachados: despachadosSolo,
      pendientes,
    };
  }, [filtered, palletById, processes, ptTags, ptTagById]);

  const pendingConfirmSummary = useMemo(() => {
    if (confirmDispatchId == null || !dispatches) return null;
    const d = dispatches.find((x) => x.id === confirmDispatchId);
    if (!d) return null;
    return summarizeDispatchPalletRisks(
      {
        client_id: d.client_id,
        numero_bol: d.numero_bol ?? '',
        final_pallets: d.final_pallets,
        pt_packing_lists: d.pt_packing_lists,
      },
      palletById,
      processes,
      ptTags,
    );
  }, [confirmDispatchId, dispatches, palletById, processes, ptTags]);

  const sortedTags = useMemo(
    () => (ptTags ?? []).slice().sort((a, b) => b.id - a.id),
    [ptTags],
  );

  function toggleCollapse(id: number) {
    setCollapsed((p) => ({ ...p, [id]: !((p[id] ?? true)) }));
  }

  const helpDespachosTitle =
    'Cierre del flujo: Proceso → Unidad PT → Existencias PT → Despacho. Vista logística y documental. Si Cajas muestra "—", el origen no aporta cajas en ítems. Estados: borrador → confirmado → despachado. Stock PT se mueve al confirmar packing lists en Existencias PT, no al confirmar el despacho. Factura: ① Precios → ② Factura → ③ PDF.';

  function openDispatchDetailView(dispatchId: number) {
    setViewMode('detailed');
    setCollapsed((p) => ({ ...p, [dispatchId]: false }));
  }

  if (isPending) {
    return (
      <div className="font-inter space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="font-inter">
        <Card className="rounded-2xl border-rose-200/90 bg-white">
          <CardHeader>
            <CardTitle>Error al cargar despachos</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : 'Reintentá más tarde.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="font-inter space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <h1 className={pageTitle}>Despachos</h1>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>
              Salidas, BOL, packing list y factura — seguimiento por estado y cliente.
            </p>
            <button
              type="button"
              className={pageInfoButton}
              title={helpDespachosTitle}
              aria-label="Ayuda módulo despachos"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Dialog
          open={dispatchOpen}
          onOpenChange={(o) => {
            setDispatchOpen(o);
            if (!o) setSelectedPlIds([]);
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-10 shrink-0 gap-2 rounded-xl px-4 shadow-sm" disabled={!salesOrders?.length}>
              <Plus className="h-4 w-4" />
              Nuevo despacho
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl [&>button]:hidden">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Nuevo despacho
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => setDispatchOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
            </DialogHeader>
            <form
              onSubmit={dispatchForm.handleSubmit((v) => {
                if (selectedPlIds.length === 0) {
                  toast.error('Seleccioná al menos un packing list PT confirmado.');
                  return;
                }
                if (inheritedBolPreview.conflict) {
                  toast.error(
                    'Los packing lists seleccionados tienen BOL distintos. Unificá el BOL en cada PL (Existencias PT) o ajustá la selección.',
                  );
                  return;
                }
                const hasBol = v.numero_bol?.trim() || inheritedBolPreview.value;
                if (!hasBol) {
                  toast.error('Indicá número BOL o definilo antes en los packing lists PT.');
                  return;
                }
                createDispatchMut.mutate({ ...v, pt_packing_list_ids: selectedPlIds });
              })}
              className="grid gap-4 py-2"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label>Packing lists PT</Label>
                    <div className="max-h-[180px] space-y-2 overflow-y-auto rounded-md border border-border p-2 text-sm">
                      {(linkablePtPl ?? []).length === 0 ? (
                        <p className="text-muted-foreground">No hay packing lists confirmados libres. Confirmalos en Existencias PT (packing lists) primero.</p>
                      ) : (
                        (linkablePtPl ?? []).map((pl) => (
                          <label key={pl.id} className="flex cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={selectedPlIds.includes(pl.id)}
                              onChange={(e) => {
                                setSelectedPlIds((prev) =>
                                  e.target.checked ? [...prev, pl.id] : prev.filter((x) => x !== pl.id),
                                );
                              }}
                            />
                            <span>
                              <span className="font-mono">{pl.list_code}</span> · {pl.list_date}{' '}
                              {pl.client_nombre ? `· ${pl.client_nombre}` : ''}
                              {pl.numero_bol ? (
                                <span className="text-muted-foreground"> · BOL {pl.numero_bol}</span>
                              ) : null}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Pedido</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      {...dispatchForm.register('orden_id', { valueAsNumber: true })}
                    >
                      {(salesOrders ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.order_number}
                          {o.cliente_nombre?.trim()
                            ? ` · ${o.cliente_nombre}`
                            : ` · cliente #${o.cliente_id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    Cliente: {selectedSalesOrder?.cliente_nombre?.trim() || `Cliente #${selectedSalesOrder?.cliente_id ?? '—'}`}{' '}
                    <span className="font-mono text-xs">#{selectedSalesOrder?.id ?? '—'}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label>Fecha despacho</Label>
                    <Input type="datetime-local" {...dispatchForm.register('fecha_despacho')} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Número BOL</Label>
                    <Input placeholder="Único en sistema" {...dispatchForm.register('numero_bol')} />
                    {inheritedBolPreview.conflict ? (
                      <p className="text-xs text-destructive">
                        Los PL seleccionados tienen BOL distintos. Unificá en cada packing list o elegí PL con el mismo BOL.
                      </p>
                    ) : inheritedBolPreview.value ? (
                      <p className="text-xs text-muted-foreground">
                        Se usará <span className="font-mono">{inheritedBolPreview.value}</span> desde el packing list si dejás el campo
                        vacío o igual. Si cambiás el valor, quedará solo en el despacho (no modifica los PL).
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Ningún PL seleccionado tiene BOL cargado; ingresalo aquí.</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label>Temperatura (°F)</Label>
                    <Input type="number" step="0.01" {...dispatchForm.register('temperatura_f')} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Termógrafo (n° serie / ID)</Label>
                    <Input placeholder="Opcional" {...dispatchForm.register('thermograph_serial')} />
                  </div>
                </div>
              </div>
              <input type="hidden" {...dispatchForm.register('cliente_id', { valueAsNumber: true })} />
              {plCommercialPreview.conflict && selectedPlIds.length > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Los packing lists seleccionados tienen <strong>cliente comercial</strong> distinto en inventario (Existencias PT). En opciones avanzadas
                  podés fijar uno o dejar sin fijar (según unidad PT).
                </p>
              ) : null}
              <details className="rounded-md border border-border text-sm">
                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
                  Opciones avanzadas: cliente comercial (stock PT)
                </summary>
                <div className="space-y-2 border-t border-border px-3 py-3">
                  <Label className="text-xs font-normal text-muted-foreground">
                    Solo si necesitás alinear facturación/stock PT con un cliente del maestro distinto del flujo automático.
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...dispatchForm.register('client_id', { valueAsNumber: true })}
                  >
                    <option value={0}>Según unidad PT / sin fijar</option>
                    {(commercialClients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </select>
                  {plCommercialPreview.unified != null && !plCommercialPreview.conflict && selectedPlIds.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Valor sugerido desde los packing lists seleccionados (mismo cliente en todos los PL).
                    </p>
                  ) : null}
                </div>
              </details>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDispatchOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={createDispatchMut.isPending}>
                  {createDispatchMut.isPending ? 'Creando…' : 'Registrar despacho'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <section aria-labelledby="dp-kpis" className="space-y-4">
        <h2 id="dp-kpis" className="sr-only">
          Indicadores de despachos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Despachos (vista)</p>
            <p className={kpiValueLg}>{formatCount(dispatchKpis.totalDespachos)}</p>
            <p className={kpiFootnote}>Total en filtro</p>
          </div>
          <div className={cn(kpiCard, dispatchKpis.pendientes > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50')}>
            <p className={kpiLabel}>Pendientes</p>
            <p className={cn(kpiValueLg, dispatchKpis.pendientes > 0 ? 'text-amber-700' : 'text-green-700')}>
              {formatCount(dispatchKpis.pendientes)}
            </p>
            <p className={kpiFootnote}>Borrador</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Confirmados</p>
            <p className={kpiValueLg}>{formatCount(dispatchKpis.confirmados)}</p>
            <p className={kpiFootnote}>Cerrados operativamente</p>
          </div>
          <div className={cn(kpiCard, 'border-green-200 bg-green-50')}>
            <p className={kpiLabel}>Despachados</p>
            <p className={cn(kpiValueLg, 'text-green-700')}>{formatCount(dispatchKpis.despachados)}</p>
            <p className={kpiFootnote}>Salida física registrada</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cn(kpiCardSm, 'border-blue-200 bg-blue-50')}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={cn(kpiValueMd, 'text-blue-700')}>{formatCount(dispatchKpis.totalCajas)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Peso total (lb)</p>
            <p className={kpiValueMd}>{dispatchKpis.totalLb != null ? formatLb(dispatchKpis.totalLb, 2) : '—'}</p>
            <p className={kpiFootnote}>Desde PT vinculadas</p>
          </div>
          <div className={cn(kpiCardSm, 'border-green-200 bg-green-50')}>
            <p className={kpiLabel}>Ventas ($)</p>
            <p className={cn(kpiValueMd, 'text-green-700')}>{dispatchKpis.totalVentas != null ? `$${formatMoney(dispatchKpis.totalVentas)}` : '—'}</p>
            <p className={kpiFootnote}>Facturas con total</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Precio / lb</p>
            <p className={kpiValueMd}>{dispatchKpis.avgPricePerLb != null ? `$${formatMoney(dispatchKpis.avgPricePerLb)} / lb` : '—'}</p>
            <p className={kpiFootnote}>Promedio ponderado</p>
          </div>
        </div>
        <div
          className={cn(
            'grid gap-3',
            dispatchKpis.conAlertas > 0 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'sm:grid-cols-2',
          )}
        >
          <div
            className={cn(
              'rounded-2xl border px-4 py-4',
              dispatchKpis.conAlertas > 0
                ? 'border-amber-200/90 bg-amber-50/50'
                : 'border-slate-100/90 bg-slate-50/40',
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Cargas con señales</p>
            <p
              className={cn(
                'mt-2 text-xl font-semibold tabular-nums',
                dispatchKpis.conAlertas > 0 ? 'text-amber-950' : 'text-slate-800',
              )}
            >
              {formatCount(dispatchKpis.conAlertas)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Cliente, BOL o pallets — expandir fila</p>
          </div>
          <div className={cn(contentCard, 'px-4 py-4')}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Top volumen (cajas)</p>
            <ol className="mt-2 list-none space-y-1.5 text-sm text-slate-700">
              {dispatchKpis.topClientesCajas.length === 0 ? (
                <li className="text-slate-400">Sin datos.</li>
              ) : (
                dispatchKpis.topClientesCajas.map(([name, cajas], i) => (
                  <li key={name} className="flex justify-between gap-2 border-b border-slate-100/90 pb-1.5 last:border-0 last:pb-0">
                    <span className="min-w-0 truncate text-xs font-medium" title={name}>
                      {i + 1}. {name}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">{formatCount(cajas)}</span>
                  </li>
                ))
              )}
            </ol>
          </div>
          <div className={cn(contentCard, 'px-4 py-4')}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Top valor ($)</p>
            <ol className="mt-2 list-none space-y-1.5 text-sm text-slate-700">
              {dispatchKpis.topClientesValor.length === 0 ? (
                <li className="text-slate-400">Sin datos.</li>
              ) : (
                dispatchKpis.topClientesValor.map(([name, val], i) => (
                  <li key={name} className="flex justify-between gap-2 border-b border-slate-100/90 pb-1.5 last:border-0 last:pb-0">
                    <span className="min-w-0 truncate text-xs font-medium" title={name}>
                      {i + 1}. {name}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">${formatMoney(val)}</span>
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      </section>

      <div className={filterPanel}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Cliente comercial, rango de fechas del despacho y búsqueda por BOL, id, cliente u orden."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-2 lg:grid-cols-12 lg:items-end">
          <div className="grid gap-2 lg:col-span-3">
            <Label className="text-xs text-slate-500">Cliente (comercial)</Label>
            <select
              className={cn(filterSelectClass, 'w-full max-w-none')}
              value={filterClienteComercial}
              onChange={(e) => setFilterClienteComercial(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {(commercialClients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 lg:col-span-5">
            <div className="grid min-w-0 flex-1 gap-2 sm:max-w-[200px]">
              <Label className="text-xs text-slate-500">Desde</Label>
              <Input
                type="date"
                className={filterInputClass}
                value={filterFechaDesde}
                onChange={(e) => setFilterFechaDesde(e.target.value)}
              />
            </div>
            <div className="grid min-w-0 flex-1 gap-2 sm:max-w-[200px]">
              <Label className="text-xs text-slate-500">Hasta</Label>
              <Input
                type="date"
                className={filterInputClass}
                value={filterFechaHasta}
                onChange={(e) => setFilterFechaHasta(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label className="text-xs text-slate-500">Buscar</Label>
            <Input
              className={filterInputClass}
              placeholder="BOL, id, cliente, orden…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {dispatchKpis.conAlertas > 0 ? (
        <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/40 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p>
            <span className="font-semibold">{dispatchKpis.conAlertas}</span> despacho
            {dispatchKpis.conAlertas === 1 ? '' : 's'} con advertencias en esta vista. Revisá la columna de estado o expandí el detalle.
          </p>
        </div>
      ) : null}

      <section className="space-y-3" aria-labelledby="dp-listado">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="dp-listado" className={sectionTitle}>
              Listado operativo
            </h2>
            <p className={sectionHint}>
              {filtered.length} registro(s)
              {viewMode === 'detailed'
                ? ' · expandí una fila para documentos y líneas'
                : ` · hoy: ${formatCount(dispatchMetricsHoy.count)} despachos · ${formatCount(dispatchMetricsHoy.cajas)} cajas${
                    dispatchMetricsHoy.lb != null ? ` · ${formatLb(dispatchMetricsHoy.lb, 2)} lb` : ''
                  }`}
            </p>
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
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                Ver criterios
              </summary>
              <div className="mt-1 max-w-[min(22rem,calc(100vw-2rem))] space-y-1 rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600 shadow-sm">
                <p>
                  <span className="font-semibold text-emerald-700">Ejecutado / confirmado / despachado:</span> salida ya
                  realizada
                </p>
                <p>
                  <span className="font-semibold text-amber-800">En preparación:</span> despacho pendiente o en proceso
                </p>
                <p>
                  <span className="font-semibold text-rose-700">Anulado:</span> despacho cancelado
                </p>
                <p>
                  <span className="font-semibold text-slate-800">BOL / documento:</span> referencia comercial/logística del
                  despacho
                </p>
                <p>
                  <span className="font-semibold text-sky-800">Packing List asociado:</span> preparación que originó el
                  despacho
                </p>
              </div>
            </details>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className={emptyStatePanel}>
            {dispatches?.length === 0
              ? 'No hay despachos. Creá pedidos y luego un despacho.'
              : 'Sin coincidencias con el filtro.'}
          </p>
        ) : viewMode === 'compact' ? (
          <div className="space-y-4">
            {groupedByClient.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
                  <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{formatCount(group.totalBoxes)}</span> cajas
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">
                      {group.totalLb > 0 ? formatLb(group.totalLb, 2) : '—'}
                    </span>{' '}
                    lb
                  </p>
                  <p className="text-xs text-slate-600">{formatCount(group.count)} despachos</p>
                  <p className="text-xs text-slate-600">
                    Último:{' '}
                    <span className="font-medium text-slate-800">
                      {group.lastFechaMs > 0 ? formatDispatchFechaCell(new Date(group.lastFechaMs).toISOString()) : '—'}
                    </span>
                  </p>
                  {group.hasPending ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                      Pendientes
                    </span>
                  ) : null}
                  {group.hasAnulado ? (
                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                      Anulados
                    </span>
                  ) : null}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-[120px]">Estado</TableHead>
                      <TableHead className="min-w-[120px]">Despacho / doc</TableHead>
                      <TableHead className="whitespace-nowrap">Fecha</TableHead>
                      <TableHead className="min-w-[100px]">PL</TableHead>
                      <TableHead className="min-w-[100px]">Formatos</TableHead>
                      <TableHead className="text-right tabular-nums">Cajas</TableHead>
                      <TableHead className="text-right tabular-nums">Lb</TableHead>
                      <TableHead className="min-w-[120px]">Transporte</TableHead>
                      <TableHead className="w-[220px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((d) => {
                      const tone = dispatchCompactRowTone(d);
                      const destinoD = destinoDespachoDisplay(d);
                      const cajasList = dispatchCajasListDisplay(d);
                      const totalLb = dispatchTotalLb(d);
                      const opRisk = summarizeDispatchPalletRisks(
                        {
                          client_id: d.client_id,
                          numero_bol: d.numero_bol ?? '',
                          final_pallets: d.final_pallets,
                          pt_packing_lists: d.pt_packing_lists,
                        },
                        palletById,
                        processes,
                        ptTags,
                      );
                      return (
                        <TableRow key={d.id} className={cn(tableBodyRow, 'relative')}>
                          <TableCell className="py-2.5 pl-3">
                            <span className={cn('absolute inset-y-1 left-0 w-1 rounded-r-sm', tone.bar)} />
                            <div className="flex flex-col gap-1">
                              <span
                                className={cn(
                                  'inline-flex w-fit max-w-[110px] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize',
                                  tone.badgeClass,
                                )}
                                title={d.status}
                              >
                                {tone.shortLabel}
                              </span>
                              <DispatchKindBadge kind={d.kind} />
                              {dispatchHasAnyOperationalAlert(opRisk) ? (
                                <span
                                  className="inline-flex w-fit rounded-full border border-amber-200/90 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950"
                                  title="Ver detalle en tabla expandida"
                                >
                                  Alerta
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[160px] py-2.5">
                            <p className="font-mono text-xs font-semibold text-slate-900">#{d.id}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-600" title={dispatchDocCodeLine(d)}>
                              {dispatchDocCodeLine(d)}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={d.numero_bol}>
                              BOL {d.numero_bol?.trim() || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2.5 text-[11px] tabular-nums text-slate-600">
                            {formatDispatchFechaCell(d.fecha_despacho)}
                          </TableCell>
                          <TableCell className="max-w-[120px] py-2.5">
                            <span className="line-clamp-2 text-[11px] leading-snug text-slate-700" title={packingListSummary(d)}>
                              {packingListSummary(d)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[130px] py-2.5">
                            <span className="line-clamp-2 text-[11px] font-medium text-slate-800" title={summarizeDispatchFormatCodes(d)}>
                              {summarizeDispatchFormatCodes(d)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-base font-bold tabular-nums text-slate-950" title={cajasList.title}>
                            {cajasList.text}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">
                            {totalLb != null ? formatLb(totalLb, 2) : '—'}
                          </TableCell>
                          <TableCell className="max-w-[140px] py-2.5">
                            <p className="truncate text-[11px] text-slate-600" title={destinoD.title}>
                              {destinoD.text}
                            </p>
                            <p className="truncate font-mono text-[10px] text-slate-400" title={docTransporteLine(d)}>
                              {docTransporteLine(d)}
                            </p>
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="h-7 rounded-md px-2 text-[11px]"
                                onClick={() => openDispatchDetailView(d.id)}
                              >
                                Ver detalle
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="outline" size="sm" className="h-7 rounded-md px-2 text-[11px]">
                                    PDF
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await downloadPdf(
                                          `/api/documents/dispatches/${d.id}/packing-list/pdf`,
                                          `packing-list-${d.id}.pdf`,
                                        );
                                        toast.success('PDF packing list');
                                      } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'Error PDF');
                                      }
                                    }}
                                  >
                                    PDF packing list
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await downloadPdf(`/api/documents/dispatches/${d.id}/invoice/pdf`, `invoice-${d.id}.pdf`);
                                        toast.success('PDF factura');
                                      } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'Error PDF');
                                      }
                                    }}
                                  >
                                    PDF factura
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-md px-2 text-[11px]"
                                onClick={() => {
                                  setMetaDialogDispatchId(d.id);
                                  setMetaFechaDespacho(toDatetimeLocalValue(d.fecha_despacho));
                                  setMetaTemperaturaF(String(parseNumeric(d.temperatura_f) ?? 0));
                                  setMetaThermographSerial(d.thermograph_serial?.trim() ?? '');
                                  setMetaThermographNotes(d.thermograph_notes?.trim() ?? '');
                                }}
                              >
                                Editar
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md" aria-label="Más acciones">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[min(100vw-2rem,18rem)] max-h-[min(70vh,28rem)] overflow-y-auto">
                                  {d.kind === 'packing_lists' && d.status === 'borrador' ? (
                                    <DropdownMenuItem
                                      disabled={confirmDispatchMut.isPending}
                                      onClick={() => {
                                        const s = summarizeDispatchPalletRisks(
                                          {
                                            client_id: d.client_id,
                                            numero_bol: d.numero_bol ?? '',
                                            final_pallets: d.final_pallets,
                                            pt_packing_lists: d.pt_packing_lists,
                                          },
                                          palletById,
                                          processes,
                                          ptTags,
                                        );
                                        if (dispatchConfirmShouldWarn(s)) setConfirmDispatchId(d.id);
                                        else confirmDispatchMut.mutate(d.id);
                                      }}
                                    >
                                      Confirmar despacho
                                    </DropdownMenuItem>
                                  ) : null}
                                  {d.kind === 'packing_lists' && d.status === 'confirmado' ? (
                                    <DropdownMenuItem disabled={despacharMut.isPending} onClick={() => despacharMut.mutate(d.id)}>
                                      Registrar salida física
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openDispatchDetailView(d.id)}>Ver detalle</DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await downloadPdf(`/api/documents/dispatches/${d.id}/invoice/pdf`, `invoice-${d.id}.pdf`);
                                        toast.success('PDF factura');
                                      } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'Error PDF');
                                      }
                                    }}
                                  >
                                    PDF
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setMetaDialogDispatchId(d.id);
                                      setMetaFechaDespacho(toDatetimeLocalValue(d.fecha_despacho));
                                      setMetaTemperaturaF(String(parseNumeric(d.temperatura_f) ?? 0));
                                      setMetaThermographSerial(d.thermograph_serial?.trim() ?? '');
                                      setMetaThermographNotes(d.thermograph_notes?.trim() ?? '');
                                    }}
                                  >
                                    Editar datos despacho
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={packingMut.isPending} onClick={() => packingMut.mutate(d.id)}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                                    Packing list
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={invoiceMut.isPending} onClick={() => invoiceMut.mutate(d.id)}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Generar factura
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setInvoiceLineDispatchId(d.id)}>Ajuste manual en factura</DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const so = salesOrders?.find((s) => s.id === d.orden_id);
                                      setOrderLinkDialogDispatchId(d.id);
                                      setOrderLinkOrderId(d.orden_id);
                                      setOrderLinkClientId(so?.cliente_id ?? d.cliente_id);
                                      setOrderLinkCommercialClientId(d.client_id ?? 0);
                                    }}
                                  >
                                    Corregir pedido vinculado
                                  </DropdownMenuItem>
                                  {d.kind !== 'packing_lists' ? (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setAttachFpDispatchId(d.id);
                                        const pre: Record<number, boolean> = {};
                                        for (const fp of d.final_pallets ?? []) {
                                          pre[fp.id] = true;
                                        }
                                        setFpSelect(pre);
                                        const pr: Record<string, string> = {};
                                        const saved = d.final_pallet_unit_prices ?? {};
                                        for (const [k, v] of Object.entries(saved)) {
                                          pr[k] = String(v);
                                        }
                                        setFpAttachUnitPrices(pr);
                                      }}
                                    >
                                      <Package className="mr-2 h-4 w-4" />
                                      Unidad PT (legacy)
                                    </DropdownMenuItem>
                                  ) : null}
                                  {d.status === 'despachado' && canRevertSalida ? (
                                    <DropdownMenuItem
                                      disabled={revertDespachadoMut.isPending}
                                      onClick={() => {
                                        if (
                                          !window.confirm(
                                            '¿Deshacer el registro de salida física? El despacho volverá a «confirmado». No se modifica el stock PT.',
                                          )
                                        ) {
                                          return;
                                        }
                                        revertDespachadoMut.mutate(d.id);
                                      }}
                                    >
                                      Deshacer salida
                                    </DropdownMenuItem>
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
            ))}
          </div>
        ) : (
          <div className={tableShell}>
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[200px]">Estado</TableHead>
                  <TableHead className="whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="min-w-[120px]">Cliente</TableHead>
                  <TableHead className="whitespace-nowrap">Pedido</TableHead>
                  <TableHead className="min-w-[140px]">PL / carga</TableHead>
                  <TableHead className="text-right tabular-nums">Cajas</TableHead>
                  <TableHead className="text-right tabular-nums">Peso (lb)</TableHead>
                  <TableHead className="min-w-[100px]">Destino</TableHead>
                  <TableHead className="min-w-[100px]">BOL</TableHead>
                  <TableHead className="min-w-[120px]">Documento</TableHead>
                  <TableHead className="w-[120px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
            const isCollapsed = collapsed[d.id] ?? true;
            const totalLb = dispatchTotalLb(d);
            const cajasList = dispatchCajasListDisplay(d);
            const destinoD = destinoDespachoDisplay(d);
            const opRisk = summarizeDispatchPalletRisks(
              {
                client_id: d.client_id,
                numero_bol: d.numero_bol ?? '',
                final_pallets: d.final_pallets,
                pt_packing_lists: d.pt_packing_lists,
              },
              palletById,
              processes,
              ptTags,
            );
            return (
              <Fragment key={d.id}>
                <TableRow className={tableBodyRow}>
                  <TableCell className="max-w-[220px] py-3.5 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DispatchKindBadge kind={d.kind} />
                      <DispatchFlowStatusBadge status={d.status} />
                      {dispatchHasAnyOperationalAlert(opRisk) ? (
                        <span
                          className="inline-flex max-w-[100px] truncate rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
                          title="Cliente/BOL o riesgos en pallets; detalle al expandir."
                        >
                          Alerta
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-3.5 text-sm tabular-nums text-slate-700">
                    {formatDispatchFechaCell(d.fecha_despacho)}
                  </TableCell>
                  <TableCell className="max-w-[160px] py-3.5 text-sm font-medium text-slate-900">
                    <span className="line-clamp-2">{dispatchClienteLabel(d)}</span>
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-slate-800">{orderLabelForDispatch(d, salesOrders)}</TableCell>
                  <TableCell className="max-w-[200px] py-3.5 text-xs leading-snug text-slate-600" title={packingListSummary(d)}>
                    {packingListSummary(d)}
                  </TableCell>
                  <TableCell className="py-3.5 text-right text-sm tabular-nums text-slate-900" title={cajasList.title}>
                    {cajasList.text}
                  </TableCell>
                  <TableCell className="py-3.5 text-right text-sm tabular-nums text-slate-900">
                    {totalLb != null ? formatLb(totalLb, 2) : '—'}
                  </TableCell>
                  <TableCell className="max-w-[120px] py-3.5 text-xs text-slate-600" title={destinoD.title}>
                    {destinoD.text}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-slate-800">{d.numero_bol?.trim() || '—'}</TableCell>
                  <TableCell className="max-w-[130px] py-3.5 text-xs text-slate-600">{docTransporteLine(d)}</TableCell>
                  <TableCell className="py-3.5 text-right">
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <span className="hidden font-mono text-xs text-muted-foreground sm:inline">#{d.id}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 text-xs font-medium">
                            Acciones
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[min(100vw-2rem,18rem)] max-h-[min(70vh,28rem)] overflow-y-auto">
                          {d.kind === 'packing_lists' && d.status === 'borrador' ? (
                            <DropdownMenuItem
                              disabled={confirmDispatchMut.isPending}
                              onClick={() => {
                                const s = summarizeDispatchPalletRisks(
                                  {
                                    client_id: d.client_id,
                                    numero_bol: d.numero_bol ?? '',
                                    final_pallets: d.final_pallets,
                                    pt_packing_lists: d.pt_packing_lists,
                                  },
                                  palletById,
                                  processes,
                                  ptTags,
                                );
                                if (dispatchConfirmShouldWarn(s)) setConfirmDispatchId(d.id);
                                else confirmDispatchMut.mutate(d.id);
                              }}
                            >
                              Confirmar despacho
                            </DropdownMenuItem>
                          ) : null}
                          {d.kind === 'packing_lists' && d.status === 'confirmado' ? (
                            <DropdownMenuItem disabled={despacharMut.isPending} onClick={() => despacharMut.mutate(d.id)}>
                              Registrar salida física
                            </DropdownMenuItem>
                          ) : null}
                          {d.status === 'despachado' && canRevertSalida ? (
                            <DropdownMenuItem
                              disabled={revertDespachadoMut.isPending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    '¿Deshacer el registro de salida física? El despacho volverá a «confirmado». No se modifica el stock PT.',
                                  )
                                ) {
                                  return;
                                }
                                revertDespachadoMut.mutate(d.id);
                              }}
                            >
                              Deshacer salida
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openDispatchDetailView(d.id)}>Ver detalle</DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await downloadPdf(`/api/documents/dispatches/${d.id}/invoice/pdf`, `invoice-${d.id}.pdf`);
                                toast.success('PDF factura');
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error PDF');
                              }
                            }}
                          >
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setMetaDialogDispatchId(d.id);
                              setMetaFechaDespacho(toDatetimeLocalValue(d.fecha_despacho));
                              setMetaTemperaturaF(String(parseNumeric(d.temperatura_f) ?? 0));
                              setMetaThermographSerial(d.thermograph_serial?.trim() ?? '');
                              setMetaThermographNotes(d.thermograph_notes?.trim() ?? '');
                            }}
                          >
                            Editar datos despacho
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={packingMut.isPending} onClick={() => packingMut.mutate(d.id)}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Packing list
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={invoiceMut.isPending} onClick={() => invoiceMut.mutate(d.id)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Generar factura
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setInvoiceLineDispatchId(d.id)}>Ajuste manual en factura</DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const so = salesOrders?.find((s) => s.id === d.orden_id);
                              setOrderLinkDialogDispatchId(d.id);
                              setOrderLinkOrderId(d.orden_id);
                              setOrderLinkClientId(so?.cliente_id ?? d.cliente_id);
                              setOrderLinkCommercialClientId(d.client_id ?? 0);
                            }}
                          >
                            Corregir pedido vinculado
                          </DropdownMenuItem>
                          {d.kind !== 'packing_lists' ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setAttachFpDispatchId(d.id);
                                const pre: Record<number, boolean> = {};
                                for (const fp of d.final_pallets ?? []) {
                                  pre[fp.id] = true;
                                }
                                setFpSelect(pre);
                                const pr: Record<string, string> = {};
                                const saved = d.final_pallet_unit_prices ?? {};
                                for (const [k, v] of Object.entries(saved)) {
                                  pr[k] = String(v);
                                }
                                setFpAttachUnitPrices(pr);
                              }}
                            >
                              <Package className="mr-2 h-4 w-4" />
                              Unidad PT (legacy)
                            </DropdownMenuItem>
                          ) : null}
                          {d.status === 'despachado' && canRevertSalida ? (
                            <DropdownMenuItem
                              disabled={revertDespachadoMut.isPending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    '¿Deshacer el registro de salida física? El despacho volverá a «confirmado». No se modifica el stock PT.',
                                  )
                                ) {
                                  return;
                                }
                                revertDespachadoMut.mutate(d.id);
                              }}
                            >
                              Deshacer salida
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button type="button" variant="ghost" size="icon" onClick={() => toggleCollapse(d.id)}>
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {!isCollapsed && (
                  <TableRow className={tableHeaderRow}>
                    <TableCell colSpan={11} className="bg-slate-50/30 p-0">
                      <div className="space-y-6 p-4 sm:p-5">
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Resumen</h3>
                      {d.kind === 'packing_lists' && dispatchHasAnyOperationalAlert(opRisk) ? (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 dark:border-amber-800/45 dark:bg-amber-950/20">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                            Advertencias operativas
                          </div>
                          <div className="space-y-2.5">
                            {opRisk.clienteDespachoVsPallet ? (
                              <p className="border-l-2 border-amber-500 pl-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-500 dark:text-amber-50">
                                El cliente del despacho <strong>no coincide</strong> con el de cabecera de algún pallet vinculado.
                              </p>
                            ) : null}
                            {opRisk.bolDespachoVsPallet ? (
                              <p className="border-l-2 border-red-500 pl-2.5 text-xs leading-relaxed text-red-950 dark:border-red-500 dark:text-red-100">
                                La BOL del despacho es <strong>distinta</strong> a la referencia en al menos un pallet.
                              </p>
                            ) : null}
                            {dispatchConfirmShouldWarn(opRisk) ? (
                              <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-amber-950/95 dark:text-amber-100/90">
                                {opRisk.palletsSinDestino > 0 ? (
                                  <li>
                                    <strong>{opRisk.palletsSinDestino}</strong> pallet(s) sin destino definido.
                                  </li>
                                ) : null}
                                {palletsCabeceraClienteFueraSinDestino(opRisk) > 0 ? (
                                  <li>
                                    <strong>{palletsCabeceraClienteFueraSinDestino(opRisk)}</strong> pallet(s) sin cliente en cabecera
                                    (hay BOL o pedido previsto).
                                  </li>
                                ) : null}
                                {opRisk.palletsMulticlientePt > 0 ? (
                                  <li>
                                    <strong>{opRisk.palletsMulticlientePt}</strong> pallet(s) con mezcla de clientes en unidades PT.
                                  </li>
                                ) : null}
                                {opRisk.palletsPtSinAsignacion > 0 ? (
                                  <li>
                                    <strong>{opRisk.palletsPtSinAsignacion}</strong> pallet(s) con tarjas PT sin asignación comercial.
                                  </li>
                                ) : null}
                                {opRisk.mezclaCabeceraClientes ? (
                                  <li>Varios clientes distintos en cabecera entre pallets.</li>
                                ) : null}
                              </ul>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {d.kind === 'packing_lists' ? (
                        <p className="text-xs text-muted-foreground">
                          BOL:{' '}
                          <span className="font-mono text-foreground">{d.numero_bol?.trim() || '—'}</span>
                        </p>
                      ) : null}
                      {d.kind === 'packing_lists' && d.status === 'borrador' ? (
                        <div className="rounded-lg border border-dashed border-amber-500/45 bg-amber-500/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-950 shadow-sm dark:text-amber-100/95">
                          <span className="font-semibold">Borrador:</span> podés editar BOL y datos; la acción principal es{' '}
                          <strong>Confirmar despacho</strong>. No cambia stock PT.
                        </div>
                      ) : null}
                      {d.kind === 'packing_lists' && d.status === 'confirmado' ? (
                        <details className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.09] px-3 py-2 text-xs shadow-sm dark:bg-emerald-950/35">
                          <summary className="cursor-pointer font-semibold text-emerald-900 dark:text-emerald-100">
                            Confirmado: documento cerrado; siguiente paso «Registrar salida física»
                          </summary>
                          <ul className="mt-2 grid list-disc gap-x-6 gap-y-1.5 pl-4 text-muted-foreground md:grid-cols-2 dark:text-emerald-100/85">
                            <li className="md:col-span-2">
                              Confirmado
                              {d.confirmed_at ? (
                                <>
                                  {' '}
                                  el <span className="whitespace-nowrap">{new Date(d.confirmed_at).toLocaleString('es')}</span>
                                </>
                              ) : null}
                              ; no vuelve a borrador.
                            </li>
                            <li>Stock PT no cambia aquí.</li>
                            <li>BOL y datos críticos quedan bloqueados.</li>
                            <li>Factura y PDF siguen habilitados.</li>
                          </ul>
                        </details>
                      ) : null}
                      {d.kind === 'packing_lists' && d.status === 'despachado' ? (
                        <details className="relative overflow-hidden rounded-lg border border-sky-500/35 bg-gradient-to-br from-sky-500/[0.07] to-muted/40 px-3 py-2 text-xs leading-relaxed shadow-sm dark:border-sky-500/30 dark:from-sky-950/40 dark:to-muted/20">
                          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-foreground">
                            <Truck className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
                            Despachado: salida física registrada
                          </summary>
                          <ul className="mt-2 grid list-disc gap-x-6 gap-y-1.5 pl-4 text-muted-foreground md:grid-cols-2">
                            <li className="md:col-span-2">
                              Salida
                              {d.despachado_at ? (
                                <>
                                  {' '}
                                  registrada el <span className="whitespace-nowrap">{new Date(d.despachado_at).toLocaleString('es')}</span>
                                </>
                              ) : null}
                              ; no altera datos de cliente/BOL/factura.
                            </li>
                            <li>Stock PT no cambia en este estado.</li>
                            <li>① Precios queda bloqueado.</li>
                            <li className="md:col-span-2">
                              Podés usar «Deshacer salida» en Acciones para volver a «confirmado» si la salida se registró por error.
                            </li>
                          </ul>
                        </details>
                      ) : null}
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Unidades PT incluidas</h3>
                      {d.kind === 'packing_lists' && !(d.final_pallets?.length) ? (
                        <p className="text-sm text-muted-foreground">Sin unidades en los packing lists vinculados.</p>
                      ) : d.final_pallets && d.final_pallets.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {d.final_pallets.map((fp) => (
                            <Badge
                              key={fp.id}
                              variant="secondary"
                              className="font-mono text-xs"
                              title={`ID interno ${fp.id}`}
                            >
                              {displayUnidadPtFromDispatchFp(fp)} · {fp.format_code ?? `fmt ${fp.presentation_format_id ?? '—'}`}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Ninguna existencia vinculada aún.</p>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Unidades PT (trazabilidad)</h3>
                      {d.items.length === 0 && !(d.final_pallets?.length) && d.kind !== 'packing_lists' ? (
                        <p className="text-sm text-muted-foreground">
                          Agregá al menos una unidad PT o existencias PT al despacho antes de generar packing/factura.
                        </p>
                      ) : d.items.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código Unidad PT</TableHead>
                              <TableHead>Cajas</TableHead>
                              <TableHead>Pallets</TableHead>
                              <TableHead>Precio unit.</TableHead>
                              <TableHead>Costo pallet</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.items.map((it) => (
                              <TableRow key={it.id}>
                                <TableCell className="font-mono text-xs">
                                  <span title={`id tarja ${it.tarja_id}`}>
                                    {it.tag_code?.trim() || `id ${it.tarja_id}`}
                                  </span>
                                </TableCell>
                                <TableCell>{it.cajas_despachadas}</TableCell>
                                <TableCell>{it.pallets_despachados}</TableCell>
                                <TableCell>{it.unit_price}</TableCell>
                                <TableCell>{it.pallet_cost}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground">Sin líneas de unidad PT en este despacho.</p>
                      )}
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Documentos</h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {d.packing_list ? (
                          <span className="rounded-md bg-primary/15 px-2.5 py-1 font-mono text-primary">
                            {d.packing_list.packing_number}
                          </span>
                        ) : (
                          <span className="rounded-md border border-dashed border-border px-2.5 py-1 text-muted-foreground">Sin packing list</span>
                        )}
                        {d.invoice ? (
                          <span className="rounded-md bg-muted px-2.5 py-1 font-mono">
                            {d.invoice.invoice_number} · total {d.invoice.total}
                          </span>
                        ) : (
                          <span className="rounded-md border border-dashed border-border px-2.5 py-1 text-muted-foreground">Sin factura</span>
                        )}
                      </div>
                      {d.invoice && (
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-semibold">Líneas de factura {d.invoice.invoice_number}</h4>
                        {(d.invoice.lines ?? []).some(
                          (ln) => !ln.is_manual && ln.traceability_ok === false,
                        ) ? (
                          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                            Hay líneas automáticas <strong>sin trazabilidad</strong> (sin unidad PT ni proceso en la línea). La liquidación por
                            productor puede quedar en &quot;sin asignar&quot; para esas cajas. Regenerá la factura (②) tras corregir pallets o
                            procesos.
                          </p>
                        ) : null}
                        {(d.invoice.lines ?? []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Sin líneas. Generá la factura con ① + ② (despacho / packing list). Los ajustes manuales son solo excepciones.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Detalle</TableHead>
                                <TableHead>Cant.</TableHead>
                                <TableHead>Origen</TableHead>
                                <TableHead>P.unit</TableHead>
                                <TableHead>Subt.</TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(d.invoice.lines ?? []).map((ln, idx) => (
                                <TableRow key={ln.id}>
                                  <TableCell>{idx + 1}</TableCell>
                                  <TableCell className="max-w-[220px] text-xs">
                                    {ln.is_manual ? (
                                      <span className="flex flex-wrap items-center gap-1">
                                        {ln.manual_line_kind === 'descuento' ? (
                                          <Badge variant="secondary" className="text-[10px]">
                                            Descuento
                                          </Badge>
                                        ) : null}
                                        <span>
                                          {ln.manual_description?.trim() ||
                                            [ln.packaging_code, ln.brand].filter(Boolean).join(' · ') ||
                                            'Ajuste manual'}
                                        </span>
                                      </span>
                                    ) : (
                                      <span>
                                        {ln.packaging_code ?? '—'} · esp.{ln.species_id ?? '—'} · var.{ln.variety_id ?? '—'} ·{' '}
                                        {ln.brand ?? '—'}
                                        {ln.trays != null && ln.trays > 0 ? ` · band.${ln.trays}` : ''}
                                        {ln.pounds != null ? ` · ${ln.pounds} lb` : ''}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>{ln.cajas}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {ln.is_manual ? (
                                      <Badge variant="outline" className="text-[10px]">
                                        Ajuste
                                      </Badge>
                                    ) : ln.tarja_id != null ? (
                                      <span title={`id tarja ${ln.tarja_id}`}>
                                        {ln.codigo_unidad_pt_display?.trim() ||
                                          ln.tag_code?.trim() ||
                                          `id ${ln.tarja_id}`}
                                      </span>
                                    ) : ln.fruit_process_id != null ? (
                                      <span title="Proceso (sin unidad PT en línea de factura)">Proc {ln.fruit_process_id}</span>
                                    ) : ln.final_pallet_id != null ? (
                                      <span title={`id existencia ${ln.final_pallet_id}`}>
                                        {ln.codigo_unidad_pt_display?.trim() || `PF #${ln.final_pallet_id}`}
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 dark:text-amber-400">Sin traz.</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">{ln.unit_price}</TableCell>
                                  <TableCell>{ln.line_subtotal}</TableCell>
                                  <TableCell>
                                    {ln.is_manual ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive"
                                        disabled={deleteInvoiceLineMut.isPending}
                                        onClick={() => deleteInvoiceLineMut.mutate({ dispatchId: d.id, lineId: ln.id })}
                                      >
                                        Quitar
                                      </Button>
                                    ) : (
                                      <span className="flex flex-col items-end gap-0.5">
                                        <Badge variant="outline" className="text-[10px]">
                                          {ln.tarja_id != null
                                            ? 'unidad PT'
                                            : ln.fruit_process_id != null
                                              ? 'proceso'
                                              : ln.final_pallet_id != null
                                                ? 'existencia PT'
                                                : 'sin traz.'}
                                        </Badge>
                                        {ln.traceability_note ? (
                                          <span className="max-w-[140px] text-[10px] text-muted-foreground" title={ln.traceability_note}>
                                            {ln.traceability_note.slice(0, 48)}
                                            {ln.traceability_note.length > 48 ? '…' : ''}
                                          </span>
                                        ) : null}
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                      )}
                    </section>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog
        open={attachFpDispatchId != null}
        onOpenChange={(o) => {
          if (!o) {
            setAttachFpDispatchId(null);
            setFpSelect({});
            setFpAttachUnitPrices({});
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Unidades PT en despacho #{attachFpDispatchId ?? '—'}
              </DialogTitle>
              <button
                type="button"
                onClick={() => setAttachFpDispatchId(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs">
              Solo unidades en estado <strong>definitivo</strong> y sin otro despacho. Se actualiza el packing list. La factura comercial usa
              precio por <strong>caja</strong> por formato de presentación (indicá abajo los que correspondan a existencias marcadas).
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto rounded-md border border-border p-2">
              {availableFinalPallets.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay existencias PT disponibles.</p>
              ) : (
                availableFinalPallets.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={!!fpSelect[p.id]}
                      onChange={(e) => setFpSelect((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                    />
                    <span>
                      <span className="font-mono">
                        {p.codigo_unidad_pt_display?.trim() || p.tag_code?.trim() || p.corner_board_code || `PF-${p.id}`}
                      </span>{' '}
                      · {p.format_code ?? '—'} · {p.totals.amount} cajas · fmt id {p.presentation_format_id ?? '—'}
                    </span>
                  </label>
                ))
              )}
            </div>
            {attachDialogFormats.length === 0 ? (
              <p className="text-xs text-muted-foreground">Marcá pallets con formato para cargar precios por caja.</p>
            ) : (
              <div className="grid gap-2">
                <Label className="text-xs">Precio por caja por formato</Label>
                <div className="grid gap-2 rounded-md border border-border p-2">
                  {attachDialogFormats.map((f) => (
                    <div key={f.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <span className="font-mono text-xs">{f.format_code ?? `Formato #${f.id}`}</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-8 w-24 tabular-nums text-right text-xs"
                        placeholder="0"
                        value={fpAttachUnitPrices[String(f.id)] ?? ''}
                        onChange={(e) =>
                          setFpAttachUnitPrices((prev) => ({ ...prev, [String(f.id)]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAttachFpDispatchId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={attachFpMut.isPending || attachFpDispatchId == null}
              onClick={() => attachFpDispatchId != null && attachFpMut.mutate(attachFpDispatchId)}
            >
              {attachFpMut.isPending ? 'Guardando…' : 'Vincular y actualizar PL'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDispatchId != null}
        onOpenChange={(o) => {
          if (!o) setConfirmDispatchId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Se detectaron inconsistencias</DialogTitle>
          </DialogHeader>
          {pendingConfirmSummary ? (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-muted-foreground">
                Revisá pallets y datos comerciales antes de cerrar. Si el embarque es correcto aun con estas señales, podés confirmar
                igualmente.
              </p>
              <ul className="list-disc space-y-1.5 pl-4">
                {pendingConfirmSummary.palletsSinDestino > 0 ? (
                  <li>
                    <strong>{pendingConfirmSummary.palletsSinDestino}</strong> pallet(s) sin destino definido.
                  </li>
                ) : null}
                {palletsCabeceraClienteFueraSinDestino(pendingConfirmSummary) > 0 ? (
                  <li>
                    <strong>{palletsCabeceraClienteFueraSinDestino(pendingConfirmSummary)}</strong> pallet(s) sin cliente en cabecera
                    (hay BOL o pedido previsto).
                  </li>
                ) : null}
                {pendingConfirmSummary.palletsMulticlientePt > 0 ? (
                  <li>
                    <strong>{pendingConfirmSummary.palletsMulticlientePt}</strong> pallet(s) con mezcla de clientes en unidades PT.
                  </li>
                ) : null}
                {pendingConfirmSummary.palletsPtSinAsignacion > 0 ? (
                  <li>
                    <strong>{pendingConfirmSummary.palletsPtSinAsignacion}</strong> pallet(s) con unidades PT sin asignación comercial.
                  </li>
                ) : null}
                {pendingConfirmSummary.mezclaCabeceraClientes ? (
                  <li>Mezcla de clientes distintos en cabecera entre pallets.</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Cargando datos…</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmDispatchId(null)}>
              Volver a corregir
            </Button>
            <Button
              type="button"
              disabled={confirmDispatchMut.isPending || confirmDispatchId == null}
              onClick={() => {
                if (confirmDispatchId == null) return;
                confirmDispatchMut.mutate(confirmDispatchId);
              }}
            >
              {confirmDispatchMut.isPending ? 'Confirmando…' : 'Confirmar igualmente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bolDialogDispatchId != null}
        onOpenChange={(o) => {
          if (!o) {
            setBolDialogDispatchId(null);
            setBolApplyToPls(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar BOL — despacho #{bolDialogDispatchId ?? '—'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="bol-edit">Número BOL</Label>
            <Input id="bol-edit" value={bolEditValue} onChange={(e) => setBolEditValue(e.target.value)} placeholder="Único en sistema" />
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={bolApplyToPls}
                onChange={(e) => setBolApplyToPls(e.target.checked)}
              />
              <span>También actualizar el BOL en los packing lists PT vinculados a este despacho</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Si no marcás la opción, el cambio aplica solo al despacho; los packing lists conservan el BOL que tenían (solo despacho).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBolDialogDispatchId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!bolEditValue.trim() || updateDispatchBolMut.isPending}
              onClick={() => {
                if (bolDialogDispatchId == null) return;
                updateDispatchBolMut.mutate({
                  dispatchId: bolDialogDispatchId,
                  numero_bol: bolEditValue.trim(),
                  apply_to_packing_lists: bolApplyToPls,
                });
              }}
            >
              {updateDispatchBolMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={metaDialogDispatchId != null}
        onOpenChange={(o) => {
          if (!o) setMetaDialogDispatchId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Editar datos de despacho #{metaDialogDispatchId ?? '—'}
              </DialogTitle>
              <button
                type="button"
                onClick={() => setMetaDialogDispatchId(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>
          {dispatches?.find((x) => x.id === metaDialogDispatchId)?.status === 'despachado' ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              Ajuste post-salida: se guarda una traza automática en notas del termógrafo.
            </p>
          ) : null}
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="dispatch-meta-fecha">Fecha despacho</Label>
              <Input
                id="dispatch-meta-fecha"
                type="datetime-local"
                value={metaFechaDespacho}
                onChange={(e) => setMetaFechaDespacho(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dispatch-meta-temp">Temperatura (F)</Label>
              <Input
                id="dispatch-meta-temp"
                type="number"
                step="0.01"
                value={metaTemperaturaF}
                onChange={(e) => setMetaTemperaturaF(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dispatch-meta-serial">N° termógrafo</Label>
              <Input
                id="dispatch-meta-serial"
                value={metaThermographSerial}
                onChange={(e) => setMetaThermographSerial(e.target.value)}
                placeholder="Serie / identificador"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dispatch-meta-notes">Observaciones termógrafo / destino</Label>
              <Input
                id="dispatch-meta-notes"
                value={metaThermographNotes}
                onChange={(e) => setMetaThermographNotes(e.target.value)}
                placeholder="Notas operativas"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMetaDialogDispatchId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!metaFechaDespacho || !metaTemperaturaF || updateDispatchMetaMut.isPending}
              onClick={() => {
                if (metaDialogDispatchId == null) return;
                const temp = Number(metaTemperaturaF);
                if (!Number.isFinite(temp)) {
                  toast.error('Temperatura inválida');
                  return;
                }
                const iso = new Date(metaFechaDespacho).toISOString();
                updateDispatchMetaMut.mutate({
                  dispatchId: metaDialogDispatchId,
                  fecha_despacho: iso,
                  temperatura_f: temp,
                  thermograph_serial: metaThermographSerial.trim(),
                  thermograph_notes: metaThermographNotes.trim(),
                });
              }}
            >
              {updateDispatchMetaMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={orderLinkDialogDispatchId != null}
        onOpenChange={(o) => {
          if (!o) setOrderLinkDialogDispatchId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Corregir pedido vinculado — despacho #{orderLinkDialogDispatchId ?? '—'}
              </DialogTitle>
              <button
                type="button"
                onClick={() => setOrderLinkDialogDispatchId(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>
          {orderLinkDispatch?.status === 'despachado' ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              Corrección post-salida: se mantiene traza automática en notas operativas.
            </p>
          ) : null}
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="order-link-order">Pedido</Label>
              <select
                id="order-link-order"
                className={filterSelectClass}
                value={String(orderLinkOrderId)}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setOrderLinkOrderId(id);
                  const so = salesOrders?.find((s) => s.id === id);
                  if (so) setOrderLinkClientId(so.cliente_id);
                }}
              >
                {(salesOrders ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.order_number} · #{s.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="order-link-client">Cliente pedido</Label>
              <Input id="order-link-client" value={orderLinkClientLabel} readOnly />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="order-link-commercial">Cliente comercial (opcional)</Label>
              <select
                id="order-link-commercial"
                className={filterSelectClass}
                value={String(orderLinkCommercialClientId)}
                onChange={(e) => setOrderLinkCommercialClientId(Number(e.target.value))}
              >
                <option value={0}>Sin cliente comercial</option>
                {(commercialClients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOrderLinkDialogDispatchId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={orderLinkOrderId <= 0 || orderLinkClientId <= 0 || updateDispatchOrderLinkMut.isPending}
              onClick={() => {
                if (orderLinkDialogDispatchId == null) return;
                updateDispatchOrderLinkMut.mutate({
                  dispatchId: orderLinkDialogDispatchId,
                  orden_id: orderLinkOrderId,
                  cliente_id: orderLinkClientId,
                  client_id: orderLinkCommercialClientId,
                });
              }}
            >
              {updateDispatchOrderLinkMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={invoicePricesDispatchId != null}
        onOpenChange={(o) => {
          if (!o) {
            setInvoicePricesDispatchId(null);
            setDispatchInvoiceUnitPrices({});
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>① Precios — factura comercial</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Despacho #{invoicePricesDispatchId ?? '—'}. Precios por caja: se rellenan desde el <strong>pedido #{invoicePricesDispatch?.orden_id ?? '—'}</strong>{' '}
            si aún no guardaste valores en el despacho; podés corregirlos. Luego <strong>② Factura</strong> y <strong>③ PDF</strong>. Vacío se guarda
            como 0; no modifica stock PT.
          </p>
          {invoicePricesLocked ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              Este despacho está <strong>despachado</strong> (salida física registrada). Los precios de factura no se pueden editar.
            </p>
          ) : null}
          {invoiceModalFormats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay formatos con ID en los pallets de este despacho.</p>
          ) : (
            <div className="grid gap-3">
              {invoiceModalFormats.map((f) => (
                <div key={f.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <Label htmlFor={`disp-inv-fmt-${f.id}`} className="font-mono text-sm">
                    {f.format_code ?? `Formato #${f.id}`}
                  </Label>
                  <Input
                    id={`disp-inv-fmt-${f.id}`}
                    type="text"
                    inputMode="decimal"
                    className="w-28 tabular-nums text-right"
                    placeholder="0"
                    readOnly={invoicePricesLocked}
                    value={dispatchInvoiceUnitPrices[String(f.id)] ?? ''}
                    onChange={(e) =>
                      setDispatchInvoiceUnitPrices((prev) => ({ ...prev, [String(f.id)]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setInvoicePricesDispatchId(null);
                setDispatchInvoiceUnitPrices({});
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                invoicePricesDispatchId == null ||
                invoicePricesLocked ||
                updateDispatchUnitPricesMut.isPending ||
                savePricesAndInvoiceMut.isPending
              }
              onClick={() => {
                if (invoicePricesDispatchId == null) return;
                const unit_price_by_format_id: Record<string, number> = {};
                for (const f of invoiceModalFormats) {
                  const raw = (dispatchInvoiceUnitPrices[String(f.id)] ?? '').trim().replace(',', '.');
                  const n = parseFloat(raw);
                  unit_price_by_format_id[String(f.id)] = Number.isFinite(n) ? n : 0;
                }
                updateDispatchUnitPricesMut.mutate({ dispatchId: invoicePricesDispatchId, unit_price_by_format_id });
              }}
            >
              {updateDispatchUnitPricesMut.isPending ? '…' : 'Solo guardar ①'}
            </Button>
            <Button
              type="button"
              disabled={
                invoicePricesDispatchId == null ||
                invoicePricesLocked ||
                invoiceModalFormats.length === 0 ||
                updateDispatchUnitPricesMut.isPending ||
                savePricesAndInvoiceMut.isPending
              }
              onClick={() => {
                if (invoicePricesDispatchId == null) return;
                const unit_price_by_format_id: Record<string, number> = {};
                for (const f of invoiceModalFormats) {
                  const raw = (dispatchInvoiceUnitPrices[String(f.id)] ?? '').trim().replace(',', '.');
                  const n = parseFloat(raw);
                  unit_price_by_format_id[String(f.id)] = Number.isFinite(n) ? n : 0;
                }
                savePricesAndInvoiceMut.mutate({ dispatchId: invoicePricesDispatchId, unit_price_by_format_id });
              }}
            >
              {savePricesAndInvoiceMut.isPending ? '…' : '① + ② Guardar y facturar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTagDispatchId != null} onOpenChange={(o) => !o && setAddTagDispatchId(null)}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Línea de despacho (unidad PT)
              </DialogTitle>
              <button
                type="button"
                onClick={() => setAddTagDispatchId(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>
          {addTagDispatchId != null && (
            <form
              onSubmit={tagForm.handleSubmit((body) =>
                addTagMut.mutate({ dispatchId: addTagDispatchId, body }),
              )}
              className="grid gap-3 py-2"
            >
              <div className="grid gap-2">
                <Label>Unidad PT</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...tagForm.register('tarja_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {sortedTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tag_code} · {t.format_code}
                    </option>
                  ))}
                </select>
                {tagForm.formState.errors.tarja_id && (
                  <p className="text-sm text-destructive">{tagForm.formState.errors.tarja_id.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Cajas</Label>
                  <Input type="number" min={1} {...tagForm.register('cajas_despachadas')} />
                </div>
                <div className="grid gap-2">
                  <Label>Pallets</Label>
                  <Input type="number" min={1} {...tagForm.register('pallets_despachados')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Precio unitario</Label>
                  <Input type="number" step="0.0001" min={0} {...tagForm.register('unit_price')} />
                </div>
                <div className="grid gap-2">
                  <Label>Costo pallet</Label>
                  <Input type="number" step="0.0001" min={0} {...tagForm.register('pallet_cost')} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddTagDispatchId(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={addTagMut.isPending}>
                  {addTagMut.isPending ? 'Guardando…' : 'Agregar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceLineDispatchId != null} onOpenChange={(o) => !o && setInvoiceLineDispatchId(null)}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Ajuste manual de factura
              </DialogTitle>
              <button
                type="button"
                onClick={() => setInvoiceLineDispatchId(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>
          {invoiceLineDispatchId != null && (
            <form
              onSubmit={manualInvForm.handleSubmit((body) =>
                addInvoiceLineMut.mutate({ dispatchId: invoiceLineDispatchId, body }),
              )}
              className="grid gap-3 py-2"
            >
              <p className="text-xs text-muted-foreground">
                Solo para excepciones. El detalle comercial principal sigue saliendo de ① precios por formato y ② generar factura.
              </p>
              <div className="grid gap-2">
                <Label>Descripción</Label>
                <Input {...manualInvForm.register('descripcion')} placeholder="Ej. flete, bonificación acordada…" />
                {manualInvForm.formState.errors.descripcion && (
                  <p className="text-sm text-destructive">{manualInvForm.formState.errors.descripcion.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Cantidad</Label>
                  <Input type="number" min={1} {...manualInvForm.register('cantidad', { valueAsNumber: true })} />
                </div>
                <div className="grid gap-2">
                  <Label>Precio unitario</Label>
                  <Input type="number" step="0.0001" min={0} {...manualInvForm.register('unit_price', { valueAsNumber: true })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
                  {...manualInvForm.register('tipo')}
                >
                  <option value="cargo">Cargo (suma al total)</option>
                  <option value="descuento">Descuento (resta del total)</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInvoiceLineDispatchId(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={addInvoiceLineMut.isPending}>
                  {addInvoiceLineMut.isPending ? 'Guardando…' : 'Agregar ajuste'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
