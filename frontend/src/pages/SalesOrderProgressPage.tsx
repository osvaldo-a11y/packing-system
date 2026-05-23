import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  /** Cámara con `planned_sales_order_id` = este pedido. */
  reserved_depot_boxes: number;
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
    reserved_depot_boxes: number;
    assigned_pl_boxes: number;
    dispatched_boxes: number;
    pending_boxes: number;
  };
};

function fulfillmentBadge(
  f: SalesOrderProgressLineApi['fulfillment'],
  t: (key: string) => string
) {
  switch (f) {
    case 'completo':
      return <Badge className="border border-green-200 bg-green-50 text-green-700 hover:bg-green-50">{t('salesOrderProgress.fulfillment.complete')}</Badge>;
    case 'parcial':
      return <Badge className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">{t('salesOrderProgress.fulfillment.inProgress')}</Badge>;
    default:
      return <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">{t('salesOrderProgress.fulfillment.pending')}</Badge>;
  }
}

function alertLabel(code: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (code) {
    case 'despacho_sobre_pedido':
      return t('salesOrderProgress.alerts.dispatchOverOrder');
    case 'asignacion_pl_sobre_pedido':
      return t('salesOrderProgress.alerts.plOverOrder');
    case 'deposito_sobre_pedido':
      return t('salesOrderProgress.alerts.depotOverOrder');
    default:
      return code;
  }
}

export function SalesOrderProgressPage() {
  const { t } = useTranslation('common');
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
            {t('salesOrderProgress.backButton')}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('salesOrderProgress.pageTitle')}</h1>
          <p className="text-muted-foreground">
            <span className="font-mono">{data.order.order_number}</span>
            {data.order.cliente_nombre?.trim() ? (
              <>
                {' '}
                · <span className="font-medium">{data.order.cliente_nombre}</span>
                <span className="text-muted-foreground"> (#{data.order.cliente_id})</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {' '}
                · {t('salesOrderProgress.clientFallback', { id: data.order.cliente_id })}
              </span>
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('salesOrderProgress.card.title')}</CardTitle>
          <details className="rounded-md border border-blue-200 bg-blue-50 p-2">
            <summary className="cursor-pointer text-sm font-medium text-blue-700">{t('salesOrderProgress.card.howItWorks')}</summary>
            <CardDescription className="mt-2 text-slate-600">
              {t('salesOrderProgress.card.description')}
            </CardDescription>
          </details>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('salesOrderProgress.card.emptyLines')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('salesOrderProgress.table.colFormat')}</TableHead>
                  <TableHead>{t('salesOrderProgress.table.colVariety')}</TableHead>
                  <TableHead>{t('salesOrderProgress.table.colBrand')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colPrice')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colOrdered')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colDepot')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colReserved')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colAssignedPl')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colDispatched')}</TableHead>
                  <TableHead className="text-right">{t('salesOrderProgress.table.colPending')}</TableHead>
                  <TableHead>{t('salesOrderProgress.table.colProgress')}</TableHead>
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
                    <TableCell className="text-right tabular-nums">{row.reserved_depot_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.assigned_pl_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.dispatched_boxes}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.pending_boxes}</TableCell>
                    <TableCell>{fulfillmentBadge(row.fulfillment, t)}</TableCell>
                    <TableCell>
                      {row.alerts.length > 0 ? (
                        <span className="inline-flex flex-wrap items-center gap-1 text-amber-700 dark:text-amber-400" title={row.alerts.join(', ')}>
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span className="text-xs">{row.alerts.map((a) => alertLabel(a, t)).join(' · ')}</span>
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={4}>{t('salesOrderProgress.table.totals')}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.requested_boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.produced_depot_boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.reserved_depot_boxes}</TableCell>
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
