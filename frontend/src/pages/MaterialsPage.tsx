import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import { DataTable } from '@/components/data/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type PackagingMaterialRow = {
  id: number;
  nombre_material: string;
  material_category_id: number;
  material_category?: { id: number; codigo: string; nombre: string };
  descripcion?: string;
  unidad_medida: string;
  costo_unitario: string;
  cantidad_disponible: string;
  presentation_format_id?: number | null;
  clamshell_units_per_box?: string | null;
  activo: boolean;
};

type FormatPick = { id: number; format_code: string };

const createMaterialSchema = z.object({
  nombre_material: z.string().min(1, 'Requerido'),
  material_category_id: z.coerce.number().int().positive(),
  descripcion: z.string().optional(),
  unidad_medida: z.string().min(1, 'Requerido').max(20),
  costo_unitario: z.coerce.number().min(0),
  cantidad_disponible: z.coerce.number().min(0),
  presentation_format_id: z.coerce.number().int().min(0).optional(),
  clamshell_units_per_box: z.coerce.number().min(0).optional(),
});

type CreateMaterialForm = z.infer<typeof createMaterialSchema>;

type MaterialMovementRow = {
  id: number;
  material_id: number;
  quantity_delta: string;
  ref_type: string | null;
  ref_id: number | null;
  nota: string | null;
  created_at: string;
};

function fetchMaterials() {
  return apiJson<PackagingMaterialRow[]>('/api/packaging/materials');
}

