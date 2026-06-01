import { useQueries, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  ClipboardList,
  DollarSign,
  Factory,
  GitBranch,
  Import,
  Info,
  Library,
  Tag,
  TrendingUp,
  Truck,
  User,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiJson, isAccessTokenExpired } from '@/api';
import { useAuth } from '@/AuthContext';
import { isReadOnlySession } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  emptyStateBanner,
  pageStack,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
} from '@/lib/page-ui';
import { formatMoney } from '@/lib/number-format';
import { cn } from '@/lib/utils';
import { countsTowardPtProductionTotals, type PtTagApi } from '@/pages/PtTagsPage';
import type { DispatchApi, InvoiceLineApi } from './DispatchesPage';
import type { PackagingMaterialRow } from './MaterialsPage';
import type { FruitProcessRow } from './ProcessesPage';
import type { ReceptionRow } from './ReceptionPage';
import type { RecipeApi } from './RecipesPage';
import { isOrderCanceled } from '@/lib/sales-order-status';
import type { SalesOrderRow } from './SalesOrdersPage';

type DashboardMaterial = PackagingMaterialRow & {
  material_category?: { id: number; codigo: string; nombre: string };
};

type DashboardPeriod = 'today' | 'week' | 'accumulated';
type WorkMode = 'both' | 'hand' | 'machine';

type SalesOrderProgressLite = {
  order: { id: number; order_number: string; cliente_nombre: string | null };
  totals: {
    requested_boxes: number;
    produced_depot_boxes: number;
    reserved_depot_boxes: number;
    assigned_pl_boxes: number;
    dispatched_boxes: number;
    pending_boxes: number;
  };
};

type TraceDashboard = {
  materials_low_stock: Array<{
    id: number;
    nombre_material: string;
    cantidad_disponible: string;
    unidad_medida: string;
    categoria: string;
  }>;
  totalInvoiced?: number;
  totalBilled?: number;
  invoices_issued_count?: number;
};

type SpeciesRow = { id: number; nombre: string; codigo: string };
type ProducerRow = { id: number; nombre: string; codigo: string | null };
type ClientRow = { id: number; codigo: string; nombre: string };
type FormatRow = { id: number; format_code: string; max_boxes_per_pallet?: number | null; activo?: boolean };

function toDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function format2(v: number): string {
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Pallets: entero si aplica; si no, un solo decimal (es-AR). */
function formatPallets(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const r = Math.round(n * 10) / 10;
  if (Math.abs(r - Math.round(r)) < 0.001) {
    return Math.round(r).toLocaleString('es-AR');
  }
  return r.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function isoFromUnknown(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function periodRange(period: DashboardPeriod): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = from.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    from.setDate(from.getDate() + mondayOffset);
  } else if (period === 'accumulated') {
    from.setMonth(from.getMonth() - 3);
  }
  return { from, to };
}

function inclusiveCalendarDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const ms = b.getTime() - a.getTime();
  const d = Math.floor(ms / 86_400_000) + 1;
  return Number.isFinite(d) && d > 0 ? d : 1;
}

function describePeriodDashboard(period: DashboardPeriod): string {
  if (period === 'today') return 'Hoy (00:00–23:59, horario local)';
  if (period === 'week') return 'Semana en curso (lun–ahora)';
  return 'Últimos 90 días aprox.';
}

/** Lunes local de la semana para una fecha yyyy-mm-dd. */
function mondayKeyFromDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatWeekRangeLabel(mondayYmd: string): string {
  const [y, m, d] = mondayYmd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const f = (dt: Date) =>
    dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace(/\.$/, '');
  return `${f(start)} – ${f(end)}`;
}

/** Semana ISO (lun–dom) a partir del lunes yyyy-mm-dd. */
function isoWeekFromMondayKey(mondayYmd: string): { isoYear: number; week: number } {
  const [y, m, d] = mondayYmd.split('-').map(Number);
  const thursday = new Date(y, m - 1, d + 3);
  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000);
  return { isoYear, week };
}

function inDateRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
}

function machineModeMatches(kind: string | null | undefined, mode: WorkMode): boolean {
  if (mode === 'both') return true;
  const k = (kind ?? '').toLowerCase();
  const isHand = /\bsingle\b|manual|\bmano\b/.test(k);
  const isMachine = /\bdouble\b|maquina|machine|mecan/.test(k);
  if (mode === 'hand') return isHand || (!isHand && !isMachine);
  return isMachine;
}

function primaryProcessIdFromTag(t: PtTagApi): number | null {
  for (const it of t.items ?? []) {
    const pid = Number(it.process_id);
    if (Number.isFinite(pid) && pid > 0) return pid;
  }
  return null;
}

