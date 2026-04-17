import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Box, Copy, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  btnToolbarPrimary,
  contentCard,
  emptyStatePanel,
  errorStateCard,
  filterInputClass,
  filterSelectClass,
  pageHeaderRow,
  pageSubtitle,
  pageTitle,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

export type RecipeItemApi = {
  id: number;
  recipe_id: number;
  material_id: number;
  qty_per_unit: string;
  cost_type: 'directo' | 'tripaje';
  base_unidad: 'box' | 'pallet';
  material: { id: number; nombre_material: string; unidad_medida: string } | null;
};

export type RecipeApi = {
  id: number;
  presentation_format_id: number;
  format_code: string;
  brand_id: number | null;
  brand?: { id: number; nombre: string; codigo?: string | null } | null;
  descripcion?: string;
  activo: boolean;
  items: RecipeItemApi[];
};

type MaterialOption = {
  id: number;
  nombre_material: string;
  unidad_medida: string;
  activo: boolean;
  material_category?: { id: number; codigo: string; nombre: string };
};

type PresentationFormatOption = {
  id: number;
  format_code: string;
  descripcion?: string | null;
  max_boxes_per_pallet?: number | null;
  activo?: boolean;
};

type BrandOption = {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
};

type DraftLine = {
  key: string;
  material_id: number;
  qty_per_unit: number;
  base_unidad: 'box' | 'pallet';
};

const addItemSchema = z
  .object({
    material_id: z.coerce.number().int(),
    qty_per_unit: z.coerce.number().min(0.0001, { message: 'Mín. 0.0001' }),
    base_unidad: z.enum(['box', 'pallet']),
  })
  .refine((d) => d.material_id > 0, { message: 'Elegí material', path: ['material_id'] });

type AddItemForm = z.infer<typeof addItemSchema>;

function fetchRecipes() {
  return apiJson<RecipeApi[]>('/api/packaging/recipes');
}

function fetchMaterials() {
  return apiJson<MaterialOption[]>('/api/packaging/materials');
}

function fetchFormats() {
  return apiJson<PresentationFormatOption[]>('/api/masters/presentation-formats');
}

function fetchBrands() {
  return apiJson<BrandOption[]>('/api/masters/brands?include_inactive=true');
}

function newDraftLine(defaultBase: 'box' | 'pallet'): DraftLine {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    material_id: 0,
    qty_per_unit: 1,
    base_unidad: defaultBase,
  };
}

function draftToPayload(line: DraftLine): AddItemForm {
  return {
    material_id: line.material_id,
    qty_per_unit: line.qty_per_unit,
    base_unidad: line.base_unidad,
  };
}

