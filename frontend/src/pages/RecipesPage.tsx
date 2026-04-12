import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { contentCard } from '@/lib/page-ui';
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

const createRecipeSchema = z.object({
  presentation_format_id: z.coerce.number().int().positive('Seleccioná un formato válido'),
  descripcion: z.string().optional(),
});

const addItemSchema = z
  .object({
    material_id: z.coerce.number().int(),
    qty_per_unit: z.coerce.number().min(0.0001),
    cost_type: z.enum(['directo', 'tripaje']),
    base_unidad: z.enum(['box', 'pallet']),
  })
  .refine((d) => d.material_id > 0, { message: 'Elegí un material', path: ['material_id'] })
  .refine((d) => !(d.cost_type === 'directo' && d.base_unidad === 'pallet'), {
    message: 'Combinación inválida: directo + pallet',
    path: ['cost_type'],
  });

type CreateRecipeForm = z.infer<typeof createRecipeSchema>;
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

export function RecipesPage() {
  const { role } = useAuth();
  const canReset = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [addLineRecipeId, setAddLineRecipeId] = useState<number | null>(null);
  const [editLineTarget, setEditLineTarget] = useState<{ recipeId: number; item: RecipeItemApi } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

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

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const s = search.trim().toLowerCase();
    if (!s) return recipes;
    return recipes.filter(
      (r) =>
        r.format_code.toLowerCase().includes(s) ||
        (r.descripcion ?? '').toLowerCase().includes(s),
    );
  }, [recipes, search]);

  const recipeForm = useForm<CreateRecipeForm>({
    resolver: zodResolver(createRecipeSchema),
    defaultValues: { presentation_format_id: 0, descripcion: '' },
  });

  const itemForm = useForm<AddItemForm>({
    resolver: zodResolver(addItemSchema),
    defaultValues: { material_id: 0, qty_per_unit: 1, cost_type: 'directo', base_unidad: 'box' },
  });

  const createRecipeMut = useMutation({
    mutationFn: (body: CreateRecipeForm) =>
      apiJson('/api/packaging/recipes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Receta creada');
      setRecipeOpen(false);
      recipeForm.reset({ presentation_format_id: 0, descripcion: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      itemForm.reset({ material_id: 0, qty_per_unit: 1, cost_type: 'directo', base_unidad: 'box' });
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
      itemForm.reset({ material_id: 0, qty_per_unit: 1, cost_type: 'directo', base_unidad: 'box' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRecipeMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/packaging/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Receta eliminada');
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

  const activeMaterials = useMemo(
    () => (materials ?? []).filter((m) => m.activo).sort((a, b) => a.nombre_material.localeCompare(b.nombre_material)),
    [materials],
  );

  const activeFormats = useMemo(
    () => (formats ?? []).filter((f) => f.activo !== false).sort((a, b) => a.format_code.localeCompare(b.format_code)),
    [formats],
  );

  function toggleCollapse(id: number) {
    setCollapsed((prev) => ({ ...prev, [id]: !((prev[id] ?? true)) }));
  }

  function typeLabel(v: 'directo' | 'tripaje') {
    return v === 'tripaje' ? 'Tripaje' : 'Directo';
  }

  function baseLabel(v: 'box' | 'pallet') {
    return v === 'pallet' ? 'Pallet' : 'Caja';
  }

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Error al cargar recetas</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'Reintentá más tarde.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Recetas de empaque</h1>
          <p className="text-muted-foreground">
            Recetas ligadas a formatos reales del maestro. Líneas por material con cantidad, tipo de costo y base (caja/pallet).
          </p>
        </div>
        <Dialog open={recipeOpen} onOpenChange={setRecipeOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Nueva receta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nueva receta</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={recipeForm.handleSubmit((v) => createRecipeMut.mutate(v))}
              className="grid gap-4 py-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="presentation_format_id">Formato</Label>
                <select
                  id="presentation_format_id"
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...recipeForm.register('presentation_format_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir formato…</option>
                  {activeFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.format_code}
                      {f.max_boxes_per_pallet != null ? ` · ${f.max_boxes_per_pallet} cajas/pallet` : ''}
                    </option>
                  ))}
                </select>
                {recipeForm.formState.errors.presentation_format_id && (
                  <p className="text-sm text-destructive">{recipeForm.formState.errors.presentation_format_id.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="descripcion">Descripción (opcional)</Label>
                <Input id="descripcion" {...recipeForm.register('descripcion')} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRecipeOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createRecipeMut.isPending}>
                  {createRecipeMut.isPending ? 'Creando…' : 'Crear'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {canReset ? (
        <Card className={cn(contentCard, 'border-dashed border-amber-200/60 bg-amber-50/30')}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Limpieza total de recetas: elimina recetas y líneas actuales para reiniciar base.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={resetRecipesMut.isPending}
              onClick={() => {
                if (!confirm('¿Reiniciar TODAS las recetas? Esta acción elimina recetas y líneas actuales.')) return;
                resetRecipesMut.mutate();
              }}
            >
              Reiniciar recetas
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="max-w-md">
        <Label htmlFor="search-recipes" className="sr-only">
          Buscar recetas
        </Label>
        <Input
          id="search-recipes"
          placeholder="Buscar por código o descripción…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/50')}>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No hay recetas que coincidan. Creá una con &quot;Nueva receta&quot;.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((recipe) => {
            const isCollapsed = collapsed[recipe.id] ?? true;
            return (
              <Card key={recipe.id} className="overflow-hidden">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{recipe.format_code}</CardTitle>
                      <Badge variant={recipe.activo ? 'default' : 'secondary'}>
                        {recipe.activo ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <Badge variant="outline">{recipe.items.length} línea(s)</Badge>
                    </div>
                    {recipe.descripcion ? (
                      <CardDescription className="mt-1">{recipe.descripcion}</CardDescription>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setAddLineRecipeId(recipe.id)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Línea
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={deleteRecipeMut.isPending}
                      onClick={() => {
                        if (!confirm(`¿Eliminar receta ${recipe.format_code}?`)) return;
                        deleteRecipeMut.mutate(recipe.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleCollapse(recipe.id)}
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? 'Expandir detalle' : 'Contraer detalle'}
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent className="pt-0">
                    {recipe.items.length === 0 ? (
                      <p className="py-4 text-sm text-muted-foreground">
                        Sin materiales en esta receta. Usá &quot;Línea&quot; para añadir consumos por caja o pallet.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Material</TableHead>
                            <TableHead>Cantidad</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Base</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recipe.items.map((it) => (
                            <TableRow key={it.id}>
                              <TableCell>
                                {it.material?.nombre_material ?? `ID ${it.material_id}`}
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({it.material?.unidad_medida ?? '—'})
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-sm">{it.qty_per_unit}</TableCell>
                              <TableCell>
                                <Badge variant={it.cost_type === 'tripaje' ? 'secondary' : 'outline'}>{typeLabel(it.cost_type)}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{baseLabel(it.base_unidad)}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    itemForm.reset({
                                      material_id: it.material_id,
                                      qty_per_unit: Number(it.qty_per_unit),
                                      cost_type: it.cost_type ?? 'directo',
                                      base_unidad: it.base_unidad ?? 'box',
                                    });
                                    setEditLineTarget({ recipeId: recipe.id, item: it });
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={addLineRecipeId != null}
        onOpenChange={(o) => {
          if (!o) setAddLineRecipeId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir línea a la receta</DialogTitle>
          </DialogHeader>
          {addLineRecipeId != null && (
            <form
              onSubmit={itemForm.handleSubmit((body) =>
                addItemMut.mutate({ recipeId: addLineRecipeId, body }),
              )}
              className="grid gap-4 py-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="material_id">Material</Label>
                <select
                  id="material_id"
                  className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  {...itemForm.register('material_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_material} ({m.unidad_medida}){m.material_category?.nombre ? ` · ${m.material_category.nombre}` : ''}
                    </option>
                  ))}
                </select>
                {itemForm.formState.errors.material_id && (
                  <p className="text-sm text-destructive">{itemForm.formState.errors.material_id.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="qty_per_unit">Cantidad por unidad base</Label>
                <Input id="qty_per_unit" type="number" step="0.0001" min={0.0001} {...itemForm.register('qty_per_unit')} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost_type">Tipo de costo</Label>
                <select
                  id="cost_type"
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...itemForm.register('cost_type')}
                >
                  <option value="directo">Directo</option>
                  <option value="tripaje">Tripaje</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base_unidad">Unidad base</Label>
                <select
                  id="base_unidad"
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...itemForm.register('base_unidad', {
                    onChange: (e) => {
                      const v = e.target.value as 'box' | 'pallet';
                      itemForm.setValue('cost_type', v === 'box' ? 'directo' : 'tripaje');
                    },
                  })}
                >
                  <option value="box">Caja (box)</option>
                  <option value="pallet">Pallet</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Caja: cantidad directa por caja. Pallet: cantidad del pallet completo (se pondera por cajas/pallet del formato).
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddLineRecipeId(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={addItemMut.isPending}>
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
            <DialogTitle>Editar línea de receta</DialogTitle>
          </DialogHeader>
          {editLineTarget && (
            <form
              onSubmit={itemForm.handleSubmit((body) =>
                editItemMut.mutate({ recipeId: editLineTarget.recipeId, itemId: editLineTarget.item.id, body }),
              )}
              className="grid gap-4 py-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="edit_material_id">Material</Label>
                <select
                  id="edit_material_id"
                  className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  {...itemForm.register('material_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_material} ({m.unidad_medida}){m.material_category?.nombre ? ` · ${m.material_category.nombre}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_qty_per_unit">Cantidad</Label>
                <Input
                  id="edit_qty_per_unit"
                  type="number"
                  step="0.0001"
                  min={0.0001}
                  {...itemForm.register('qty_per_unit')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_cost_type">Tipo de costo</Label>
                <select
                  id="edit_cost_type"
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...itemForm.register('cost_type')}
                >
                  <option value="directo">Directo</option>
                  <option value="tripaje">Tripaje</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_base_unidad">Base de cálculo</Label>
                <select
                  id="edit_base_unidad"
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...itemForm.register('base_unidad', {
                    onChange: (e) => {
                      const v = e.target.value as 'box' | 'pallet';
                      itemForm.setValue('cost_type', v === 'box' ? 'directo' : 'tripaje');
                    },
                  })}
                >
                  <option value="box">Caja (box)</option>
                  <option value="pallet">Pallet</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditLineTarget(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editItemMut.isPending}>
                  {editItemMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
