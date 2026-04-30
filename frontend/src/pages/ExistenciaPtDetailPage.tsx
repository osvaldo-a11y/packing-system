import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileDown } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiJson, downloadPdf } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatLb } from '@/lib/number-format';
import { errorStatePanel } from '@/lib/page-ui';

type TraceProceso = {
  id: number;
  resultado: string;
  fecha_proceso: string;
  process_status: string;
};

type TraceProductor = { nombre: string | null; codigo: string | null };

type TraceRecepcion = {
  id: number;
  ref_display: string | null;
  document_number: string | null;
  received_at: string | null;
};

type TraceLine = {
  line_id: number;
  line_order: number;
  fruit_process_id: number | null;
  proceso: TraceProceso | null;
  productor: TraceProductor | null;
  recepcion: TraceRecepcion | null;
  ref_text: string | null;
  especie: string | null;
  variedad: { id: number; nombre: string | null };
  amount: number;
  pounds: number;
};

type PalletTraceabilityResponse = {
  pallet: {
    id: number;
    corner_board_code: string;
    tag_code?: string | null;
    unidad_pt_codigos?: string[];
    tarja_ids?: number[];
    trazabilidad_pt?: 'unica' | 'varias' | 'sin_trazabilidad';
    codigo_unidad_pt_display?: string;
    codigo_logistico?: string;
    mensaje_trazabilidad?: string | null;
    repalletizaje?: 'no' | 'resultado' | 'origen';
    status: string;
    species_nombre: string | null;
    quality_nombre: string | null;
    format_code: string | null;
    presentation_format_id: number | null;
    client_id: number | null;
    client_nombre: string | null;
    brand_nombre: string | null;
    bol: string | null;
    planned_sales_order_id: number | null;
    planned_order_number: string | null;
    clamshell_label: string;
    dispatch_id: number | null;
    totals: { amount: number; pounds: number };
  };
  recepciones: TraceRecepcion[];
  lines: TraceLine[];
  repallet?: {
    as_result: {
      event_id: number;
      created_at: string;
      notes: string | null;
      sources: {
        source_final_pallet_id: number;
        codigo_unidad_pt_display?: string | null;
        boxes_removed: number;
        pounds_removed: number;
      }[];
    } | null;
    as_source: {
      event_id: number;
      result_final_pallet_id: number | null;
      result_codigo_unidad_pt_display?: string | null;
      boxes_removed: number;
      pounds_removed: number;
      created_at: string | null;
    }[];
    reverse: {
      can_reverse: boolean;
      blocked_reason: 'despachado' | 'usado_en_repalet_posterior' | null;
      reversed_at: string | null;
      reversal: {
        id: number;
        created_at: string;
        reversed_by_username: string;
        notes: string | null;
      } | null;
    } | null;
  };
};

