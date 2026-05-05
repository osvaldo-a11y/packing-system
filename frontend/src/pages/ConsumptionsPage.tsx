import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCount, formatMoney } from '@/lib/number-format';
import { cn } from '@/lib/utils';
import { contentCard, pageHeaderRow, pageSubtitle, pageTitle, sectionTitle } from '@/lib/page-ui';
import type { PackagingMaterialRow } from './MaterialsPage';
import { countsTowardPtProductionTotals, type PtTagApi } from './PtTagsPage';
import type { RecipeApi } from './RecipesPage';

type DashboardMaterial = PackagingMaterialRow & {
  material_category?: { id: number; codigo: string; nombre: string };
};

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

/** PT incluida en el acumulado cuando el filtro «Cliente (capacidad)» coincide con la tarja comercial. */
function tagMatchesCapClient(t: PtTagApi, capClientId: number | 'all'): boolean {
  if (capClientId === 'all') return true;
  const cid = t.client_id != null ? Number(t.client_id) : 0;
  return cid > 0 && cid === capClientId;
}

type PresentationFormatLite = {
  id: number;
  format_code: string;
  max_boxes_per_pallet?: number | null;
  activo?: boolean;
};

type FormatLogistics = {
  maxBoxesPerPallet: number | null;
  boxesPossible: number | null;
  palletsPossible: number | null;
  containerPct: number | null;
  limitedBy: string | null;
  brandLine: string | null;
  clamshell: Array<{
    nombre: string;
    qtyPerBox: number;
    maxBoxesPerPallet: number;
    palletsInContainer: number;
    theoreticalUnits: number;
    disponible: number;
    unidad: string;
    coveragePct: number;
  }>;
  etiquetas: Array<{
    key: string;
    label: string;
    items: Array<{ id: number; nombre: string; stock: number; uom: string }>;
  }>;
};

