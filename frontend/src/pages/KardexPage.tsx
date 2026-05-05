import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  Layers,
  Package,
  Warehouse,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeAlcance, movementRefTypeLabel, stockSaldoClass, stockSaldoTone } from '@/lib/materials-inventory-ux';
import {
  contentCard,
  emptyStateInset,
  filterInputClass,
  filterLabel,
  filterPanel,
  filterSelectClass,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueMd,
  pageHeaderRow,
  pageSubtitle,
  pageTitle,
  sectionHeadingLg,
  sectionHint,
  signalsPanel,
  signalsTitle,
  tableShell,
} from '@/lib/page-ui';
import { formatCount, formatInventoryQty, formatInventoryQtyFromString, formatTechnical } from '@/lib/number-format';
import { cn } from '@/lib/utils';
import type { PackagingMaterialRow } from './MaterialsPage';

type FormatPick = { id: number; format_code: string };

type MaterialMovementRow = {
  id: number;
  material_id: number;
  quantity_delta: string;
  ref_type: string | null;
  ref_id: number | null;
  nota: string | null;
  created_at: string;
  occurred_at: string | null;
};

type KardexOperational = {
  material_id: number;
  nombre_material: string;
  unidad_medida: string;
  inventario_inicial: number;
  compras_total: number;
  otros_movimientos_neto: number;
  movimientos_sin_consumo_pt: number;
  total_entradas: number;
  consumo_pt_total: number;
  stock_segun_inv_compras_y_pt: number;
  stock_final: number;
  por_formato: Array<{
    formato: string;
    cajas_producidas: number;
    consumo_por_caja: number;
    consumo_total: number;
  }>;
};

function movementEffectiveMs(m: MaterialMovementRow): number {
  const iso = m.occurred_at?.trim() ? m.occurred_at : m.created_at;
  return new Date(iso).getTime();
}

function matchesMoveTypeFilter(ref: string | null, moveType: string): boolean {
  const rt = (ref ?? '').trim().toLowerCase();
  if (moveType === 'manual') {
    return rt === 'manual' || rt === 'ajuste' || rt === 'correccion' || rt === '';
  }
  return rt === moveType.toLowerCase();
}

const MOVE_FILTER_ALL = 'all';

/** Alineado con filtros de tipo; movimientos no mapeados van a `other`. */
function movementBucketForRow(ref: string | null): string {
  const rt = (ref ?? '').trim().toLowerCase();
  if (rt === 'consumo' || rt === 'consumption') return 'consumption';
  if (rt === 'consumo_reverso' || rt === 'consumption_revert') return 'consumption_revert';
  if (rt === 'manual' || rt === 'ajuste' || rt === 'correccion' || rt === '') return 'manual';
  const known = ['entrada', 'compra', 'inventario_inicial', 'salida', 'final_inventario'] as const;
  if ((known as readonly string[]).includes(rt)) return rt;
  return 'other';
}

const MOVE_TYPE_KPI_META: Array<{
  bucket: string;
  label: string;
  desc: string;
  shell: string;
  Icon: typeof Package;
}> = [
  {
    bucket: 'consumption',
    label: 'Consumo PT',
    desc: 'Salidas por tarja',
    shell: 'border-l-[3px] border-l-rose-400 bg-gradient-to-br from-rose-50/40 to-white',
    Icon: ArrowDownRight,
  },
  {
    bucket: 'consumption_revert',
    label: 'Reverso consumo',
    desc: 'Entradas por reverso',
    shell: 'border-l-[3px] border-l-emerald-400 bg-gradient-to-br from-emerald-50/35 to-white',
    Icon: ArrowUpRight,
  },
  {
    bucket: 'manual',
    label: 'Manual / corr.',
    desc: 'Ajustes y correcciones',
    shell: 'border-l-[3px] border-l-slate-400 bg-gradient-to-br from-slate-50/50 to-white',
    Icon: ArrowLeftRight,
  },
  {
    bucket: 'entrada',
    label: 'Ingreso',
    desc: 'Entradas operativas',
    shell: 'border-l-[3px] border-l-sky-400 bg-gradient-to-br from-sky-50/40 to-white',
    Icon: ArrowUpRight,
  },
  {
    bucket: 'compra',
    label: 'Compra',
    desc: 'OC / recepciones',
    shell: 'border-l-[3px] border-l-teal-400 bg-gradient-to-br from-teal-50/40 to-white',
    Icon: Package,
  },
  {
    bucket: 'inventario_inicial',
    label: 'Inv. inicial',
    desc: 'Carga histórica',
    shell: 'border-l-[3px] border-l-violet-400 bg-gradient-to-br from-violet-50/35 to-white',
    Icon: Warehouse,
  },
  {
    bucket: 'salida',
    label: 'Salida / merma',
    desc: 'Egresos',
    shell: 'border-l-[3px] border-l-orange-400 bg-gradient-to-br from-orange-50/35 to-white',
    Icon: ArrowDownRight,
  },
  {
    bucket: 'final_inventario',
    label: 'Cierre inv.',
    desc: 'Ajuste de cierre',
    shell: 'border-l-[3px] border-l-amber-400 bg-gradient-to-br from-amber-50/40 to-white',
    Icon: Layers,
  },
  {
    bucket: 'other',
    label: 'Otros tipos',
    desc: 'Códigos especiales',
    shell: 'border-l-[3px] border-l-slate-300 bg-white',
    Icon: Boxes,
  },
];

