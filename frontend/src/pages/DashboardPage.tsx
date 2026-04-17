import { useQuery, useQueries } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CircleAlert,
  ClipboardList,
  Factory,
  GitBranch,
  Import,
  Info,
  Library,
  Tag,
  Truck,
  User,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, isAccessTokenExpired } from '@/api';
import { useAuth } from '@/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  contentCard,
  emptyStateBanner,
  kpiCardLg,
  kpiFootnoteLead,
  kpiLabel,
  kpiValueXl,
  pageStack,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
} from '@/lib/page-ui';
import { formatCount } from '@/lib/number-format';
import { cn } from '@/lib/utils';
import type { DispatchApi } from '@/pages/DispatchesPage';
import type { PackagingMaterialRow } from '@/pages/MaterialsPage';
import type { FruitProcessRow } from '@/pages/ProcessesPage';
import type { ReceptionRow } from '@/pages/ReceptionPage';
import type { RecipeApi } from '@/pages/RecipesPage';
import type { SalesOrderRow } from '@/pages/SalesOrdersPage';
import { countsTowardPtProductionTotals, type PtTagApi } from '@/pages/PtTagsPage';

type DashboardMaterial = PackagingMaterialRow & {
  material_category?: { id: number; codigo: string; nombre: string };
};

/** Insumo incluido en el cálculo según filtros de formato y cliente. */
function materialAppliesToCapView(
  m: DashboardMaterial,
  recipeFormatId: number,
  clientFilter: number | 'all',
): boolean {
  const formatScope = (m.presentation_format_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (formatScope.length > 0) {
    if (!formatScope.includes(recipeFormatId)) return false;
  } else {
    const pf = m.presentation_format_id != null ? Number(m.presentation_format_id) : null;
    if (pf != null && pf !== recipeFormatId) return false;
  }
  const clientScope = (m.client_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (clientFilter === 'all') {
    if (clientScope.length > 0) return false;
    const cid = m.client_id != null ? Number(m.client_id) : null;
    if (cid != null) return false;
  } else if (clientScope.length > 0) {
    if (!clientScope.includes(clientFilter)) return false;
  } else {
    const cid = m.client_id != null ? Number(m.client_id) : null;
    if (cid != null && cid !== clientFilter) return false;
  }
  if (m.client_id != null && clientScope.length > 0 && !clientScope.includes(Number(m.client_id))) {
    return false;
  }
  return true;
}

/** Color de barra de llenado de contenedor (referencia operativa). */
function containerFillTone(pct: number): string {
  if (pct < 50) return 'bg-rose-500';
  if (pct < 80) return 'bg-amber-400';
  return 'bg-emerald-500';
}

type TraceDashboard = {
  counts: {
    receptions: number;
    reception_lines: number;
    fruit_processes: number;
    pt_tags: number;
    dispatches: number;
    packaging_materials: number;
    final_pallets: number;
    packaging_material_movements: number;
  };
  materials_low_stock: Array<{
    id: number;
    nombre_material: string;
    cantidad_disponible: string;
    unidad_medida: string;
    categoria: string;
  }>;
  chain_hint: string;
};

type SalesOrderProgressLite = {
  order: { id: number; order_number: string; cliente_nombre: string | null };
  totals: {
    requested_boxes: number;
    assigned_pl_boxes: number;
    dispatched_boxes: number;
    pending_boxes: number;
  };
  lines: Array<{ fulfillment: 'pendiente' | 'parcial' | 'completo'; alerts: string[] }>;
};

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function todayLabel() {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}

function parseActivityTs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function localDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type ActivityRow = {
  id: string;
  at: number;
  whenLabel: string;
  kind: string;
  detail: string;
  to: string;
};

function buildActivityRows(
  receptions: ReceptionRow[] | undefined,
  processes: FruitProcessRow[] | undefined,
  dispatches: DispatchApi[] | undefined,
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  (receptions ?? []).forEach((r) => {
    const at = parseActivityTs(r.created_at);
    rows.push({
      id: `r-${r.id}`,
      at,
      whenLabel: formatShortDate(r.created_at),
      kind: 'Recepción',
      detail: r.reference_code?.trim() || `#${r.id}`,
      to: '/receptions',
    });
  });
  (processes ?? []).forEach((p) => {
    const at = parseActivityTs(p.fecha_proceso);
    const st = p.process_status ? ` · ${p.process_status}` : '';
    rows.push({
      id: `p-${p.id}`,
      at,
      whenLabel: formatShortDate(p.fecha_proceso),
      kind: 'Proceso',
      detail: `#${p.id}${st}`,
      to: '/processes',
    });
  });
  (dispatches ?? []).forEach((d) => {
    const raw = d.despachado_at ?? d.confirmed_at ?? d.fecha_despacho;
    const at = parseActivityTs(raw);
    rows.push({
      id: `d-${d.id}`,
      at,
      whenLabel: formatShortDate(raw ?? d.fecha_despacho),
      kind: 'Despacho',
      detail: d.numero_bol?.trim() || `#${d.id}`,
      to: '/dispatches',
    });
  });
  return rows.sort((a, b) => b.at - a.at).slice(0, 6);
}

/** Curva suavizada tipo spline (Catmull-Rom → cúbicas). */
function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

type ReceivedVolumeChartPoint = {
  idx: number;
  x: number;
  y: number;
  val: number;
  axisLabel: string;
  tooltipDate: string;
};

type ReceivedVolumeChartModel = {
  width: number;
  height: number;
  yMin: number;
  yMax: number;
  points: ReceivedVolumeChartPoint[];
  linePath: string;
  areaPath: string;
  guideY: number[];
  labelIndices: number[];
};

function ReceivedVolumeChart({
  model,
  filterLabel,
}: {
  model: ReceivedVolumeChartModel | null;
  filterLabel: string;
}) {
  const gradId = useId().replace(/:/g, '');
  const [tip, setTip] = useState<{ clientX: number; clientY: number; idx: number } | null>(null);

  if (!model || model.points.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/35 text-sm text-slate-500">
        Sin datos en el período
      </div>
    );
  }

  const tipData = tip != null ? model.points.find((p) => p.idx === tip.idx) : null;

  return (
    <div className="relative">
      {tipData != null && tip != null ? (
        <div
          className="pointer-events-none fixed z-50 max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
          style={{ left: Math.min(tip.clientX + 14, typeof window !== 'undefined' ? window.innerWidth - 240 : 0), top: tip.clientY - 8, transform: 'translateY(-100%)' }}
        >
          <p className="font-semibold text-slate-900">{tipData.tooltipDate}</p>
          <p className="mt-0.5 tabular-nums text-slate-800">
            {tipData.val.toLocaleString('es-AR', { maximumFractionDigits: 2 })} lb
          </p>
          <p className="mt-1 text-slate-500">{filterLabel}</p>
        </div>
      ) : null}
      <div className="rounded-xl border border-slate-100 bg-slate-50/35 p-2 sm:p-3">
        <svg viewBox={`0 0 ${model.width} ${model.height}`} className="h-56 w-full" role="img" aria-label="Volumen recibido">
          <defs>
            <linearGradient id={`vol-fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
              <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </linearGradient>
          </defs>
          {model.guideY.map((y, idx) => (
            <line key={idx} x1="0" y1={y} x2={model.width} y2={y} stroke="#e2e8f0" strokeDasharray="3 4" />
          ))}
          <path d={model.areaPath} fill={`url(#vol-fill-${gradId})`} stroke="none" />
          <path d={model.linePath} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {model.points.map((p) => {
            const isLast = p.idx === model.points[model.points.length - 1]?.idx;
            const showLabel = model.labelIndices.includes(p.idx);
            const lb = p.val.toLocaleString('es-AR', { maximumFractionDigits: p.val >= 1000 ? 0 : 1 });
            return (
              <g key={p.idx}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={14}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={(e) => setTip({ clientX: e.clientX, clientY: e.clientY, idx: p.idx })}
                  onMouseMove={(e) => setTip({ clientX: e.clientX, clientY: e.clientY, idx: p.idx })}
                  onMouseLeave={() => setTip(null)}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isLast ? 6 : 3.5}
                  fill={isLast ? '#0369a1' : '#ffffff'}
                  stroke="#0284c7"
                  strokeWidth={isLast ? 2 : 1.5}
                  className="pointer-events-none"
                />
                {showLabel ? (
                  <text
                    x={p.x}
                    y={p.y - 10}
                    textAnchor="middle"
                    className="pointer-events-none fill-slate-700 text-[9px] font-semibold"
                    style={{ fontFamily: 'inherit' }}
                  >
                    {lb}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { username, role, token } = useAuth();
  const canLoadTrace = Boolean(token && !isAccessTokenExpired(token));

  const {
    data: trace,
    isPending: tracePending,
    isError: traceError,
    error: traceErr,
  } = useQuery({
    queryKey: ['traceability', 'dashboard'],
    queryFn: () => apiJson<TraceDashboard>('/api/traceability/dashboard'),
    retry: 1,
    enabled: canLoadTrace,
  });

  const [recQuery, procQuery, dispQuery, ptTagsQ, salesOrdersQ, materialsQ, recipesQ, formatsQ, clientsQ, receptionTypesQ] =
    useQueries({
    queries: [
      {
        queryKey: ['receptions'],
        queryFn: () => apiJson<ReceptionRow[]>('/api/receptions'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['processes'],
        queryFn: () => apiJson<FruitProcessRow[]>('/api/processes'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['dispatches'],
        queryFn: () => apiJson<DispatchApi[]>('/api/dispatches'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['pt-tags', 'dashboard'],
        queryFn: () => apiJson<PtTagApi[]>('/api/pt-tags'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['sales-orders', 'dashboard'],
        queryFn: () => apiJson<SalesOrderRow[]>('/api/sales-orders'),
        enabled: canLoadTrace,
        staleTime: 60_000,
      },
      {
        queryKey: ['packaging', 'materials', 'dashboard'],
        queryFn: () => apiJson<PackagingMaterialRow[]>('/api/packaging/materials'),
        enabled: canLoadTrace,
        staleTime: 120_000,
      },
      {
        queryKey: ['packaging', 'recipes', 'dashboard'],
        queryFn: () => apiJson<RecipeApi[]>('/api/packaging/recipes'),
        enabled: canLoadTrace,
        staleTime: 120_000,
      },
      {
        queryKey: ['masters', 'formats', 'dashboard'],
        queryFn: () =>
          apiJson<Array<{ id: number; format_code: string; max_boxes_per_pallet?: number | null }>>(
            '/api/masters/presentation-formats',
          ),
        enabled: canLoadTrace,
        staleTime: 120_000,
      },
      {
        queryKey: ['masters', 'clients', 'dashboard'],
        queryFn: () => apiJson<Array<{ id: number; codigo: string; nombre: string }>>('/api/masters/clients'),
        enabled: canLoadTrace,
        staleTime: 120_000,
      },
      {
        queryKey: ['masters', 'reception-types', 'dashboard'],
        queryFn: () => apiJson<Array<{ id: number; codigo: string; nombre: string; activo: boolean }>>('/api/masters/reception-types'),
        enabled: canLoadTrace,
        staleTime: 120_000,
      },
    ],
  });

  const [capClientId] = useState<number | 'all'>('all');
  const [receptionTypeFilter, setReceptionTypeFilter] = useState<number | 'all'>('all');
  const [volumeRange, setVolumeRange] = useState<'7d' | '14d' | 'weeks'>('14d');
  const [boardClientByFormat, setBoardClientByFormat] = useState<Record<number, number | 'all'>>({});

  const receptionTypeOptions = useMemo(() => {
    const list = receptionTypesQ.data ?? [];
    return list.filter((t) => t.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [receptionTypesQ.data]);

  useEffect(() => {
    if (receptionTypeFilter === 'all') return;
    if (!receptionTypeOptions.some((t) => t.id === receptionTypeFilter)) setReceptionTypeFilter('all');
  }, [receptionTypeFilter, receptionTypeOptions]);

  /** Referencia logística: llenado de contenedor vs pallets teóricos. */
  const CONTAINER_PALLETS = 24;

  /** Estado por formato para chips (misma regla de bottleneck que capacityPreview, sin modificar ese memo). */
  const formatChipStatus = useMemo(() => {
    const recipes = (recipesQ.data ?? []).filter((r) => r.activo);
    const mats = (materialsQ.data ?? []) as DashboardMaterial[];
    const fmtById = new Map((formatsQ.data ?? []).map((f) => [f.id, f]));
    const matById = new Map(mats.map((m) => [m.id, m]));
    const map = new Map<number, 'danger' | 'warn' | 'ok'>();
    for (const fmt of formatsQ.data ?? []) {
      if ((fmt as { activo?: boolean }).activo === false) continue;
      const fid = fmt.id;
      const hasRecipe = recipes.some((r) => r.presentation_format_id === fid);
      if (!hasRecipe) {
        map.set(fid, 'danger');
        continue;
      }
      const recs = recipes.filter((r) => r.presentation_format_id === fid);
      let anyPositive = false;
      for (const rec of recs) {
        const fmeta = fmtById.get(rec.presentation_format_id);
        if (!fmeta) continue;
        let bottleneck = Infinity;
        for (const it of rec.items ?? []) {
          if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
          const m = matById.get(it.material_id) as DashboardMaterial | undefined;
          if (!m?.activo) continue;
          if (!materialAppliesToCapView(m, rec.presentation_format_id, capClientId)) continue;
          const qtyBox = Number(it.qty_per_unit);
          const avail = Number(m.cantidad_disponible);
          if (!Number.isFinite(qtyBox) || qtyBox <= 0 || !Number.isFinite(avail) || avail < 0) continue;
          const maxBoxes = Math.floor(avail / qtyBox + 1e-9);
          if (maxBoxes < bottleneck) bottleneck = maxBoxes;
        }
        if (Number.isFinite(bottleneck) && bottleneck < Infinity && bottleneck > 0) {
          anyPositive = true;
          break;
        }
      }
      map.set(fid, anyPositive ? 'ok' : 'warn');
    }
    return map;
  }, [recipesQ.data, materialsQ.data, formatsQ.data, capClientId]);

  /** Tablero global: capacidad resumida por formato (sin cambiar la lógica base de capacidad). */
  const capacityFormatBoard = useMemo(() => {
    const mats = (materialsQ.data ?? []) as DashboardMaterial[];
    const recipes = (recipesQ.data ?? []).filter((r) => r.activo);
    const fmtList = (formatsQ.data ?? []).filter((f) => (f as { activo?: boolean }).activo !== false);
    const fmtById = new Map(fmtList.map((f) => [f.id, f]));
    const matById = new Map(mats.map((m) => [m.id, m]));
    const clientRows = clientsQ.data ?? [];

    function bestCapacity(
      fid: number,
      clientFilter: number | 'all',
    ): {
      containers: number;
      containerPct: number;
      fillPctRaw: number;
      boxesPossible: number;
      recipeId: number;
    } | null {
      const fmt = fmtById.get(fid);
      if (!fmt) return null;
      const maxPallet = fmt.max_boxes_per_pallet != null ? Number(fmt.max_boxes_per_pallet) : NaN;
      const maxBpInt = Number.isFinite(maxPallet) && maxPallet > 0 ? Math.floor(maxPallet) : 0;
      const recs = recipes.filter((r) => r.presentation_format_id === fid);
      let best: { bottleneck: number; pallets: number; containerPct: number; fillPctRaw: number; recipeId: number } | null = null;
      for (const rec of recs) {
        let bottleneck = Infinity;
        for (const it of rec.items ?? []) {
          if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
          const m = matById.get(it.material_id) as DashboardMaterial | undefined;
          if (!m?.activo) continue;
          if (!materialAppliesToCapView(m, rec.presentation_format_id, clientFilter)) continue;
          const qtyBox = Number(it.qty_per_unit);
          const avail = Number(m.cantidad_disponible);
          if (!Number.isFinite(qtyBox) || qtyBox <= 0 || !Number.isFinite(avail) || avail < 0) continue;
          const maxBoxes = Math.floor(avail / qtyBox + 1e-9);
          if (maxBoxes < bottleneck) bottleneck = maxBoxes;
        }
        if (!Number.isFinite(bottleneck) || bottleneck === Infinity || bottleneck <= 0) continue;
        const pallets = maxBpInt > 0 ? Math.floor(bottleneck / maxBpInt + 1e-9) : 0;
        const fillPctRaw = (pallets / CONTAINER_PALLETS) * 100;
        const containerPct = Math.min(100, fillPctRaw);
        if (!best || bottleneck > best.bottleneck) {
          best = { bottleneck, pallets, containerPct, fillPctRaw, recipeId: rec.id };
        }
      }
      if (!best) return null;
      return {
        containers: best.pallets / CONTAINER_PALLETS,
        containerPct: best.containerPct,
        fillPctRaw: best.fillPctRaw,
        boxesPossible: best.bottleneck,
        recipeId: best.recipeId,
      };
    }

    function sumEtiquetas(fid: number, clientFilter: number | 'all'): number {
      let s = 0;
      for (const m of mats) {
        if (!m.activo || m.material_category?.codigo !== 'etiqueta') continue;
        const scope = (m.presentation_format_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
        if (scope.length > 0) {
          if (!scope.includes(fid)) continue;
        } else {
          const pf = m.presentation_format_id != null ? Number(m.presentation_format_id) : null;
          if (pf != null && pf !== fid) continue;
        }
        if (!materialAppliesToCapView(m, fid, clientFilter)) continue;
        s += Number(m.cantidad_disponible) || 0;
      }
      return s;
    }

    function capacityByCategory(
      fid: number,
      recipeId: number,
      category: 'caja' | 'clamshell',
      clientFilter: number | 'all',
    ): number | null {
      const rec = recipes.find((r) => r.id === recipeId);
      if (!rec) return null;
      let bottleneck = Infinity;
      let found = false;
      for (const it of rec.items ?? []) {
        if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
        const m = matById.get(it.material_id) as DashboardMaterial | undefined;
        if (!m?.activo || m.material_category?.codigo !== category) continue;
        if (!materialAppliesToCapView(m, fid, clientFilter)) continue;
        const qtyBox = Number(it.qty_per_unit);
        const avail = Number(m.cantidad_disponible);
        if (!Number.isFinite(qtyBox) || qtyBox <= 0 || !Number.isFinite(avail) || avail < 0) continue;
        found = true;
        const maxBoxes = Math.floor(avail / qtyBox + 1e-9);
        if (maxBoxes < bottleneck) bottleneck = maxBoxes;
      }
      if (!found || !Number.isFinite(bottleneck) || bottleneck === Infinity) return null;
      return bottleneck;
    }

    const segmentDefs: Array<{ key: string; label: string; filter: number | 'all' }> = [
      { key: 'gen', label: 'Genéricos', filter: 'all' },
      ...clientRows.map((c) => ({ key: `c-${c.id}`, label: c.nombre, filter: c.id as number })),
    ];

    const cards: Array<{
      formatId: number;
      formatCode: string;
      totalContainers: number;
      status: 'red' | 'yellow' | 'green';
      rows: Array<{
        key: string;
        label: string;
        clientId: number | 'all';
        containers: number;
        fillPctRaw: number;
        boxesPossible: number;
        clamshellPossible: number;
        etiquetaStock: number;
      }>;
    }> = [];

    for (const fmt of fmtList) {
      const fid = fmt.id;
      const formatCode = (fmt.format_code ?? '').trim() || '—';
      const rows: Array<{
        key: string;
        label: string;
        clientId: number | 'all';
        containers: number;
        fillPctRaw: number;
        boxesPossible: number;
        clamshellPossible: number;
        etiquetaStock: number;
      }> = [];
      const contVals: number[] = [];
      let maxCont = 0;
      for (const seg of segmentDefs) {
        const cap = bestCapacity(fid, seg.filter);
        const containers = cap?.containers ?? 0;
        const fillPctRaw = cap?.fillPctRaw ?? 0;
        const boxesPossible = cap?.recipeId != null ? capacityByCategory(fid, cap.recipeId, 'caja', seg.filter) ?? 0 : 0;
        const clamshellPossible =
          cap?.recipeId != null ? capacityByCategory(fid, cap.recipeId, 'clamshell', seg.filter) ?? 0 : 0;
        const etiquetaStock = sumEtiquetas(fid, seg.filter);
        rows.push({
          key: seg.key,
          label: seg.label,
          clientId: seg.filter,
          containers,
          fillPctRaw,
          boxesPossible,
          clamshellPossible,
          etiquetaStock,
        });
        if (Number.isFinite(containers)) {
          contVals.push(containers);
          maxCont = Math.max(maxCont, containers);
        }
      }
      let status: 'red' | 'yellow' | 'green' = 'red';
      const anyGe1 = contVals.some((v) => v >= 1);
      const anyHalf = contVals.some((v) => v >= 0.5 && v < 1);
      if (anyGe1) status = 'green';
      else if (anyHalf) status = 'yellow';
      else status = 'red';

      cards.push({
        formatId: fid,
        formatCode,
        totalContainers: maxCont,
        status,
        rows,
      });
    }

    return cards.sort((a, b) => b.totalContainers - a.totalContainers);
  }, [materialsQ.data, recipesQ.data, formatsQ.data, clientsQ.data]);

  const activityRows = useMemo(
    () => buildActivityRows(recQuery.data, procQuery.data, dispQuery.data),
    [recQuery.data, procQuery.data, dispQuery.data],
  );

  const openProcessesCount = useMemo(() => {
    const list = procQuery.data ?? [];
    return list.filter((p) => p.process_status === 'borrador' || p.process_status === 'confirmado').length;
  }, [procQuery.data]);

  const todayKey = localDayKey(new Date().toISOString());

  const dispatchBoxes = (d: DispatchApi): number => {
    const byItems = d.items.reduce((s, i) => s + (Number(i.cajas_despachadas) || 0), 0);
    if (byItems > 0) return byItems;
    return (d.invoice?.lines ?? []).reduce((s, ln) => s + (Number(ln.cajas) || 0), 0);
  };

  const executiveToday = useMemo(() => {
    const receptions = recQuery.data ?? [];
    const processes = procQuery.data ?? [];
    const tags = ptTagsQ.data ?? [];
    const dispatches = dispQuery.data ?? [];
    const clientSet = new Set<number>();

    let receivedLb = 0;
    for (const r of receptions) {
      if (localDayKey(r.received_at) !== todayKey) continue;
      for (const ln of r.lines ?? []) {
        const net = Number(ln.net_lb);
        if (Number.isFinite(net)) receivedLb += net;
      }
    }

    let processedLb = 0;
    for (const p of processes) {
      if (localDayKey(p.fecha_proceso) !== todayKey) continue;
      const lb = Number(p.peso_procesado_lb);
      if (Number.isFinite(lb)) processedLb += lb;
    }

    let producedBoxes = 0;
    for (const t of tags) {
      if (!countsTowardPtProductionTotals(t)) continue;
      if (localDayKey(t.fecha) !== todayKey) continue;
      producedBoxes += Number(t.total_cajas) || 0;
      const cid = t.client_id != null ? Number(t.client_id) : 0;
      if (cid > 0) clientSet.add(cid);
    }

    let dispatchedBoxes = 0;
    for (const d of dispatches) {
      const raw = d.despachado_at ?? d.confirmed_at ?? d.fecha_despacho;
      if (localDayKey(raw) !== todayKey) continue;
      dispatchedBoxes += dispatchBoxes(d);
      const cid = d.client_id != null ? Number(d.client_id) : 0;
      if (cid > 0) clientSet.add(cid);
    }

    return {
      receivedLb,
      processedLb,
      producedBoxes,
      dispatchedBoxes,
      activeClients: clientSet.size,
    };
  }, [recQuery.data, procQuery.data, ptTagsQ.data, dispQuery.data, todayKey]);

  const receivedVolumeSeries = useMemo(() => {
    const receptions = recQuery.data ?? [];
    const isWeekly = volumeRange === 'weeks';
    const dailyCount = volumeRange === '7d' ? 7 : 14;
    const weekCount = 8;
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);

    const startOfWeek = (d: Date) => {
      const out = new Date(d);
      const day = out.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      out.setDate(out.getDate() + mondayOffset);
      out.setHours(0, 0, 0, 0);
      return out;
    };

    const base = new Map<string, { key: string; label: string; received: number }>();
    if (isWeekly) {
      const wk0 = startOfWeek(d0);
      for (let i = weekCount - 1; i >= 0; i -= 1) {
        const d = new Date(wk0);
        d.setDate(wk0.getDate() - i * 7);
        const k = localDayKey(d.toISOString());
        if (!k) continue;
        base.set(k, {
          key: k,
          label: `Sem ${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`,
          received: 0,
        });
      }
    } else {
      for (let i = dailyCount - 1; i >= 0; i -= 1) {
        const d = new Date(d0);
        d.setDate(d0.getDate() - i);
        const k = localDayKey(d.toISOString());
        if (!k) continue;
        base.set(k, {
          key: k,
          label: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
          received: 0,
        });
      }
    }

    for (const r of receptions) {
      if (receptionTypeFilter !== 'all' && Number(r.reception_type_id) !== receptionTypeFilter) continue;

      const rk = localDayKey(r.received_at);
      if (!rk) continue;
      let key = rk;
      if (isWeekly) {
        const d = new Date(`${rk}T00:00:00`);
        key = localDayKey(startOfWeek(d).toISOString()) ?? rk;
      }
      const row = base.get(key);
      if (!row) continue;
      for (const ln of r.lines ?? []) {
        const net = Number(ln.net_lb);
        if (Number.isFinite(net)) row.received += net;
      }
    }
    return [...base.values()];
  }, [recQuery.data, receptionTypeFilter, volumeRange]);

  const receivedVolumeSummary = useMemo(() => {
    const total = receivedVolumeSeries.reduce((s, r) => s + r.received, 0);
    const avg = receivedVolumeSeries.length > 0 ? total / receivedVolumeSeries.length : 0;
    return { total, avg, periods: receivedVolumeSeries.length };
  }, [receivedVolumeSeries]);

  const volumeReceivedSubtitle = useMemo(() => {
    const base =
      volumeRange === 'weeks'
        ? 'Lb recibidas por semana - ultimas 8 semanas'
        : `Lb recibidas por dia - ultimos ${volumeRange === '7d' ? 7 : 14} dias`;
    if (receptionTypeFilter === 'all') return base;
    const name = receptionTypeOptions.find((t) => t.id === receptionTypeFilter)?.nombre?.trim();
    return `${base} - ${name ?? 'Tipo'}`;
  }, [volumeRange, receptionTypeFilter, receptionTypeOptions]);

  const receptionFilterTooltipLabel = useMemo(() => {
    if (receptionTypeFilter === 'all') return 'Total';
    return receptionTypeOptions.find((t) => t.id === receptionTypeFilter)?.nombre?.trim() ?? 'Tipo';
  }, [receptionTypeFilter, receptionTypeOptions]);

  const receivedVolumeChartModel = useMemo((): ReceivedVolumeChartModel | null => {
    const width = 900;
    const height = 260;
    const padLeft = 28;
    const padRight = 28;
    const padTop = 28;
    const padBottom = 36;
    const innerW = Math.max(1, width - padLeft - padRight);
    const innerH = Math.max(1, height - padTop - padBottom);
    const n = receivedVolumeSeries.length;
    if (n === 0) return null;

    const vals = receivedVolumeSeries.map((r) => r.received);
    const maxRaw = Math.max(...vals);
    const yMin = 0;
    const span = Math.max(maxRaw - yMin, 1e-9);
    const yMax = Math.max(maxRaw + span * 0.15, maxRaw + 1, 1);

    const yAtVal = (v: number) => padTop + innerH - ((Math.max(0, v) - yMin) / (yMax - yMin)) * innerH;
    const yBase = padTop + innerH;
    const xAt = (idx: number) => padLeft + (n <= 1 ? innerW / 2 : (idx / (n - 1)) * innerW);

    const pts = vals.map((v, i) => ({
      x: xAt(i),
      y: yAtVal(v),
    }));
    const linePath = smoothLinePath(pts);
    const areaPath =
      n === 1
        ? `M ${pts[0].x} ${yBase} L ${pts[0].x} ${pts[0].y} L ${pts[0].x} ${yBase} Z`
        : `${linePath} L ${pts[n - 1].x} ${yBase} L ${pts[0].x} ${yBase} Z`;

    let maxIdx = 0;
    let minIdx = 0;
    for (let i = 0; i < vals.length; i += 1) {
      if (vals[i] > vals[maxIdx]) maxIdx = i;
      if (vals[i] < vals[minIdx]) minIdx = i;
    }
    const lastIdx = n - 1;
    const labelSet = new Set<number>();
    labelSet.add(lastIdx);
    labelSet.add(maxIdx);
    if (minIdx !== maxIdx) labelSet.add(minIdx);
    const labelIndices = [...labelSet].sort((a, b) => a - b);

    const points: ReceivedVolumeChartPoint[] = receivedVolumeSeries.map((row, i) => {
      let tooltipDate = row.label;
      try {
        const d = new Date(`${row.key}T12:00:00`);
        if (!Number.isNaN(d.getTime())) {
          tooltipDate = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
        }
      } catch {
        /* keep axis label */
      }
      return {
        idx: i,
        x: pts[i].x,
        y: pts[i].y,
        val: row.received,
        axisLabel: row.label,
        tooltipDate,
      };
    });

    const guideY = [0.2, 0.45, 0.7].map((f) => padTop + innerH * f);

    return {
      width,
      height,
      yMin,
      yMax,
      points,
      linePath,
      areaPath,
      guideY,
      labelIndices,
    };
  }, [receivedVolumeSeries]);

  const clientProductionRows = useMemo(() => {
    const tags = ptTagsQ.data ?? [];
    const dispatches = dispQuery.data ?? [];
    const clients = new Map((clientsQ.data ?? []).map((c) => [c.id, c.nombre]));
    const map = new Map<string, { clientId: number | null; label: string; produced: number; dispatched: number }>();
    const ensure = (cid: number | null) => {
      const key = cid != null && cid > 0 ? `c:${cid}` : 'c:na';
      const cur = map.get(key);
      if (cur) return cur;
      const row = {
        clientId: cid != null && cid > 0 ? cid : null,
        label: cid != null && cid > 0 ? clients.get(cid) ?? `Cliente #${cid}` : 'Sin cliente',
        produced: 0,
        dispatched: 0,
      };
      map.set(key, row);
      return row;
    };
    for (const t of tags) {
      if (!countsTowardPtProductionTotals(t)) continue;
      const cid = t.client_id != null ? Number(t.client_id) : null;
      const row = ensure(cid != null && cid > 0 ? cid : null);
      row.produced += Number(t.total_cajas) || 0;
    }
    for (const d of dispatches) {
      const cid = d.client_id != null ? Number(d.client_id) : null;
      const row = ensure(cid != null && cid > 0 ? cid : null);
      row.dispatched += dispatchBoxes(d);
    }
    const out = [...map.values()].map((r) => ({
      ...r,
      inCamera: Math.max(0, r.produced - r.dispatched),
    }));
    return out.sort((a, b) => b.produced - a.produced).slice(0, 5);
  }, [ptTagsQ.data, dispQuery.data, clientsQ.data]);

  const clientProdScale = useMemo(() => {
    let max = 0;
    for (const r of clientProductionRows) {
      max = Math.max(max, r.produced, r.inCamera, r.dispatched);
    }
    return max > 0 ? max : 1;
  }, [clientProductionRows]);

  const topPendingOrders = useMemo(() => {
    const orders = salesOrdersQ.data ?? [];
    return orders
      .filter((o) => (Number(o.requested_boxes) || 0) > 0)
      .sort((a, b) => (Number(b.requested_boxes) || 0) - (Number(a.requested_boxes) || 0))
      .slice(0, 6);
  }, [salesOrdersQ.data]);

  const progressQueries = useQueries({
    queries: topPendingOrders.map((o) => ({
      queryKey: ['sales-orders', o.id, 'progress', 'dashboard'],
      queryFn: () => apiJson<SalesOrderProgressLite>(`/api/sales-orders/${o.id}/progress`),
      enabled: canLoadTrace,
      staleTime: 60_000,
    })),
  });

  const orderProgressRows = useMemo(() => {
    const rows: Array<{
      orderId: number;
      orderNumber: string;
      clientLabel: string;
      fulfillmentPct: number;
      assignedPallets: number;
      dispatchedPallets: number;
      pendingPallets: number;
      status: 'completo' | 'en_curso' | 'riesgo' | 'critico';
    }> = [];
    topPendingOrders.forEach((o, idx) => {
      const q = progressQueries[idx];
      const p = q?.data;
      if (!p) return;
      const req = Number(p.totals.requested_boxes) || 0;
      const disp = Number(p.totals.dispatched_boxes) || 0;
      const ass = Number(p.totals.assigned_pl_boxes) || 0;
      const pending = Number(p.totals.pending_boxes) || 0;
      const pct = req > 0 ? Math.min(999, (disp / req) * 100) : 0;
      const assignedPallets = ass / CONTAINER_PALLETS;
      const dispatchedPallets = disp / CONTAINER_PALLETS;
      const pendingPallets = Math.max(0, pending / CONTAINER_PALLETS);
      const hasRisk = p.lines.some((ln) => ln.alerts.length > 0);
      const status: 'completo' | 'en_curso' | 'riesgo' | 'critico' =
        pct >= 100
          ? 'completo'
          : pendingPallets >= 1.5 && pct < 25
            ? 'critico'
            : hasRisk
              ? 'riesgo'
              : 'en_curso';
      rows.push({
        orderId: o.id,
        orderNumber: o.order_number,
        clientLabel: p.order.cliente_nombre?.trim() || `Cliente #${o.cliente_id}`,
        fulfillmentPct: pct,
        assignedPallets,
        dispatchedPallets,
        pendingPallets,
        status,
      });
    });
    const pri = { critico: 0, riesgo: 1, en_curso: 2, completo: 3 } as const;
    return rows.sort((a, b) => {
      const p = pri[a.status] - pri[b.status];
      if (p !== 0) return p;
      return b.pendingPallets - a.pendingPallets;
    });
  }, [topPendingOrders, progressQueries, CONTAINER_PALLETS]);

  const riskOrdersCount = useMemo(
    () => orderProgressRows.filter((o) => o.status === 'riesgo' || o.status === 'critico').length,
    [orderProgressRows],
  );
  const capacityAvailableContainers = useMemo(
    () =>
      capacityFormatBoard.reduce((s, c) => {
        const g = c.rows.find((r) => r.clientId === 'all');
        return s + (g?.containers ?? 0);
      }, 0),
    [capacityFormatBoard],
  );

  const lowStock = trace?.materials_low_stock ?? [];

  const kpiItems = [
    {
      key: 'produced_boxes',
      label: 'Cajas producidas hoy',
      value: formatCount(Math.round(executiveToday.producedBoxes)),
      foot: 'producto terminado',
      warn: false,
    },
    {
      key: 'dispatched_boxes',
      label: 'Cajas despachadas hoy',
      value: formatCount(Math.round(executiveToday.dispatchedBoxes)),
      foot: 'salida diaria',
      warn: false,
    },
    {
      key: 'risk_orders',
      label: 'Pedidos en riesgo',
      value: formatCount(riskOrdersCount),
      foot: riskOrdersCount > 0 ? 'requieren acción' : 'sin riesgo crítico',
      warn: riskOrdersCount > 0,
    },
    {
      key: 'capacity_total',
      label: 'Capacidad disponible',
      value: `${capacityAvailableContainers.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cont`,
      foot: 'contenedores totales',
      warn: capacityAvailableContainers < 1,
    },
  ] as const;

  const activityLoading = recQuery.isPending || procQuery.isPending || dispQuery.isPending;

  const orderRiskCount = useMemo(
    () => orderProgressRows.filter((o) => o.status === 'riesgo' || o.status === 'critico').length,
    [orderProgressRows],
  );

  const formatsWithoutRecipe = useMemo(
    () => [...formatChipStatus.values()].filter((s) => s === 'danger').length,
    [formatChipStatus],
  );

  const specialLabelShortageCount = useMemo(() => {
    let n = 0;
    for (const card of capacityFormatBoard) {
      const hasClientScope = card.rows.some((r) => r.clientId !== 'all');
      if (!hasClientScope) continue;
      const anyClientNoLabel = card.rows.some((r) => r.clientId !== 'all' && (r.etiquetaStock ?? 0) <= 0);
      if (anyClientNoLabel) n += 1;
    }
    return n;
  }, [capacityFormatBoard]);

  const alertCards = useMemo(() => {
    const rows = [
      {
        key: 'material',
        active: lowStock.length > 0,
        title: `Material crítico: ${lowStock.length}`,
        desc: 'Stock bajo en materiales de empaque clave.',
        tone: 'border-rose-100/90 bg-rose-50/40 text-rose-900',
        iconTone: 'bg-rose-100/80 text-rose-700',
        icon: CircleAlert,
      },
      {
        key: 'orders',
        active: orderRiskCount > 0,
        title: `Pedidos en riesgo: ${orderRiskCount}`,
        desc: 'Desfase entre producción, asignación y despacho.',
        tone: 'border-amber-100/90 bg-amber-50/35 text-amber-950',
        iconTone: 'bg-amber-100/80 text-amber-800',
        icon: AlertTriangle,
      },
      {
        key: 'format',
        active: formatsWithoutRecipe > 0,
        title: `Formato sin receta: ${formatsWithoutRecipe}`,
        desc: 'No hay receta activa para cálculo de capacidad.',
        tone: 'border-rose-100/90 bg-rose-50/30 text-rose-900',
        iconTone: 'bg-rose-100/80 text-rose-700',
        icon: Library,
      },
      {
        key: 'process',
        active: openProcessesCount > 0,
        title: `Procesos abiertos: ${openProcessesCount}`,
        desc: 'Procesos confirmados/borrador sin cierre.',
        tone: 'border-amber-100/90 bg-amber-50/30 text-amber-950',
        iconTone: 'bg-amber-100/80 text-amber-800',
        icon: ClipboardList,
      },
      {
        key: 'labels',
        active: specialLabelShortageCount > 0,
        title: `Etiquetas especiales insuficientes: ${specialLabelShortageCount}`,
        desc: 'Hay formatos con cliente especial sin stock de etiqueta.',
        tone: 'border-amber-100/90 bg-amber-50/30 text-amber-950',
        iconTone: 'bg-amber-100/80 text-amber-800',
        icon: Tag,
      },
    ];
    return rows.filter((r) => r.active).slice(0, 3);
  }, [lowStock.length, orderRiskCount, formatsWithoutRecipe, openProcessesCount, specialLabelShortageCount]);

  return (
    <div className={cn('font-inter', pageStack)}>
        {/* Header — ligero, secundario frente a KPIs */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">Pinebloom Packing</p>
            <h1 className={pageTitle}>Dashboard operativo</h1>
            <p className={cn('max-w-md', pageSubtitle)}>Volumen y alertas del día.</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <User className="h-4 w-4 text-slate-400" aria-hidden />
              <span className="max-w-[200px] truncate font-medium text-slate-800">{username ?? 'Sesión'}</span>
              {role ? (
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">
                  {role}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Calendar className="h-3.5 w-3.5 opacity-70" aria-hidden />
              <span className="capitalize">{todayLabel()}</span>
            </div>
          </div>
        </header>

        {/* 1) Resumen ejecutivo del día */}
        <section aria-labelledby="kpi-heading" className="space-y-4">
          <div>
            <h2 id="kpi-heading" className={sectionTitle}>
              Resumen ejecutivo del día
            </h2>
            <p className={sectionHint}>Operación diaria para gerencia, supervisión y planta.</p>
          </div>
          {tracePending && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[148px] rounded-2xl" />
              ))}
            </div>
          )}
          {traceError && (
            <div className="rounded-2xl border border-slate-100 bg-rose-50/50 px-4 py-3 text-sm text-rose-900">
              No se pudo cargar el resumen. {traceErr instanceof Error ? traceErr.message : ''}
            </div>
          )}
          {!tracePending && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpiItems.map(({ key, label, value, warn, foot }) => (
                <div key={key} className={cn(kpiCardLg, warn ? 'border-amber-200/60 bg-amber-50/35' : '')}>
                  <div>
                    <p className={kpiLabel}>{label}</p>
                    <p className={cn('mt-3', kpiValueXl, warn ? 'text-amber-900' : '')}>{value}</p>
                  </div>
                  <p className={kpiFootnoteLead}>{foot}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2) Avance de pedidos (protagonista) */}
        <section aria-labelledby="orders-progress-heading" className="space-y-4">
          <div>
            <h2 id="orders-progress-heading" className={sectionTitle}>
              Avance de pedidos
            </h2>
            <p className={sectionHint}>Cumplimiento y pallets faltantes ordenado por criticidad.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {progressQueries.some((q) => q.isPending) && (
              <div className="p-4">
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            )}
            {!progressQueries.some((q) => q.isPending) && orderProgressRows.length === 0 && (
              <p className={cn(emptyStateBanner, 'border-0')}>Sin pedidos con avance pendiente.</p>
            )}
            {!progressQueries.some((q) => q.isPending) && orderProgressRows.length > 0 && (
              <div className="divide-y divide-slate-100">
                {orderProgressRows.map((o) => {
                  const tone =
                    o.status === 'completo'
                      ? 'text-emerald-700 border-emerald-200/80 bg-emerald-50/50'
                      : o.status === 'critico'
                        ? 'text-rose-700 border-rose-200/80 bg-rose-50/50'
                        : o.status === 'riesgo'
                          ? 'text-amber-700 border-amber-200/80 bg-amber-50/45'
                          : 'text-sky-700 border-sky-200/80 bg-sky-50/40';
                  const barTone =
                    o.status === 'completo'
                      ? 'bg-emerald-500'
                      : o.status === 'critico'
                        ? 'bg-rose-500'
                        : o.status === 'riesgo'
                          ? 'bg-amber-500'
                          : 'bg-sky-500';
                  const statusText =
                    o.status === 'completo'
                      ? 'OK'
                      : o.status === 'critico'
                        ? 'Crítico'
                        : o.status === 'riesgo'
                          ? 'Riesgo'
                          : 'En curso';
                  const pct = o.fulfillmentPct.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                  const falt = o.pendingPallets.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return (
                    <div
                      key={o.orderId}
                      className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:block sm:max-w-[220px]">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">{o.clientLabel}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-slate-500">{o.orderNumber}</p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:hidden',
                            tone,
                          )}
                        >
                          {statusText}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-[1.2] items-center gap-2 sm:max-w-none">
                        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-slate-100">
                          <div
                            className={cn('h-full rounded-full', barTone)}
                            style={{ width: `${Math.max(2, Math.min(100, o.fulfillmentPct))}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-800">{pct}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-end sm:gap-3">
                        <span className="text-[11px] text-slate-500">
                          Falt.{' '}
                          <span className="font-semibold tabular-nums text-slate-900">{falt}</span>
                          <span className="text-slate-400"> pal</span>
                        </span>
                        <span
                          className={cn(
                            'hidden rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:inline-flex',
                            tone,
                          )}
                        >
                          {statusText}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Tablero global: todos los formatos a la vez */}
        <section aria-labelledby="cap-board-heading" className="space-y-4">
          <h2 id="cap-board-heading" className={sectionTitle}>
            Capacidad por formato
          </h2>
          {materialsQ.isPending || recipesQ.isPending || formatsQ.isPending || clientsQ.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-52 w-full rounded-2xl" />
              ))}
            </div>
          ) : capacityFormatBoard.length === 0 ? (
            <p className={emptyStateBanner}>Sin formatos activos.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {capacityFormatBoard.map((card) => {
                const selectedClient = boardClientByFormat[card.formatId] ?? 'all';
                const selectedRow =
                  card.rows.find((r) => r.clientId === selectedClient) ??
                  card.rows.find((r) => r.clientId === 'all') ??
                  card.rows[0];
                const containers = selectedRow?.containers ?? 0;
                const fillPct = selectedRow?.fillPctRaw ?? 0;
                const status: 'red' | 'yellow' | 'green' =
                  containers >= 1 ? 'green' : containers >= 0.5 ? 'yellow' : 'red';
                const border =
                  status === 'green'
                    ? 'border-emerald-200/90 bg-emerald-50/30'
                    : status === 'yellow'
                      ? 'border-amber-200/90 bg-amber-50/35'
                      : 'border-rose-200/90 bg-rose-50/30';
                const pctTone = status === 'green' ? 'text-emerald-700' : status === 'yellow' ? 'text-amber-700' : 'text-rose-700';
                const quickClients = card.rows
                  .filter((r) => r.clientId !== 'all')
                  .sort((a, b) => b.containers - a.containers)
                  .slice(0, 3);
                return (
                  <div key={card.formatId} className={cn(contentCard, 'w-full text-left shadow-sm', border)}>
                    <div className="space-y-3.5 px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[15px] font-semibold leading-snug text-slate-900">{card.formatCode}</p>
                        <select
                          className="h-7 max-w-[140px] rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-800"
                          value={selectedClient === 'all' ? 'all' : String(selectedClient)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBoardClientByFormat((prev) => ({ ...prev, [card.formatId]: v === 'all' ? 'all' : Number(v) }));
                          }}
                        >
                          {card.rows.map((r) => (
                            <option key={r.key} value={r.clientId === 'all' ? 'all' : String(r.clientId)}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                        <div>
                          <p className={cn('text-3xl font-bold tabular-nums tracking-tight', pctTone)}>
                            {containers.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">contenedores posibles</p>
                        </div>
                        <p className={cn('text-lg font-semibold tabular-nums', pctTone)}>
                          {fillPct.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%
                        </p>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700 ease-out', containerFillTone(Math.min(100, fillPct)))}
                          style={{ width: `${Math.min(100, fillPct)}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-xl bg-white/75 px-2.5 py-2 ring-1 ring-slate-100/80">
                          <p className="text-slate-500">Cajas</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                            {formatCount(selectedRow?.boxesPossible ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/75 px-2.5 py-2 ring-1 ring-slate-100/80">
                          <p className="text-slate-500">Clamshell</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                            {formatCount(selectedRow?.clamshellPossible ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/75 px-2.5 py-2 ring-1 ring-slate-100/80">
                          <p className="text-slate-500">Etiquetas</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                            {formatCount(Math.round(selectedRow?.etiquetaStock ?? 0))}
                          </p>
                        </div>
                      </div>
                      {quickClients.length > 0 && (
                        <div className="space-y-1.5 rounded-xl border border-white/80 bg-white/70 px-2.5 py-2">
                          {quickClients.map((r) => (
                            <div key={r.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[10px]">
                              <p className="truncate font-medium text-slate-700">{r.label}</p>
                              <p className="tabular-nums text-slate-900">
                                {r.containers.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cont
                              </p>
                              <p className="tabular-nums text-slate-500">Etq {formatCount(Math.round(r.etiquetaStock ?? 0))}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4) Volumen diario (secundario) */}
        <section aria-labelledby="volume-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="volume-heading" className={sectionTitle}>
                Volumen recibido
              </h2>
              <p className={sectionHint}>{volumeReceivedSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex max-w-full flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={receptionTypeFilter === 'all' ? 'default' : 'outline'}
                  className="h-8 shrink-0 rounded-full px-3 text-xs"
                  onClick={() => setReceptionTypeFilter('all')}
                >
                  Total
                </Button>
                {receptionTypesQ.isPending && <Skeleton className="h-8 w-24 rounded-full" />}
                {!receptionTypesQ.isPending &&
                  receptionTypeOptions.map((rt) => (
                    <Button
                      key={rt.id}
                      type="button"
                      size="sm"
                      variant={receptionTypeFilter === rt.id ? 'default' : 'outline'}
                      className="h-8 max-w-[160px] shrink-0 truncate rounded-full px-3 text-xs"
                      title={rt.nombre}
                      onClick={() => setReceptionTypeFilter(rt.id)}
                    >
                      {rt.nombre}
                    </Button>
                  ))}
              </div>
              <div className="flex gap-2">
                {[
                  { key: '7d', label: '7d' },
                  { key: '14d', label: '14d' },
                  { key: 'weeks', label: 'Semanas' },
                ].map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    size="sm"
                    variant={volumeRange === opt.key ? 'default' : 'outline'}
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => setVolumeRange(opt.key as '7d' | '14d' | 'weeks')}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className={cn(contentCard, 'border-slate-100 bg-white p-4 sm:p-5')}>
            <ReceivedVolumeChart model={receivedVolumeChartModel} filterLabel={receptionFilterTooltipLabel} />
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>{receivedVolumeSeries[0]?.label ?? ''}</span>
              <span>{receivedVolumeSeries[Math.floor((receivedVolumeSeries.length - 1) / 2)]?.label ?? ''}</span>
              <span>{receivedVolumeSeries[receivedVolumeSeries.length - 1]?.label ?? ''}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full bg-sky-500" />Recepciones (lb)</span>
              <div className="flex flex-wrap gap-4 text-slate-700">
                <span>
                  Total periodo:{' '}
                  <span className="font-semibold tabular-nums text-slate-900">{receivedVolumeSummary.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })} lb</span>
                </span>
                <span>
                  Promedio {volumeRange === 'weeks' ? 'semanal' : 'diario'}:{' '}
                  <span className="font-semibold tabular-nums text-slate-900">{receivedVolumeSummary.avg.toLocaleString('es-AR', { maximumFractionDigits: 2 })} lb</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 5) Producción por cliente (simple) */}
        <section aria-labelledby="client-production-heading" className="space-y-3">
          <div>
            <h2 id="client-production-heading" className={sectionTitle}>
              Producción por cliente
            </h2>
            <p className={sectionHint}>Top clientes: producido, en cámara y despachado.</p>
          </div>
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
            {clientProductionRows.length === 0 ? (
              <p className={emptyStateBanner}>Sin datos por cliente.</p>
            ) : (
              clientProductionRows.map((r) => (
                <div key={r.label} className="rounded-xl border border-slate-100/90 bg-slate-50/60 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.label}</p>
                    <p className="text-[11px] tabular-nums text-slate-500">Prod. {formatCount(Math.round(r.produced))}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, (r.produced / clientProdScale) * 100)}%` }} /></div>
                    <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(2, (r.inCamera / clientProdScale) * 100)}%` }} /></div>
                    <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, (r.dispatched / clientProdScale) * 100)}%` }} /></div>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 text-[10px] text-slate-500">
                    <span>Prod: {formatCount(Math.round(r.produced))}</span>
                    <span>Cámara: {formatCount(Math.round(r.inCamera))}</span>
                    <span>Desp: {formatCount(Math.round(r.dispatched))}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 6) Alertas relevantes */}
        <section aria-labelledby="alerts-heading" className="space-y-3">
          <h2 id="alerts-heading" className={sectionTitle}>
            Alertas
          </h2>
          {!canLoadTrace && (
            <p className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500">
              Iniciá sesión para ver alertas.
            </p>
          )}
          {canLoadTrace && (
            <div className="space-y-2.5">
              {alertCards.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.key} className={cn('flex gap-3 rounded-2xl border px-4 py-3.5', a.tone)}>
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', a.iconTone)}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="mt-1 text-[13px] opacity-85">{a.desc}</p>
                    </div>
                  </div>
                );
              })}
              {alertCards.length === 0 ? (
                <p className={emptyStateBanner}>Sin alertas críticas.</p>
              ) : null}
            </div>
          )}
        </section>

        {/* Accesos rápidos — agrupados, secundarios */}
        <section aria-labelledby="quick-heading" className="space-y-3">
          <h2 id="quick-heading" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Accesos rápidos
          </h2>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/receptions">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <Import className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nueva recepción</span>
                    <span className="text-[11px] font-normal text-slate-400">Ingreso</span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/processes">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nuevo proceso</span>
                    <span className="text-[11px] font-normal text-slate-400">Fruta</span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/pt-tags">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <Tag className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nueva unidad PT</span>
                    <span className="text-[11px] font-normal text-slate-400">Tarja</span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto justify-start gap-3 rounded-xl border border-transparent bg-white/80 px-3 py-3 text-left font-normal text-slate-700 shadow-none ring-0 transition-colors hover:border-slate-200/80 hover:bg-white hover:text-slate-900"
                asChild
              >
                <Link to="/dispatches">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/90 text-slate-600">
                    <Truck className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Nuevo despacho</span>
                    <span className="text-[11px] font-normal text-slate-400">Salida</span>
                  </span>
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Actividad — compacta, menor peso */}
        <section aria-labelledby="activity-heading" className="space-y-3">
          <div>
            <h2 id="activity-heading" className="text-sm font-medium text-slate-500">
              Actividad reciente
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Últimos eventos (mixtos).</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-2 sm:px-5">
            {activityLoading && (
              <div className="space-y-2 py-3">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            )}
            {!activityLoading && activityRows.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400">Sin datos.</p>
            )}
            {!activityLoading && activityRows.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {activityRows.map((row) => (
                  <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5">
                    <span className="w-32 shrink-0 text-[11px] tabular-nums text-slate-400">{row.whenLabel}</span>
                    <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {row.kind}
                    </span>
                    <Link
                      to={row.to}
                      className="min-w-0 flex-1 truncate text-sm text-slate-800 underline-offset-2 hover:underline"
                    >
                      {row.detail}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Footer enlaces */}
        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-8 text-[11px] text-slate-400">
          <Link to="/plant" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <Factory className="h-3.5 w-3.5" />
            Planta
          </Link>
          <Link to="/masters" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <Library className="h-3.5 w-3.5" />
            Mantenedores
          </Link>
          <Link to="/reporting" className="text-slate-500 transition-colors hover:text-slate-700">
            Reportes
          </Link>
          <Link to="/guide/sistema" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <GitBranch className="h-3.5 w-3.5" />
            Guía
          </Link>
          <Link to="/about" className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-700">
            <Info className="h-3.5 w-3.5" />
            Acerca
          </Link>
        </footer>
    </div>
  );
}
