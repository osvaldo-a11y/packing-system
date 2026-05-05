import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Circle,
  Download,
  FileDown,
  FolderOpen,
  Info,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiFetch, apiJson, downloadPdf } from '@/api';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatReportCell } from '@/lib/format-report-cell';
import { formatLb, formatMoney, formatTechnical } from '@/lib/number-format';
import {
  btnToolbarPrimary,
  contentCard,
  emptyStateInset,
  emptyStatePanel,
  errorStateCard,
  filterInputClass,
  filterLabel,
  kpiCardSm,
  kpiFootnoteLead,
  kpiGrid3,
  kpiLabel,
  kpiValueMd,
  pageHeaderRow,
  pageInfoButton,
  pageStack,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import {
  aggregateDetailByFormatForProducer,
  downloadProducerSettlementExcelClient,
  enrichFormatAggWithFormatCostSummary,
  type RawRow as CierreRawRow,
} from '@/lib/cierre-producer-excel';
import { cn } from '@/lib/utils';
import { EodPlanningSection } from '@/components/reporting/EodPlanningSection';
import { ReportSemanticBlock } from '@/components/reporting/ReportSemanticBlock';

type ReportFilters = {
  productor_id?: number;
  /** Maestro `clients` — mismo id que despacho.cliente_id (margen por cliente). */
  cliente_id?: number;
  variedad_id?: number;
  tarja_id?: number;
  format_code?: string;
  precio_packing_por_lb?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  calidad?: string;
  page: number;
  limit: number;
};

function toQuery(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/**
 * PDF liquidación: GET /api/reporting/producer-settlement/pdf con mismos query params que el reporte.
 * `productor_id` en ReportFilterDto (backend) filtra liquidación a un solo productor vía computeProducerSettlementRows.
 */
async function downloadProducerSettlementPdf(
  variant: 'producer' | 'internal',
  f: ReportFilters,
  opts?: { productor_id?: number },
) {
  const merged: ReportFilters = {
    ...f,
    productor_id: opts?.productor_id ?? f.productor_id,
  };
  const q = toQuery({
    ...merged,
    variant,
    productor_id: merged.productor_id || undefined,
    cliente_id: merged.cliente_id || undefined,
    variedad_id: merged.variedad_id || undefined,
    tarja_id: merged.tarja_id || undefined,
    format_code: merged.format_code || undefined,
    precio_packing_por_lb: merged.precio_packing_por_lb ?? undefined,
    fecha_desde: merged.fecha_desde || undefined,
    fecha_hasta: merged.fecha_hasta || undefined,
    calidad: merged.calidad || undefined,
    page: merged.page,
    limit: merged.limit,
  });
  const path = `/api/reporting/producer-settlement/pdf?${q}`;
  const defaultName =
    variant === 'producer' ? 'liquidacion_productor.pdf' : 'liquidacion_productor_interno.pdf';
  try {
    await downloadPdf(path, defaultName);
    toast.success('PDF descargado');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(msg.slice(0, 220) || 'No se pudo generar el PDF');
  }
}

/** Misma agregación que planificación EOD — comparte caché de React Query con `EodPlanningSection`. */
async function fetchMpDisponibleProcesoResumenForReports(): Promise<{
  totalLb: number;
  lineCount: number;
  producerCount: number;
}> {
  const ids = await apiJson<number[]>('/api/processes/producers-with-eligible-mp');
  let totalLb = 0;
  let lineCount = 0;
  for (const pid of ids) {
    const lines = await apiJson<Array<{ available_lb: number }>>(`/api/processes/eligible-lines?producer_id=${pid}`);
    for (const ln of lines) {
      const a = Number(ln.available_lb);
      if (Number.isFinite(a) && a > 0) {
        totalLb += a;
        lineCount++;
      }
    }
  }
  return { totalLb, lineCount, producerCount: ids.length };
}

type PaginatedSection = { rows: Record<string, unknown>[]; total: number; page: number; limit: number };

type ProducerSettlementDiagnosticPayload = {
  meta: Record<string, unknown>;
  dispatches_included: Record<string, unknown>[];
  invoice_lines: Record<string, unknown>[];
};

/**
 * Diagnóstico viene en: GET /api/reporting/generate y GET /api/reporting/producer-settlement (campo producerSettlementDiagnostic).
 * GET /api/reporting/producer-settlement-diagnostic (payload aislado) es solo admin.
 * Si falta en la respuesta (guardado viejo), usamos este placeholder para no ocultar la sección.
 */
const EMPTY_PRODUCER_SETTLEMENT_DIAGNOSTIC: ProducerSettlementDiagnosticPayload = {
  meta: {
    origen: 'frontend_placeholder',
    mensaje:
      'No se recibió producerSettlementDiagnostic en la respuesta. Generá de nuevo el reporte; si usás un guardado antiguo, volvé a guardar después de generar.',
  },
  dispatches_included: [],
  invoice_lines: [],
};

type GenerateResponse = {
  filters: ReportFilters & Record<string, unknown>;
  plant_thresholds: Record<string, number>;
  boxesByProducer: PaginatedSection;
  /** Líneas pt_tag_items: proceso, unidad PT, formato, variedad del proceso. */
  boxesByProducerDetail: PaginatedSection;
  /** Cajas en facturas de despacho, productor vía misma lógica que liquidación. */
  dispatchedBoxesByProducer: PaginatedSection;
  palletCosts: PaginatedSection;
  yieldAndWaste: PaginatedSection;
  salesAndCostsByDispatch: PaginatedSection;
  packagingByFormat: PaginatedSection;
  formatCostSummary: PaginatedSection;
  formatCostLines: PaginatedSection;
  formatCostConfig?: { precio_packing_por_lb?: number | null; packing_source?: string };
  producerSettlementSummary?: PaginatedSection;
  producerSettlementDetail?: PaginatedSection;
  producerSettlementDiagnostic?: ProducerSettlementDiagnosticPayload;
  clientMarginSummary?: PaginatedSection;
  clientMarginDetail?: PaginatedSection;
};

type SpeciesRow = { id: number; nombre: string };
type PackingCostRow = {
  id: number;
  species_id: number;
  species_name: string | null;
  season: string | null;
  price_per_lb: number;
  active: boolean;
};

type SavedReportRow = {
  id: number;
  report_name: string;
  filters: Record<string, unknown>;
  payload: Record<string, unknown>;
  created_at: string;
};

type ReportModuleTab = 'operacion' | 'decision' | 'cierre' | 'documentos';

const REPORT_MODULE_TABS: {
  id: ReportModuleTab;
  label: string;
  subtitle: string;
  excelCtaHint: string;
}[] = [
  {
    id: 'operacion',
    label: 'Operación',
    subtitle: '¿Qué pasó hoy? Fin del día primero; KPIs del turno; período al final.',
    excelCtaHint: 'En Documentos podés exportar el libro completo con los mismos filtros.',
  },
  {
    id: 'decision',
    label: 'Decisión',
    subtitle: '¿Qué debo producir? Contexto de MP y simulación de pallets/formato.',
    excelCtaHint: 'En Documentos podés exportar el libro completo con los mismos filtros.',
  },
  {
    id: 'cierre',
    label: 'Cierre',
    subtitle: '¿Cuánto ganó cada productor? Liquidación, packing por especie y trazabilidad.',
    excelCtaHint: 'Exportar TODO (Excel) y PDF desde la pestaña Documentos.',
  },
  {
    id: 'documentos',
    label: 'Documentos',
    subtitle: '¿Cómo exporto? Vista del período y descargas.',
    excelCtaHint: 'Mismos filtros del período aplicados al archivo generado.',
  },
];

const PACKING_HIDDEN_SPECIES_LS = 'reporting.packingHiddenSpeciesIds';

function loadHiddenPackingSpeciesIds(): Set<number> {
  try {
    const raw = localStorage.getItem(PACKING_HIDDEN_SPECIES_LS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0));
  } catch {
    return new Set();
  }
}

function ReportCategoryBadge({ kind }: { kind: 'operativo' | 'decision' | 'financiero' | 'entregable' }) {
  const map = {
    operativo: 'border-sky-200 text-sky-900 bg-sky-50',
    decision: 'border-violet-200 text-violet-950 bg-violet-50',
    financiero: 'border-slate-300 text-slate-800 bg-slate-50',
    entregable: 'border-emerald-200 text-emerald-900 bg-emerald-50',
  };
  const label =
    kind === 'operativo'
      ? 'Operación'
      : kind === 'decision'
        ? 'Decisión'
        : kind === 'financiero'
          ? 'Cierre'
          : 'Documentos';
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', map[kind])}>
      {label}
    </Badge>
  );
}

