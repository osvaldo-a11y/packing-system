import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  Box,
  Download,
  FileCheck,
  FileDown,
  FolderOpen,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { contentCard } from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import { ReportSemanticBlock } from '@/components/reporting/ReportSemanticBlock';
import { ReportingHelpPanel } from '@/components/reporting/ReportingHelpPanel';
import type { ReportHelpId } from '@/content/reportingHelp';

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

async function downloadProducerSettlementPdf(variant: 'producer' | 'internal', f: ReportFilters) {
  const q = toQuery({
    ...f,
    variant,
    productor_id: f.productor_id || undefined,
    cliente_id: f.cliente_id || undefined,
    variedad_id: f.variedad_id || undefined,
    tarja_id: f.tarja_id || undefined,
    format_code: f.format_code || undefined,
    precio_packing_por_lb: f.precio_packing_por_lb ?? undefined,
    fecha_desde: f.fecha_desde || undefined,
    fecha_hasta: f.fecha_hasta || undefined,
    calidad: f.calidad || undefined,
    page: f.page,
    limit: f.limit,
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

type ClientMasterRow = { id: number; nombre: string; activo: boolean };

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

type ReportModuleTab = 'operativo' | 'financiero' | 'entregables';

const REPORT_MODULE_TABS: { id: ReportModuleTab; label: string; description: string }[] = [
  {
    id: 'operativo',
    label: 'Operativo y depósito',
    description: 'Proceso, unidades PT, rendimiento; vista separada del financiero',
  },
  {
    id: 'financiero',
    label: 'Financiero interno',
    description: 'Facturación del período, costos, liquidación y margen',
  },
  { id: 'entregables', label: 'Documentos / terceros', description: 'PDFs y enlaces para terceros' },
];

const REPORT_CATEGORY_ICON: Record<ReportModuleTab, LucideIcon> = {
  operativo: Box,
  financiero: Banknote,
  entregables: FileCheck,
};

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

function ReportCategoryBadge({ kind }: { kind: 'operativo' | 'financiero' | 'entregable' }) {
  const map = {
    operativo: 'border-sky-200 text-sky-900 bg-sky-50',
    financiero: 'border-slate-300 text-slate-800 bg-slate-50',
    entregable: 'border-emerald-200 text-emerald-900 bg-emerald-50',
  };
  const label =
    kind === 'operativo' ? 'Operativo' : kind === 'financiero' ? 'Financiero interno' : 'Documento / terceros';
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

/** Vista de detalle: una pantalla por informe; `null` = resumen ejecutivo con KPIs. */
type ReportDetailId =
  | null
  | 'cajas-pt'
  | 'cajas-despacho'
  | 'cajas-pt-detalle'
  | 'pallet-tarja'
  | 'rendimiento'
  | 'empaque-formato'
  | 'liquidacion-interna'
  | 'costo-formato-facturado'
  | 'ventas-despacho'
  | 'margen-cliente'
  | 'documentos';

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
    <div className="rounded-xl border border-slate-200/90 bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums leading-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-600 leading-snug">{hint}</p> : null}
    </div>
  );
}

const REPORT_DETAIL_TITLES: Record<Exclude<ReportDetailId, null>, string> = {
  'cajas-pt': 'Cajas PT por productor (unidades PT)',
  'cajas-despacho': 'Cajas despachadas por productor (facturación)',
  'cajas-pt-detalle': 'Detalle de cajas PT por operación',
  'pallet-tarja': 'Costo promedio pallet por unidad PT',
  rendimiento: 'Rendimiento packout y merma registrada',
  'empaque-formato': 'Empaque por formato',
  'liquidacion-interna': 'Liquidación por productor (interna)',
  'costo-formato-facturado': 'Costo por formato facturado',
  'ventas-despacho': 'Ventas por despacho',
  'margen-cliente': 'Margen por cliente',
  documentos: 'Liquidación por productor (entrega) y documentos',
};

function DetailChrome({
  title,
  onBack,
  children,
  helpId,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
  /** Claridad semántica (qué mide, fuente, incluye / no incluye). */
  helpId?: ReportHelpId;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4">
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shadow-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Volver al resumen
        </Button>
        <span className="text-base font-semibold leading-snug text-slate-900">{title}</span>
      </div>
      {helpId ? <ReportSemanticBlock helpId={helpId} /> : null}
      {children}
    </div>
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
              <TableHead>Costo por caja</TableHead>
              <TableHead>Costo por lb</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((r, i) => {
              const lb = toNum(r.lb ?? r.lb_totales);
              const costoMateriales = toNum(r.costo_materiales ?? r.subtotal_materiales);
              return (
                <TableRow key={`ops-${i}`}>
                  <TableCell className="font-medium">{toStr(r.format_code)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatLb(toNum(r.cajas), 2)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatLb(lb, 2)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(costoMateriales)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(toNum(r.costo_packing))}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(toNum(r.costo_total))}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatTechnical(toNum(r.costo_por_caja), 4)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatTechnical(toNum(r.costo_por_lb), 6)}</TableCell>
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
  const [reportTab, setReportTab] = useState<ReportModuleTab>('operativo');
  /** null = resumen ejecutivo con KPIs; si no null, solo esa vista de detalle. */
  const [detailId, setDetailId] = useState<ReportDetailId>(null);
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

  const { data: clientsMaster } = useQuery({
    queryKey: ['masters', 'clients', 'reporting'],
    queryFn: () => apiJson<ClientMasterRow[]>('/api/masters/clients'),
  });

  const { data: packingCosts } = useQuery({
    queryKey: ['reporting', 'packing-costs'],
    queryFn: () => apiJson<PackingCostRow[]>('/api/reporting/packing-costs'),
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
      setDetailId(null);
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

  function loadSavedReport(r: SavedReportRow) {
    const parsed = parsePayload(r.payload);
    if (!parsed) {
      toast.error('Formato de snapshot no compatible con esta versión');
      return;
    }
    setReportData(parsed);
    setDetailId(null);
    const f = recordToReportFilters(r.filters);
    setFilters(f);
    setDraft(f);
    setActiveSavedId(r.id);
    toast.success(`Cargado: ${r.report_name}`);
  }

  async function downloadExport(
    format: 'csv' | 'xlsx' | 'pdf',
    opts?: { pdfProfile?: 'internal' | 'external' },
  ) {
    const q = toQuery({
      format,
      pdf_profile:
        format === 'pdf' && opts?.pdfProfile ? opts.pdfProfile : undefined,
      ...filters,
      productor_id: filters.productor_id || undefined,
      cliente_id: filters.cliente_id || undefined,
      variedad_id: filters.variedad_id || undefined,
      tarja_id: filters.tarja_id || undefined,
      format_code: filters.format_code || undefined,
      precio_packing_por_lb: filters.precio_packing_por_lb ?? undefined,
      fecha_desde: filters.fecha_desde || undefined,
      fecha_hasta: filters.fecha_hasta || undefined,
      calidad: filters.calidad || undefined,
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

  const thresholds = reportData?.plant_thresholds;

  const savedSorted = useMemo(
    () => (savedList ?? []).slice().sort((a, b) => b.id - a.id),
    [savedList],
  );
  const canManagePackingCosts = role === 'admin' || role === 'supervisor';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Reportes</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Un solo <strong className="font-semibold text-slate-800">Generar</strong> carga todos los datos. Elegí una{' '}
          <strong className="font-semibold text-slate-800">categoría</strong>, revisá el resumen y abrí cada informe por
          separado (sin mezclar operación, logística comercial y finanzas en un mismo scroll).
        </p>
      </div>

      <ReportingHelpPanel />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Elegí categoría</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {REPORT_MODULE_TABS.map((t) => {
            const Icon = REPORT_CATEGORY_ICON[t.id];
            const active = reportTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setReportTab(t.id);
                  setDetailId(null);
                }}
                className={cn(
                  'rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:shadow-md',
                  active
                    ? 'border-primary ring-2 ring-primary/25'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl',
                      active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <ReportCategoryBadge
                    kind={t.id === 'operativo' ? 'operativo' : t.id === 'financiero' ? 'financiero' : 'entregable'}
                  />
                </div>
                <div className="font-semibold text-slate-900">{t.label}</div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t.description}</p>
                {t.id === 'operativo' ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Button asChild variant="outline" size="sm" className="shadow-sm">
                      <Link to="/sales-orders">Pedidos</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="shadow-sm">
                      <Link to="/existencias-pt/inventario">Inventario cámara</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="shadow-sm">
                      <Link to="/processes">Procesos</Link>
                    </Button>
                  </div>
                ) : null}
                {t.id === 'entregables' ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Button asChild variant="outline" size="sm" className="gap-1.5 shadow-sm">
                      <Link to="/dispatches">
                        <Truck className="h-3.5 w-3.5" />
                        Despachos
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="border-slate-200/90 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Fechas en formato YYYY-MM-DD (opcional). Paginación común a todas las secciones. Por defecto límite 100 para
            acercarte a “ver todo” en un solo generado (máx. 100 por sección).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-2">
            <Label>Productor ID</Label>
            <Input
              type="number"
              placeholder="Todos"
              value={draft.productor_id ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  productor_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Variedad ID</Label>
            <Input
              type="number"
              placeholder="Todas"
              value={draft.variedad_id ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  variedad_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Unidad PT (ID)</Label>
            <Input
              type="number"
              placeholder="Todas"
              value={draft.tarja_id ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  tarja_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Fecha desde</Label>
            <Input
              type="date"
              value={draft.fecha_desde ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, fecha_desde: e.target.value || undefined }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Fecha hasta</Label>
            <Input
              type="date"
              value={draft.fecha_hasta ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, fecha_hasta: e.target.value || undefined }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Calidad (texto)</Label>
            <Input
              placeholder="Opcional"
              value={draft.calidad ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, calidad: e.target.value || undefined }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Cliente (despacho)</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.cliente_id != null && draft.cliente_id > 0 ? String(draft.cliente_id) : ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  cliente_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            >
              <option value="">Todos</option>
              {(clientsMaster ?? [])
                .filter((c) => c.activo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Filtra facturación por <span className="font-mono">despacho.cliente_id</span> (p. ej. margen por cliente).
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Formato (código receta)</Label>
            <Input
              placeholder="Ej. 12x18oz"
              value={draft.format_code ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, format_code: e.target.value || undefined }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Aplica a costo por formato, liquidación y margen por cliente (líneas de factura con ese{' '}
              <span className="font-mono">packaging_code</span>).
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Precio packing por lb</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              placeholder="0"
              value={draft.precio_packing_por_lb ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  precio_packing_por_lb: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Página</Label>
            <Input
              type="number"
              min={1}
              value={draft.page ?? filters.page}
              onChange={(e) => setDraft((d) => ({ ...d, page: Number(e.target.value) || 1 }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Límite (máx. 100)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={draft.limit ?? filters.limit}
              onChange={(e) => setDraft((d) => ({ ...d, limit: Math.min(100, Number(e.target.value) || 20) }))}
            />
          </div>
        </CardContent>
        <CardContent className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            type="button"
            onClick={() => {
              const next: ReportFilters = {
                ...filters,
                ...draft,
                page: draft.page ?? filters.page,
                limit: Math.min(100, draft.limit ?? filters.limit),
              };
              setFilters(next);
              generateMut.mutate(next);
            }}
            disabled={generateMut.isPending}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            {generateMut.isPending ? 'Generando…' : 'Generar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={!reportData}
            onClick={() => downloadExport('xlsx')}
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button type="button" variant="outline" className="gap-2" disabled={!reportData} onClick={() => downloadExport('csv')}>
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={!reportData}
            title="Tablas completas, todas las secciones"
            onClick={() => void downloadExport('pdf', { pdfProfile: 'internal' })}
          >
            <FileDown className="h-4 w-4" />
            PDF interno
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-muted-foreground"
            disabled={!reportData}
            title="Resumen para entrega: menos detalle operativo"
            onClick={() => void downloadExport('pdf', { pdfProfile: 'external' })}
          >
            PDF resumen
          </Button>
          {canSave && (
            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="secondary" className="gap-2" disabled={!reportData}>
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
                  <Button
                    type="button"
                    disabled={!saveName.trim() || saveMut.isPending}
                    onClick={() => saveMut.mutate()}
                  >
                    {saveMut.isPending ? 'Guardando…' : 'Guardar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>

      {reportTab === 'financiero' && detailId === null ? (
        <Card className="border-slate-200/90 bg-white shadow-sm">
          <CardHeader>
            <div className="mb-1">
              <ReportCategoryBadge kind="financiero" />
            </div>
            <CardTitle className="text-base">Costos de packing por especie</CardTitle>
            <CardDescription>
              Parametría usada en <strong>costo por formato</strong> cuando no forzás precio manual en filtros: costo_packing
              ≈ lb × precio_por_lb según especie del formato. Podés ocultar filas de prueba solo en esta pantalla (no borra
              datos).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
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
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-primary"
                  onClick={() => setHiddenPackingSpeciesIds(new Set())}
                >
                  Restaurar especies ocultas ({hiddenPackingSpeciesIds.size})
                </Button>
              ) : null}
            </div>
            {canManagePackingCosts ? (
              <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-4">
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
                    {upsertPackingCostMut.isPending ? 'Guardando…' : 'Guardar costo packing'}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Especie</TableHead>
                    <TableHead>Temporada</TableHead>
                    <TableHead>Precio/lb</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="w-[120px]">Vista</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePackingCosts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
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
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() =>
                              setHiddenPackingSpeciesIds((prev) => new Set([...prev, r.species_id]))
                            }
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
          </CardContent>
        </Card>
      ) : null}

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
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">No se pudo generar el reporte</CardTitle>
            <CardDescription>{generateError}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Probá primero sin <strong>Formato</strong>, luego aplicá filtros de a uno. Si sigue fallando, avisame y lo depuramos con el error exacto.
          </CardContent>
        </Card>
      )}

      {reportData && !generateMut.isPending && (
        <div className="space-y-4">
          {detailId === null && reportTab === 'operativo' && executiveKpis ? (
            <>
              <Card className="border-slate-200/90 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <div className="mb-1">
                    <ReportCategoryBadge kind="operativo" />
                  </div>
                  <CardTitle className="text-base text-slate-900">Operativo — resumen ejecutivo</CardTitle>
                  <CardDescription>
                    Indicadores agregados del período (filtros actuales). Abrí cada informe para ver tablas completas sin
                    desplazamiento infinito.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <KpiTile label="Cajas PT (unidades)" value={fmtQty(executiveKpis.cajasPtTotal, 0)} />
                    <KpiTile label="Cajas despachadas (factura)" value={fmtQty(executiveKpis.cajasDespachadasTotal, 2)} />
                    <KpiTile
                      label="Rendimiento packout Ø"
                      value={
                        executiveKpis.rendimientoPromedio != null
                          ? `${fmtQty(executiveKpis.rendimientoPromedio, 2)} %`
                          : '—'
                      }
                    />
                    <KpiTile label="Merma registrada (lb)" value={fmtQty(executiveKpis.mermaRegistradaLb, 2)} />
                    <KpiTile label="Formatos con consumo empaque" value={String(executiveKpis.formatosConConsumo)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('cajas-pt')}>
                      Cajas PT por productor (unidades PT)
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('cajas-despacho')}>
                      Cajas despachadas (facturación)
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('cajas-pt-detalle')}>
                      Detalle cajas PT
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('pallet-tarja')}>
                      Costo pallet / unidad PT
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('rendimiento')}>
                      Rendimiento packout y merma registrada
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('empaque-formato')}>
                      Empaque por formato
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {thresholds ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Tolerancia rend. {thresholds.yield_tolerance_percent}%</Badge>
                  <Badge variant="outline">Rend. mín. {thresholds.min_yield_percent}%</Badge>
                  <Badge variant="outline">Merma máx. {thresholds.max_merma_percent}%</Badge>
                </div>
              ) : null}
            </>
          ) : null}

          {detailId === null && reportTab === 'financiero' && executiveKpis ? (
            <Card className="border-slate-200/90 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="mb-1">
                  <ReportCategoryBadge kind="financiero" />
                </div>
                <CardTitle className="text-base text-slate-900">Financiero interno — resumen ejecutivo</CardTitle>
                <CardDescription>
                  Cifras agregadas del período (mismos filtros). Los informes detallados se abren por separado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <KpiTile label="Ventas del período" value={fmtMoney(executiveKpis.ventasPeriodo)} />
                  <KpiTile label="Costos del período" value={fmtMoney(executiveKpis.costosPeriodo)} />
                  <KpiTile label="Margen total" value={fmtMoney(executiveKpis.margenTotal)} />
                  <KpiTile label="Productores liquidados" value={String(executiveKpis.productoresLiquidados)} />
                  <KpiTile
                    label="Cliente con mayor venta"
                    value={
                      executiveKpis.topClienteNombre
                        ? `${executiveKpis.topClienteNombre} (${fmtMoney(executiveKpis.topClienteVentas)})`
                        : '—'
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('liquidacion-interna')}>
                    Liquidación por productor (interna)
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('costo-formato-facturado')}>
                    Costo por formato facturado
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('ventas-despacho')}>
                    Ventas por despacho
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('margen-cliente')}>
                    Margen por cliente
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {detailId === null && reportTab === 'entregables' && executiveKpis ? (
            <Card className="border-slate-200/90 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="mb-1">
                  <ReportCategoryBadge kind="entregable" />
                </div>
                <CardTitle className="text-base text-slate-900">Documentos / terceros — resumen</CardTitle>
                <CardDescription>
                  Entregables y enlaces. El detalle agrupa PDFs y acceso a despachos sin mezclarlos con tablas financieras.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <KpiTile label="PDF liquidación (productor)" value="Descarga" hint="Mismo período y filtros que Generar." />
                  <KpiTile label="PDF liquidación (interno)" value="En detalle" hint="Desde Financiero → liquidación interna o abajo." />
                  <KpiTile label="Despachos / factura / PL" value="Módulo" hint="PDF por despacho en la pantalla de despachos." />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDetailId('documentos')}>
                    Abrir documentos y enlaces
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {reportTab === 'operativo' && detailId != null && reportData ? (
            <DetailChrome
              title={REPORT_DETAIL_TITLES[detailId]}
              onBack={() => setDetailId(null)}
              helpId={detailId as ReportHelpId}
            >
              {detailId === 'cajas-pt' ? (
                <SectionTable
                  title="Cajas PT por productor (unidades PT)"
                  section={reportData.boxesByProducer}
                  subtitle="Operativo unidad PT: suma de pt_tag_items.cajas_generadas por proceso con fecha_proceso en el período. Fuente explícita: líneas PT vinculadas al proceso. No incluye despacho ni facturación."
                />
              ) : null}
              {detailId === 'cajas-despacho' ? (
                <SectionTable
                  title="Cajas despachadas por productor (facturación)"
                  section={reportData.dispatchedBoxesByProducer}
                  subtitle="Logístico / comercial: cajas facturadas (ítems de factura en despachos con fecha_despacho en el período). Misma resolución de productor que liquidación (unidad PT → proceso en factura → preparación en cámara → repaletizado). No es producción en unidad PT."
                />
              ) : null}
              {detailId === 'cajas-pt-detalle' ? (
                <SectionTable
                  title="Detalle de cajas PT por operación"
                  section={reportData.boxesByProducerDetail}
                  dense
                  subtitle="Una fila por pt_tag_items: proceso, unidad PT, formato de la unidad, variedad del proceso y cajas de esa línea. Mismos filtros que «Cajas PT por productor» (fechas por fecha_proceso del proceso)."
                />
              ) : null}
              {detailId === 'pallet-tarja' ? (
                <SectionTable
                  title="Costo promedio pallet por unidad PT"
                  section={reportData.palletCosts}
                  subtitle="Logístico / despacho: costo de empaque asociado a unidades PT en ítems de despacho (no es costo de receta ni liquidación)."
                />
              ) : null}
              {detailId === 'rendimiento' ? (
                <SectionTable
                  title="Rendimiento packout y merma registrada (con alertas)"
                  section={reportData.yieldAndWaste}
                  dense
                  subtitle="Operativo proceso: rendimiento_promedio = promedio del % packout sobre entrada (como en el listado de procesos). merma_total_lb = solo merma cargada en BD (lb_sobrante + lb_merma_balance, o merma_lb si lo vacío). No es merma residual calculada (entrada − destinos)."
                />
              ) : null}
              {detailId === 'empaque-formato' ? (
                <SectionTable
                  title="Empaque por formato"
                  section={reportData.packagingByFormat}
                  subtitle="Operativo: consumo de materiales de empaque por código de formato."
                />
              ) : null}
            </DetailChrome>
          ) : null}

          {reportTab === 'financiero' && detailId != null && reportData ? (
            <DetailChrome
              title={REPORT_DETAIL_TITLES[detailId]}
              onBack={() => setDetailId(null)}
              helpId={detailId as ReportHelpId}
            >
              {detailId === 'liquidacion-interna' ? (
                <div className="space-y-4">
                  <Card className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/50')}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <ReportCategoryBadge kind="financiero" />
                            <CardTitle className="text-base text-slate-900">Liquidación por productor (interna)</CardTitle>
                          </div>
                          <CardDescription className="max-w-[52rem]">
                            Cajas, lb y ventas desde líneas de factura en el período (mismas fechas que el resto del reporte). El
                            productor se resuelve por <span className="font-mono">tarja_id</span> (unidad PT) en la línea (vía{' '}
                            <span className="font-mono">pt_tag_items</span> o proceso con esa unidad); si no hay unidad PT, por{' '}
                            <span className="font-mono">fruit_process_id</span> en la línea; si faltan ambos pero hay{' '}
                            <span className="font-mono">final_pallet_id</span>, por las líneas del pallet (proceso/recepción);
                            si ese pallet es resultado de un repalet sin líneas con proceso (caso unión), se usan las cajas por
                            productor en <span className="font-mono">repallet_line_provenance</span>. Se prorratea si hubo mezcla
                            de productores en el mismo pallet. Los costos de materiales y packing reutilizan el costo por formato
                            y se prorratean por{' '}
                            <span className="font-mono">cajas del productor ÷ cajas totales del formato en el período</span>.
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="gap-1.5"
                            disabled={!reportFiltersForPdf}
                            onClick={() => {
                              if (!reportFiltersForPdf) {
                                toast.error('Generá el reporte primero.');
                                return;
                              }
                              void downloadProducerSettlementPdf('internal', reportFiltersForPdf);
                            }}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            PDF liquidación interna
                          </Button>
                          <p className="max-w-[14rem] text-[11px] text-muted-foreground">
                            {isAdmin
                              ? 'El PDF interno puede incluir anexos de depuración. El PDF para el productor está en Documentos.'
                              : 'El PDF para entregar al productor está en la pestaña Documentos.'}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                  {isAdmin ? <ProducerSettlementDiagnosticPanel data={reportData.producerSettlementDiagnostic} /> : null}
                  <SectionTable
                    title="Liquidación — resumen por productor"
                    section={reportData.producerSettlementSummary}
                    dense
                    subtitle="Financiero interno: cada fila es un productor con cajas, lb, ventas y costos prorrateados; el neto es ventas menos costo total."
                  />
                  <SectionTable
                    title="Liquidación — detalle por despacho y formato"
                    section={reportData.producerSettlementDetail}
                    dense
                    subtitle="Financiero interno: desglose por despacho y packaging_code; cruce con facturación."
                  />
                </div>
              ) : null}

              {detailId === 'costo-formato-facturado' ? (
                <div className="space-y-4">
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
                    {!showAllFormatCostRows ? (
                      <span className="text-xs text-muted-foreground">
                        Por defecto solo se listan formatos con volumen facturado &gt; 0.
                      </span>
                    ) : null}
                  </div>
                  {hasFormatCostOnlyZeros ? (
                    <Card className={cn(contentCard, 'border-dashed border-amber-200/90 bg-amber-50/80')}>
                      <CardContent className="py-4 text-sm text-amber-950">
                        Todas las filas de costo por formato tienen cajas = 0 con estos filtros. Activá «Incluir formatos
                        con cajas = 0» arriba para verlas.
                      </CardContent>
                    </Card>
                  ) : null}
                  <FormatCostOperational summary={formatCostSummaryForDisplay} />
                  {reportData.formatCostSummary && formatCostSummaryForDisplay && !showAllFormatCostRows
                    ? (() => {
                        const hidden =
                          reportData.formatCostSummary!.rows.length - formatCostSummaryForDisplay.rows.length;
                        if (hidden <= 0) return null;
                        return (
                          <p className="text-xs text-muted-foreground">
                            Mostrando {formatCostSummaryForDisplay.rows.length} formato(s) con cajas facturadas &gt; 0;{' '}
                            {hidden} oculto(s) con cajas = 0.
                          </p>
                        );
                      })()
                    : null}
                  <FormatCostGrouped summary={formatCostSummaryForDisplay} lines={reportData.formatCostLines} />
                </div>
              ) : null}

              {detailId === 'ventas-despacho' ? (
                <SectionTable
                  title="Ventas y márgenes por despacho"
                  section={reportData.salesAndCostsByDispatch}
                  dense
                  subtitle="Financiero interno: ventas por período / despacho y costos asociados para análisis de margen."
                />
              ) : null}

              {detailId === 'margen-cliente' ? (
                <div className="space-y-4">
                  <Card className="border-slate-200/90 bg-slate-50/50 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="mb-1">
                        <ReportCategoryBadge kind="financiero" />
                      </div>
                      <CardTitle className="text-base text-slate-900">Margen por cliente</CardTitle>
                      <CardDescription className="max-w-[48rem] text-sm">
                        Por cada cliente del despacho: cajas, lb y ventas desde líneas de factura; costos de materiales y
                        packing reutilizan el mismo costo por formato del período y se prorratean como{' '}
                        <span className="font-mono">cajas del cliente en ese formato ÷ cajas totales del formato en el período</span>
                        (misma lógica que el detalle de liquidación, sin reparto por productor). Úso interno — no es documento
                        para terceros.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <ClientMarginSummaryTable section={reportData.clientMarginSummary} />
                  <ClientMarginDetailTable section={reportData.clientMarginDetail} />
                </div>
              ) : null}
            </DetailChrome>
          ) : null}

          {reportTab === 'entregables' && detailId === 'documentos' && reportData ? (
            <DetailChrome title={REPORT_DETAIL_TITLES.documentos} onBack={() => setDetailId(null)} helpId="documentos">
              <div className="space-y-4">
                <Card className="border-slate-200/90 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="mb-1">
                      <ReportCategoryBadge kind="entregable" />
                    </div>
                    <CardTitle className="text-base text-slate-900">Liquidación por productor (entrega)</CardTitle>
                    <CardDescription>
                      PDF listo para compartir con el productor. Usa los mismos filtros y fechas que el informe generado
                      arriba. El PDF interno con datos extra está en Financiero interno → Liquidación por productor (interna).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={!reportFiltersForPdf}
                      onClick={() => {
                        if (!reportFiltersForPdf) {
                          toast.error('Generá el reporte primero.');
                          return;
                        }
                        void downloadProducerSettlementPdf('producer', reportFiltersForPdf);
                      }}
                    >
                      <FileDown className="h-4 w-4" />
                      Descargar PDF liquidación (productor)
                    </Button>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/90 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="mb-1">
                      <ReportCategoryBadge kind="entregable" />
                    </div>
                    <CardTitle className="text-base text-slate-900">PDF interno y tablas</CardTitle>
                    <CardDescription>
                      Para tablas numéricas y PDF de uso interno, abrí <strong>Financiero interno</strong> →{' '}
                      <strong>Liquidación por productor (interna)</strong> (incluye depuración solo admin).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReportTab('financiero');
                        setDetailId('liquidacion-interna');
                      }}
                    >
                      Ir a Financiero — liquidación interna
                    </Button>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/90 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="mb-1">
                      <ReportCategoryBadge kind="entregable" />
                    </div>
                    <CardTitle className="text-base text-slate-900">Factura comercial y packing list</CardTitle>
                    <CardDescription>
                      Cada documento se genera por despacho, después de cargar precios y factura.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="gap-2">
                      <Link to="/dispatches">
                        <Printer className="h-4 w-4" />
                        Ir a Despachos (PDF factura / packing list)
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
                <p className="text-xs text-muted-foreground">
                  Exportación masiva del informe completo (Excel / CSV / PDF) sigue disponible en la tarjeta de filtros.
                </p>
              </div>
            </DetailChrome>
          ) : null}
        </div>
      )}

      {!reportData && !generateMut.isPending && (
        <Card className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/50')}>
          <CardContent className="py-10 text-center text-sm text-slate-600">
            Configurá filtros y pulsá <strong className="text-slate-800">Generar</strong> para ver datos.
          </CardContent>
        </Card>
      )}

      {reportTab === 'financiero' &&
        detailId === null &&
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reportes guardados</CardTitle>
          <CardDescription>
            Cargar en pantalla, renombrar, sincronizar con la vista actual o eliminar. Guardar/editar: supervisor/admin.
            Eliminar: solo admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(r.created_at).toLocaleString('es')}
                    </TableCell>
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
        </CardContent>
      </Card>

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
