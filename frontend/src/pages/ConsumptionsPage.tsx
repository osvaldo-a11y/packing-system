import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PtTagApi } from './PtTagsPage';
import type { RecipeApi } from './RecipesPage';

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

const createSchema = z.object({
  tarja_id: z.coerce.number().int().positive(),
  dispatch_tag_item_id: z.string().optional(),
  recipe_id: z.coerce.number().int().positive(),
  pallet_count: z.coerce.number().int().min(1),
  boxes_count: z.coerce.number().int().min(0),
  tape_linear_meters: z.coerce.number().min(0),
  corner_boards_qty: z.coerce.number().int().min(0),
  labels_qty: z.coerce.number().int().min(0),
});

type CreateForm = z.infer<typeof createSchema>;

function fetchConsumptions() {
  return apiJson<ConsumptionRow[]>('/api/packaging/consumptions');
}

function fetchRecipes() {
  return apiJson<RecipeApi[]>('/api/packaging/recipes');
}

function fetchTags() {
  return apiJson<PtTagApi[]>('/api/pt-tags');
}

export function ConsumptionsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: rows, isPending, isError, error } = useQuery({
    queryKey: ['packaging', 'consumptions'],
    queryFn: fetchConsumptions,
  });

  const { data: recipes } = useQuery({ queryKey: ['packaging', 'recipes'], queryFn: fetchRecipes });
  const { data: tags } = useQuery({ queryKey: ['pt-tags'], queryFn: fetchTags });

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      tarja_id: 0,
      dispatch_tag_item_id: '',
      recipe_id: 0,
      pallet_count: 1,
      boxes_count: 0,
      tape_linear_meters: 0,
      corner_boards_qty: 0,
      labels_qty: 0,
    },
  });

  const createMut = useMutation({
    mutationFn: (body: CreateForm) => {
      const payload: Record<string, number> = {
        tarja_id: body.tarja_id,
        recipe_id: body.recipe_id,
        pallet_count: body.pallet_count,
        boxes_count: body.boxes_count,
        tape_linear_meters: body.tape_linear_meters,
        corner_boards_qty: body.corner_boards_qty,
        labels_qty: body.labels_qty,
      };
      const raw = body.dispatch_tag_item_id?.trim();
      if (raw) {
        const id = Number.parseInt(raw, 10);
        if (!Number.isFinite(id) || id < 1) {
          return Promise.reject(new Error('ID de ítem de despacho inválido'));
        }
        payload.dispatch_tag_item_id = id;
      }
      return apiJson('/api/packaging/consumptions', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'consumptions'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      toast.success('Consumo registrado (stock actualizado)');
      setOpen(false);
      form.reset({
        tarja_id: 0,
        dispatch_tag_item_id: '',
        recipe_id: 0,
        pallet_count: 1,
        boxes_count: 0,
        tape_linear_meters: 0,
        corner_boards_qty: 0,
        labels_qty: 0,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailQuery = useQuery({
    queryKey: ['packaging', 'consumption', detailId],
    queryFn: () => apiJson<unknown>(`/api/packaging/consumptions/${detailId}`),
    enabled: detailId != null,
  });

  const sortedRecipes = (recipes ?? []).filter((r) => r.activo).sort((a, b) => a.format_code.localeCompare(b.format_code));
  const sortedTags = (tags ?? []).slice().sort((a, b) => b.id - a.id);
  const tagById = useMemo(() => new Map(sortedTags.map((t) => [t.id, t])), [sortedTags]);
  const recipeById = useMemo(() => new Map(sortedRecipes.map((r) => [r.id, r])), [sortedRecipes]);

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
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'Reintentá más tarde.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Consumos de empaque</h1>
          <p className="text-muted-foreground">
            Registro por unidad PT y receta; descuenta inventario de materiales y calcula costo total.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Nuevo consumo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar consumo</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3 py-2">
              <div className="grid gap-2">
                <Label>Unidad PT</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register('tarja_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {sortedTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tag_code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Receta</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register('recipe_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {sortedRecipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.format_code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Ítem de despacho (ID, opcional)</Label>
                <Input type="text" inputMode="numeric" placeholder="Vacío si no aplica" {...form.register('dispatch_tag_item_id')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Pallets</Label>
                  <Input type="number" min={1} {...form.register('pallet_count')} />
                </div>
                <div className="grid gap-2">
                  <Label>Cajas</Label>
                  <Input type="number" min={0} {...form.register('boxes_count')} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Cinta (metros lineales)</Label>
                <Input type="number" step="0.001" min={0} {...form.register('tape_linear_meters')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Corner boards</Label>
                  <Input type="number" min={0} {...form.register('corner_boards_qty')} />
                </div>
                <div className="grid gap-2">
                  <Label>Etiquetas</Label>
                  <Input type="number" min={0} {...form.register('labels_qty')} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Registrando…' : 'Registrar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historial reciente</CardTitle>
          <CardDescription>Últimos 200 consumos.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Unidad PT</TableHead>
                <TableHead>Receta</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-muted-foreground">{r.id}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{tagById.get(r.tarja_id)?.tag_code ?? r.tarja_id}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{recipeById.get(r.recipe_id)?.format_code ?? r.recipe_id}</span>
                  </TableCell>
                  <TableCell>{r.material_cost_total}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('es')}
                  </TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => setDetailId(r.id)}>
                      <Eye className="h-4 w-4" />
                      Detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Consumo #{detailId}</DialogTitle>
          </DialogHeader>
          {detailQuery.isPending && <Skeleton className="h-40 w-full" />}
          {detailQuery.data != null && (
            <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
              {JSON.stringify(detailQuery.data, null, 2)}
            </pre>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
