import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiJson } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/number-format';

export type SalesOrderProgressLineApi = {
  sales_order_line_id: number;
  presentation_format_id: number;
  format_code: string | null;
  requested_boxes: number;
  unit_price: number | null;
  brand_id: number | null;
  brand_nombre: string | null;
  variety_id: number | null;
  variety_nombre: string | null;
  produced_depot_boxes: number;
  assigned_pl_boxes: number;
  dispatched_boxes: number;
  pending_boxes: number;
  fulfillment: 'pendiente' | 'parcial' | 'completo';
  alerts: string[];
};

export type SalesOrderProgressApi = {
  order: { id: number; order_number: string; cliente_id: number; cliente_nombre: string | null };
  lines: SalesOrderProgressLineApi[];
  totals: {
    requested_boxes: number;
    produced_depot_boxes: number;
    assigned_pl_boxes: number;
    dispatched_boxes: number;
    pending_boxes: number;
  };
};

function fulfillmentBadge(f: SalesOrderProgressLineApi['fulfillment']) {
  switch (f) {
    case 'completo':
      return <Badge className="border border-green-200 bg-green-50 text-green-700 hover:bg-green-50">Completo</Badge>;
    case 'parcial':
      return <Badge className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">En curso</Badge>;
    default:
      return <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">Pendiente</Badge>;
  }
}

function alertLabel(code: string) {
  switch (code) {
    case 'despacho_sobre_pedido':
      return 'Despacho > pedido';
    case 'asignacion_pl_sobre_pedido':
      return 'PL > pedido';
    case 'deposito_sobre_pedido':
      return 'Depósito > pedido';
    default:
      return code;
  }
}

export function SalesOrderProgressPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ? Number(id) : NaN;

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['sales-orders', orderId, 'progress'],
    queryFn: () => apiJson<SalesOrderProgressApi>(`/api/sales-orders/${orderId}/progress`),
    enabled: Number.isFinite(orderId) && orderId > 0,
  });

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Pedido inválido</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'No se pudo cargar el avance.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1" asChild>
          <Link to="/sales-orders">
            <ArrowLeft className="h-4 w-4" />
            Pedidos
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Avance de pedido</h1>
          <p className="text-muted-foreground">
            <span className="font-mono">{data.order.order_number}</span>
            {data.order.cliente_nombre?.trim() ? (
              <>
                {' '}
                · <span className="font-medium">{data.order.cliente_nombre}</span>
                <span className="text-muted-foreground"> (#{data.order.cliente_id})</span>
              </>
            ) : (
              <span className="text-muted-foreground"> · cliente #{data.order.cliente_id}</span>
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por línea de pedido</CardTitle>
          <details className="rounded-md border border-blue-200 bg-blue-50 p-2">
            <summary className="cursor-pointer text-sm font-medium text-blue-700">ℹ ¿Cómo funciona el avance?</summary>
            <CardDescription className="mt-2 text-slate-600">
              Depósito = pallets finales en estado definitivo sin PL ni despacho. Asignado PL = en packing list PT confirmado (no reversado)
              vinculado al pedido por despacho o por pallet con pedido previsto. Despachado = mismo criterio con despacho confirmado o
              despachado. El filtro por línea usa formato + marca/variedad cuando están definidos en el pedido.
            </CardDescription>
          </details>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este pedido no tiene líneas cargadas. Editá el pedido para agregar líneas por formato.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formato</TableHead>
                  <TableHead>Variedad</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">$/caja</TableHead>
                  <TableHead className="text-right">Pedido</TableHead>
                  <TableHead className="text-right">Depósito</TableHead>
                  <TableHead className="text-right">Asign. PL</TableHead>
                  <TableHead className="text-right">Despachado</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead>Avance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((row) => (
                  <TableRow key={row.sales_order_line_id}>
                    <TableCell className="font-mono text-sm">{row.format_code ?? `#${row.presentation_format_id}`}</TableCell>
                    <TableCell className="text-sm">{row.variety_nombre ?? '—'}</TableCell>
                    <TableCell className="text-sm">{row.brand_nombre ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {row.unit_price != null ? formatMoney(row.unit_price) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.requested_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.produced_depot_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.assigned_pl_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.dispatched_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.pending_boxes}</TableCell>
                    <TableCell>{fulfillmentBadge(row.fulfillment)}</TableCell>
                    <TableCell>
                      {row.alerts.length > 0 ? (
                        <span className="inline-flex flex-wrap items-center gap-1 text-amber-700 dark:text-amber-400" title={row.alerts.join(', ')}>
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span className="text-xs">{row.alerts.map(alertLabel).join(' · ')}</span>
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={4}>Totales</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.requested_boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.produced_depot_boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.assigned_pl_boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.dispatched_boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.pending_boxes}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
