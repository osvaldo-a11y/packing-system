import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  Circle,
  DollarSign,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  Info,
  Layers,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatCodeMatchKey } from '@/lib/format-code';
import { formatReportCell } from '@/lib/format-report-cell';
import { formatBoxes, formatLb, formatMoney, formatTechnical } from '@/lib/number-format';
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
  downloadSettlementExcelAll,
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
  variant: 'producer' | 'internal' | 'executive',
  f: ReportFilters,
  opts?: { productor_id?: number; lang?: 'es' | 'en' },
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
    lang: opts?.lang,
  });
  const path = `/api/reporting/producer-settlement/pdf?${q}`;
  const defaultName =
    variant === 'producer'
      ? 'liquidacion_productor.pdf'
      : variant === 'executive'
        ? 'liquidacion_productor_ejecutivo.pdf'
        : 'liquidacion_productor_interno.pdf';
  try {
    await downloadPdf(path, defaultName);
    toast.success('PDF descargado');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(msg.slice(0, 220) || 'No se pudo generar el PDF');
  }
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

/** Opciones compactas para filtros de reporte (catálogos masters). */
type ReportMasterProducer = { id: number; nombre: string };
type ReportMasterClient = { id: number; nombre: string; codigo?: string | null };
type ReportMasterVariety = { id: number; nombre: string; species_id: number };

const reportFilterCatalogSelectClass =
  'flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm';

type PackingCostRow = {
  id: number;
  species_id: number;
  species_name: string | null;
  season: string | null;
  price_per_lb: number;
  active: boolean;
};