export function RecipesPage() {
  const { role } = useAuth();
  const canReset = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createFormatId, setCreateFormatId] = useState(0);
  const [createBrandId, setCreateBrandId] = useState(0);
  const [createDefaultBase, setCreateDefaultBase] = useState<'box' | 'pallet'>('box');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);

  const [editRecipeId, setEditRecipeId] = useState<number | null>(null);
  const [addLineRecipeId, setAddLineRecipeId] = useState<number | null>(null);
  const [editLineTarget, setEditLineTarget] = useState<{ recipeId: number; item: RecipeItemApi } | null>(null);

  const [duplicateSource, setDuplicateSource] = useState<RecipeApi | null>(null);
  const [duplicateTargetFormatId, setDuplicateTargetFormatId] = useState(0);
  const [duplicateTargetBrandId, setDuplicateTargetBrandId] = useState(0);

  const { data: recipes, isPending, isError, error } = useQuery({
    queryKey: ['packaging', 'recipes'],
    queryFn: fetchRecipes,
  });

  const { data: materials } = useQuery({
    queryKey: ['packaging', 'materials'],
    queryFn: fetchMaterials,
  });

  const { data: formats } = useQuery({
    queryKey: ['masters', 'presentation-formats'],
    queryFn: fetchFormats,
  });

  const { data: brands } = useQuery({
    queryKey: ['masters', 'brands', 'recipes'],
    queryFn: fetchBrands,
  });

  const activeMaterials = useMemo(
    () => (materials ?? []).filter((m) => m.activo).sort((a, b) => a.nombre_material.localeCompare(b.nombre_material)),
    [materials],
  );

  const activeFormats = useMemo(
    () => (formats ?? []).filter((f) => f.activo !== false).sort((a, b) => a.format_code.localeCompare(b.format_code)),
    [formats],
  );

  const activeBrands = useMemo(
    () => (brands ?? []).filter((b) => b.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [brands],
  );

  const materialById = useMemo(() => new Map(activeMaterials.map((m) => [m.id, m])), [activeMaterials]);

  const recipeKeys = useMemo(
    () =>
      new Set(
        (recipes ?? [])
          .filter((r) => r.activo)
          .map((r) => `${r.presentation_format_id}:${r.brand_id != null ? Number(r.brand_id) : 0}`),
      ),
    [recipes],
  );

  const hasRecipeCombo = useMemo(
    () => (formatId: number, brandId: number) => recipeKeys.has(`${formatId}:${brandId > 0 ? brandId : 0}`),
    [recipeKeys],
  );

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const s = search.trim().toLowerCase();
    if (!s) return recipes;
    return recipes.filter(
      (r) =>
        r.format_code.toLowerCase().includes(s) ||
        (r.brand?.nombre ?? '').toLowerCase().includes(s) ||
        (r.descripcion ?? '').toLowerCase().includes(s),
    );
  }, [recipes, search]);

  const itemForm = useForm<AddItemForm>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(addItemSchema),
    defaultValues: { material_id: 0, qty_per_unit: 1, base_unidad: 'box' },
  });

  const defaultMaterialId = activeMaterials[0]?.id ?? 0;

  const prevAddLineOpen = useRef(false);
  useEffect(() => {
    const open = addLineRecipeId != null;
    if (open && !prevAddLineOpen.current) {
      itemForm.reset({
        material_id: defaultMaterialId,
        qty_per_unit: 1,
        base_unidad: 'box',
      });
    }
    prevAddLineOpen.current = open;
  }, [addLineRecipeId, defaultMaterialId, itemForm.reset]);

  const createFullMut = useMutation({
    mutationFn: async (payload: { presentation_format_id: number; brand_id?: number; descripcion?: string; lines: DraftLine[] }) => {
      const recipe = await apiJson<{ id: number }>('/api/packaging/recipes', {
        method: 'POST',
        body: JSON.stringify({
          presentation_format_id: payload.presentation_format_id,
          ...(payload.brand_id != null && payload.brand_id > 0 ? { brand_id: payload.brand_id } : {}),
          descripcion: payload.descripcion,
        }),
      });
      for (const line of payload.lines) {
        const body = draftToPayload(line);
        await apiJson(`/api/packaging/recipes/${recipe.id}/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      return recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Receta creada');
      setCreateOpen(false);
      resetCreateWizard();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetCreateWizard() {
    setCreateBrandId(0);
    setCreateFormatId(activeFormats[0]?.id ?? 0);
    setCreateDefaultBase('box');
    setDraftLines([]);
  }

  function openCreate() {
    resetCreateWizard();
    setDraftLines([newDraftLine('box')]);
    setCreateOpen(true);
  }

  const addItemMut = useMutation({
    mutationFn: ({ recipeId, body }: { recipeId: number; body: AddItemForm }) =>
      apiJson<unknown>(`/api/packaging/recipes/${recipeId}/items`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Línea añadida');
      setAddLineRecipeId(null);
      itemForm.reset({
        material_id: defaultMaterialId,
        qty_per_unit: 1,
        base_unidad: 'box',
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editItemMut = useMutation({
    mutationFn: ({ recipeId, itemId, body }: { recipeId: number; itemId: number; body: AddItemForm }) =>
      apiJson<unknown>(`/api/packaging/recipes/${recipeId}/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Línea actualizada');
      setEditLineTarget(null);
      itemForm.reset({
        material_id: defaultMaterialId,
        qty_per_unit: 1,
        base_unidad: 'box',
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRecipeMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/packaging/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Receta eliminada');
      setEditRecipeId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: async ({
      source,
      presentation_format_id,
      brand_id,
    }: {
      source: RecipeApi;
      presentation_format_id: number;
      brand_id?: number;
    }) => {
      const recipe = await apiJson<{ id: number }>('/api/packaging/recipes', {
        method: 'POST',
        body: JSON.stringify({
          presentation_format_id,
          ...(brand_id != null && brand_id > 0 ? { brand_id } : {}),
        }),
      });
      for (const it of source.items) {
        const body: AddItemForm = {
          material_id: it.material_id,
          qty_per_unit: Number(it.qty_per_unit),
          base_unidad: it.base_unidad ?? 'box',
        };
        await apiJson(`/api/packaging/recipes/${recipe.id}/items`, { method: 'POST', body: JSON.stringify(body) });
      }
      return recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Receta duplicada');
      setDuplicateSource(null);
      setDuplicateTargetFormatId(0);
      setDuplicateTargetBrandId(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetRecipesMut = useMutation({
    mutationFn: () =>
      apiJson<{ deleted_recipes: number; deleted_items: number }>('/api/packaging/recipes', { method: 'DELETE' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success(`Recetas reiniciadas (${res.deleted_recipes} recetas, ${res.deleted_items} líneas)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function baseLabel(v: 'box' | 'pallet') {
    return v === 'pallet' ? 'Pallet' : 'Caja';
  }

  const editingRecipe = useMemo(
    () => (editRecipeId != null ? (recipes ?? []).find((r) => r.id === editRecipeId) ?? null : null),
    [editRecipeId, recipes],
  );

  const itemErr = itemForm.formState.errors;

  function onSubmitCreate() {
    if (!createFormatId) {
      toast.error('Elegí un formato');
      return;
    }
    if (hasRecipeCombo(createFormatId, createBrandId > 0 ? createBrandId : 0)) {
      toast.error('Ya existe receta para ese formato y marca.');
      return;
    }
    const lines = draftLines.filter((l) => l.material_id > 0 && l.qty_per_unit > 0);
    if (lines.length === 0) {
      toast.error('Agregá al menos una línea con material y cantidad');
      return;
    }
    createFullMut.mutate({
      presentation_format_id: createFormatId,
      ...(createBrandId > 0 ? { brand_id: createBrandId } : {}),
      lines,
    });
  }

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={errorStateCard}>
        <p className="font-medium text-rose-900">No se pudieron cargar las recetas</p>
        <p className="mt-1 text-sm text-rose-800/90">{error instanceof Error ? error.message : 'Reintentá más tarde.'}</p>
      </div>
    );
  }

  const hasAnyRecipes = (recipes ?? []).length > 0;
  const listForTable = hasAnyRecipes ? filtered : [];

  return (
    <div className="space-y-6">
      <div className={pageHeaderRow}>
        <div>
          <h1 className={pageTitle}>Recetas</h1>
          <p className={pageSubtitle}>Recetas por formato y marca (opcional) · cantidad por caja o por pallet.</p>
        </div>
        <Button
          type="button"
          className={cn(btnToolbarPrimary, 'shrink-0')}
          onClick={openCreate}
          disabled={activeFormats.length === 0}
          title={activeFormats.length === 0 ? 'No hay formatos activos en maestro' : undefined}
        >
          <Plus className="h-4 w-4" />
          Crear receta
        </Button>
      </div>

      {canReset ? (
        <Card className={cn(contentCard, 'border-dashed border-amber-200/70 bg-amber-50/40')}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm text-slate-600">Borra todas las recetas (solo admin/supervisor).</p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="rounded-xl"
                disabled={resetRecipesMut.isPending}
              onClick={() => {
                if (!confirm('¿Eliminar TODAS las recetas y sus líneas?')) return;
                resetRecipesMut.mutate();
              }}
            >
              Reiniciar todo
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!hasAnyRecipes ? (
        <div className={emptyStatePanel}>
          <p className="text-base font-semibold text-slate-900">No hay recetas configuradas</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Definí materiales por formato y marca (opcional), con base por caja o pallet.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">
              <Package className="h-3.5 w-3.5" />
              Formato
            </span>
            <ArrowRight className="h-4 w-4 text-slate-300" />
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">
              <Box className="h-3.5 w-3.5" />
              Base caja / pallet
            </span>
            <ArrowRight className="h-4 w-4 text-slate-300" />
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">
              <Plus className="h-3.5 w-3.5" />
              Materiales
            </span>
          </div>
          <Button
            type="button"
            size="lg"
            className="mt-8 rounded-xl px-8 shadow-sm"
            onClick={openCreate}
            disabled={activeFormats.length === 0}
          >
            <Plus className="mr-2 h-5 w-5" />
            Crear receta
          </Button>
          {activeFormats.length === 0 && (
            <p className="mt-3 text-xs text-amber-800/90">No hay formatos activos en el maestro.</p>
          )}
        </div>
      ) : (
        <>
          <div className="relative max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Label htmlFor="search-recipes" className="sr-only">
              Buscar
            </Label>
            <Input
              id="search-recipes"
              placeholder="Buscar por formato o nota…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(filterInputClass, 'pl-9')}
              autoComplete="off"
            />
          </div>

          {listForTable.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
              Sin resultados para la búsqueda.
            </div>
          ) : (
            <div className={tableShell}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formato</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marca</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Líneas
                      </TableHead>
                      <TableHead className="w-[200px] text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Acciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listForTable.map((recipe) => (
                      <TableRow key={recipe.id} className="border-slate-100/90">
                        <TableCell>
                          <span className="font-mono text-sm font-medium text-slate-900">{recipe.format_code}</span>
                          {recipe.descripcion ? (
                            <span className="mt-0.5 block truncate text-xs text-slate-500">{recipe.descripcion}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {recipe.brand?.nombre ?? <span className="text-slate-400">Genérica</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-slate-700">{recipe.items.length}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-xs"
                              onClick={() => setEditRecipeId(recipe.id)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-xs"
                              disabled={activeFormats.length === 0}
                              onClick={() => {
                                setDuplicateSource(recipe);
                                setDuplicateTargetFormatId(activeFormats[0]?.id ?? 0);
                                setDuplicateTargetBrandId(recipe.brand_id ?? 0);
                              }}
                              title={
                                activeFormats.length === 0 ? 'No hay formatos activos' : 'Copiar líneas a formato/marca'
                              }
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" />
                              Duplicar
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                              disabled={deleteRecipeMut.isPending}
                              aria-label="Eliminar"
                              onClick={() => {
                                if (!confirm(`¿Eliminar receta ${recipe.format_code}?`)) return;
                                deleteRecipeMut.mutate(recipe.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Crear: formato → base → líneas */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetCreateWizard();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva receta</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-1">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">1 · Marca (opcional)</p>
              <Label htmlFor="create-brand" className="text-xs text-slate-600">
                Marca de receta
              </Label>
              <select
                id="create-brand"
                className={cn(filterSelectClass, 'mt-1')}
                value={createBrandId}
                onChange={(e) => setCreateBrandId(Number(e.target.value) || 0)}
              >
                <option value={0}>Genérica (sin marca)</option>
                {activeBrands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">2 · Formato</p>
              <Label htmlFor="create-format" className="text-xs text-slate-600">
                Formato de presentación
              </Label>
              <select
                id="create-format"
                className={cn(filterSelectClass, 'mt-1')}
                value={createFormatId}
                onChange={(e) => setCreateFormatId(Number(e.target.value))}
              >
                {activeFormats.length === 0 ? (
                  <option value={0}>Sin formatos disponibles</option>
                ) : (
                  activeFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.format_code}
                      {f.max_boxes_per_pallet != null ? ` · ${f.max_boxes_per_pallet} cj/pallet` : ''}
                    </option>
                  ))
                )}
              </select>
              {createFormatId > 0 && hasRecipeCombo(createFormatId, createBrandId > 0 ? createBrandId : 0) ? (
                <p className="mt-1 text-xs text-rose-700">Ya existe receta para ese formato y marca.</p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">3 · Base por defecto</p>
              <p className="mb-2 text-xs text-slate-500">Las líneas nuevas usan esta base; podés cambiarla por línea.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={createDefaultBase === 'box' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setCreateDefaultBase('box');
                    setDraftLines((rows) => rows.map((r) => ({ ...r, base_unidad: 'box' })));
                  }}
                >
                  Por caja
                </Button>
                <Button
                  type="button"
                  variant={createDefaultBase === 'pallet' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setCreateDefaultBase('pallet');
                    setDraftLines((rows) => rows.map((r) => ({ ...r, base_unidad: 'pallet' })));
                  }}
                >
                  Por pallet
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">4 · Materiales</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => setDraftLines((rows) => [...rows, newDraftLine(createDefaultBase)])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Agregar línea
                </Button>
              </div>
              <div className="space-y-2">
                {draftLines.map((line) => {
                  const mat = line.material_id ? materialById.get(line.material_id) : undefined;
                  return (
                    <div
                      key={line.key}
                      className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-12 sm:items-end"
                    >
                      <div className="sm:col-span-5">
                        <Label className="text-xs text-slate-600">Material</Label>
                        <select
                          className={cn(filterSelectClass, 'mt-1')}
                          value={line.material_id}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            setDraftLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, material_id: id } : r)),
                            );
                          }}
                        >
                          <option value={0}>Elegir…</option>
                          {activeMaterials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre_material}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-slate-600">Cantidad</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          min={0.0001}
                          className={cn(filterInputClass, 'mt-1')}
                          value={line.qty_per_unit}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setDraftLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, qty_per_unit: v } : r)),
                            );
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-slate-600">Unidad</Label>
                        <p className="mt-2 text-sm text-slate-700">{mat?.unidad_medida ?? '—'}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-slate-600">Base</Label>
                        <select
                          className={cn(filterSelectClass, 'mt-1')}
                          value={line.base_unidad}
                          onChange={(e) => {
                            const base = e.target.value as 'box' | 'pallet';
                            setDraftLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, base_unidad: base } : r)),
                            );
                          }}
                        >
                          <option value="box">Caja</option>
                          <option value="pallet">Pallet</option>
                        </select>
                      </div>
                      <div className="flex sm:col-span-1 sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-slate-400 hover:text-rose-600"
                          aria-label="Quitar línea"
                          onClick={() => setDraftLines((rows) => rows.filter((r) => r.key !== line.key))}
                          disabled={draftLines.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={
                createFullMut.isPending ||
                activeFormats.length === 0 ||
                hasRecipeCombo(createFormatId, createBrandId > 0 ? createBrandId : 0)
              }
              onClick={onSubmitCreate}
            >
              {createFullMut.isPending ? 'Guardando…' : 'Guardar receta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar receta (líneas) */}
      <Dialog open={editRecipeId != null} onOpenChange={(o) => !o && setEditRecipeId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{editingRecipe ? editingRecipe.format_code : 'Receta'}</DialogTitle>
          </DialogHeader>
          {editingRecipe && (
            <div className="space-y-4">
              {editingRecipe.descripcion ? (
                <p className="text-sm text-slate-600">{editingRecipe.descripcion}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="rounded-xl" onClick={() => setAddLineRecipeId(editingRecipe.id)}>
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar línea
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="rounded-xl"
                  disabled={deleteRecipeMut.isPending}
                  onClick={() => {
                    if (!confirm(`¿Eliminar receta ${editingRecipe.format_code}?`)) return;
                    deleteRecipeMut.mutate(editingRecipe.id);
                  }}
                >
                  Eliminar receta
                </Button>
              </div>
              {editingRecipe.items.length === 0 ? (
                <p className="text-sm text-slate-500">Sin líneas. Agregá materiales arriba.</p>
              ) : (
                <div className={tableShell}>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs uppercase text-slate-500">Material</TableHead>
                          <TableHead className="text-right text-xs uppercase text-slate-500">Cant.</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500">Base</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingRecipe.items.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell className="text-sm">
                              {it.material?.nombre_material ?? `#${it.material_id}`}
                              <span className="ml-1 text-xs text-slate-400">{it.material?.unidad_medida}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{it.qty_per_unit}</TableCell>
                            <TableCell className="text-xs text-slate-600">{baseLabel(it.base_unidad)}</TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  itemForm.reset({
                                    material_id: it.material_id,
                                    qty_per_unit: Number(it.qty_per_unit),
                                    base_unidad: it.base_unidad ?? 'box',
                                  });
                                  setEditLineTarget({ recipeId: editingRecipe.id, item: it });
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditRecipeId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addLineRecipeId != null}
        onOpenChange={(o) => {
          if (!o) setAddLineRecipeId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva línea</DialogTitle>
          </DialogHeader>
          {addLineRecipeId != null && (
            <form
              onSubmit={itemForm.handleSubmit((body) => addItemMut.mutate({ recipeId: addLineRecipeId, body }))}
              className="grid gap-4 py-1"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="material_id" className="text-xs text-slate-600">
                  Material
                </Label>
                <select
                  id="material_id"
                  className={cn(filterSelectClass, itemErr.material_id && 'border-rose-300')}
                  {...itemForm.register('material_id', { valueAsNumber: true })}
                >
                  {activeMaterials.length === 0 ? (
                    <option value={0}>Sin materiales</option>
                  ) : (
                    <>
                      <option value={0}>Elegir…</option>
                      {activeMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre_material} ({m.unidad_medida})
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {itemErr.material_id && <p className="text-xs text-destructive">{itemErr.material_id.message}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qty_per_unit" className="text-xs text-slate-600">
                  Cantidad / unidad base
                </Label>
                <Input
                  id="qty_per_unit"
                  type="number"
                  step="0.0001"
                  min={0.0001}
                  className={cn(filterInputClass, itemErr.qty_per_unit && 'border-rose-300')}
                  {...itemForm.register('qty_per_unit')}
                />
                {itemErr.qty_per_unit && <p className="text-xs text-destructive">{itemErr.qty_per_unit.message}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="base_unidad" className="text-xs text-slate-600">
                  Cantidad por
                </Label>
                <select id="base_unidad" className={filterSelectClass} {...itemForm.register('base_unidad')}>
                  <option value="box">Caja (producto)</option>
                  <option value="pallet">Pallet completo</option>
                </select>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setAddLineRecipeId(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl" disabled={addItemMut.isPending}>
                  {addItemMut.isPending ? 'Guardando…' : 'Añadir'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editLineTarget != null}
        onOpenChange={(o) => {
          if (!o) setEditLineTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar línea</DialogTitle>
          </DialogHeader>
          {editLineTarget && (
            <form
              onSubmit={itemForm.handleSubmit((body) =>
                editItemMut.mutate({ recipeId: editLineTarget.recipeId, itemId: editLineTarget.item.id, body }),
              )}
              className="grid gap-4 py-1"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="edit_material_id" className="text-xs text-slate-600">
                  Material
                </Label>
                <select
                  id="edit_material_id"
                  className={cn(filterSelectClass, itemErr.material_id && 'border-rose-300')}
                  {...itemForm.register('material_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_material} ({m.unidad_medida})
                    </option>
                  ))}
                </select>
                {itemErr.material_id && <p className="text-xs text-destructive">{itemErr.material_id.message}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit_qty_per_unit" className="text-xs text-slate-600">
                  Cantidad
                </Label>
                <Input
                  id="edit_qty_per_unit"
                  type="number"
                  step="0.0001"
                  min={0.0001}
                  className={cn(filterInputClass, itemErr.qty_per_unit && 'border-rose-300')}
                  {...itemForm.register('qty_per_unit')}
                />
                {itemErr.qty_per_unit && <p className="text-xs text-destructive">{itemErr.qty_per_unit.message}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit_base_unidad" className="text-xs text-slate-600">
                  Cantidad por
                </Label>
                <select id="edit_base_unidad" className={filterSelectClass} {...itemForm.register('base_unidad')}>
                  <option value="box">Caja (producto)</option>
                  <option value="pallet">Pallet completo</option>
                </select>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditLineTarget(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl" disabled={editItemMut.isPending}>
                  {editItemMut.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicar */}
      <Dialog
        open={duplicateSource != null}
        onOpenChange={(o) => {
          if (!o) {
            setDuplicateSource(null);
            setDuplicateTargetFormatId(0);
            setDuplicateTargetBrandId(0);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar receta</DialogTitle>
          </DialogHeader>
          {duplicateSource && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-slate-600">
                Se copiarán <strong>{duplicateSource.items.length}</strong> línea(s) desde{' '}
                <span className="font-mono">{duplicateSource.format_code}</span> a un formato que aún no tenga receta.
              </p>
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-600">Formato destino</Label>
                <select
                  className={filterSelectClass}
                  value={duplicateTargetFormatId}
                  onChange={(e) => setDuplicateTargetFormatId(Number(e.target.value))}
                >
                  {activeFormats.length === 0 ? (
                    <option value={0}>Sin formatos activos</option>
                  ) : (
                    activeFormats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.format_code}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-600">Marca destino</Label>
                <select
                  className={filterSelectClass}
                  value={duplicateTargetBrandId}
                  onChange={(e) => setDuplicateTargetBrandId(Number(e.target.value) || 0)}
                >
                  <option value={0}>Genérica (sin marca)</option>
                  {activeBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {duplicateTargetFormatId > 0 && hasRecipeCombo(duplicateTargetFormatId, duplicateTargetBrandId) ? (
                <p className="text-xs text-rose-700">Ya existe receta para ese formato y marca destino.</p>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setDuplicateSource(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={
                    duplicateMut.isPending ||
                    !duplicateTargetFormatId ||
                    activeFormats.length === 0 ||
                    hasRecipeCombo(duplicateTargetFormatId, duplicateTargetBrandId)
                  }
                  onClick={() => {
                    if (!duplicateSource || !duplicateTargetFormatId) return;
                    duplicateMut.mutate({
                      source: duplicateSource,
                      presentation_format_id: duplicateTargetFormatId,
                      ...(duplicateTargetBrandId > 0 ? { brand_id: duplicateTargetBrandId } : {}),
                    });
                  }}
                >
                  {duplicateMut.isPending ? 'Copiando…' : 'Duplicar'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