function primaryProductorIdFromTag(t: PtTagApi): number | null {
  for (const it of t.items ?? []) {
    const pid = Number(it.productor_id);
    if (Number.isFinite(pid) && pid > 0) return pid;
  }
  return null;
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = (Math.PI * startDeg) / 180;
  const e = (Math.PI * endDeg) / 180;
  const sx = cx + r * Math.cos(s);
  const sy = cy + r * Math.sin(s);
  const ex = cx + r * Math.cos(e);
  const ey = cy + r * Math.sin(e);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function receptionNetLb(r: ReceptionRow): number {
  let t = 0;
  for (const ln of r.lines ?? []) t += parseNum(ln.net_lb);
  return t;
}

function dispatchSpeciesMatch(d: DispatchApi, speciesId: number | 'all'): boolean {
  if (speciesId === 'all') return true;
  const lines = d.invoice?.lines ?? [];
  if (!lines.length) return true;
  return lines.some((ln) => Number(ln.species_id ?? 0) === speciesId);
}

/** Packout en lb según la tarja PT (API `net_weight_lb`). */
function ptTagPackoutLb(t: PtTagApi): number {
  return parseNum(t.net_weight_lb);
}

/** Fracción de cajas de la tarja atribuible a un productor (varios procesos en `items`). */
function tagProducerCajasShare(t: PtTagApi, producerId: number): number {
  const items = t.items ?? [];
  if (!items.length) return 0;
  const totalCajas = items.reduce((s, it) => s + parseNum(it.cajas_generadas), 0);
  if (totalCajas <= 1e-9) return 0;
  const prodCajas = items
    .filter((it) => Number(it.productor_id) === producerId)
    .reduce((s, it) => s + parseNum(it.cajas_generadas), 0);
  return prodCajas / totalCajas;
}

/** Packout atribuido a un productor: prorrateo por cajas en `pt_tag_items` (alineado a líneas de factura). */
function ptTagPackoutLbForProducer(
  t: PtTagApi,
  producerId: number | 'all',
  processById: Map<number, FruitProcessRow>,
): number {
  const total = ptTagPackoutLb(t);
  if (producerId === 'all') return total;
  const share = tagProducerCajasShare(t, producerId);
  if (share > 1e-9) return total * share;
  const procId = primaryProcessIdFromTag(t);
  const proc = procId != null ? processById.get(procId) : undefined;
  const pid = proc != null ? Number(proc.productor_id ?? 0) : 0;
  return pid === producerId ? total : 0;
}

function tagMatchesProducerFilter(
  t: PtTagApi | undefined,
  producerId: number | 'all',
  processById: Map<number, FruitProcessRow>,
): boolean {
  if (!t) return producerId === 'all';
  if (producerId === 'all') return true;
  if (tagProducerCajasShare(t, producerId) > 1e-9) return true;
  const procId = primaryProcessIdFromTag(t);
  const proc = procId != null ? processById.get(procId) : undefined;
  const pid = proc != null ? Number(proc.productor_id ?? 0) : 0;
  return pid === producerId;
}

/**
 * Salida física en lb: prioriza Σ `pounds` en líneas de factura;
 * si la factura no trae lb en ninguna línea, estima proporcional (cajas despachadas / total_cajas) por tarja.
 */
function dispatchOutboundLb(d: DispatchApi, tagById: Map<number, PtTagApi>): number {
  const lines = d.invoice?.lines ?? [];
  const invoiceHasPounds = lines.some((l) => l.pounds != null && String(l.pounds).trim() !== '');
  if (invoiceHasPounds) {
    return lines.reduce((sum, l) => {
      const x = Number(l.pounds);
      return sum + (Number.isFinite(x) ? x : 0);
    }, 0);
  }
  let est = 0;
  for (const it of d.items ?? []) {
    const tag = tagById.get(it.tarja_id);
    if (!tag) continue;
    const tagLb = parseNum(tag.net_weight_lb);
    const tagBoxes = parseNum(tag.total_cajas);
    const boxesOut = parseNum(it.cajas_despachadas);
    if (tagLb <= 0 || boxesOut <= 0) continue;
    if (tagBoxes > 0) est += tagLb * (boxesOut / tagBoxes);
    else est += tagLb;
  }
  return est;
}

/** Misma resolución de productor que `ptTagsFiltered` (proceso primario → tarja). */
function resolvedProducerIdFromTagDashboard(t: PtTagApi | undefined, processById: Map<number, FruitProcessRow>): number | null {
  if (!t) return null;
  const procId = primaryProcessIdFromTag(t);
  const proc = procId != null ? processById.get(procId) : undefined;
  const tagProd = proc != null ? Number(proc.productor_id ?? 0) : primaryProductorIdFromTag(t);
  return tagProd != null && tagProd > 0 ? tagProd : null;
}

function resolvedProducerIdFromInvoiceLine(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
): number | null {
  if (l.fruit_process_id != null && Number(l.fruit_process_id) > 0) {
    const proc = processById.get(Number(l.fruit_process_id));
    const pid = proc != null ? Number(proc.productor_id ?? 0) : null;
    if (pid != null && pid > 0) return pid;
  }
  if (l.tarja_id != null) {
    return resolvedProducerIdFromTagDashboard(tagById.get(l.tarja_id), processById);
  }
  return null;
}

function producerMatchesDashboardFilter(resolvedPid: number | null, producerId: number | 'all'): boolean {
  if (producerId === 'all') return true;
  if (resolvedPid == null || resolvedPid <= 0) return false;
  return resolvedPid === producerId;
}

function invoiceLineMatchesProducerFilter(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  producerId: number | 'all',
): boolean {
  if (producerId === 'all') return true;
  const rp = resolvedProducerIdFromInvoiceLine(l, tagById, processById);
  if (producerMatchesDashboardFilter(rp, producerId)) return true;
  if (l.tarja_id != null) {
    const tag = tagById.get(l.tarja_id);
    if (tag && tagProducerCajasShare(tag, producerId) > 1e-9) return true;
  }
  return false;
}

function invoiceLineLbForDashboardProducer(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  producerId: number | 'all',
): number {
  const x = Number(l.pounds);
  const lb = Number.isFinite(x) ? x : 0;
  if (producerId === 'all') return lb;
  const rp = resolvedProducerIdFromInvoiceLine(l, tagById, processById);
  if (producerMatchesDashboardFilter(rp, producerId)) return lb;
  if (l.tarja_id != null) {
    const tag = tagById.get(l.tarja_id);
    const share = tag ? tagProducerCajasShare(tag, producerId) : 0;
    if (share > 1e-9) return lb * share;
  }
  return 0;
}

function speciesMatchesDashboardFilter(resolvedSpeciesId: number | null, speciesId: number | 'all'): boolean {
  if (speciesId === 'all') return true;
  if (resolvedSpeciesId != null && resolvedSpeciesId !== speciesId) return false;
  return true;
}

/** Alineado al selector Mano / Máquina del dashboard vs `reception_types` (mano, máquina; mixto solo con “ambos”). */
function receptionTypeMatchesWorkMode(r: ReceptionRow, workMode: WorkMode): boolean {
  if (workMode === 'both') return true;
  const cod = (r.reception_type?.codigo ?? '').toLowerCase();
  if (workMode === 'hand') return cod === 'hand_picking';
  if (workMode === 'machine') return cod === 'machine_picking';
  return true;
}

function resolvedSpeciesFromTag(t: PtTagApi | undefined, processById: Map<number, FruitProcessRow>): number | null {
  if (!t) return null;
  const procId = primaryProcessIdFromTag(t);
  const proc = procId != null ? processById.get(procId) : undefined;
  const sp = proc != null ? Number(proc.especie_id ?? 0) : 0;
  return sp > 0 ? sp : null;
}

function invoiceLineResolvedSpecies(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
): number | null {
  const sid = Number(l.species_id ?? 0);
  if (sid > 0) return sid;
  if (l.tarja_id != null) {
    const sp = resolvedSpeciesFromTag(tagById.get(l.tarja_id), processById);
    if (sp != null && sp > 0) return sp;
  }
  if (l.fruit_process_id != null) {
    const proc = processById.get(l.fruit_process_id);
    const sp = proc != null ? Number(proc.especie_id ?? 0) : 0;
    if (sp > 0) return sp;
  }
  return null;
}

function processFromInvoiceLine(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
): FruitProcessRow | undefined {
  if (l.fruit_process_id != null && Number(l.fruit_process_id) > 0) {
    const proc = processById.get(Number(l.fruit_process_id));
    if (proc) return proc;
  }
  if (l.tarja_id != null) {
    const tag = tagById.get(l.tarja_id);
    const procId = tag ? primaryProcessIdFromTag(tag) : null;
    if (procId != null) return processById.get(procId);
  }
  return undefined;
}

function lineWorkModeMatchesForDashboard(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  workMode: WorkMode,
): boolean {
  if (workMode === 'both') return true;
  const proc = processFromInvoiceLine(l, tagById, processById);
  if (proc == null) return true;
  return machineModeMatches(proc.process_machine_kind, workMode);
}

function invoiceLineMatchesDashboardFilters(
  l: InvoiceLineApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  producerId: number | 'all',
  speciesId: number | 'all',
  workMode: WorkMode,
): boolean {
  if (!invoiceLineMatchesProducerFilter(l, tagById, processById, producerId)) return false;
  const rs = invoiceLineResolvedSpecies(l, tagById, processById);
  if (!speciesMatchesDashboardFilter(rs, speciesId)) return false;
  if (!lineWorkModeMatchesForDashboard(l, tagById, processById, workMode)) return false;
  return true;
}

function dispatchItemMatchesDashboardFilters(
  it: { tarja_id: number },
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  producerId: number | 'all',
  speciesId: number | 'all',
  workMode: WorkMode,
): boolean {
  const tag = tagById.get(it.tarja_id);
  if (!tagMatchesProducerFilter(tag, producerId, processById)) return false;
  const rs = resolvedSpeciesFromTag(tag, processById);
  if (!speciesMatchesDashboardFilter(rs, speciesId)) return false;
  if (workMode === 'both') return true;
  const procId = tag ? primaryProcessIdFromTag(tag) : null;
  const proc = procId != null ? processById.get(procId) : undefined;
  if (proc == null) return true;
  return machineModeMatches(proc.process_machine_kind, workMode);
}

/** Libras de salida atribuidas a los filtros globales (productor, especie, modo trabajo). */
function dispatchOutboundLbForDashboardFilters(
  d: DispatchApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  producerId: number | 'all',
  speciesId: number | 'all',
  workMode: WorkMode,
): number {
  if (producerId === 'all' && speciesId === 'all' && workMode === 'both') {
    return dispatchOutboundLb(d, tagById);
  }
  const lines = d.invoice?.lines ?? [];
  const invoiceHasPounds = lines.some((l) => l.pounds != null && String(l.pounds).trim() !== '');
  if (invoiceHasPounds) {
    return lines.reduce((sum, l) => {
      if (!invoiceLineMatchesDashboardFilters(l, tagById, processById, producerId, speciesId, workMode)) return sum;
      return sum + invoiceLineLbForDashboardProducer(l, tagById, processById, producerId);
    }, 0);
  }
  let est = 0;
  for (const it of d.items ?? []) {
    if (!dispatchItemMatchesDashboardFilters(it, tagById, processById, producerId, speciesId, workMode)) continue;
    const tag = tagById.get(it.tarja_id);
    if (!tag) continue;
    const tagLb = ptTagPackoutLbForProducer(tag, producerId, processById);
    const tagBoxes = parseNum(tag.total_cajas);
    const boxesOut = parseNum(it.cajas_despachadas);
    if (tagLb <= 0 || boxesOut <= 0) continue;
    if (tagBoxes > 0) est += tagLb * (boxesOut / tagBoxes);
    else est += tagLb;
  }
  return est;
}

function invoiceSalesForDashboardFilters(
  d: DispatchApi,
  tagById: Map<number, PtTagApi>,
  processById: Map<number, FruitProcessRow>,
  producerId: number | 'all',
  speciesId: number | 'all',
  workMode: WorkMode,
): number {
  const inv = d.invoice;
  if (!inv) return 0;
  const lines = inv.lines ?? [];
  if (lines.length > 0) {
    let sum = 0;
    for (const l of lines) {
      if (!invoiceLineMatchesDashboardFilters(l, tagById, processById, producerId, speciesId, workMode)) continue;
      sum += parseNum(l.line_subtotal);
    }
    return sum;
  }
  const attr = dispatchOutboundLbForDashboardFilters(d, tagById, processById, producerId, speciesId, workMode);
  const full = dispatchOutboundLb(d, tagById);
  if (full <= 1e-9) return 0;
  return parseNum(inv.total) * (attr / full);
}

function orderLoadDateIso(o: SalesOrderRow): string | null {
  const anyOrder = o as SalesOrderRow & {
    loading_date?: string | null;
    fecha_carga?: string | null;
    ship_date?: string | null;
    created_at?: string | null;
  };
  return (
    isoFromUnknown(anyOrder.loading_date) ??
    isoFromUnknown(anyOrder.fecha_carga) ??
    isoFromUnknown(anyOrder.ship_date) ??
    isoFromUnknown(anyOrder.fecha_despacho_cliente) ??
    isoFromUnknown(anyOrder.created_at)
  );
}

function materialCodeSlug(m: DashboardMaterial): string {
  return `${m.nombre_material ?? ''} ${m.material_category?.codigo ?? ''} ${m.material_category?.nombre ?? ''}`.toLowerCase();
}

function materialAppliesToFormatAndClient(m: DashboardMaterial, formatId: number, clientId: number): boolean {
  const formatScope = (m.presentation_format_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (formatScope.length > 0 && !formatScope.includes(formatId)) return false;
  if (formatScope.length === 0) {
    const pf = m.presentation_format_id != null ? Number(m.presentation_format_id) : null;
    if (pf != null && pf > 0 && pf !== formatId) return false;
  }
  const clientScope = (m.client_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (clientScope.length > 0) return clientScope.includes(clientId);
  const cid = m.client_id != null ? Number(m.client_id) : null;
  if (cid != null && cid > 0) return cid === clientId;
  return true;
}

type ChartGranularity = 'day' | 'week';

function ReceivedPackedAreaChart({
  points,
  granularity,
}: {
  points: Array<{ label: string; title?: string; received: number; packed: number; sortKey: string }>;
  granularity: ChartGranularity;
}) {
  if (!points.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/35 text-sm text-slate-500">
        Sin datos en el período
      </div>
    );
  }
  const W = 720;
  const H = 260;
  const padL = 52;
  const padR = 20;
  const padT = 28;
  const padB = granularity === 'week' ? 36 : 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const baseline = padT + innerH;
  const n = points.length;
  const maxVal = Math.max(1, ...points.flatMap((p) => [p.received, p.packed]));
  const xAt = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1));
  const yAt = (v: number) => baseline - (maxVal > 0 ? (innerH * v) / maxVal : 0);

  const lineToArea = (vals: number[]) => {
    if (n === 0) return '';
    let d = `M ${xAt(0)} ${baseline}`;
    for (let i = 0; i < n; i++) d += ` L ${xAt(i)} ${yAt(vals[i] ?? 0)}`;
    d += ` L ${xAt(n - 1)} ${baseline} Z`;
    return d;
  };

  const receivedVals = points.map((p) => p.received);
  const packedVals = points.map((p) => p.packed);
  const tickStep =
    granularity === 'week' ? Math.max(1, n <= 16 ? 1 : Math.ceil(n / 14)) : Math.max(1, Math.ceil(n / 10));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/35 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-sky-500/85" />
            Recibido (lb)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-emerald-600/85" />
            Empacado (lb)
          </span>
        </div>
        <span className="text-slate-400">
          Máx. eje: {maxVal.toLocaleString('es-AR', { maximumFractionDigits: 0 })} lb
        </span>
      </div>
      <svg
        className="mx-auto w-full max-w-[720px]"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Recibido y empacado en libras"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = baseline - innerH * t;
          const val = maxVal * t;
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E2E8F0" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                {val.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        <path d={lineToArea(packedVals)} fill="rgba(5, 150, 105, 0.22)" stroke="none" />
        <path
          d={`M ${xAt(0)} ${yAt(packedVals[0] ?? 0)}${packedVals
            .slice(1)
            .map((v, i) => ` L ${xAt(i + 1)} ${yAt(v)}`)
            .join('')}`}
          fill="none"
          stroke="#059669"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d={lineToArea(receivedVals)} fill="rgba(14, 165, 233, 0.2)" stroke="none" />
        <path
          d={`M ${xAt(0)} ${yAt(receivedVals[0] ?? 0)}${receivedVals
            .slice(1)
            .map((v, i) => ` L ${xAt(i + 1)} ${yAt(v)}`)
            .join('')}`}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((p, i) =>
          i % tickStep === 0 || i === n - 1 ? (
            <g key={`${p.sortKey}-${i}`}>
              {p.title ? <title>{p.title}</title> : null}
              <text
                x={xAt(i)}
                y={H - 10}
                textAnchor={n <= 3 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className={`fill-slate-500 ${granularity === 'week' ? 'text-[10px] font-medium' : 'text-[9px]'}`}
                transform={`rotate(${granularity === 'day' && n > 14 ? -35 : 0}, ${xAt(i)}, ${H - 10})`}
              >
                {p.label}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation('common');
  const { username, role, token } = useAuth();
  const demoReadOnly = isReadOnlySession(role);
  const canLoad = Boolean(token && !isAccessTokenExpired(token));

  const [period, setPeriod] = useState<DashboardPeriod>('accumulated');
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('week');
  const [producerId, setProducerId] = useState<number | 'all'>('all');
  const [speciesId, setSpeciesId] = useState<number | 'all'>('all');
  const [workMode, setWorkMode] = useState<WorkMode>('both');

  const range = useMemo(() => periodRange(period), [period]);
  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('period', period);
    sp.set('producer_id', producerId === 'all' ? 'all' : String(producerId));
    sp.set('species_id', speciesId === 'all' ? 'all' : String(speciesId));
    sp.set('work_mode', workMode);
    return sp.toString();
  }, [period, producerId, speciesId, workMode]);

  const { data: producers } = useQuery({
    queryKey: ['masters', 'producers', 'dashboard'],
    queryFn: () => apiJson<ProducerRow[]>('/api/masters/producers'),
    enabled: canLoad,
    staleTime: 120_000,
  });
  const { data: species } = useQuery({
    queryKey: ['masters', 'species', 'dashboard'],
    queryFn: () => apiJson<SpeciesRow[]>('/api/masters/species'),
    enabled: canLoad,
    staleTime: 120_000,
  });

  const {
    data: trace,
  } = useQuery({
    queryKey: ['traceability', 'dashboard', queryParams],
    queryFn: () => apiJson<TraceDashboard>(`/api/traceability/dashboard?${queryParams}`),
    enabled: canLoad,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const [recQ, procQ, dispQ, tagsQ, ordersQ, matsQ, recipesQ, formatsQ, clientsQ] = useQueries({
    queries: [
      {
        queryKey: ['dashboard', 'receptions', queryParams],
        queryFn: () => apiJson<ReceptionRow[]>('/api/receptions'),
        enabled: canLoad,
        staleTime: 30_000,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['dashboard', 'processes', queryParams],
        queryFn: () => apiJson<FruitProcessRow[]>('/api/processes'),
        enabled: canLoad,
        staleTime: 30_000,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['dashboard', 'dispatches', queryParams],
        queryFn: () => apiJson<DispatchApi[]>('/api/dispatches'),
        enabled: canLoad,
        staleTime: 30_000,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['dashboard', 'pt-tags', queryParams],
        queryFn: () => apiJson<PtTagApi[]>('/api/pt-tags'),
        enabled: canLoad,
        staleTime: 20_000,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['dashboard', 'sales-orders', queryParams],
        queryFn: () => apiJson<SalesOrderRow[]>('/api/sales-orders'),
        enabled: canLoad,
        staleTime: 30_000,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['dashboard', 'packaging-materials', queryParams],
        queryFn: () => apiJson<DashboardMaterial[]>('/api/packaging/materials'),
        enabled: canLoad,
        staleTime: 120_000,
      },
      {
        queryKey: ['dashboard', 'recipes', queryParams],
        queryFn: () => apiJson<RecipeApi[]>('/api/packaging/recipes'),
        enabled: canLoad,
        staleTime: 120_000,
      },
      {
        queryKey: ['dashboard', 'formats', queryParams],
        queryFn: () => apiJson<FormatRow[]>('/api/masters/presentation-formats'),
        enabled: canLoad,
        staleTime: 120_000,
      },
      {
        queryKey: ['dashboard', 'clients', queryParams],
        queryFn: () => apiJson<ClientRow[]>('/api/masters/clients'),
        enabled: canLoad,
        staleTime: 120_000,
      },
    ],
  });

  const receptionsFiltered = useMemo(() => {
    const rows = recQ.data ?? [];
    return rows.filter((r) => {
      if (!inDateRange(r.received_at, range.from, range.to)) return false;
      if (producerId !== 'all' && Number(r.producer_id) !== producerId) return false;
      if (speciesId !== 'all') {
        const hasSpecies = (r.lines ?? []).some((ln) => Number(ln.species_id) === speciesId);
        if (!hasSpecies) return false;
      }
      if (!receptionTypeMatchesWorkMode(r, workMode)) return false;
      return true;
    });
  }, [recQ.data, range, producerId, speciesId, workMode]);

  const processById = useMemo(() => new Map((procQ.data ?? []).map((p) => [p.id, p])), [procQ.data]);
  const ptTagById = useMemo(() => new Map((tagsQ.data ?? []).map((t) => [t.id, t])), [tagsQ.data]);

  const processesFiltered = useMemo(() => {
    const rows = procQ.data ?? [];
    return rows.filter((p) => {
      if (!inDateRange(p.fecha_proceso, range.from, range.to)) return false;
      const pid = Number(p.productor_id ?? 0);
      if (producerId !== 'all' && pid > 0 && pid !== producerId) return false;
      const sid = Number(p.especie_id ?? 0);
      if (speciesId !== 'all' && sid > 0 && sid !== speciesId) return false;
      if (!machineModeMatches(p.process_machine_kind, workMode)) return false;
      return true;
    });
  }, [procQ.data, range, producerId, speciesId, workMode]);

  const ptTagsFiltered = useMemo(() => {
    const rows = tagsQ.data ?? [];
    return rows.filter((t) => {
      if (!countsTowardPtProductionTotals(t)) return false;
      if (!inDateRange(t.fecha, range.from, range.to)) return false;
      const procId = primaryProcessIdFromTag(t);
      const proc = procId != null ? processById.get(procId) : undefined;
      if (!tagMatchesProducerFilter(t, producerId, processById)) return false;
      if (speciesId !== 'all') {
        const sp = proc != null ? Number(proc.especie_id ?? 0) : 0;
        if (sp > 0 && sp !== speciesId) return false;
      }
      if (workMode !== 'both' && proc != null && !machineModeMatches(proc.process_machine_kind, workMode)) return false;
      return true;
    });
  }, [tagsQ.data, range, processById, producerId, speciesId, workMode]);

  const dispatchesFiltered = useMemo(() => {
    const rows = dispQ.data ?? [];
    return rows.filter((d) => {
      const ts = d.fecha_despacho ?? d.despachado_at ?? d.confirmed_at;
      if (!inDateRange(ts, range.from, range.to)) return false;
      if (!dispatchSpeciesMatch(d, speciesId)) return false;
      return true;
    });
  }, [dispQ.data, range, speciesId]);

  const receivedLb = useMemo(
    () => receptionsFiltered.reduce((s, r) => s + receptionNetLb(r), 0),
    [receptionsFiltered],
  );
  const totalPackedLb = useMemo(
    () => ptTagsFiltered.reduce((s, t) => s + ptTagPackoutLbForProducer(t, producerId, processById), 0),
    [ptTagsFiltered, producerId, processById],
  );
  const ptTagsFilteredWithoutNetLb = useMemo(
    () =>
      ptTagsFiltered.reduce(
        (n, t) => n + (ptTagPackoutLbForProducer(t, producerId, processById) <= 0 ? 1 : 0),
        0,
      ),
    [ptTagsFiltered, producerId, processById],
  );
  const totalDispatchedLb = useMemo(
    () =>
      dispatchesFiltered.reduce(
        (s, d) =>
          s +
          dispatchOutboundLbForDashboardFilters(d, ptTagById, processById, producerId, speciesId, workMode),
        0,
      ),
    [dispatchesFiltered, ptTagById, processById, producerId, speciesId, workMode],
  );

  const dispatchesCountForKpi = useMemo(() => {
    return dispatchesFiltered.filter(
      (d) =>
        dispatchOutboundLbForDashboardFilters(d, ptTagById, processById, producerId, speciesId, workMode) > 1e-9,
    ).length;
  }, [dispatchesFiltered, ptTagById, processById, producerId, speciesId, workMode]);
  const netOperationalLb = useMemo(() => totalPackedLb - totalDispatchedLb, [totalPackedLb, totalDispatchedLb]);

  const dashboardFiltersWideOpen = producerId === 'all' && speciesId === 'all' && workMode === 'both';

  const totalSalesBilled = useMemo(() => {
    if (dashboardFiltersWideOpen && trace) {
      if (trace.totalInvoiced != null && Number.isFinite(trace.totalInvoiced)) return trace.totalInvoiced;
      if (trace.totalBilled != null && Number.isFinite(trace.totalBilled)) return trace.totalBilled;
    }
    return dispatchesFiltered.reduce(
      (s, d) => s + invoiceSalesForDashboardFilters(d, ptTagById, processById, producerId, speciesId, workMode),
      0,
    );
  }, [dashboardFiltersWideOpen, trace, dispatchesFiltered, ptTagById, processById, producerId, speciesId, workMode]);

  const invoicesIssuedCount = useMemo(() => {
    if (dashboardFiltersWideOpen && trace?.invoices_issued_count != null && Number.isFinite(trace.invoices_issued_count)) {
      return Math.max(0, Math.round(trace.invoices_issued_count));
    }
    const keys = new Set<string>();
    for (const d of dispatchesFiltered) {
      const sales = invoiceSalesForDashboardFilters(d, ptTagById, processById, producerId, speciesId, workMode);
      if (sales <= 1e-9) continue;
      const inv = d.invoice;
      if (!inv) continue;
      if (inv.id != null) keys.add(`id:${inv.id}`);
      else keys.add(`n:${inv.invoice_number ?? d.id}`);
    }
    return keys.size;
  }, [dashboardFiltersWideOpen, trace, dispatchesFiltered, ptTagById, processById, producerId, speciesId, workMode]);

  const pricePerLbBilled = useMemo(() => {
    if (totalDispatchedLb <= 0) return null;
    return totalSalesBilled / totalDispatchedLb;
  }, [totalSalesBilled, totalDispatchedLb]);

  const averageReceivedDaily = useMemo(() => {
    const days = inclusiveCalendarDays(range.from, range.to);
    return receivedLb / days;
  }, [receivedLb, range]);

  /**
   * Pool para el radar: pedidos más recientes primero (id descendente) para capturar varios abiertos.
   * La fecha de carga deja fuera pedidos viejos sin fecha — por eso priorizamos id.
   */
  const ordersForProgress = useMemo(() => {
    const rows = ordersQ.data ?? [];
    return rows
      .filter((o) => parseNum(o.requested_boxes) > 0 && !isOrderCanceled(o))
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, 150);
  }, [ordersQ.data]);

  const progressQueries = useQueries({
    queries: ordersForProgress.map((o) => ({
      queryKey: ['dashboard', 'sales-order-progress', o.id],
      queryFn: () => apiJson<SalesOrderProgressLite>(`/api/sales-orders/${o.id}/progress`),
      enabled: canLoad,
      staleTime: 20_000,
      refetchInterval: 30_000,
    })),
  });

  type GaugePending = {
    mode: 'pending';
    id: number;
    client: string;
    orderNumber: string;
    /** % cajas pedidas cubiertas en cámara: reserva en cooler, BOL en existencias o cajas ya en PL del pedido. */
    pctCooler: number;
    /** True si el pedido quedó despachado en cajas (salida física completa). */
    salidaCompleta: boolean;
    dueLabel: string;
    urgent: boolean;
    pendingPallets: number;
    /** Equivalente en pallets de lo que falta despachar vs pedido (salida física). */
    pendingSalidaPallets: number;
    noProgress: boolean;
    assignedBoxes: number;
    dispatchedBoxes: number;
    /** Cajas en cámara vinculadas al pedido (planned o BOL = nº pedido). */
    depotReservedBoxes: number;
    estadoComercial: string | null;
    /** Cámara cubre el pedido (arco alto) pero aún falta packing list operativo. */
    waitingPackingFromDepot: boolean;
  };
  type GaugeCompleted = {
    mode: 'completed';
    id: number;
    client: string;
    orderNumber: string;
    dispatchedBoxes: number;
    requestedBoxes: number;
  };

  const gaugeRowsPending = useMemo((): GaugePending[] => {
    return ordersForProgress
      .map((o, idx) => {
        const p = progressQueries[idx].data;
        if (!p) return null;
        const reqBoxes = parseNum(p.totals.requested_boxes);
        if (reqBoxes <= 0) return null;
        const pendingBoxes = parseNum(p.totals.pending_boxes);
        if (pendingBoxes <= 0) return null;
        const assignedPlBoxes = parseNum(p.totals.assigned_pl_boxes);
        const dispatchedBoxes = parseNum(p.totals.dispatched_boxes);
        const depotReservedBoxes = parseNum(p.totals.reserved_depot_boxes);
        const reqPallets = parseNum(o.requested_pallets) > 0 ? parseNum(o.requested_pallets) : reqBoxes / 24;
        const plPalletsDone = assignedPlBoxes / 24;
        const dispPalletsDone = dispatchedBoxes / 24;
        /** Cámara: existencias reservadas (planned/BOL) + cajas ya en PL vinculado al pedido (mismo criterio BOL/PL). */
        const chamberLinkedBoxes = Math.min(reqBoxes, depotReservedBoxes + assignedPlBoxes);
        const pctCooler = reqBoxes > 0 ? clampPct(100 * (chamberLinkedBoxes / reqBoxes)) : 0;
        const salidaCompleta = reqBoxes > 0 && dispatchedBoxes >= reqBoxes - 0.5;
        const pendingPlPallets = Math.max(0, reqPallets - plPalletsDone);
        const pendingSalidaPallets = Math.max(0, reqPallets - dispPalletsDone);
        const dueIso = orderLoadDateIso(o);
        const dueLabel = dueIso ? new Date(dueIso).toLocaleDateString('es-AR') : t('dashboard.gauges.noDate');
        const urgent = dueIso ? new Date(dueIso).getTime() <= new Date(Date.now() + 86_400_000).getTime() : false;
        const hasNoProgress = pctCooler <= 1;
        const estadoComercial = (o.estado_comercial ?? '').trim() || null;
        const waitingPackingFromDepot =
          pctCooler >= 98 && pendingPlPallets > 0.02 && depotReservedBoxes >= 1;
        return {
          mode: 'pending' as const,
          id: o.id,
          client: p.order.cliente_nombre?.trim() || o.cliente_nombre?.trim() || `Cliente #${o.cliente_id}`,
          orderNumber: o.order_number,
          pctCooler,
          salidaCompleta,
          dueLabel,
          urgent,
          pendingPallets: pendingPlPallets,
          pendingSalidaPallets,
          noProgress: hasNoProgress,
          assignedBoxes: assignedPlBoxes,
          dispatchedBoxes,
          depotReservedBoxes,
          estadoComercial,
          waitingPackingFromDepot,
        };
      })
      .filter((x): x is GaugePending => x != null)
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        if (a.pctCooler !== b.pctCooler) return a.pctCooler - b.pctCooler;
        if (a.salidaCompleta !== b.salidaCompleta) return Number(a.salidaCompleta) - Number(b.salidaCompleta);
        return b.pendingPallets - a.pendingPallets;
      });
  }, [ordersForProgress, progressQueries, t]);

  const gaugeRowsCompleted = useMemo((): GaugeCompleted[] => {
    const rows = ordersForProgress
      .map((o, idx) => {
        const p = progressQueries[idx].data;
        if (!p) return null;
        const reqBoxes = parseNum(p.totals.requested_boxes);
        const pendingBoxes = parseNum(p.totals.pending_boxes);
        const dispBoxes = parseNum(p.totals.dispatched_boxes);
        if (reqBoxes <= 0 || pendingBoxes > 0) return null;
        return {
          mode: 'completed' as const,
          id: o.id,
          client: p.order.cliente_nombre?.trim() || o.cliente_nombre?.trim() || `Cliente #${o.cliente_id}`,
          orderNumber: o.order_number,
          dispatchedBoxes: dispBoxes,
          requestedBoxes: reqBoxes,
        };
      })
      .filter((x): x is GaugeCompleted => x != null)
      .sort((a, b) => b.id - a.id)
      .slice(0, 5);
    return rows;
  }, [ordersForProgress, progressQueries]);

  const gaugeRowsRadar = useMemo((): GaugePending[] => {
    // Mostrar siempre pendientes, incluyendo pedidos nuevos sin avance (0%).
    return gaugeRowsPending.slice(0, 5);
  }, [gaugeRowsPending]);

  const gaugeDisplayRows: Array<GaugePending | GaugeCompleted> =
    gaugeRowsRadar.length > 0 ? gaugeRowsRadar : gaugeRowsCompleted;


  const riskOrdersCount = useMemo(
    () => gaugeRowsPending.filter((g) => g.urgent || g.pendingPallets >= 1.5).length,
    [gaugeRowsPending],
  );

  const tripajeCards = useMemo(() => {
    const mats = (matsQ.data ?? []).filter((m) => m.activo);
    const defs: Array<{ key: string; icon: string; label: string; unitsPerPallet: number; matcher: RegExp }> = [
      { key: 'esquineros', icon: '📐', label: t('dashboard.tripaje.labels.esquineros'), unitsPerPallet: 96, matcher: /esquiner|corner|angulo/ },
      { key: 'interconectores', icon: '🔗', label: t('dashboard.tripaje.labels.interconectores'), unitsPerPallet: 24, matcher: /interconector|interconnect|clip/ },
      { key: 'pallets', icon: '🪵', label: t('dashboard.tripaje.labels.pallets'), unitsPerPallet: 1, matcher: /pallet|tarima|palet/ },
      { key: 'fleje', icon: '📎', label: t('dashboard.tripaje.labels.fleje'), unitsPerPallet: 1, matcher: /fleje|strap/ },
      { key: 'zuncho', icon: '🔒', label: t('dashboard.tripaje.labels.zuncho'), unitsPerPallet: 1, matcher: /zuncho|zunch|cincho|seal/ },
    ];
    return defs.map((d) => {
      let qty = 0;
      for (const m of mats) {
        const slug = materialCodeSlug(m);
        if (d.matcher.test(slug)) qty += parseNum(m.cantidad_disponible);
      }
      const containers = qty / Math.max(1e-9, d.unitsPerPallet) / 24;
      return { ...d, qty, containers };
    });
  }, [matsQ.data, t]);

  const capacityCards = useMemo(() => {
    const recipes = (recipesQ.data ?? []).filter((r) => r.activo);
    const formats = (formatsQ.data ?? []).filter((f) => f.activo !== false);
    const mats = (matsQ.data ?? []).filter((m) => m.activo);
    const clients = clientsQ.data ?? [];
    const orders = ordersQ.data ?? [];
    const clientById = new Map(clients.map((c) => [c.id, c.nombre]));
    const matsById = new Map(mats.map((m) => [m.id, m]));
    return formats.map((fmt) => {
      const maxBoxesPerPallet = Math.max(1, parseNum(fmt.max_boxes_per_pallet) || 1);
      const recipesFmt = recipes.filter((r) => r.presentation_format_id === fmt.id);
      const bestRecipe = recipesFmt[0];
      const boxesPossible = (() => {
        if (!bestRecipe) return 0;
        let minBoxes = Infinity;
        let found = false;
        for (const it of bestRecipe.items ?? []) {
          if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
          const m = matsById.get(it.material_id);
          if (!m || m.material_category?.codigo !== 'caja') continue;
          const q = parseNum(it.qty_per_unit);
          if (q <= 0) continue;
          found = true;
          minBoxes = Math.min(minBoxes, parseNum(m.cantidad_disponible) / q);
        }
        return found && Number.isFinite(minBoxes) ? minBoxes : 0;
      })();
      const clamshellPossible = (() => {
        if (!bestRecipe) return 0;
        let minBoxes = Infinity;
        let found = false;
        for (const it of bestRecipe.items ?? []) {
          if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
          const m = matsById.get(it.material_id);
          if (!m || m.material_category?.codigo !== 'clamshell') continue;
          const q = parseNum(it.qty_per_unit);
          if (q <= 0) continue;
          found = true;
          minBoxes = Math.min(minBoxes, parseNum(m.cantidad_disponible) / q);
        }
        return found && Number.isFinite(minBoxes) ? minBoxes : 0;
      })();

      const neededClientIds = new Set<number>();
      for (const o of orders) {
        for (const ln of o.lines ?? []) {
          if (Number(ln.presentation_format_id) === fmt.id && Number(o.cliente_id) > 0) neededClientIds.add(Number(o.cliente_id));
        }
      }

      const etiquetasByClient = [...neededClientIds].map((cid) => {
        let stock = 0;
        for (const m of mats) {
          if (m.material_category?.codigo !== 'etiqueta') continue;
          if (!materialAppliesToFormatAndClient(m, fmt.id, cid)) continue;
          stock += parseNum(m.cantidad_disponible);
        }
        const containers = stock / maxBoxesPerPallet / 24;
        return {
          clientId: cid,
          clientName: clientById.get(cid) ?? `Cliente #${cid}`,
          stock,
          containers,
        };
      });

      const labelsMinContainers =
        etiquetasByClient.length > 0
          ? Math.min(...etiquetasByClient.map((r) => r.containers))
          : Number.POSITIVE_INFINITY;
      const boxesContainers = boxesPossible / maxBoxesPerPallet / 24;
      const clamshellContainers = clamshellPossible / maxBoxesPerPallet / 24;
      const bottleneckContainers = Math.min(
        boxesContainers,
        clamshellContainers,
        Number.isFinite(labelsMinContainers) ? labelsMinContainers : Number.POSITIVE_INFINITY,
      );
      const hasCritical =
        boxesPossible <= 0 ||
        clamshellPossible <= 0 ||
        etiquetasByClient.some((r) => r.stock <= 0) ||
        !Number.isFinite(bottleneckContainers);
      return {
        formatId: fmt.id,
        formatCode: fmt.format_code,
        boxesPossible,
        clamshellPossible,
        boxesContainers,
        clamshellContainers,
        bottleneckContainers: Number.isFinite(bottleneckContainers) ? bottleneckContainers : 0,
        etiquetasByClient,
        hasCritical,
      };
    });
  }, [recipesQ.data, formatsQ.data, matsQ.data, clientsQ.data, ordersQ.data]);

  const receivedPackedChartPoints = useMemo(() => {
    const recMap = new Map<string, number>();
    const packMap = new Map<string, number>();
    for (const r of receptionsFiltered) {
      const k = toDayKey(r.received_at);
      if (!k) continue;
      recMap.set(k, (recMap.get(k) ?? 0) + receptionNetLb(r));
    }
    for (const t of ptTagsFiltered) {
      const k = toDayKey(t.fecha);
      if (!k) continue;
      packMap.set(k, (packMap.get(k) ?? 0) + ptTagPackoutLbForProducer(t, producerId, processById));
    }
    const dayKeys = [...new Set([...recMap.keys(), ...packMap.keys()])].sort((a, b) => a.localeCompare(b));
    if (dayKeys.length === 0) return [];
    if (chartGranularity === 'week') {
      const wRec = new Map<string, number>();
      const wPack = new Map<string, number>();
      for (const k of dayKeys) {
        const wk = mondayKeyFromDayKey(k);
        wRec.set(wk, (wRec.get(wk) ?? 0) + (recMap.get(k) ?? 0));
        wPack.set(wk, (wPack.get(wk) ?? 0) + (packMap.get(k) ?? 0));
      }
      const wKeys = [...new Set([...wRec.keys(), ...wPack.keys()])].sort((a, b) => a.localeCompare(b));
      const weekMeta = wKeys.map((wk) => ({ wk, ...isoWeekFromMondayKey(wk) }));
      const isoYears = new Set(weekMeta.map((w) => w.isoYear));
      const showIsoYear = isoYears.size > 1;
      return weekMeta.map(({ wk, isoYear, week }) => ({
        sortKey: wk,
        label: showIsoYear
          ? t('dashboard.chart.weekAxisYear', { week, year: isoYear })
          : t('dashboard.chart.weekAxis', { week }),
        title: formatWeekRangeLabel(wk),
        received: wRec.get(wk) ?? 0,
        packed: wPack.get(wk) ?? 0,
      }));
    }
    return dayKeys.map((k) => ({
      sortKey: k,
      label: k.slice(5),
      received: recMap.get(k) ?? 0,
      packed: packMap.get(k) ?? 0,
    }));
  }, [receptionsFiltered, ptTagsFiltered, chartGranularity, producerId, processById, t]);

  const productionByClient = useMemo(() => {
    const clientsMap = new Map((clientsQ.data ?? []).map((c) => [c.id, c.nombre]));
    const byClient = new Map<string, { produced: number; dispatched: number; label: string }>();
    const ensure = (cid: number | null) => {
      const key = cid != null && cid > 0 ? `c:${cid}` : 'none';
      const cur = byClient.get(key);
      if (cur) return cur;
      const row = { produced: 0, dispatched: 0, label: cid != null && cid > 0 ? clientsMap.get(cid) ?? `Cliente #${cid}` : 'Sin cliente' };
      byClient.set(key, row);
      return row;
    };
    for (const t of ptTagsFiltered) {
      const cid = t.client_id != null ? Number(t.client_id) : null;
      ensure(cid).produced += ptTagPackoutLbForProducer(t, producerId, processById);
    }
    for (const d of dispatchesFiltered) {
      const lbOut = dispatchOutboundLbForDashboardFilters(
        d,
        ptTagById,
        processById,
        producerId,
        speciesId,
        workMode,
      );
      if (lbOut <= 0) continue;
      const cid = d.client_id != null ? Number(d.client_id) : null;
      ensure(cid).dispatched += lbOut;
    }
    return [...byClient.values()].sort((a, b) => b.produced - a.produced).slice(0, 6);
  }, [ptTagsFiltered, dispatchesFiltered, clientsQ.data, ptTagById, processById, producerId, speciesId, workMode]);

  const activityRows = useMemo(() => {
    const rows: Array<{ id: string; ts: number; when: string; kind: string; detail: string; to: string }> = [];
    for (const r of receptionsFiltered.slice(0, 8)) {
      const iso = r.received_at;
      rows.push({
        id: `r-${r.id}`,
        ts: new Date(iso).getTime(),
        when: new Date(iso).toLocaleString('es-AR'),
        kind: t('dashboard.activity.kindReception'),
        detail: r.reference_code || `#${r.id}`,
        to: '/receptions',
      });
    }
    for (const p of processesFiltered.slice(0, 8)) {
      const iso = p.fecha_proceso;
      rows.push({
        id: `p-${p.id}`,
        ts: new Date(iso).getTime(),
        when: new Date(iso).toLocaleString('es-AR'),
        kind: t('dashboard.activity.kindProcess'),
        detail: `#${p.id}`,
        to: '/processes',
      });
    }
    for (const d of dispatchesFiltered.slice(0, 8)) {
      const iso = d.fecha_despacho ?? d.despachado_at ?? d.confirmed_at;
      rows.push({
        id: `d-${d.id}`,
        ts: new Date(iso).getTime(),
        when: new Date(iso).toLocaleString('es-AR'),
        kind: t('dashboard.activity.kindDispatch'),
        detail: d.numero_bol || `#${d.id}`,
        to: '/dispatches',
      });
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [receptionsFiltered, processesFiltered, dispatchesFiltered, t]);

  type DashboardAlertVariant = 'material_critical' | 'tripaje_critical' | 'order_risk' | 'info';

  const alerts = useMemo(() => {
    const rows: Array<{ key: string; title: string; desc: string; variant: DashboardAlertVariant }> = [];
    if ((trace?.materials_low_stock?.length ?? 0) > 0) {
      rows.push({
        key: 'mat-low',
        title: t('dashboard.alerts.materialCriticalTitle', { count: trace!.materials_low_stock.length }),
        desc: t('dashboard.alerts.materialCriticalDesc'),
        variant: 'material_critical',
      });
    }
    if (riskOrdersCount > 0) {
      rows.push({
        key: 'risk-orders',
        title: t('dashboard.alerts.orderRiskTitle', { count: riskOrdersCount }),
        desc: t('dashboard.alerts.orderRiskDesc'),
        variant: 'order_risk',
      });
    }
    const tripajeCritical = tripajeCards.filter((r) => r.containers < 1).length;
    if (tripajeCritical > 0) {
      rows.push({
        key: 'tripaje',
        title: t('dashboard.alerts.tripajeCriticalTitle', { count: tripajeCritical }),
        desc: t('dashboard.alerts.tripajeCriticalDesc'),
        variant: 'tripaje_critical',
      });
    }
    if (!rows.length) {
      rows.push({
        key: 'ok',
        title: t('dashboard.alerts.okTitle'),
        desc: t('dashboard.alerts.okDesc'),
        variant: 'info',
      });
    }
    return rows.slice(0, 3);
  }, [trace?.materials_low_stock.length, riskOrdersCount, tripajeCards, t]);

  const dashboardLoading =
    canLoad &&
    (recQ.isPending ||
      procQ.isPending ||
      dispQ.isPending ||
      tagsQ.isPending ||
      ordersQ.isPending ||
      matsQ.isPending ||
      recipesQ.isPending ||
      formatsQ.isPending ||
      clientsQ.isPending);

  const dashboardListError =
    recQ.isError ||
    procQ.isError ||
    dispQ.isError ||
    tagsQ.isError ||
    ordersQ.isError ||
    matsQ.isError ||
    recipesQ.isError ||
    formatsQ.isError ||
    clientsQ.isError;

  return (
    <div className={cn(pageStack, 'min-w-0 max-w-full overflow-x-hidden')}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">Pinebloom Packing</p>
          <h1 className={pageTitle}>{t('dashboard.title')}</h1>
          <p className={pageSubtitle}>{t('dashboard.subtitle')}</p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm text-slate-700">
            <User className="mr-1 inline h-4 w-4 text-slate-400" />
            {username ?? t('dashboard.session')} {role ? <span className="text-slate-400">· {role}</span> : null}
          </p>
          <p className="text-[11px] text-slate-500">
            <Calendar className="mr-1 inline h-3.5 w-3.5" />
            {new Date().toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </header>

      {!canLoad ? (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-4 py-3 text-sm text-amber-950 shadow-sm ring-1 ring-amber-100/80">
          <strong className="font-semibold">{t('dashboard.noAuth.title')}</strong>{' '}
          {t('dashboard.noAuth.desc')}{' '}
          <Link to="/login" className="font-medium underline underline-offset-2 hover:no-underline">
            {t('dashboard.noAuth.link')}
          </Link>
        </div>
      ) : null}

      {canLoad && dashboardListError ? (
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm',
            demoReadOnly
              ? 'border border-amber-200/90 bg-amber-50/90 text-amber-950'
              : 'border border-red-200 bg-red-50/90 text-red-900',
          )}
        >
          <strong className="font-semibold">
            {demoReadOnly ? t('dashboard.loadError.demoTitle') : t('dashboard.loadError.title')}
          </strong>{' '}
          {demoReadOnly ? t('dashboard.loadError.demoDesc') : t('dashboard.loadError.desc')}
        </div>
      ) : null}

      <section className="sticky top-0 z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur ring-1 ring-slate-200/70">
        <div className="flex h-10 flex-nowrap items-center gap-2 overflow-x-auto">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {[
              { key: 'today', label: t('dashboard.filters.today') },
              { key: 'week', label: t('dashboard.filters.week') },
              { key: 'accumulated', label: t('dashboard.filters.accumulated') },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key as DashboardPeriod)}
                className={cn(
                  'h-8 shrink-0 rounded-full border px-2.5 text-xs font-medium transition-colors',
                  period === p.key
                    ? 'border-[#1D9E75] bg-[#1D9E75] text-white'
                    : 'border-border bg-background text-foreground hover:bg-muted/60',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="hidden h-5 shrink-0 self-center border-l border-border md:block" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
            <select
              className="h-8 min-w-[8rem] max-w-full flex-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring md:max-w-[14rem] md:flex-initial"
              value={producerId === 'all' ? 'all' : String(producerId)}
              onChange={(e) => setProducerId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">{t('dashboard.filters.allProducers')}</option>
              {(producers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select
              className="h-8 min-w-[7rem] max-w-full flex-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring md:max-w-[12rem] md:flex-initial"
              value={speciesId === 'all' ? 'all' : String(speciesId)}
              onChange={(e) => setSpeciesId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">{t('dashboard.filters.allFruit')}</option>
              {(species ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <select
              className="h-8 min-w-[7rem] max-w-full flex-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring md:max-w-[11rem] md:flex-initial"
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as WorkMode)}
            >
              <option value="both">{t('dashboard.filters.both')}</option>
              <option value="hand">{t('dashboard.filters.hand')}</option>
              <option value="machine">{t('dashboard.filters.machine')}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
      <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('dashboard.kpi.sectionTitle')}</div>
          <p className="mt-1 text-[11px] text-slate-500">{describePeriodDashboard(period)}</p>
      </div>
        {!canLoad ? (
          <div className={emptyStateBanner}>
            {t('dashboard.kpi.loginRequired')}{' '}
            <Link to="/login" className="font-medium underline underline-offset-2">
              {t('dashboard.kpi.loginLink')}
            </Link>
          </div>
        ) : dashboardLoading ? (
          <div className="w-full min-w-0 space-y-3">
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 min-h-36 min-w-0 rounded-2xl" />
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('dashboard.kpi.commercial')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              <Skeleton className="h-36 min-h-36 w-full min-w-0 rounded-2xl" />
              <Skeleton className="h-36 min-h-36 w-full min-w-0 rounded-2xl" />
            </div>
          </div>
        ) : (
          <div className="w-full min-w-0 space-y-3 pb-1">
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0 rounded-2xl border border-[#A6E6D3] bg-gradient-to-br from-[#E7F7F1] to-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="shrink-0 text-xl leading-none sm:text-2xl">📥</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0F6E56] sm:text-xs">{t('dashboard.kpi.received')}</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-[#0F6E56] sm:text-2xl xl:text-3xl 2xl:text-4xl">
                      {format2(receivedLb)} lb
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-[#0F6E56] sm:text-sm">{t('dashboard.kpi.receivedAvg', { value: format2(averageReceivedDaily) })}</p>
                <p className="mt-1.5 text-[10px] leading-snug text-[#0F6E56]/85 sm:text-[11px]">
                  {t('dashboard.kpi.receivedDetail', {
                    receptions: receptionsFiltered.length.toLocaleString('es-AR'),
                    processes: processesFiltered.length.toLocaleString('es-AR'),
                  })}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="shrink-0 text-xl leading-none sm:text-2xl">⚙️</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">{t('dashboard.kpi.packed')}</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl xl:text-3xl 2xl:text-4xl">
                      {format2(totalPackedLb)} lb
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 sm:text-sm">{t('dashboard.kpi.packedDesc')}</p>
                <p className="mt-1.5 text-[10px] text-slate-500 sm:text-[11px]">
                  {t('dashboard.kpi.packedDetail', { count: ptTagsFiltered.length.toLocaleString('es-AR') })}
                  {ptTagsFilteredWithoutNetLb > 0
                    ? t('dashboard.kpi.packedNoWeight', { count: ptTagsFilteredWithoutNetLb })
                    : ''}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="shrink-0 text-xl leading-none sm:text-2xl">🚚</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">{t('dashboard.kpi.dispatched')}</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl xl:text-3xl 2xl:text-4xl">
                      {format2(totalDispatchedLb)} lb
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 sm:text-sm">{t('dashboard.kpi.dispatchedDesc')}</p>
                <p className="mt-1.5 text-[10px] text-slate-500 sm:text-[11px]">
                  {t('dashboard.kpi.dispatchedDetail', { count: dispatchesCountForKpi.toLocaleString('es-AR') })}
                </p>
              </div>
              <div
                className={cn(
                  'min-w-0 rounded-2xl border p-3 shadow-sm sm:p-4',
                  netOperationalLb >= 0
                    ? 'border-[#C9EBD7] bg-gradient-to-br from-[#EFF9F3] to-white'
                    : 'border-[#F6C5C5] bg-gradient-to-br from-[#FDF1F1] to-white',
                )}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="shrink-0 text-xl leading-none sm:text-2xl">{netOperationalLb >= 0 ? '✅' : '⚠️'}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-700 sm:text-xs">{t('dashboard.kpi.balance')}</p>
                    <p
                      className={cn(
                        'mt-0.5 truncate text-xl font-bold tabular-nums sm:text-2xl xl:text-3xl 2xl:text-4xl',
                        netOperationalLb >= 0 ? 'text-[#0F6E56]' : 'text-[#A32D2D]',
                      )}
                    >
                      {format2(netOperationalLb)} lb
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 sm:text-sm">{t('dashboard.kpi.balanceDesc')}</p>
                <p className="mt-1.5 text-[10px] text-slate-500 sm:text-[11px]">
                  {riskOrdersCount > 0
                    ? t('dashboard.kpi.ordersAtRisk', { count: riskOrdersCount })
                    : t('dashboard.kpi.noOrdersAtRisk')}
                </p>
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('dashboard.kpi.commercial')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              <div
                className={cn(
                  'min-w-0 rounded-2xl border p-3 shadow-sm sm:p-4',
                  riskOrdersCount > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-white',
                )}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 sm:h-6 sm:w-6" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">{t('dashboard.kpi.totalSales')}</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl xl:text-3xl 2xl:text-4xl">
                      ${formatMoney(totalSalesBilled)}
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 sm:text-sm">
                  {t('dashboard.kpi.invoicesIssued', { count: invoicesIssuedCount.toLocaleString('es-AR') })}
                </p>
                <p
                  className={cn(
                    'mt-1.5 text-[10px] sm:text-[11px]',
                    riskOrdersCount > 0 ? 'text-amber-600' : 'text-green-600',
                  )}
                >
                  {riskOrdersCount > 0
                    ? `⚠ ${t('dashboard.kpi.ordersAtRisk', { count: riskOrdersCount })}`
                    : t('dashboard.kpi.noOrdersAtRisk')}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 sm:h-6 sm:w-6" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">{t('dashboard.kpi.pricePerLb')}</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl xl:text-3xl 2xl:text-4xl">
                      {pricePerLbBilled != null ? `$${formatMoney(pricePerLbBilled)} / lb` : '—'}
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 sm:text-sm">{t('dashboard.kpi.weightedAvg')}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className={sectionTitle}>{t('dashboard.gauges.title')}</h2>
          <p className={sectionHint}>
            {gaugeRowsRadar.length > 0
              ? t('dashboard.gauges.hintWithBalance')
              : t('dashboard.gauges.hintNoBalance')}
          </p>
        </div>
        {!canLoad ? (
          <p className={emptyStateBanner}>
            {t('dashboard.gauges.loginRequired')}{' '}
            <Link to="/login" className="underline underline-offset-2">
              {t('dashboard.gauges.loginLink')}
            </Link>
          </p>
        ) : ordersQ.isPending || (ordersForProgress.length > 0 && progressQueries.some((q) => q.isPending)) ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full min-w-0 rounded-2xl" />
            ))}
          </div>
        ) : gaugeDisplayRows.length === 0 ? (
          <p className={emptyStateBanner}>{t('dashboard.gauges.noData')}</p>
        ) : (
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {gaugeDisplayRows.map((g) => {
                if (g.mode === 'completed') {
                  const arcFull = arcPath(100, 100, 70, 180, 360);
                  return (
                    <article
                      key={g.id}
                      className="w-full min-w-0 rounded-2xl border border-[#9FE1CB] bg-[#F3FBF8] p-4 shadow-sm"
                    >
                      <header className="mb-2 min-w-0">
                        <p className="text-center text-base font-semibold leading-snug text-slate-900 sm:text-xl lg:text-2xl">
                          {g.client}
                        </p>
                        <p className="text-center font-mono text-sm text-slate-600 sm:text-base">#{g.orderNumber}</p>
                      </header>
                      <div className="flex w-full min-w-0 items-center justify-center">
                        <svg
                          viewBox="0 0 200 120"
                          width="100%"
                          preserveAspectRatio="xMidYMid meet"
                          className="h-32 w-full max-w-[240px] sm:h-40"
                          role="img"
                          aria-label={t('dashboard.gauges.ariaCompleted')}
                        >
                          <path d={arcPath(100, 100, 70, 180, 360)} fill="none" stroke="#E5E7EB" strokeWidth={14} strokeLinecap="round" />
                          <path d={arcFull} fill="none" stroke="#0F6E56" strokeWidth={14} strokeLinecap="round" />
                          <text x="100" y="90" textAnchor="middle" className="fill-slate-900 text-[24px] font-bold" style={{ fontFamily: 'inherit' }}>
                            100%
                          </text>
                        </svg>
                      </div>
                      <footer className="space-y-1 text-center text-sm text-[#0F6E56] sm:text-base lg:text-lg">
                        <p className="font-medium leading-snug">
                          {t('dashboard.gauges.sent', {
                            dispatched: Math.round(g.dispatchedBoxes).toLocaleString('es-AR'),
                            requested: Math.round(g.requestedBoxes).toLocaleString('es-AR'),
                          })}
                        </p>
                      </footer>
                    </article>
                  );
                }
                const pendingTone =
                  g.waitingPackingFromDepot
                    ? {
                        card: 'border-amber-200 bg-amber-50/90',
                        arcCooler: '#D97706',
                        text: 'text-amber-950',
                      }
                    : g.pctCooler <= 1
                      ? {
                          card: 'border-[#F5B3B3] bg-[#FDF2F2]',
                          arcCooler: '#E24B4A',
                          text: 'text-[#B32F2F]',
                        }
                      : g.pctCooler < 70
                        ? {
                            card: 'border-[#F2C27C] bg-[#FFF8ED]',
                            arcCooler: '#E5931A',
                            text: 'text-[#8A560A]',
                          }
                        : {
                            card: 'border-[#A6E6D3] bg-[#F3FBF8]',
                            arcCooler: '#1D9E75',
                            text: 'text-[#0F6E56]',
                          };
                return (
                  <article
                    key={g.id}
                    className={cn('w-full min-w-0 rounded-2xl border p-4 shadow-sm', pendingTone.card)}
                  >
                    <header className="mb-2 min-w-0">
                      <p className="text-center text-base font-semibold leading-snug text-slate-900 sm:text-xl lg:text-2xl">
                        {g.client}
                      </p>
                      <p className="text-center font-mono text-sm text-slate-600 sm:text-base">#{g.orderNumber}</p>
                    </header>
                    <div className="flex w-full min-w-0 flex-col items-center justify-center gap-2">
                      <div className="w-full shrink-0 px-0.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{t('dashboard.gauges.camera')}</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                          {t('dashboard.gauges.cameraDesc')}
                        </p>
                      </div>
                      <svg
                        viewBox="0 0 200 110"
                        width="100%"
                        preserveAspectRatio="xMidYMid meet"
                        className="h-28 w-full max-w-[220px] sm:h-32"
                        role="img"
                        aria-label={`Cámara ${g.pctCooler}%, salida física ${g.salidaCompleta ? 'sí' : 'no'}`}
                      >
                        <path
                          d={arcPath(100, 54, 46, 180, 360)}
                          fill="none"
                          stroke="#E5E7EB"
                          strokeWidth={13}
                          strokeLinecap="round"
                        />
                        <path
                          d={arcPath(100, 54, 46, 180, 180 + (180 * clampPct(g.pctCooler)) / 100)}
                          fill="none"
                          stroke={pendingTone.arcCooler}
                          strokeWidth={13}
                          strokeLinecap="round"
                        />
                        <text
                          x="100"
                          y="48"
                          textAnchor="middle"
                          className="fill-slate-900 text-[22px] font-bold"
                          style={{ fontFamily: 'inherit' }}
                        >
                          {g.pctCooler.toLocaleString('es-AR', { maximumFractionDigits: 0 })}%
                        </text>
                      </svg>
                      <div
                        className={cn(
                          'inline-flex items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold tabular-nums',
                          g.salidaCompleta
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                            : 'border-slate-300 bg-slate-50 text-slate-700',
                        )}
                      >
                        {t('dashboard.gauges.physicalExit')}{' '}
                        <span className="ml-1.5">{g.salidaCompleta ? t('dashboard.gauges.yes') : t('dashboard.gauges.no')}</span>
                      </div>
                    </div>
                    <footer className={cn('space-y-1 text-center text-sm sm:text-base lg:text-lg', pendingTone.text)}>
                      <p className="font-medium leading-snug">
                        {t('dashboard.gauges.loadDate', { label: g.dueLabel })}
                        {g.urgent ? ` ${t('dashboard.gauges.criticalSuffix')}` : ''}
                      </p>
                      <p className="text-sm tabular-nums sm:text-base">
                        PL:{' '}
                        {g.pendingPallets > 0.02
                          ? t('dashboard.gauges.plMissing', { pallets: formatPallets(g.pendingPallets) })
                          : t('dashboard.gauges.plOk')}
                      </p>
                      {g.waitingPackingFromDepot ? (
                        <p className="text-sm font-medium leading-snug text-amber-950">
                          {t('dashboard.gauges.depotReserved', {
                            boxes: Math.round(g.depotReservedBoxes).toLocaleString('es-AR'),
                          })}
                        </p>
                      ) : g.pctCooler >= 99 && (g.pendingPallets > 0.02 || g.pendingSalidaPallets > 0.02) ? (
                        <p className="text-sm font-medium leading-snug text-slate-700">
                          {g.pendingPallets > 0.02
                            ? t('dashboard.gauges.cameraReady')
                            : t('dashboard.gauges.plReady')}
                        </p>
                      ) : null}
                      {g.waitingPackingFromDepot && g.estadoComercial ? (
                        <p className="text-xs text-slate-600">{g.estadoComercial}</p>
                      ) : null}
                      {g.noProgress && !g.waitingPackingFromDepot && g.estadoComercial ? (
                        <p className="text-xs text-slate-600">{g.estadoComercial}</p>
                      ) : null}
                    </footer>
                  </article>
                );
              })}
              </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className={sectionTitle}>{t('dashboard.tripaje.title')}</h2>
          <p className={sectionHint}>{t('dashboard.tripaje.hint')}</p>
              </div>
        {matsQ.isPending ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 min-h-28 w-full min-w-0 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {tripajeCards.map((r) => {
                const cont = r.containers;
                const level = cont < 1 ? 'critical' : cont < 3 ? 'warn' : 'ok';
                return (
                  <div
                    key={r.key}
                    className={cn(
                      'min-w-0 w-full rounded-2xl border p-3 sm:p-4',
                      level === 'critical' && 'border-red-300 bg-red-50',
                      level === 'warn' && 'border-amber-300 bg-amber-50',
                      level === 'ok' && 'border-border bg-background',
                    )}
                  >
                    <p
                      className={cn(
                        'flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium leading-snug sm:text-sm',
                        level === 'critical' && 'text-red-700',
                        level === 'warn' && 'text-amber-700',
                        level === 'ok' && 'font-semibold text-slate-900',
                      )}
                    >
                      <span className="min-w-0 break-words">
                        {r.icon} {r.label}
                      </span>
                      {level === 'critical' ? (
                        <span className="shrink-0 rounded-full border border-red-400 bg-red-100 px-1.5 py-0 text-[10px] font-semibold text-red-700">
                          {t('dashboard.tripaje.criticalBadge')}
                        </span>
                      ) : level === 'warn' ? (
                        <span className="shrink-0 rounded-full border border-amber-400 bg-amber-100 px-1.5 py-0 text-[10px] font-semibold text-amber-800">
                          ⚠
                        </span>
                      ) : null}
                    </p>
                    <p
                      className={cn(
                        'mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl',
                        level === 'critical' && 'text-red-700',
                        level === 'warn' && 'text-amber-700',
                        level === 'ok' && 'text-slate-900',
                      )}
                    >
                      {r.qty.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        level === 'critical' && 'text-red-500',
                        level === 'warn' && 'text-amber-500',
                        level === 'ok' && 'text-[10px] sm:text-xs text-slate-600',
                      )}
                    >
                      {t('dashboard.tripaje.containers', { value: format2(r.containers) })}
                    </p>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className={sectionTitle}>{t('dashboard.capacity.title')}</h2>
          <p className={sectionHint}>{t('dashboard.capacity.hint')}</p>
        </div>
        {formatsQ.isPending || recipesQ.isPending || matsQ.isPending ? (
          <div className="grid gap-3 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-3">
            {capacityCards.map((c) => {
              const badgeGreen = c.bottleneckContainers > 1;
            return (
                <article
                  key={c.formatId}
                  className={cn(
                    'rounded-2xl border p-4',
                    c.hasCritical ? 'border-[#F09595] bg-[#FCEBEB]/60' : 'border-slate-200 bg-white',
                  )}
                >
                  <header className="mb-3 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {c.hasCritical ? '⚠ ' : ''}
                      {c.formatCode}
                    </p>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs font-semibold',
                        badgeGreen ? 'border-[#9FE1CB] bg-[#E1F5EE] text-[#0F6E56]' : 'border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]',
                      )}
                    >
                      {format2(c.bottleneckContainers)} cont
                    </span>
                  </header>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{t('dashboard.capacity.boxes')}</span>
                      <span className="tabular-nums">{format2(c.boxesContainers)} cont</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('dashboard.capacity.clamshell')}</span>
                      <span className="tabular-nums">{format2(c.clamshellContainers)} cont</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('dashboard.capacity.labelsByClient')}</p>
                    {c.etiquetasByClient.length === 0 ? (
                      <p className="text-xs text-slate-500">{t('dashboard.capacity.noClients')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {c.etiquetasByClient.map((r) => (
                          <div key={r.clientId} className="flex items-center justify-between text-xs">
                            <span className="truncate">{r.clientName}</span>
                            <span className="tabular-nums">
                              {Math.round(r.stock).toLocaleString('es-AR')} etq · {format2(r.containers)} cont
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className={sectionTitle}>{t('dashboard.chart.title')}</h2>
            <p className={sectionHint}>
              {t('dashboard.chart.hint')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('dashboard.chart.axisLabel')}</span>
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={chartGranularity}
                onChange={(e) => setChartGranularity(e.target.value as ChartGranularity)}
              >
                <option value="day">{t('dashboard.chart.byDay')}</option>
                <option value="week">{t('dashboard.chart.byWeek')}</option>
              </select>
            </label>
          </div>
        </div>
        {!canLoad ? (
          <p className={emptyStateBanner}>{t('dashboard.chart.noSession')}</p>
        ) : recQ.isPending || tagsQ.isPending ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <ReceivedPackedAreaChart points={receivedPackedChartPoints} granularity={chartGranularity} />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className={sectionTitle}>{t('dashboard.production.title')}</h2>
          <p className={sectionHint}>
            {t('dashboard.production.hint')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {productionByClient.length === 0 ? (
            <p className={emptyStateBanner}>{t('dashboard.production.noData')}</p>
          ) : (
            <div className="space-y-4">
              {productionByClient.map((r) => {
                const produced = r.produced;
                const camara = Math.max(0, produced - r.dispatched);
                const pctCamara = produced > 0 ? clampPct((camara / produced) * 100) : 0;
                const pctDesp = produced > 0 ? clampPct((r.dispatched / produced) * 100) : 0;
          return (
                  <div key={r.label} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-slate-900">{r.label}</span>
                      <span className="shrink-0 tabular-nums text-sm font-medium text-slate-700">
                        {format2(produced)} lb
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-full rounded-full bg-blue-400" />
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pctCamara}%` }} />
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${pctDesp}%` }} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('dashboard.production.detail', {
                        produced: format2(produced),
                        camera: format2(camara),
                        dispatched: format2(r.dispatched),
                      })}
                    </p>
                  </div>
          );
        })}
      </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={sectionTitle}>{t('dashboard.alerts.title')}</h2>
        <div className="space-y-2">
          {alerts.map((a) => {
            const isRed = a.variant === 'material_critical' || a.variant === 'tripaje_critical';
            const isAmber = a.variant === 'order_risk';
            const isInfo = a.variant === 'info';
            return (
              <div
                key={a.key}
                className={cn(
                  'flex items-start gap-3 rounded-md border border-slate-200/80 p-3',
                  isRed && 'border-l-4 border-l-red-500 bg-red-50',
                  isAmber && 'border-l-4 border-l-amber-500 bg-amber-50',
                  isInfo && 'border-l-4 border-l-blue-400 bg-blue-50',
                )}
              >
                {isRed ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
                ) : isAmber ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden />
                )}
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isRed && 'text-red-800',
                      isAmber && 'text-amber-800',
                      isInfo && 'text-blue-800',
                    )}
                  >
                    {a.title}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 opacity-80',
                      isRed && 'text-sm text-red-600',
                      isAmber && 'text-sm text-amber-600',
                      isInfo && 'text-xs text-blue-600',
                    )}
                  >
                    {a.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('dashboard.quickAccess.title')}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button variant="ghost" size="sm" className="h-auto justify-start rounded-xl border bg-white px-3 py-3" asChild>
            <Link to="/receptions"><Import className="mr-2 h-4 w-4" />{t('dashboard.quickAccess.newReception')}</Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-auto justify-start rounded-xl border bg-white px-3 py-3" asChild>
            <Link to="/processes"><ClipboardList className="mr-2 h-4 w-4" />{t('dashboard.quickAccess.newProcess')}</Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-auto justify-start rounded-xl border bg-white px-3 py-3" asChild>
            <Link to="/pt-tags"><Tag className="mr-2 h-4 w-4" />{t('dashboard.quickAccess.newPtUnit')}</Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-auto justify-start rounded-xl border bg-white px-3 py-3" asChild>
            <Link to="/dispatches"><Truck className="mr-2 h-4 w-4" />{t('dashboard.quickAccess.newDispatch')}</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-slate-500">{t('dashboard.activity.title')}</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">{t('dashboard.activity.hint')}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-2">
          {activityRows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">{t('dashboard.activity.noData')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activityRows.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5">
                  <span className="w-36 shrink-0 text-[11px] tabular-nums text-slate-400">{row.when}</span>
                  <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">{row.kind}</span>
                  <Link to={row.to} className="min-w-0 flex-1 truncate text-sm text-slate-800 underline-offset-2 hover:underline">
                    {row.detail}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-8 text-[11px] text-slate-400">
        <Link to="/plant" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
          <Factory className="h-3.5 w-3.5" />
          {t('dashboard.footer.plant')}
        </Link>
        <Link to="/masters" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
          <Library className="h-3.5 w-3.5" />
          {t('dashboard.footer.masters')}
        </Link>
        <Link to="/reporting" className="text-slate-500 transition-colors hover:text-slate-700">
          {t('dashboard.footer.reports')}
        </Link>
        <Link to="/guide/sistema" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
          <GitBranch className="h-3.5 w-3.5" />
          {t('dashboard.footer.guide')}
        </Link>
        <Link to="/about" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
          <Info className="h-3.5 w-3.5" />
          {t('dashboard.footer.about')}
        </Link>
      </footer>
    </div>
  );
}
