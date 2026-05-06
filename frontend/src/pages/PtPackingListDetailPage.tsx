import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Box } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiJson, downloadPdf, downloadPdfPost } from '@/api';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatLb } from '@/lib/number-format';
import { errorStatePanel } from '@/lib/page-ui';
import { pickSalesOrderForPrices, unitPricesRecordFromOrderLines } from '@/lib/sales-order-prices';
import type { SalesOrderRow } from '@/pages/SalesOrdersPage';

type PtPlDetail = {
  id: number;
  list_code: string;
  client_id: number | null;
  client_nombre: string | null;
  list_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  total_boxes: number;
  total_pounds: number;
  numero_bol: string | null;
  linked_dispatch_id: number | null;
  /** Pedido (`sales_orders.id`) del despacho vinculado; para heredar precios/caja. */
  linked_orden_id: number | null;
  reversal: {
    reversed_at: string;
    reversed_by_username: string;
    notes: string | null;
  } | null;
  pallets: {
    id: number;
    corner_board_code: string;
    codigo_unidad_pt_display?: string;
    trazabilidad_pt?: 'unica' | 'varias' | 'sin_trazabilidad';
    species_nombre: string | null;
    presentation_format_id: number | null;
    format_code: string | null;
    client_nombre: string | null;
    status: string;
    boxes: number;
    pounds: number;
  }[];
};

