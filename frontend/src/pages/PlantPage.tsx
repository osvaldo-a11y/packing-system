import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { contentCard, errorStateCard, pageSubtitle, pageTitle } from '@/lib/page-ui';

type PlantRow = {
  id: number;
  yield_tolerance_percent: string;
  min_yield_percent: string;
  max_merma_percent: string;
  updated_at?: string;
};

const plantSchema = z.object({
  yield_tolerance_percent: z.coerce.number().min(0).max(100),
  min_yield_percent: z.coerce.number().min(0).max(100),
  max_merma_percent: z.coerce.number().min(0).max(100),
});

type PlantForm = z.infer<typeof plantSchema>;

function fetchPlant() {
  return apiJson<PlantRow>('/api/plant-settings');
}

export function PlantPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin';

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['plant-settings'],
    queryFn: fetchPlant,
  });

  const form = useForm<PlantForm>({
    resolver: zodResolver(plantSchema),
    defaultValues: {
      yield_tolerance_percent: 5,
      min_yield_percent: 70,
      max_merma_percent: 15,
    },
  });

  useEffect(() => {
    if (!data) return;
    form.reset({
      yield_tolerance_percent: Number(data.yield_tolerance_percent),
      min_yield_percent: Number(data.min_yield_percent),
      max_merma_percent: Number(data.max_merma_percent),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar datos del servidor
  }, [data?.id, data?.yield_tolerance_percent, data?.min_yield_percent, data?.max_merma_percent]);

  const mutation = useMutation({
    mutationFn: (body: PlantForm) =>
      apiJson<PlantRow>('/api/plant-settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (row) => {
      queryClient.setQueryData(['plant-settings'], row);
      toast.success('Parámetros guardados');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar'),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className={errorStateCard}>
        <CardHeader>
          <CardTitle>No se pudieron cargar los datos</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'Reintentá más tarde.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className={pageTitle}>Parámetros de planta</h1>
        <p className={pageSubtitle}>Lectura para todos los roles; guardar solo administradores.</p>
      </div>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle>Ajustes</CardTitle>
          <CardDescription>
            Última actualización:{' '}
            {data?.updated_at ? new Date(data.updated_at).toLocaleString('es') : '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((vals) => isAdmin && mutation.mutate(vals))} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="yield_tolerance_percent">Tolerancia rendimiento (%)</Label>
              <Input
                id="yield_tolerance_percent"
                type="number"
                step="0.01"
                readOnly={!isAdmin}
                className={!isAdmin ? 'opacity-80' : undefined}
                {...form.register('yield_tolerance_percent')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="min_yield_percent">Rendimiento mínimo aceptable (%)</Label>
              <Input
                id="min_yield_percent"
                type="number"
                step="0.01"
                readOnly={!isAdmin}
                className={!isAdmin ? 'opacity-80' : undefined}
                {...form.register('min_yield_percent')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max_merma_percent">Merma máxima aceptable (%)</Label>
              <Input
                id="max_merma_percent"
                type="number"
                step="0.01"
                readOnly={!isAdmin}
                className={!isAdmin ? 'opacity-80' : undefined}
                {...form.register('max_merma_percent')}
              />
            </div>
            {isAdmin ? (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Iniciá sesión como admin para editar estos valores.</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