function buildEtiquetaGroupsForFormat(
  mats: DashboardMaterial[],
  formatId: number,
  capClientId: number | 'all',
  clientRows: Array<{ id: number; nombre: string }>,
): FormatLogistics['etiquetas'] {
  const list = mats.filter((m) => {
    if (!m.activo || m.material_category?.codigo !== 'etiqueta') return false;
    const scope = (m.presentation_format_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
    if (scope.length > 0) {
      if (!scope.includes(formatId)) return false;
    } else {
      const pf = m.presentation_format_id != null ? Number(m.presentation_format_id) : null;
      if (pf != null && pf !== formatId) return false;
    }
    if (capClientId !== 'all') {
      const cscope = (m.client_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
      if (cscope.length > 0) {
        if (!cscope.includes(capClientId)) return false;
      } else {
        const mc = m.client_id != null ? Number(m.client_id) : null;
        if (mc != null && mc !== capClientId) return false;
      }
    }
    return true;
  });
  const nombreCliente = (id: number | null | undefined) =>
    id != null && id > 0 ? clientRows.find((c) => c.id === id)?.nombre ?? `Cliente #${id}` : 'Genérico (todos)';
  const map = new Map<string, { key: string; label: string; items: FormatLogistics['etiquetas'][0]['items'] }>();
  for (const m of list) {
    const item = {
      id: m.id,
      nombre: m.nombre_material,
      stock: Number(m.cantidad_disponible),
      uom: m.unidad_medida,
    };
    const cscope = (m.client_scope_ids ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
    const cids = cscope.length > 0 ? cscope : m.client_id != null && Number(m.client_id) > 0 ? [Number(m.client_id)] : [];
    if (cids.length === 0) {
      const g = map.get('gen') ?? { key: 'gen', label: nombreCliente(null), items: [] };
      g.items.push(item);
      map.set('gen', g);
    } else {
      for (const cid of cids) {
        const key = `c:${cid}`;
        const g = map.get(key) ?? { key, label: nombreCliente(cid), items: [] };
        g.items.push(item);
        map.set(key, g);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const CONTAINER_PALLETS_REF = 24;

const MATERIAL_CATEGORY_BUCKETS = [
  'clamshell',
  'caja',
  'etiqueta',
  'corner_board',
  'tape',
  'otros',
] as const;

const BUCKET_LABEL: Record<(typeof MATERIAL_CATEGORY_BUCKETS)[number], string> = {
  clamshell: 'Clamshell',
  caja: 'Caja',
  etiqueta: 'Etiqueta',
  corner_board: 'Pallet',
  tape: 'Tape',
  otros: 'Otros',
};

function normalizeMaterialCategory(codigo: string | null | undefined): (typeof MATERIAL_CATEGORY_BUCKETS)[number] {
  const c = (codigo ?? '').toLowerCase();
  if (c === 'clamshell') return 'clamshell';
  if (c === 'caja') return 'caja';
  if (c === 'etiqueta') return 'etiqueta';
  if (c === 'tape') return 'tape';
  if (c === 'pallet') return 'corner_board';
  if (c === 'corner_board') return 'corner_board';
  if (c === 'bolsa' || c === 'otro' || c === '') return 'otros';
  return 'otros';
}

/**
 * Esquineros / zuncho / interconector / fleje suelen compartir categoría `corner_board` con el pallet base.
 * Para la tarjeta «Pallet» (= pallet físico ~1 por pallet equiv.) los mostramos en «Otros» (tripaje por pallet).
 */
function isTripajePalletAccessoryName(nombreMaterial: string | undefined): boolean {
  const n = (nombreMaterial ?? '').toLowerCase();
  return /\besquiner|\bzuncho\b|\binterconector\b|\bfleje\b/i.test(n);
}

function displayPackagingBucket(m: DashboardMaterial): (typeof MATERIAL_CATEGORY_BUCKETS)[number] {
  const base = normalizeMaterialCategory(m.material_category?.codigo);
  if (base === 'corner_board' && isTripajePalletAccessoryName(m.nombre_material)) return 'otros';
  return base;
}

/** IDs de materiales categoría tape que figuran en alguna receta activa del formato (para stock = mismo SKU que descuenta el consumo). */
function recipeTapeMaterialIdsForFormat(
  fmtId: number,
  recs: RecipeApi[],
  matById: Map<number, DashboardMaterial>,
  capClientId: number | 'all',
): Set<number> {
  const ids = new Set<number>();
  for (const r of recs) {
    if (!r.activo || r.presentation_format_id !== fmtId) continue;
    for (const it of r.items ?? []) {
      const m = matById.get(it.material_id);
      if (!m?.activo) continue;
      if (normalizeMaterialCategory(m.material_category?.codigo) !== 'tape') continue;
      if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
      ids.add(m.id);
    }
  }
  return ids;
}

function containerStatus(cont: number | null): 'green' | 'yellow' | 'red' {
  const v = cont == null || !Number.isFinite(cont) ? 0 : cont;
  if (v >= 1) return 'green';
  if (v >= 0.5) return 'yellow';
  return 'red';
}

type ConsumptionRow = {
  id: number;
  tarja_id: number;
  dispatch_tag_item_id: number | null;
  recipe_id: number;
  pallet_count: number;
  boxes_count: number;
  tape_linear_meters: string;
  corner_boards_qty: number;
  labels_qty: number;
  material_cost_total: string;
  created_at: string;
};

type RecalculateConsumptionsResult = {
  ok: boolean;
  total: number;
  recalculated: number;
  failed: number;
  results: Array<{ consumption_id: number; tarja_id: number; ok: boolean; error?: string }>;
};

function fetchConsumptions() {
  return apiJson<ConsumptionRow[]>('/api/packaging/consumptions');
}

function fetchRecipes() {
  return apiJson<RecipeApi[]>('/api/packaging/recipes');
}

function fetchTags() {
  return apiJson<PtTagApi[]>('/api/pt-tags');
}

function fetchMaterials() {
  return apiJson<PackagingMaterialRow[]>('/api/packaging/materials');
}

function fetchClients() {
  return apiJson<{ id: number; codigo: string; nombre: string }[]>('/api/masters/clients');
}

function fetchPresentationFormats() {
  return apiJson<PresentationFormatLite[]>('/api/masters/presentation-formats');
}

function findRecipeForTag(tag: PtTagApi, recipes: RecipeApi[]): RecipeApi | null {
  const active = recipes.filter((x) => x.activo && x.format_code === tag.format_code);
  const tagBrandId = tag.brand_id != null ? Number(tag.brand_id) : 0;
  if (tagBrandId > 0) {
    const exact = active.find((x) => (x.brand_id != null ? Number(x.brand_id) : 0) === tagBrandId);
    if (exact) return exact;
  }
  const generic = active.find((x) => x.brand_id == null);
  return generic ?? active[0] ?? null;
}

export function ConsumptionsPage() {
  const queryClient = useQueryClient();
  const [autoRunning, setAutoRunning] = useState(false);
  const [capClientId, setCapClientId] = useState<number | 'all'>('all');
  const autoSkipRef = useRef<Set<number>>(new Set());

  const { data: rows, isPending, isError, error } = useQuery({
    queryKey: ['packaging', 'consumptions'],
    queryFn: fetchConsumptions,
  });

  const { data: recipes, isPending: recipesPending } = useQuery({
    queryKey: ['packaging', 'recipes'],
    queryFn: fetchRecipes,
  });
  const { data: tags } = useQuery({ queryKey: ['pt-tags'], queryFn: fetchTags });
  const { data: materials, isPending: materialsPending } = useQuery({
    queryKey: ['packaging', 'materials'],
    queryFn: fetchMaterials,
  });
  const { data: clients } = useQuery({ queryKey: ['masters', 'clients'], queryFn: fetchClients });
  const { data: presentationFormats, isPending: formatsPending } = useQuery({
    queryKey: ['masters', 'presentation-formats', 'consumptions'],
    queryFn: fetchPresentationFormats,
    staleTime: 120_000,
  });

  const recalcMut = useMutation({
    mutationFn: () =>
      apiJson<RecalculateConsumptionsResult>('/api/packaging/consumptions/recalculate', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['packaging', 'consumptions'] });
      await queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      await queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      if (r.failed > 0) {
        toast.warning(`Recálculo parcial: ${r.recalculated}/${r.total} ok, ${r.failed} con error.`);
      } else {
        toast.success(`Recálculo listo: ${r.recalculated} consumo(s) actualizados.`);
      }
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo recalcular consumos'),
  });

  const sortedTags = useMemo(() => (tags ?? []).slice().sort((a, b) => b.id - a.id), [tags]);
  const tagById = useMemo(() => new Map(sortedTags.map((t) => [t.id, t])), [sortedTags]);

  const formatSummaryCards = useMemo(() => {
    const consumedTagIds = new Set((rows ?? []).map((r) => r.tarja_id));
    const map = new Map<
      string,
      { formatCode: string; tags: number; boxes: number; consumed: number; pending: number; hasRecipe: boolean }
    >();
    for (const t of sortedTags) {
      const key = t.format_code;
      const cur = map.get(key) ?? {
        formatCode: key,
        tags: 0,
        boxes: 0,
        consumed: 0,
        pending: 0,
        hasRecipe: Boolean((recipes ?? []).some((r) => r.activo && r.format_code === key)),
      };
      cur.tags += 1;
      if (countsTowardPtProductionTotals(t)) {
        cur.boxes += Number(t.total_cajas) || 0;
      }
      if (consumedTagIds.has(t.id)) cur.consumed += 1;
      else cur.pending += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.boxes - a.boxes);
  }, [sortedTags, rows, recipes]);

  const logisticsByFormatCode = useMemo(() => {
    const mats = (materials ?? []) as DashboardMaterial[];
    const recs = (recipes ?? []).filter((r) => r.activo);
    const fmtList = (presentationFormats ?? []).filter((f) => f.activo !== false);
    const fmtByCode = new Map(fmtList.map((f) => [f.format_code, f]));
    const matById = new Map(mats.map((m) => [m.id, m]));
    const clientRows = clients ?? [];
    const out = new Map<string, FormatLogistics | null>();

    for (const fc of formatSummaryCards) {
      const fmt = fmtByCode.get(fc.formatCode);
      if (!fmt) {
        out.set(fc.formatCode, null);
        continue;
      }
      const fmtId = fmt.id;
      const maxPallet = fmt.max_boxes_per_pallet != null ? Number(fmt.max_boxes_per_pallet) : NaN;
      const maxBpInt = Number.isFinite(maxPallet) && maxPallet > 0 ? Math.floor(maxPallet) : 0;

      const candidates = recs.filter((r) => r.presentation_format_id === fmtId);
      let best: { bottleneck: number; limitedBy: string; recipe: RecipeApi } | null = null;
      for (const rec of candidates) {
        let bottleneck = Infinity;
        let limitedBy = '';
        for (const it of rec.items ?? []) {
          if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
          const m = matById.get(it.material_id) as DashboardMaterial | undefined;
          if (!m?.activo) continue;
          if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
          const qtyBox = Number(it.qty_per_unit);
          const avail = Number(m.cantidad_disponible);
          if (!Number.isFinite(qtyBox) || qtyBox <= 0 || !Number.isFinite(avail) || avail < 0) continue;
          const maxBoxes = Math.floor(avail / qtyBox + 1e-9);
          if (maxBoxes < bottleneck) {
            bottleneck = maxBoxes;
            limitedBy = m.nombre_material;
          }
        }
        if (Number.isFinite(bottleneck) && bottleneck < Infinity && bottleneck > 0) {
          if (!best || bottleneck > best.bottleneck) {
            best = { bottleneck, limitedBy, recipe: rec };
          }
        }
      }

      if (!best) {
        out.set(fc.formatCode, {
          maxBoxesPerPallet: maxBpInt > 0 ? maxBpInt : null,
          boxesPossible: null,
          palletsPossible: null,
          containerPct: null,
          limitedBy: null,
          brandLine: null,
          clamshell: [],
          etiquetas: buildEtiquetaGroupsForFormat(mats, fmtId, capClientId, clientRows),
        });
        continue;
      }

      const pallets = maxBpInt > 0 ? Math.floor(best.bottleneck / maxBpInt + 1e-9) : 0;
      const containerPct = Math.min(100, (pallets / CONTAINER_PALLETS_REF) * 100);

      const clamshell: FormatLogistics['clamshell'] = [];
      for (const it of best.recipe.items ?? []) {
        if (it.cost_type !== 'directo' || it.base_unidad !== 'box') continue;
        const m = matById.get(it.material_id) as DashboardMaterial | undefined;
        if (!m?.activo) continue;
        if (m.material_category?.codigo !== 'clamshell') continue;
        if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
        const qtyBox = Number(it.qty_per_unit);
        const avail = Number(m.cantidad_disponible);
        if (!Number.isFinite(qtyBox) || qtyBox <= 0 || !Number.isFinite(avail) || avail < 0) continue;
        const theoreticalUnits = qtyBox * maxBpInt * CONTAINER_PALLETS_REF;
        const coveragePct = theoreticalUnits > 0 ? Math.min(100, (avail / theoreticalUnits) * 100) : 0;
        clamshell.push({
          nombre: m.nombre_material,
          qtyPerBox: qtyBox,
          maxBoxesPerPallet: maxBpInt,
          palletsInContainer: CONTAINER_PALLETS_REF,
          theoreticalUnits,
          disponible: avail,
          unidad: m.unidad_medida,
          coveragePct,
        });
      }

      out.set(fc.formatCode, {
        maxBoxesPerPallet: maxBpInt > 0 ? maxBpInt : null,
        boxesPossible: best.bottleneck,
        palletsPossible: pallets,
        containerPct,
        limitedBy: best.limitedBy,
        brandLine: best.recipe.brand?.nombre?.trim() ? best.recipe.brand.nombre.trim() : null,
        clamshell,
        etiquetas: buildEtiquetaGroupsForFormat(mats, fmtId, capClientId, clientRows),
      });
    }
    return out;
  }, [materials, recipes, presentationFormats, formatSummaryCards, clients, capClientId]);

  const formatMaterialSections = useMemo(() => {
    const mats = (materials ?? []) as DashboardMaterial[];
    const recs = (recipes ?? []).filter((r) => r.activo);
    const fmtList = (presentationFormats ?? []).filter((f) => f.activo !== false);
    const fmtByCode = new Map(fmtList.map((f) => [f.format_code, f]));
    const matById = new Map(mats.map((m) => [m.id, m]));
    const rowsByFormat = new Map<string, ConsumptionRow[]>();
    for (const r of rows ?? []) {
      const tag = tagById.get(r.tarja_id);
      if (!tag?.format_code) continue;
      const arr = rowsByFormat.get(tag.format_code) ?? [];
      arr.push(r);
      rowsByFormat.set(tag.format_code, arr);
    }

    return formatSummaryCards.map((fc) => {
      const fmt = fmtByCode.get(fc.formatCode);
      const fmtId = fmt?.id ?? null;
      const maxBp = fmt?.max_boxes_per_pallet != null ? Math.floor(Number(fmt.max_boxes_per_pallet)) : 0;
      const producedTags = sortedTags.filter((t) => countsTowardPtProductionTotals(t) && t.format_code === fc.formatCode);
      const boxesProduced = producedTags.reduce((s, t) => s + (Number(t.total_cajas) || 0), 0);
      const palletsProduced = maxBp > 0 ? boxesProduced / maxBp : producedTags.reduce((s, t) => s + (Number(t.total_pallets) || 0), 0);
      /** PT del formato que entran en el consumo teórico según cliente (capacidad). */
      const tagsForRollup = producedTags.filter((t) => tagMatchesCapClient(t, capClientId));
      const boxesRollup = tagsForRollup.reduce((s, t) => s + (Number(t.total_cajas) || 0), 0);
      const consumptions = rowsByFormat.get(fc.formatCode) ?? [];
      const boxesConsumed = consumptions.reduce((s, r) => s + (Number(r.boxes_count) || 0), 0);
      const consumoTotal = consumptions.reduce((s, r) => s + (Number(r.material_cost_total) || 0), 0);
      const contenedoresPosibles =
        logisticsByFormatCode.get(fc.formatCode)?.palletsPossible != null
          ? Number(logisticsByFormatCode.get(fc.formatCode)?.palletsPossible) / CONTAINER_PALLETS_REF
          : null;

      const qtyByBucket = new Map<(typeof MATERIAL_CATEGORY_BUCKETS)[number], number>();
      const stockByBucket = new Map<(typeof MATERIAL_CATEGORY_BUCKETS)[number], number>();
      const containerByBucket = new Map<(typeof MATERIAL_CATEGORY_BUCKETS)[number], number | null>();
      const reqPerContByMaterial = new Map<number, number>();
      for (const k of MATERIAL_CATEGORY_BUCKETS) {
        qtyByBucket.set(k, 0);
        stockByBucket.set(k, 0);
        containerByBucket.set(k, null);
      }

      const tapeIdsInRecipes =
        fmtId != null ? recipeTapeMaterialIdsForFormat(fmtId, recs, matById, capClientId) : new Set<number>();

      if (fmtId != null) {
        for (const m of mats) {
          if (!m.activo) continue;
          if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
          const bucket = displayPackagingBucket(m);
          if (bucket === 'tape' && tapeIdsInRecipes.size > 0 && !tapeIdsInRecipes.has(m.id)) continue;
          stockByBucket.set(bucket, (stockByBucket.get(bucket) ?? 0) + (Number(m.cantidad_disponible) || 0));
        }
      }

      /** Requerimiento por contenedor (24 pallets): por recetas del formato, no por fila de consumo. */
      if (fmtId != null) {
        for (const rec of recs) {
          if (rec.presentation_format_id !== fmtId) continue;
          for (const it of rec.items ?? []) {
            const m = matById.get(it.material_id) as DashboardMaterial | undefined;
            if (!m?.activo) continue;
            if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
            const qty = Number(it.qty_per_unit);
            if (!Number.isFinite(qty) || qty <= 0) continue;
            let reqCont = 0;
            if (it.cost_type === 'directo' && it.base_unidad === 'box' && maxBp > 0) reqCont = qty * maxBp * CONTAINER_PALLETS_REF;
            if (it.cost_type === 'tripaje' && it.base_unidad === 'pallet') reqCont = qty * CONTAINER_PALLETS_REF;
            if (reqCont > 0) {
              const prev = reqPerContByMaterial.get(m.id) ?? 0;
              reqPerContByMaterial.set(m.id, Math.max(prev, reqCont));
            }
          }
        }
      }

      /** Consumo teórico = Σ_PT ( receta aplicable × cajas/pallets de la PT ); materiales filtrados por formato + cliente. */
      for (const t of tagsForRollup) {
        const rec = findRecipeForTag(t, recs);
        if (!rec || (fmtId != null && rec.presentation_format_id !== fmtId)) continue;
        const boxes = Number(t.total_cajas) || 0;
        /** Pallets equivalentes al formato (cajas / cajas_por_pallet), no total_pallets de la tarja (suele ser 1 por unidad PT). */
        const palletsEquiv = maxBp > 0 ? boxes / maxBp : Number(t.total_pallets) || 0;
        for (const it of rec.items ?? []) {
          const m = matById.get(it.material_id) as DashboardMaterial | undefined;
          if (!m?.activo || fmtId == null) continue;
          if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
          const bucket = displayPackagingBucket(m);
          const qty = Number(it.qty_per_unit);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          const factor = it.base_unidad === 'box' ? boxes : palletsEquiv;
          qtyByBucket.set(bucket, (qtyByBucket.get(bucket) ?? 0) + qty * factor);
        }
      }

      const sumBoxesRows = boxesConsumed;
      const sumTapeRows = consumptions.reduce((s, r) => s + (Number(r.tape_linear_meters) || 0), 0);
      const sumLabelsRows = consumptions.reduce((s, r) => s + (Number(r.labels_qty) || 0), 0);
      const tapePerBox = sumBoxesRows > 0 ? sumTapeRows / sumBoxesRows : 0;
      const labelsPerBox = sumBoxesRows > 0 ? sumLabelsRows / sumBoxesRows : 0;

      /**
       * Si la receta no trae tape/etiqueta pero el autoconsumo registró cantidades, completar con proporción por caja
       * (filas históricas) × cajas de PT del mismo rollup (formato + cliente).
       */
      if ((qtyByBucket.get('tape') ?? 0) <= 0 && sumTapeRows > 0) {
        qtyByBucket.set('tape', sumTapeRows);
      } else if ((qtyByBucket.get('tape') ?? 0) <= 0 && tapePerBox > 0 && boxesRollup > 0) {
        qtyByBucket.set('tape', tapePerBox * boxesRollup);
      }
      if ((qtyByBucket.get('etiqueta') ?? 0) <= 0 && sumLabelsRows > 0) {
        qtyByBucket.set('etiqueta', sumLabelsRows);
      } else if ((qtyByBucket.get('etiqueta') ?? 0) <= 0 && labelsPerBox > 0 && boxesRollup > 0) {
        qtyByBucket.set('etiqueta', labelsPerBox * boxesRollup);
      }

      let tapeQtyPerBoxRecipe = 0;
      let labelQtyPerBoxRecipe = 0;
      if (fmtId != null) {
        for (const rec of recs) {
          if (rec.presentation_format_id !== fmtId) continue;
          for (const it of rec.items ?? []) {
            if (it.base_unidad !== 'box') continue;
            const m = matById.get(it.material_id) as DashboardMaterial | undefined;
            if (!m?.activo) continue;
            if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
            const q = Number(it.qty_per_unit);
            if (!Number.isFinite(q) || q <= 0) continue;
            const cat = normalizeMaterialCategory(m.material_category?.codigo);
            if (cat === 'tape') tapeQtyPerBoxRecipe += q;
            if (cat === 'etiqueta') labelQtyPerBoxRecipe += q;
          }
        }
      }
      const tapePerBoxForCont = tapePerBox > 0 ? tapePerBox : tapeQtyPerBoxRecipe;
      const labelsPerBoxForCont = labelsPerBox > 0 ? labelsPerBox : labelQtyPerBoxRecipe;

      if (fmtId != null) {
        for (const m of mats) {
          if (!m.activo) continue;
          if (!materialAppliesToCapView(m, fmtId, capClientId)) continue;
          const req = reqPerContByMaterial.get(m.id);
          if (!req || req <= 0) continue;
          const stock = Number(m.cantidad_disponible);
          if (!Number.isFinite(stock) || stock < 0) continue;
          const bucket = displayPackagingBucket(m);
          const cont = stock / req;
          const prev = containerByBucket.get(bucket);
          containerByBucket.set(bucket, prev == null ? cont : Math.min(prev, cont));
        }
      }

      if (maxBp > 0) {
        const tapeReq = tapePerBoxForCont > 0 ? tapePerBoxForCont * maxBp * CONTAINER_PALLETS_REF : 0;
        if (containerByBucket.get('tape') == null && tapeReq > 0) {
          const stock = stockByBucket.get('tape') ?? 0;
          containerByBucket.set('tape', stock / tapeReq);
        }
        const labelReq = labelsPerBoxForCont > 0 ? labelsPerBoxForCont * maxBp * CONTAINER_PALLETS_REF : 0;
        if (containerByBucket.get('etiqueta') == null && labelReq > 0) {
          const stock = stockByBucket.get('etiqueta') ?? 0;
          containerByBucket.set('etiqueta', stock / labelReq);
        }
      }

      const etiquetas = fmtId == null
        ? []
        : mats
            .filter((m) => m.activo && m.material_category?.codigo === 'etiqueta' && materialAppliesToCapView(m, fmtId, capClientId))
            .map((m) => ({
              id: m.id,
              nombre: m.nombre_material,
              stock: Number(m.cantidad_disponible) || 0,
              unidad: m.unidad_medida,
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

      const tapeItems =
        fmtId == null
          ? []
          : mats
              .filter(
                (m) =>
                  m.activo &&
                  normalizeMaterialCategory(m.material_category?.codigo) === 'tape' &&
                  tapeIdsInRecipes.has(m.id) &&
                  materialAppliesToCapView(m, fmtId, capClientId),
              )
              .map((m) => ({
                id: m.id,
                nombre: m.nombre_material,
                stock: Number(m.cantidad_disponible) || 0,
                unidad: m.unidad_medida,
              }))
              .sort((a, b) => a.nombre.localeCompare(b.nombre));

      const categories = MATERIAL_CATEGORY_BUCKETS.map((key) => {
        const containers = containerByBucket.get(key) ?? null;
        return {
          key,
          label: BUCKET_LABEL[key],
          consumoQty: qtyByBucket.get(key) ?? 0,
          stock: stockByBucket.get(key) ?? 0,
          containers,
          status: containerStatus(containers),
          tapeItems: key === 'tape' ? tapeItems : [],
          etiquetas: key === 'etiqueta' ? etiquetas : [],
        };
      }).sort((a, b) => {
        const sev = { red: 0, yellow: 1, green: 2 } as const;
        const sevDiff = sev[a.status] - sev[b.status];
        if (sevDiff !== 0) return sevDiff;
        const av = a.containers ?? Number.POSITIVE_INFINITY;
        const bv = b.containers ?? Number.POSITIVE_INFINITY;
        return av - bv;
      });

      return {
        formatCode: fc.formatCode,
        boxesProduced,
        palletsProduced,
        consumoTotal,
        contenedoresPosibles,
        categories,
      };
    });
  }, [
    materials,
    recipes,
    presentationFormats,
    rows,
    tagById,
    capClientId,
    formatSummaryCards,
    sortedTags,
    logisticsByFormatCode,
  ]);

  const autoTargets = useMemo(() => {
    if (!tags || !recipes) return [];
    const consumed = new Set((rows ?? []).map((r) => r.tarja_id));
    return tags
      .filter((t) => !consumed.has(t.id))
      .filter((t) => !autoSkipRef.current.has(t.id))
      .map((t) => {
        const rec = findRecipeForTag(t, recipes);
        if (!rec) return null;
        return {
          tarja_id: t.id,
          recipe_id: rec.id,
          pallet_count: Math.max(1, t.total_pallets || 1),
          boxes_count: Math.max(0, t.total_cajas ?? 0),
        };
      })
      .filter((x): x is { tarja_id: number; recipe_id: number; pallet_count: number; boxes_count: number } => x != null);
  }, [tags, recipes, rows]);

  useEffect(() => {
    if (autoRunning) return;
    if (autoTargets.length === 0) return;
    let cancelled = false;
    setAutoRunning(true);
    void (async () => {
      let ok = 0;
      for (const t of autoTargets) {
        if (cancelled) break;
        try {
          await apiJson('/api/packaging/consumptions', {
            method: 'POST',
            body: JSON.stringify({
              tarja_id: t.tarja_id,
              recipe_id: t.recipe_id,
              pallet_count: t.pallet_count,
              boxes_count: t.boxes_count,
              tape_linear_meters: 0,
              corner_boards_qty: 0,
              labels_qty: 0,
            }),
          });
          ok += 1;
        } catch (e) {
          autoSkipRef.current.add(t.tarja_id);
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : 'Error de autoconsumo';
            toast.error(`No se pudo autoconsumir TAR #${t.tarja_id}: ${msg}`);
          }
        }
      }
      if (!cancelled && ok > 0) {
        await queryClient.invalidateQueries({ queryKey: ['packaging', 'consumptions'] });
        await queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
        toast.success(`Autoconsumo aplicado en ${ok} unidad(es) PT`);
      }
      if (!cancelled) setAutoRunning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [autoTargets, autoRunning, queryClient]);

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
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Error'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className={pageHeaderRow}>
        <div>
          <h1 className={pageTitle}>Consumos</h1>
          <p className={pageSubtitle}>Consumo operativo por formato y categoría para decisiones rápidas de reposición.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg gap-1.5"
            disabled={recalcMut.isPending}
            onClick={() => recalcMut.mutate()}
          >
            <RotateCcw className={cn('h-4 w-4', recalcMut.isPending && 'animate-spin')} />
            Recalcular consumos
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-lg" asChild>
            <Link to="/packaging/materials" className="gap-1.5">
              <Package className="h-4 w-4" />
              Materiales
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
        <div className="grid gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500" htmlFor="consum-client">
            Cliente (capacidad)
          </label>
          <select
            id="consum-client"
            className="h-8 min-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800"
            value={capClientId === 'all' ? 'all' : String(capClientId)}
            onChange={(e) => {
              const v = e.target.value;
              setCapClientId(v === 'all' ? 'all' : Number(v));
            }}
          >
            <option value="all">Todos (genéricos)</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {materialsPending || recipesPending || formatsPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : (
        <section aria-labelledby="consum-mat-heading" className="space-y-4">
          <h2 id="consum-mat-heading" className={sectionTitle}>
            Consumo por material
          </h2>
          <div className="space-y-3">
            {formatMaterialSections.map((f) => (
              <Card key={f.formatCode} className={cn(contentCard, 'border-slate-200/90 shadow-sm')}>
                <CardContent className="space-y-3 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="min-w-0">
                      <p className="font-mono text-[14px] font-semibold text-slate-900">{f.formatCode}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">Consumo por categoría</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500">Cajas</span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatCount(f.boxesProduced)}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500">Pallets</span>
                        <span className="font-semibold tabular-nums text-slate-900">
                          {f.palletsProduced.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500">Consumo $</span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatMoney(f.consumoTotal)}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500">Contenedores</span>
                        <span className="font-semibold tabular-nums text-sky-900">
                          {f.contenedoresPosibles != null
                            ? f.contenedoresPosibles.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-7">
                    {f.categories.map((c) => {
                      const border =
                        c.status === 'green'
                          ? 'border-emerald-200/90 bg-emerald-50/35'
                          : c.status === 'yellow'
                            ? 'border-amber-200/90 bg-amber-50/40'
                            : 'border-rose-200/90 bg-rose-50/35';
                      const contStr =
                        c.containers != null && Number.isFinite(c.containers)
                          ? c.containers.toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—';
                      return (
                        <div
                          key={c.key}
                          className={cn(
                            'rounded-lg border p-2.5 text-[10px] shadow-sm transition-colors',
                            border,
                          )}
                        >
                          <p className="text-[12px] font-semibold leading-tight text-slate-900">{c.label}</p>
                          <div className="mt-1.5 space-y-1">
                            <div className="flex justify-between gap-1 border-b border-slate-100/80 pb-1">
                              <span className="text-slate-500">Consumo</span>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                                {c.consumoQty.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between gap-1 border-b border-slate-100/80 pb-1">
                              <span className="text-slate-500">Stock</span>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                                {formatCount(Math.round(c.stock))}
                              </span>
                            </div>
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-800/90">Contenedores</p>
                              <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight text-sky-950">{contStr}</p>
                            </div>
                          </div>
                          {c.key === 'tape' && c.tapeItems.length > 1 ? (
                            <div className="mt-2 rounded-lg border border-slate-200/80 bg-white/70 p-2">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stock por material (receta)</p>
                              <div className="space-y-1">
                                {c.tapeItems.map((e) => (
                                  <div key={e.id} className="flex items-center justify-between gap-1">
                                    <span className="truncate text-[10px] text-slate-700">{e.nombre}</span>
                                    <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-800">
                                      {formatCount(Math.round(e.stock))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {c.key === 'etiqueta' && c.etiquetas.length > 1 ? (
                            <div className="mt-2 rounded-lg border border-slate-200/80 bg-white/70 p-2">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Etiquetas asociadas</p>
                              <div className="space-y-1">
                                {c.etiquetas.map((e) => (
                                  <div key={e.id} className="flex items-center justify-between gap-1">
                                    <span className="truncate text-[10px] text-slate-700">{e.nombre}</span>
                                    <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-800">
                                      {formatCount(Math.round(e.stock))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