export function PtPackingListDetailPage() {
  const { role } = useAuth();
  const canReverseMaster = role === 'admin' || role === 'supervisor';
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseNotes, setReverseNotes] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  /** Precio por caja por presentation_format_id (string en estado para inputs). */
  const [unitPriceByFormatId, setUnitPriceByFormatId] = useState<Record<string, string>>({});
  const [bolDraft, setBolDraft] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['pt-packing-list', id],
    queryFn: () => apiJson<PtPlDetail>(`/api/pt-packing-lists/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });

  const { data: salesOrders } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: () => apiJson<SalesOrderRow[]>('/api/sales-orders'),
  });

  useEffect(() => {
    if (data) setBolDraft(data.numero_bol ?? '');
  }, [data?.id, data?.numero_bol]);

  const saveBolMut = useMutation({
    mutationFn: () =>
      apiJson<PtPlDetail>(`/api/pt-packing-lists/${id}/numero-bol`, {
        method: 'PATCH',
        body: JSON.stringify({ numero_bol: bolDraft }),
      }),
    onSuccess: () => {
      toast.success('BOL actualizado');
      qc.invalidateQueries({ queryKey: ['pt-packing-list', id] });
      qc.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      qc.invalidateQueries({ queryKey: ['dispatches', 'linkable-pt-packing-lists'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: () => apiJson<PtPlDetail>(`/api/pt-packing-lists/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Packing list confirmado: stock PT descontado y pallets en “asignado_pl”.');
      qc.invalidateQueries({ queryKey: ['pt-packing-list', id] });
      qc.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDraftMut = useMutation({
    mutationFn: () => apiJson<void>(`/api/pt-packing-lists/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Borrador eliminado.');
      qc.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
      navigate('/existencias-pt/packing-lists');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverseMut = useMutation({
    mutationFn: (notes?: string) =>
      apiJson<PtPlDetail>(`/api/pt-packing-lists/${id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes?.trim() ? notes.trim() : undefined }),
      }),
    onSuccess: () => {
      toast.success('Reversa aplicada: pallets en definitivo y stock PT repuesto.');
      setReverseOpen(false);
      setReverseNotes('');
      qc.invalidateQueries({ queryKey: ['pt-packing-list', id] });
      qc.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverseMasterMut = useMutation({
    mutationFn: (notes?: string) =>
      apiJson<PtPlDetail>(`/api/pt-packing-lists/${id}/reverse-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes?.trim() ? notes.trim() : undefined }),
      }),
    onSuccess: () => {
      toast.success('Reversa aplicada: despacho desvinculado o eliminado, pallets en definitivo y stock PT repuesto.');
      setReverseOpen(false);
      setReverseNotes('');
      qc.invalidateQueries({ queryKey: ['pt-packing-list', id] });
      qc.invalidateQueries({ queryKey: ['pt-packing-lists'] });
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      qc.invalidateQueries({ queryKey: ['dispatches', 'linkable-pt-packing-lists'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formatsForInvoice = useMemo(() => {
    const m = new Map<number, { id: number; format_code: string | null }>();
    for (const p of data?.pallets ?? []) {
      if (p.presentation_format_id != null && p.presentation_format_id > 0 && !m.has(p.presentation_format_id)) {
        m.set(p.presentation_format_id, {
          id: p.presentation_format_id,
          format_code: p.format_code,
        });
      }
    }
    return [...m.values()].sort((a, b) => (a.format_code || '').localeCompare(b.format_code || ''));
  }, [data?.pallets]);

  const priceSourceOrder = useMemo(
    () =>
      data
        ? pickSalesOrderForPrices(data.client_id, data.linked_orden_id ?? null, salesOrders ?? [])
        : undefined,
    [data?.client_id, data?.linked_orden_id, salesOrders],
  );

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="space-y-4">
        <div role="alert" className={errorStatePanel}>
          ID inválido.
        </div>
        <Button variant="outline" asChild>
          <Link to="/existencias-pt/packing-lists">Volver</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1" asChild>
          <Link to="/existencias-pt/packing-lists">
            <ArrowLeft className="h-4 w-4" />
            Packing lists
          </Link>
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <div role="alert" className={errorStatePanel}>
          {(error as Error)?.message ?? 'Error'}
        </div>
      ) : data ? (
        <>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Detalle Packing List PT</p>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Detalle Packing List PT</h2>
            <p className="text-sm text-slate-500">Seguimiento comercial y logístico del listado seleccionado.</p>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold font-mono tracking-tight">{data.list_code}</h1>
              <p className="text-muted-foreground">
                Cliente: {data.client_nombre ?? '—'} · Fecha: {data.list_date}
              </p>
              {data.notes ? <p className="mt-1 text-sm">{data.notes}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.status === 'borrador' ? (
                <Badge variant="outline">borrador</Badge>
              ) : data.status === 'confirmado' ? (
                <Badge>confirmado</Badge>
              ) : (
                <Badge variant="secondary">anulado</Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await downloadPdf(`/api/documents/pt-packing-lists/${id}/pdf`, `pt-packing-list-${id}.pdf`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                PDF logístico
              </Button>
              <Button
                size="sm"
                variant="outline"
                title="Factura comercial agrupada (formato × variedad × marca). Precios por caja: se sugieren desde el pedido (mismo cliente o pedido del despacho vinculado)."
                onClick={() => {
                  const order = pickSalesOrderForPrices(
                    data.client_id,
                    data.linked_orden_id ?? null,
                    salesOrders ?? [],
                  );
                  const inherited = order ? unitPricesRecordFromOrderLines(order.lines) : {};
                  setUnitPriceByFormatId((prev) => {
                    const next = { ...prev };
                    for (const f of formatsForInvoice) {
                      const k = String(f.id);
                      if ((next[k] ?? '').trim()) continue;
                      next[k] = inherited[k] != null ? String(inherited[k]) : '';
                    }
                    return next;
                  });
                  setInvoiceOpen(true);
                }}
              >
                Factura PDF
              </Button>
              {data.status === 'borrador' ? (
                <Button
                  size="sm"
                  disabled={confirmMut.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        '¿Confirmar packing list? Se descontará stock PT y los pallets pasarán a estado asignado a packing list.',
                      )
                    ) {
                      confirmMut.mutate();
                    }
                  }}
                >
                  {confirmMut.isPending ? '…' : 'Confirmar'}
                </Button>
              ) : null}
              {data.status === 'borrador' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={deleteDraftMut.isPending}
                  onClick={() => deleteDraftMut.mutate()}
                >
                  {deleteDraftMut.isPending ? '…' : 'Eliminar borrador'}
                </Button>
              ) : null}
              {data.status === 'confirmado' ? (
                <Button size="sm" variant="destructive" disabled={reverseMut.isPending} onClick={() => setReverseOpen(true)}>
                  Revertir
                </Button>
              ) : null}
            </div>
          </div>

          {data.total_boxes === 0 && data.status !== 'borrador' ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" aria-hidden />
              <p className="text-sm font-medium text-amber-800">
                Este packing list no tiene Unidades PT asignadas. Las cajas aparecen en 0 porque fue creado por carga
                masiva.
              </p>
            </div>
          ) : null}

          <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Factura comercial — precios por formato</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Precio por caja por formato. Sugerencia desde pedido{' '}
                {priceSourceOrder ? (
                  <span className="font-mono">#{priceSourceOrder.id}</span>
                ) : (
                  '—'
                )}{' '}
                (mismo cliente comercial o pedido del despacho vinculado). Vacío o inválido = 0. No modifica stock.
              </p>
              {formatsForInvoice.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay formatos con ID en los pallets de este listado; la factura usará montos en 0 salvo datos cargados por API.
                </p>
              ) : (
                <div className="grid gap-3">
                  {formatsForInvoice.map((f) => (
                    <div key={f.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <Label htmlFor={`inv-fmt-${f.id}`} className="font-mono text-sm">
                        {f.format_code ?? `Formato #${f.id}`}
                      </Label>
                      <Input
                        id={`inv-fmt-${f.id}`}
                        type="text"
                        inputMode="decimal"
                        className="w-28 tabular-nums text-right"
                        placeholder="0"
                        value={unitPriceByFormatId[String(f.id)] ?? ''}
                        onChange={(e) =>
                          setUnitPriceByFormatId((prev) => ({ ...prev, [String(f.id)]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    const unit_prices_by_format_id: Record<string, number> = {};
                    for (const f of formatsForInvoice) {
                      const raw = (unitPriceByFormatId[String(f.id)] ?? '').trim().replace(',', '.');
                      const n = parseFloat(raw);
                      unit_prices_by_format_id[String(f.id)] = Number.isFinite(n) ? n : 0;
                    }
                    try {
                      await downloadPdfPost(`/api/documents/pt-packing-lists/${id}/invoice/pdf`, `factura-pl-${id}.pdf`, {
                        unit_prices_by_format_id,
                      });
                      setInvoiceOpen(false);
                      toast.success('Factura descargada.');
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Descargar PDF
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Revertir packing list</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Los pallets vuelven a estado definitivo en depósito y se repone el stock PT.
                {data.linked_dispatch_id != null ? (
                  <>
                    {' '}
                    Este listado está vinculado al despacho <span className="font-mono">#{data.linked_dispatch_id}</span>.
                    {canReverseMaster ? (
                      <>
                        {' '}
                        Como supervisor o administrador podés usar la reversión maestra: desvincula el despacho (y lo elimina si era el único
                        packing list) y luego aplica la reversa. Si el despacho está «despachado», primero deshacé la salida en
                        Despachos.
                      </>
                    ) : (
                      <>
                        {' '}
                        Pedí a un supervisor o administrador que use «Revertir (admin)» aquí, o desvinculá manualmente desde
                        Despachos antes de revertir.
                      </>
                    )}
                  </>
                ) : (
                  <> No se puede revertir si algún pallet ya tiene otro despacho asignado por otro camino.</>
                )}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="reverse-notes">Notas (opcional)</Label>
                <textarea
                  id="reverse-notes"
                  className="min-h-[80px] rounded-md border border-input bg-muted/30 px-2 py-1.5 text-sm"
                  value={reverseNotes}
                  onChange={(e) => setReverseNotes(e.target.value)}
                  placeholder="Motivo u observación de la reversa"
                />
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setReverseOpen(false)}>
                  Cancelar
                </Button>
                {data.linked_dispatch_id != null && canReverseMaster ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={reverseMasterMut.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          '¿Revertir con desvinculo de despacho? Se eliminará el vínculo al despacho (y el despacho si quedara vacío). Los pallets volverán a depósito.',
                        )
                      ) {
                        return;
                      }
                      reverseMasterMut.mutate(reverseNotes);
                    }}
                  >
                    {reverseMasterMut.isPending ? '…' : 'Revertir (admin — desvincula despacho)'}
                  </Button>
                ) : data.linked_dispatch_id != null && !canReverseMaster ? (
                  <Button type="button" variant="secondary" disabled title="Solo un administrador puede revertir con despacho vinculado">
                    Revertir no disponible
                  </Button>
                ) : (
                  <Button type="button" variant="destructive" disabled={reverseMut.isPending} onClick={() => reverseMut.mutate(reverseNotes)}>
                    {reverseMut.isPending ? '…' : 'Revertir'}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {data.reversal ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trazabilidad reversa</CardTitle>
                <CardDescription>
                  {new Date(data.reversal.reversed_at).toLocaleString()} · {data.reversal.reversed_by_username}
                </CardDescription>
              </CardHeader>
              {data.reversal.notes ? (
                <CardContent className="pt-0 text-sm text-muted-foreground">{data.reversal.notes}</CardContent>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">BOL (documento)</CardTitle>
              <CardDescription>
                {data.linked_dispatch_id != null ? (
                  <>
                    Gestionado desde el despacho #{data.linked_dispatch_id}. Cambiá el BOL en{' '}
                    <Link className="text-primary underline-offset-4 hover:underline" to="/dispatches">
                      Despachos
                    </Link>{' '}
                    (botón BOL: solo despacho o también en PL).
                  </>
                ) : data.status === 'anulado' ? (
                  'Packing list anulado; no se edita BOL.'
                ) : (
                  'Definí el BOL antes de crear el despacho para heredarlo automáticamente.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {data.linked_dispatch_id == null && data.status !== 'anulado' ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-1 flex-1 min-w-[200px]">
                    <Label htmlFor="pl-bol">Número BOL</Label>
                    <Input id="pl-bol" value={bolDraft} onChange={(e) => setBolDraft(e.target.value)} placeholder="Opcional" />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saveBolMut.isPending || bolDraft === (data.numero_bol ?? '')}
                    onClick={() => saveBolMut.mutate()}
                  >
                    {saveBolMut.isPending ? '…' : 'Guardar BOL'}
                  </Button>
                </div>
              ) : data.numero_bol ? (
                <p className="font-mono text-sm">{data.numero_bol}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Sin BOL</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Totales</CardTitle>
              <CardDescription>
                {data.total_boxes} cajas · {formatLb(data.total_pounds, 2)} lb
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pallets</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              {data.pallets.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
                  <Box className="h-12 w-12 opacity-30" aria-hidden />
                  <p className="text-sm font-medium text-slate-800">Sin pallets asignados</p>
                  <p className="text-xs text-slate-500">
                    Este PL fue creado por carga masiva sin Unidades PT vinculadas.
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => navigate('/existencias-pt')}>
                    Ir a Inventario cámara
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código Unidad PT</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead className="text-right">Cajas</TableHead>
                      <TableHead className="text-right">Lb</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pallets.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">
                          <Link className="text-primary hover:underline" to={`/existencias-pt/detalle/${p.id}`}>
                            {p.codigo_unidad_pt_display?.trim() || p.corner_board_code || `PF-${p.id}`}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.format_code ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.boxes}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatLb(p.pounds, 2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{p.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