function fetchMaterials() {
  return apiJson<PackagingMaterialRow[]>('/api/packaging/materials');
}

function movementDeltaTone(delta: number): string {
  if (delta > 0) return 'text-emerald-700 font-semibold tabular-nums';
  if (delta < 0) return 'text-rose-700 font-semibold tabular-nums';
  return 'text-slate-600 tabular-nums';
}

function refOriginLine(ref: string | null, refId: number | null): string {
  const base = movementRefTypeLabel(ref);
  if (refId != null && refId > 0) return `${base} · ref. #${refId}`;
  return base;
}

export function KardexPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [materialId, setMaterialId] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moveType, setMoveType] = useState(MOVE_FILTER_ALL);

  const { data: materials, isPending, isError, error } = useQuery({
    queryKey: ['packaging', 'materials'],
    queryFn: fetchMaterials,
  });

  const { data: formatList } = useQuery({
    queryKey: ['masters', 'presentation-formats'],
    queryFn: () => apiJson<FormatPick[]>('/api/masters/presentation-formats'),
  });

  const { data: commercialClients } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string }[]>('/api/masters/clients'),
  });

  const { data: materialCategories } = useQuery({
    queryKey: ['masters', 'material-categories'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/material-categories'),
  });

  useEffect(() => {
    const q = searchParams.get('material');
    const n = q ? Number(q) : 0;
    if (n > 0) setMaterialId(n);
  }, [searchParams]);

  const formatById = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of formatList ?? []) m.set(f.id, f.format_code);
    return m;
  }, [formatList]);

  const clientById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of commercialClients ?? []) m.set(c.id, c.nombre);
    return m;
  }, [commercialClients]);

  const materialOptions = useMemo(() => {
    const list = materials ?? [];
    if (categoryFilter <= 0) return list;
    return list.filter((m) => m.material_category_id === categoryFilter);
  }, [materials, categoryFilter]);

  useEffect(() => {
    if (materialId <= 0 || !materials?.length) return;
    if (!materialOptions.some((m) => m.id === materialId)) {
      setMaterialId(0);
      const next = new URLSearchParams(searchParams);
      next.delete('material');
      setSearchParams(next, { replace: true });
    }
  }, [materials, materialOptions, materialId, searchParams, setSearchParams]);

  const selectedMaterial = useMemo(
    () => (materials ?? []).find((m) => m.id === materialId) ?? null,
    [materials, materialId],
  );

  const { data: movements, isFetching: movementsLoading } = useQuery({
    queryKey: ['packaging', 'movements', materialId],
    queryFn: () => apiJson<MaterialMovementRow[]>(`/api/packaging/materials/${materialId}/movements`),
    enabled: materialId > 0,
  });

  const { data: kardexOp, isFetching: kardexLoading } = useQuery({
    queryKey: ['packaging', 'materials', materialId, 'kardex-operational'],
    queryFn: () => apiJson<KardexOperational>(`/api/packaging/materials/${materialId}/kardex-operational`),
    enabled: materialId > 0,
  });

  const { ordered, balanceById } = useMemo(() => {
    const raw = movements ?? [];
    const orderedAsc = [...raw].sort((a, b) => {
      const ta = movementEffectiveMs(a);
      const tb = movementEffectiveMs(b);
      if (ta !== tb) return ta - tb;
      return a.id - b.id;
    });
    const sumD = orderedAsc.reduce((s, m) => s + Number(m.quantity_delta), 0);
    const cur = selectedMaterial ? Number(selectedMaterial.cantidad_disponible) : NaN;
    const initial = Number.isFinite(cur) ? cur - sumD : NaN;
    let acc = Number.isFinite(initial) ? initial : 0;
    const balMap = new Map<number, number>();
    for (const m of orderedAsc) {
      acc += Number(m.quantity_delta);
      balMap.set(m.id, acc);
    }
    return { ordered: orderedAsc, balanceById: balMap };
  }, [movements, selectedMaterial]);

  /** Rango de fechas solamente: base para KPI por tipo (independiente del filtro «Tipo de movimiento»). */
  const rowsForMovementTypeKpis = useMemo(() => {
    return ordered.filter((m) => {
      if (dateFrom) {
        const t = movementEffectiveMs(m);
        if (t < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
      }
      if (dateTo) {
        const t = movementEffectiveMs(m);
        if (t > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
      }
      return true;
    });
  }, [ordered, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    return rowsForMovementTypeKpis.filter((m) => {
      if (moveType !== MOVE_FILTER_ALL && !matchesMoveTypeFilter(m.ref_type, moveType)) {
        return false;
      }
      return true;
    });
  }, [rowsForMovementTypeKpis, moveType]);

  const displayRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const ta = movementEffectiveMs(b);
      const tb = movementEffectiveMs(a);
      if (ta !== tb) return ta - tb;
      return b.id - a.id;
    });
  }, [filteredRows]);

  const movementTypeKpiTotals = useMemo(() => {
    const next = (): { count: number; net: number } => ({ count: 0, net: 0 });
    const map = new Map<string, { count: number; net: number }>();
    for (const m of MOVE_TYPE_KPI_META) map.set(m.bucket, next());
    for (const m of rowsForMovementTypeKpis) {
      const b = movementBucketForRow(m.ref_type);
      const tgt = map.get(b) ?? map.get('other')!;
      const d = Number(m.quantity_delta);
      if (!Number.isFinite(d)) continue;
      tgt.count += 1;
      tgt.net += d;
    }
    return map;
  }, [rowsForMovementTypeKpis]);

  const netMovementTypeKpiQty = useMemo(
    () =>
      rowsForMovementTypeKpis.reduce(
        (s, m) => s + (Number.isFinite(Number(m.quantity_delta)) ? Number(m.quantity_delta) : 0),
        0,
      ),
    [rowsForMovementTypeKpis],
  );

  const netTableFilteredQty = useMemo(
    () => filteredRows.reduce((s, m) => s + (Number.isFinite(Number(m.quantity_delta)) ? Number(m.quantity_delta) : 0), 0),
    [filteredRows],
  );

  const movementsTruncated = (movements?.length ?? 0) >= 5000;
  const moveFilterOptions: { value: string; label: string }[] = [
    { value: MOVE_FILTER_ALL, label: 'Todos' },
    { value: 'consumption', label: 'Consumo' },
    { value: 'consumption_revert', label: 'Reverso consumo' },
    { value: 'manual', label: 'Manual' },
    { value: 'entrada', label: 'Entrada' },
    { value: 'compra', label: 'Compra' },
    { value: 'inventario_inicial', label: 'Inventario inicial' },
    { value: 'salida', label: 'Salida' },
    { value: 'final_inventario', label: 'Cierre inventario' },
  ];

  const onPickMaterial = (id: number) => {
    setMaterialId(id);
    const next = new URLSearchParams(searchParams);
    if (id > 0) next.set('material', String(id));
    else next.delete('material');
    setSearchParams(next, { replace: true });
  };

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className={contentCard}>
        <CardHeader>
          <CardTitle>Error al cargar</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'Intenta de nuevo.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const uom = selectedMaterial?.unidad_medida ?? '';
  const saldoKpiClass = selectedMaterial
    ? stockSaldoClass(stockSaldoTone(Number(selectedMaterial.cantidad_disponible)))
    : '';

  return (
    <div className="space-y-5">
      <div className={pageHeaderRow}>
        <div>
          <h1 className={pageTitle}>Kardex de Materiales</h1>
          <p className={pageSubtitle}>Inventario inicial, compras y consumo de Unidad PT por material.</p>
        </div>
      </div>

      <div className={filterPanel}>
        <div className="grid gap-4 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-3">
            <Label className={filterLabel}>Categoría</Label>
            <select
              className={cn(filterSelectClass, 'mt-1.5')}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(Number(e.target.value) || 0);
                setMaterialId(0);
                const next = new URLSearchParams(searchParams);
                next.delete('material');
                setSearchParams(next, { replace: true });
              }}
            >
              <option value={0}>Todas</option>
              {(materialCategories ?? [])
                .filter((c) => c.activo !== false)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div className="lg:col-span-4">
            <Label className={filterLabel}>Material</Label>
            <select
              className={cn(filterSelectClass, 'mt-1.5')}
              value={materialId || ''}
              onChange={(e) => onPickMaterial(Number(e.target.value) || 0)}
            >
              <option value="">Selecciona un material</option>
              {materialOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre_material} · {formatInventoryQtyFromString(m.cantidad_disponible)} {m.unidad_medida}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <Label className={filterLabel}>Desde</Label>
            <Input type="date" className={cn(filterInputClass, 'mt-1.5')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="lg:col-span-2">
            <Label className={filterLabel}>Hasta</Label>
            <Input type="date" className={cn(filterInputClass, 'mt-1.5')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="lg:col-span-3">
            <Label className={filterLabel}>Tipo de movimiento</Label>
            <select className={cn(filterSelectClass, 'mt-1.5')} value={moveType} onChange={(e) => setMoveType(e.target.value)}>
              {moveFilterOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {materialId > 0 && selectedMaterial ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Material seleccionado</p>
            <p className="text-sm font-semibold text-slate-900">{selectedMaterial.nombre_material}</p>
            <p className="text-xs text-slate-500">{describeAlcance(selectedMaterial, formatById, clientById)}</p>
          </div>
        ) : null}
      </div>

      {materialId > 0 && selectedMaterial ? (
        <div className="space-y-4">
          {kardexLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : kardexOp ? (
            <>
              <div className="space-y-2">
                <h2 className={sectionHeadingLg}>Resumen del material</h2>
                <p className="text-[12px] text-slate-500">
                  Vista de stock operativo desde el servidor (no depende de fechas ni del filtro de tipo abajo).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-slate-100/90')}>
                  <Warehouse className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-violet-100" aria-hidden />
                  <p className={kpiLabel}>Inventario inicial</p>
                  <p className={kpiValueMd}>
                    {formatInventoryQty(kardexOp.inventario_inicial)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-emerald-100/90 bg-emerald-50/25')}>
                  <Package className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-emerald-100" aria-hidden />
                  <p className={kpiLabel}>Compras</p>
                  <p className="text-[1.5rem] font-semibold tabular-nums leading-none text-emerald-800">
                    +{formatInventoryQty(kardexOp.compras_total)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-sky-100/90 bg-sky-50/20')}>
                  <ArrowLeftRight className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-sky-100" aria-hidden />
                  <p className={kpiLabel}>Otros mov. neto</p>
                  <p
                    className={cn(
                      kpiValueMd,
                      kardexOp.otros_movimientos_neto < 0 ? 'text-rose-700' : kardexOp.otros_movimientos_neto > 0 ? 'text-emerald-800' : '',
                    )}
                  >
                    {kardexOp.otros_movimientos_neto >= 0 ? '+' : ''}
                    {formatInventoryQty(kardexOp.otros_movimientos_neto)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>Entradas y salidas fuera de compras/cons. PT típico.</p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-teal-100/80 bg-teal-50/15')}>
                  <Boxes className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-teal-100" aria-hidden />
                  <p className={kpiLabel}>Total entradas</p>
                  <p className={kpiValueMd}>
                    {formatInventoryQty(kardexOp.total_entradas)} <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>Base operativa cargada antes de consumir por PT.</p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-rose-100/90 bg-rose-50/20')}>
                  <ArrowDownRight className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-rose-100" aria-hidden />
                  <p className={kpiLabel}>Consumo total (PT)</p>
                  <p className="text-[1.5rem] font-semibold tabular-nums leading-none text-rose-800">
                    −{formatInventoryQty(kardexOp.consumo_pt_total)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>Tarjas × receta por caja.</p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-slate-200 bg-slate-50/30')}>
                  <Layers className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-slate-200" aria-hidden />
                  <p className={kpiLabel}>Stock final</p>
                  <p className={cn(kpiValueMd, saldoKpiClass)}>
                    {formatInventoryQty(kardexOp.stock_final)} <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>
                    Inv. inicial + compras − consumo PT = {formatInventoryQty(kardexOp.stock_segun_inv_compras_y_pt)}{' '}
                    {uom}
                  </p>
                  {kardexOp.movimientos_sin_consumo_pt !== 0 ? (
                    <p className={cn(kpiFootnote, 'mt-1 text-[11px] text-sky-900/80')} title="Conteo desde motor operativo">
                      Incluye {formatCount(kardexOp.movimientos_sin_consumo_pt)} mov. sin consumo PT en el modelo.
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-[13px] leading-snug text-amber-950">
              No se pudo cargar el resumen operativo del material. Siguen disponibles los movimientos y los totales por tipo abajo si el
              historial respondió bien.
            </div>
          )}

          {!movementsLoading && materialId > 0 ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <h2 className={sectionHeadingLg}>Totales por tipo de movimiento</h2>
                <p className="text-[12px] leading-snug text-slate-500">
                  Tarjetas para cada tipo (consumo PT, compra, manual, etc.). Cuentan el período <strong className="font-medium text-slate-700">Desde / Hasta</strong> solamente; el filtro <strong className="font-medium text-slate-700">Tipo de movimiento</strong> no las altera (sí filtra la tabla de abajo).
                </p>
                <p className="text-[12px] text-slate-600">
                  Período: Δ{' '}
                  <span className={netMovementTypeKpiQty >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
                    {formatInventoryQty(netMovementTypeKpiQty)}
                  </span>{' '}
                  {uom},{' '}
                  <span className="tabular-nums">{formatCount(rowsForMovementTypeKpis.length)}</span> mov. · Tabla (fecha + tipo): Δ{' '}
                  <span className={netTableFilteredQty >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
                    {formatInventoryQty(netTableFilteredQty)}
                  </span>{' '}
                  {uom},{' '}
                  <span className="tabular-nums">{formatCount(filteredRows.length)}</span> fila(s)
                  {moveType !== MOVE_FILTER_ALL
                    ? ` · «${moveFilterOptions.find((o) => o.value === moveType)?.label ?? moveType}»`
                    : ''}
                </p>
              </div>
              {rowsForMovementTypeKpis.length === 0 ? (
                <div className={emptyStateInset}>
                  {ordered.length === 0
                    ? 'Este material no tiene movimientos en el historial cargado.'
                    : 'Sin movimientos en el rango de fechas — ampliá el período o borrá las fechas para ver KPI por tipo.'}
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                  {MOVE_TYPE_KPI_META.map(({ bucket, label, desc, shell, Icon }) => {
                    const agg = movementTypeKpiTotals.get(bucket) ?? { count: 0, net: 0 };
                    const inactive = agg.count === 0;
                    return (
                      <div
                        key={bucket}
                        className={cn(
                          'rounded-xl border border-slate-100/95 p-3.5 shadow-sm transition-opacity',
                          shell,
                          inactive ? 'opacity-[0.45]' : '',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                            <p className="line-clamp-2 text-[10px] text-slate-400">{desc}</p>
                          </div>
                          <Icon className={cn('h-4 w-4 shrink-0 text-slate-300', !inactive && 'text-slate-400')} aria-hidden />
                        </div>
                        <p className={cn('mt-2.5 text-lg font-semibold tabular-nums leading-none', movementDeltaTone(agg.net))}>
                          {formatInventoryQty(agg.net)} <span className="text-xs font-normal text-slate-500">{uom}</span>
                        </p>
                        <p className={cn(kpiFootnote, 'mt-2')}>{formatCount(agg.count)} mov.</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : materialId > 0 && movementsLoading ? (
            <Skeleton className="h-36 w-full rounded-2xl" />
          ) : null}

          <Card className={contentCard}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Consumo por formato</CardTitle>
              <CardDescription>Cajas producidas según tarjas PT, factor de receta por caja y consumo del formato.</CardDescription>
            </CardHeader>
            <CardContent>
              {kardexLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : kardexOp && kardexOp.por_formato.length === 0 ? (
                <p className="text-sm text-slate-500">Sin tarjas PT con formato vinculado o sin receta por caja para este material.</p>
              ) : kardexOp ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200/90">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="text-xs font-semibold uppercase text-slate-500">Formato</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Cajas producidas</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Consumo por caja</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Consumo total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kardexOp.por_formato.map((row) => (
                        <TableRow key={row.formato} className="border-slate-100">
                          <TableCell className="font-medium text-slate-900">{row.formato}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-800">
                            {formatInventoryQty(row.cajas_producidas)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                            {row.consumo_por_caja > 0 ? formatTechnical(row.consumo_por_caja, 4) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-800">
                            {formatInventoryQty(row.consumo_total)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t border-slate-200 bg-slate-50/80 font-medium">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-slate-900">—</TableCell>
                        <TableCell className="text-right text-slate-500">—</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-slate-900">
                          {formatInventoryQty(kardexOp.consumo_pt_total)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {materialId > 0 && movementsTruncated ? (
        <div className={signalsPanel}>
          <p className={signalsTitle}>Historial acotado</p>
          <p className="text-[13px] leading-snug text-amber-950/90">
            Se muestran los últimos <strong>5000</strong> movimientos de este material. Si no ves un movimiento antiguo, ampliá fechas o
            consultá reportes fuera de esta pantalla.
          </p>
        </div>
      ) : null}

      <Card className={contentCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Movimientos</CardTitle>
          <CardDescription>
            {materialId <= 0
              ? 'Elegí un material para ver fechas, cantidades, referencia y saldo después de cada movimiento.'
              : 'Orden: más recientes arriba. Los filtros solo ocultan filas; el saldo después sigue el historial completo cargado.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {materialId > 0 && !movementsLoading ? (
            <p className={cn(sectionHint, 'mb-3')}>
              Verde = entrada, rojo = salida. Saldo después: en rojo si el saldo acumulado en esa fila es ≤ 0.
            </p>
          ) : null}
          {materialId <= 0 ? (
            <p className="text-sm text-slate-500">Seleccioná un material arriba.</p>
          ) : movementsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={tableShell}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">Fecha</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">Material</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">Tipo</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Cantidad</TableHead>
                      <TableHead
                        className="text-right text-xs font-semibold uppercase text-slate-500"
                        title="Saldo acumulado después de este movimiento (histórico completo cargado)"
                      >
                        Saldo después
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">Referencia / origen</TableHead>
                      <TableHead className="min-w-[140px] text-xs font-semibold uppercase text-slate-500">Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                          Sin movimientos con los filtros actuales.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayRows.map((mv) => {
                        const d = Number(mv.quantity_delta);
                        const bal = balanceById.get(mv.id);
                        return (
                          <TableRow key={mv.id} className="border-slate-100/90">
                            <TableCell className="whitespace-nowrap text-sm text-slate-700">
                              {new Date(mv.occurred_at?.trim() ? mv.occurred_at : mv.created_at).toLocaleString('es')}
                            </TableCell>
                            <TableCell className="max-w-[200px] text-sm font-medium text-slate-900">
                              {selectedMaterial?.nombre_material}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-normal">
                                {movementRefTypeLabel(mv.ref_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className={cn('text-right text-sm', movementDeltaTone(d))}>{formatInventoryQty(d)}</TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-mono text-sm font-semibold tabular-nums',
                                bal != null && Number(bal) <= 0 ? 'text-rose-700' : 'text-slate-900',
                              )}
                            >
                              {bal != null ? formatInventoryQty(bal) : '—'}
                            </TableCell>
                            <TableCell className="max-w-[200px] text-xs text-slate-600">
                              {refOriginLine(mv.ref_type, mv.ref_id)}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-xs text-slate-600" title={mv.nota ?? ''}>
                              {mv.nota ?? '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


