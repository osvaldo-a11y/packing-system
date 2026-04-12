import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Info, ListOrdered, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount } from '@/lib/number-format';
import {
  btnToolbarOutline,
  btnToolbarPrimary,
  emptyStatePanel,
  errorStateCard,
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
  signalsPanel,
  signalsTitle,
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

export type SalesOrderLineApi = {
  id: number;
  presentation_format_id: number;
  format_code: string | null;
  requested_boxes: number;
  unit_price: number | null;
  brand_id: number | null;
  brand_nombre: string | null;
  variety_id: number | null;
  variety_nombre: string | null;
  sort_order: number;
};

export type SalesOrderRow = {
  id: number;
  order_number: string;
  cliente_id: number;
  /** Nombre en maestro `clients` (mismo id que cliente_id). */
  cliente_nombre?: string | null;
  /** Total cajas (suma de líneas). */
  requested_boxes: number;
  /** Pallets estimados según max cajas/pallet del formato, cuando está cargado en el maestro. */
  requested_pallets: number;
  lines: SalesOrderLineApi[];
};

type PresentationFormatRow = { id: number; format_code: string; max_boxes_per_pallet?: number | null };
type BrandRow = { id: number; codigo?: string; nombre: string };
type VarietyRow = { id: number; nombre: string; species_id: number };
/** Maestro `clients` (ids alineados con `cliente_id` del pedido). */
type ClientMasterRow = { id: number; codigo: string; nombre: string };

const lineSchema = z.object({
  presentation_format_id: z.coerce.number().int().positive(),
  requested_boxes: z.coerce.number().int().min(0),
  unit_price: z.string().optional(),
  brand_id: z.coerce.number().int().min(0),
  variety_id: z.coerce.number().int().min(0),
});

const createSchema = z.object({
  cliente_id: z.coerce.number().int().positive(),
  lines: z.array(lineSchema).min(1),
});

const modifySchema = z.object({
  lines: z.array(lineSchema).min(1),
});

type CreateForm = z.infer<typeof createSchema>;
type ModifyForm = z.infer<typeof modifySchema>;

function toApiLines(lines: z.infer<typeof lineSchema>[]) {
  return lines.map((l) => ({
    presentation_format_id: l.presentation_format_id,
    requested_boxes: l.requested_boxes,
    unit_price: (() => {
      const t = (l.unit_price ?? '').trim().replace(',', '.');
      if (t === '') return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    })(),
    brand_id: l.brand_id > 0 ? l.brand_id : null,
    variety_id: l.variety_id > 0 ? l.variety_id : null,
  }));
}

function fetchOrders() {
  return apiJson<SalesOrderRow[]>('/api/sales-orders');
}

function brandOptionLabel(b: BrandRow) {
  const c = b.codigo?.trim();
  return c ? `${c} — ${b.nombre}` : b.nombre;
}

function defaultLine(fmtId: number): z.infer<typeof lineSchema> {
  return {
    presentation_format_id: fmtId,
    requested_boxes: 0,
    unit_price: '',
    brand_id: 0,
    variety_id: 0,
  };
}

function orderHasVolume(r: SalesOrderRow): boolean {
  return (Number(r.requested_boxes) || 0) > 0;
}

function VolumeBadge({ r }: { r: SalesOrderRow }) {
  const ok = orderHasVolume(r);
  return (
    <span
      className={cn(
        'inline-flex max-w-[160px] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
        ok
          ? 'border-emerald-200/80 bg-emerald-50 text-emerald-900'
          : 'border-amber-200/90 bg-amber-50 text-amber-950',
      )}
      title={ok ? 'Pedido con cajas pedidas' : 'Pedido sin cajas en líneas'}
    >
      {ok ? 'Con volumen' : 'Sin cajas'}
    </span>
  );
}

function formatCondicionComercial(r: SalesOrderRow): string {
  const parts = r.lines.map((l) => l.format_code?.trim() || `#${l.presentation_format_id}`);
  const uniq = [...new Set(parts)];
  if (!uniq.length) return '—';
  if (uniq.length <= 2) return uniq.join(' · ');
  return `${uniq.slice(0, 2).join(' · ')} +${uniq.length - 2}`;
}

function formatLinesPreview(r: SalesOrderRow): string {
  if (!r.lines.length) return '—';
  return r.lines
    .map((l) => `${l.format_code ?? `#${l.presentation_format_id}`} (${l.requested_boxes})`)
    .join(', ');
}

export function SalesOrdersPage() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<SalesOrderRow | null>(null);
  const [filterVolume, setFilterVolume] = useState<string>('');
  const [filterClientId, setFilterClientId] = useState(0);
  const [search, setSearch] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: fetchOrders,
  });

  const { data: formats } = useQuery({
    queryKey: ['masters', 'presentation-formats'],
    queryFn: () => apiJson<PresentationFormatRow[]>('/api/masters/presentation-formats'),
  });

  const { data: brandsForEdit } = useQuery({
    queryKey: ['masters', 'brands', 'for_client', 'edit', editRow?.id ?? 0, editRow?.cliente_id ?? 0],
    queryFn: () => {
      const id = editRow!.cliente_id;
      const q = id > 0 ? `?for_client_id=${id}` : '';
      return apiJson<BrandRow[]>(`/api/masters/brands${q}`);
    },
    enabled: editRow != null,
  });

  const { data: varieties } = useQuery({
    queryKey: ['masters', 'varieties'],
    queryFn: () => apiJson<VarietyRow[]>('/api/masters/varieties'),
  });

  const { data: clientsMaster } = useQuery({
    queryKey: ['masters', 'clients', 'include_inactive'],
    queryFn: () => apiJson<ClientMasterRow[]>('/api/masters/clients?include_inactive=true'),
    enabled: createOpen,
  });

  const firstFmtId = formats?.[0]?.id ?? 0;
  const firstClientId = clientsMaster?.[0]?.id ?? 0;

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      cliente_id: 1,
      lines: [defaultLine(firstFmtId || 1)],
    },
  });

  useEffect(() => {
    if (!createOpen || !clientsMaster?.length) return;
    const cur = createForm.getValues('cliente_id');
    if (!clientsMaster.some((c) => c.id === cur)) {
      createForm.setValue('cliente_id', clientsMaster[0].id);
    }
  }, [createOpen, clientsMaster, createForm]);

  const createClienteId = useWatch({ control: createForm.control, name: 'cliente_id' });

  const { data: brandsForCreate } = useQuery({
    queryKey: ['masters', 'brands', 'for_client', createOpen, Number(createClienteId) || 0],
    queryFn: () => {
      const id = Number(createClienteId);
      const q = id > 0 ? `?for_client_id=${id}` : '';
      return apiJson<BrandRow[]>(`/api/masters/brands${q}`);
    },
    enabled: createOpen,
  });

  useEffect(() => {
    if (!createOpen || brandsForCreate === undefined) return;
    const allowed = new Set(brandsForCreate.map((b) => b.id));
    const n = createForm.getValues('lines').length;
    for (let idx = 0; idx < n; idx++) {
      const bid = createForm.getValues(`lines.${idx}.brand_id`);
      if (typeof bid === 'number' && bid > 0 && !allowed.has(bid)) {
        createForm.setValue(`lines.${idx}.brand_id`, 0);
      }
    }
  }, [createOpen, createClienteId, brandsForCreate, createForm]);

  const createLines = useFieldArray({ control: createForm.control, name: 'lines' });

  const editForm = useForm<ModifyForm>({
    resolver: zodResolver(modifySchema),
    defaultValues: { lines: [defaultLine(1)] },
  });

  const editLines = useFieldArray({ control: editForm.control, name: 'lines' });

  useEffect(() => {
    if (createOpen && firstFmtId > 0) {
      const cur = createForm.getValues('lines.0.presentation_format_id');
      if (!cur || cur === 0) {
        createForm.setValue('lines.0.presentation_format_id', firstFmtId);
      }
    }
  }, [createOpen, firstFmtId, createForm]);

  const createMut = useMutation({
    mutationFn: (body: CreateForm) =>
      apiJson('/api/sales-orders', {
        method: 'POST',
        body: JSON.stringify({ cliente_id: body.cliente_id, lines: toApiLines(body.lines) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Pedido creado');
      setCreateOpen(false);
      createForm.reset({
        cliente_id: firstClientId || 1,
        lines: [defaultLine(firstFmtId || 1)],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (editRow) {
      const lines =
        editRow.lines.length > 0
          ? editRow.lines.map((l) => ({
              presentation_format_id: l.presentation_format_id,
              requested_boxes: l.requested_boxes,
              unit_price: l.unit_price != null ? String(l.unit_price) : '',
              brand_id: l.brand_id ?? 0,
              variety_id: l.variety_id ?? 0,
            }))
          : [defaultLine(firstFmtId || 1)];
      editForm.reset({ lines });
    }
  }, [editRow, editForm, firstFmtId]);

  useEffect(() => {
    if (!editRow || brandsForEdit === undefined) return;
    const allowed = new Set(brandsForEdit.map((b) => b.id));
    const n = editForm.getValues('lines').length;
    for (let idx = 0; idx < n; idx++) {
      const bid = editForm.getValues(`lines.${idx}.brand_id`);
      if (typeof bid === 'number' && bid > 0 && !allowed.has(bid)) {
        editForm.setValue(`lines.${idx}.brand_id`, 0);
      }
    }
  }, [editRow?.id, editRow?.cliente_id, brandsForEdit, editForm]);

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: ModifyForm }) =>
      apiJson(`/api/sales-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ lines: toApiLines(body.lines) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('Pedido actualizado (packing/factura regenerados en despachos vinculados)');
      setEditRow(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clientOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of data ?? []) {
      if (r.cliente_id > 0) {
        const nm = r.cliente_nombre?.trim();
        m.set(r.cliente_id, nm || `Cliente #${r.cliente_id}`);
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    let list = data;
    if (filterVolume === 'con') {
      list = list.filter((r) => orderHasVolume(r));
    } else if (filterVolume === 'sin') {
      list = list.filter((r) => !orderHasVolume(r));
    }
    if (filterClientId > 0) {
      list = list.filter((r) => Number(r.cliente_id) === filterClientId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        return (
          r.order_number.toLowerCase().includes(q) ||
          String(r.id).includes(q) ||
          String(r.cliente_id).includes(q) ||
          (r.cliente_nombre?.toLowerCase().includes(q) ?? false) ||
          formatCondicionComercial(r).toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [data, filterVolume, filterClientId, search]);

  const kpis = useMemo(() => {
    const list = filtered;
    let vacios = 0;
    let conVolumen = 0;
    let sinNombreCliente = 0;
    let multiformato = 0;
    let sinLineas = 0;
    let totalCajas = 0;
    let totalPalletsEst = 0;
    let sumLineas = 0;
    const clientes = new Set<number>();
    for (const r of list) {
      if (orderHasVolume(r)) conVolumen++;
      else vacios++;
      if (!r.cliente_nombre?.trim()) sinNombreCliente++;
      if (!r.lines?.length) sinLineas++;
      const fmtIds = new Set(r.lines.map((l) => l.presentation_format_id));
      if (fmtIds.size > 1) multiformato++;
      totalCajas += Number(r.requested_boxes) || 0;
      totalPalletsEst += Number(r.requested_pallets) || 0;
      sumLineas += r.lines.length;
      if (r.cliente_id > 0) clientes.add(r.cliente_id);
    }
    return {
      total: list.length,
      vacios,
      conVolumen,
      sinNombreCliente,
      multiformato,
      sinLineas,
      totalCajas,
      totalPalletsEst,
      sumLineas,
      clientesActivos: clientes.size,
    };
  }, [filtered]);

  const alertLines = useMemo(() => {
    const lines: { key: string; tone: 'warn' | 'info'; text: string }[] = [];
    if (kpis.vacios > 0) {
      lines.push({
        key: 'vacios',
        tone: 'warn',
        text: `${formatCount(kpis.vacios)} pedido(s) sin cajas pedidas en la vista — revisá líneas o cerrá comercialmente.`,
      });
    }
    if (kpis.sinNombreCliente > 0) {
      lines.push({
        key: 'cliente',
        tone: 'warn',
        text: `${formatCount(kpis.sinNombreCliente)} pedido(s) sin nombre de cliente en maestro (solo ID).`,
      });
    }
    if (kpis.sinLineas > 0) {
      lines.push({
        key: 'lineas',
        tone: 'warn',
        text: `${formatCount(kpis.sinLineas)} pedido(s) sin líneas en la vista actual.`,
      });
    }
    if (kpis.multiformato > 0) {
      lines.push({
        key: 'multi',
        tone: 'info',
        text: `${formatCount(kpis.multiformato)} pedido(s) combinan más de un formato — el avance cruza por formato/marca/variedad.`,
      });
    }
    return lines;
  }, [kpis.vacios, kpis.sinNombreCliente, kpis.sinLineas, kpis.multiformato]);

  const helpTitle =
    'Líneas por formato de presentación (cajas pedidas; precio/caja y marca/variedad opcionales). Los totales se calculan desde las líneas; los pallets estimados usan max_boxes_per_pallet del formato cuando existe en el maestro. Crear y modificar: supervisor o admin. La relación con packing list y despacho se consolida en la pantalla Avance del pedido.';

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
            <CardTitle>Error al cargar pedidos</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : 'Reintentá más tarde.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <h2 className={pageTitle}>Pedidos</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>
              Planificación comercial por formato; seguí el cumplimiento en Avance y despacho.
            </p>
            <button type="button" className={pageInfoButton} title={helpTitle} aria-label="Ayuda pedidos">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canManage && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className={btnToolbarPrimary}>
                  <Plus className="h-4 w-4" />
                  Nuevo pedido
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Nuevo pedido</DialogTitle>
                </DialogHeader>
                <form onSubmit={createForm.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="c_cliente">Cliente</Label>
                    {clientsMaster === undefined ? (
                      <p className="text-sm text-muted-foreground">Cargando maestro de clientes…</p>
                    ) : clientsMaster.length === 0 ? (
                      <div
                        role="status"
                        className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                        <span>
                          No hay clientes en el maestro (o todos inactivos sin incluir inactivos). Cargá al menos un cliente en Maestros antes de
                          crear el pedido.
                        </span>
                      </div>
                    ) : (
                      <select
                        id="c_cliente"
                        className={filterSelectClass}
                        {...createForm.register('cliente_id', { valueAsNumber: true })}
                      >
                        {clientsMaster.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} — {c.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {clientsMaster?.length ? (
                    <p className="text-xs text-slate-500">
                      Las marcas por línea se listan según el <strong>cliente</strong> elegido (marcas asignadas a ese cliente en Maestros, más
                      marcas <strong>sin cliente</strong> — uso general).
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <Label>Líneas del pedido</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl"
                      onClick={() =>
                        createLines.append(defaultLine(firstFmtId || createForm.getValues('lines.0.presentation_format_id') || 1))
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Agregar línea
                    </Button>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-3">
                    {createLines.fields.map((field, idx) => (
                      <div
                        key={field.id}
                        className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-2 lg:grid-cols-3"
                      >
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">Formato</Label>
                          <select
                            className={filterSelectClass}
                            {...createForm.register(`lines.${idx}.presentation_format_id`, { valueAsNumber: true })}
                          >
                            {(formats ?? []).map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.format_code}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">Cajas pedidas</Label>
                          <Input
                            className={filterInputClass}
                            type="number"
                            min={0}
                            {...createForm.register(`lines.${idx}.requested_boxes`, { valueAsNumber: true })}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">Precio / caja (opcional)</Label>
                          <Input className={filterInputClass} placeholder="—" {...createForm.register(`lines.${idx}.unit_price`)} />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">Marca (opcional)</Label>
                          <select className={filterSelectClass} {...createForm.register(`lines.${idx}.brand_id`, { valueAsNumber: true })}>
                            <option value={0}>—</option>
                            {(brandsForCreate ?? []).map((b) => (
                              <option key={b.id} value={b.id}>
                                {brandOptionLabel(b)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">Variedad (opcional)</Label>
                          <select
                            className={filterSelectClass}
                            {...createForm.register(`lines.${idx}.variety_id`, { valueAsNumber: true })}
                          >
                            <option value={0}>—</option>
                            {(varieties ?? []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={createLines.fields.length <= 1}
                            onClick={() => createLines.remove(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl"
                      disabled={createMut.isPending || !formats?.length || !clientsMaster?.length}
                    >
                      {createMut.isPending ? 'Creando…' : 'Crear'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Button asChild variant="outline" size="sm" className={btnToolbarOutline}>
            <Link to="/existencias-pt/inventario" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Inventario PT
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="so-kpis" className="space-y-4">
        <h2 id="so-kpis" className="sr-only">
          Indicadores
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Pedidos totales</p>
            <p className={kpiValueLg}>{formatCount(kpis.total)}</p>
            <p className={kpiFootnote}>En vista actual</p>
          </div>
          <div
            className={cn(
              kpiCard,
              kpis.vacios > 0 ? 'border-amber-200/90 bg-amber-50/35' : '',
            )}
          >
            <p className={kpiLabel}>Sin cajas</p>
            <p className={cn(kpiValueLg, kpis.vacios > 0 ? 'text-amber-950' : '')}>{formatCount(kpis.vacios)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Volumen pedido = 0</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Con volumen</p>
            <p className={kpiValueLg}>{formatCount(kpis.conVolumen)}</p>
            <p className={kpiFootnote}>Cajas pedidas &gt; 0</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Clientes (vista)</p>
            <p className={kpiValueLg}>{formatCount(kpis.clientesActivos)}</p>
            <p className={kpiFootnote}>Distintos en pedidos filtrados</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={kpiValueMd}>{formatCount(kpis.totalCajas)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Pallets (est.)</p>
            <p className={kpiValueMd}>{formatCount(kpis.totalPalletsEst)}</p>
            <p className={kpiFootnote}>Según maestro de formatos</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Líneas comerciales</p>
            <p className={kpiValueMd}>{formatCount(kpis.sumLineas)}</p>
            <p className={kpiFootnote}>Σ líneas en pedidos de la vista</p>
          </div>
          <div
            className={cn(
              kpiCardSm,
              kpis.multiformato > 0 ? 'border-violet-200/85 bg-violet-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Multiformato</p>
            <p className={cn(kpiValueMd, kpis.multiformato > 0 ? 'text-violet-950' : '')}>{formatCount(kpis.multiformato)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Pedidos con &gt;1 formato</p>
          </div>
        </div>
      </section>

      {alertLines.length > 0 ? (
        <div className={signalsPanel}>
          <p className={signalsTitle}>Señales operativas</p>
          <ul className="space-y-2">
            {alertLines.map((a) => (
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Volumen, cliente y búsqueda por número, ID o texto en formatos."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
          <div className="grid gap-2 lg:col-span-3">
            <Label className="text-xs text-slate-500">Volumen</Label>
            <select className={filterSelectClass} value={filterVolume} onChange={(e) => setFilterVolume(e.target.value)}>
              <option value="">Todos</option>
              <option value="con">Con volumen</option>
              <option value="sin">Sin cajas</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label className="text-xs text-slate-500">Cliente</Label>
            <select
              className={filterSelectClass}
              value={filterClientId}
              onChange={(e) => setFilterClientId(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {clientOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-5">
            <Label className="text-xs text-slate-500">Buscar</Label>
            <Input
              className={filterInputClass}
              placeholder="Número, cliente, ID, formato…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="so-tabla">
        <div>
          <h2 id="so-tabla" className={sectionTitle}>
            Listado comercial
          </h2>
          <p className={sectionHint}>
            {filtered.length} pedido(s) · el listado API no incluye fecha ni vínculos PL/despacho — consolidado en{' '}
            <span className="font-medium text-slate-600">Avance</span>
          </p>
        </div>

        {!data?.length ? (
          <p className={emptyStatePanel}>No hay pedidos cargados.</p>
        ) : !filtered.length ? (
          <p className={emptyStatePanel}>Sin coincidencias con el filtro.</p>
        ) : (
          <div className={tableShell}>
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[130px]">Estado volumen</TableHead>
                  <TableHead className="whitespace-nowrap text-slate-500">Fecha</TableHead>
                  <TableHead className="min-w-[160px]">Cliente</TableHead>
                  <TableHead className="min-w-[120px]">Pedido</TableHead>
                  <TableHead className="min-w-[160px]">Formatos</TableHead>
                  <TableHead className="text-right tabular-nums">Cajas</TableHead>
                  <TableHead className="text-right tabular-nums">Peso</TableHead>
                  <TableHead className="min-w-[200px]">Packing list / Despacho</TableHead>
                  <TableHead className="w-[200px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className={tableBodyRow}>
                    <TableCell className="max-w-[200px] py-3.5 align-top">
                      <VolumeBadge r={r} />
                    </TableCell>
                    <TableCell className="align-top text-xs text-slate-400" title="No expuesto en API de listado">
                      —
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top">
                      <span className="text-sm">
                        {r.cliente_nombre?.trim() ? (
                          <>
                            <span className="font-medium text-slate-900">{r.cliente_nombre}</span>
                            <span className="text-slate-400"> · #{r.cliente_id}</span>
                          </>
                        ) : (
                          <span className="text-amber-800">#{r.cliente_id}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-mono text-sm font-medium text-slate-900">{r.order_number}</span>
                      <p className="text-[11px] text-slate-400">ID {r.id}</p>
                    </TableCell>
                    <TableCell className="max-w-[220px] align-top">
                      <p className="text-xs font-medium text-slate-800" title={formatLinesPreview(r)}>
                        {formatCondicionComercial(r)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500" title={formatLinesPreview(r)}>
                        {formatLinesPreview(r)}
                      </p>
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums text-slate-900">
                      {formatCount(r.requested_boxes)}
                    </TableCell>
                    <TableCell className="align-top text-right text-xs text-slate-400" title="Peso no incluido en el listado de pedidos">
                      —
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          to={`/sales-orders/${r.id}/avance`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
                          title="Producción, packing list y despacho consolidados"
                        >
                          <ListOrdered className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          PL
                        </Link>
                        <span className="text-slate-200">·</span>
                        <Link
                          to={`/sales-orders/${r.id}/avance`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
                          title="Producción, packing list y despacho consolidados"
                        >
                          <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          Despacho
                        </Link>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">Detalle en avance</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-8 rounded-lg text-slate-700" asChild>
                          <Link to={`/sales-orders/${r.id}/avance`}>Avance</Link>
                        </Button>
                        {canManage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 rounded-lg border-slate-200"
                            onClick={() => setEditRow(r)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Card className="rounded-2xl border-slate-100 bg-slate-50/30 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">Nota de alcance</CardTitle>
          <CardDescription className="text-[13px] text-slate-500">
            Número de orden tipo SO-#####. Estados de despacho/PL y peso consolidado figuran en la vista de avance y en módulos Despachos / Packing
            Lists.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0" />
      </Card>

      <Dialog
        open={editRow != null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Editar {editRow?.order_number}</DialogTitle>
            {editRow ? (
              <p className="pt-1 text-xs text-slate-500">
                Cliente:{' '}
                <span className="font-medium text-slate-900">
                  {editRow.cliente_nombre?.trim() || `ID ${editRow.cliente_id}`}
                </span>
                . Las marcas por línea son las del cliente más las genéricas (sin cliente en maestro).
              </p>
            ) : null}
          </DialogHeader>
          {editRow && (
            <form
              onSubmit={editForm.handleSubmit((body) => editMut.mutate({ id: editRow.id, body }))}
              className="grid gap-3 py-2"
              key={editRow.id}
            >
              <div className="flex items-center justify-between gap-2">
                <Label>Líneas del pedido</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl"
                  onClick={() =>
                    editLines.append(defaultLine(firstFmtId || editForm.getValues('lines.0.presentation_format_id') || 1))
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Agregar línea
                </Button>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-3">
                {editLines.fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <div className="grid gap-1">
                      <Label className="text-xs text-slate-500">Formato</Label>
                      <select
                        className={filterSelectClass}
                        {...editForm.register(`lines.${idx}.presentation_format_id`, { valueAsNumber: true })}
                      >
                        {(formats ?? []).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.format_code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-slate-500">Cajas pedidas</Label>
                      <Input
                        className={filterInputClass}
                        type="number"
                        min={0}
                        {...editForm.register(`lines.${idx}.requested_boxes`, { valueAsNumber: true })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-slate-500">Precio / caja (opcional)</Label>
                      <Input className={filterInputClass} placeholder="—" {...editForm.register(`lines.${idx}.unit_price`)} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-slate-500">Marca (opcional)</Label>
                      <select className={filterSelectClass} {...editForm.register(`lines.${idx}.brand_id`, { valueAsNumber: true })}>
                        <option value={0}>—</option>
                        {(brandsForEdit ?? []).map((b) => (
                          <option key={b.id} value={b.id}>
                            {brandOptionLabel(b)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-slate-500">Variedad (opcional)</Label>
                      <select className={filterSelectClass} {...editForm.register(`lines.${idx}.variety_id`, { valueAsNumber: true })}>
                        <option value={0}>—</option>
                        {(varieties ?? []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={editLines.fields.length <= 1}
                        onClick={() => editLines.remove(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditRow(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl" disabled={editMut.isPending || !formats?.length}>
                  {editMut.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
