import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowLeftRight, Boxes, Layers, Package, Warehouse } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  filterInputClass,
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
  consumo_pt_comprometido?: number;
  consumo_pt_registrado?: number;
  stock_segun_inv_compras_y_pt: number;
  stock_final: number;
  por_formato: Array<{
    formato: string;
    cajas_producidas: number;
    pt_unidades?: number;
    consumo_por_caja: number;
    consumo_comprometido?: number;
    consumo_registrado?: number;
    consumo_total: number;
  }>;
};

function movementEffectiveMs(m: MaterialMovementRow): number {
  const iso = m.occurred_at?.trim() ? m.occurred_at : m.created_at;
  return new Date(iso).getTime();
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

/** Misma regla que los KPI por tipo (sinónimos consumo/consumption, etc.). */
function matchesMoveTypeFilter(ref: string | null, moveType: string): boolean {
  return movementBucketForRow(ref) === moveType;
}

function fetchMaterials() {
  return apiJson<PackagingMaterialRow[]>('/api/packaging/materials');
}

function movementDeltaTone(delta: number): string {
  if (delta > 0) return 'text-emerald-700 font-semibold tabular-nums';
  if (delta < 0) return 'text-rose-700 font-semibold tabular-nums';
  return 'text-slate-600 tabular-nums';
}

function refOriginLine(ref: string | null, refId: number | null, t: (key: string) => string): string {
  const base = movementRefTypeLabel(ref, t);
  if (refId != null && refId > 0) return `${base} · ref. #${refId}`;
  return base;
}

export function KardexPage() {
  const { t } = useTranslation('common');
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

  const {
    data: movements,
    isFetching: movementsLoading,
    isError: movementsQueryError,
  } = useQuery({
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

  /** Rango Desde/Hasta solamente (el filtro «Tipo de movimiento» se aplica después, en la tabla). */
  const rowsInDateRange = useMemo(() => {
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
    return rowsInDateRange.filter((m) => {
      if (moveType !== MOVE_FILTER_ALL && !matchesMoveTypeFilter(m.ref_type, moveType)) {
        return false;
      }
      return true;
    });
  }, [rowsInDateRange, moveType]);

  const displayRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const ta = movementEffectiveMs(b);
      const tb = movementEffectiveMs(a);
      if (ta !== tb) return ta - tb;
      return b.id - a.id;
    });
  }, [filteredRows]);

  const movementsTruncated = (movements?.length ?? 0) >= 5000;
  const moveFilterOptions: { value: string; label: string }[] = [
    { value: MOVE_FILTER_ALL, label: t('kardex.moveFilter.all') },
    { value: 'consumption', label: t('kardex.moveFilter.consumption') },
    { value: 'consumption_revert', label: t('kardex.moveFilter.consumption_revert') },
    { value: 'manual', label: t('kardex.moveFilter.manual') },
    { value: 'entrada', label: t('kardex.moveFilter.entrada') },
    { value: 'compra', label: t('kardex.moveFilter.compra') },
    { value: 'inventario_inicial', label: t('kardex.moveFilter.inventario_inicial') },
    { value: 'salida', label: t('kardex.moveFilter.salida') },
    { value: 'final_inventario', label: t('kardex.moveFilter.final_inventario') },
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
  const stockOperativo = kardexOp?.stock_segun_inv_compras_y_pt ?? 0;
  const stockKardex = kardexOp?.stock_final ?? Number(selectedMaterial?.cantidad_disponible ?? 0);
  const stockKardexDiffers =
    kardexOp != null && Math.abs(stockKardex - stockOperativo) > 0.01;
  const saldoKpiClass = kardexOp
    ? stockSaldoClass(stockSaldoTone(stockOperativo))
    : selectedMaterial
      ? stockSaldoClass(stockSaldoTone(Number(selectedMaterial.cantidad_disponible)))
      : '';

  const kardexFilterLabelClass = 'text-[11px] uppercase tracking-wide text-muted-foreground';

  return (
    <div className="space-y-5">
      <div className={pageHeaderRow}>
        <div>
          <h1 className={pageTitle}>{t('kardex.pageTitle')}</h1>
          <p className={pageSubtitle}>{t('kardex.pageSubtitle')}</p>
        </div>
      </div>

      <div className={filterPanel}>
        <div className="grid gap-4 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-3">
            <Label className={kardexFilterLabelClass}>{t('kardex.filters.category')}</Label>
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
              <option value={0}>{t('kardex.filters.categoryAll')}</option>
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
            <Label className={kardexFilterLabelClass}>{t('kardex.filters.material')}</Label>
            <select
              className={cn(filterSelectClass, 'mt-1.5')}
              value={materialId || ''}
              onChange={(e) => onPickMaterial(Number(e.target.value) || 0)}
            >
              <option value="">{t('kardex.filters.materialPlaceholder')}</option>
              {materialOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre_material} · {formatInventoryQtyFromString(m.cantidad_disponible)} {m.unidad_medida}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <Label className={kardexFilterLabelClass}>{t('kardex.filters.from')}</Label>
            <Input type="date" className={cn(filterInputClass, 'mt-1.5')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="lg:col-span-2">
            <Label className={kardexFilterLabelClass}>{t('kardex.filters.to')}</Label>
            <Input type="date" className={cn(filterInputClass, 'mt-1.5')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="lg:col-span-3">
            <Label className={kardexFilterLabelClass}>{t('kardex.filters.moveType')}</Label>
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
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('kardex.filters.selectedLabel')}</p>
            <p className="text-sm font-semibold text-slate-900">{selectedMaterial.nombre_material}</p>
            <p className="text-xs text-slate-500">{describeAlcance(selectedMaterial, formatById, clientById)}</p>
          </div>
        ) : null}
        {materialId > 0 && !movementsLoading && movementsQueryError ? (
          <p className="mt-3 text-xs text-muted-foreground">{t('kardex.filters.loadError')}</p>
        ) : null}
      </div>

      {materialId > 0 && selectedMaterial ? (
        <div className="space-y-4">
          {kardexLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : kardexOp ? (
            <>
              <div className="space-y-2">
                <h2 className={sectionHeadingLg}>{t('kardex.summary.title')}</h2>
                <p className="text-[12px] text-slate-500">{t('kardex.summary.hint')}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-slate-100/90')}>
                  <Warehouse className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-violet-100" aria-hidden />
                  <p className={kpiLabel}>{t('kardex.summary.initialInventory')}</p>
                  <p className={kpiValueMd}>
                    {formatInventoryQty(kardexOp.inventario_inicial)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-emerald-100/90 bg-emerald-50/25')}>
                  <Package className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-emerald-100" aria-hidden />
                  <p className={kpiLabel}>{t('kardex.summary.purchases')}</p>
                  <p className="text-[1.5rem] font-semibold tabular-nums leading-none text-emerald-800">
                    +{formatInventoryQty(kardexOp.compras_total)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-sky-100/90 bg-sky-50/20')}>
                  <ArrowLeftRight className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-sky-100" aria-hidden />
                  <p className={kpiLabel}>{t('kardex.summary.otherNet')}</p>
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
                  <p className={cn(kpiFootnote, 'mt-2')}>{t('kardex.summary.otherNetNote')}</p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-teal-100/80 bg-teal-50/15')}>
                  <Boxes className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-teal-100" aria-hidden />
                  <p className={kpiLabel}>{t('kardex.summary.totalEntries')}</p>
                  <p className={kpiValueMd}>
                    {formatInventoryQty(kardexOp.total_entradas)} <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>{t('kardex.summary.totalEntriesNote')}</p>
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-rose-100/90 bg-rose-50/20')}>
                  <ArrowDownRight className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-rose-100" aria-hidden />
                  <p className={kpiLabel}>{t('kardex.summary.ptConsumption')}</p>
                  <p className="text-[1.5rem] font-semibold tabular-nums leading-none text-rose-800">
                    −{formatInventoryQty(kardexOp.consumo_pt_total)}{' '}
                    <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>{t('kardex.summary.ptConsumptionNote')}</p>
                  {(kardexOp.consumo_pt_comprometido ?? 0) > 0 &&
                  (kardexOp.consumo_pt_registrado ?? 0) > 0 &&
                  Math.abs((kardexOp.consumo_pt_comprometido ?? 0) - (kardexOp.consumo_pt_registrado ?? 0)) > 0.01 ? (
                    <p className={cn(kpiFootnote, 'mt-1 text-[11px] text-slate-600')}>
                      {t('kardex.summary.ptRegisteredNote', {
                        value: formatInventoryQty(kardexOp.consumo_pt_registrado ?? 0),
                        uom,
                      })}
                    </p>
                  ) : null}
                </div>
                <div className={cn(kpiCardSm, 'relative overflow-hidden border border-slate-200 bg-slate-50/30')}>
                  <Layers className="pointer-events-none absolute right-2.5 top-2.5 h-9 w-9 text-slate-200" aria-hidden />
                  <p className={kpiLabel}>{t('kardex.summary.finalStock')}</p>
                  <p className={cn(kpiValueMd, saldoKpiClass)}>
                    {formatInventoryQty(stockOperativo)} <span className="text-sm font-normal text-slate-500">{uom}</span>
                  </p>
                  <p className={cn(kpiFootnote, 'mt-2')}>{t('kardex.summary.finalStockNote')}</p>
                  {stockKardexDiffers ? (
                    <p className={cn(kpiFootnote, 'mt-1 text-[11px] text-slate-600')}>
                      {t('kardex.summary.finalStockKardexNote', {
                        value: formatInventoryQty(stockKardex),
                        uom,
                      })}
                    </p>
                  ) : null}
                  {kardexOp.movimientos_sin_consumo_pt !== 0 ? (
                    <p className={cn(kpiFootnote, 'mt-1 text-[11px] text-sky-900/80')} title="Conteo desde motor operativo">
                      {t('kardex.summary.includesMov', { count: formatCount(kardexOp.movimientos_sin_consumo_pt) })}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          <Card className={contentCard}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{t('kardex.byFormat.title')}</CardTitle>
              <CardDescription>{t('kardex.byFormat.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {kardexLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : kardexOp && kardexOp.por_formato.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200/90">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="text-xs font-semibold uppercase text-slate-500">{t('kardex.byFormat.colFormat')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">{t('kardex.byFormat.colPtUnits')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">{t('kardex.byFormat.colBoxes')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">{t('kardex.byFormat.colPerBox')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">{t('kardex.byFormat.colCommitted')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">{t('kardex.byFormat.colRegistered')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kardexOp.por_formato.map((row) => {
                        const comprometido = row.consumo_comprometido ?? row.consumo_total;
                        const registrado = row.consumo_registrado ?? 0;
                        return (
                        <TableRow key={row.formato} className="border-slate-100">
                          <TableCell className="font-medium text-slate-900">{row.formato}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-700">
                            {row.pt_unidades != null && row.pt_unidades > 0 ? formatCount(row.pt_unidades) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-800">
                            {formatInventoryQty(row.cajas_producidas)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                            {row.consumo_por_caja > 0 ? formatTechnical(row.consumo_por_caja, 4) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-medium text-teal-900">
                            {comprometido > 0 ? formatInventoryQty(comprometido) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-600">
                            {registrado > 0 ? formatInventoryQty(registrado) : '—'}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                      <TableRow className="border-t border-slate-200 bg-slate-50/80 font-medium">
                        <TableCell>{t('kardex.byFormat.totalRow')}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-slate-900">
                          {formatCount(kardexOp.por_formato.reduce((s, r) => s + (r.pt_unidades ?? 0), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-slate-900">
                          {formatInventoryQty(kardexOp.por_formato.reduce((s, r) => s + r.cajas_producidas, 0))}
                        </TableCell>
                        <TableCell className="text-right text-slate-500">—</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-teal-900">
                          {formatInventoryQty(kardexOp.consumo_pt_comprometido ?? kardexOp.consumo_pt_total)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-slate-700">
                          {(kardexOp.consumo_pt_registrado ?? 0) > 0
                            ? formatInventoryQty(kardexOp.consumo_pt_registrado ?? 0)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">{t('kardex.byFormat.empty')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {materialId > 0 && movementsTruncated ? (
        <div className={signalsPanel}>
          <p className={signalsTitle}>{t('kardex.truncated.title')}</p>
          <p className="text-[13px] leading-snug text-amber-950/90">{t('kardex.truncated.desc')}</p>
        </div>
      ) : null}

      <Card className={contentCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">{t('kardex.movements.title')}</CardTitle>
          <CardDescription>
            {materialId <= 0 ? t('kardex.movements.descEmpty') : t('kardex.movements.descLoaded')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {materialId > 0 && !movementsLoading ? (
            <p className={cn(sectionHint, 'mb-3')}>{t('kardex.movements.hint')}</p>
          ) : null}
          {materialId <= 0 ? (
            <p className="text-sm text-slate-500">{t('kardex.movements.selectMaterial')}</p>
          ) : movementsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={tableShell}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">{t('kardex.movements.colDate')}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">{t('kardex.movements.colMaterial')}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">{t('kardex.movements.colType')}</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">{t('kardex.movements.colQty')}</TableHead>
                      <TableHead
                        className="text-right text-xs font-semibold uppercase text-slate-500"
                        title={t('kardex.movements.colBalanceTitle')}
                      >
                        {t('kardex.movements.colBalance')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500">{t('kardex.movements.colRef')}</TableHead>
                      <TableHead className="min-w-[140px] text-xs font-semibold uppercase text-slate-500">{t('kardex.movements.colNote')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                          {t('kardex.movements.empty')}
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
                                {movementRefTypeLabel(mv.ref_type, t)}
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
                              {refOriginLine(mv.ref_type, mv.ref_id, t)}
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