export function MaterialsPage() {
  const { role } = useAuth();
  const canDelete = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kardexOpen, setKardexOpen] = useState(false);
  const [kardexMaterialId, setKardexMaterialId] = useState(0);
  const [moveDelta, setMoveDelta] = useState('');
  const [moveNota, setMoveNota] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['packaging', 'materials'],
    queryFn: fetchMaterials,
  });

  const { data: formatList } = useQuery({
    queryKey: ['masters', 'presentation-formats'],
    queryFn: () => apiJson<FormatPick[]>('/api/masters/presentation-formats'),
  });

  const { data: materialCategories } = useQuery({
    queryKey: ['masters', 'material-categories'],
    queryFn: () => apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/material-categories'),
  });

  const { data: movements } = useQuery({
    queryKey: ['packaging', 'movements', kardexMaterialId],
    queryFn: () => apiJson<MaterialMovementRow[]>(`/api/packaging/materials/${kardexMaterialId}/movements`),
    enabled: kardexMaterialId > 0 && kardexOpen,
  });

  const form = useForm<CreateMaterialForm>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      nombre_material: '',
      material_category_id: 0,
      descripcion: '',
      unidad_medida: 'kg',
      costo_unitario: 0,
      cantidad_disponible: 0,
      presentation_format_id: 0,
      clamshell_units_per_box: undefined,
    },
  });

  const materialCategoryIdW = useWatch({ control: form.control, name: 'material_category_id' });
  const selectedCatCodigo = materialCategories?.find((c) => c.id === materialCategoryIdW)?.codigo;

  const mutation = useMutation({
    mutationFn: (body: CreateMaterialForm) => {
      const nameNorm = body.nombre_material.trim().toLowerCase();
      const exists = (data ?? []).some((m) => m.activo && m.nombre_material.trim().toLowerCase() === nameNorm);
      if (exists) {
        throw new Error('Ya existe un material activo con ese nombre.');
      }
      const catCodigo = materialCategories?.find((c) => c.id === body.material_category_id)?.codigo;
      return apiJson<PackagingMaterialRow>('/api/packaging/materials', {
        method: 'POST',
        body: JSON.stringify({
          nombre_material: body.nombre_material,
          material_category_id: body.material_category_id,
          descripcion: body.descripcion,
          unidad_medida: body.unidad_medida,
          costo_unitario: body.costo_unitario,
          cantidad_disponible: body.cantidad_disponible,
          presentation_format_id:
            catCodigo === 'clamshell' && body.presentation_format_id && body.presentation_format_id > 0
              ? body.presentation_format_id
              : undefined,
          clamshell_units_per_box:
            catCodigo === 'clamshell' &&
            body.clamshell_units_per_box != null &&
            body.clamshell_units_per_box > 0
              ? body.clamshell_units_per_box
              : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      toast.success('Material creado');
      setOpen(false);
      form.reset({
        nombre_material: '',
        material_category_id: 0,
        descripcion: '',
        unidad_medida: 'kg',
        costo_unitario: 0,
        cantidad_disponible: 0,
        presentation_format_id: 0,
        clamshell_units_per_box: undefined,
      });
    },
    onError: (e: Error) => {
      toast.error(e.message || 'No se pudo crear');
    },
  });

  const movementMut = useMutation({
    mutationFn: () => {
      const delta = Number(moveDelta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('Indicá un delta distinto de cero');
      return apiJson<PackagingMaterialRow>(`/api/packaging/materials/${kardexMaterialId}/movements`, {
        method: 'POST',
        body: JSON.stringify({ quantity_delta: delta, nota: moveNota || undefined, ref_type: 'manual' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'movements', kardexMaterialId] });
      toast.success('Movimiento registrado');
      setMoveDelta('');
      setMoveNota('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/packaging/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      toast.success('Material eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeRows = useMemo(() => (data ?? []).filter((m) => m.activo), [data]);
  const duplicates = useMemo(() => {
    const byName = new Map<string, PackagingMaterialRow[]>();
    for (const r of activeRows) {
      const k = r.nombre_material.trim().toLowerCase();
      const arr = byName.get(k) ?? [];
      arr.push(r);
      byName.set(k, arr);
    }
    return [...byName.entries()]
      .filter(([, arr]) => arr.length > 1)
      .map(([name, arr]) => ({ name, rows: arr.sort((a, b) => a.id - b.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeRows]);

  const formatCodeSet = useMemo(
    () => new Set((formatList ?? []).map((f) => f.format_code.trim().toLowerCase())),
    [formatList],
  );
  const formatLikeMaterials = useMemo(
    () => activeRows.filter((m) => formatCodeSet.has(m.nombre_material.trim().toLowerCase())).sort((a, b) => a.id - b.id),
    [activeRows, formatCodeSet],
  );

  const columns = useMemo<ColumnDef<PackagingMaterialRow>[]>(
    () => [
      { accessorKey: 'id', header: 'ID', cell: ({ getValue }) => <span className="font-mono text-muted-foreground">{getValue() as number}</span> },
      { accessorKey: 'nombre_material', header: 'Material' },
      {
        id: 'cat',
        header: 'Categoría',
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.material_category?.nombre ?? row.original.material_category_id}</Badge>
        ),
      },
      { accessorKey: 'unidad_medida', header: 'Unidad' },
      { accessorKey: 'costo_unitario', header: 'Costo unit.' },
      { accessorKey: 'cantidad_disponible', header: 'Stock' },
      {
        accessorKey: 'presentation_format_id',
        header: 'Fmt clamshell',
        cell: ({ row }) => {
          const id = row.original.presentation_format_id;
          if (id == null) return '—';
          const fc = formatList?.find((f) => f.id === id)?.format_code;
          return fc ? <span className="font-mono text-xs">{fc}</span> : <span className="font-mono text-xs">{id}</span>;
        },
      },
      {
        accessorKey: 'clamshell_units_per_box',
        header: 'Clam/caja',
        cell: ({ getValue }) => (getValue() != null && getValue() !== '' ? String(getValue()) : '—'),
      },
      {
        accessorKey: 'activo',
        header: 'Estado',
        cell: ({ getValue }) => (
          <Badge variant={getValue() ? 'default' : 'secondary'}>{getValue() ? 'Activo' : 'Inactivo'}</Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (!confirm(`¿Eliminar material "${row.original.nombre_material}" (ID ${row.original.id})?`)) return;
                deleteMut.mutate(row.original.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null,
      },
    ],
    [canDelete, deleteMut, formatList],
  );

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Error al cargar</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'Intenta de nuevo.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Materiales de empaque</h1>
          <p className="text-muted-foreground">Listado con búsqueda y paginación; alta de nuevos materiales.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="shrink-0" type="button" onClick={() => setKardexOpen(true)}>
            Kardex / movimiento
          </Button>
          <Dialog
            open={kardexOpen}
            onOpenChange={(o) => {
              setKardexOpen(o);
              if (!o) setKardexMaterialId(0);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Movimientos de inventario</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Material</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
                    value={kardexMaterialId || ''}
                    onChange={(e) => setKardexMaterialId(Number(e.target.value) || 0)}
                  >
                    <option value="">Elegir…</option>
                    {(data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre_material} · stock {m.cantidad_disponible}
                      </option>
                    ))}
                  </select>
                </div>
                {kardexMaterialId > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>Delta (+ entrada / − salida)</Label>
                        <Input value={moveDelta} onChange={(e) => setMoveDelta(e.target.value)} placeholder="ej. 500 o -100" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Nota</Label>
                        <Input value={moveNota} onChange={(e) => setMoveNota(e.target.value)} placeholder="Opcional" />
                      </div>
                    </div>
                    <Button type="button" disabled={movementMut.isPending} onClick={() => movementMut.mutate()}>
                      {movementMut.isPending ? 'Registrando…' : 'Registrar movimiento'}
                    </Button>
                    <div className="max-h-56 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Δ</TableHead>
                            <TableHead>Ref.</TableHead>
                            <TableHead>Nota</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(movements ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Sin movimientos
                              </TableCell>
                            </TableRow>
                          ) : (
                            (movements ?? []).map((mv) => (
                              <TableRow key={mv.id}>
                                <TableCell className="whitespace-nowrap text-xs">
                                  {new Date(mv.created_at).toLocaleString('es')}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{mv.quantity_delta}</TableCell>
                                <TableCell className="text-xs">
                                  {mv.ref_type ?? '—'}
                                  {mv.ref_id != null ? ` #${mv.ref_id}` : ''}
                                </TableCell>
                                <TableCell className="max-w-[140px] truncate text-xs">{mv.nota ?? '—'}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                Nuevo material
              </Button>
            </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo material</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((vals) => mutation.mutate(vals))}
              className="grid gap-4 py-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="nombre_material">Nombre</Label>
                <Input id="nombre_material" {...form.register('nombre_material')} />
                {form.formState.errors.nombre_material && (
                  <p className="text-sm text-destructive">{form.formState.errors.nombre_material.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="material_category_id">Categoría</Label>
                <select
                  id="material_category_id"
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register('material_category_id', { valueAsNumber: true })}
                >
                  <option value={0}>Elegir…</option>
                  {(materialCategories ?? [])
                    .filter((c) => c.activo !== false)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.codigo})
                      </option>
                    ))}
                </select>
              </div>
              {selectedCatCodigo === 'clamshell' ? (
                <>
                  <div className="grid gap-2">
                    <Label>Formato de presentación asociado</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
                      {...form.register('presentation_format_id', { valueAsNumber: true })}
                    >
                      <option value={0}>—</option>
                      {(formatList ?? [])
                        .filter((f) => (f as { activo?: boolean }).activo !== false)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.format_code}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Unidades de este clamshell por caja (opcional)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      placeholder="p. ej. 1"
                      {...form.register('clamshell_units_per_box', { valueAsNumber: true })}
                    />
                  </div>
                </>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="descripcion">Descripción (opcional)</Label>
                <Input id="descripcion" {...form.register('descripcion')} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unidad_medida">Unidad de medida</Label>
                <Input id="unidad_medida" {...form.register('unidad_medida')} placeholder="kg, caja, m…" />
                {form.formState.errors.unidad_medida && (
                  <p className="text-sm text-destructive">{form.formState.errors.unidad_medida.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="costo_unitario">Costo unitario</Label>
                  <Input id="costo_unitario" type="number" step="0.0001" min={0} {...form.register('costo_unitario')} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cantidad_disponible">Cantidad disponible</Label>
                  <Input id="cantidad_disponible" type="number" step="0.001" min={0} {...form.register('cantidad_disponible')} />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Guardando…' : 'Crear'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inventario</CardTitle>
          <CardDescription>Filtra por cualquier columna visible usando el buscador.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={data ?? []} searchPlaceholder="Buscar material, categoría…" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Limpieza sugerida</CardTitle>
          <CardDescription>
            Duplicados por nombre y materiales cuyo nombre coincide con un formato (posible confusión formato vs insumo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Duplicados por nombre</p>
            {duplicates.length === 0 ? (
              <p className="text-muted-foreground">Sin duplicados activos detectados.</p>
            ) : (
              <div className="space-y-2">
                {duplicates.map((g) => (
                  <div key={g.name} className="rounded-md border border-border p-2">
                    <p className="font-medium">{g.rows[0].nombre_material}</p>
                    <p className="text-xs text-muted-foreground">Conservá uno y eliminá el resto.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {g.rows.map((r, idx) => (
                        <Button
                          key={r.id}
                          type="button"
                          size="sm"
                          variant={idx === 0 ? 'outline' : 'destructive'}
                          disabled={!canDelete || deleteMut.isPending || idx === 0}
                          title={idx === 0 ? 'Sugerido conservar (ID más antiguo)' : 'Eliminar duplicado'}
                          onClick={() => deleteMut.mutate(r.id)}
                        >
                          {idx === 0 ? `Conservar ID ${r.id}` : `Eliminar ID ${r.id}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="font-medium">Nombres que parecen formato</p>
            {formatLikeMaterials.length === 0 ? (
              <p className="text-muted-foreground">Sin casos detectados.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {formatLikeMaterials.map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={!canDelete || deleteMut.isPending}
                    onClick={() => deleteMut.mutate(m.id)}
                  >
                    Eliminar {m.nombre_material} (ID {m.id})
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