function fmtLb(n: number) {
  if (!Number.isFinite(n)) return '—';
  return formatLb(n, 2);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ExistenciaPtDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const palletId = Number(idParam);
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['final-pallet-traceability', palletId],
    queryFn: () => apiJson<PalletTraceabilityResponse>(`/api/final-pallets/${palletId}/traceability`),
    enabled: Number.isFinite(palletId) && palletId > 0,
  });

  const reverseMut = useMutation({
    mutationFn: () =>
      apiJson<PalletTraceabilityResponse['pallet'] & { id: number }>(`/api/final-pallets/${palletId}/repallet-reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Repaletizaje revertido.');
      qc.invalidateQueries({ queryKey: ['final-pallet-traceability', palletId] });
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!Number.isFinite(palletId) || palletId <= 0) {
    return (
      <div className="space-y-4">
        <div role="alert" className={errorStatePanel}>
          Identificador inválido.
        </div>
        <Button variant="outline" asChild>
          <Link to="/existencias-pt/inventario">Volver a inventario cámara</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1" asChild>
          <Link to="/existencias-pt/inventario">
            <ArrowLeft className="h-4 w-4" />
            Inventario cámara
          </Link>
        </Button>
        {data?.repallet?.reverse?.can_reverse ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={reverseMut.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  '¿Revertir este repaletizaje? La preparación pasará a estado revertido y los orígenes recuperarán las cajas. Esta acción queda registrada.',
                )
              ) {
                return;
              }
              reverseMut.mutate();
            }}
          >
            {reverseMut.isPending ? 'Revirtiendo…' : 'Revertir repaletizaje'}
          </Button>
        ) : null}
        {Number.isFinite(palletId) && palletId > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              try {
                await downloadPdf(
                  `/api/documents/final-pallets/${palletId}/pdf?variant=etiqueta`,
                  `pallet-pt-${palletId}-etiqueta.pdf`,
                );
                toast.success('PDF etiqueta Unidad PT');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Error al descargar PDF');
              }
            }}
          >
            <FileDown className="h-4 w-4" />
            PDF etiqueta Unidad PT
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <div role="alert" className={errorStatePanel}>
          {(error as Error)?.message ?? 'No se pudo cargar el detalle.'}
        </div>
      ) : data ? (
        <>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Detalle existencia PT</h2>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl font-mono">
              {data.pallet.codigo_unidad_pt_display?.trim() ||
                data.pallet.tag_code?.trim() ||
                data.pallet.corner_board_code ||
                `PF-${data.pallet.id}`}
            </h1>
            {data.pallet.mensaje_trazabilidad ? (
              <p className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground">
                {data.pallet.mensaje_trazabilidad}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-muted-foreground">
              {data.pallet.trazabilidad_pt === 'sin_trazabilidad' ? (
                <>
                  Identificador logístico{' '}
                  <span className="font-mono font-medium text-foreground">
                    {(data.pallet.codigo_logistico ?? data.pallet.corner_board_code) || `PF-${data.pallet.id}`}
                  </span>
                  : no hay unidad PT (TAR) resoluble desde las líneas en la base actual.
                </>
              ) : (
                <>
                  Código unidad PT resuelto desde las líneas (proceso →{' '}
                  <code className="text-xs">tarja_id</code> y <code className="text-xs">pt_tag_items</code>
                  ). ID interno (sistema):{' '}
                  <span className="font-mono tabular-nums">{data.pallet.id}</span>
                  {data.pallet.unidad_pt_codigos && data.pallet.unidad_pt_codigos.length > 1 ? (
                    <> · Varias TAR en esta preparación: {data.pallet.unidad_pt_codigos.join(', ')}</>
                  ) : null}
                </>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Repaletizaje (cierres / conteos)</span>
              {data.pallet.repalletizaje === 'resultado' ? (
                <Badge variant="secondary">Sí — resultado (stock vigente en esta preparación)</Badge>
              ) : data.pallet.repalletizaje === 'origen' ? (
                <Badge variant="outline" className="border-amber-500/60">
                  Sí — origen consumido (no duplicar lb/cajas)
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal">
                  No
                </Badge>
              )}
            </div>
            <p className="mt-2 text-muted-foreground">
              Trazabilidad de producto terminado (solo lectura). Cadena: recepción → proceso → Unidad PT.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cabecera (Unidad PT)</CardTitle>
              <CardDescription>Datos comerciales y de empaque; sin edición desde esta vista.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Código Unidad PT (principal)</span>
                <p className="font-mono font-medium">
                  {data.pallet.trazabilidad_pt === 'sin_trazabilidad' ? (
                    <span className="text-muted-foreground italic">Sin TAR vinculada</span>
                  ) : (
                    data.pallet.unidad_pt_codigos?.join(', ') || data.pallet.tag_code || '—'
                  )}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">ID interno (sistema)</span>
                <p className="font-mono font-medium tabular-nums">{data.pallet.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Estado</span>
                <div>
                  <Badge variant={data.pallet.status === 'definitivo' ? 'default' : 'secondary'}>
                    {data.pallet.status}
                  </Badge>
                  {data.pallet.dispatch_id != null ? (
                    <span className="ml-2 text-muted-foreground">Despacho #{data.pallet.dispatch_id}</span>
                  ) : null}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Especie</span>
                <p className="font-medium">{data.pallet.species_nombre ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Formato</span>
                <p className="font-mono font-medium">{data.pallet.format_code ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Cliente</span>
                <p className="font-medium">
                  {data.pallet.client_id != null && data.pallet.client_id > 0 && data.pallet.client_nombre?.trim() ? (
                    data.pallet.client_nombre
                  ) : (
                    <span className="text-muted-foreground italic">Sin cliente</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Marca</span>
                <p>{data.pallet.brand_nombre ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Totales</span>
                <p className="font-medium tabular-nums">
                  {data.pallet.totals.amount} cajas · {fmtLb(data.pallet.totals.pounds)} lb
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Pedido previsto</span>
                <p className="font-medium">
                  {data.pallet.planned_order_number?.trim() ? (
                    data.pallet.planned_order_number
                  ) : (
                    <span className="text-muted-foreground italic">Sin pedido</span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">BOL / referencia (opcional)</span>
                <p>{data.pallet.bol?.trim() ? data.pallet.bol : '—'}</p>
              </div>
              {data.pallet.clamshell_label ? (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Clamshell</span>
                  <p>{data.pallet.clamshell_label}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.repallet &&
          (data.repallet.as_result != null ||
            (data.repallet.as_source && data.repallet.as_source.length > 0)) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Repaletizaje</CardTitle>
                <CardDescription>
                  Enlaces entre existencias cuando esta preparación proviene de un repaletizaje o aportó cajas a otro destino.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {data.repallet.as_result ? (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <p className="font-medium">Esta existencia es resultado de repaletizaje</p>
                    <p className="text-muted-foreground text-xs">
                      Evento #{data.repallet.as_result.event_id} · {fmtDate(data.repallet.as_result.created_at)}
                    </p>
                    {data.repallet.reverse?.reversed_at ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Revertido el {fmtDate(data.repallet.reverse.reversed_at)}
                        {data.repallet.reverse.reversal?.reversed_by_username
                          ? ` · ${data.repallet.reverse.reversal.reversed_by_username}`
                          : ''}
                      </p>
                    ) : null}
                    {data.repallet.reverse?.reversal?.notes ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Nota reversa: {data.repallet.reverse.reversal.notes}
                      </p>
                    ) : null}
                    {data.repallet.as_result.notes ? (
                      <p className="mt-1 text-xs">{data.repallet.as_result.notes}</p>
                    ) : null}
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      {data.repallet.as_result.sources.map((s) => (
                        <li key={s.source_final_pallet_id}>
                          Origen{' '}
                          <Link className="font-mono text-primary hover:underline" to={`/existencias-pt/detalle/${s.source_final_pallet_id}`}>
                            {s.codigo_unidad_pt_display?.trim() || `PF #${s.source_final_pallet_id}`}
                          </Link>
                          <span className="text-muted-foreground"> · id {s.source_final_pallet_id}</span>
                          : {s.boxes_removed} cajas · {fmtLb(s.pounds_removed)} lb
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data.repallet.as_source?.length ? (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <p className="font-medium">Esta existencia aportó cajas a otras preparaciones</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      {data.repallet.as_source.map((s) => (
                        <li key={`${s.event_id}-${s.result_final_pallet_id}`}>
                          Evento #{s.event_id} · {fmtDate(s.created_at)} →{' '}
                          {s.result_final_pallet_id != null ? (
                            <Link
                              className="font-mono text-primary hover:underline"
                              to={`/existencias-pt/detalle/${s.result_final_pallet_id}`}
                            >
                              {s.result_codigo_unidad_pt_display?.trim() || `PF #${s.result_final_pallet_id}`}
                            </Link>
                          ) : (
                            'destino desconocido'
                          )}
                          {s.result_final_pallet_id != null ? (
                            <span className="text-muted-foreground"> · id {s.result_final_pallet_id}</span>
                          ) : null}
                          : {s.boxes_removed} cajas · {fmtLb(s.pounds_removed)} lb
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {data.recepciones.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recepciones asociadas</CardTitle>
                <CardDescription>Referencias de ingreso de materia prima vinculadas a los procesos de las líneas.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {data.recepciones.map((r) => (
                    <li key={r.id} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                      <span className="font-mono font-medium">{r.ref_display ?? `Recepción #${r.id}`}</span>
                      {r.document_number ? (
                        <span className="text-muted-foreground"> · Doc. {r.document_number}</span>
                      ) : null}
                      <span className="text-muted-foreground"> · Ingreso: {fmtDate(r.received_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Líneas y cadena recepción → proceso → Unidad PT</CardTitle>
              <CardDescription>
                Por cada línea: origen en recepción/proceso y cantidades aportadas a esta preparación.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Cadena</TableHead>
                    <TableHead>Especie / Variedad</TableHead>
                    <TableHead className="text-right">Cajas</TableHead>
                    <TableHead className="text-right">Lb</TableHead>
                    <TableHead>Ref. línea</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((ln) => (
                    <TableRow key={ln.line_id}>
                      <TableCell className="tabular-nums">{ln.line_order + 1}</TableCell>
                      <TableCell className="max-w-[340px] text-xs">
                        <div className="space-y-1">
                          {ln.recepcion ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-muted-foreground">Recepción</span>
                              <span className="font-mono">{ln.recepcion.ref_display ?? `#${ln.recepcion.id}`}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sin recepción vinculada</span>
                          )}
                          {ln.productor?.nombre || ln.productor?.codigo ? (
                            <div>
                              <span className="text-muted-foreground">Productor: </span>
                              {ln.productor.nombre ?? ln.productor.codigo}
                              {ln.productor.codigo && ln.productor.nombre ? ` (${ln.productor.codigo})` : null}
                            </div>
                          ) : null}
                          {ln.proceso ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-muted-foreground">Proceso</span>
                              <Link
                                className="inline-flex items-center gap-0.5 font-mono text-primary hover:underline"
                                to={`/processes?processId=${ln.proceso.id}`}
                              >
                                #{ln.proceso.id}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                              <Badge variant="outline" className="text-[10px]">
                                {ln.proceso.resultado}
                              </Badge>
                              <span className="text-muted-foreground">{fmtDate(ln.proceso.fecha_proceso)}</span>
                            </div>
                          ) : ln.fruit_process_id ? (
                            <span className="text-muted-foreground">Proceso #{ln.fruit_process_id} (sin datos)</span>
                          ) : (
                            <span className="text-muted-foreground">Sin proceso en línea</span>
                          )}
                          <div className="text-[11px] text-muted-foreground border-t border-border pt-1 mt-1">
                            → Existencia{' '}
                            {data.pallet.codigo_unidad_pt_display ||
                              data.pallet.corner_board_code ||
                              `PF-${data.pallet.id}`}{' '}
                            (esta línea)
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{ln.especie ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{ln.variedad.nombre ?? `Var. ${ln.variedad.id}`}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ln.amount}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtLb(ln.pounds)}</TableCell>
                      <TableCell className="text-xs max-w-[180px] break-words">{ln.ref_text ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