interface PackingFormatSurcharge {
  id: number;
  format_code: string;
  surcharge_per_lb: string;
  season: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

interface MaterialCostAdjustment {
  id: number;
  name: string;
  adjustment_type: 'per_box' | 'per_lb' | 'percent';
  value: string;
  format_code: string | null;
  producer_id: number | null;
  season: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

interface MachineProcessingRate {
  id: number;
  rate_per_lb: string;
  species_id: number | null;
  season: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

type SavedReportRow = {
  id: number;
  report_name: string;
  filters: Record<string, unknown>;
  payload: Record<string, unknown>;
  created_at: string;
};

type ReportModuleTab = 'operacion' | 'decision' | 'cierre' | 'documentos';

function getReportModuleTabs(t: (k: string) => string) {
  return [
    { id: 'operacion' as const, label: t('reporting.tabs.operacion.label'), subtitle: t('reporting.tabs.operacion.subtitle'), excelCtaHint: t('reporting.tabs.operacion.excelHint') },
    { id: 'decision' as const, label: t('reporting.tabs.decision.label'), subtitle: t('reporting.tabs.decision.subtitle'), excelCtaHint: t('reporting.tabs.decision.excelHint') },
    { id: 'cierre' as const, label: t('reporting.tabs.cierre.label'), subtitle: t('reporting.tabs.cierre.subtitle'), excelCtaHint: t('reporting.tabs.cierre.excelHint') },
    { id: 'documentos' as const, label: t('reporting.tabs.documentos.label'), subtitle: t('reporting.tabs.documentos.subtitle'), excelCtaHint: t('reporting.tabs.documentos.excelHint') },
  ] as const;
}

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

function ReportCategoryBadge({ kind }: { kind: ReportModuleTab | 'financiero' | 'operativo' | 'entregable' }) {
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const map = {
    operativo: 'border-sky-200 text-sky-900 bg-sky-50',
    decision: 'border-violet-200 text-violet-950 bg-violet-50',
    financiero: 'border-slate-300 text-slate-800 bg-slate-50',
    entregable: 'border-emerald-200 text-emerald-900 bg-emerald-50',
  };
  const styleKey: keyof typeof map =
    kind === 'operativo' || kind === 'operacion'
      ? 'operativo'
      : kind === 'decision'
        ? 'decision'
        : kind === 'financiero' || kind === 'cierre'
          ? 'financiero'
          : 'entregable';
  const label =
    kind === 'operativo' || kind === 'operacion'
      ? tr('badges.operacion')
      : kind === 'decision'
        ? tr('badges.decision')
        : kind === 'financiero' || kind === 'cierre'
          ? tr('badges.cierre')
          : tr('badges.documentos');
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', map[styleKey])}>
      {label}
    </Badge>
  );
}

function ProducerSettlementDiagnosticPanel({ data }: { data: ProducerSettlementDiagnosticPayload | undefined }) {
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
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
        {tr('diagnostico.depuracionTitle')}
        <span className="ml-2 font-normal text-amber-800/90">{tr('diagnostico.depuracionDesc')}</span>
      </summary>
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="pb-2 pt-0">
          <CardDescription className="text-amber-950/85">
            {tr('diagnostico.depuracionHelp')}
          </CardDescription>
        {missingFromApi ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-100/80 px-3 py-2 text-sm text-amber-950">
            <strong className="font-medium">{tr('diagnostico.aviso')}</strong> {tr('misc.jsonMissing')}{' '}
            <span className="font-mono">producerSettlementDiagnostic</span> (p. ej. reporte guardado antes de esta función).
            Pulsá <strong>{tr('diagnostico.generar')}</strong> {tr('misc.jsonMissingHint')}
          </div>
        ) : null}
        {typeof hint === 'string' && hint ? (
          <p className="pt-2 text-sm font-medium text-amber-900">{hint}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">{tr('diagnostico.metaTitle')}</summary>
          <pre className="mt-3 max-h-[min(70vh,720px)] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </details>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {tr('diagnostico.despachos')} ({dispatches_included.length})
          </p>
          {dispatches_included.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('diagnostico.sinDespachos')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[600px]">
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
            {tr('diagnostico.lineas')} ({invoice_lines.length}) — scroll vertical si hay muchas
          </p>
          {invoice_lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tr('diagnostico.sinLineas')}
            </p>
          ) : (
            <div className="max-h-[min(85vh,1400px)] overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[600px]">
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const COL_MAP: Record<string, string> = {
    productor_id: tr('liquidacionDetalle.colProductorId'),
    productor_nombre: tr('liquidacionDetalle.colProductor'),
    dispatch_id: tr('liquidacionDetalle.colDespacho'),
    dispatch_number: tr('liquidacionDetalle.colDespachoNum'),
    fecha_despacho: tr('liquidacionDetalle.colFecha'),
    numero_bol: tr('liquidacionDetalle.colBol'),
    invoice_number: tr('liquidacionDetalle.colFactura'),
    format_code: tr('liquidacionDetalle.colFormato'),
    cajas: tr('liquidacionDetalle.colCajas'),
    lb: tr('liquidacionDetalle.colLb'),
    ventas: tr('liquidacionDetalle.colVentas'),
    costo_materiales: tr('liquidacionDetalle.colMateriales'),
    costo_packing: tr('liquidacionDetalle.colPacking'),
    costo_total: tr('liquidacionDetalle.colCostoTotal'),
    neto: tr('liquidacionDetalle.colNeto'),
    neto_productor: tr('liquidacionDetalle.colNetoProductor'),
    nota_prorrateo: tr('liquidacionDetalle.colNota'),
    client_id: tr('liquidacionDetalle.colClienteId'),
    client_nombre: tr('liquidacionDetalle.colCliente'),
    invoice_id: tr('liquidacionDetalle.colFacturaId'),
  };
  const colLabel = (c: string) => COL_MAP[c] ?? c;
  const total = section?.total ?? 0;
  const hasRows = (section?.rows?.length ?? 0) > 0;
  const pageInfo =
    section != null
      ? tr('paginacion.totalServidor')
          .replace('{total}', String(total))
          .replace('{page}', String(section.page))
          .replace('{limit}', String(section.limit))
      : '';
  const truncated = section != null && total > section.rows.length;
  const emptyButTotal =
    section != null && !hasRows && total > 0 ? tr('paginacion.hayOtrasPaginas') : null;

  if (!section) {
    return (
      <Card id={id} className="scroll-mt-20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          <CardDescription>{tr('paginacion.sinSeccion')}</CardDescription>
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
              ? tr('margenCliente.sinFilas')
              : (
                  <>
                    {tr('margenCliente.sinFilasPagina')} {pageInfo ? `(${pageInfo})` : ''}
                  </>
                )}
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
              {tr('paginacion.mostrandoDeTotal')
                .replace('{shown}', String(section.rows.length))
                .replace('{total}', String(total))}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <div className={dense ? 'max-h-[min(80vh,1000px)] overflow-x-auto rounded-md border border-border' : ''}>
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                {cols.map((c, i) => (
                  <TableHead
                    key={c}
                    className={`whitespace-nowrap ${i === 0 ? 'min-w-[8rem] font-medium text-foreground' : ''} ${dense ? 'sticky top-0 z-[1] bg-card text-xs shadow-sm' : ''}`}
                  >
                    {colLabel(c)}
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

function reportPaginationNote(
  section: PaginatedSection | undefined,
  tr: (k: string) => string = (k) => k,
): {
  pageInfo: string;
  truncated: boolean;
  emptyButTotal: string | null;
} {
  const total = section?.total ?? 0;
  const hasRows = (section?.rows?.length ?? 0) > 0;
  const pageInfo =
    section != null
      ? tr('paginacion.totalServidor')
          .replace('{total}', String(total))
          .replace('{page}', String(section.page))
          .replace('{limit}', String(section.limit))
      : '';
  const truncated = section != null && total > section.rows.length;
  const emptyButTotal =
    section != null && !hasRows && total > 0 ? tr('paginacion.hayOtrasPaginas') : null;
  return { pageInfo, truncated, emptyButTotal };
}

function fmtMoney(v: unknown): string {
  const n = toNum(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtQty(v: unknown, frac: number): string {
  const n = toNum(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}

/** Tabla fija para margen por cliente (resumen): lectura cómoda para gestión. */
function ClientMarginSummaryTable({
  section,
  id,
}: {
  section: PaginatedSection | undefined;
  id?: string;
}) {
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const { pageInfo, truncated, emptyButTotal } = reportPaginationNote(section, tr);
  const rows = section?.rows ?? [];
  const hasRows = rows.length > 0;

  if (!section) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tr('margenCliente.titleResumen')}</CardTitle>
          <CardDescription>Sin sección.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasRows) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tr('margenCliente.titleResumen')}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {tr('margenCliente.totalesDesc')}
          </CardDescription>
          <CardDescription>
            {section.total === 0
              ? tr('margenCliente.sinFilas')
              : `Sin filas en esta página (${pageInfo}).`}
            {emptyButTotal ? ` ${emptyButTotal}` : ''}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id={id} className="scroll-mt-20 overflow-hidden border-slate-200/90 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/60 pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.titleResumen')}</CardTitle>
        <CardDescription className="mt-0.5 text-xs text-slate-500">
          {tr('margenCliente.descResumen')}
        </CardDescription>
        <p className="text-[11px] text-muted-foreground">
          {pageInfo}
          {truncated
            ? ` · ${tr('paginacion.mostrandoDeTotal').replace('{shown}', String(section.rows.length)).replace('{total}', String(section.total))}`
            : ''}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[min(80vh,920px)] overflow-x-auto rounded-md border border-border">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="sticky top-0 z-[1] min-w-[140px] border-b border-slate-200 bg-slate-50/80 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colCliente')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colCajas')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colLb')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colVentas')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colCostoMat')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colCostoPack')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colCostoTotal')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colMargen')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colPorCaja')}</TableHead>
              <TableHead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('margenCliente.colPorLb')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((raw, i) => {
              const r = raw as Record<string, unknown>;
              const margen = toNum(r.margen);
              return (
                <TableRow key={`cms-${i}`} className={cn('border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                  <TableCell className="py-3 text-sm font-semibold text-slate-900">{toStr(r.cliente_nombre)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">{formatBoxes(toNum(r.total_cajas))}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">{formatLb(toNum(r.total_lb), 2)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">{fmtMoney(r.total_ventas)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-600">{fmtMoney(r.costo_materiales)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-600">{fmtMoney(r.costo_packing)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">{fmtMoney(r.costo_total)}</TableCell>
                  <TableCell className={cn('py-3 text-right font-mono text-sm font-bold tabular-nums', margen < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                    {fmtMoney(r.margen)}
                  </TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-600">{formatTechnical(toNum(r.margen_por_caja), 2)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-600">{formatTechnical(toNum(r.margen_por_lb), 4)}</TableCell>
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const { pageInfo, truncated, emptyButTotal } = reportPaginationNote(section, tr);
  const rows = section?.rows ?? [];
  const hasRows = rows.length > 0;

  if (!section) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tr('margenCliente.titleDetalle')}</CardTitle>
          <CardDescription>Sin sección.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasRows) {
    return (
      <Card id={id} className="scroll-mt-20 border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tr('margenCliente.titleDetalle')}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {tr('margenCliente.descDetalle')}
          </CardDescription>
          <CardDescription>
            {section.total === 0
              ? tr('margenCliente.sinFilas')
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
        <CardTitle className="text-base">{tr('margenCliente.titleDetalle')}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {tr('margenCliente.descDetalle')}
        </CardDescription>
        <CardDescription>
          {pageInfo}
          {truncated ? (
            <span className="mt-1 block text-amber-800">
              {tr('paginacion.mostrandoDeTotal')
                .replace('{shown}', String(section.rows.length))
                .replace('{total}', String(section.total))}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <div className="max-h-[min(85vh,1200px)] overflow-x-auto rounded-md border border-border">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-[1] min-w-[120px] bg-card text-xs shadow-sm">{tr('margenCliente.colCliente')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-xs shadow-sm">{tr('margenCliente.colId')}</TableHead>
                <TableHead className="sticky top-0 z-[1] min-w-[100px] bg-card text-xs shadow-sm">{tr('costoFormato.colFormato')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colCajas')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colLb')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colVentas')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colCostoMat')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colCostoPack')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colCostoTotal')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colMargen')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colMargenCaja')}</TableHead>
                <TableHead className="sticky top-0 z-[1] bg-card text-right text-xs shadow-sm">{tr('margenCliente.colMargenLb')}</TableHead>
                <TableHead className="sticky top-0 z-[1] min-w-[220px] bg-card text-xs shadow-sm">{tr('margenCliente.colNota')}</TableHead>
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

function KpiTile({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Color semántico u otras clases para el valor (p. ej. liquidación KPIs). */
  valueClassName?: string;
}) {
  return (
    <div className={kpiCardSm}>
      <p className={kpiLabel}>{label}</p>
      <p className={cn(kpiValueMd, valueClassName)}>{value}</p>
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
  tr: (k: string) => string = (k) => k,
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
    const code = formatCodeMatchKey(String(fr.format_code ?? ''));
    const sid = fr.species_id;
    if (!code || sid == null || sid === '') continue;
    const n = Number(sid);
    if (Number.isFinite(n) && n > 0) formatSpeciesId.set(code, n);
  }

  for (const raw of detailRows) {
    const d = raw as Record<string, unknown>;
    const prod = detailProducerLabel(d);
    const fmt = String(d.format_code ?? '').trim() || '(sin formato)';
    const fmtKey = formatCodeMatchKey(fmt);
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
        : tr('auditor.packingOk')
      : `Hay ${packingTable.length} línea(s) con packing en $0 y LB > 0. La liquidación puede sobrepagar productores.`;

  const matSummary =
    materialsTable.length === 0
      ? tr('auditor.materialesOk')
      : `Hay formatos/líneas sin costo material. El neto productor puede estar inflado.`;

  const traceSummary =
    traceSev === 'crit'
      ? unassignedVentas > 0
        ? `Hay ventas sin asignar a productor (${fmtMoney(unassignedVentas)}). Revisar tarjas, proceso o repalet.`
        : 'Hay trazabilidad incompleta o sin asignar — revisar antes de cerrar.'
      : traceSev === 'warn'
        ? `Hay ${producersSinDetalle.length} productor(es) sin detalle operativo o notas faltantes en líneas.`
        : tr('auditor.trazabilidadOk');

  let exportSev: AuditSeverity = 'ok';
  let exportHead = tr('auditor.listoEnviar');
  let exportSub = tr('auditor.sinFaltantes');
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
  tr: (k: string) => string;
}): { tier: 'ok' | 'warn' | 'crit'; title: string; detailLines: string[] } {
  const { producerId, readiness, audit, tr } = args;
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
  return { tier: 'ok', title: tr('productor.listoExportar'), detailLines: [] };
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
  tr,
}: {
  audit: ReturnType<typeof computeLiquidacionAudit>;
  packingManual: boolean;
  tr: (k: string) => string;
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
        <CardTitle className="text-base text-slate-900">{tr('auditor.title')}</CardTitle>
        <CardDescription className="max-w-[52rem] text-sm text-slate-700">
          {tr('auditor.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            {tr('auditor.criticals')} {ex.criticalPillars}
          </Badge>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            {tr('auditor.warnings')} {ex.warningPillars}
          </Badge>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            {tr('auditor.producersAffected')} {ex.affectedProducers}
          </Badge>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium text-slate-800">
            {tr('auditor.formatsAffected')} {ex.affectedFormatos}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {pillar(tr('auditor.packingRates'), packingManual ? 'ok' : audit.packing.severity, audit.packing.summaryLine)}
          {pillar(tr('auditor.materials'), audit.materials.severity, audit.materials.summaryLine)}
          {pillar(tr('auditor.traceability'), audit.traceability.severity, audit.traceability.summaryLine)}
          <div className={cn('rounded-lg border px-2.5 py-2 text-[12px] leading-snug', exportRing)}>
            <p className="font-semibold text-slate-900">{tr('auditor.readyToExport')}</p>
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
            {tr('auditor.viewIssues')}
          </summary>
          <div className="space-y-4 border-t border-slate-200 px-2 py-3 sm:px-3">
            {!anyIssues ? (
              <p className="text-xs font-medium text-emerald-900">{tr('auditor.noIssues')}</p>
            ) : null}

            {audit.packing.tableRows.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{tr('auditor.packingIssues')}</p>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="text-xs">{tr('auditor.colProducer')}</TableHead>
                        <TableHead className="text-xs">{tr('auditor.colFormat')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colBoxes')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colLb')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colCurrentPacking')}</TableHead>
                        <TableHead className="text-xs">{tr('auditor.colIssue')}</TableHead>
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
                  <p className="mt-1 text-[10px] text-muted-foreground">{tr('auditor.showingRows').replace('{total}', String(audit.packing.tableRows.length))}</p>
                ) : null}
              </div>
            ) : null}

            {audit.materials.tableRows.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{tr('auditor.materialIssues')}</p>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="text-xs">{tr('auditor.colProducer')}</TableHead>
                        <TableHead className="text-xs">{tr('auditor.colFormat')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colBoxes')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colCurrentMaterial')}</TableHead>
                        <TableHead className="text-xs">{tr('auditor.colIssue')}</TableHead>
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
                  <p className="mt-1 text-[10px] text-muted-foreground">{tr('auditor.showingRows').replace('{total}', String(audit.materials.tableRows.length))}</p>
                ) : null}
              </div>
            ) : null}

            {audit.traceability.tableRows.length > 0 || audit.traceability.producersSinDetalle.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{tr('auditor.traceIssues')}</p>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        <TableHead className="text-xs">{tr('auditor.colProducerUnassigned')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colBoxes')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colLb')}</TableHead>
                        <TableHead className="text-right text-xs">{tr('auditor.colSales')}</TableHead>
                        <TableHead className="text-xs">{tr('auditor.colIssue')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.traceability.producersSinDetalle.map((name, i) => (
                        <TableRow key={`sd-${i}`} className={tableBodyRow}>
                          <TableCell className="max-w-[10rem] truncate text-xs font-medium">{name}</TableCell>
                          <TableCell className="text-right text-xs">—</TableCell>
                          <TableCell className="text-right text-xs">—</TableCell>
                          <TableCell className="text-right text-xs">—</TableCell>
                          <TableCell className="text-[11px] text-slate-700">{tr('auditor.noOpDetail')}</TableCell>
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
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
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className={tableHeaderRow}>
              <TableHead className="text-xs">{tr('liquidacionDetalle.colDespacho')}</TableHead>
              <TableHead className="text-xs">{tr('liquidacionDetalle.colFactura')}</TableHead>
              <TableHead className="text-xs">{tr('liquidacionDetalle.colCliente')}</TableHead>
              <TableHead className="text-xs">{tr('liquidacionDetalle.colFormato')}</TableHead>
              <TableHead className="text-right text-xs">{tr('liquidacionDetalle.colCajas')}</TableHead>
              <TableHead className="text-right text-xs">{tr('liquidacionDetalle.colLb')}</TableHead>
              <TableHead className="text-right text-xs">{tr('liquidacionDetalle.colVentas')}</TableHead>
              <TableHead className="text-right text-xs">{tr('liquidacionDetalle.colMateriales')}</TableHead>
              <TableHead className="text-right text-xs">{tr('liquidacionDetalle.colPacking')}</TableHead>
              <TableHead className="text-right text-xs">{tr('liquidacionDetalle.colNeto')}</TableHead>
              <TableHead className="min-w-[10rem] text-xs">{tr('liquidacionDetalle.colNota')}</TableHead>
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

type CierreEstadoCardTone = 'ok' | 'warning' | 'error' | 'neutral';

function CierreEstadoChecklistCard({
  tone,
  icon,
  title,
  description,
}: {
  tone: CierreEstadoCardTone;
  icon: ReactNode;
  title: string;
  description: ReactNode;
}) {
  const toneClass: Record<CierreEstadoCardTone, string> = {
    ok: 'border-emerald-200 bg-emerald-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
    error: 'border-red-200 bg-red-50/50',
    neutral: 'border-border bg-muted/30',
  };
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        toneClass[tone],
      )}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{description}</div>
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
  tr,
}: {
  packingManual: boolean;
  missingTariffLabels: string[];
  producersMissingDetail: string[];
  informeProducerId: number | null;
  informeProducerReady: boolean;
  informeProducerIssues: string[];
  zeroCostLines: string[];
  kpisPackingZeroNoManual: boolean;
  tr: (k: string) => string;
}) {
  const tariffsOk = packingManual || missingTariffLabels.length === 0;
  const detailOk = producersMissingDetail.length === 0;
  const fmtList = (arr: string[], max = 4) => {
    if (arr.length === 0) return '—';
    if (arr.length <= max) return arr.join(', ');
    return `${arr.slice(0, max).join(', ')} (+${arr.length - max})`;
  };

  type StripCard = {
    key: string;
    column: 'ok' | 'issue';
    tone: CierreEstadoCardTone;
    icon: ReactNode;
    title: string;
    description: ReactNode;
  };

  const cards: StripCard[] = [];

  if (packingManual) {
    cards.push({
      key: 'tar',
      column: 'ok',
      tone: 'neutral',
      icon: <Circle className="text-muted-foreground" />,
      title: tr('cierreStatus.packingRates'),
      description: <>{tr('cierreStatus.neutral')}</>,
    });
  } else if (tariffsOk) {
    cards.push({
      key: 'tar',
      column: 'ok',
      tone: 'ok',
      icon: <CheckCircle2 className="text-emerald-600" />,
      title: tr('cierreStatus.packingRates'),
      description: <>{tr('cierreStatus.ready')}</>,
    });
  } else {
    cards.push({
      key: 'tar',
      column: 'issue',
      tone: 'error',
      icon: <AlertTriangle className="text-red-600" />,
      title: tr('cierreStatus.packingRates'),
      description: (
        <>
          <p className="text-muted-foreground">
            {tr('cierreStatus.pending')}{' '}
            <span className="font-medium text-foreground">{fmtList(missingTariffLabels)}</span>.
          </p>
          <p className="mt-1.5 font-medium text-foreground">{tr('cierreStatus.impact')}</p>
          {missingTariffLabels.map((lab) => (
            <p key={lab} className="mt-1">
              {tr('cierreStatus.missingImpact').replace('{format}', lab)}
            </p>
          ))}
        </>
      ),
    });
  }

  if (kpisPackingZeroNoManual) {
    cards.push({
      key: 'packing-global',
      column: 'issue',
      tone: 'error',
      icon: <AlertTriangle className="text-red-600" />,
      title: tr('cierreStatus.packingZero'),
      description: (
        <>
          {tr('cierreStatus.packingZeroHint')}
        </>
      ),
    });
  }

  if (zeroCostLines.length > 0) {
    cards.push({
      key: 'zero-cost',
      column: 'issue',
      tone: 'warning',
      icon: <AlertTriangle className="text-amber-600" />,
      title: tr('cierreStatus.costsZero'),
      description: <>{fmtList(zeroCostLines, 3)}</>,
    });
  }

  if (detailOk) {
    cards.push({
      key: 'detalle',
      column: 'ok',
      tone: 'ok',
      icon: <CheckCircle2 className="text-emerald-600" />,
      title: tr('cierreStatus.opDetail'),
      description: <>{tr('cierreStatus.opDetailReady')}</>,
    });
  } else {
    cards.push({
      key: 'detalle',
      column: 'issue',
      tone: 'warning',
      icon: <AlertTriangle className="text-amber-600" />,
      title: tr('cierreStatus.opDetail'),
      description: (
        <>
          {tr('cierreStatus.opDetailMissing')} <span className="font-medium text-foreground">{fmtList(producersMissingDetail)}</span>.
        </>
      ),
    });
  }

  if (informeProducerId == null) {
    cards.push({
      key: 'informe',
      column: 'ok',
      tone: 'neutral',
      icon: <Circle className="text-muted-foreground" />,
      title: tr('cierreStatus.producerReport'),
      description: <>{tr('cierreStatus.producerReportChoose')}</>,
    });
  } else if (informeProducerReady) {
    cards.push({
      key: 'informe',
      column: 'ok',
      tone: 'ok',
      icon: <CheckCircle2 className="text-emerald-600" />,
      title: tr('cierreStatus.producerReport'),
      description: <>{tr('cierreStatus.producerReportReady')}</>,
    });
  } else {
    cards.push({
      key: 'informe',
      column: 'issue',
      tone: 'error',
      icon: <XCircle className="text-red-600" />,
      title: tr('cierreStatus.producerReport'),
      description: (
        <>
          {tr('misc.faltanDatos')} <span className="font-medium text-foreground">{informeProducerIssues.join(' · ')}</span>
        </>
      ),
    });
  }

  const leftCards = cards.filter((c) => c.column === 'ok');
  const issueCards = cards.filter((c) => c.column === 'issue');
  const problemaCount = issueCards.length;

  return (
    <div role="region" aria-label={tr('cierreStatus.title')} className="min-w-0">
      <p className="mb-3 text-[11px] uppercase tracking-wide text-muted-foreground">{tr('cierreStatus.title')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          {leftCards.map((c) => (
            <CierreEstadoChecklistCard
              key={c.key}
              tone={c.tone}
              icon={c.icon}
              title={c.title}
              description={c.description}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {issueCards.map((c) => (
            <CierreEstadoChecklistCard
              key={c.key}
              tone={c.tone}
              icon={c.icon}
              title={c.title}
              description={c.description}
            />
          ))}
        </div>
      </div>
      {problemaCount === 0 ? (
        <p className="mt-2 text-xs font-medium text-emerald-700">{tr('cierreStatus.closeListo')}</p>
      ) : (
        <p className="mt-2 text-xs font-medium text-amber-700">
          {problemaCount} {tr('cierreStatus.closeReview')}
        </p>
      )}
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const manual = reportData.formatCostConfig?.packing_source === 'manual_filter';
  const rows = (reportData.formatCostSummary?.rows ?? []) as Record<string, unknown>[];
  const example = rows.find((raw) => toNum((raw as Record<string, unknown>).cajas) > 0) as Record<string, unknown> | undefined;
  const exLbPerCaja =
    example && toNum(example.cajas) > 0 ? toNum(example.lb ?? example.lb_totales) / toNum(example.cajas) : null;
  const exPackingLb = example ? toNum(example.precio_packing_por_lb) : null;
  return (
    <div className="rounded-md border border-indigo-200/80 bg-indigo-50/50 px-3 py-2 text-[12px] leading-snug text-indigo-950">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/90">{tr('costoCalculo.title')}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-indigo-400">
        <li>
          <strong>{tr('costoCalculo.materiales')}</strong>
          {tr('costoCalculo.materialesDesc')}
        </li>
        <li>
          <strong>{tr('costoCalculo.packing')}</strong>: {tr('costoCalculo.packingTarifaDesc')}
          {manual ? ` ${tr('costoCalculo.packingManualNote')}` : ` ${tr('costoCalculo.packingMaestroNote')}`}
        </li>
        <li>
          <strong>{tr('costoCalculo.formato')}</strong>
          {tr('costoCalculo.formatoDesc')}
        </li>
      </ul>
      <p className="mt-2 rounded border border-indigo-100/80 bg-white/90 px-2 py-1.5 text-[11px] text-slate-800">
        <span className="font-semibold text-slate-900">{tr('costoCalculo.costoPorFormato')}</span>{' '}
        <span className="font-mono text-[11px]">{tr('costoCalculo.formula')}</span>
        {example ? (
          <>
            <span className="mx-1 text-slate-500">{tr('costoCalculo.ejemplo')}</span>
            <span className="font-mono">{String(example.format_code)}</span>
            {exLbPerCaja != null ? (
              <>
                {' '}
                · <span className="font-mono">{tr('costoCalculo.lbCaja')} {formatTechnical(exLbPerCaja, 3)}</span>
              </>
            ) : null}
            {exPackingLb != null && Number.isFinite(exPackingLb) && exPackingLb > 0 ? (
              <>
                {' '}
                · <span className="font-mono">{tr('costoCalculo.slbEqual')} {formatTechnical(exPackingLb, 4)}</span>
              </>
            ) : !manual ? (
              <> {tr('costoCalculo.packingCeroNote')}</>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground"> {tr('costoCalculo.sinFilaCosto')}</span>
        )}
      </p>
      <p className="mt-2 text-[12px] text-indigo-950">
        <span className="font-semibold">{tr('costoCalculo.liquidacionSuma')}</span>{' '}
        <span className="tabular-nums">{fmtMoney(kpis.ventas)}</span> −{' '}
        <span className="tabular-nums">{fmtMoney(kpis.materiales)}</span> −{' '}
        <span className="tabular-nums">{fmtMoney(kpis.packing)}</span> ={' '}
        <span className="font-semibold tabular-nums">{fmtMoney(kpis.netoSum)}</span>
        <span className="text-muted-foreground"> {tr('costoCalculo.netoProductor')}</span>
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
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
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className={tableHeaderRow}>
              <TableHead className="text-xs">{tr('tablaFormato.colFormato')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colCajas')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colLb')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colMatCaja')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colPackCaja')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colTotalCaja')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colMatTotal')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colPackTotal')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colCostoTotal')}</TableHead>
              <TableHead className="text-right text-xs">{tr('tablaFormato.colNeto')}</TableHead>
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
  tr,
}: {
  reportData: GenerateResponse;
  summaryNote: { pageInfo: string; truncated: boolean; emptyButTotal: string | null };
  /** Al establecer un productor, se expande su fila y se hace scroll a esta sección (p. ej. desde «Informe por productor»). */
  expandProducerIdRequest?: number | null;
  onExpandProducerHandled?: () => void;
  packingTariffsManualMode: boolean;
  liquidacionAudit: ReturnType<typeof computeLiquidacionAudit> | null;
  tr: (k: string) => string;
}) {
  const audit = useMemo(
    () =>
      liquidacionAudit ??
      computeLiquidacionAudit(reportData, packingTariffsManualMode, new Set<number>(), tr),
    [liquidacionAudit, reportData, packingTariffsManualMode],
  );
  const summary = reportData.producerSettlementSummary;
  const detail = reportData.producerSettlementDetail;
  const kpis = useMemo(() => computeLiquidacionKpis(summary), [summary]);
  const detailRows = (detail?.rows ?? []) as Record<string, unknown>[];
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const totalVentas = kpis.ventas > 0 ? kpis.ventas : 1;
  const summaryRows = (summary?.rows ?? []) as Record<string, unknown>[];
  const filt = reportData.filters as Record<string, unknown> | undefined;
  const periodoDesde = filt?.fecha_desde != null ? String(filt.fecha_desde) : '—';
  const periodoHasta = filt?.fecha_hasta != null ? String(filt.fecha_hasta) : '—';

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
                {tr('liquidacion.badge')}
              </Badge>
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-900">{tr('liquidacion.title')}</CardTitle>
            <CardDescription className="max-w-[52rem] text-sm leading-relaxed text-slate-700">
              {tr('liquidacion.desc')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 border-t border-slate-200/80 pt-4">
          {!summaryRows.length ? (
            <p className="text-sm text-muted-foreground">
              {summary?.total === 0
                ? tr('liquidacion.sinLiquidacion')
                : `${summaryNote.emptyButTotal ?? tr('liquidacion.sinLiquidacionHint')} ${summaryNote.pageInfo}`}
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                  label={tr('liquidacion.kpiVentas')}
                  value={fmtMoney(kpis.ventas)}
                  valueClassName={kpis.ventas > 0 ? 'text-[#1D9E75]' : undefined}
                />
                <KpiTile label={tr('liquidacion.kpiCajas')} value={formatBoxes(kpis.cajas)} />
                <KpiTile label={tr('liquidacion.kpiLb')} value={fmtQty(kpis.lb, 2)} />
                <KpiTile
                  label={tr('liquidacion.kpiMat')}
                  value={fmtMoney(kpis.materiales)}
                  valueClassName={
                    kpis.materiales === 0 && kpis.ventas > 0 ? 'text-amber-600' : undefined
                  }
                />
                <KpiTile
                  label={tr('liquidacion.kpiPacking')}
                  value={fmtMoney(kpis.packing)}
                  valueClassName={kpis.packing === 0 && kpis.ventas > 0 ? 'text-amber-600' : undefined}
                />
                <KpiTile
                  label={tr('liquidacion.kpiNeto')}
                  value={fmtMoney(kpis.netoSum)}
                  hint={tr('liquidacion.kpiNetoHint')}
                  valueClassName={
                    kpis.netoSum > 0
                      ? 'text-emerald-600'
                      : kpis.netoSum < 0
                        ? 'text-rose-600'
                        : undefined
                  }
                />
                <KpiTile
                  label={tr('liquidacion.kpiSinAsignar')}
                  value={
                    kpis.unassignedCount > 0
                      ? `${fmtMoney(kpis.unassignedVentas)} ventas · ${fmtQty(kpis.unassignedLb, 2)} lb`
                      : '—'
                  }
                  hint={
                    kpis.unassignedCount > 0 ? `${kpis.unassignedCount} ${tr('misc.filassinProductor')}` : tr('liquidacion.kpiSinAsignarHint')
                  }
                />
                <KpiTile
                  label={tr('liquidacion.kpiCostoTotal')}
                  value={fmtMoney(kpis.costoTotal)}
                  hint={tr('liquidacion.kpiCostoTotalHint')}
                />
              </div>
              {kpis.unassignedCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2">
                  <Badge variant="outline" className="border-destructive/50 bg-destructive/10 text-[11px] text-destructive">
                    {tr('liquidacion.sinAsignarRevision')}
                  </Badge>
                  <span className="text-xs text-amber-950">
                    {tr('misc.hayFilasSinProductor')} <strong className="font-medium">{tr('liquidacion.diagTrazabilidad')}</strong>{' '}
                    {tr('misc.hayFilasSinProductorEnd')}
                  </span>
                </div>
              ) : null}
              {summaryNote.truncated ? (
                <p className="text-xs text-amber-800">
                  {tr('liquidacion.paginaActual')} ({summaryNote.pageInfo}). Para totales globales poné página 1 y{' '}
                  {tr('liquidacion.limiteFiltros')}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{summaryNote.pageInfo}</p>

              <ComoSeCalculaElCostoCierreBlock reportData={reportData} kpis={kpis} />

              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm open:border-slate-300">
                <summary className="cursor-pointer font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  {tr('liquidacion.verCriterios')}
                </summary>
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <ReportSemanticBlock helpId="liquidacion-interna" />
                </div>
              </details>

              <div className="space-y-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {tr('liquidacion.porProductor')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summaryRows.length} {tr('misc.productoresPeriodo')} {periodoDesde} → {periodoHasta}
                  </p>
                </div>
                {summaryRows.length > 0 && summaryRows.length <= 8 ? (
                  <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {summaryRows.map((raw, cardIdx) => {
                      const r = raw as Record<string, unknown>;
                      const pct = (toNum(r.ventas) / totalVentas) * 100;
                      const netoN = toNum(r.neto_productor);
                      const cajasN = toNum(r.cajas);
                      const ventas = r.ventas;
                      const netoBadgeClass =
                        netoN > 0
                          ? 'border-emerald-300 text-emerald-800'
                          : netoN < 0
                            ? 'border-rose-300 text-rose-800'
                            : 'border-slate-300 text-slate-800';
                      const cardKey = `${producerDetailKey(r.productor_id)}-card-${cardIdx}`;
                      return (
                        <div
                          key={cardKey}
                          className="rounded-lg border border-border bg-background p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground" title={toStr(r.productor_nombre)}>
                              {toStr(r.productor_nombre)}
                            </p>
                            <Badge variant="outline" className={cn('max-w-[min(140px,45%)] shrink-0 truncate tabular-nums text-xs font-medium', netoBadgeClass)}>
                              {netoN >= 0 ? '+' : ''}
                              {fmtMoney(netoN)}
                            </Badge>
                          </div>
                          <div className="mb-3 h-1.5 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[#1D9E75]"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">{tr('liquidacion.colCajas')}</p>
                              <p className="font-medium">{formatBoxes(toNum(r.cajas))}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{tr('liquidacion.colLb')}</p>
                              <p className="font-medium">{fmtQty(r.lb, 0)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{tr('liquidacion.colVentas')}</p>
                              <p className="font-medium tabular-nums">{fmtMoney(ventas)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{tr('liquidacion.colPrecioCaja')}</p>
                              <p className="font-medium tabular-nums">
                                {cajasN > 0 ? fmtMoney(netoN / cajasN) : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px] [&_tbody_tr:last-child_td]:border-0">
                      <TableHeader>
                        <TableRow className={tableHeaderRow}>
                          <TableHead className="min-w-0 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 md:w-[18%]">
                            {tr('liquidacion.colProductor')}
                          </TableHead>
                          <TableHead className="w-[9%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colCajas')}
                          </TableHead>
                          <TableHead className="w-[11%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colLb')}
                          </TableHead>
                          <TableHead className="w-[17%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colVentas')}
                          </TableHead>
                          <TableHead className="w-[14%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colNetoProductor')}
                          </TableHead>
                          <TableHead className="w-[12%] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colCostoPromCaja')}
                          </TableHead>
                          <TableHead className="w-[11%] px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colEstado')}
                          </TableHead>
                          <TableHead className="w-[11%] whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {tr('liquidacion.colAccion')}
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
                                <TableCell className="max-w-[min(280px,40vw)] px-3 py-2.5 align-middle md:max-w-none">
                                  <span
                                    className="line-clamp-2 md:line-clamp-1 md:truncate block text-sm font-medium text-slate-900"
                                    title={toStr(r.productor_nombre)}
                                  >
                                    {toStr(r.productor_nombre)}
                                  </span>
                                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-[#1D9E75]"
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-sm tabular-nums text-slate-800">{formatBoxes(toNum(r.cajas))}</TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-sm tabular-nums text-slate-800">{fmtQty(r.lb, 2)}</TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle text-sm tabular-nums text-slate-800">{fmtMoney(r.ventas)}</TableCell>
                                <TableCell className="px-2 py-2.5 text-right align-middle">
                                  <p className={cn('tabular-nums font-bold md:text-[15px]', netoColor)}>
                                    {fmtMoney(r.neto_productor)}
                                  </p>
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    {cajasN > 0 ? `${fmtMoney(netoN / cajasN)}/caja` : ''}
                                  </p>
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
                                    {open ? tr('liquidacion.ocultar') : tr('liquidacion.verDetalle')}
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {open ? (
                                <TableRow className="border-0 bg-slate-50/90 hover:bg-slate-50/90">
                                  <TableCell colSpan={8} className="p-0">
                                    <div className="border-t border-slate-200 px-3 py-3 sm:px-4 space-y-3">
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('liquidacion.resumen')}</p>
                                      <p className="text-[13px] font-medium text-slate-800 md:text-center">
                                        <span className="text-muted-foreground">{tr('liquidacion.colVentas')}</span>{' '}
                                        <span className="tabular-nums">{fmtMoney(r.ventas)}</span>
                                        <span className="mx-2 text-slate-500">−</span>
                                        <span className="text-muted-foreground">{tr('liquidacionDetalle.colMateriales')}</span>{' '}
                                        <span className="tabular-nums text-slate-700">{fmtMoney(r.costo_materiales)}</span>
                                        <span className="mx-2 text-slate-500">−</span>
                                        <span className="text-muted-foreground">{tr('liquidacionDetalle.colPacking')}</span>{' '}
                                        <span className="tabular-nums text-slate-700">{fmtMoney(r.costo_packing)}</span>
                                        <span className="mx-2 font-semibold text-slate-500">=</span>
                                        <span className="text-muted-foreground">{tr('liquidacionDetalle.colNeto')}</span>{' '}
                                        <span className={cn('tabular-nums font-bold', netoColor)}>{fmtMoney(r.neto_productor)}</span>
                                      </p>
                                      {!packingTariffsManualMode && toNum(r.lb) > 0 && toNum(r.costo_packing) === 0 ? (
                                        <p className="flex items-start gap-2 rounded border border-amber-300/80 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
                                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                                          <span>
                                            <strong>{tr('misc.packingNocalculado')}</strong> {tr('misc.packingNocalculadoDesc')}
                                          </span>
                                        </p>
                                      ) : null}
                                      {toNum(r.costo_materiales) === 0 && toNum(r.ventas) > 0 && toNum(r.cajas) > 0 ? (
                                        <p className="flex items-start gap-2 rounded border border-amber-300/80 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
                                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                                          <span>
                                            <strong>{tr('misc.materialesEnCero')}</strong> {tr('misc.materialesEnCeroDesc')}
                                          </span>
                                        </p>
                                      ) : null}
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('liquidacion.tablaCompleta')}</p>
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
                                          <span className="font-semibold text-slate-800">{tr('misc.fuenteTrazabilidad')} </span>
                                          <span>{summaryTrace}</span>
                                        </div>
                                      ) : null}
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        {tr('misc.desgloseFormato')}
                                      </p>
                                      <ProducerLiquidacionFormatBreakdownTable
                                        productorIdRaw={pid}
                                        unassigned={unassigned}
                                        detailRows={detailRows}
                                        formatCostSummaryRows={(reportData.formatCostSummary?.rows ?? []) as Record<string, unknown>[]}
                                        packingManual={packingTariffsManualMode}
                                      />
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        {tr('misc.auditoriaProductor')}
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
                                                  {copy.okInforme ? tr('misc.listoInforme') : tr('misc.revisarInforme')}
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
                                        {tr('misc.detalleOperativo')}
                                      </p>
                                      <div className="rounded-lg border border-dashed border-slate-300 bg-white">
                                        {!hasDetailLines ? (
                                          <p className="px-3 py-3 text-sm leading-snug text-muted-foreground">
                                            {tr('misc.noDetalleOperativo')}
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
                  <span className="text-slate-400">▸</span> {tr('liquidacion.tablaCompleta')}
                </summary>
                <div className="border-t border-slate-200 pt-4">
                  <SectionTable
                    title={tr('liquidacionDetalle.title')}
                    section={reportData.producerSettlementDetail}
                    dense
                    subtitle={tr('liquidacionDetalle.desc')}
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  return (
    <Card className="border-slate-200/90 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-900">{tr('diagnostico.trazabilidadTitle')}</CardTitle>
        <CardDescription className="max-w-[52rem] text-sm leading-relaxed">
          {tr('diagnostico.trazabilidadDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <ul className="list-disc space-y-1.5 pl-5 marker:text-slate-400">
          <li>
            <span className="font-mono text-xs">{tr('diagnostico.regla1code')}</span> — {tr('diagnostico.regla1desc')}
          </li>
          <li>
            <span className="font-mono text-xs">{tr('diagnostico.regla2code')}</span> — {tr('diagnostico.regla2desc')}
          </li>
          <li>
            <span className="font-mono text-xs">{tr('diagnostico.regla3code')}</span> — {tr('diagnostico.regla3desc')}
          </li>
          <li>
            <span className="font-mono text-xs">{tr('diagnostico.regla4code')}</span> — {tr('diagnostico.regla4desc')}
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

/** Muestra primeras filas del bloque principal para validar antes de exportar. */
function ReportPreviewStrip({ data }: { data: GenerateResponse }) {
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const section = data.boxesByProducer;
  const rows = section?.rows ?? [];
  if (!rows.length) {
    return <div className={emptyStatePanel}>{tr('misc.sinFilasCajasPt')}</div>;
  }
  const preview = rows.slice(0, 15);
  const cols = Object.keys(preview[0] ?? {});
  return (
    <div className="space-y-2">
      <div>
        <p className={sectionTitle}>{tr('misc.tablaResumidaCajasPt')}</p>
        <p className={sectionHint}>{tr('misc.primeras15Filas')}</p>
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  if (!summary?.rows?.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tr('costoFormato.titleDetalle')}</CardTitle>
          <CardDescription>{tr('costoFormato.sinFilasDetalle')}</CardDescription>
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
                <CardTitle className="text-base">{tr('costoFormato.formatoTitle').replace('{code}', formatCode)}</CardTitle>
                <Badge variant="outline">{tr('costoFormato.labelCajas')} {formatLb(toNum(s.cajas), 2)}</Badge>
                <Badge variant="outline">{tr('costoFormato.labelLb')} {formatLb(lb, 2)}</Badge>
                <Badge variant="outline">{tr('costoFormato.labelMateriales')} {formatMoney(costoMateriales)}</Badge>
                <Badge variant="outline">{tr('costoFormato.labelPacking')} {formatMoney(toNum(s.costo_packing))}</Badge>
                <Badge variant="outline">{tr('costoFormato.labelTotal')} {formatMoney(toNum(s.costo_total))}</Badge>
                <Badge variant="outline">{tr('costoFormato.labelCostoCaja')} {formatTechnical(toNum(s.costo_por_caja), 4)}</Badge>
              </div>
              <CardDescription>
                {tr('costoFormato.financiero')} {tr('costoFormato.finCajas')}{' '}
                {formatLb(toNum(s.cajas), 2)}
                {' · '}{tr('costoFormato.finLb')}{' '}
                {formatLb(lb, 2)}
                {' · '}{tr('costoFormato.finMat')}{' '}
                {formatMoney(costoMateriales)}
                {' · '}{tr('costoFormato.finPack')}{' '}
                {formatMoney(toNum(s.costo_packing))}
                {' · '}{tr('costoFormato.finTotal')}{' '}
                {formatMoney(toNum(s.costo_total))}
                {' · '}{tr('costoFormato.finCostoCaja')}{' '}
                {formatTechnical(toNum(s.costo_por_caja), 4)}
              </CardDescription>
              {s.warning ? (
                <p className="text-xs text-amber-800">{toStr(s.warning)}</p>
              ) : null}
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-muted px-2 py-1">
                  {tr('costoFormato.precioCliente')} {s.precio_cliente == null ? '—' : formatTechnical(toNum(s.precio_cliente), 4)}
                </span>
                <span className="rounded-md bg-muted px-2 py-1">
                  {tr('costoFormato.deltaCaja')} {s.delta_por_caja == null ? '—' : formatTechnical(toNum(s.delta_por_caja), 4)}
                </span>
                <span className="rounded-md bg-muted px-2 py-1">
                  {tr('costoFormato.margenTotal')} {s.margen_total == null ? '—' : formatMoney(toNum(s.margen_total))}
                </span>
              </div>
              {detail.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tr('costoFormato.sinRecetas')}</p>
              ) : (
                <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tr('costoFormato.colMaterial')}</TableHead>
                      <TableHead>{tr('costoFormato.colTipo')}</TableHead>
                      <TableHead>{tr('costoFormato.colBase')}</TableHead>
                      <TableHead>{tr('costoFormato.colCantReceta')}</TableHead>
                      <TableHead>{tr('costoFormato.colFactorCaja')}</TableHead>
                      <TableHead>{tr('costoFormato.colConsumoTotal')}</TableHead>
                      <TableHead>{tr('costoFormato.colCostoUnit')}</TableHead>
                      <TableHead>{tr('costoFormato.colCostoTotal')}</TableHead>
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
                </div>
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
  const { t } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  if (!summary?.rows?.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tr('costoFormato.titleTablaResumen')}</CardTitle>
          <CardDescription>{tr('costoFormato.sinFilasResumen')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-slate-200/90 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/60 pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.titleResumen')}</CardTitle>
        <CardDescription className="mt-0.5 text-xs text-slate-500">
          {tr('costoFormato.descResumen')}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colFormato')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colCajas')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colLb')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colMatTotal')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colPackTotal')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colCostoTotal')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colMatCaja')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('costoFormato.colPackCaja')}</TableHead>
              <TableHead className="border-b border-slate-200 bg-slate-50/80 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 font-bold">{tr('costoFormato.colTotalCaja')}</TableHead>
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
              return (
                <TableRow key={`ops-${i}`} className={cn('border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                  <TableCell className="py-3 text-sm font-semibold text-slate-900">{toStr(r.format_code)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">{formatBoxes(cajas)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">{formatLb(lb, 2)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-600">{formatMoney(costoMateriales)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-600">{formatMoney(costoPacking)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">{formatMoney(costoTotal)}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-500">{materialPerBox != null ? formatTechnical(materialPerBox, 2) : '—'}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs tabular-nums text-slate-500">{packingPerBox != null ? formatTechnical(packingPerBox, 2) : '—'}</TableCell>
                  <TableCell className="py-3 text-right font-mono text-sm font-bold tabular-nums text-slate-900">{totalPerBox != null ? formatTechnical(totalPerBox, 2) : '—'}</TableCell>
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
  const { t, i18n } = useTranslation('common');
  const tr = (k: string) => t(`reporting.${k}`);
  const REPORT_MODULE_TABS = getReportModuleTabs(t);
  const docLang = i18n.language.startsWith('en') ? 'en' : 'es';

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
  const [surchargeFormatCode, setSurchargeFormatCode] = useState('');
  const [surchargePerLb, setSurchargePerLb] = useState('');
  const [surchargeSeason, setSurchargeSeason] = useState('');
  const [surchargeActive, setSurchargeActive] = useState(true);
  const [surchargeNotes, setSurchargeNotes] = useState('');
  const [adjName, setAdjName] = useState('');
  const [adjType, setAdjType] = useState<'per_box' | 'per_lb' | 'percent'>('per_box');
  const [adjValue, setAdjValue] = useState('');
  const [adjFormatCode, setAdjFormatCode] = useState('');
  const [adjProducerId, setAdjProducerId] = useState<number>(0);
  const [adjSeason, setAdjSeason] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [adjActive, setAdjActive] = useState(true);
  const [machineRatePerLb, setMachineRatePerLb] = useState('');
  const [machineRateSpeciesId, setMachineRateSpeciesId] = useState<number>(0);
  const [machineRateSeason, setMachineRateSeason] = useState('');
  const [machineRateNotes, setMachineRateNotes] = useState('');
  const [machineRateActive, setMachineRateActive] = useState(true);
  const [useAdjustedCost, setUseAdjustedCost] = useState(false);
  const [reportTab, setReportTab] = useState<ReportModuleTab>('cierre');
  /** Tarifas packing: abierto por defecto en Cierre para configurar antes de generar liquidación. */
  const [packingTariffsSectionOpen, setPackingTariffsSectionOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Productor elegido solo para informe PDF/Excel por productor en Cierre (no altera el generado global). */
  const [cierreInformeProducerId, setCierreInformeProducerId] = useState<number | null>(null);
  const [producerRowExpandRequest, setProducerRowExpandRequest] = useState<number | null>(null);
  const [cierreView, setCierreView] = useState<'global' | 'productor'>('global');

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

  const { data: producersCatalog } = useQuery({
    queryKey: ['masters', 'producers'],
    queryFn: () => apiJson<ReportMasterProducer[]>('/api/masters/producers'),
  });

  const { data: clientsCatalog } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<ReportMasterClient[]>('/api/masters/clients'),
  });

  const { data: varietiesCatalog } = useQuery({
    queryKey: ['masters', 'varieties'],
    queryFn: () => apiJson<ReportMasterVariety[]>('/api/masters/varieties'),
  });

  const producersSorted = useMemo(
    () => [...(producersCatalog ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [producersCatalog],
  );
  const clientsSorted = useMemo(
    () => [...(clientsCatalog ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [clientsCatalog],
  );
  const varietiesSorted = useMemo(
    () => [...(varietiesCatalog ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [varietiesCatalog],
  );

  const { data: packingCosts, isPending: packingCostsLoading } = useQuery({
    queryKey: ['reporting', 'packing-costs'],
    queryFn: () => apiJson<PackingCostRow[]>('/api/reporting/packing-costs'),
  });

  const { data: formatSurcharges, isLoading: formatSurchargesLoading, refetch: refetchFormatSurcharges } = useQuery({
    queryKey: ['reporting', 'packing-format-surcharges'],
    queryFn: () => apiJson<PackingFormatSurcharge[]>('/api/reporting/packing-format-surcharges'),
  });

  const {
    data: materialAdjustments,
    isLoading: materialAdjustmentsLoading,
    refetch: refetchMaterialAdjustments,
  } = useQuery<MaterialCostAdjustment[]>({
    queryKey: ['reporting', 'material-cost-adjustments'],
    queryFn: () => apiJson<MaterialCostAdjustment[]>('/api/reporting/material-cost-adjustments'),
  });

  const {
    data: machineRates,
    isLoading: machineRatesLoading,
    refetch: refetchMachineRates,
  } = useQuery<MachineProcessingRate[]>({
    queryKey: ['reporting', 'machine-processing-rates'],
    queryFn: () => apiJson<MachineProcessingRate[]>('/api/reporting/machine-processing-rates'),
  });

  const { data: presentationFormatsForSurcharge } = useQuery({
    queryKey: ['masters', 'presentation-formats', 'reporting-surcharges'],
    queryFn: () => apiJson<Array<{ format_code: string; activo?: boolean }>>('/api/masters/presentation-formats'),
  });
  const activePresFormats = useMemo(
    () => (presentationFormatsForSurcharge ?? []).filter((f) => f.activo !== false),
    [presentationFormatsForSurcharge],
  );

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
    return computeLiquidacionAudit(reportData, !!cierrePackingManualMode, cierreMissingSpeciesIdSet, tr);
  }, [reportData, cierrePackingManualMode, cierreMissingSpeciesIdSet]);

  const informeExportVisual = useMemo(() => {
    if (!liquidacionAudit || cierreInformeProducerId == null) {
      return { tier: 'none' as const, title: '', detailLines: [] as string[] };
    }
    return informePerProducerExportTier({
      producerId: cierreInformeProducerId,
      readiness: cierreInformeReadiness,
      audit: liquidacionAudit,
      tr,
    });
  }, [liquidacionAudit, cierreInformeProducerId, cierreInformeReadiness, tr]);

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

  const upsertFormatSurchargeMut = useMutation({
    mutationFn: (body: {
      format_code: string;
      surcharge_per_lb: number;
      season?: string | null;
      active: boolean;
      notes?: string | null;
    }) =>
      apiJson('/api/reporting/packing-format-surcharges', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Recargo por formato guardado');
      void refetchFormatSurcharges();
      setSurchargeFormatCode('');
      setSurchargePerLb('');
      setSurchargeSeason('');
      setSurchargeActive(true);
      setSurchargeNotes('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertMaterialAdjMut = useMutation({
    mutationFn: (body: {
      name: string;
      adjustment_type: 'per_box' | 'per_lb' | 'percent';
      value: number;
      format_code?: string | null;
      producer_id?: number | null;
      season?: string | null;
      notes?: string | null;
      active: boolean;
    }) =>
      apiJson<MaterialCostAdjustment>('/api/reporting/material-cost-adjustments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Ajuste de materiales guardado');
      void refetchMaterialAdjustments();
      setAdjName('');
      setAdjType('per_box');
      setAdjValue('');
      setAdjFormatCode('');
      setAdjProducerId(0);
      setAdjSeason('');
      setAdjNotes('');
      setAdjActive(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertMachineRateMut = useMutation({
    mutationFn: (body: {
      rate_per_lb: number;
      species_id?: number | null;
      season?: string | null;
      active: boolean;
      notes?: string | null;
    }) =>
      apiJson<MachineProcessingRate>('/api/reporting/machine-processing-rates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Tarifa de procesado máquina guardada');
      void refetchMachineRates();
      setMachineRatePerLb('');
      setMachineRateSpeciesId(0);
      setMachineRateSeason('');
      setMachineRateNotes('');
      setMachineRateActive(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMaterialAdjMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/reporting/material-cost-adjustments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar ajuste');
    },
    onSuccess: () => {
      toast.success('Ajuste eliminado');
      void refetchMaterialAdjustments();
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
      lang: docLang,
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

  const periodFilterFieldsGrid = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-desde">{tr('periodo.desde')}</label>
        <Input
          id="rep-desde"
          type="date"
          className={filterInputClass}
          value={draft.fecha_desde ?? filters.fecha_desde ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, fecha_desde: e.target.value || undefined }))}
        />
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-hasta">{tr('periodo.hasta')}</label>
        <Input
          id="rep-hasta"
          type="date"
          className={filterInputClass}
          value={draft.fecha_hasta ?? filters.fecha_hasta ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, fecha_hasta: e.target.value || undefined }))}
        />
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-page">{tr('periodo.pagina')}</label>
        <Input
          id="rep-page"
          type="number"
          min={1}
          className={filterInputClass}
          value={draft.page ?? filters.page}
          onChange={(e) => setDraft((d) => ({ ...d, page: Math.max(1, Number(e.target.value) || 1) }))}
        />
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-limit">{tr('periodo.limite')}</label>
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
        <label className={filterLabel} htmlFor="rep-productor">{tr('periodo.productor')}</label>
        <select
          id="rep-productor"
          className={reportFilterCatalogSelectClass}
          value={
            (draft.productor_id ?? filters.productor_id) != null ? String(draft.productor_id ?? filters.productor_id) : ''
          }
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({
              ...d,
              productor_id: v === '' ? undefined : Number(v) || undefined,
            }));
          }}
        >
          <option value="">{tr('periodo.allProductores')}</option>
          {producersSorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-cliente">{tr('periodo.cliente')}</label>
        <select
          id="rep-cliente"
          className={reportFilterCatalogSelectClass}
          value={(draft.cliente_id ?? filters.cliente_id) != null ? String(draft.cliente_id ?? filters.cliente_id) : ''}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({
              ...d,
              cliente_id: v === '' ? undefined : Number(v) || undefined,
            }));
          }}
        >
          <option value="">{tr('periodo.allClientes')}</option>
          {clientsSorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-variedad">{tr('periodo.variedad')}</label>
        <select
          id="rep-variedad"
          className={reportFilterCatalogSelectClass}
          value={(draft.variedad_id ?? filters.variedad_id) != null ? String(draft.variedad_id ?? filters.variedad_id) : ''}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({
              ...d,
              variedad_id: v === '' ? undefined : Number(v) || undefined,
            }));
          }}
        >
          <option value="">{tr('periodo.allVariedades')}</option>
          {varietiesSorted.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-tarja">{tr('periodo.tarjaId')}</label>
        <Input
          id="rep-tarja"
          type="number"
          min={0}
          className={filterInputClass}
          placeholder={tr('periodo.opcional')}
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
        <label className={filterLabel} htmlFor="rep-format">{tr('periodo.codigoFormato')}</label>
        <Input
          id="rep-format"
          className={filterInputClass}
          placeholder={tr('periodo.opcional')}
          value={draft.format_code ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, format_code: e.target.value || undefined }))}
        />
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-precio-packing">{tr('periodo.precioPackingManual')}</label>
        <Input
          id="rep-precio-packing"
          type="number"
          step="0.0001"
          className={filterInputClass}
          placeholder={tr('periodo.opcional')}
          value={draft.precio_packing_por_lb ?? ''}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              precio_packing_por_lb: e.target.value === '' ? undefined : Number(e.target.value) || undefined,
            }))
          }
        />
      </div>
      <div className="grid gap-1.5">
        <label className={filterLabel} htmlFor="rep-calidad">{tr('periodo.calidad')}</label>
        <Input
          id="rep-calidad"
          className={filterInputClass}
          placeholder={tr('periodo.opcional')}
          value={draft.calidad ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, calidad: e.target.value || undefined }))}
        />
      </div>
    </div>
  );

  return (
    <div className={pageStack}>
      <div className={pageHeaderRow}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={pageTitle}>{tr('title')}</h1>
          </div>
          <p className={cn(pageSubtitle, 'mt-1')}>
            {tr('subtitle')}
          </p>
        </div>
        <Link
          to="/guide/sistema"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          {tr('guideLink')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-100 bg-white/90 p-1.5 shadow-sm">
        {REPORT_MODULE_TABS.map((tab) => {
          const active = reportTab === tab.id;
          const icons: Record<string, ReactNode> = {
            operacion: <BarChart2 className="h-3.5 w-3.5" aria-hidden />,
            decision: <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />,
            cierre: <Layers className="h-3.5 w-3.5" aria-hidden />,
            documentos: <FileText className="h-3.5 w-3.5" aria-hidden />,
          };
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setReportTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors duration-150',
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              {icons[tab.id]}
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center pr-1">
          <p className="text-[12px] text-slate-400">
            {REPORT_MODULE_TABS.find((tab) => tab.id === reportTab)?.subtitle ?? ''}
          </p>
        </div>
      </div>

      {reportTab === 'cierre' ? (
        <div className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">

          {/* Tarjeta TARIFAS */}
          <details
            id="rep-cierre-config"
            className="group scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            open={packingTariffsSectionOpen}
            onToggle={(e) => setPackingTariffsSectionOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <DollarSign className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{tr('cierre.packingRates')}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{tr('cierre.packingRatesDesc')}</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
              </div>
            </summary>
            <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
              <p className="text-xs leading-relaxed text-slate-500">{tr('cierre.packingRatesHelp')}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={showInactivePackingCosts}
                    onChange={(e) => setShowInactivePackingCosts(e.target.checked)}
                  />
                  {tr('cierre.showInactive')}
                </label>
                {hiddenPackingSpeciesIds.size > 0 ? (
                  <Button type="button" variant="link" className="h-auto p-0 text-xs text-primary" onClick={() => setHiddenPackingSpeciesIds(new Set())}>
                    {tr('cierre.restoreHidden')} ({hiddenPackingSpeciesIds.size})
                  </Button>
                ) : null}
              </div>
              {canManagePackingCosts ? (
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-slate-500">{tr('cierre.species')}</Label>
                    <select
                      className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                      value={packingSpeciesId}
                      onChange={(e) => setPackingSpeciesId(Number(e.target.value))}
                    >
                      <option value={0}>{tr('cierre.chooseDots')}</option>
                      {(species ?? []).map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-slate-500">{tr('cierre.season')}</Label>
                    <Input className="h-9" value={packingSeason} onChange={(e) => setPackingSeason(e.target.value)} placeholder="2026-2027" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-slate-500">{tr('cierre.pricePerLb')}</Label>
                    <Input className="h-9 font-mono" type="number" step="0.000001" min={0} value={packingPrice} onChange={(e) => setPackingPrice(e.target.value)} placeholder="0.1200" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-slate-500">{tr('cierre.active')}</Label>
                    <select className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm" value={packingActive ? '1' : '0'} onChange={(e) => setPackingActive(e.target.value === '1')}>
                      <option value="1">{tr('cierre.yes')}</option>
                      <option value="0">{tr('cierre.no')}</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <Button type="button" size="sm" disabled={upsertPackingCostMut.isPending || packingSpeciesId <= 0 || packingPrice.trim() === ''} onClick={() => upsertPackingCostMut.mutate()}>
                      {upsertPackingCostMut.isPending ? tr('cierre.saving') : tr('cierre.saveRate')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {packingCostsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('cierre.colSpecies')}</TableHead>
                        <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('cierre.colSeason')}</TableHead>
                        <TableHead className="border-b border-slate-200 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('cierre.colPricePerLb')}</TableHead>
                        <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('cierre.colStatus')}</TableHead>
                        <TableHead className="border-b border-slate-200 py-2.5 w-[80px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiblePackingCosts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-400">
                            {packingCosts?.length ? tr('cierre.noRows') : tr('cierre.noConfig')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        visiblePackingCosts.map((r, i) => (
                          <TableRow key={r.id} className={cn('border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                            <TableCell className="py-2.5 text-sm font-medium text-slate-900">{r.species_name ?? `#${r.species_id}`}</TableCell>
                            <TableCell className="py-2.5 text-sm text-slate-600">{r.season ?? '—'}</TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">{formatMoney(Number(r.price_per_lb))}</TableCell>
                            <TableCell className="py-2.5 text-xs leading-snug">
                              {cierrePackingManualMode ? (
                                <span className="text-slate-400">{tr('cierre.manualMode')}</span>
                              ) : cierreMissingSpeciesIdSet.has(r.species_id) ? (
                                <span className="font-medium text-rose-600">{tr('cierre.missingRate')}</span>
                              ) : r.active && Number(r.price_per_lb) > 0 ? (
                                <span className="font-medium text-emerald-600">{tr('cierre.rateActive')}</span>
                              ) : (
                                <span className="text-amber-600">{tr('cierre.noEffectiveRate')}</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-slate-400 hover:text-slate-700" onClick={() => setHiddenPackingSpeciesIds((prev) => new Set([...prev, r.species_id]))}>
                                {tr('cierre.hide')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Recargos por formato */}
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{tr('cierre.surcharges')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tr('cierre.surchargesDesc')}
                  </p>
                </div>

                {canManagePackingCosts ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-4">
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label className="text-xs text-slate-500">{tr('cierre.format')}</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={surchargeFormatCode}
                        onChange={(e) => setSurchargeFormatCode(e.target.value)}
                      >
                        <option value="">{tr('cierre.chooseFormat')}</option>
                        {(activePresFormats ?? []).map((f) => (
                          <option key={f.format_code} value={f.format_code}>
                            {f.format_code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('cierre.surchargePerLb')}</Label>
                      <Input
                        className="h-9 font-mono"
                        type="number"
                        step="0.000001"
                        min={0}
                        value={surchargePerLb}
                        onChange={(e) => setSurchargePerLb(e.target.value)}
                        placeholder="0.0500"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('recargos.temporada')}</Label>
                      <Input
                        className="h-9"
                        value={surchargeSeason}
                        onChange={(e) => setSurchargeSeason(e.target.value)}
                        placeholder="2026-2027"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('recargos.notas')}</Label>
                      <Input
                        className="h-9"
                        value={surchargeNotes}
                        onChange={(e) => setSurchargeNotes(e.target.value)}
                        placeholder="Ej. Jumbo size extra"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">Activo</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={surchargeActive ? '1' : '0'}
                        onChange={(e) => setSurchargeActive(e.target.value === '1')}
                      >
                        <option value="1">Sí</option>
                        <option value="0">No</option>
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          upsertFormatSurchargeMut.isPending ||
                          !surchargeFormatCode ||
                          !surchargePerLb.trim()
                        }
                        onClick={() =>
                          upsertFormatSurchargeMut.mutate({
                            format_code: surchargeFormatCode,
                            surcharge_per_lb: Number(surchargePerLb),
                            season: surchargeSeason.trim() || null,
                            active: surchargeActive,
                            notes: surchargeNotes.trim() || null,
                          })
                        }
                      >
                        {upsertFormatSurchargeMut.isPending ? 'Guardando…' : tr('cierre.guardarRecargo')}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {formatSurchargesLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (formatSurcharges ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400">Sin recargos por formato configurados.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Formato</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recargo/lb</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Temporada</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notas</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(formatSurcharges ?? []).map((r, i) => (
                          <TableRow key={r.id} className={cn('border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                            <TableCell className="py-2.5 font-mono text-sm font-semibold text-slate-900">{r.format_code}</TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                              +{formatMoney(Number(r.surcharge_per_lb))}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-slate-600">{r.season ?? '—'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-500">{r.notes ?? '—'}</TableCell>
                            <TableCell className="py-2.5 text-xs">
                              {r.active
                                ? <span className="font-medium text-emerald-600">✓ Activo</span>
                                : <span className="text-slate-400">Inactivo</span>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* ── Procesado máquina ── */}
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Rate procesado máquina</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cargo adicional USD/lb para fruta de cosecha máquina (<strong className="text-slate-700">machine_picking</strong>).
                    Se suma al costo de packing en la liquidación.
                  </p>
                </div>

                {canManagePackingCosts ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">Rate / lb</Label>
                      <Input
                        className="h-9 font-mono"
                        type="number"
                        step="0.000001"
                        min={0}
                        value={machineRatePerLb}
                        onChange={(e) => setMachineRatePerLb(e.target.value)}
                        placeholder="0.0500"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">Especie (vacío = todas)</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={machineRateSpeciesId}
                        onChange={(e) => setMachineRateSpeciesId(Number(e.target.value))}
                      >
                        <option value={0}>Todas las especies</option>
                        {(species ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{s.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">Temporada (opc.)</Label>
                      <Input
                        className="h-9"
                        value={machineRateSeason}
                        onChange={(e) => setMachineRateSeason(e.target.value)}
                        placeholder="2026-2027"
                      />
                    </div>
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label className="text-xs text-slate-500">Notas (opc.)</Label>
                      <Input
                        className="h-9"
                        value={machineRateNotes}
                        onChange={(e) => setMachineRateNotes(e.target.value)}
                        placeholder="Ej. IQF temporada alta"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">Activo</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={machineRateActive ? '1' : '0'}
                        onChange={(e) => setMachineRateActive(e.target.value === '1')}
                      >
                        <option value="1">Sí</option>
                        <option value="0">No</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled={upsertMachineRateMut.isPending || !machineRatePerLb.trim()}
                        onClick={() =>
                          upsertMachineRateMut.mutate({
                            rate_per_lb: Number(machineRatePerLb),
                            species_id: machineRateSpeciesId > 0 ? machineRateSpeciesId : null,
                            season: machineRateSeason.trim() || null,
                            active: machineRateActive,
                            notes: machineRateNotes.trim() || null,
                          })
                        }
                      >
                        {upsertMachineRateMut.isPending ? 'Guardando…' : 'Guardar rate máquina'}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {machineRatesLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (machineRates ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400">Sin rates de máquina configurados.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Especie</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rate/lb</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Temporada</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notas</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(machineRates ?? []).map((r, i) => (
                          <TableRow key={r.id} className={cn('border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                            <TableCell className="py-2.5 text-sm text-slate-700">
                              {r.species_id != null
                                ? (species ?? []).find((s) => s.id === r.species_id)?.nombre ?? `#${r.species_id}`
                                : 'Todas'}
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                              +{formatMoney(Number(r.rate_per_lb))}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-slate-600">{r.season ?? '—'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-500">{r.notes ?? '—'}</TableCell>
                            <TableCell className="py-2.5 text-xs">
                              {r.active
                                ? <span className="font-medium text-emerald-600">✓ Activa</span>
                                : <span className="text-slate-400">Inactiva</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* ── Ajustes de escenario — materiales ── */}
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{tr('ajustes.title')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {tr('ajustes.desc1')}
                      {' '}
                      {tr('ajustes.desc2')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-500">{tr('ajustes.vistaLabel')}</span>
                    <button
                      type="button"
                      onClick={() => setUseAdjustedCost(false)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                        !useAdjustedCost
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {tr('ajustes.vistaReal')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseAdjustedCost(true)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                        useAdjustedCost
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {tr('ajustes.vistaAjustado')}
                    </button>
                  </div>
                </div>

                {canManagePackingCosts ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-4">
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label className="text-xs text-slate-500">{tr('ajustes.nombreEscenario')}</Label>
                      <Input
                        className="h-9"
                        value={adjName}
                        onChange={(e) => setAdjName(e.target.value)}
                        placeholder={tr('ajustes.nombrePlaceholder')}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.tipoAjuste')}</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={adjType}
                        onChange={(e) => setAdjType(e.target.value as 'per_box' | 'per_lb' | 'percent')}
                      >
                        <option value="per_box">{tr('ajustes.porCaja')}</option>
                        <option value="per_lb">{tr('ajustes.porLb')}</option>
                        <option value="percent">{tr('ajustes.porPct')}</option>
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.valor')}</Label>
                      <Input
                        className="h-9 font-mono"
                        type="number"
                        step="0.000001"
                        min={0}
                        value={adjValue}
                        onChange={(e) => setAdjValue(e.target.value)}
                        placeholder={adjType === 'percent' ? tr('ajustes.valPlaceholderPct') : tr('ajustes.valPlaceholderFixed')}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.formatoVacio')}</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={adjFormatCode}
                        onChange={(e) => setAdjFormatCode(e.target.value)}
                      >
                        <option value="">{tr('ajustes.allFormatos')}</option>
                        {(activePresFormats ?? []).map((f) => (
                          <option key={f.format_code} value={f.format_code}>
                            {f.format_code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.productorVacio')}</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={adjProducerId}
                        onChange={(e) => setAdjProducerId(Number(e.target.value))}
                      >
                        <option value={0}>{tr('ajustes.allProductores')}</option>
                        {(producersSorted ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.temporada')}</Label>
                      <Input
                        className="h-9"
                        value={adjSeason}
                        onChange={(e) => setAdjSeason(e.target.value)}
                        placeholder="2026-2027"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.notas')}</Label>
                      <Input
                        className="h-9"
                        value={adjNotes}
                        onChange={(e) => setAdjNotes(e.target.value)}
                        placeholder={tr('ajustes.notasPlaceholder')}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-slate-500">{tr('ajustes.activo')}</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                        value={adjActive ? '1' : '0'}
                        onChange={(e) => setAdjActive(e.target.value === '1')}
                      >
                        <option value="1">{tr('ajustes.si')}</option>
                        <option value="0">{tr('ajustes.no')}</option>
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <Button
                        type="button"
                        size="sm"
                        disabled={upsertMaterialAdjMut.isPending || !adjName.trim() || !adjValue.trim()}
                        onClick={() =>
                          upsertMaterialAdjMut.mutate({
                            name: adjName,
                            adjustment_type: adjType,
                            value: Number(adjValue),
                            format_code: adjFormatCode || null,
                            producer_id: adjProducerId > 0 ? adjProducerId : null,
                            season: adjSeason.trim() || null,
                            notes: adjNotes.trim() || null,
                            active: adjActive,
                          })
                        }
                      >
                        {upsertMaterialAdjMut.isPending ? tr('ajustes.saving') : tr('ajustes.guardar')}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {materialAdjustmentsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (materialAdjustments ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400">{tr('ajustes.sinAjustes')}</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('ajustes.colEscenario')}</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('ajustes.colTipo')}</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('ajustes.colValor')}</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('ajustes.colFormato')}</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('ajustes.colProductor')}</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr('ajustes.colEstado')}</TableHead>
                          <TableHead className="border-b border-slate-200 py-2.5 w-[60px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(materialAdjustments ?? []).map((r, i) => (
                          <TableRow key={r.id} className={cn('border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                            <TableCell className="py-2.5 text-sm font-semibold text-slate-900">{r.name}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-600">
                              {r.adjustment_type === 'per_box' ? tr('ajustes.unidadCaja') : r.adjustment_type === 'per_lb' ? tr('ajustes.unidadLb') : tr('ajustes.unidadPct')}
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                              {r.adjustment_type === 'percent'
                                ? `${formatTechnical(Number(r.value), 2)}%`
                                : `+${formatMoney(Number(r.value))}`}
                            </TableCell>
                            <TableCell className="py-2.5 font-mono text-xs text-slate-700">{r.format_code ?? tr('ajustes.todos')}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-600">
                              {r.producer_id != null
                                ? producersSorted.find((p) => p.id === r.producer_id)?.nombre ?? `#${r.producer_id}`
                                : tr('ajustes.todos')}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs">
                              {r.active
                                ? <span className="font-medium text-emerald-600">{tr('ajustes.activo2')}</span>
                                : <span className="text-slate-400">{tr('ajustes.inactivo')}</span>}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-rose-500 hover:text-rose-700"
                                disabled={deleteMaterialAdjMut.isPending}
                                onClick={() => deleteMaterialAdjMut.mutate(r.id)}
                              >
                                {tr('ajustes.quitar')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {useAdjustedCost && (materialAdjustments ?? []).filter((a) => a.active).length > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    <span className="font-semibold">{tr('ajustes.vistaAjustadaActiva')}</span>
                    {(materialAdjustments ?? []).filter((a) => a.active).map((a) => a.name).join(', ')}
                    {' '}{tr('ajustes.aplicarHint')}
                  </div>
                ) : null}
              </div>
            </div>
          </details>

          {/* Tarjeta PERÍODO */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <RefreshCw className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{tr('periodo.title')}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {filters.fecha_desde ?? '—'} → {filters.fecha_hasta ?? '—'} · {tr('periodo.pagLabel')} {filters.page} · {filters.limit} {tr('periodo.filasLabel')}
                </p>
              </div>
              <Button
                type="button"
                className={cn(btnToolbarPrimary, 'gap-2 shrink-0')}
                onClick={runMergedGenerate}
                disabled={generateMut.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                {generateMut.isPending ? tr('periodo.generando') : tr('periodo.actualizar')}
              </Button>
            </div>
            <details
              id="rep-filtros-globales"
              className="group"
              open={filtersOpen}
              onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer list-none px-5 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  {tr('periodo.filtros')}
                </div>
              </summary>
              <div className="space-y-3 border-t border-slate-100 px-5 py-4">
                {periodFilterFieldsGrid}
              </div>
            </details>
          </div>

        </div>
        </div>
      ) : null}

      {activeSavedId != null && canSave && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              {tr('misc.estasviendo')} <strong>#{activeSavedId}</strong>. {tr('misc.regenerarSincronizar')}
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
              <EodPlanningSection
                showCommercialOffer={false}
                showDailyPlanningKpis
                showFinDelDia
                finFirst={false}
                finOpenByDefault
                planningDomId="rep-operacion-diaria"
                finDelDiaDomId="rep-operacion-fin-dia"
                planningHint={tr('operacion.kpisHint')}
              />
            </>
          ) : null}

          {reportTab === 'decision' ? (
            <EodPlanningSection showCommercialOffer showDailyPlanningKpis={false} showFinDelDia={false} />
          ) : null}

          {reportTab === 'cierre' && reportData ? (
            <div className="space-y-5">

              {/* ── ESTADO + AUDITOR ── */}
              <CierreEstadoDelCierreStrip
                packingManual={!!cierrePackingManualMode}
                missingTariffLabels={cierreMissingTariffSpecies}
                producersMissingDetail={cierreProducersMissingDetail}
                informeProducerId={cierreInformeProducerId}
                informeProducerReady={cierreInformeReadiness.ready}
                informeProducerIssues={cierreInformeReadiness.issues}
                zeroCostLines={cierreZeroCostLines}
                kpisPackingZeroNoManual={cierreKpisPackingZeroNoManual}
                tr={tr}
              />
              {liquidacionAudit ? (
                <LiquidacionAuditorBlock audit={liquidacionAudit} packingManual={!!cierrePackingManualMode} tr={tr} />
              ) : null}

              {/* ── SELECTOR DE VISTA ── */}
              <div className="grid grid-cols-2 gap-3 lg:gap-4">
                {/* Liquidación global */}
                <button
                  type="button"
                  onClick={() => setCierreView('global')}
                  className={cn(
                    'group flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-4 text-left shadow-sm transition-all sm:items-start sm:gap-4 sm:p-5 lg:p-6',
                    cierreView === 'global'
                      ? 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md',
                  )}
                >
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
                    cierreView === 'global' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
                  )}>
                    <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{tr('cierre.viewGlobal')}</p>
                    <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">{tr('cierre.viewGlobalDesc')}</p>
                  </div>
                </button>
                {/* Por productor */}
                <button
                  type="button"
                  onClick={() => setCierreView('productor')}
                  className={cn(
                    'group flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-4 text-left shadow-sm transition-all sm:items-start sm:gap-4 sm:p-5 lg:p-6',
                    cierreView === 'productor'
                      ? 'border-emerald-300 bg-emerald-50/60 ring-2 ring-emerald-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md',
                  )}
                >
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
                    cierreView === 'productor' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500',
                  )}>
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{tr('cierre.viewProducer')}</p>
                    <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">{tr('cierre.viewProducerDesc')}</p>
                  </div>
                </button>
              </div>

              {/* ── VISTA GLOBAL ── */}
              {cierreView === 'global' ? (
                <div className="space-y-5">

                  <LiquidacionFinalModule
                    reportData={reportData}
                    summaryNote={reportPaginationNote(reportData.producerSettlementSummary, tr)}
                    expandProducerIdRequest={producerRowExpandRequest}
                    onExpandProducerHandled={() => setProducerRowExpandRequest(null)}
                    packingTariffsManualMode={!!cierrePackingManualMode}
                    liquidacionAudit={liquidacionAudit}
                    tr={tr}
                  />

                  {/* Exportaciones */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-slate-900">{tr('cierre.exports')}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{tr('cierre.exportsDesc')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 px-5 py-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="gap-1.5"
                        disabled={!reportData}
                        onClick={async () => {
                          if (!reportData || !reportFiltersForPdf) return;
                          const base = `cierre-${reportFiltersForPdf.fecha_desde ?? 'ini'}-${reportFiltersForPdf.fecha_hasta ?? 'fin'}`;
                          const period = reportFiltersForPdf.fecha_desde != null && reportFiltersForPdf.fecha_hasta != null
                            ? `${String(reportFiltersForPdf.fecha_desde)} → ${String(reportFiltersForPdf.fecha_hasta)}`
                            : reportFiltersForPdf.fecha_desde != null ? `desde ${String(reportFiltersForPdf.fecha_desde)}`
                            : reportFiltersForPdf.fecha_hasta != null ? `hasta ${String(reportFiltersForPdf.fecha_hasta)}`
                            : docLang === 'en' ? 'Full period' : 'Período completo';
                          try {
                            const q = toQuery({ ...reportFiltersForPdf, page: 1, limit: 9999, lang: docLang });
                            const settlement = await apiJson<{
                              producerSettlementSummary?: { rows: Record<string, unknown>[] };
                              producerSettlementDetail?:  { rows: Record<string, unknown>[] };
                              formatCostSummary?:         { rows: Record<string, unknown>[] };
                            }>(`/api/reporting/producer-settlement?${q}`);
                            await downloadSettlementExcelAll({
                              fileBase: base,
                              summaryRows:         settlement.producerSettlementSummary?.rows ?? [],
                              detailRows:          settlement.producerSettlementDetail?.rows  ?? [],
                              formatCostSummaryRows: settlement.formatCostSummary?.rows       ?? [],
                              period,
                              company: ((import.meta.env as Record<string, string | undefined>).VITE_COMPANY_DISPLAY_NAME) ?? '',
                              lang: docLang,
                            });
                            toast.success(docLang === 'en' ? 'Excel generated.' : 'Excel generado.');
                          } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {docLang === 'en' ? 'Excel settlement' : 'Excel liquidación'}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={!reportData || !reportFiltersForPdf}
                        onClick={async () => {
                          if (!reportFiltersForPdf) return;
                          try {
                            const q = toQuery({ ...reportFiltersForPdf, page: 1, limit: 9999 });
                            const settlement = await apiJson<{
                              producerSettlementSummary?: { rows: Record<string, unknown>[] };
                              producerSettlementDetail?:  { rows: Record<string, unknown>[] };
                            }>(`/api/reporting/producer-settlement?${q}`);
                            const summaryRows = (settlement.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[];
                            const detailRows  = settlement.producerSettlementDetail?.rows  ?? [];
                            const headers = docLang === 'en'
                              ? ['Producer','Dispatch #','Format','Boxes','LB','Sales','Materials','Pack fee','Net']
                              : ['Productor','N° Despacho','Formato','Cajas','LB','Ventas','Materiales','Pack fee','Neto'];
                            const lines: string[] = [headers.join(',')];
                            for (const d of detailRows) {
                              lines.push([
                                `"${String(d.productor_nombre ?? '')}"`,
                                String(d.dispatch_number ?? d.dispatch_id ?? ''),
                                `"${String(d.format_code ?? '')}"`,
                                String(d.cajas ?? ''),
                                String(d.lb ?? ''),
                                String(d.ventas ?? ''),
                                String(d.costo_materiales ?? ''),
                                String(d.costo_packing ?? ''),
                                String(d.neto ?? ''),
                              ].join(','));
                            }
                            // Totals row
                            type Totals = { ventas: number; mat: number; pack: number; neto: number; cajas: number; lb: number };
                            const tot = summaryRows.reduce<Totals>(
                              (acc, r) => ({
                                ventas: acc.ventas + Number(r.ventas ?? 0),
                                mat: acc.mat + Number(r.costo_materiales ?? 0),
                                pack: acc.pack + Number(r.costo_packing ?? 0),
                                neto: acc.neto + Number(r.neto_productor ?? 0),
                                cajas: acc.cajas + Number(r.cajas ?? 0),
                                lb: acc.lb + Number(r.lb ?? 0),
                              }),
                              { ventas: 0, mat: 0, pack: 0, neto: 0, cajas: 0, lb: 0 },
                            );
                            lines.push([
                              docLang === 'en' ? '"TOTAL"' : '"TOTAL"', '',  '',
                              String(tot.cajas), String(tot.lb),
                              String(tot.ventas), String(tot.mat), String(tot.pack), String(tot.neto),
                            ].join(','));
                            const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                            const url  = URL.createObjectURL(blob);
                            const a    = document.createElement('a');
                            a.href = url;
                            a.download = docLang === 'en' ? 'settlement.csv' : 'liquidacion.csv';
                            a.click(); URL.revokeObjectURL(url);
                            toast.success(docLang === 'en' ? 'CSV generated.' : 'CSV generado.');
                          } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
                        }}
                      >
                        CSV
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={!reportFiltersForPdf}
                        onClick={() => {
                          if (!reportFiltersForPdf) return;
                          void downloadProducerSettlementPdf('producer', { ...reportFiltersForPdf, productor_id: undefined }, { lang: docLang });
                        }}
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        {docLang === 'en' ? 'PDF settlement' : 'PDF liquidación'}
                      </Button>
                    </div>
                  </div>

                  {/* Análisis por cliente */}
                  <details className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                          <Users className="h-4 w-4" aria-hidden />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">{tr('cierre.clientAnalysis')}</p>
                          <p className="text-xs text-slate-500">{tr('cierre.clientAnalysisDesc')}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform [[open]_&]:rotate-180" />
                      </div>
                    </summary>
                    <div id="rep-cierre-margen" className="space-y-4 overflow-x-auto border-t border-slate-100 px-5 py-5">
                      <ClientMarginSummaryTable section={reportData.clientMarginSummary} />
                      <ClientMarginDetailTable section={reportData.clientMarginDetail} />
                    </div>
                  </details>

                  {/* Análisis por formato */}
                  <details className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                          <Layers className="h-4 w-4" aria-hidden />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">{tr('cierre.formatAnalysis')}</p>
                          <p className="text-xs text-slate-500">{tr('cierre.formatAnalysisDesc')}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform [[open]_&]:rotate-180" />
                      </div>
                    </summary>
                    <div id="rep-cierre-costos" className="space-y-4 overflow-x-auto border-t border-slate-100 px-5 py-5">
                      {reportData.formatCostConfig?.packing_source ? (
                        <p className="text-xs text-slate-500">
                          {tr('margenCliente.fuenteCostoPacking')} <strong className="text-slate-700">
                            {reportData.formatCostConfig.packing_source === 'manual_filter' ? tr('margenCliente.fuenteManual') : tr('margenCliente.fuenteTabla')}
                          </strong>
                        </p>
                      ) : null}
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                          <input type="checkbox" className="h-4 w-4 rounded border-input" checked={showAllFormatCostRows} onChange={(e) => setShowAllFormatCostRows(e.target.checked)} />
                          {tr('cierre.includeZeroBoxes')}
                        </label>
                      </div>
                      {hasFormatCostOnlyZeros ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                          {tr('cierre.allZeroBoxes')}
                        </p>
                      ) : null}
                      <FormatCostOperational summary={formatCostSummaryForDisplay} />
                      <FormatCostGrouped summary={formatCostSummaryForDisplay} lines={reportData.formatCostLines} />
                    </div>
                  </details>

                  {/* Ventas por despacho */}
                  <details className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                          <FileText className="h-4 w-4" aria-hidden />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">{tr('colapsables.ventasDespacho')}</p>
                          <p className="text-xs text-slate-500">{tr('colapsables.ventasDespachoDesc')}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform [[open]_&]:rotate-180" />
                      </div>
                    </summary>
                    <div className="overflow-x-auto border-t border-slate-100 px-5 py-5">
                      <SectionTable title={tr('colapsables.ventasDespachoTitle')} section={reportData.salesAndCostsByDispatch} dense subtitle={tr('colapsables.ventasDespachoSubtitle')} />
                    </div>
                  </details>

                  {/* Diagnóstico técnico admin */}
                  {isAdmin ? (
                    <details className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50">
                      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                            <Info className="h-4 w-4" aria-hidden />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-600">{tr('colapsables.diagnostico')}</p>
                            <p className="text-xs text-slate-400">{tr('colapsables.diagnosticoDesc')}</p>
                          </div>
                          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform [[open]_&]:rotate-180" />
                        </div>
                      </summary>
                      <div id="rep-cierre-diagnostico" className="space-y-4 border-t border-slate-200 px-5 py-5">
                        <DiagnosticoTrazabilidadGuiaCard />
                        <ProducerSettlementDiagnosticPanel data={reportData.producerSettlementDiagnostic} />
                      </div>
                    </details>
                  ) : null}

                </div>
              ) : null}

              {/* ── VISTA POR PRODUCTOR ── */}
              {cierreView === 'productor' ? (
                <div className="space-y-5">

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900">{tr('productor.selectTitle')}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{tr('productor.selectDesc')}</p>
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      <div className="grid gap-2 sm:max-w-sm">
                        <select
                          id="cierre-prod-informe"
                          className="flex h-10 w-full rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm"
                          value={cierreInformeProducerId ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCierreInformeProducerId(v === '' ? null : Number(v));
                          }}
                        >
                          <option value="">{cierreProducerOptions.length ? 'Elegí un productor…' : 'Sin productores en esta liquidación'}</option>
                          {cierreProducerOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      {cierreInformeProducerId != null ? (
                        <>
                          {informeExportVisual.tier === 'ok' ? (
                            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {informeExportVisual.title}
                            </p>
                          ) : informeExportVisual.tier === 'warn' ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
                              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />{informeExportVisual.title}</p>
                              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{informeExportVisual.detailLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-950">
                              <p className="flex items-center gap-1.5 font-semibold"><XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />{informeExportVisual.title}</p>
                              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{informeExportVisual.detailLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <Button type="button" size="sm" variant="default" className="gap-1.5 justify-center"
                              disabled={!reportFiltersForPdf}
                              onClick={() => { if (!reportFiltersForPdf || cierreInformeProducerId == null) { toast.error('Elegí un productor.'); return; } void downloadProducerSettlementPdf('producer', reportFiltersForPdf, { productor_id: cierreInformeProducerId, lang: docLang }); }}>
                              <FileDown className="h-3.5 w-3.5" />{tr('productor.pdfProductor')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5 justify-center"
                              disabled={!reportFiltersForPdf || cierreInformeProducerId == null}
                              onClick={() =>
                                void downloadProducerSettlementPdf('executive', reportFiltersForPdf!, {
                                  productor_id: cierreInformeProducerId ?? undefined,
                                  lang: docLang,
                                })
                              }
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {tr('productor.pdfEjecutivo')}
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="gap-1.5 justify-center"
                              disabled={!reportFiltersForPdf}
                              onClick={async () => {
                                if (!reportFiltersForPdf || cierreInformeProducerId == null || !reportData) return;
                                const summaryRows = (reportData.producerSettlementSummary?.rows ?? []) as Record<string, unknown>[];
                                const sr = summaryRows.find(
                                  (raw) => Number((raw as Record<string, unknown>).productor_id) === cierreInformeProducerId,
                                ) as Record<string, unknown> | undefined;
                                if (!sr) { toast.error('No hay fila de resumen para este productor.'); return; }
                                const name = String(sr.productor_nombre ?? `Productor ${cierreInformeProducerId}`);
                                const base = `cierre-${reportFiltersForPdf.fecha_desde ?? 'ini'}-${reportFiltersForPdf.fecha_hasta ?? 'fin'}`;
                                try {
                                  // Traer TODAS las líneas del productor respetando límite backend (max 100).
                                  const pageLimit = 100;
                                  let page = 1;
                                  const allDetailRows: Record<string, unknown>[] = [];
                                  const allFormatCostRows: Record<string, unknown>[] = [];
                                  let detailDone = false;
                                  let formatDone = false;
                                  while (!detailDone || !formatDone) {
                                    const q = toQuery({
                                      ...reportFiltersForPdf,
                                      productor_id: cierreInformeProducerId,
                                      page,
                                      limit: pageLimit,
                                    });
                                    const settlement = await apiJson<{
                                      producerSettlementDetail?: PaginatedSection;
                                      formatCostSummary?: PaginatedSection;
                                    }>(`/api/reporting/producer-settlement?${q}`);
                                    const detailSection = settlement.producerSettlementDetail;
                                    const formatSection = settlement.formatCostSummary;
                                    const detailPageRows = detailSection?.rows ?? [];
                                    const formatPageRows = formatSection?.rows ?? [];
                                    if (!detailDone) {
                                      allDetailRows.push(...detailPageRows);
                                      detailDone =
                                        allDetailRows.length >= (detailSection?.total ?? allDetailRows.length) ||
                                        detailPageRows.length < pageLimit;
                                    }
                                    if (!formatDone) {
                                      allFormatCostRows.push(...formatPageRows);
                                      formatDone =
                                        allFormatCostRows.length >= (formatSection?.total ?? allFormatCostRows.length) ||
                                        formatPageRows.length < pageLimit;
                                    }
                                    if ((detailPageRows.length === 0 && formatPageRows.length === 0) || page >= 200) {
                                      break;
                                    }
                                    page += 1;
                                  }
                                  await downloadProducerSettlementExcelClient({
                                    fileBase: base,
                                    producerId: cierreInformeProducerId,
                                    producerName: name,
                                    summaryRow: sr,
                                    detailRows: allDetailRows,
                                    formatCostSummaryRows: allFormatCostRows.length
                                      ? allFormatCostRows
                                      : (reportData.formatCostSummary?.rows ?? []) as Record<string, unknown>[],
                                    period: reportFiltersForPdf.fecha_desde != null && reportFiltersForPdf.fecha_hasta != null
                                      ? `${String(reportFiltersForPdf.fecha_desde)} → ${String(reportFiltersForPdf.fecha_hasta)}`
                                      : reportFiltersForPdf.fecha_desde != null
                                      ? `desde ${String(reportFiltersForPdf.fecha_desde)}`
                                      : reportFiltersForPdf.fecha_hasta != null
                                      ? `hasta ${String(reportFiltersForPdf.fecha_hasta)}`
                                      : docLang === 'en' ? 'Full period' : 'Período completo',
                                    company: ((import.meta.env as Record<string, string | undefined>).VITE_COMPANY_DISPLAY_NAME) ?? '',
                                    lang: docLang,
                                  });
                                  toast.success('Excel productor generado.');
                                } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al generar Excel'); }
                              }}>
                              <Download className="h-3.5 w-3.5" />{tr('productor.excelProductor')}
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="justify-center"
                              onClick={() => { if (cierreInformeProducerId == null) return; setProducerRowExpandRequest(cierreInformeProducerId); setCierreView('global'); }}>
                              {tr('productor.verEnGlobal')}
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Tabla filtrada por productor */}
                  {cierreInformeProducerId != null ? (
                    <LiquidacionFinalModule
                      reportData={{
                        ...reportData,
                        producerSettlementSummary: reportData.producerSettlementSummary
                          ? {
                              ...reportData.producerSettlementSummary,
                              rows: (reportData.producerSettlementSummary.rows ?? []).filter(
                                (raw) => Number((raw as Record<string, unknown>).productor_id) === cierreInformeProducerId
                              ),
                              total: 1,
                            }
                          : reportData.producerSettlementSummary,
                      }}
                      summaryNote={reportPaginationNote(reportData.producerSettlementSummary, tr)}
                      expandProducerIdRequest={cierreInformeProducerId}
                      onExpandProducerHandled={() => {}}
                      packingTariffsManualMode={!!cierrePackingManualMode}
                      liquidacionAudit={liquidacionAudit}
                      tr={tr}
                    />
                  ) : null}

                </div>
              ) : null}

            </div>
          ) : null}

          {reportTab === 'documentos' ? (
            <>
              <Card className="border-slate-200/90 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <ReportCategoryBadge kind="entregable" />
                  <CardTitle className="text-base text-slate-900">{tr('documentos.title')}</CardTitle>
                  <CardDescription>{tr('documentos.subtitle')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 border-t border-border/60 pt-3">
                  <div className="rounded-md bg-sky-50/70 px-3 py-2 text-sm text-sky-950">
                    <strong className="font-medium">{tr('documentos.beforeExport')}</strong> {tr('documentos.beforeExportHint')}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
                    <p className={sectionTitle}>{tr('documentos.periodView')}</p>
                    <p className={sectionHint}>{tr('documentos.periodViewHint')}</p>
                    {reportData && executiveKpis ? (
                      <div className="mt-3 space-y-4">
                        <div className={kpiGrid3}>
                          <KpiTile label={tr('documentos.boxesPt')} value={fmtQty(executiveKpis.cajasPtTotal, 0)} />
                          <KpiTile label={tr('documentos.boxesDispatched')} value={fmtQty(executiveKpis.cajasDespachadasTotal, 2)} />
                          <KpiTile label={tr('documentos.boxesDiff')} value={fmtQty(executiveKpis.cajasPtTotal - executiveKpis.cajasDespachadasTotal, 2)} />
                        </div>
                        <ReportPreviewStrip data={reportData} />
                        <details className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2">
                          <summary className="cursor-pointer text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                            {tr('documentos.datasetTech')}
                          </summary>
                          <div className="mt-3 border-t pt-3">
                            <UnifiedDatasetTechPreview data={reportData} />
                          </div>
                        </details>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {tr('documentos.noData')}
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
                      {tr('documentos.exportAll')}
                    </Button>
                    <div className="flex flex-1 flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" disabled={!reportData} onClick={() => void downloadExport('pdf', { pdfProfile: 'internal' })}>
                        <FileDown className="h-4 w-4" />
                        {tr('documentos.pdfInterno')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" disabled={!reportData} onClick={() => void downloadExport('pdf', { pdfProfile: 'external' })}>
                        <FileDown className="h-4 w-4" />
                        {tr('documentos.pdfResumen')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2"
                        disabled={!reportFiltersForPdf}
                        onClick={() => {
                          if (!reportFiltersForPdf) {
                            toast.error(tr('documentos.generateFirst'));
                            return;
                          }
                          void downloadProducerSettlementPdf('producer', reportFiltersForPdf, { lang: docLang });
                        }}
                      >
                        <FileDown className="h-4 w-4" />
                        {tr('documentos.pdfLiquidacion')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-9" disabled={!reportData} onClick={() => downloadExport('csv')}>
                        {tr('documentos.csv')}
                      </Button>
                      {canSave ? (
                        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                          <DialogTrigger asChild>
                            <Button type="button" variant="secondary" size="sm" className="h-9 gap-2" disabled={!reportData}>
                              <Save className="h-4 w-4" />
                              {tr('documentos.saveView')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{tr('documentos.saveReport')}</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-2 py-2">
                              <Label>{tr('documentos.saveName')}</Label>
                              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={tr('documentos.saveNamePlaceholder')} />
                            </div>
                            <DialogFooter>
                              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                                {tr('documentos.cancel')}
                              </Button>
                              <Button type="button" disabled={!saveName.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                                {saveMut.isPending ? tr('documentos.saving') : tr('documentos.save')}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" className="h-9 gap-2" disabled title={tr('documentos.savePermission')}>
                          <Save className="h-4 w-4" />
                          {tr('documentos.saveView')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <Link to="/dispatches" className="inline-flex items-center gap-2 text-[13px] text-primary underline-offset-4 hover:underline">
                    <Printer className="h-4 w-4 shrink-0" />
                    {tr('misc.facturasDespachos')}
                  </Link>
                </CardContent>
              </Card>

              <div className={cn(contentCard, 'p-4 sm:p-5')}>
                <p className={sectionTitle}>{tr('misc.reportesGuardados')}</p>
                <p className={sectionHint}>{tr('misc.reportesGuardadosHint')}</p>
                <div className="mt-4">
                  {savedLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : savedSorted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{tr('misc.ningunoGuardado')}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tr('misc.colNombre')}</TableHead>
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
          {tr('cierre.emptyCierre')}
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
              <CardTitle className="text-base text-slate-900">{tr('cierre.noFormatRows')}</CardTitle>
              <CardDescription>
                {tr('cierre.noFormatRowsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {tr('cierre.noFormatRowsHint')}
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