function ProducerSettlementDiagnosticPanel({ data }: { data: ProducerSettlementDiagnosticPayload | undefined }) {
  const missingFromApi = data == null;
  const effective = data ?? EMPTY_PRODUCER_SETTLEMENT_DIAGNOSTIC;
  const { meta, dispatches_included, invoice_lines } = effective;
  const hint = meta.hint;
  const lineCols = invoice_lines.length ? Object.keys(invoice_lines[0] ?? {}) : [];
  const dispCols = dispatches_included.length ? Object.keys(dispatches_included[0] ?? {}) : [];
  return (
    <details
      id="report-diagnostico-liquidacion"
      className="group scroll-mt-20 rounded-lg border border-amber-200/90 bg-amber-50/50 open:border-amber-300"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-amber-950 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
        Depuración técnica (solo admin)
        <span className="ml-2 font-normal text-amber-800/90">— Uso interno; no mostrar como resultado al productor.</span>
      </summary>
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="pb-2 pt-0">
          <CardDescription className="text-amber-950/85">
            Despachos y líneas de factura del período, con la misma resolución unidad PT → productor que la liquidación. Usá
            esto solo para diagnosticar datos; no confundir con reportes financieros finales.
          </CardDescription>
        {missingFromApi ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-100/80 px-3 py-2 text-sm text-amber-950">
            <strong className="font-medium">Aviso:</strong> el JSON no incluye{' '}
            <span className="font-mono">producerSettlementDiagnostic</span> (p. ej. reporte guardado antes de esta función).
            Pulsá <strong>Generar</strong> otra vez para obtener datos del backend.
          </div>
        ) : null}
        {typeof hint === 'string' && hint ? (
          <p className="pt-2 text-sm font-medium text-amber-900">{hint}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Meta (filtros y conteos)</summary>
          <pre className="mt-3 max-h-[min(70vh,720px)] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </details>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            1) Despachos con factura en el período ({dispatches_included.length})
          </p>
          {dispatches_included.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno. Revisá fechas o que existan despachos facturados.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {dispCols.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap text-xs">
                        {c}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatches_included.map((row, i) => (
                    <TableRow key={i}>
                      {dispCols.map((c) => (
                        <TableCell key={c} className="max-w-[min(320px,40vw)] whitespace-pre-wrap break-words text-xs">
                          {renderCell(c, row[c])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            2) Líneas facturadas consideradas ({invoice_lines.length}) — scroll vertical si hay muchas
          </p>
          {invoice_lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin líneas: la liquidación queda vacía porque no hay ítems de factura en despachos del período.
            </p>
          ) : (
            <div className="max-h-[min(85vh,1400px)] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {lineCols.map((c) => (
                      <TableHead key={c} className="sticky top-0 z-[1] whitespace-nowrap bg-card text-xs shadow-sm">
                        {c}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice_lines.map((row, i) => (
                    <TableRow key={i}>
                      {lineCols.map((c) => (
                        <TableCell key={c} className="max-w-[min(320px,45vw)] whitespace-pre-wrap break-words align-top text-xs">
                          {renderCell(c, row[c])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </details>
  );
}

function SectionTable({
  title,
  section,
  id,
  dense,
  subtitle,
}: {
  title: string;
  section: PaginatedSection | undefined;
  id?: string;
  dense?: boolean;
  /** Texto bajo el título (p. ej. validación operativa). */
  subtitle?: ReactNode;
}) {
  const total = section?.total ?? 0;
  const hasRows = (section?.rows?.length ?? 0) > 0;
  const pageInfo =
    section != null
      ? `Total en servidor: ${total} filas · página ${section.page} · ${section.limit} por página`
      : '';
  const truncated = section != null && total > section.rows.length;
  const emptyButTotal =
    section != null && !hasRows && total > 0 ? 'Hay datos en otras páginas: bajá “Página” a 1 o subí “Límite” (máx. 100).' : null;

  if (!section) {
    return (
      <Card id={id} className="scroll-mt-20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          <CardDescription>Sin sección.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasRows) {
    return (
      <Card id={id} className="scroll-mt-20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          <CardDescription>
            {total === 0
              ? 'Sin filas para estos filtros.'
              : `Sin filas en esta página (${pageInfo}).`}
            {emptyButTotal ? ` ${emptyButTotal}` : ''}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const cols = Object.keys(section.rows[0] ?? {});
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle ? <CardDescription className="text-muted-foreground">{subtitle}</CardDescription> : null}
        <CardDescription>
          {pageInfo}
          {truncated ? (
            <span className="mt-1 block text-amber-800">
              Mostrás {section.rows.length} de {total}. Para ver más en una sola respuesta, poné Página 1 y Límite 100 en
              filtros, y volvé a generar.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <div className={dense ? 'max-h-[min(80vh,1000px)] overflow-auto rounded-md border border-border' : ''}>
          <Table>
            <TableHeader>
              <TableRow>
                {cols.map((c, i) => (
                  <TableHead
                    key={c}
                    className={`whitespace-nowrap ${i === 0 ? 'min-w-[8rem] font-medium text-foreground' : ''} ${dense ? 'sticky top-0 z-[1] bg-card text-xs shadow-sm' : ''}`}
                  >
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.map((row, i) => (
                <TableRow key={i}>
                  {cols.map((c, i) => (
                    <TableCell
                      key={c}
                      className={
                        dense
                          ? `max-w-[min(280px,40vw)] whitespace-pre-wrap break-words align-top text-xs ${i === 0 ? 'font-medium text-foreground' : 'tabular-nums'}`
                          : `max-w-[260px] truncate text-sm ${i === 0 ? 'font-medium' : 'tabular-nums'}`
                      }
                    >
                      {renderCell(c, row[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function reportPaginationNote(section: PaginatedSection | undefined): {
  pageInfo: string;
  truncated: boolean;
  emptyButTotal: string | null;
} {
  const total = section?.total ?? 0;
  const hasRows = (section?.rows?.length ?? 0) > 0;
  const pageInfo =
    section != null
      ? `Total en servidor: ${total} filas · página ${section.page} · ${section.limit} por página`
      : '';
  const truncated = section != null && total > section.rows.length;
  const emptyButTotal =
    section != null && !hasRows && total > 0 ? 'Hay datos en otras páginas: bajá “Página” a 1 o subí “Límite” (máx. 100).' : null;
  return { pageInfo, truncated, emptyButTotal };
}

function fmtMoney(v: unknown): string {
  const n = toNum(v);
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: unknown, frac: number): string {
  const n = toNum(v);
  return n.toLocaleString('es-AR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

/** Tabla fija para margen por cliente (resumen): lectura cómoda para gestión. */
function ClientMarginSummaryTable({
  section,
  id,
}: {
  section: PaginatedSection | undefined;
  id?: string;
}) {
  const { pageInfo, truncated, emptyButTotal } = reportPaginationNote(section);
  const rows = section?.rows ?? [];
  const hasRows = rows.length > 0;

  if (!section) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Margen por cliente — resumen</CardTitle>
          <CardDescription>Sin sección.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasRows) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Margen por cliente — resumen</CardTitle>
          <CardDescription className="text-muted-foreground">
            Totales por cliente: margen = ventas − costo total; últimas columnas son margen por caja y por lb.
          </CardDescription>
          <CardDescription>
            {section.total === 0
              ? 'Sin filas para estos filtros.'
              : `Sin filas en esta página (${pageInfo}).`}
            {emptyButTotal ? ` ${emptyButTotal}` : ''}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Margen por cliente — resumen</CardTitle>
        <CardDescription className="text-muted-foreground">
          Totales por cliente: margen = ventas − costo total; últimas columnas son margen por caja y por lb.
        </CardDescription>
        <CardDescription>
          {pageInfo}
          {truncated ? (
            <span className="mt-1 block text-amber-800">
              Mostrás {section.rows.length} de {section.total}. Para ver más en una sola respuesta, poné Página 1 y Límite
              100 en filtros, y volvé a generar.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <div className="max-h-[min(80vh,920px)] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-[1] min-w-[140px] bg-card text-xs shadow-sm">Cliente</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-xs shadow-sm">ID</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Cajas</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Lb</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Ventas</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Costo mat.</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Costo pack.</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Costo total</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Margen</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Margen / caja</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Margen / lb</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((raw, i) => {
                const r = raw as Record<string, unknown>;
                const margen = toNum(r.margen);
                return (
                  <TableRow key={`cms-${i}`}>
                    <TableCell className="max-w-[200px] text-sm font-medium">{toStr(r.cliente_nombre)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{toStr(r.cliente_id)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{formatLb(toNum(r.total_cajas), 2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{formatLb(toNum(r.total_lb), 2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.total_ventas)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.costo_materiales)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.costo_packing)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.costo_total)}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        margen < 0 ? 'text-destructive' : margen > 0 ? 'text-emerald-600' : '',
                      )}
                    >
                      {fmtMoney(r.margen)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatTechnical(toNum(r.margen_por_caja), 4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatTechnical(toNum(r.margen_por_lb), 4)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Detalle por formato dentro de cada cliente. */
function ClientMarginDetailTable({
  section,
  id,
}: {
  section: PaginatedSection | undefined;
  id?: string;
}) {
  const { pageInfo, truncated, emptyButTotal } = reportPaginationNote(section);
  const rows = section?.rows ?? [];
  const hasRows = rows.length > 0;

  if (!section) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Margen por cliente — detalle por formato</CardTitle>
          <CardDescription>Sin sección.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasRows) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Margen por cliente — detalle por formato</CardTitle>
          <CardDescription className="text-muted-foreground">
            Por cliente y <span className="font-mono">packaging_code</span>; la nota explica el prorrateo de costos del
            período.
          </CardDescription>
          <CardDescription>
            {section.total === 0
              ? 'Sin filas para estos filtros.'
              : `Sin filas en esta página (${pageInfo}).`}
            {emptyButTotal ? ` ${emptyButTotal}` : ''}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Margen por cliente — detalle por formato</CardTitle>
        <CardDescription className="text-muted-foreground">
          Por cliente y <span className="font-mono">packaging_code</span>; la nota explica el prorrateo de costos del
          período.
        </CardDescription>
        <CardDescription>
          {pageInfo}
          {truncated ? (
            <span className="mt-1 block text-amber-800">
              Mostrás {section.rows.length} de {section.total}. Para ver más en una sola respuesta, poné Página 1 y Límite
              100 en filtros, y volvé a generar.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <div className="max-h-[min(85vh,1200px)] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-[1] min-w-[120px] bg-card text-xs shadow-sm">Cliente</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-xs shadow-sm">ID</TableHead>
                <TableHead className="sticky top-0 z-[1] min-w-[100px] bg-card text-xs shadow-sm">Formato</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Cajas</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Lb</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Ventas</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Costo mat.</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Costo pack.</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Costo total</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Margen</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Margen / caja</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">Margen / lb</TableHead>
                <TableHead className="sticky top-0 z-[1] min-w-[220px] bg-card text-xs shadow-sm">Nota prorrateo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((raw, i) => {
                const r = raw as Record<string, unknown>;
                const margen = toNum(r.margen);
                return (
                  <TableRow key={`cmd-${i}`}>
                    <TableCell className="max-w-[180px] text-sm font-medium">{toStr(r.cliente_nombre)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{toStr(r.cliente_id)}</TableCell>
                    <TableCell className="max-w-[120px] font-mono text-xs">{toStr(r.format_code ?? '—')}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{formatLb(toNum(r.total_cajas), 2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{formatLb(toNum(r.total_lb), 2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.total_ventas)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.costo_materiales)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.costo_packing)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.costo_total)}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        margen < 0 ? 'text-destructive' : margen > 0 ? 'text-emerald-600' : '',
                      )}
                    >
                      {fmtMoney(r.margen)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatTechnical(toNum(r.margen_por_caja), 4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatTechnical(toNum(r.margen_por_lb), 4)}
                    </TableCell>
                    <TableCell className="max-w-[min(360px,40vw)] whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {toStr(r.nota_prorrateo)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  return v == null ? '—' : String(v);
}

type ExecutiveKpis = {
  cajasPtTotal: number;
  cajasDespachadasTotal: number;
  rendimientoPromedio: number | null;
  mermaRegistradaLb: number;
  formatosConConsumo: number;
  ventasPeriodo: number;
  costosPeriodo: number;
  margenTotal: number;
  productoresLiquidados: number;
  topClienteNombre: string | null;
  topClienteVentas: number;
};

function computeExecutiveKpis(d: GenerateResponse): ExecutiveKpis {
  const cajasPtTotal = (d.boxesByProducer?.rows ?? []).reduce(
    (s, r) => s + toNum((r as Record<string, unknown>).total_cajas),
    0,
  );
  const cajasDespachadasTotal = (d.dispatchedBoxesByProducer?.rows ?? []).reduce(
    (s, r) => s + toNum((r as Record<string, unknown>).cajas_despachadas),
    0,
  );
  const yw = d.yieldAndWaste?.rows ?? [];
  let rendimientoPromedio: number | null = null;
  if (yw.length) {
    const pesoSum = yw.reduce((s, r) => s + toNum((r as Record<string, unknown>).peso_procesado_total), 0);
    if (pesoSum > 0) {
      rendimientoPromedio =
        yw.reduce(
          (s, r) =>
            s + toNum((r as Record<string, unknown>).rendimiento_promedio) * toNum((r as Record<string, unknown>).peso_procesado_total),
          0,
        ) / pesoSum;
    } else {
      rendimientoPromedio =
        yw.reduce((s, r) => s + toNum((r as Record<string, unknown>).rendimiento_promedio), 0) / yw.length;
    }
  }
  const mermaRegistradaLb = yw.reduce((s, r) => s + toNum((r as Record<string, unknown>).merma_total_lb), 0);
  const formatosConConsumo = (d.packagingByFormat?.rows ?? []).filter(
    (r) => toNum((r as Record<string, unknown>).consumos) > 0,
  ).length;

  const sales = d.salesAndCostsByDispatch?.rows ?? [];
  const ventasPeriodo = sales.reduce((s, r) => s + toNum((r as Record<string, unknown>).total_ventas), 0);
  const costosPeriodo = sales.reduce((s, r) => s + toNum((r as Record<string, unknown>).total_costos), 0);

  const cms = d.clientMarginSummary?.rows ?? [];
  const margenTotal = cms.reduce((s, r) => s + toNum((r as Record<string, unknown>).margen), 0);
  let topClienteNombre: string | null = null;
  let topClienteVentas = 0;
  for (const raw of cms) {
    const r = raw as Record<string, unknown>;
    const v = toNum(r.total_ventas);
    if (v > topClienteVentas) {
      topClienteVentas = v;
      topClienteNombre = String(r.cliente_nombre ?? '—');
    }
  }

  const pss = d.producerSettlementSummary?.rows ?? [];
  const productoresLiquidados = pss.filter((raw) => {
    const pid = (raw as Record<string, unknown>).productor_id;
    return pid != null && pid !== '' && Number(pid) > 0;
  }).length;

  return {
    cajasPtTotal,
    cajasDespachadasTotal,
    rendimientoPromedio,
    mermaRegistradaLb,
    formatosConConsumo,
    ventasPeriodo,
    costosPeriodo,
    margenTotal,
    productoresLiquidados,
    topClienteNombre,
    topClienteVentas,
  };
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={kpiCardSm}>
      <p className={kpiLabel}>{label}</p>
      <p className={kpiValueMd}>{value}</p>
      {hint ? <p className={kpiFootnoteLead}>{hint}</p> : null}
    </div>
  );
}

function isSettlementUnassignedRow(r: Record<string, unknown>): boolean {
  const pid = r.productor_id;
  if (pid == null || pid === '') return true;
  const name = String(r.productor_nombre ?? '').toLowerCase();
  return name.includes('sin asignar') || name.includes('sin unidad');
}

/** Productores con id real en la liquidación actual (excluye «sin asignar» / incompleto). */
function selectExternalSettlementProducers(rows: Record<string, unknown>[]): Array<{ id: number; name: string }> {
  const out: Array<{ id: number; name: string }> = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    if (isSettlementUnassignedRow(r)) continue;
    const id = r.productor_id;
    if (id == null || id === '' || Number(id) <= 0) continue;
    out.push({ id: Number(id), name: String(r.productor_nombre ?? `#${id}`) });
  }
  return out;
}

/**
 * Especies con volumen en costo por formato que no tienen tarifa packing activa (>0) en el maestro.
 * Si el cierre usa precio manual (`manual_filter`), no aplica alerta.
 */
function speciesLabelsMissingActivePackingTariff(
  reportData: GenerateResponse,
  packingCosts: PackingCostRow[] | undefined,
): string[] {
  if (reportData.formatCostConfig?.packing_source === 'manual_filter') return [];
  const covered = new Set<number>();
  for (const pc of packingCosts ?? []) {
    if (pc.active && Number(pc.price_per_lb) > 0) covered.add(Number(pc.species_id));
  }
  const missingNames = new Set<string>();
  for (const raw of reportData.formatCostSummary?.rows ?? []) {
    const r = raw as Record<string, unknown>;
    if (toNum(r.cajas) <= 0) continue;
    const sid = r.species_id;
    if (sid == null || sid === '') continue;
    const n = Number(sid);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (covered.has(n)) continue;
    const label = r.species_name != null && String(r.species_name).trim() !== '' ? String(r.species_name) : `Especie #${n}`;
    missingNames.add(label);
  }
  return [...missingNames].sort((a, b) => a.localeCompare(b, 'es'));
}

/** `species_id` del costo por formato sin tarifa packing activa en el maestro (misma lógica que la lista por nombre). */
function speciesIdsMissingActivePackingTariff(
  reportData: GenerateResponse,
  packingCosts: PackingCostRow[] | undefined,
): number[] {
  if (reportData.formatCostConfig?.packing_source === 'manual_filter') return [];
  const covered = new Set<number>();
  for (const pc of packingCosts ?? []) {
    if (pc.active && Number(pc.price_per_lb) > 0) covered.add(Number(pc.species_id));
  }
  const missing = new Set<number>();
  for (const raw of reportData.formatCostSummary?.rows ?? []) {
    const r = raw as Record<string, unknown>;
    if (toNum(r.cajas) <= 0) continue;
    const sid = r.species_id;
    if (sid == null || sid === '') continue;
    const n = Number(sid);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!covered.has(n)) missing.add(n);
  }
  return [...missing];
}

/** Productores (fila resumen) sin ninguna línea en `producerSettlementDetail` para ese `productor_id`. */
function producerNamesMissingOperativeDetail(
  summaryRows: Record<string, unknown>[],
  detailRows: Record<string, unknown>[],
): string[] {
  const missing: string[] = [];
  for (const raw of summaryRows) {
    const r = raw as Record<string, unknown>;
    const pid = r.productor_id;
    const has = detailRows.some((d) => {
      if (pid == null || pid === '') return d.productor_id == null || d.productor_id === '';
      return Number(d.productor_id) === Number(pid);
    });
    if (!has) missing.push(String(r.productor_nombre ?? '—'));
  }
  return missing;
}

/** Productores con ventas &gt; 0 y costo materiales + packing ambos en $0 (misma página de resumen). */
function settlementProducerLabelsWithZeroCostsButSales(summaryRows: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const raw of summaryRows) {
    const r = raw as Record<string, unknown>;
    if (toNum(r.ventas) <= 0) continue;
    if (toNum(r.costo_materiales) === 0 && toNum(r.costo_packing) === 0) {
      out.push(String(r.productor_nombre ?? '—'));
    }
  }
  return out;
}

function informeProducerReadinessForCierre(
  reportData: GenerateResponse,
  producerId: number | null,
  packingManual: boolean,
): { ready: boolean; issues: string[] } {
  if (producerId == null) return { ready: false, issues: [] };
  const summaryRows = (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[];
  const r = summaryRows.find((raw) => Number((raw as Record<string, unknown>).productor_id) === producerId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return { ready: false, issues: ['Productor no figura en el resumen de esta página'] };
  const issues: string[] = [];
  const detailRows = (reportData.producerSettlementDetail?.rows ?? []) as Record<string, unknown>[];
  const hasDetail = detailRows.some((d) => Number(d.productor_id) === producerId);
  if (!hasDetail) issues.push('Sin detalle operativo');
  if (toNum(r.ventas) > 0 && toNum(r.cajas) > 0 && toNum(r.costo_materiales) === 0) issues.push('Materiales no calculados o en $0');
  if (!packingManual && toNum(r.lb) > 0 && toNum(r.costo_packing) === 0) issues.push('Packing no calculado o en $0');
  return { ready: issues.length === 0, issues };
}

/** KPI de liquidación: solo suma filas ya devueltas en producerSettlementSummary (misma página / respuesta). */
function computeLiquidacionKpis(summary: PaginatedSection | undefined) {
  const rows = summary?.rows ?? [];
  let ventas = 0;
  let cajas = 0;
  let lb = 0;
  let materiales = 0;
  let packing = 0;
  let netoSum = 0;
  let unassignedVentas = 0;
  let unassignedLb = 0;
  let unassignedCajas = 0;
  let unassignedCount = 0;
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    ventas += toNum(r.ventas);
    cajas += toNum(r.cajas);
    lb += toNum(r.lb);
    materiales += toNum(r.costo_materiales);
    packing += toNum(r.costo_packing);
    netoSum += toNum(r.neto_productor);
    if (isSettlementUnassignedRow(r)) {
      unassignedVentas += toNum(r.ventas);
      unassignedLb += toNum(r.lb);
      unassignedCajas += toNum(r.cajas);
      unassignedCount += 1;
    }
  }
  const costoTotal = materiales + packing;
  return {
    ventas,
    cajas,
    lb,
    materiales,
    packing,
    costoTotal,
    netoSum,
    unassignedVentas,
    unassignedLb,
    unassignedCajas,
    unassignedCount,
    rowCount: rows.length,
  };
}

function producerDetailKey(pid: unknown): string {
  if (pid == null || pid === '') return '__null';
  return String(pid);
}

type AuditSeverity = 'ok' | 'warn' | 'crit';

function detailProducerLabel(d: Record<string, unknown>): string {
  const n = d.productor_nombre;
  if (n != null && String(n).trim() !== '') return String(n).trim();
  const pid = d.productor_id;
  if (pid == null || pid === '') return 'Sin asignar';
  return `Productor #${pid}`;
}

function ratioSeverity(affected: number, total: number): AuditSeverity {
  if (affected <= 0) return 'ok';
  const t = Math.max(total, 1);
  const r = affected / t;
  if (affected >= 12 || r > 0.28) return 'crit';
  return 'warn';
}

type LiquidacionAuditPackingRow = {
  productor: string;
  formato: string;
  cajas: number;
  lb: number;
  packingActual: number;
  problema: string;
};

type LiquidacionAuditMaterialsRow = {
  productor: string;
  formato: string;
  cajas: number;
  materialActual: number;
  problema: string;
};

type LiquidacionAuditTraceRow = {
  productorEtiqueta: string;
  cajas: number;
  lb: number;
  ventas: number;
  problema: string;
};

/** Auditoría derivada solo de summary + detail (sin recalcular montos oficiales). */
function computeLiquidacionAudit(
  reportData: GenerateResponse,
  packingManual: boolean,
  speciesMissingTariffIds: Set<number>,
): {
  packing: {
    severity: AuditSeverity;
    affectedLines: number;
    producers: string[];
    formatos: string[];
    summaryLine: string;
    tableRows: LiquidacionAuditPackingRow[];
  };
  materials: {
    severity: AuditSeverity;
    affectedLines: number;
    producers: string[];
    formatos: string[];
    summaryLine: string;
    tableRows: LiquidacionAuditMaterialsRow[];
  };
  traceability: {
    severity: AuditSeverity;
    unassignedVentas: number;
    unassignedCajas: number;
    unassignedLb: number;
    summaryLine: string;
    tableRows: LiquidacionAuditTraceRow[];
    producersSinDetalle: string[];
  };
  exportGate: { severity: AuditSeverity; headline: string; subline: string };
  executive: {
    criticalPillars: number;
    warningPillars: number;
    affectedProducers: number;
    affectedFormatos: number;
  };
  /** Líneas de detalle con packing $0 y lb>0 (manual packing = no alerta). */
  producerLinePackingIssue: Set<string>;
  /** productor_id string key → tiene línea material $0 con cajas>0 */
  producerLineMaterialsIssue: Set<string>;
} {
  const summaryRows = (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[];
  const detailRows = (reportData.producerSettlementDetail?.rows ?? []) as Record<string, unknown>[];
  const nDetail = detailRows.length;

  const packingTable: LiquidacionAuditPackingRow[] = [];
  const materialsTable: LiquidacionAuditMaterialsRow[] = [];
  const traceTable: LiquidacionAuditTraceRow[] = [];
  const prodPacking = new Set<string>();
  const fmtPacking = new Set<string>();
  const prodMat = new Set<string>();
  const fmtMat = new Set<string>();
  const producerLinePackingIssue = new Set<string>();
  const producerLineMaterialsIssue = new Set<string>();

  const formatSpeciesId = new Map<string, number>();
  for (const raw of reportData.formatCostSummary?.rows ?? []) {
    const fr = raw as Record<string, unknown>;
    const code = String(fr.format_code ?? '').trim().toLowerCase();
    const sid = fr.species_id;
    if (!code || sid == null || sid === '') continue;
    const n = Number(sid);
    if (Number.isFinite(n) && n > 0) formatSpeciesId.set(code, n);
  }

  for (const raw of detailRows) {
    const d = raw as Record<string, unknown>;
    const prod = detailProducerLabel(d);
    const fmt = String(d.format_code ?? '').trim() || '(sin formato)';
    const fmtKey = fmt.toLowerCase();
    const cajas = toNum(d.cajas);
    const lb = toNum(d.lb);
    const ventas = toNum(d.ventas);
    const pack = toNum(d.costo_packing);
    const mat = toNum(d.costo_materiales);
    const pidKey = producerDetailKey(d.productor_id);

    if (!packingManual && lb > 0 && pack === 0) {
      packingTable.push({
        productor: prod,
        formato: fmt,
        cajas,
        lb,
        packingActual: pack,
        problema:
          speciesMissingTariffIds.size > 0 &&
          formatSpeciesId.has(fmtKey) &&
          speciesMissingTariffIds.has(formatSpeciesId.get(fmtKey)!)
            ? 'Packing en $0 con LB — especie del formato sin tarifa activa en maestro.'
            : 'Packing en $0 con LB — revisar tarifa, formato o trazabilidad.',
      });
      prodPacking.add(prod);
      fmtPacking.add(fmt);
      producerLinePackingIssue.add(pidKey);
    }

    if (cajas > 0 && mat === 0) {
      materialsTable.push({
        productor: prod,
        formato: fmt,
        cajas,
        materialActual: mat,
        problema: ventas > 0 ? 'Materiales en $0 con cajas y ventas — revisar receta/consumos.' : 'Materiales en $0 con cajas — revisar receta o formato.',
      });
      prodMat.add(prod);
      fmtMat.add(fmt);
      producerLineMaterialsIssue.add(pidKey);
    }

    const sinProd = d.productor_id == null || d.productor_id === '';
    if (sinProd && (ventas > 0 || cajas > 0 || lb > 0)) {
      traceTable.push({
        productorEtiqueta: 'Sin asignar (detalle)',
        cajas,
        lb,
        ventas,
        problema: 'Línea de despacho sin productor asignado.',
      });
    } else {
      const trace = pickSettlementSummaryTrace(d) ?? pickFieldDetailTrace(d);
      if (trace == null && ventas > 0) {
        traceTable.push({
          productorEtiqueta: prod,
          cajas,
          lb,
          ventas,
          problema: 'Sin nota de trazabilidad en la línea de detalle.',
        });
      }
    }
  }

  const producersSinDetalle: string[] = [];
  for (const raw of summaryRows) {
    const r = raw as Record<string, unknown>;
    const pid = r.productor_id;
    const has = detailRows.some((d) => {
      if (pid == null || pid === '') return d.productor_id == null || d.productor_id === '';
      return Number(d.productor_id) === Number(pid);
    });
    if (!has) producersSinDetalle.push(String(r.productor_nombre ?? '—'));
  }

  let unassignedVentas = 0;
  let unassignedCajas = 0;
  let unassignedLb = 0;
  for (const raw of summaryRows) {
    const r = raw as Record<string, unknown>;
    if (!isSettlementUnassignedRow(r)) continue;
    unassignedVentas += toNum(r.ventas);
    unassignedCajas += toNum(r.cajas);
    unassignedLb += toNum(r.lb);
    traceTable.push({
      productorEtiqueta: String(r.productor_nombre ?? 'Sin asignar'),
      cajas: toNum(r.cajas),
      lb: toNum(r.lb),
      ventas: toNum(r.ventas),
      problema: 'Resumen sin productor — ventas sin liquidar a nombre de productor.',
    });
  }

  const packSev = packingManual ? 'ok' : ratioSeverity(packingTable.length, Math.max(nDetail, 1));
  const matSev = ratioSeverity(materialsTable.length, Math.max(nDetail, 1));

  let traceSev: AuditSeverity = 'ok';
  if (unassignedVentas > 0 || unassignedCajas > 0 || traceTable.some((t) => t.productorEtiqueta.includes('Sin asignar'))) {
    traceSev = 'crit';
  } else if (producersSinDetalle.length > 0 || traceTable.length > 0) {
    traceSev = 'warn';
  }

  const packSummary =
    packingTable.length === 0
      ? packingManual
        ? 'Período con precio packing manual — no se audita tarifa por especie en líneas.'
        : 'Packing calculado en todas las líneas de detalle visibles.'
      : `Hay ${packingTable.length} línea(s) con packing en $0 y LB > 0. La liquidación puede sobrepagar productores.`;

  const matSummary =
    materialsTable.length === 0
      ? 'Materiales distintos de $0 en todas las líneas con cajas > 0 (según detalle cargado).'
      : `Hay formatos/líneas sin costo material. El neto productor puede estar inflado.`;

  const traceSummary =
    traceSev === 'crit'
      ? unassignedVentas > 0
        ? `Hay ventas sin asignar a productor (${fmtMoney(unassignedVentas)}). Revisar tarjas, proceso o repalet.`
        : 'Hay trazabilidad incompleta o sin asignar — revisar antes de cerrar.'
      : traceSev === 'warn'
        ? `Hay ${producersSinDetalle.length} productor(es) sin detalle operativo o notas faltantes en líneas.`
        : 'Trazabilidad completa en el alcance de esta página.';

  let exportSev: AuditSeverity = 'ok';
  let exportHead = 'Listo para enviar';
  let exportSub = 'No se detectaron faltantes críticos en packing, materiales ni trazabilidad (detalle cargado).';
  if (traceSev === 'crit') {
    exportSev = 'crit';
    exportHead = 'No recomendado exportar todavía';
    exportSub = 'Corregí asignación a productor o montos sin liquidar antes de entregar informes.';
  } else if (packSev === 'crit' || matSev === 'crit') {
    exportSev = 'crit';
    exportHead = 'No recomendado exportar todavía';
    exportSub = 'Muchas líneas con costos ausentes — el neto puede ser incorrecto.';
  } else if (packSev === 'warn' || matSev === 'warn' || traceSev === 'warn') {
    exportSev = 'warn';
    exportHead = 'Exportar con revisión';
    exportSub = 'Hay advertencias puntuales; conviene validar montos con el productor.';
  }

  const criticalPillars = [packSev, matSev, traceSev].filter((s) => s === 'crit').length;
  const warningPillars = [packSev, matSev, traceSev].filter((s) => s === 'warn').length;
  const affectedProducers = new Set([...prodPacking, ...prodMat, ...producersSinDetalle.filter((n) => n !== '—')]).size;
  const affectedFormatos = new Set([...fmtPacking, ...fmtMat]).size;

  return {
    packing: {
      severity: packSev,
      affectedLines: packingTable.length,
      producers: [...prodPacking].sort((a, b) => a.localeCompare(b, 'es')),
      formatos: [...fmtPacking].sort((a, b) => a.localeCompare(b, 'es')),
      summaryLine: packSummary,
      tableRows: packingTable,
    },
    materials: {
      severity: matSev,
      affectedLines: materialsTable.length,
      producers: [...prodMat].sort((a, b) => a.localeCompare(b, 'es')),
      formatos: [...fmtMat].sort((a, b) => a.localeCompare(b, 'es')),
      summaryLine: matSummary,
      tableRows: materialsTable,
    },
    traceability: {
      severity: traceSev,
      unassignedVentas,
      unassignedCajas,
      unassignedLb,
      summaryLine: traceSummary,
      tableRows: traceTable,
      producersSinDetalle,
    },
    exportGate: { severity: exportSev, headline: exportHead, subline: exportSub },
    executive: {
      criticalPillars,
      warningPillars,
      affectedProducers,
      affectedFormatos,
    },
    producerLinePackingIssue,
    producerLineMaterialsIssue,
  };
}

function pickFieldDetailTrace(row: Record<string, unknown>): string | null {
  const keys = ['nota_prorrateo', 'nota_trazabilidad', 'trace_note', 'fuente', 'resolution', 'resolución'];
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function producerAuditBadgesFromRow(args: {
  unassigned: boolean;
  hasDetailLines: boolean;
  pidKey: string;
  audit: ReturnType<typeof computeLiquidacionAudit>;
  summaryPackingZero: boolean;
  summaryMatZero: boolean;
  packingManual: boolean;
}): { visible: Array<{ key: string; label: string; className: string }>; overflow: number } {
  const { unassigned, hasDetailLines, pidKey, audit, summaryPackingZero, summaryMatZero, packingManual } = args;
  const all: Array<{ key: string; label: string; className: string; priority: number }> = [];
  if (unassigned) all.push({ key: 'u', label: 'Sin asignar', className: 'border-red-600 bg-red-600/10 text-[10px] font-bold text-red-900', priority: 5 });
  if (!hasDetailLines) all.push({ key: 'd', label: 'Sin detalle', className: 'border-amber-600 bg-amber-50 text-[10px] font-semibold text-amber-950', priority: 4 });
  if (!packingManual && (audit.producerLinePackingIssue.has(pidKey) || summaryPackingZero)) {
    all.push({ key: 'p', label: 'Falta packing', className: 'border-amber-700 bg-amber-50 text-[10px] font-medium text-amber-950', priority: 3 });
  }
  if (audit.producerLineMaterialsIssue.has(pidKey) || summaryMatZero) {
    all.push({ key: 'm', label: 'Falta materiales', className: 'border-amber-700 bg-amber-50 text-[10px] font-medium text-amber-950', priority: 2 });
  }
  if (all.length === 0) {
    all.push({ key: 'ok', label: 'OK', className: 'border-emerald-300 bg-emerald-50 text-[10px] font-medium text-emerald-900', priority: 0 });
  }
  all.sort((a, b) => b.priority - a.priority);
  const visible = all.slice(0, 2).map(({ key, label, className }) => ({ key, label, className }));
  const overflow = Math.max(0, all.length - 2);
  return { visible, overflow };
}

function informePerProducerExportTier(args: {
  producerId: number | null;
  readiness: { ready: boolean; issues: string[] };
  audit: ReturnType<typeof computeLiquidacionAudit>;
}): { tier: 'ok' | 'warn' | 'crit'; title: string; detailLines: string[] } {
  const { producerId, readiness, audit } = args;
  if (producerId == null) {
    return { tier: 'ok', title: '', detailLines: [] };
  }
  const pidKey = producerDetailKey(producerId);
  const linePacking = audit.producerLinePackingIssue.has(pidKey);
  const lineMat = audit.producerLineMaterialsIssue.has(pidKey);
  if (!readiness.ready) {
    return {
      tier: 'crit',
      title: 'No recomendado exportar',
      detailLines: readiness.issues,
    };
  }
  if (linePacking || lineMat) {
    const d: string[] = [];
    if (linePacking) d.push('Falta packing en alguna línea de despacho');
    if (lineMat) d.push('Falta materiales en alguna línea de despacho');
    return { tier: 'warn', title: 'Exportar con revisión', detailLines: d };
  }
  return { tier: 'ok', title: 'Listo para PDF productor', detailLines: [] };
}

function producerAuditPanelCopy(
  pidKey: string,
  audit: ReturnType<typeof computeLiquidacionAudit>,
  packingManual: boolean,
  hasDetailLines: boolean,
  summaryRow: Record<string, unknown>,
): { lines: string[]; okInforme: boolean } {
  const lines: string[] = [];
  const lb = toNum(summaryRow.lb);
  const packing0 = !packingManual && lb > 0 && toNum(summaryRow.costo_packing) === 0;
  const mat0 = toNum(summaryRow.costo_materiales) === 0 && toNum(summaryRow.ventas) > 0 && toNum(summaryRow.cajas) > 0;
  if (packing0) lines.push('Resumen: packing en $0 con LB — conviene revisar tarifas o formato.');
  if (mat0) lines.push('Resumen: materiales en $0 con ventas — conviene revisar recetas.');
  if (audit.producerLinePackingIssue.has(pidKey)) lines.push('Detalle: hay líneas con packing en $0 y LB > 0.');
  if (audit.producerLineMaterialsIssue.has(pidKey)) lines.push('Detalle: hay líneas con materiales en $0 y cajas > 0.');
  if (!hasDetailLines) lines.push('Sin detalle operativo para este productor en la respuesta.');
  if (lines.length === 0) lines.push('Sin observaciones del auditor en líneas de este productor.');
  const okInforme =
    hasDetailLines &&
    !packing0 &&
    !mat0 &&
    !audit.producerLinePackingIssue.has(pidKey) &&
    !audit.producerLineMaterialsIssue.has(pidKey);
  return { lines, okInforme };
}

function LiquidacionAuditorBlock({
  audit,
  packingManual,
}: {
  audit: ReturnType<typeof computeLiquidacionAudit>;
  packingManual: boolean;
}) {
  const ex = audit.executive;
  const anyIssues =
    audit.packing.tableRows.length + audit.materials.tableRows.length + audit.traceability.tableRows.length > 0 ||
    audit.traceability.producersSinDetalle.length > 0;
  const impactNote =
    audit.packing.affectedLines > 0 || audit.materials.affectedLines > 0
      ? 'Estos faltantes pueden aumentar artificialmente el neto productor mostrado.'
      : null;

  const pillar = (label: string, sev: AuditSeverity, body: string) => {
    const ring =
      sev === 'crit'
        ? 'border-red-300 bg-red-50/90'
        : sev === 'warn'
          ? 'border-amber-300 bg-amber-50/80'
          : 'border-emerald-200 bg-emerald-50/70';
    const dot = sev === 'crit' ? 'bg-red-500' : sev === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div className={cn('rounded-lg border px-2.5 py-2 text-[12px] leading-snug', ring)}>
        <div className="flex items-start gap-2">
          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />
          <div>
            <p className="font-semibold text-slate-900">{label}</p>
            <p className="mt-0.5 text-slate-800">{body}</p>
          </div>
        </div>
      </div>
    );
  };

  const exportRing =
    audit.exportGate.severity === 'crit'
      ? 'border-red-400 bg-red-50'
      : audit.exportGate.severity === 'warn'
        ? 'border-amber-400 bg-amber-50'
        : 'border-emerald-300 bg-emerald-50';

  return (
    <Card className="border-slate-300/80 bg-white shadow-sm" id="rep-cierre-auditor-liquidacion">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-900">Auditor de liquidación</CardTitle>
        <CardDescription className="max-w-[52rem] text-sm text-slate-700">
          Revisá costos, trazabilidad y datos incompletos antes de exportar informes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            Críticos: {ex.criticalPillars}
          </Badge>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            Advertencias: {ex.warningPillars}
          </Badge>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            Productores afectados: {ex.affectedProducers}
          </Badge>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            Formatos afectados: {ex.affectedFormatos}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {pillar('Tarifas packing', packingManual ? 'ok' : audit.packing.severity, audit.packing.summaryLine)}
          {pillar('Materiales / recetas', audit.materials.severity, audit.materials.summaryLine)}
          {pillar('Trazabilidad', audit.traceability.severity, audit.traceability.summaryLine)}
          <div className={cn('rounded-lg border px-2.5 py-2 text-[12px] leading-snug', exportRing)}>
            <p className="font-semibold text-slate-900">Listo para exportar</p>
            <p className="mt-0.5 font-medium text-slate-900">{audit.exportGate.headline}</p>
            <p className="mt-1 text-slate-800">{audit.exportGate.subline}</p>
          </div>
        </div>

        {impactNote ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/90 px-2 py-1.5 text-[11px] font-medium text-amber-950">
            {impactNote}
          </p>
        ) : null}

        <details className="rounded-md border border-slate-200 bg-slate-50/50 text-sm">
          <summary className="cursor-pointer list-none px-3 py-2 font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 text-slate-400">▸</span>
            Ver problemas detectados
          </summary>
          <div className="space-y-4 border-t border-slate-200 px-2 py-3 sm:px-3">
            {!anyIssues ? (
              <p className="text-xs font-medium text-emerald-900">No se detectaron problemas críticos.</p>
            ) : null}

            {audit.packing.tableRows.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Problemas de packing</p>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="text-xs">Productor</TableHead>
                        <TableHead className="text-xs">Formato</TableHead>
                        <TableHead className="text-right text-xs">Cajas</TableHead>
                        <TableHead className="text-right text-xs">LB</TableHead>
                        <TableHead className="text-right text-xs">Packing actual</TableHead>
                        <TableHead className="text-xs">Problema</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.packing.tableRows.slice(0, 80).map((row, i) => (
                        <TableRow key={`p-${i}`} className={tableBodyRow}>
                          <TableCell className="max-w-[9rem] truncate text-xs">{row.productor}</TableCell>
                          <TableCell className="font-mono text-xs">{row.formato}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.cajas, 2)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.lb, 2)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtMoney(row.packingActual)}</TableCell>
                          <TableCell className="max-w-[14rem] text-[11px] leading-snug text-slate-700">{row.problema}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {audit.packing.tableRows.length > 80 ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">Mostrando 80 de {audit.packing.tableRows.length} filas.</p>
                ) : null}
              </div>
            ) : null}

            {audit.materials.tableRows.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Problemas de materiales</p>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="text-xs">Productor</TableHead>
                        <TableHead className="text-xs">Formato</TableHead>
                        <TableHead className="text-right text-xs">Cajas</TableHead>
                        <TableHead className="text-right text-xs">Material actual</TableHead>
                        <TableHead className="text-xs">Problema</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.materials.tableRows.slice(0, 80).map((row, i) => (
                        <TableRow key={`m-${i}`} className={tableBodyRow}>
                          <TableCell className="max-w-[9rem] truncate text-xs">{row.productor}</TableCell>
                          <TableCell className="font-mono text-xs">{row.formato}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.cajas, 2)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtMoney(row.materialActual)}</TableCell>
                          <TableCell className="max-w-[14rem] text-[11px] leading-snug text-slate-700">{row.problema}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {audit.materials.tableRows.length > 80 ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">Mostrando 80 de {audit.materials.tableRows.length} filas.</p>
                ) : null}
              </div>
            ) : null}

            {audit.traceability.tableRows.length > 0 || audit.traceability.producersSinDetalle.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Problemas de trazabilidad</p>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="text-xs">Productor / Sin asignar</TableHead>
                        <TableHead className="text-right text-xs">Cajas</TableHead>
                        <TableHead className="text-right text-xs">LB</TableHead>
                        <TableHead className="text-right text-xs">Ventas</TableHead>
                        <TableHead className="text-xs">Problema</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.traceability.producersSinDetalle.map((name, i) => (
                        <TableRow key={`sd-${i}`} className={tableBodyRow}>
                          <TableCell className="max-w-[10rem] truncate text-xs font-medium">{name}</TableCell>
                          <TableCell className="text-right text-xs">—</TableCell>
                          <TableCell className="text-right text-xs">—</TableCell>
                          <TableCell className="text-right text-xs">—</TableCell>
                          <TableCell className="text-[11px] text-slate-700">Sin detalle operativo en la respuesta.</TableCell>
                        </TableRow>
                      ))}
                      {audit.traceability.tableRows.slice(0, 60).map((row, i) => (
                        <TableRow key={`t-${i}`} className={tableBodyRow}>
                          <TableCell className="max-w-[10rem] truncate text-xs">{row.productorEtiqueta}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.cajas, 2)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.lb, 2)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtMoney(row.ventas)}</TableCell>
                          <TableCell className="max-w-[16rem] text-[11px] leading-snug text-slate-700">{row.problema}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/** Nota técnica de trazabilidad en fila resumen si el backend la envía. */
function pickSettlementSummaryTrace(row: Record<string, unknown>): string | null {
  const keys = ['nota_trazabilidad', 'nota_prorrateo', 'trace_note', 'fuente', 'resolution', 'resolución'];
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function SettlementDetailByProducerTable({
  productorId,
  detailRows,
}: {
  productorId: unknown;
  detailRows: Record<string, unknown>[];
}) {
  function pickField(row: Record<string, unknown>, keys: string[]): unknown {
    for (const k of keys) {
      if (row[k] != null && String(row[k]).trim() !== '') return row[k];
    }
    return null;
  }
  const rows = detailRows.filter((d) => {
    if (productorId == null || productorId === '') return d.productor_id == null || d.productor_id === '';
    return Number(d.productor_id) === Number(productorId);
  });
  if (!rows.length) {
    return (
      <p className="border-t border-slate-100 bg-muted/20 px-3 py-3 text-sm leading-snug text-muted-foreground">
        No hay detalle operativo disponible para este productor en la respuesta actual.
      </p>
    );
  }
  const pickCliente = (r: Record<string, unknown>) =>
    pickField(r, ['cliente_nombre', 'client_name', 'cliente', 'nombre_cliente']);
  const pickInvoice = (r: Record<string, unknown>) =>
    pickField(r, ['invoice_number', 'invoice_id', 'numero_factura', 'factura']);
  const pickTrace = (r: Record<string, unknown>) =>
    pickField(r, ['nota_prorrateo', 'nota_trazabilidad', 'trace_note', 'resolución', 'fuente']);

  return (
    <div className="border-t border-slate-200 bg-slate-50/70">
      <div className="overflow-x-auto px-2 py-2">
        <Table>
          <TableHeader>
            <TableRow className={tableHeaderRow}>
              <TableHead className="text-xs">Despacho</TableHead>
              <TableHead className="text-xs">Factura</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Formato</TableHead>
              <TableHead className="text-right text-xs">Cajas</TableHead>
              <TableHead className="text-right text-xs">LB</TableHead>
              <TableHead className="text-right text-xs">Ventas</TableHead>
              <TableHead className="text-right text-xs">Materiales</TableHead>
              <TableHead className="text-right text-xs">Packing</TableHead>
              <TableHead className="text-right text-xs">Neto</TableHead>
              <TableHead className="min-w-[10rem] text-xs">Nota / trazabilidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((raw, i) => {
              const r = raw as Record<string, unknown>;
              const inv = pickInvoice(r);
              const cli = pickCliente(r);
              const trace =
                pickTrace(r) ||
                '(La asignación a productor se resolvió en el backend; revisá despacho en el ERP o el PDF interno si necesitás el detalle técnico.)';
              return (
                <TableRow key={i} className={tableBodyRow}>
                  <TableCell className="font-mono text-xs">{toStr(r.dispatch_id)}</TableCell>
                  <TableCell className="text-xs">{inv == null ? '—' : String(inv)}</TableCell>
                  <TableCell className="text-xs">{cli == null ? '—' : String(cli)}</TableCell>
                  <TableCell className="text-xs">{toStr(r.format_code)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQty(r.cajas, 2)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQty(r.lb, 2)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.ventas)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.costo_materiales)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.costo_packing)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.neto)}</TableCell>
                  <TableCell className="max-w-[22rem] whitespace-pre-wrap align-top text-[11px] text-slate-600">
                    {String(trace)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Validación visual previa a exportar (solo lectura de datos ya generados). */
function CierreEstadoDelCierreStrip({
  packingManual,
  missingTariffLabels,
  producersMissingDetail,
  informeProducerId,
  informeProducerReady,
  informeProducerIssues,
  zeroCostLines,
  kpisPackingZeroNoManual,
}: {
  packingManual: boolean;
  missingTariffLabels: string[];
  producersMissingDetail: string[];
  informeProducerId: number | null;
  informeProducerReady: boolean;
  informeProducerIssues: string[];
  zeroCostLines: string[];
  kpisPackingZeroNoManual: boolean;
}) {
  const tariffsOk = packingManual || missingTariffLabels.length === 0;
  const detailOk = producersMissingDetail.length === 0;
  const fmtList = (arr: string[], max = 4) => {
    if (arr.length === 0) return '—';
    if (arr.length <= max) return arr.join(', ');
    return `${arr.slice(0, max).join(', ')} (+${arr.length - max})`;
  };
  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50/90 px-3 py-2 shadow-sm"
      role="region"
      aria-label="Estado del cierre"
    >
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado del cierre</p>
      <ul className="grid gap-1.5 text-[12px] leading-snug text-slate-800">
        <li className="flex gap-2">
          {packingManual ? (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          ) : tariffsOk ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          )}
          <span>
            <span className="font-semibold text-slate-900">Tarifas packing.</span>{' '}
            {packingManual ? (
              <span className="text-muted-foreground">Neutro — precio manual; no aplica tarifa por especie.</span>
            ) : tariffsOk ? (
              <span className="text-emerald-900">Listo — todas las especies usadas tienen tarifa activa.</span>
            ) : (
              <span className="text-amber-950">
                Pendiente — faltan tarifas activas: <span className="font-medium text-red-900">{fmtList(missingTariffLabels)}</span>.
              </span>
            )}
          </span>
        </li>
        {!packingManual && missingTariffLabels.length > 0 ? (
          <li className="ml-6 border-l border-red-200 pl-2 text-[11px] text-red-950">
            <span className="font-semibold text-red-900">Impacto: </span>
            {missingTariffLabels.map((lab) => (
              <span key={lab} className="mt-0.5 block">
                Falta tarifa en <strong>{lab}</strong> → el packing por lb de esa especie no entra en la liquidación (puede figurar en $0).
              </span>
            ))}
          </li>
        ) : null}
        {kpisPackingZeroNoManual ? (
          <li className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <span className="text-red-950">
              <span className="font-semibold text-red-900">Packing global en $0.</span> Revisá tarifas por especie o datos de formato/LB
              en el período; el neto puede quedar inflado si el packing no se aplicó.
            </span>
          </li>
        ) : null}
        {zeroCostLines.length > 0 ? (
          <li className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <span>
              <span className="font-semibold text-red-900">Costos en $0 con ventas.</span>{' '}
              <span className="text-red-950">{fmtList(zeroCostLines, 3)}</span>
            </span>
          </li>
        ) : null}
        <li className="flex gap-2">
          {detailOk ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          )}
          <span>
            <span className="font-semibold text-slate-900">Detalle operativo.</span>{' '}
            {detailOk ? (
              <span className="text-emerald-900">Listo — todos los productores tienen líneas de detalle.</span>
            ) : (
              <span className="text-amber-950">
                Atención — sin detalle operativo en la respuesta: <span className="font-medium">{fmtList(producersMissingDetail)}</span>.
                El PDF puede quedar incompleto para esos casos.
              </span>
            )}
          </span>
        </li>
        <li className="flex gap-2">
          {informeProducerId == null ? (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          ) : informeProducerReady ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          )}
          <span>
            <span className="font-semibold text-slate-900">Informe productor.</span>{' '}
            {informeProducerId == null ? (
              <span className="text-muted-foreground">Elegí un productor para emitir informe individual.</span>
            ) : informeProducerReady ? (
              <span className="text-emerald-900">Listo para exportar PDF / Excel con los datos actuales.</span>
            ) : (
              <span className="text-red-950">
                Faltan datos: <span className="font-medium">{informeProducerIssues.join(' · ')}</span>
              </span>
            )}
          </span>
        </li>
      </ul>
    </div>
  );
}

/** Bloque pedagógico: mismo origen de datos que `formatCostSummary` y KPIs de liquidación (sin recalcular). */
function ComoSeCalculaElCostoCierreBlock({
  reportData,
  kpis,
}: {
  reportData: GenerateResponse;
  kpis: ReturnType<typeof computeLiquidacionKpis>;
}) {
  const manual = reportData.formatCostConfig?.packing_source === 'manual_filter';
  const rows = (reportData.formatCostSummary?.rows ?? []) as Record<string, unknown>[];
  const example = rows.find((raw) => toNum((raw as Record<string, unknown>).cajas) > 0) as Record<string, unknown> | undefined;
  const exLbPerCaja =
    example && toNum(example.cajas) > 0 ? toNum(example.lb ?? example.lb_totales) / toNum(example.cajas) : null;
  const exPackingLb = example ? toNum(example.precio_packing_por_lb) : null;
  return (
    <div className="rounded-md border border-indigo-200/80 bg-indigo-50/50 px-3 py-2 text-[12px] leading-snug text-indigo-950">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/90">Cómo se calcula el costo</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-indigo-400">
        <li>
          <strong>Materiales</strong>: desde recetas de embalaje por formato (consumos del sistema; no es un importe manual por
          productor).
        </li>
        <li>
          <strong>Packing</strong>: tarifa <span className="font-mono">$/lb</span> de la especie del formato
          {manual ? ' (en este período el filtro usa precio packing manual y reemplaza el maestro por especie).' : ' (maestro de tarifas packing por especie).'}
        </li>
        <li>
          <strong>Formato</strong>: los lb del período por caja acumulan packing en USD — más lb por caja implica más costo de
          packing para esas cajas.
        </li>
      </ul>
      <p className="mt-2 rounded border border-indigo-100/80 bg-white/90 px-2 py-1.5 text-[11px] text-slate-800">
        <span className="font-semibold text-slate-900">Costo por formato (según respuesta del API):</span>{' '}
        <span className="font-mono text-[11px]">materiales(receta) + (lb del formato × $/lb packing)</span>
        {example ? (
          <>
            <span className="mx-1 text-slate-500">· ejemplo</span>
            <span className="font-mono">{String(example.format_code)}</span>
            {exLbPerCaja != null ? (
              <>
                {' '}
                · <span className="font-mono">lb/caja ≈ {formatTechnical(exLbPerCaja, 3)}</span>
              </>
            ) : null}
            {exPackingLb != null && Number.isFinite(exPackingLb) && exPackingLb > 0 ? (
              <>
                {' '}
                · <span className="font-mono">$/lb = {formatTechnical(exPackingLb, 4)}</span>
              </>
            ) : !manual ? (
              <> · packing en $/lb puede ser 0 si falta tarifa o especie en el formato.</>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground"> Sin fila de costo por formato con cajas &gt; 0 en la página cargada.</span>
        )}
      </p>
      <p className="mt-2 text-[12px] text-indigo-950">
        <span className="font-semibold">Liquidación (suma filas visibles):</span>{' '}
        <span className="tabular-nums">{fmtMoney(kpis.ventas)}</span> −{' '}
        <span className="tabular-nums">{fmtMoney(kpis.materiales)}</span> −{' '}
        <span className="tabular-nums">{fmtMoney(kpis.packing)}</span> ={' '}
        <span className="font-semibold tabular-nums">{fmtMoney(kpis.netoSum)}</span>
        <span className="text-muted-foreground"> (neto productor).</span>
      </p>
    </div>
  );
}

/** Desglose por formato para un productor: agrega `producerSettlementDetail` y enriquece con `formatCostSummary`. */
function ProducerLiquidacionFormatBreakdownTable({
  productorIdRaw,
  unassigned,
  detailRows,
  formatCostSummaryRows,
  packingManual,
}: {
  productorIdRaw: unknown;
  unassigned: boolean;
  detailRows: Record<string, unknown>[];
  formatCostSummaryRows: Record<string, unknown>[];
  packingManual: boolean;
}) {
  const pid = productorIdRaw == null || productorIdRaw === '' ? null : Number(productorIdRaw);
  const aggRaw = aggregateDetailByFormatForProducer(
    unassigned ? null : pid,
    detailRows as CierreRawRow[],
    unassigned ? { unassigned: true } : undefined,
  );
  const agg = enrichFormatAggWithFormatCostSummary(aggRaw, formatCostSummaryRows as CierreRawRow[]);
  const fmtMeta = new Map<string, Record<string, unknown>>();
  for (const raw of formatCostSummaryRows) {
    const code = String((raw as Record<string, unknown>).format_code ?? '').trim().toLowerCase();
    if (code) fmtMeta.set(code, raw as Record<string, unknown>);
  }
  const formatWarnings: string[] = [];
  if (!agg.length) {
    return (
      <p className="px-2 py-2 text-xs text-muted-foreground">
        Sin filas agregables por formato para este productor en el detalle cargado.
      </p>
    );
  }
  for (const row of agg) {
    if (row.costo_materiales === 0 && row.cajas > 0 && row.ventas > 0) {
      formatWarnings.push(
        `Formato ${row.format_code}: materiales en $0 con ventas — revisá receta/consumos o notas del costo por formato.`,
      );
    }
    if (!packingManual && row.lb > 0 && row.costo_packing === 0) {
      formatWarnings.push(
        `Formato ${row.format_code}: packing en $0 con LB — puede faltar tarifa por especie o incompleta la trazabilidad de formato.`,
      );
    }
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className={tableHeaderRow}>
              <TableHead className="text-xs">Formato</TableHead>
              <TableHead className="text-right text-xs">Cajas</TableHead>
              <TableHead className="text-right text-xs">LB</TableHead>
              <TableHead className="text-right text-xs">Material/caja</TableHead>
              <TableHead className="text-right text-xs">Packing/caja</TableHead>
              <TableHead className="text-right text-xs">Total/caja</TableHead>
              <TableHead className="text-right text-xs">Material total</TableHead>
              <TableHead className="text-right text-xs">Packing total</TableHead>
              <TableHead className="text-right text-xs">Costo total</TableHead>
              <TableHead className="text-right text-xs">Neto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agg.map((row) => {
              const meta = fmtMeta.get(row.format_code);
              const species = meta?.species_name != null ? String(meta.species_name) : null;
              const matPerBox = row.cajas > 0 ? row.costo_materiales / row.cajas : null;
              const packingPerBox = row.cajas > 0 ? row.costo_packing / row.cajas : null;
              const totalPerBox = row.cajas > 0 ? row.costo_total / row.cajas : null;
              const neto = row.ventas - row.costo_total;
              return (
                <TableRow key={row.format_code} className={tableBodyRow}>
                  <TableCell className="max-w-[10rem] text-xs font-medium text-slate-900">
                    <span className="font-mono">{row.format_code}</span>
                    {species ? <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{species}</span> : null}
                    {matPerBox != null || packingPerBox != null || totalPerBox != null ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-600">
                        {`Material/caja ${matPerBox != null ? formatTechnical(matPerBox, 4) : '—'} + Packing/caja ${
                          packingPerBox != null ? formatTechnical(packingPerBox, 4) : '—'
                        } = Total/caja ${totalPerBox != null ? formatTechnical(totalPerBox, 4) : '—'}`}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.cajas, 2)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQty(row.lb, 2)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {matPerBox != null ? formatTechnical(matPerBox, 4) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {packingPerBox != null ? formatTechnical(packingPerBox, 4) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">
                    {totalPerBox != null ? formatTechnical(totalPerBox, 4) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(row.costo_materiales)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(row.costo_packing)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">{fmtMoney(row.costo_total)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMoney(neto)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {formatWarnings.length > 0 ? (
        <ul className="space-y-1 rounded border border-amber-200/80 bg-amber-50/80 px-2 py-1.5 text-[11px] text-amber-950">
          {formatWarnings.map((w, i) => (
            <li key={i} className="flex gap-1">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Vista principal financiera — liquidación (mismos datos que SectionTable + expand por detalle ya cargado). */
function LiquidacionFinalModule({
  reportData,
  summaryNote,
  expandProducerIdRequest,
  onExpandProducerHandled,
  packingTariffsManualMode,
  liquidacionAudit,
}: {
  reportData: GenerateResponse;
  summaryNote: { pageInfo: string; truncated: boolean; emptyButTotal: string | null };
  /** Al establecer un productor, se expande su fila y se hace scroll a esta sección (p. ej. desde «Informe por productor»). */
  expandProducerIdRequest?: number | null;
  onExpandProducerHandled?: () => void;
  packingTariffsManualMode: boolean;
  liquidacionAudit: ReturnType<typeof computeLiquidacionAudit> | null;
}) {
  const audit = useMemo(
    () =>
      liquidacionAudit ??
      computeLiquidacionAudit(reportData, packingTariffsManualMode, new Set<number>()),
    [liquidacionAudit, reportData, packingTariffsManualMode],
  );
  const summary = reportData.producerSettlementSummary;
  const detail = reportData.producerSettlementDetail;
  const kpis = useMemo(() => computeLiquidacionKpis(summary), [summary]);
  const detailRows = (detail?.rows ?? []) as Record<string, unknown>[];
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const totalVentas = kpis.ventas > 0 ? kpis.ventas : 1;
  const summaryRows = (summary?.rows ?? []) as Record<string, unknown>[];

  useEffect(() => {
    if (expandProducerIdRequest == null || expandProducerIdRequest <= 0) return;
    const rows = (summary?.rows ?? []) as Record<string, unknown>[];
    const idx = rows.findIndex((raw) => Number((raw as Record<string, unknown>).productor_id) === expandProducerIdRequest);
    if (idx < 0) {
      onExpandProducerHandled?.();
      return;
    }
    const r = rows[idx] as Record<string, unknown>;
    const rowKey = `${producerDetailKey(r.productor_id)}-${idx}`;
    setExpanded(new Set([rowKey]));
    onExpandProducerHandled?.();
    window.requestAnimationFrame(() => {
      document.getElementById('rep-cierre-liquidacion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [expandProducerIdRequest, summary, onExpandProducerHandled]);

  function toggleKey(k: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div id="rep-cierre-liquidacion" className="scroll-mt-24 space-y-4">
      <Card className="border-slate-300/90 bg-gradient-to-br from-slate-50 to-white shadow-md">
        <CardHeader className="pb-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ReportCategoryBadge kind="financiero" />
              <Badge variant="default" className="text-[10px] font-semibold uppercase tracking-wide">
                Liquidación
              </Badge>
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-900">Liquidación final</CardTitle>
            <CardDescription className="max-w-[52rem] text-sm leading-relaxed text-slate-700">
              Ventas − materiales (receta) − packing ($/lb × lb) = neto por productor. Usá el auditor de liquidación arriba y este
              resumen antes de exportar.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 border-t border-slate-200/80 pt-4">
          {!summaryRows.length ? (
            <p className="text-sm text-muted-foreground">
              {summary?.total === 0
                ? 'Sin liquidación para estos filtros (no hay líneas de factura en despachos del período).'
                : `${summaryNote.emptyButTotal ?? 'Generá de nuevo o subí el límite de filas.'} ${summaryNote.pageInfo}`}
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
                <KpiTile label="Ventas totales" value={fmtMoney(kpis.ventas)} />
                <KpiTile label="Cajas totales" value={fmtQty(kpis.cajas, 2)} />
                <KpiTile label="LB totales" value={fmtQty(kpis.lb, 2)} />
                <KpiTile label="Costo materiales" value={fmtMoney(kpis.materiales)} />
                <KpiTile label="Costo packing" value={fmtMoney(kpis.packing)} />
                <KpiTile
                  label="Neto productores"
                  value={fmtMoney(kpis.netoSum)}
                  hint="Suma de neto por fila (página cargada)."
                />
                <KpiTile
                  label="Sin asignar / incompleto"
                  value={
                    kpis.unassignedCount > 0
                      ? `${fmtMoney(kpis.unassignedVentas)} ventas · ${fmtQty(kpis.unassignedLb, 2)} lb`
                      : '—'
                  }
                  hint={
                    kpis.unassignedCount > 0 ? `${kpis.unassignedCount} fila(s) sin productor en resumen.` : 'Sin fila sin productor.'
                  }
                />
                <KpiTile
                  label="Costos totales (mat.+pack.)"
                  value={fmtMoney(kpis.costoTotal)}
                  hint="Suma sobre filas cargadas; coherente con ventas − netos."
                />
              </div>
              {kpis.unassignedCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2">
                  <Badge variant="outline" className="border-destructive/50 bg-destructive/10 text-[11px] text-destructive">
                    Sin asignar · revisión
                  </Badge>
                  <span className="text-xs text-amber-950">
                    Hay filas sin productor o incompletas. Revisá <strong className="font-medium">Diagnóstico de trazabilidad</strong>{' '}
                    más abajo en esta pantalla si los montos son relevantes.
                  </span>
                </div>
              ) : null}
              {summaryNote.truncated ? (
                <p className="text-xs text-amber-800">
                  KPIs y tabla muestran solo la página actual ({summaryNote.pageInfo}). Para totales globales poné página 1 y
                  límite 100 en filtros.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{summaryNote.pageInfo}</p>

              <ComoSeCalculaElCostoCierreBlock reportData={reportData} kpis={kpis} />

              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm open:border-slate-300">
                <summary className="cursor-pointer font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  Ver criterios (definición y fuentes)
                </summary>
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <ReportSemanticBlock helpId="liquidacion-interna" />
                </div>
              </details>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Por productor</p>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="max-w-full overflow-x-auto md:overflow-x-visible">
                    <Table className="table-fixed md:min-w-0 [&_tbody_tr:last-child_td]:border-0">
                      <TableHeader>
                        <TableRow className={tableHeaderRow}>
                          <TableHead className="min-w-0 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 md:w-[18%]">
                            Productor
                          </TableHead>
                          <TableHead className="w-[9%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Cajas
                          </TableHead>
                          <TableHead className="w-[11%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            LB
                          </TableHead>
                          <TableHead className="w-[17%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Ventas
                          </TableHead>
                          <TableHead className="w-[14%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Neto productor
                          </TableHead>
                          <TableHead className="w-[12%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Costo prom./caja
                          </TableHead>
                          <TableHead className="w-[11%] px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Estado
                          </TableHead>
                          <TableHead className="w-[11%] whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Acción
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryRows.map((raw, i) => {
                          const r = raw as Record<string, unknown>;
                          const rowKey = `${producerDetailKey(r.productor_id)}-${i}`;
                          const open = expanded.has(rowKey);
                          const pid = r.productor_id;
                          const unassigned = isSettlementUnassignedRow(r);
                          const pct = (toNum(r.ventas) / totalVentas) * 100;
                          const hasDetailLines = detailRows.some((d) => {
                            if (pid == null || pid === '') return d.productor_id == null || d.productor_id === '';
                            return Number(d.productor_id) === Number(pid);
                          });
                          const netoN = toNum(r.neto_productor);
                          const cajasN = toNum(r.cajas);
                          const costoTotalN = toNum(r.costo_total);
                          const costoPromCaja = cajasN > 0 ? costoTotalN / cajasN : null;
                          const summaryTrace = pickSettlementSummaryTrace(r);
                          const pidKey = producerDetailKey(pid);
                          const summaryPackingZero =
                            !packingTariffsManualMode && toNum(r.lb) > 0 && toNum(r.costo_packing) === 0;
                          const summaryMatZero =
                            toNum(r.costo_materiales) === 0 && toNum(r.ventas) > 0 && toNum(r.cajas) > 0;
                          const badgePack = producerAuditBadgesFromRow({
                            unassigned,
                            hasDetailLines,
                            pidKey,
                            audit,
                            summaryPackingZero,
                            summaryMatZero,
                            packingManual: packingTariffsManualMode,
                          });
                          const netoColor =
                            netoN > 0
                              ? 'text-emerald-700'
                              : netoN < 0
                                ? 'text-rose-700'
                                : 'text-slate-800';
                          return (
                            <Fragment key={rowKey}>
                              <TableRow
                                className={cn(
                                  tableBodyRow,
                                  open && 'bg-slate-50/70',
                                  unassigned ? 'border-l-4 border-l-amber-500 bg-amber-50/[0.45]' : '',
                                )}
                              >
                                <TableCell className="max-w-[1px] truncate px-3 py-2.5 align-middle text-sm font-medium text-slate-900 md:max-w-none">
                                  <span className="line-clamp-2 md:line-clamp-1 md:truncate" title={toStr(r.productor_nombre)}>
                                    {toStr(r.productor_nombre)}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-sm tabular-nums text-slate-800">{fmtQty(r.cajas, 2)}</TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-sm tabular-nums text-slate-800">{fmtQty(r.lb, 2)}</TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-sm tabular-nums text-slate-800">{fmtMoney(r.ventas)}</TableCell>
                                <TableCell className={cn('px-2 py-2.5 text-right align-middle text-sm tabular-nums font-bold md:text-[15px]', netoColor)}>
                                  {fmtMoney(r.neto_productor)}
                                </TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-xs tabular-nums text-slate-700">
                                  {costoPromCaja != null ? fmtMoney(costoPromCaja) : '—'}
                                </TableCell>
                                <TableCell className="px-2 py-2.5 align-middle">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {badgePack.visible.map((b) => (
                                      <Badge key={b.key} variant="outline" className={cn('pointer-events-none whitespace-nowrap', b.className)}>
                                        {b.label}
                                      </Badge>
                                    ))}
                                    {badgePack.overflow > 0 ? (
                                      <span className="text-[10px] font-medium text-muted-foreground">+{badgePack.overflow}</span>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={open ? 'secondary' : 'outline'}
                                    className="h-8 shrink-0 text-xs"
                                    onClick={() => toggleKey(rowKey)}
                                  >
                                    {open ? 'Ocultar' : 'Ver detalle'}
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {open ? (
                                <TableRow className="border-0 bg-slate-50/90 hover:bg-slate-50/90">
                                  <TableCell colSpan={8} className="p-0">
                                    <div className="border-t border-slate-200 px-3 py-3 sm:px-4 space-y-3">
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resumen</p>
                                      <p className="text-[13px] font-medium text-slate-800 md:text-center">
                                        <span className="text-muted-foreground">Ventas</span>{' '}
                                        <span className="tabular-nums">{fmtMoney(r.ventas)}</span>
                                        <span className="mx-2 text-slate-500">−</span>
                                        <span className="text-muted-foreground">Materiales</span>{' '}
                                        <span className="tabular-nums text-slate-700">{fmtMoney(r.costo_materiales)}</span>
                                        <span className="mx-2 text-slate-500">−</span>
                                        <span className="text-muted-foreground">Packing</span>{' '}
                                        <span className="tabular-nums text-slate-700">{fmtMoney(r.costo_packing)}</span>
                                        <span className="mx-2 font-semibold text-slate-500">=</span>
                                        <span className="text-muted-foreground">Neto</span>{' '}
                                        <span className={cn('tabular-nums font-bold', netoColor)}>{fmtMoney(r.neto_productor)}</span>
                                      </p>
                                      {!packingTariffsManualMode && toNum(r.lb) > 0 && toNum(r.costo_packing) === 0 ? (
                                        <p className="flex items-start gap-2 rounded border border-amber-300/80 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
                                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                                          <span>
                                            <strong>Packing no calculado</strong> (tarifa faltante, especie sin mapear o datos
                                            incompletos). El neto mostrado puede no incluir packing real para este productor.
                                          </span>
                                        </p>
                                      ) : null}
                                      {toNum(r.costo_materiales) === 0 && toNum(r.ventas) > 0 && toNum(r.cajas) > 0 ? (
                                        <p className="flex items-start gap-2 rounded border border-amber-300/80 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
                                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                                          <span>
                                            <strong>Materiales en $0</strong> con ventas y cajas — revisá recetas/consumos o líneas sin
                                            formato en el detalle.
                                          </span>
                                        </p>
                                      ) : null}
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Desglose</p>
                                      <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
                                        <div className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
                                          <p className="text-[10px] uppercase text-muted-foreground">Materiales</p>
                                          <p className="tabular-nums font-medium">{fmtMoney(r.costo_materiales)}</p>
                                        </div>
                                        <div className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
                                          <p className="text-[10px] uppercase text-muted-foreground">Packing</p>
                                          <p className="tabular-nums font-medium">{fmtMoney(r.costo_packing)}</p>
                                        </div>
                                        <div className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
                                          <p className="text-[10px] uppercase text-muted-foreground">Costo total</p>
                                          <p className="tabular-nums font-medium">{fmtMoney(r.costo_total)}</p>
                                        </div>
                                        <div className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
                                          <p className="text-[10px] uppercase text-muted-foreground">% participación</p>
                                          <p className="tabular-nums font-medium">{formatTechnical(pct, 2)}%</p>
                                          <p className="mt-0.5 text-[10px] text-muted-foreground">Sobre ventas del período (tabla).</p>
                                        </div>
                                      </div>
                                      {summaryTrace ? (
                                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                                          <span className="font-semibold text-slate-800">Fuente trazabilidad: </span>
                                          <span>{summaryTrace}</span>
                                        </div>
                                      ) : null}
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        Desglose por formato (mismo detalle, agregado)
                                      </p>
                                      <ProducerLiquidacionFormatBreakdownTable
                                        productorIdRaw={pid}
                                        unassigned={unassigned}
                                        detailRows={detailRows}
                                        formatCostSummaryRows={(reportData.formatCostSummary?.rows ?? []) as Record<string, unknown>[]}
                                        packingManual={packingTariffsManualMode}
                                      />
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        Auditoría del productor
                                      </p>
                                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs space-y-2">
                                        {(() => {
                                          const copy = producerAuditPanelCopy(
                                            pidKey,
                                            audit,
                                            packingTariffsManualMode,
                                            hasDetailLines,
                                            r as Record<string, unknown>,
                                          );
                                          return (
                                            <>
                                              <div className="flex flex-wrap gap-2">
                                                <Badge
                                                  variant="outline"
                                                  className={
                                                    copy.okInforme
                                                      ? 'border-emerald-300 bg-emerald-50 text-[10px] font-medium text-emerald-900'
                                                      : 'border-amber-600 bg-amber-50 text-[10px] font-semibold text-amber-950'
                                                  }
                                                >
                                                  {copy.okInforme ? 'Listo para informe' : 'Revisar antes de informe'}
                                                </Badge>
                                              </div>
                                              <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-slate-700">
                                                {copy.lines.map((line, li) => (
                                                  <li key={li}>{line}</li>
                                                ))}
                                              </ul>
                                            </>
                                          );
                                        })()}
                                      </div>
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        Detalle operativo
                                      </p>
                                      <div className="rounded-lg border border-dashed border-slate-300 bg-white">
                                        {!hasDetailLines ? (
                                          <p className="px-3 py-3 text-sm leading-snug text-muted-foreground">
                                            No hay detalle operativo disponible para este productor en la respuesta actual.
                                          </p>
                                        ) : (
                                          <SettlementDetailByProducerTable productorId={pid} detailRows={detailRows} />
                                        )}
                                      </div>
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
              </div>

              <details className="rounded-lg border border-dashed border-slate-200 bg-muted/25 px-3 py-2">
                <summary className="cursor-pointer list-none py-2 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="text-slate-400">▸</span> Tabla completa · detalle por despacho y formato (todas las columnas)
                </summary>
                <div className="border-t border-slate-200 pt-4">
                  <SectionTable
                    title="Liquidación — detalle por despacho y formato"
                    section={reportData.producerSettlementDetail}
                    dense
                    subtitle="Desglose por despacho y packaging_code; coincide con los detalles desplegables arriba."
                  />
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Texto orientativo sobre resolución de productor en liquidación (sin nuevos datos). */
function DiagnosticoTrazabilidadGuiaCard() {
  return (
    <Card className="border-slate-200/90 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-900">Diagnóstico de trazabilidad</CardTitle>
        <CardDescription className="max-w-[52rem] text-sm leading-relaxed">
          El sistema asigna cada línea de factura en un despacho a un productor (o a <strong>sin asignar</strong>) según cómo llegue la
          fruta hasta el pallet facturado. Estas etiquetas aparecen en el detalle técnico del backend y en PDF interno / tablas admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <ul className="list-disc space-y-1.5 pl-5 marker:text-slate-400">
          <li>
            <span className="font-mono text-xs">pt_tag_items</span> — cuando la línea lleva{' '}
            <span className="font-medium">tarja</span>: el productor sale de los ítems PT de esa unidad.
          </li>
          <li>
            <span className="font-mono text-xs">fruit_process_direct</span> / proceso en línea — si la factura declara proceso de fruta,
            se usa el <span className="font-medium">productor del proceso</span>.
          </li>
          <li>
            <span className="font-mono text-xs">final_pallet</span> / <span className="font-mono text-xs">repallet_multi_producer</span>{' '}
            — pallets resultantes de mezcla o repaletizado: los montos pueden <span className="font-medium">prorratearse</span> entre
            productores según cajas de procedencia.
          </li>
          <li>
            <span className="font-mono text-xs">sin_tarja</span> / sin asignar — sin unidad PT ni vínculo claro al proceso/productor en
            esa línea: las ventas y costos pueden acumular en{' '}
            <span className="font-medium">«sin unidad PT / sin asignar»</span> en la tabla de liquidación.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

/** Muestra primeras filas del bloque principal para validar antes de exportar. */
function ReportPreviewStrip({ data }: { data: GenerateResponse }) {
  const section = data.boxesByProducer;
  const rows = section?.rows ?? [];
  if (!rows.length) {
    return <div className={emptyStatePanel}>Sin filas en cajas PT para estos filtros.</div>;
  }
  const preview = rows.slice(0, 15);
  const cols = Object.keys(preview[0] ?? {});
  return (
    <div className="space-y-2">
      <div>
        <p className={sectionTitle}>Tabla resumida — Cajas PT por productor</p>
        <p className={sectionHint}>Primeras 15 filas del mismo payload generado</p>
      </div>
      <div className={cn(tableShell, 'overflow-x-auto')}>
        <Table>
          <TableHeader>
            <TableRow className={tableHeaderRow}>
              {cols.map((c) => (
                <TableHead key={c} className="whitespace-nowrap text-xs font-medium">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row, i) => (
              <TableRow key={i} className={tableBodyRow}>
                {cols.map((c) => (
                  <TableCell key={c} className="max-w-[240px] truncate text-sm tabular-nums">
                    {renderCell(c, (row as Record<string, unknown>)[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type UnifiedPreviewRow = {
  row_grain: string;
  row_id: string;
  pallet_id: string;
  invoice_id: string;
  producer_name: string;
  product_variety: string;
  boxes: string;
  net_weight: string;
  reference: string;
  is_mixed_line: string;
  line_candidate_count: string;
};

function pickAny(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return row[k];
  }
  return null;
}

function buildUnifiedPreviewRows(data: GenerateResponse | null): UnifiedPreviewRow[] {
  const fallback: UnifiedPreviewRow[] = [
    {
      row_grain: 'invoice_item',
      row_id: 'INV-1024',
      pallet_id: 'PF-30',
      invoice_id: 'FAC-00030',
      producer_name: 'Productor demo',
      product_variety: 'Arándano Legacy',
      boxes: '420',
      net_weight: '4,536.00',
      reference: 'PL-0008',
      is_mixed_line: 'No',
      line_candidate_count: '1',
    },
    {
      row_grain: 'final_pallet_line',
      row_id: 'FPL-778',
      pallet_id: 'PF-31',
      invoice_id: '—',
      producer_name: 'Pendiente trazabilidad',
      product_variety: 'Variedad por confirmar',
      boxes: '96',
      net_weight: '1,036.80',
      reference: 'Sin factura',
      is_mixed_line: 'Sí',
      line_candidate_count: '2',
    },
  ];
  if (!data) return fallback;
  const src =
    data.producerSettlementDetail?.rows?.length
      ? data.producerSettlementDetail.rows
      : data.boxesByProducerDetail?.rows?.length
        ? data.boxesByProducerDetail.rows
        : [];
  if (!src.length) return fallback;
  return src.slice(0, 10).map((raw, i) => {
    const row = raw as Record<string, unknown>;
    const boxes = Number(pickAny(row, ['cajas', 'total_cajas', 'cajas_despachadas']) ?? 0);
    const lb = Number(pickAny(row, ['lb', 'net_lb', 'pounds', 'peso_neto_lb']) ?? 0);
    const invoice = pickAny(row, ['invoice_number', 'invoice_id', 'dispatch_id']);
    const candidateCount = Number(pickAny(row, ['line_candidate_count']) ?? 1);
    return {
      row_grain: String(pickAny(row, ['row_grain']) ?? (invoice ? 'invoice_item' : 'final_pallet_line')),
      row_id: String(pickAny(row, ['row_id']) ?? `${invoice ? 'INV' : 'FPL'}-PRE-${i + 1}`),
      pallet_id: String(pickAny(row, ['final_pallet_id', 'pallet_id', 'tarja_id']) ?? '—'),
      invoice_id: String(invoice ?? '—'),
      producer_name: String(pickAny(row, ['productor_nombre', 'producer_name']) ?? '—'),
      product_variety: String(pickAny(row, ['variedad_nombre', 'variety_name', 'variedad', 'format_code']) ?? '—'),
      boxes: formatTechnical(boxes, 4),
      net_weight: formatTechnical(lb, 3),
      reference: String(pickAny(row, ['reference', 'packing_list_ref', 'nota_prorrateo']) ?? '—'),
      is_mixed_line: String(pickAny(row, ['is_mixed_line']) ?? (candidateCount > 1 ? 'Sí' : 'No')),
      line_candidate_count: String(candidateCount),
    };
  });
}

function UnifiedDatasetTechPreview({ data }: { data: GenerateResponse | null }) {
  const rows = useMemo(() => buildUnifiedPreviewRows(data), [data]);
  return (
    <details className="group mt-3 rounded-2xl border border-slate-200 bg-white/90 open:border-slate-300">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
        Dataset unificado PT/Despacho (preview técnico)
      </summary>
      <div className="border-t border-slate-100 px-4 py-3">
        <div className={cn(tableShell, 'overflow-x-auto')}>
          <Table>
            <TableHeader>
              <TableRow className={tableHeaderRow}>
                <TableHead>row_grain</TableHead>
                <TableHead>row_id</TableHead>
                <TableHead>pallet_id</TableHead>
                <TableHead>invoice_id</TableHead>
                <TableHead>producer_name</TableHead>
                <TableHead>product_variety</TableHead>
                <TableHead className="text-right">boxes</TableHead>
                <TableHead className="text-right">net_weight</TableHead>
                <TableHead>reference</TableHead>
                <TableHead>is_mixed_line</TableHead>
                <TableHead className="text-right">line_candidate_count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.row_id} className={tableBodyRow}>
                  <TableCell>{r.row_grain}</TableCell>
                  <TableCell className="font-mono text-xs">{r.row_id}</TableCell>
                  <TableCell>{r.pallet_id}</TableCell>
                  <TableCell>{r.invoice_id}</TableCell>
                  <TableCell>{r.producer_name}</TableCell>
                  <TableCell>{r.product_variety}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.net_weight}</TableCell>
                  <TableCell>{r.reference}</TableCell>
                  <TableCell>{r.is_mixed_line}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.line_candidate_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </details>
  );
}

function FormatCostGrouped({
  summary,
  lines,
}: {
  summary: PaginatedSection | undefined;
  lines: PaginatedSection | undefined;
}) {
  if (!summary?.rows?.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Costo por formato — detalle por receta (agrupado)</CardTitle>
          <CardDescription>Sin filas visibles para los filtros aplicados (o todas con cajas = 0 si ocultaste esas filas).</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const linesByFormat = new Map<string, Record<string, unknown>[]>();
  for (const r of lines?.rows ?? []) {
    const k = String(r.format_code ?? '');
    if (!linesByFormat.has(k)) linesByFormat.set(k, []);
    linesByFormat.get(k)!.push(r);
  }

  return (
    <div className="space-y-4">
      {summary.rows.map((s, idx) => {
        const formatCode = String(s.format_code ?? `fmt-${idx}`);
        const detail = linesByFormat.get(formatCode) ?? [];
        const lb = toNum(s.lb ?? s.lb_totales);
        const costoMateriales = toNum(s.costo_materiales ?? s.subtotal_materiales);
        return (
          <Card key={`${formatCode}-${idx}`}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Formato {formatCode} — recetas y consumo</CardTitle>
                <Badge variant="outline">cajas {formatLb(toNum(s.cajas), 2)}</Badge>
                <Badge variant="outline">lb {formatLb(lb, 2)}</Badge>
                <Badge variant="outline">materiales {formatMoney(costoMateriales)}</Badge>
                <Badge variant="outline">packing {formatMoney(toNum(s.costo_packing))}</Badge>
                <Badge variant="outline">total {formatMoney(toNum(s.costo_total))}</Badge>
                <Badge variant="outline">costo/caja {formatTechnical(toNum(s.costo_por_caja), 4)}</Badge>
              </div>
              <CardDescription>
                Financiero (facturación del período + recetas + packing por especie vía costo/caja): cajas{' '}
                {formatLb(toNum(s.cajas), 2)} · lb {formatLb(lb, 2)} · costo_materiales {formatMoney(costoMateriales)} ·
                costo_packing {formatMoney(toNum(s.costo_packing))} · costo_total {formatMoney(toNum(s.costo_total))} ·
                costo_por_caja {formatTechnical(toNum(s.costo_por_caja), 4)}
              </CardDescription>
              {s.warning ? (
                <p className="text-xs text-amber-800">{toStr(s.warning)}</p>
              ) : null}
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-muted px-2 py-1">
                  precio cliente: {s.precio_cliente == null ? '—' : formatTechnical(toNum(s.precio_cliente), 4)}
                </span>
                <span className="rounded-md bg-muted px-2 py-1">
                  delta/caja: {s.delta_por_caja == null ? '—' : formatTechnical(toNum(s.delta_por_caja), 4)}
                </span>
                <span className="rounded-md bg-muted px-2 py-1">
                  margen total: {s.margen_total == null ? '—' : formatMoney(toNum(s.margen_total))}
                </span>
              </div>
              {detail.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin líneas de receta para este formato.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Cant. receta</TableHead>
                      <TableHead>Factor/caja</TableHead>
                      <TableHead>Consumo total</TableHead>
                      <TableHead>Costo unit.</TableHead>
                      <TableHead>Costo total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.map((d, i) => (
                      <TableRow key={`${formatCode}-line-${i}`}>
                        <TableCell>
                          {toStr(d.material)} <span className="text-xs text-muted-foreground">({toStr(d.unidad_medida)})</span>
                          {d.warning ? <p className="text-[11px] text-amber-800">{toStr(d.warning)}</p> : null}
                        </TableCell>
                        <TableCell>{toStr(d.tipo)}</TableCell>
                        <TableCell>{toStr(d.base_unidad)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatTechnical(toNum(d.cantidad_receta), 4)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatTechnical(toNum(d.factor_por_caja), 6)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatTechnical(toNum(d.consumo_total), 4)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatTechnical(toNum(d.costo_unitario), 4)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatMoney(toNum(d.costo_total))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FormatCostOperational({
  summary,
}: {
  summary: PaginatedSection | undefined;
}) {
  if (!summary?.rows?.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Costo por formato — tabla resumen</CardTitle>
          <CardDescription>Sin filas para los filtros aplicados (o todas con cajas = 0 si las ocultaste).</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Costo por formato — tabla resumen</CardTitle>
        <CardDescription>
          Financiero: volumen y costos por código de formato según <strong>facturación del período</strong>, recetas de
          empaque y <strong>precio packing por lb</strong> por especie (tabla de abajo o filtro manual). No es costo de
          planta física ni stock.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Formato</TableHead>
              <TableHead>Cajas</TableHead>
              <TableHead>Lb</TableHead>
              <TableHead>Costo materiales</TableHead>
              <TableHead>Costo packing</TableHead>
              <TableHead>Costo total</TableHead>
              <TableHead>Material/caja</TableHead>
              <TableHead>Packing/caja</TableHead>
              <TableHead>Total/caja</TableHead>
              <TableHead>Material/lb</TableHead>
              <TableHead>Packing/lb</TableHead>
              <TableHead>Total/lb</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((r, i) => {
              const lb = toNum(r.lb ?? r.lb_totales);
              const costoMateriales = toNum(r.costo_materiales ?? r.subtotal_materiales);
              const cajas = toNum(r.cajas);
              const costoPacking = toNum(r.costo_packing);
              const costoTotal = toNum(r.costo_total);
              const materialPerBox = cajas > 0 ? costoMateriales / cajas : null;
              const packingPerBox = cajas > 0 ? costoPacking / cajas : null;
              const totalPerBox = cajas > 0 ? costoTotal / cajas : null;
              const materialPerLb = lb > 0 ? costoMateriales / lb : null;
              const packingPerLb = lb > 0 ? costoPacking / lb : null;
              const totalPerLb = lb > 0 ? costoTotal / lb : null;
              return (
                <TableRow key={`ops-${i}`}>
                  <TableCell className="font-medium">{toStr(r.format_code)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatLb(cajas, 2)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatLb(lb, 2)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(costoMateriales)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(costoPacking)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(costoTotal)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{materialPerBox != null ? formatTechnical(materialPerBox, 4) : '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{packingPerBox != null ? formatTechnical(packingPerBox, 4) : '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums font-semibold">{totalPerBox != null ? formatTechnical(totalPerBox, 4) : '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{materialPerLb != null ? formatTechnical(materialPerLb, 6) : '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{packingPerLb != null ? formatTechnical(packingPerLb, 6) : '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums font-semibold">{totalPerLb != null ? formatTechnical(totalPerLb, 6) : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function renderCell(columnKey: string, v: unknown): string {
  return formatReportCell(columnKey, v);
}

function fetchSavedReports() {
  return apiJson<SavedReportRow[]>('/api/reporting/saved-reports');
}

function numOr(v: unknown, fallback: number): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function recordToReportFilters(r: Record<string, unknown>): ReportFilters {
  return {
    page: Math.max(1, numOr(r.page, 1)),
    limit: Math.min(100, Math.max(1, numOr(r.limit, 100))),
    productor_id: r.productor_id != null && r.productor_id !== '' ? numOr(r.productor_id, 0) || undefined : undefined,
    cliente_id: r.cliente_id != null && r.cliente_id !== '' ? numOr(r.cliente_id, 0) || undefined : undefined,
    variedad_id: r.variedad_id != null && r.variedad_id !== '' ? numOr(r.variedad_id, 0) || undefined : undefined,
    tarja_id: r.tarja_id != null && r.tarja_id !== '' ? numOr(r.tarja_id, 0) || undefined : undefined,
    format_code: typeof r.format_code === 'string' ? r.format_code : undefined,
    precio_packing_por_lb: r.precio_packing_por_lb != null && r.precio_packing_por_lb !== '' ? numOr(r.precio_packing_por_lb, 0) : undefined,
    fecha_desde: typeof r.fecha_desde === 'string' ? r.fecha_desde : undefined,
    fecha_hasta: typeof r.fecha_hasta === 'string' ? r.fecha_hasta : undefined,
    calidad: typeof r.calidad === 'string' ? r.calidad : undefined,
  };
}

function parsePayload(p: Record<string, unknown>): GenerateResponse | null {
  const keys = [
    'boxesByProducer',
    'plant_thresholds',
    'palletCosts',
    'yieldAndWaste',
    'salesAndCostsByDispatch',
    'packagingByFormat',
    'formatCostSummary',
    'formatCostLines',
  ] as const;
  for (const k of keys) {
    const v = p[k];
    if (v == null || typeof v !== 'object') return null;
  }
  const base = p as unknown as GenerateResponse;
  const f = (base.filters ?? {}) as Record<string, unknown>;
  const page = Math.max(1, numOr(f.page, 1));
  const limit = Math.min(100, Math.max(1, numOr(f.limit, 100)));
  const emptyPaginated = (): PaginatedSection => ({ rows: [], total: 0, page, limit });
  /** Snapshots viejos no traían liquidación; sin esto la UI muestra "Sin sección." en lugar de tabla vacía. */
  return {
    ...base,
    producerSettlementSummary: base.producerSettlementSummary ?? emptyPaginated(),
    producerSettlementDetail: base.producerSettlementDetail ?? emptyPaginated(),
    clientMarginSummary: base.clientMarginSummary ?? emptyPaginated(),
    clientMarginDetail: base.clientMarginDetail ?? emptyPaginated(),
    boxesByProducerDetail: base.boxesByProducerDetail ?? emptyPaginated(),
    dispatchedBoxesByProducer: base.dispatchedBoxesByProducer ?? emptyPaginated(),
  };
}

export function ReportingPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const canSave = role === 'admin' || role === 'supervisor';
  const canDelete = role === 'admin';
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<ReportFilters>({
    page: 1,
    limit: 100,
  });
  const [draft, setDraft] = useState<Partial<ReportFilters>>({});
  const [reportData, setReportData] = useState<GenerateResponse | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [activeSavedId, setActiveSavedId] = useState<number | null>(null);
  const [renameTarget, setRenameTarget] = useState<SavedReportRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [packingSpeciesId, setPackingSpeciesId] = useState<number>(0);
  const [packingSeason, setPackingSeason] = useState('');
  const [packingPrice, setPackingPrice] = useState('');
  const [packingActive, setPackingActive] = useState(true);
  const [reportTab, setReportTab] = useState<ReportModuleTab>('cierre');
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Productor elegido solo para informe PDF/Excel por productor en Cierre (no altera el generado global). */
  const [cierreInformeProducerId, setCierreInformeProducerId] = useState<number | null>(null);
  const [producerRowExpandRequest, setProducerRowExpandRequest] = useState<number | null>(null);

  useEffect(() => {
    setFiltersOpen(reportTab === 'documentos');
  }, [reportTab]);

  useEffect(() => {
    if (!reportData || cierreInformeProducerId == null) return;
    const opts = selectExternalSettlementProducers(
      (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[],
    );
    if (!opts.some((o) => o.id === cierreInformeProducerId)) setCierreInformeProducerId(null);
  }, [reportData, cierreInformeProducerId]);

  /** Costo por formato: ocultar filas con cajas = 0 por defecto (misma fuente que facturación del período). */
  const [showAllFormatCostRows, setShowAllFormatCostRows] = useState(false);
  const [showInactivePackingCosts, setShowInactivePackingCosts] = useState(false);
  const [hiddenPackingSpeciesIds, setHiddenPackingSpeciesIds] = useState<Set<number>>(() => loadHiddenPackingSpeciesIds());

  useEffect(() => {
    localStorage.setItem(PACKING_HIDDEN_SPECIES_LS, JSON.stringify([...hiddenPackingSpeciesIds]));
  }, [hiddenPackingSpeciesIds]);

  const reportFiltersForPdf = useMemo(() => {
    if (!reportData?.filters) return null;
    return recordToReportFilters(reportData.filters as Record<string, unknown>);
  }, [reportData]);

  const { data: savedList, isPending: savedLoading } = useQuery({
    queryKey: ['reporting', 'saved'],
    queryFn: fetchSavedReports,
  });

  const { data: species } = useQuery({
    queryKey: ['masters', 'species'],
    queryFn: () => apiJson<SpeciesRow[]>('/api/masters/species'),
  });

  const { data: packingCosts, isPending: packingCostsLoading } = useQuery({
    queryKey: ['reporting', 'packing-costs'],
    queryFn: () => apiJson<PackingCostRow[]>('/api/reporting/packing-costs'),
  });

  const { data: mpContextDecision, isPending: mpContextDecisionPending } = useQuery({
    queryKey: ['processes', 'mp-disponible-eod-resumen', 'planning-eod'],
    queryFn: fetchMpDisponibleProcesoResumenForReports,
    staleTime: 120_000,
    enabled: reportTab === 'decision',
  });

  const formatCostSummaryForDisplay = useMemo(() => {
    const s = reportData?.formatCostSummary;
    if (!s) return undefined;
    if (showAllFormatCostRows) return s;
    const rows = s.rows.filter((r) => toNum(r.cajas) > 0);
    return { ...s, rows, total: rows.length };
  }, [reportData?.formatCostSummary, showAllFormatCostRows]);

  const hasFormatCostOnlyZeros =
    !showAllFormatCostRows &&
    (reportData?.formatCostSummary?.rows?.length ?? 0) > 0 &&
    (formatCostSummaryForDisplay?.rows?.length ?? 0) === 0;

  const visiblePackingCosts = useMemo(() => {
    let rows = packingCosts ?? [];
    rows = rows.filter((r) => !hiddenPackingSpeciesIds.has(r.species_id));
    if (!showInactivePackingCosts) rows = rows.filter((r) => r.active);
    return rows;
  }, [packingCosts, hiddenPackingSpeciesIds, showInactivePackingCosts]);

  const executiveKpis = useMemo(() => (reportData ? computeExecutiveKpis(reportData) : null), [reportData]);

  const cierreProducerOptions = useMemo(
    () =>
      reportData
        ? selectExternalSettlementProducers((reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[])
        : [],
    [reportData],
  );

  const cierreMissingTariffSpecies = useMemo(
    () => (reportData ? speciesLabelsMissingActivePackingTariff(reportData, packingCosts) : []),
    [reportData, packingCosts],
  );

  const cierreMissingSpeciesIdSet = useMemo(
    () => new Set(reportData ? speciesIdsMissingActivePackingTariff(reportData, packingCosts) : []),
    [reportData, packingCosts],
  );

  const cierrePackingManualMode = reportData?.formatCostConfig?.packing_source === 'manual_filter';

  const cierreProducersMissingDetail = useMemo(
    () =>
      reportData
        ? producerNamesMissingOperativeDetail(
            (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[],
            (reportData.producerSettlementDetail?.rows ?? []) as Record<string, unknown>[],
          )
        : [],
    [reportData],
  );

  const cierreZeroCostLines = useMemo(
    () =>
      reportData
        ? settlementProducerLabelsWithZeroCostsButSales(
            (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[],
          )
        : [],
    [reportData],
  );

  const cierreKpisPackingZeroNoManual = useMemo(() => {
    if (!reportData || cierrePackingManualMode) return false;
    const kpis = computeLiquidacionKpis(reportData.producerSettlementSummary);
    return kpis.packing === 0 && (kpis.ventas > 0 || kpis.lb > 0);
  }, [reportData, cierrePackingManualMode]);

  const cierreInformeReadiness = useMemo(() => {
    if (!reportData) return { ready: false, issues: [] as string[] };
    return informeProducerReadinessForCierre(reportData, cierreInformeProducerId, !!cierrePackingManualMode);
  }, [reportData, cierreInformeProducerId, cierrePackingManualMode]);

  const liquidacionAudit = useMemo(() => {
    if (!reportData) return null;
    return computeLiquidacionAudit(reportData, !!cierrePackingManualMode, cierreMissingSpeciesIdSet);
  }, [reportData, cierrePackingManualMode, cierreMissingSpeciesIdSet]);

  const informeExportVisual = useMemo(() => {
    if (!liquidacionAudit || cierreInformeProducerId == null) {
      return { tier: 'none' as const, title: '', detailLines: [] as string[] };
    }
    return informePerProducerExportTier({
      producerId: cierreInformeProducerId,
      readiness: cierreInformeReadiness,
      audit: liquidacionAudit,
    });
  }, [liquidacionAudit, cierreInformeProducerId, cierreInformeReadiness]);

  const generateMut = useMutation({
    mutationFn: async (f: ReportFilters) => {
      const q = toQuery({
        ...f,
        productor_id: f.productor_id || undefined,
        cliente_id: f.cliente_id || undefined,
        variedad_id: f.variedad_id || undefined,
        tarja_id: f.tarja_id || undefined,
        format_code: f.format_code || undefined,
        precio_packing_por_lb: f.precio_packing_por_lb ?? undefined,
        fecha_desde: f.fecha_desde || undefined,
        fecha_hasta: f.fecha_hasta || undefined,
        calidad: f.calidad || undefined,
      });
      return apiJson<GenerateResponse>(`/api/reporting/generate?${q}`);
    },
    onSuccess: (data) => {
      setReportData(data);
      setGenerateError(null);
      setActiveSavedId(null);
      setDraft(recordToReportFilters(data.filters as Record<string, unknown>));
      toast.success('Reporte generado');
    },
    onError: (e: Error) => {
      setReportData(null);
      setGenerateError(e.message);
      toast.error(e.message);
    },
  });

  const saveMut = useMutation({
    mutationFn: () => {
      if (!reportData) throw new Error('Generá un reporte primero');
      return apiJson('/api/reporting/saved-reports', {
        method: 'POST',
        body: JSON.stringify({
          report_name: saveName.trim(),
          filters: reportData.filters as Record<string, unknown>,
          payload: reportData as unknown as Record<string, unknown>,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporting', 'saved'] });
      toast.success('Reporte guardado');
      setSaveOpen(false);
      setSaveName('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/reporting/saved-reports/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['reporting', 'saved'] });
      toast.success('Eliminado');
      setActiveSavedId((cur) => (cur === id ? null : cur));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: ({ row, name }: { row: SavedReportRow; name: string }) =>
      apiJson(`/api/reporting/saved-reports/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          report_name: name.trim(),
          filters: row.filters,
          payload: row.payload,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporting', 'saved'] });
      toast.success('Nombre actualizado');
      setRenameTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: (row: SavedReportRow) => {
      if (!reportData) throw new Error('Generá o cargá un reporte antes');
      return apiJson(`/api/reporting/saved-reports/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          report_name: row.report_name,
          filters: reportData.filters as Record<string, unknown>,
          payload: reportData as unknown as Record<string, unknown>,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporting', 'saved'] });
      toast.success('Guardado actualizado con la vista en pantalla');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertPackingCostMut = useMutation({
    mutationFn: () =>
      apiJson('/api/reporting/packing-costs', {
        method: 'POST',
        body: JSON.stringify({
          species_id: packingSpeciesId,
          season: packingSeason || undefined,
          price_per_lb: Number(packingPrice),
          active: packingActive,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporting', 'packing-costs'] });
      toast.success('Costo packing guardado');
      setPackingSpeciesId(0);
      setPackingSeason('');
      setPackingPrice('');
      setPackingActive(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function runMergedGenerate() {
    const next: ReportFilters = {
      ...filters,
      ...draft,
      page: Math.max(1, numOr(draft.page, filters.page)),
      limit: Math.min(100, Math.max(1, numOr(draft.limit, filters.limit))),
      fecha_desde: draft.fecha_desde ?? filters.fecha_desde,
      fecha_hasta: draft.fecha_hasta ?? filters.fecha_hasta,
      format_code:
        draft.format_code !== undefined ? draft.format_code.trim() || undefined : filters.format_code,
      calidad: draft.calidad !== undefined ? draft.calidad.trim() || undefined : filters.calidad,
      productor_id: draft.productor_id ?? filters.productor_id,
      cliente_id: draft.cliente_id ?? filters.cliente_id,
      variedad_id: draft.variedad_id ?? filters.variedad_id,
      tarja_id: draft.tarja_id ?? filters.tarja_id,
      precio_packing_por_lb: draft.precio_packing_por_lb ?? filters.precio_packing_por_lb,
    };
    setFilters(next);
    setDraft({});
    generateMut.mutate(next);
  }

  function loadSavedReport(r: SavedReportRow) {
    const parsed = parsePayload(r.payload);
    if (!parsed) {
      toast.error('Formato de snapshot no compatible con esta versión');
      return;
    }
    setReportData(parsed);
    const f = recordToReportFilters(r.filters);
    setFilters(f);
    setDraft(f);
    setActiveSavedId(r.id);
    toast.success(`Cargado: ${r.report_name}`);
  }

  async function downloadExport(
    format: 'csv' | 'xlsx' | 'pdf',
    opts?: { pdfProfile?: 'internal' | 'external'; productor_id?: number },
  ) {
    const base = reportFiltersForPdf ?? filters;
    const exportProdId = opts?.productor_id ?? base.productor_id;
    const q = toQuery({
      format,
      pdf_profile:
        format === 'pdf' && opts?.pdfProfile ? opts.pdfProfile : undefined,
      ...base,
      productor_id: exportProdId != null && exportProdId > 0 ? exportProdId : undefined,
      cliente_id: base.cliente_id || undefined,
      variedad_id: base.variedad_id || undefined,
      tarja_id: base.tarja_id || undefined,
      format_code: base.format_code || undefined,
      precio_packing_por_lb: base.precio_packing_por_lb ?? undefined,
      fecha_desde: base.fecha_desde || undefined,
      fecha_hasta: base.fecha_hasta || undefined,
      calidad: base.calidad || undefined,
    });
    const res = await apiFetch(`/api/reporting/export?${q}`, { psSkipForbiddenRedirect: true });
    if (!res.ok) {
      toast.error(res.status === 403 ? 'No tenés permiso para exportar.' : 'No se pudo exportar');
      return;
    }
    const blob = await res.blob();
    const ext = format === 'xlsx' ? 'xlsx' : format;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      format === 'pdf'
        ? opts?.pdfProfile === 'external'
          ? 'reporte-packing-resumen.pdf'
          : 'reporte-packing-interno.pdf'
        : `reporte-packing.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Descarga iniciada');
  }

  const savedSorted = useMemo(
    () => (savedList ?? []).slice().sort((a, b) => b.id - a.id),
    [savedList],
  );
  const canManagePackingCosts = role === 'admin' || role === 'supervisor';

  return (
    <div className={pageStack}>
      <div className={pageHeaderRow}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={pageTitle}>Reportes</h1>
            <button
              type="button"
              className={pageInfoButton}
              title="Un generado alimenta todas las tablas. Elegí categoría y exportá. Más: Guía del sistema."
              aria-label="Información sobre reportes"
            >
              <Info className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className={cn(pageSubtitle, 'mt-1')}>
            Flujo recomendado: Operación → Decisión → Cierre → Documentos. Un solo generado alimenta tablas y exportaciones.
          </p>
          <Link
            to="/guide/sistema"
            className="mt-2 inline-block text-[13px] text-slate-600 underline-offset-2 hover:underline"
          >
            Guía del sistema
          </Link>
        </div>
      </div>

      <div className={cn(contentCard, 'p-4 sm:p-5')}>
        <div className="flex flex-wrap items-center gap-2">
          {REPORT_MODULE_TABS.map((t) => {
            const active = reportTab === t.id;
            return (
              <Button
                key={t.id}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                className={cn('h-8 rounded-lg text-xs', active && 'shadow-sm')}
                onClick={() => setReportTab(t.id)}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
          {REPORT_MODULE_TABS.find((t) => t.id === reportTab)?.subtitle ?? ''}
        </p>
      </div>

      <div className={cn(contentCard, 'space-y-3 p-3 sm:p-4')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Datos del reporte:</span>{' '}
            {filters.fecha_desde ?? '—'} → {filters.fecha_hasta ?? '—'} · pág. {filters.page} · {filters.limit} filas
          </div>
          <Button
            type="button"
            className={cn(btnToolbarPrimary, 'gap-2')}
            onClick={runMergedGenerate}
            disabled={generateMut.isPending}
          >
            <BarChart3 className="h-4 w-4" />
            {generateMut.isPending ? 'Generando…' : 'Actualizar datos'}
          </Button>
        </div>

        <details
          id="rep-filtros-globales"
          className={cn(
            'group rounded-lg border border-slate-200 bg-slate-50/40 open:border-slate-300 open:bg-white',
            reportTab === 'documentos' ? 'shadow-sm' : '',
          )}
          open={filtersOpen}
          onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="mr-1 inline-block text-slate-400 transition-transform group-open:rotate-90">▸</span>
            Filtros del período (fechas, paginación, productor, cliente, formato…)
          </summary>
          <div className="space-y-3 border-t border-slate-200 px-3 py-3">
            <p className={sectionHint}>
              {reportTab === 'documentos'
                ? 'Definí el período y los límites; luego pulsá Actualizar datos y exportá con los mismos filtros.'
                : 'Colapsado por defecto para que la pantalla muestre solo el contenido de la categoría. Abrí cuando necesites ajustar el período para Cierre o exportaciones.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-desde">
                  Desde
                </label>
                <Input
                  id="rep-desde"
                  type="date"
                  className={filterInputClass}
                  value={draft.fecha_desde ?? filters.fecha_desde ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, fecha_desde: e.target.value || undefined }))}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-hasta">
                  Hasta
                </label>
                <Input
                  id="rep-hasta"
                  type="date"
                  className={filterInputClass}
                  value={draft.fecha_hasta ?? filters.fecha_hasta ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, fecha_hasta: e.target.value || undefined }))}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-page">
                  Página
                </label>
                <Input
                  id="rep-page"
                  type="number"
                  min={1}
                  className={filterInputClass}
                  value={draft.page ?? filters.page}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, page: Math.max(1, Number(e.target.value) || 1) }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-limit">
                  Límite (máx. 100)
                </label>
                <Input
                  id="rep-limit"
                  type="number"
                  min={1}
                  max={100}
                  className={filterInputClass}
                  value={draft.limit ?? filters.limit}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      limit: Math.min(100, Math.max(1, Number(e.target.value) || 100)),
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-productor">
                  Productor id
                </label>
                <Input
                  id="rep-productor"
                  type="number"
                  min={0}
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.productor_id ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      productor_id: e.target.value === '' ? undefined : Number(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-cliente">
                  Cliente id
                </label>
                <Input
                  id="rep-cliente"
                  type="number"
                  min={0}
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.cliente_id ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      cliente_id: e.target.value === '' ? undefined : Number(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-variedad">
                  Variedad id
                </label>
                <Input
                  id="rep-variedad"
                  type="number"
                  min={0}
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.variedad_id ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      variedad_id: e.target.value === '' ? undefined : Number(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-tarja">
                  Tarja id
                </label>
                <Input
                  id="rep-tarja"
                  type="number"
                  min={0}
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.tarja_id ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      tarja_id: e.target.value === '' ? undefined : Number(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-format">
                  Código formato
                </label>
                <Input
                  id="rep-format"
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.format_code ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, format_code: e.target.value || undefined }))}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-precio-packing">
                  Precio packing / lb (manual)
                </label>
                <Input
                  id="rep-precio-packing"
                  type="number"
                  step="0.0001"
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.precio_packing_por_lb ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      precio_packing_por_lb:
                        e.target.value === '' ? undefined : Number(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={filterLabel} htmlFor="rep-calidad">
                  Calidad
                </label>
                <Input
                  id="rep-calidad"
                  className={filterInputClass}
                  placeholder="Opcional"
                  value={draft.calidad ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, calidad: e.target.value || undefined }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tras cambiar valores, pulsá <strong>Actualizar datos</strong> arriba.
            </p>
          </div>
        </details>
      </div>

      {activeSavedId != null && canSave && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              Estás viendo el guardado <strong>#{activeSavedId}</strong>. Podés regenerar datos y luego sincronizar el
              snapshot.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1"
                disabled={syncMut.isPending || !reportData}
                onClick={() => {
                  const row = savedSorted.find((x) => x.id === activeSavedId);
                  if (row) syncMut.mutate(row);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Sincronizar guardado
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setActiveSavedId(null)}>
                Cerrar vínculo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {generateMut.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {generateError && !generateMut.isPending && (
        <div className={errorStateCard}>
          <p className="text-sm font-medium text-rose-900">No se pudo generar el reporte</p>
          <p className="mt-2 text-sm text-rose-800/95">{generateError}</p>
          <p className="mt-3 text-xs text-slate-500">Probá sin filtro de formato; luego añadí filtros de a uno.</p>
        </div>
      )}

      {!generateMut.isPending && (
        <div className="space-y-4">
          {reportTab === 'operacion' ? (
            <>
              <Card className="border-slate-200/90 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <ReportCategoryBadge kind="operativo" />
                  <CardTitle className="text-base text-slate-900">Operación</CardTitle>
                  <CardDescription>¿Qué pasó hoy? Primero el cierre del día; después KPIs del turno; al final el período generado si ya actualizaste datos.</CardDescription>
                </CardHeader>
              </Card>
              <EodPlanningSection
                showCommercialOffer={false}
                showDailyPlanningKpis
                showFinDelDia
                finFirst
                finOpenByDefault
                planningDomId="rep-operacion-diaria"
                finDelDiaDomId="rep-operacion-fin-dia"
                planningHint="KPIs del día (packed, cámara, shipped y MP proceso) justo debajo del fin del día de la fecha operativa."
              />
              <details className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 open:bg-white">
                <summary className="cursor-pointer list-none py-2 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="mr-1 text-slate-400">▸</span> Período generado: PT vs despacho y muestra rápida (opcional)
                </summary>
                <div className="border-t border-slate-200 pt-4 space-y-4">
                  {reportData && executiveKpis ? (
                    <>
                      <Card className="border-slate-200/90 bg-white shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold text-slate-900">Producción vs despacho</CardTitle>
                          <CardDescription className="text-xs">
                            Misma ventana de fechas que usaste en <strong>Actualizar datos</strong> (no es el día operativo de arriba).
                          </CardDescription>
                        </CardHeader>
                        <CardContent className={kpiGrid3}>
                          <KpiTile label="Cajas PT período" value={fmtQty(executiveKpis.cajasPtTotal, 0)} />
                          <KpiTile label="Cajas despachadas (fact.)" value={fmtQty(executiveKpis.cajasDespachadasTotal, 2)} />
                          <KpiTile
                            label="Diferencia (PT − despacho)"
                            value={fmtQty(executiveKpis.cajasPtTotal - executiveKpis.cajasDespachadasTotal, 2)}
                          />
                        </CardContent>
                      </Card>
                      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3">
                        <p className={sectionHint}>Muestra de cajas PT del generado (control de período).</p>
                        <ReportPreviewStrip data={reportData} />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Pulsá <strong>Actualizar datos</strong> con los filtros del período para ver PT vs despacho y la muestra de tabla.
                      El <strong>Fin del día</strong> y los KPIs de arriba no requieren ese paso.
                    </p>
                  )}
                </div>
              </details>
            </>
          ) : null}

          {reportTab === 'decision' ? (
            <>
              <Card className="border-slate-200/90 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <ReportCategoryBadge kind="decision" />
                  <CardTitle className="text-base text-slate-900">Decisión</CardTitle>
                  <CardDescription>¿Qué debo producir? Revisá MP y líneas aptas; después simulá pallets y formato con el balance.</CardDescription>
                </CardHeader>
              </Card>
              <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50/90 to-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-violet-950">Contexto · MP para proceso (recepciones)</CardTitle>
                  <CardDescription className="text-xs text-violet-900/80">
                    Misma lectura que usa la calculadora: fruta disponible para reparto hacia proceso.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className={kpiGrid3}>
                    <KpiTile
                      label="MP disponible (lb)"
                      value={
                        mpContextDecisionPending
                          ? '…'
                          : mpContextDecision != null && mpContextDecision.totalLb > 0
                            ? `${formatLb(mpContextDecision.totalLb, 2)} lb`
                            : '—'
                      }
                    />
                    <KpiTile
                      label="Líneas activas"
                      value={
                        mpContextDecisionPending
                          ? '…'
                          : mpContextDecision != null && mpContextDecision.totalLb > 0
                            ? String(mpContextDecision.lineCount)
                            : '0'
                      }
                    />
                    <KpiTile
                      label="Productores con líneas"
                      value={mpContextDecisionPending ? '…' : String(mpContextDecision?.producerCount ?? 0)}
                    />
                  </div>
                  <p className="rounded-md border border-violet-100 bg-white/80 px-3 py-2 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Resumen de período en filtros:</span>{' '}
                    {(filters.fecha_desde ?? '—') + ' → ' + (filters.fecha_hasta ?? '—')}
                    {reportData ? (
                      <>
                        {' '}
                        · último generado alineado a esas fechas.
                      </>
                    ) : (
                      <>
                        {' '}
                        · pulsá <strong>Actualizar datos</strong> cuando quieras cruzar con el reporte guardado.
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>
              <EodPlanningSection showCommercialOffer showDailyPlanningKpis={false} showFinDelDia={false} />
            </>
          ) : null}

          {reportTab === 'cierre' && reportData ? (
            <div className="space-y-4">
              <Card className="border-slate-200/90 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <ReportCategoryBadge kind="financiero" />
                  <CardTitle className="text-base text-slate-900">Cierre / liquidación final</CardTitle>
                  <CardDescription className="max-w-[52rem] text-sm">
                    Período del generado y acceso rápido a filtros completos. Actualizá el cierre después de cambiar fechas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className={filterLabel} htmlFor="cierre-desde">
                        Desde
                      </label>
                      <Input
                        id="cierre-desde"
                        type="date"
                        className={filterInputClass}
                        value={draft.fecha_desde ?? filters.fecha_desde ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, fecha_desde: e.target.value || undefined }))}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className={filterLabel} htmlFor="cierre-hasta">
                        Hasta
                      </label>
                      <Input
                        id="cierre-hasta"
                        type="date"
                        className={filterInputClass}
                        value={draft.fecha_hasta ?? filters.fecha_hasta ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, fecha_hasta: e.target.value || undefined }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className={cn(btnToolbarPrimary, 'gap-2')}
                      onClick={runMergedGenerate}
                      disabled={generateMut.isPending}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {generateMut.isPending ? 'Generando…' : 'Actualizar cierre'}
                    </Button>
                    <a
                      href="#rep-filtros-globales"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setFiltersOpen(true)}
                    >
                      Más filtros (paginación, productor global…)
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Último período aplicado: {filters.fecha_desde ?? '—'} → {filters.fecha_hasta ?? '—'} · pág. {filters.page} ·{' '}
                    {filters.limit} filas por sección.
                  </p>
                </CardContent>
              </Card>

              <CierreEstadoDelCierreStrip
                packingManual={!!cierrePackingManualMode}
                missingTariffLabels={cierreMissingTariffSpecies}
                producersMissingDetail={cierreProducersMissingDetail}
                informeProducerId={cierreInformeProducerId}
                informeProducerReady={cierreInformeReadiness.ready}
                informeProducerIssues={cierreInformeReadiness.issues}
                zeroCostLines={cierreZeroCostLines}
                kpisPackingZeroNoManual={cierreKpisPackingZeroNoManual}
              />

              {liquidacionAudit ? (
                <LiquidacionAuditorBlock audit={liquidacionAudit} packingManual={!!cierrePackingManualMode} />
              ) : null}

              <LiquidacionFinalModule
                reportData={reportData}
                summaryNote={reportPaginationNote(reportData.producerSettlementSummary)}
                expandProducerIdRequest={producerRowExpandRequest}
                onExpandProducerHandled={() => setProducerRowExpandRequest(null)}
                packingTariffsManualMode={!!cierrePackingManualMode}
                liquidacionAudit={liquidacionAudit}
              />

              <Card className="border-slate-200/90 bg-white shadow-sm" id="rep-cierre-informe-productor">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-slate-900">Informe por productor</CardTitle>
                  <CardDescription className="max-w-[48rem] text-sm">
                    Solo productores presentes en esta liquidación (sin «sin asignar»). El PDF de liquidación respeta{' '}
                    <span className="font-mono text-[11px]">productor_id</span> en el query string del backend.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid gap-2 sm:max-w-md">
                    <Label htmlFor="cierre-prod-informe">Productor</Label>
                    <select
                      id="cierre-prod-informe"
                      className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
                      value={cierreInformeProducerId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCierreInformeProducerId(v === '' ? null : Number(v));
                      }}
                    >
                      <option value="">{cierreProducerOptions.length ? 'Elegí un productor…' : 'Sin productores con id en esta liquidación'}</option>
                      {cierreProducerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {cierreInformeProducerId == null ? (
                    <p className="text-xs text-muted-foreground">Elegí un productor para emitir informe individual.</p>
                  ) : informeExportVisual.tier === 'ok' ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      {informeExportVisual.title} — PDF y Excel reflejan el mismo detalle que la tabla.
                    </p>
                  ) : informeExportVisual.tier === 'warn' ? (
                    <div className="space-y-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-2 text-xs text-amber-950">
                      <p className="flex items-start gap-1.5 font-semibold">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                        {informeExportVisual.title}
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4 font-normal">
                        {informeExportVisual.detailLines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] font-normal text-amber-900/90">Podés exportar igual; conviene revisar el desglose con el productor.</p>
                    </div>
                  ) : (
                    <div className="space-y-1 rounded-md border border-red-300/80 bg-red-50 px-2 py-2 text-xs text-red-950">
                      <p className="flex items-start gap-1.5 font-semibold">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
                        {informeExportVisual.title}
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4 font-normal">
                        {informeExportVisual.detailLines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] font-normal text-red-900/90">
                        Los botones siguen habilitados; revisá la liquidación antes de enviar el archivo.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="gap-1.5"
                      disabled={!reportFiltersForPdf || cierreInformeProducerId == null}
                      title={cierreInformeProducerId == null ? 'Elegí un productor' : undefined}
                      onClick={() => {
                        if (!reportFiltersForPdf || cierreInformeProducerId == null) {
                          toast.error('Elegí un productor.');
                          return;
                        }
                        void downloadProducerSettlementPdf('producer', reportFiltersForPdf, {
                          productor_id: cierreInformeProducerId,
                        });
                      }}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      PDF productor
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={!reportFiltersForPdf || cierreInformeProducerId == null}
                      title={cierreInformeProducerId == null ? 'Elegí un productor' : undefined}
                      onClick={async () => {
                        if (!reportFiltersForPdf || cierreInformeProducerId == null) {
                          toast.error('Elegí un productor.');
                          return;
                        }
                        if (!reportData) return;
                        const summaryRows = (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[];
                        const sr = summaryRows.find(
                          (raw) => Number((raw as Record<string, unknown>).productor_id) === cierreInformeProducerId,
                        ) as Record<string, unknown> | undefined;
                        if (!sr) {
                          toast.error('No hay fila de resumen para este productor en la página cargada.');
                          return;
                        }
                        const name = String(sr.productor_nombre ?? `Productor ${cierreInformeProducerId}`);
                        const base = `cierre-${reportFiltersForPdf.fecha_desde ?? 'ini'}-${reportFiltersForPdf.fecha_hasta ?? 'fin'}`;
                        try {
                          await downloadProducerSettlementExcelClient({
                            fileBase: base,
                            producerId: cierreInformeProducerId,
                            producerName: name,
                            summaryRow: sr,
                            detailRows: (reportData.producerSettlementDetail?.rows ?? []) as Record<string, unknown>[],
                            formatCostSummaryRows: (reportData.formatCostSummary?.rows ?? []) as Record<string, unknown>[],
                          });
                          toast.success('Excel productor generado (3 hojas: resumen, despacho, formato).');
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Error al generar Excel');
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Excel productor
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={cierreInformeProducerId == null}
                      onClick={() => {
                        if (cierreInformeProducerId == null) {
                          toast.error('Elegí un productor.');
                          return;
                        }
                        setProducerRowExpandRequest(cierreInformeProducerId);
                      }}
                    >
                      Ver detalle productor
                    </Button>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Excel productor: archivo de 3 hojas generado en el navegador (resumen, detalle por despacho, desglose por formato) con
                    los mismos datos que ves en la liquidación. El export «Excel completo» del final sigue siendo el dataset global del
                    servidor.
                  </p>
                </CardContent>
              </Card>

              <details id="rep-cierre-config" className="scroll-mt-24 rounded-lg border border-slate-200 bg-muted/30 open:bg-white">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="mr-2 text-slate-400">▸</span>
                  Tarifas packing por especie
                </summary>
                <div className="border-t border-slate-200 px-4 py-4 text-sm text-slate-700">
                  Estas tarifas alimentan el costo packing de la liquidación: lb productor × tarifa especie (cuando no usás precio packing
                  manual en filtros globales).
                </div>
                <div className="bg-white px-2 pb-4 sm:px-4">
                  <div className="flex flex-wrap items-center gap-4 py-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={showInactivePackingCosts}
                        onChange={(e) => setShowInactivePackingCosts(e.target.checked)}
                      />
                      <span>Mostrar especies inactivas</span>
                    </label>
                    {hiddenPackingSpeciesIds.size > 0 ? (
                      <Button type="button" variant="link" className="h-auto p-0 text-primary" onClick={() => setHiddenPackingSpeciesIds(new Set())}>
                        Restaurar especies ocultas ({hiddenPackingSpeciesIds.size})
                      </Button>
                    ) : null}
                  </div>
                  {canManagePackingCosts ? (
                    <div className="mb-4 grid gap-3 rounded-md border border-border p-3 md:grid-cols-4">
                      <div className="grid gap-2">
                        <Label>Especie</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
                          value={packingSpeciesId}
                          onChange={(e) => setPackingSpeciesId(Number(e.target.value))}
                        >
                          <option value={0}>Elegir…</option>
                          {(species ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Temporada (opcional)</Label>
                        <Input value={packingSeason} onChange={(e) => setPackingSeason(e.target.value)} placeholder="2026-2027" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Precio por lb</Label>
                        <Input
                          type="number"
                          step="0.000001"
                          min={0}
                          value={packingPrice}
                          onChange={(e) => setPackingPrice(e.target.value)}
                          placeholder="0.120000"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Activo</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
                          value={packingActive ? '1' : '0'}
                          onChange={(e) => setPackingActive(e.target.value === '1')}
                        >
                          <option value="1">Sí</option>
                          <option value="0">No</option>
                        </select>
                      </div>
                      <div className="md:col-span-4">
                        <Button
                          type="button"
                          disabled={upsertPackingCostMut.isPending || packingSpeciesId <= 0 || packingPrice.trim() === ''}
                          onClick={() => upsertPackingCostMut.mutate()}
                        >
                          {upsertPackingCostMut.isPending ? 'Guardando…' : 'Guardar tarifa'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {packingCostsLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Especie</TableHead>
                            <TableHead>Temporada</TableHead>
                            <TableHead>Precio/lb</TableHead>
                            <TableHead>Activo</TableHead>
                            <TableHead className="min-w-[11rem]">Estado (cierre)</TableHead>
                            <TableHead className="w-[120px]">Vista</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visiblePackingCosts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground">
                                {packingCosts?.length ? 'Ninguna fila visible (ocultas o inactivas).' : 'Sin configuración.'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            visiblePackingCosts.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{r.species_name ?? `#${r.species_id}`}</TableCell>
                                <TableCell>{r.season ?? '—'}</TableCell>
                                <TableCell className="font-mono tabular-nums">{formatMoney(Number(r.price_per_lb))}</TableCell>
                                <TableCell>{r.active ? 'Sí' : 'No'}</TableCell>
                                <TableCell className="max-w-[14rem] text-xs leading-snug">
                                  {cierrePackingManualMode ? (
                                    <span className="text-muted-foreground">Neutro: período con precio packing manual.</span>
                                  ) : cierreMissingSpeciesIdSet.has(r.species_id) ? (
                                    <span className="font-medium text-red-700">
                                      Falta tarifa activa para esta especie (packing no incluido en liquidación para ese volumen).
                                    </span>
                                  ) : r.active && Number(r.price_per_lb) > 0 ? (
                                    <span className="text-emerald-800">Tarifa activa en maestro.</span>
                                  ) : (
                                    <span className="text-amber-800">Sin tarifa efectiva (&gt;0) o fila inactiva.</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => setHiddenPackingSpeciesIds((prev) => new Set([...prev, r.species_id]))}
                                  >
                                    Ocultar
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </details>

              <Card className="border-slate-200/90 bg-white shadow-sm" id="rep-cierre-exportaciones">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-slate-900">Exportaciones generales</CardTitle>
                  <CardDescription className="max-w-[42rem] text-sm">
                    Dataset completo del período generado. Los PDF de liquidación acá omiten el filtro por productor del informe individual.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={!reportData}
                    onClick={() => void downloadExport('xlsx')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel completo
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!reportData} onClick={() => void downloadExport('csv')}>
                    CSV
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!reportData}
                    onClick={() => void downloadExport('pdf', { pdfProfile: 'internal' })}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF interno (operativo)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!reportFiltersForPdf}
                    onClick={() => {
                      if (!reportFiltersForPdf) return;
                      const f: ReportFilters = { ...reportFiltersForPdf, productor_id: undefined };
                      void downloadProducerSettlementPdf('producer', f);
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF liquidación (todos)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!reportFiltersForPdf}
                    onClick={() => {
                      if (!reportFiltersForPdf) return;
                      const f: ReportFilters = { ...reportFiltersForPdf, productor_id: undefined };
                      void downloadProducerSettlementPdf('internal', f);
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF liquidación interno
                  </Button>
                </CardContent>
              </Card>

              <details className="scroll-mt-24 rounded-lg border border-slate-200 bg-muted/20">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="mr-2 text-slate-400">▸</span>
                  Diagnóstico técnico (admin / uso interno)
                </summary>
                <div id="rep-cierre-diagnostico" className="space-y-4 border-t border-slate-200 px-2 py-4 sm:px-4">
                  <DiagnosticoTrazabilidadGuiaCard />
                  {isAdmin ? <ProducerSettlementDiagnosticPanel data={reportData.producerSettlementDiagnostic} /> : null}
                  {!isAdmin ? (
                    <p className="text-sm text-muted-foreground">
                      Las tablas técnicas de depuración están restringidas a administradores.
                    </p>
                  ) : null}

                  <div id="rep-cierre-margen" className="scroll-mt-24 space-y-4 border-t border-slate-200 pt-4">
                    <Card className="border-slate-200/90 bg-slate-50/50 shadow-sm">
                      <CardHeader className="pb-2">
                        <ReportCategoryBadge kind="financiero" />
                        <CardTitle className="text-base text-slate-900">Margen por cliente</CardTitle>
                        <CardDescription className="max-w-[48rem] text-sm">
                          Ventas y costos prorrateados por cliente sin reparto por productor (misma lógica que el detalle de liquidación sobre
                          formatos).
                        </CardDescription>
                      </CardHeader>
                    </Card>
                    <ClientMarginSummaryTable section={reportData.clientMarginSummary} />
                    <ClientMarginDetailTable section={reportData.clientMarginDetail} />
                  </div>

                  <div id="rep-cierre-costos" className="scroll-mt-24 space-y-4 border-t border-slate-200 pt-4">
                    {reportData.formatCostConfig?.packing_source ? (
                      <Card className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/50')}>
                        <CardContent className="py-3 text-sm text-slate-600">
                          Fuente costo packing (financiero):{' '}
                          <strong>
                            {reportData.formatCostConfig.packing_source === 'manual_filter'
                              ? 'filtro manual (precio packing por lb)'
                              : 'tabla packing_costs por especie'}
                          </strong>
                        </CardContent>
                      </Card>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={showAllFormatCostRows}
                          onChange={(e) => setShowAllFormatCostRows(e.target.checked)}
                        />
                        <span>Incluir formatos con cajas = 0 facturadas en el período</span>
                      </label>
                    </div>
                    {hasFormatCostOnlyZeros ? (
                      <Card className={cn(contentCard, 'border-dashed border-amber-200/90 bg-amber-50/80')}>
                        <CardContent className="py-4 text-sm text-amber-950">
                          Todas las filas tienen cajas = 0 con estos filtros. Activá la opción de arriba para ver líneas sin volumen facturado.
                        </CardContent>
                      </Card>
                    ) : null}
                    <FormatCostOperational summary={formatCostSummaryForDisplay} />
                    {reportData.formatCostSummary && formatCostSummaryForDisplay && !showAllFormatCostRows
                      ? (() => {
                          const hidden = reportData.formatCostSummary!.rows.length - formatCostSummaryForDisplay.rows.length;
                          if (hidden <= 0) return null;
                          return (
                            <p className="text-xs text-muted-foreground">
                              Mostrando {formatCostSummaryForDisplay.rows.length} formato(s) con cajas facturadas &gt; 0; {hidden} oculto(s) con
                              cajas = 0.
                            </p>
                          );
                        })()
                      : null}
                    <FormatCostGrouped summary={formatCostSummaryForDisplay} lines={reportData.formatCostLines} />
                    <SectionTable
                      title="Ventas y márgenes por despacho"
                      section={reportData.salesAndCostsByDispatch}
                      dense
                      subtitle="Cruce por despacho con el mismo período filtrado."
                    />
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {reportTab === 'documentos' ? (
            <>
              <Card className="border-slate-200/90 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <ReportCategoryBadge kind="entregable" />
                  <CardTitle className="text-base text-slate-900">Documentos</CardTitle>
                  <CardDescription>¿Cómo exporto? Mirá el resumen del período y descargá el libro o PDFs con los mismos filtros.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 border-t border-border/60 pt-3">
                  <div className="rounded-md bg-sky-50/70 px-3 py-2 text-sm text-sky-950">
                    <strong className="font-medium">Antes de exportar:</strong> pulsá «Actualizar datos» arriba. Cada archivo refleja el último período
                    que generaste con esos filtros.
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
                    <p className={sectionTitle}>Vista del período generado</p>
                    <p className={sectionHint}>Siempre muestra datos reales del último generado (no queda vacío cuando ya cargaste).</p>
                    {reportData && executiveKpis ? (
                      <div className="mt-3 space-y-4">
                        <div className={kpiGrid3}>
                          <KpiTile label="Cajas PT (período)" value={fmtQty(executiveKpis.cajasPtTotal, 0)} />
                          <KpiTile label="Cajas despachadas" value={fmtQty(executiveKpis.cajasDespachadasTotal, 2)} />
                          <KpiTile label="Diferencia PT − despacho" value={fmtQty(executiveKpis.cajasPtTotal - executiveKpis.cajasDespachadasTotal, 2)} />
                        </div>
                        <ReportPreviewStrip data={reportData} />
                        <details className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2">
                          <summary className="cursor-pointer text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                            Dataset técnico (vista normalizada)
                          </summary>
                          <div className="mt-3 border-t pt-3">
                            <UnifiedDatasetTechPreview data={reportData} />
                          </div>
                        </details>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Todavía no hay generado en memoria. Pulsá <strong>Actualizar datos</strong> y volvé acá: vas a ver totales y la tabla de
                        muestra automáticamente.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                    <Button
                      type="button"
                      className={cn(btnToolbarPrimary, 'h-11 w-full gap-2 sm:min-w-[220px] sm:flex-1')}
                      disabled={!reportData}
                      title={REPORT_MODULE_TABS.find((x) => x.id === 'documentos')?.excelCtaHint}
                      onClick={() => downloadExport('xlsx')}
                    >
                      <Download className="h-4 w-4" />
                      Exportar TODO (Excel)
                    </Button>
                    <div className="flex flex-1 flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" disabled={!reportData} onClick={() => void downloadExport('pdf', { pdfProfile: 'internal' })}>
                        <FileDown className="h-4 w-4" />
                        PDF interno
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" disabled={!reportData} onClick={() => void downloadExport('pdf', { pdfProfile: 'external' })}>
                        <FileDown className="h-4 w-4" />
                        PDF resumen
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2"
                        disabled={!reportFiltersForPdf}
                        onClick={() => {
                          if (!reportFiltersForPdf) {
                            toast.error('Generá primero.');
                            return;
                          }
                          void downloadProducerSettlementPdf('producer', reportFiltersForPdf);
                        }}
                      >
                        <FileDown className="h-4 w-4" />
                        PDF liquidación productor
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-9" disabled={!reportData} onClick={() => downloadExport('csv')}>
                        CSV
                      </Button>
                      {canSave ? (
                        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                          <DialogTrigger asChild>
                            <Button type="button" variant="secondary" size="sm" className="h-9 gap-2" disabled={!reportData}>
                              <Save className="h-4 w-4" />
                              Guardar vista
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Guardar reporte</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-2 py-2">
                              <Label>Nombre</Label>
                              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Ej. Semana 15 productor 3" />
                            </div>
                            <DialogFooter>
                              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                                Cancelar
                              </Button>
                              <Button type="button" disabled={!saveName.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                                {saveMut.isPending ? 'Guardando…' : 'Guardar'}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" className="h-9 gap-2" disabled title="Disponible con permisos de guardado">
                          <Save className="h-4 w-4" />
                          Guardar vista
                        </Button>
                      )}
                    </div>
                  </div>
                  <Link to="/dispatches" className="inline-flex items-center gap-2 text-[13px] text-primary underline-offset-4 hover:underline">
                    <Printer className="h-4 w-4 shrink-0" />
                    Facturas y packing lists se generan en Despachos
                  </Link>
                </CardContent>
              </Card>

              <div className={cn(contentCard, 'p-4 sm:p-5')}>
                <p className={sectionTitle}>Reportes guardados</p>
                <p className={sectionHint}>Cargar, renombrar o eliminar. Guardar: supervisor/admin · eliminar: admin.</p>
                <div className="mt-4">
                  {savedLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : savedSorted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ninguno guardado aún.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Creado</TableHead>
                          <TableHead className="min-w-[200px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {savedSorted.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {r.report_name}
                              {activeSavedId === r.id ? (
                                <Badge variant="default" className="ml-2">
                                  activo
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{new Date(r.created_at).toLocaleString('es')}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => loadSavedReport(r)}>
                                  <FolderOpen className="h-3.5 w-3.5" />
                                  Cargar
                                </Button>
                                {canSave && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => {
                                      setRenameTarget(r);
                                      setRenameValue(r.report_name);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Renombrar
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (confirm(`¿Eliminar «${r.report_name}»?`)) deleteMut.mutate(r.id);
                                    }}
                                    disabled={deleteMut.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </>
          ) : null}

        </div>
      )}

      {!reportData && !generateMut.isPending && reportTab === 'cierre' && (
        <div className={cn(emptyStateInset, 'py-8 text-center text-sm')}>
          Esta pantalla muestra solo liquidación económica. Pulsá <strong>Actualizar datos</strong> después de configurar período en los filtros
          (abrí desde el grupo arriba).
        </div>
      )}

      {reportTab === 'cierre' &&
        reportData &&
        !generateMut.isPending &&
        (reportData.formatCostSummary?.rows?.length ?? 0) === 0 && (
          <Card className={cn(contentCard, 'border-dashed border-amber-200/90 bg-amber-50/60')}>
            <CardHeader>
              <div className="mb-2">
                <ReportCategoryBadge kind="financiero" />
              </div>
              <CardTitle className="text-base text-slate-900">Costo por formato sin filas visibles</CardTitle>
              <CardDescription>
                No hay formatos con cajas facturadas &gt; 0, o el filtro dejó la vista vacía.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Marcá «Incluir formatos con cajas = 0» en costo por formato si necesitás ver líneas sin volumen. Verificá
              receta y facturas del período; probá sin filtro de formato.
            </CardContent>
          </Card>
        )}

      <Dialog open={renameTarget != null} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar reporte</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Nombre</Label>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!renameTarget || !renameValue.trim() || renameMut.isPending}
              onClick={() => renameTarget && renameMut.mutate({ row: renameTarget, name: renameValue })}
            >
              {renameMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
