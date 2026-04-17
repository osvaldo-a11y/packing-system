import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { filterInputClass, filterSelectClass, pageSubtitle, pageTitle, tableShell } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

const MastersRowFilterContext = createContext<{ filter: string; setFilter: (v: string) => void }>({
  filter: '',
  setFilter: () => {},
});

function useMastersRowFilter() {
  return useContext(MastersRowFilterContext);
}

function filterRows<T>(list: T[], q: string, textOf: (r: T) => string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((r) => textOf(r).toLowerCase().includes(s));
}

/** Código único tipo `BASE-2`, `BASE-3`… respetando max 40 caracteres. */
function uniqueDuplicateCode(original: string, existingLower: Set<string>): string {
  for (let n = 2; n < 10000; n++) {
    const suffix = `-${n}`;
    const maxBase = Math.max(1, 40 - suffix.length);
    const base = original.length <= maxBase ? original : original.slice(0, maxBase);
    const candidate = `${base}${suffix}`;
    if (!existingLower.has(candidate.toLowerCase())) return candidate;
  }
  return `${original.slice(0, 24)}-${Date.now()}`.slice(0, 40);
}

function buildMasterDeleteEndpoint(basePath: string, id: number, force?: boolean): string {
  return force ? `${basePath}/${id}/force` : `${basePath}/${id}`;
}

function canOfferForceDelete(errorMessage: string): boolean {
  const msg = String(errorMessage || '').toLowerCase();
  return msg.includes('en uso') || msg.includes('no se puede borrar');
}

type InlineCodigoNombreRow = { id: number; codigo: string; nombre: string; activo: boolean };

function InlineCodigoNombreCatalogRow({
  row,
  canWrite,
  onPatch,
  onDuplicate,
  onSetActivo,
  onDelete,
  patchPending,
  duplicatePending,
  activoPending,
  deletePending,
}: {
  row: InlineCodigoNombreRow;
  canWrite: boolean;
  onPatch: (id: number, body: { codigo?: string; nombre?: string }) => void;
  onDuplicate: (row: InlineCodigoNombreRow) => void;
  onSetActivo: (id: number, activo: boolean) => void;
  onDelete: (row: InlineCodigoNombreRow) => void;
  patchPending: boolean;
  duplicatePending: boolean;
  activoPending: boolean;
  deletePending: boolean;
}) {
  const [codigo, setCodigo] = useState(row.codigo);
  const [nombre, setNombre] = useState(row.nombre);
  useEffect(() => {
    setCodigo(row.codigo);
    setNombre(row.nombre);
  }, [row.codigo, row.nombre, row.id]);

  const commitText = () => {
    const c = codigo.trim();
    const n = nombre.trim();
    if (!c || !n) {
      toast.error('Código y nombre son obligatorios');
      setCodigo(row.codigo);
      setNombre(row.nombre);
      return;
    }
    const body: { codigo?: string; nombre?: string } = {};
    if (c !== row.codigo) body.codigo = c;
    if (n !== row.nombre) body.nombre = n;
    if (Object.keys(body).length === 0) return;
    onPatch(row.id, body);
  };

  const rowBusy = patchPending || duplicatePending || deletePending;

  return (
    <TableRow>
      <TableCell className="min-w-[7rem]">
        {canWrite ? (
          <Input
            className="h-9 font-mono text-sm"
            value={codigo}
            disabled={rowBusy}
            onChange={(e) => setCodigo(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            autoComplete="off"
          />
        ) : (
          <span className="font-mono text-sm">{row.codigo}</span>
        )}
      </TableCell>
      <TableCell className="min-w-[10rem]">
        {canWrite ? (
          <Input
            className="h-9 text-sm"
            value={nombre}
            disabled={rowBusy}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            autoComplete="off"
          />
        ) : (
          row.nombre
        )}
      </TableCell>
      <TableCell className="w-[9.5rem]">
        {canWrite ? (
          <select
            className={cn(filterSelectClass, 'h-9')}
            value={row.activo ? '1' : '0'}
            disabled={rowBusy || activoPending}
            onChange={(e) => {
              const next = e.target.value === '1';
              if (next !== row.activo) onSetActivo(row.id, next);
            }}
            aria-label="Estado"
          >
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        ) : (
          <Badge variant={row.activo ? 'default' : 'secondary'}>{row.activo ? 'Activo' : 'Inactivo'}</Badge>
        )}
      </TableCell>
      {canWrite ? (
        <TableCell className="w-[1%] text-right">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              title="Borrar"
              disabled={rowBusy}
              onClick={() => onDelete(row)}
            >
              {deletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Duplicar fila"
              disabled={rowBusy || duplicatePending}
              onClick={() => onDuplicate(row)}
            >
              {duplicatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function InlineProducerRow({
  row,
  canWrite,
  onPatch,
  onDuplicate,
  onSetActivo,
  onDelete,
  patchPending,
  duplicatePending,
  activoPending,
  deletePending,
}: {
  row: ProducerRow;
  canWrite: boolean;
  onPatch: (id: number, body: { codigo?: string; nombre?: string }) => void;
  onDuplicate: (row: ProducerRow) => void;
  onSetActivo: (id: number, activo: boolean) => void;
  onDelete: (row: ProducerRow) => void;
  patchPending: boolean;
  duplicatePending: boolean;
  activoPending: boolean;
  deletePending: boolean;
}) {
  const [codigo, setCodigo] = useState(row.codigo ?? '');
  const [nombre, setNombre] = useState(row.nombre);
  useEffect(() => {
    setCodigo(row.codigo ?? '');
    setNombre(row.nombre);
  }, [row.codigo, row.nombre, row.id]);

  const commitText = () => {
    const c = codigo.trim();
    const n = nombre.trim();
    if (!n) {
      toast.error('El nombre es obligatorio');
      setCodigo(row.codigo ?? '');
      setNombre(row.nombre);
      return;
    }
    const newCodigo = c || undefined;
    const oldCodigo = row.codigo?.trim() || '';
    const body: { codigo?: string; nombre?: string } = {};
    if ((newCodigo ?? '') !== oldCodigo) body.codigo = newCodigo;
    if (n !== row.nombre) body.nombre = n;
    if (Object.keys(body).length === 0) return;
    onPatch(row.id, body);
  };

  const rowBusy = patchPending || duplicatePending || deletePending;

  return (
    <TableRow>
      <TableCell className="min-w-[7rem]">
        {canWrite ? (
          <Input
            className="h-9 font-mono text-sm"
            value={codigo}
            placeholder="—"
            disabled={rowBusy}
            onChange={(e) => setCodigo(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            autoComplete="off"
          />
        ) : (
          <span className="font-mono text-sm">{row.codigo ?? '—'}</span>
        )}
      </TableCell>
      <TableCell className="min-w-[10rem]">
        {canWrite ? (
          <Input
            className="h-9 text-sm"
            value={nombre}
            disabled={rowBusy}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            autoComplete="off"
          />
        ) : (
          row.nombre
        )}
      </TableCell>
      <TableCell className="w-[9.5rem]">
        {canWrite ? (
          <select
            className={cn(filterSelectClass, 'h-9')}
            value={row.activo ? '1' : '0'}
            disabled={rowBusy || activoPending}
            onChange={(e) => {
              const next = e.target.value === '1';
              if (next !== row.activo) onSetActivo(row.id, next);
            }}
            aria-label="Estado"
          >
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        ) : (
          <Badge variant={row.activo ? 'default' : 'secondary'}>{row.activo ? 'Activo' : 'Inactivo'}</Badge>
        )}
      </TableCell>
      {canWrite ? (
        <TableCell className="w-[1%] text-right">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              title="Borrar"
              disabled={rowBusy}
              onClick={() => onDelete(row)}
            >
              {deletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Duplicar fila"
              disabled={rowBusy || duplicatePending}
              onClick={() => onDuplicate(row)}
            >
              {duplicatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function MasterDeleteDialog({
  open,
  onOpenChange,
  title,
  label,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Borrar <strong className="text-foreground">{label}</strong>? Esta acción no se puede deshacer.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            Borrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MasterRowActions({
  canWrite,
  activo,
  onEdit,
  onDeleteClick,
  onReactivate,
  reactivatePending,
}: {
  canWrite: boolean;
  activo: boolean;
  onEdit: () => void;
  onDeleteClick: () => void;
  onReactivate: () => void;
  reactivatePending: boolean;
}) {
  if (!canWrite) return null;
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" size="sm" variant="outline" title="Editar" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      {activo ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          title="Borrar"
          onClick={onDeleteClick}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          title="Reactivar"
          onClick={onReactivate}
          disabled={reactivatePending}
        >
          Reactivar
        </Button>
      )}
    </div>
  );
}

type SpeciesRow = { id: number; codigo: string; nombre: string; activo: boolean };
type ProducerRow = { id: number; codigo: string | null; nombre: string; activo: boolean };
type VarietyRow = { id: number; species_id: number; codigo: string | null; nombre: string; activo: boolean; species?: { nombre: string } };
type QualityRow = { id: number; codigo: string; nombre: string; activo: boolean; purpose?: string };

type FormatRow = {
  id: number;
  format_code: string;
  species_id: number | null;
  descripcion: string | null;
  net_weight_lb_per_box?: string;
  max_boxes_per_pallet?: number | null;
  box_kind?: 'mano' | 'maquina' | null;
  clamshell_label_kind?: 'generica' | 'marca' | null;
  activo: boolean;
  species?: { nombre: string } | null;
};

const speciesSchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(120),
});

const producerSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(1).max(200),
});

const varietySchema = z.object({
  species_id: z.coerce.number().int().positive(),
  codigo: z.string().optional(),
  nombre: z.string().min(1).max(120),
});

const qualitySchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(120),
  purpose: z.enum(['exportacion', 'proceso', 'both']).optional(),
});

const qualityEditSchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(120),
  purpose: z.enum(['exportacion', 'proceso', 'both']),
});

const formatSchema = z.object({
  format_code: z.string().min(1).max(20),
  species_id_str: z.string().optional(),
  descripcion: z.string().optional(),
  net_weight_lb_per_box: z.coerce.number().positive(),
  max_boxes_per_pallet: z.preprocess((a) => {
    if (a === '' || a === undefined || a === null) return undefined;
    const n = Number(a);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
  }, z.number().int().optional()),
  box_kind: z.enum(['', 'mano', 'maquina']),
  clamshell_label_kind: z.enum(['', 'generica', 'marca']),
});

const containerSchema = z.object({
  tipo: z.string().min(1).max(80),
  capacidad: z.string().optional(),
  requiere_retorno: z.boolean().optional(),
});

const processMachineSchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(160),
  kind: z.enum(['single', 'double']),
});

const editProcessMachineSchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(160),
  kind: z.enum(['single', 'double']),
});

const brandSchema = z.object({
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(1).max(120),
  client_id: z.coerce.number().int().min(0),
});

const editBrandSchema = z.object({
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(1).max(120),
  client_id: z.coerce.number().int().min(0),
});

const processResultComponentSchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(120),
  sort_order: z.coerce.number().int().min(0),
});

const editProcessResultComponentSchema = z.object({
  codigo: z.string().min(1).max(32),
  nombre: z.string().min(1).max(120),
  sort_order: z.coerce.number().int().min(0),
});

type ProcessMachineRow = { id: number; codigo: string; nombre: string; kind: 'single' | 'double'; activo: boolean };
type ProcessResultComponentRow = { id: number; codigo: string; nombre: string; activo: boolean; sort_order: number };
type SpeciesProcessResultComponentRow = {
  id: number;
  codigo: string;
  nombre: string;
  sort_order: number;
  master_activo: boolean;
  activo: boolean;
};

type ClientMasterRow = {
  id: number;
  codigo: string;
  nombre: string;
  pais?: string | null;
  mercado_id?: number | null;
  mercado?: { id: number; codigo: string; nombre: string } | null;
  activo: boolean;
};
type BrandMasterRow = {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  client_id: number | null;
  client?: { nombre: string; codigo: string } | null;
};

type TabKey =
  | 'species'
  | 'producers'
  | 'varieties'
  | 'formats'
  | 'quality'
  | 'process_machines'
  | 'process_results'
  | 'brands'
  | 'clients'
  | 'mercados'
  | 'material_categories'
  | 'reception_types'
  | 'document_states'
  | 'containers';

const MASTER_TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'species', label: 'Especies' },
  { key: 'producers', label: 'Productores' },
  { key: 'varieties', label: 'Variedades' },
  { key: 'quality', label: 'Calidades' },
  { key: 'process_machines', label: 'Líneas de proceso' },
  { key: 'process_results', label: 'Resultados proceso' },
  { key: 'formats', label: 'Formatos N×Moz' },
  { key: 'brands', label: 'Marcas' },
  { key: 'clients', label: 'Clientes' },
  { key: 'mercados', label: 'Mercados' },
  { key: 'material_categories', label: 'Cat. materiales' },
  { key: 'reception_types', label: 'Tipos recepción' },
  { key: 'document_states', label: 'Estados doc.' },
  { key: 'containers', label: 'Envases' },
];

export function MastersPage() {
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'supervisor';
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('species');
  const [rowFilter, setRowFilter] = useState('');

  const { data: speciesList } = useQuery({
    queryKey: ['masters', 'species'],
    queryFn: () => apiJson<SpeciesRow[]>('/api/masters/species?include_inactive=true'),
  });
  const { data: producersList } = useQuery({
    queryKey: ['masters', 'producers'],
    queryFn: () => apiJson<ProducerRow[]>('/api/masters/producers?include_inactive=true'),
  });
  const { data: varietiesList } = useQuery({
    queryKey: ['masters', 'varieties'],
    queryFn: () => apiJson<VarietyRow[]>('/api/masters/varieties?include_inactive=true'),
  });
  const { data: formatsList } = useQuery({
    queryKey: ['masters', 'formats'],
    queryFn: () => apiJson<FormatRow[]>('/api/masters/presentation-formats?include_inactive=true'),
  });
  const { data: qualityList } = useQuery({
    queryKey: ['masters', 'quality-grades'],
    queryFn: () => apiJson<QualityRow[]>('/api/masters/quality-grades?include_inactive=true'),
  });
  const { data: containersList } = useQuery({
    queryKey: ['masters', 'returnable-containers'],
    queryFn: () =>
      apiJson<
        { id: number; tipo: string; capacidad: string | null; requiereRetorno: boolean; activo: boolean }[]
      >('/api/masters/returnable-containers?include_inactive=true'),
  });

  const { data: processMachinesList } = useQuery({
    queryKey: ['masters', 'process-machines'],
    queryFn: () => apiJson<ProcessMachineRow[]>('/api/masters/process-machines?include_inactive=true'),
  });
  const { data: processResultComponents } = useQuery({
    queryKey: ['masters', 'process-result-components'],
    queryFn: () => apiJson<ProcessResultComponentRow[]>('/api/masters/process-result-components?include_inactive=true'),
  });

  const { data: clientsList } = useQuery({
    queryKey: ['masters', 'clients'],
    queryFn: () => apiJson<ClientMasterRow[]>('/api/masters/clients?include_inactive=true'),
  });

  const { data: mercadosList } = useQuery({
    queryKey: ['masters', 'mercados'],
    queryFn: () =>
      apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/mercados?include_inactive=true'),
  });

  const { data: materialCategoriesList } = useQuery({
    queryKey: ['masters', 'material-categories'],
    queryFn: () =>
      apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>(
        '/api/masters/material-categories?include_inactive=true',
      ),
  });

  const { data: receptionTypesList } = useQuery({
    queryKey: ['masters', 'reception-types'],
    queryFn: () =>
      apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/reception-types?include_inactive=true'),
  });

  const { data: documentStatesList } = useQuery({
    queryKey: ['masters', 'document-states'],
    queryFn: () =>
      apiJson<{ id: number; codigo: string; nombre: string; activo: boolean }[]>('/api/masters/document-states?include_inactive=true'),
  });

  const { data: brandsList } = useQuery({
    queryKey: ['masters', 'brands'],
    queryFn: () => apiJson<BrandMasterRow[]>('/api/masters/brands?include_inactive=true'),
  });

  return (
    <MastersRowFilterContext.Provider value={{ filter: rowFilter, setFilter: setRowFilter }}>
      <div className="space-y-4">
        <div>
          <h1 className={pageTitle}>Mantenedores</h1>
          <p className={pageSubtitle}>Catálogos de apoyo — alta y edición rápida.</p>
        </div>

        {!canWrite && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Solo lectura</CardTitle>
              <CardDescription className="text-xs">
                Necesitás rol supervisor o admin para editar.{' '}
                <a href="/api/docs" target="_blank" rel="noreferrer" className="text-primary underline">
                  API
                </a>
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="shrink-0 space-y-2 lg:w-52">
            <label htmlFor="masters-tab-select" className="sr-only">
              Catálogo
            </label>
            <select
              id="masters-tab-select"
              className={cn(filterSelectClass, 'lg:hidden')}
              value={tab}
              onChange={(e) => {
                setTab(e.target.value as TabKey);
                setRowFilter('');
              }}
            >
              {MASTER_TAB_ITEMS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <nav className="hidden max-h-[min(70vh,520px)] flex-col gap-0.5 overflow-y-auto pr-1 lg:flex" aria-label="Catálogos">
              {MASTER_TAB_ITEMS.map(({ key, label }) => (
                <Button
                  key={key}
                  type="button"
                  variant={tab === key ? 'default' : 'ghost'}
                  size="sm"
                  className={cn('h-9 justify-start px-3 text-left text-sm font-normal', tab === key && 'pointer-events-none')}
                  onClick={() => {
                    setTab(key);
                    setRowFilter('');
                  }}
                >
                  {label}
                </Button>
              ))}
            </nav>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <input
              type="search"
              className={filterInputClass}
              placeholder="Filtrar filas del listado actual…"
              value={rowFilter}
              onChange={(e) => setRowFilter(e.target.value)}
              aria-label="Filtrar filas"
            />

            {tab === 'species' && (
              <SpeciesSection list={speciesList ?? []} canWrite={canWrite} queryClient={queryClient} />
            )}
            {tab === 'producers' && (
              <ProducersSection list={producersList ?? []} canWrite={canWrite} queryClient={queryClient} />
            )}
            {tab === 'varieties' && (
              <VarietiesSection
                list={varietiesList ?? []}
                species={speciesList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
              />
            )}
            {tab === 'quality' && (
              <QualitySection list={qualityList ?? []} canWrite={canWrite} queryClient={queryClient} />
            )}
            {tab === 'process_machines' && (
              <ProcessMachinesSection list={processMachinesList ?? []} canWrite={canWrite} queryClient={queryClient} />
            )}
            {tab === 'process_results' && (
              <ProcessResultComponentsSection
                list={processResultComponents ?? []}
                species={speciesList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
              />
            )}
            {tab === 'formats' && (
              <FormatsSection list={formatsList ?? []} species={speciesList ?? []} canWrite={canWrite} queryClient={queryClient} />
            )}
            {tab === 'brands' && (
              <BrandsSection
                list={brandsList ?? []}
                clients={clientsList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
              />
            )}
            {tab === 'clients' && (
              <ClientsSection
                list={clientsList ?? []}
                mercados={mercadosList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
              />
            )}
            {tab === 'mercados' && (
              <SimpleCatalogSection
                title="Mercados"
                list={mercadosList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
                queryKey={['masters', 'mercados']}
                apiPath="mercados"
              />
            )}
            {tab === 'material_categories' && (
              <SimpleCatalogSection
                title="Categorías de materiales"
                list={materialCategoriesList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
                queryKey={['masters', 'material-categories']}
                apiPath="material-categories"
              />
            )}
            {tab === 'reception_types' && (
              <SimpleCatalogSection
                title="Tipos de recepción"
                list={receptionTypesList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
                queryKey={['masters', 'reception-types']}
                apiPath="reception-types"
              />
            )}
            {tab === 'document_states' && (
              <SimpleCatalogSection
                title="Estados de documento"
                list={documentStatesList ?? []}
                canWrite={canWrite}
                queryClient={queryClient}
                queryKey={['masters', 'document-states']}
                apiPath="document-states"
              />
            )}
            {tab === 'containers' && (
              <ContainersSection list={containersList ?? []} canWrite={canWrite} queryClient={queryClient} />
            )}
          </div>
        </div>
      </div>
    </MastersRowFilterContext.Provider>
  );
}

function ProcessMachinesSection({
  list,
  canWrite,
  queryClient,
}: {
  list: ProcessMachineRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo} ${r.nombre} ${r.kind}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const form = useForm<z.infer<typeof processMachineSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(processMachineSchema),
    defaultValues: { codigo: '', nombre: '', kind: 'single' },
  });

  const createMut = useMutation({
    mutationFn: (body: z.infer<typeof processMachineSchema>) =>
      apiJson('/api/masters/process-machines', {
        method: 'POST',
        body: JSON.stringify({
          codigo: body.codigo.trim(),
          nombre: body.nombre.trim(),
          kind: body.kind,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-machines'] });
      toast.success('Línea de proceso creada');
      setOpen(false);
      form.reset({ codigo: '', nombre: '', kind: 'single' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: z.infer<typeof editProcessMachineSchema> }) =>
      apiJson(`/api/masters/process-machines/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          codigo: body.codigo.trim(),
          nombre: body.nombre.trim(),
          kind: body.kind,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-machines'] });
      toast.success('Línea actualizada');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/process-machines/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-machines'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/process-machines', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-machines'] });
      setConfirmDeactivate(null);
      toast.success('Línea borrada');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Líneas de proceso</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nueva línea
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva línea</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input placeholder="IQF-SINGLE" {...form.register('codigo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <select
                    className={filterSelectClass}
                    {...form.register('kind')}
                  >
                    <option value="single">Single</option>
                    <option value="double">Double</option>
                  </select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-24">Tipo</TableHead>
              <TableHead className="w-20">Activo</TableHead>
              {canWrite ? <TableHead className="w-[1%]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell>{r.kind}</TableCell>
                <TableCell>{r.activo ? 'Sí' : 'No'}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: `${r.codigo} — ${r.nombre}` })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {canWrite && editing != null && (
          <Dialog open onOpenChange={(o) => !o && setEditId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar línea #{editing.id}</DialogTitle>
              </DialogHeader>
              <EditProcessMachineForm
                row={editing}
                onSave={(body) => updateMut.mutate({ id: editing.id, body })}
                onClose={() => setEditId(null)}
                pending={updateMut.isPending}
              />
            </DialogContent>
          </Dialog>
        )}
        <MasterDeleteDialog
          open={confirmDeactivate != null}
          onOpenChange={(o) => !o && setConfirmDeactivate(null)}
          title="Borrar línea de proceso"
          label={confirmDeactivate?.label ?? ''}
          pending={deleteMut.isPending}
          onConfirm={() =>
            confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
          }
        />
      </CardContent>
    </Card>
  );
}

function EditProcessMachineForm({
  row,
  onSave,
  onClose,
  pending,
}: {
  row: ProcessMachineRow;
  onSave: (body: z.infer<typeof editProcessMachineSchema>) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const f = useForm<z.infer<typeof editProcessMachineSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(editProcessMachineSchema),
    defaultValues: {
      codigo: row.codigo,
      nombre: row.nombre,
      kind: row.kind,
    },
  });

  return (
    <form
      onSubmit={f.handleSubmit((v) =>
        onSave({
          codigo: v.codigo.trim(),
          nombre: v.nombre.trim(),
          kind: v.kind,
        }),
      )}
      className="grid gap-3"
    >
      <div className="grid gap-2">
        <Label>Código</Label>
        <Input {...f.register('codigo')} />
      </div>
      <div className="grid gap-2">
        <Label>Nombre</Label>
        <Input {...f.register('nombre')} />
      </div>
      <div className="grid gap-2">
        <Label>Tipo</Label>
        <select className={filterSelectClass} {...f.register('kind')}>
          <option value="single">Single</option>
          <option value="double">Double</option>
        </select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function BrandsSection({
  list,
  clients,
  canWrite,
  queryClient,
}: {
  list: BrandMasterRow[];
  clients: ClientMasterRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () =>
      filterRows(list, filter, (r) =>
        `${r.codigo} ${r.nombre} ${r.client?.nombre ?? ''} ${r.client?.codigo ?? ''}`,
      ),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const form = useForm<z.infer<typeof brandSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(brandSchema),
    defaultValues: { codigo: '', nombre: '', client_id: 0 },
  });

  const createMut = useMutation({
    mutationFn: (body: z.infer<typeof brandSchema>) =>
      apiJson('/api/masters/brands', {
        method: 'POST',
        body: JSON.stringify({
          codigo: body.codigo.trim(),
          nombre: body.nombre.trim(),
          client_id: body.client_id > 0 ? body.client_id : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'brands'] });
      toast.success('Marca creada');
      setOpen(false);
      form.reset({ codigo: '', nombre: '', client_id: 0 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: {
        codigo?: string;
        nombre?: string;
        client_id?: number | null;
      };
    }) =>
      apiJson(`/api/masters/brands/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'brands'] });
      toast.success('Marca actualizada');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/brands/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'brands'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/brands', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'brands'] });
      setConfirmDeactivate(null);
      toast.success('Marca borrada');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Marcas</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nueva marca
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva marca</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input {...form.register('codigo')} placeholder="ALP-SP" autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Cliente (opc.)</Label>
                  <select
                    className={filterSelectClass}
                    {...form.register('client_id', { valueAsNumber: true })}
                  >
                    <option value={0}>Sin cliente</option>
                    {clients
                      .filter((c) => c.activo)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({c.codigo})
                        </option>
                      ))}
                  </select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-24">Estado</TableHead>
              {canWrite ? <TableHead className="w-[100px]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell>
                  {r.client_id != null && r.client != null
                    ? `${r.client.nombre} (${r.client.codigo})`
                    : r.client_id != null
                      ? `#${r.client_id}`
                      : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={r.activo ? 'default' : 'secondary'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: `${r.codigo} — ${r.nombre}` })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {canWrite && editing ? (
        <Dialog open={editId != null} onOpenChange={(o) => !o && setEditId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar marca</DialogTitle>
            </DialogHeader>
            <BrandEditForm
              row={editing}
              clients={clients}
              onClose={() => setEditId(null)}
              onSave={(body) => updateMut.mutate({ id: editing.id, body })}
              pending={updateMut.isPending}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      <MasterDeleteDialog
        open={confirmDeactivate != null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
        title="Borrar marca"
        label={confirmDeactivate?.label ?? ''}
        pending={deleteMut.isPending}
        onConfirm={() =>
          confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
        }
      />
    </Card>
  );
}

function BrandEditForm({
  row,
  clients,
  onClose,
  onSave,
  pending,
}: {
  row: BrandMasterRow;
  clients: ClientMasterRow[];
  onClose: () => void;
  onSave: (body: { codigo: string; nombre: string; client_id: number | null }) => void;
  pending: boolean;
}) {
  const f = useForm<z.infer<typeof editBrandSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(editBrandSchema),
    defaultValues: {
      codigo: row.codigo,
      nombre: row.nombre,
      client_id: row.client_id ?? 0,
    },
  });

  return (
    <form
      onSubmit={f.handleSubmit((v) =>
        onSave({
          codigo: v.codigo.trim(),
          nombre: v.nombre.trim(),
          client_id: v.client_id > 0 ? v.client_id : null,
        }),
      )}
      className="grid gap-3"
    >
      <div className="grid gap-2">
        <Label>Código</Label>
        <Input {...f.register('codigo')} />
      </div>
      <div className="grid gap-2">
        <Label>Nombre</Label>
        <Input {...f.register('nombre')} />
      </div>
      <div className="grid gap-2">
        <Label>Cliente</Label>
        <select
          className={filterSelectClass}
          {...f.register('client_id', { valueAsNumber: true })}
        >
          <option value={0}>Sin cliente</option>
          {clients
            .filter((c) => c.activo)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.codigo})
              </option>
            ))}
        </select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function ContainersSection({
  list,
  canWrite,
  queryClient,
}: {
  list: { id: number; tipo: string; capacidad: string | null; requiereRetorno: boolean; activo: boolean }[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.tipo} ${r.capacidad ?? ''} ${r.requiereRetorno ? 'retorno' : ''}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const form = useForm<z.infer<typeof containerSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(containerSchema),
    defaultValues: { tipo: '', capacidad: '', requiere_retorno: false },
  });

  const createMut = useMutation({
    mutationFn: (body: z.infer<typeof containerSchema>) =>
      apiJson('/api/masters/returnable-containers', {
        method: 'POST',
        body: JSON.stringify({
          tipo: body.tipo.trim(),
          capacidad: body.capacidad?.trim() || undefined,
          requiere_retorno: body.requiere_retorno ?? false,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'returnable-containers'] });
      toast.success('Envase creado');
      setOpen(false);
      form.reset({ tipo: '', capacidad: '', requiere_retorno: false });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Partial<z.infer<typeof containerSchema>> & { activo?: boolean };
    }) =>
      apiJson(`/api/masters/returnable-containers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'returnable-containers'] });
      toast.success('Envase actualizado');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/returnable-containers/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'returnable-containers'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/returnable-containers', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'returnable-containers'] });
      setConfirmDeactivate(null);
      toast.success('Envase borrado');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Envases retornables</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nuevo envase
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo envase</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Tipo</Label>
                    <Input placeholder="Lug blue" {...form.register('tipo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Capacidad</Label>
                    <Input placeholder="3,25 lb" {...form.register('capacidad')} autoComplete="off" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...form.register('requiere_retorno')} />
                  Requiere retorno
                </label>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Capacidad</TableHead>
              <TableHead className="w-24">Retorno</TableHead>
              <TableHead className="w-20">Activo</TableHead>
              {canWrite ? <TableHead className="w-[1%]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.tipo}</TableCell>
                <TableCell>{r.capacidad ?? '—'}</TableCell>
                <TableCell>{r.requiereRetorno ? 'Sí' : 'No'}</TableCell>
                <TableCell>{r.activo ? 'Sí' : 'No'}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({
                          id: r.id,
                          label: `${r.tipo}${r.capacidad ? ` · ${r.capacidad}` : ''}`,
                        })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {canWrite && editing != null && (
          <Dialog open onOpenChange={(o) => !o && setEditId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar envase #{editing.id}</DialogTitle>
              </DialogHeader>
              <EditContainerForm
                key={editing.id}
                row={editing}
                onSave={(payload) => updateMut.mutate({ id: editing.id, body: payload })}
                onCancel={() => setEditId(null)}
                isPending={updateMut.isPending}
              />
            </DialogContent>
          </Dialog>
        )}
        <MasterDeleteDialog
          open={confirmDeactivate != null}
          onOpenChange={(o) => !o && setConfirmDeactivate(null)}
          title="Borrar envase"
          label={confirmDeactivate?.label ?? ''}
          pending={deleteMut.isPending}
          onConfirm={() =>
            confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
          }
        />
      </CardContent>
    </Card>
  );
}

function EditContainerForm({
  row,
  onSave,
  onCancel,
  isPending,
}: {
  row: { tipo: string; capacidad: string | null; requiereRetorno: boolean; activo: boolean };
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm({
    defaultValues: {
      tipo: row.tipo,
      capacidad: row.capacidad ?? '',
      requiere_retorno: row.requiereRetorno,
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((v) =>
        onSave({
          tipo: v.tipo.trim(),
          capacidad: v.capacidad?.trim() || undefined,
          requiere_retorno: v.requiere_retorno,
        }),
      )}
      className="grid gap-3"
    >
      <div className="grid gap-2">
        <Label>Tipo</Label>
        <Input {...form.register('tipo')} />
      </div>
      <div className="grid gap-2">
        <Label>Capacidad</Label>
        <Input {...form.register('capacidad')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register('requiere_retorno')} />
        Requiere retorno
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function QualitySection({
  list,
  canWrite,
  queryClient,
}: {
  list: QualityRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo} ${r.nombre} ${r.purpose ?? ''}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const form = useForm<z.infer<typeof qualitySchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(qualitySchema),
    defaultValues: { codigo: '', nombre: '', purpose: 'both' },
  });
  const mut = useMutation({
    mutationFn: (body: z.infer<typeof qualitySchema>) =>
      apiJson('/api/masters/quality-grades', {
        method: 'POST',
        body: JSON.stringify({
          codigo: body.codigo.trim(),
          nombre: body.nombre.trim(),
          purpose: body.purpose ?? 'both',
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'quality-grades'] });
      toast.success('Calidad creada');
      setOpen(false);
      form.reset({ codigo: '', nombre: '', purpose: 'both' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: z.infer<typeof qualityEditSchema> }) =>
      apiJson(`/api/masters/quality-grades/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          codigo: body.codigo.trim(),
          nombre: body.nombre.trim(),
          purpose: body.purpose,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'quality-grades'] });
      toast.success('Calidad actualizada');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/quality-grades/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'quality-grades'] });
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
      setConfirmDeactivate(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/quality-grades', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'quality-grades'] });
      setConfirmDeactivate(null);
      toast.success('Calidad borrada');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Calidades</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nueva
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva calidad</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input {...form.register('codigo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Uso</Label>
                  <select
                    className={filterSelectClass}
                    {...form.register('purpose')}
                  >
                    <option value="both">Ambos</option>
                    <option value="exportacion">Exportación</option>
                    <option value="proceso">Proceso</option>
                  </select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead className="w-20">Activo</TableHead>
              {canWrite ? <TableHead className="w-[1%]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{r.purpose ?? 'both'}</TableCell>
                <TableCell>{r.activo ? 'Sí' : 'No'}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: `${r.codigo} — ${r.nombre}` })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editing ? (
          <Dialog open onOpenChange={(o) => !o && setEditId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar calidad</DialogTitle>
              </DialogHeader>
              <QualityEditForm
                row={editing}
                onClose={() => setEditId(null)}
                onSave={(body) => updateMut.mutate({ id: editing.id, body })}
                pending={updateMut.isPending}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <MasterDeleteDialog
          open={confirmDeactivate != null}
          onOpenChange={(o) => !o && setConfirmDeactivate(null)}
          title="Borrar calidad"
          label={confirmDeactivate?.label ?? ''}
          pending={deleteMut.isPending}
          onConfirm={() =>
            confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
          }
        />
      </CardContent>
    </Card>
  );
}

function QualityEditForm({
  row,
  onClose,
  onSave,
  pending,
}: {
  row: QualityRow;
  onClose: () => void;
  onSave: (body: z.infer<typeof qualityEditSchema>) => void;
  pending: boolean;
}) {
  const f = useForm<z.infer<typeof qualityEditSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(qualityEditSchema),
    defaultValues: {
      codigo: row.codigo,
      nombre: row.nombre,
      purpose: (row.purpose as 'exportacion' | 'proceso' | 'both') ?? 'both',
    },
  });
  return (
    <form
      onSubmit={f.handleSubmit((v) =>
        onSave({
          codigo: v.codigo.trim(),
          nombre: v.nombre.trim(),
          purpose: v.purpose,
        }),
      )}
      className="grid gap-3"
    >
      <div className="grid gap-2">
        <Label>Código</Label>
        <Input {...f.register('codigo')} />
      </div>
      <div className="grid gap-2">
        <Label>Nombre</Label>
        <Input {...f.register('nombre')} />
      </div>
      <div className="grid gap-2">
        <Label>Uso</Label>
        <select
          className={filterSelectClass}
          {...f.register('purpose')}
        >
          <option value="both">Ambos</option>
          <option value="exportacion">Exportación</option>
          <option value="proceso">Proceso</option>
        </select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function SpeciesSection({
  list,
  canWrite,
  queryClient,
}: {
  list: SpeciesRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo} ${r.nombre} ${r.activo ? 'activo' : ''}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof speciesSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(speciesSchema),
    defaultValues: { codigo: '', nombre: '' },
  });
  const mut = useMutation({
    mutationFn: (body: z.infer<typeof speciesSchema>) =>
      apiJson('/api/masters/species', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'species'] });
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      toast.success('Especie creada');
      setOpen(false);
      form.reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { codigo?: string; nombre?: string } }) =>
      apiJson(`/api/masters/species/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'species'] });
      toast.success('Especie actualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (source: InlineCodigoNombreRow) => {
      const lower = new Set(list.map((x) => x.codigo.toLowerCase()));
      const newCode = uniqueDuplicateCode(source.codigo, lower);
      return apiJson('/api/masters/species', {
        method: 'POST',
        body: JSON.stringify({ codigo: newCode, nombre: source.nombre.trim() }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'species'] });
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      toast.success('Especie duplicada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/species/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'species'] });
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/species', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'species'] });
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      toast.success('Especie borrada');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Especies</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> + Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nueva especie</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input placeholder="ARB" {...form.register('codigo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input placeholder="Arándano" {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mut.isPending}>
                    Crear
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className={cn(tableShell, 'overflow-x-auto')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[9.5rem]">Estado</TableHead>
                {canWrite ? <TableHead className="w-[1%]"> </TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <InlineCodigoNombreCatalogRow
                  key={r.id}
                  row={r}
                  canWrite={canWrite}
                  onPatch={(id, body) => updateMut.mutate({ id, body })}
                  onDuplicate={(src) => duplicateMut.mutate(src)}
                  onSetActivo={(id, activo) => setActivoMut.mutate({ id, activo })}
                  onDelete={(row) => {
                    if (window.confirm(`¿Borrar ${row.codigo} — ${row.nombre}? Esta acción no se puede deshacer.`)) {
                      deleteMut.mutate({ id: row.id });
                    }
                  }}
                  patchPending={updateMut.isPending && updateMut.variables?.id === r.id}
                  duplicatePending={duplicateMut.isPending && duplicateMut.variables?.id === r.id}
                  activoPending={setActivoMut.isPending && setActivoMut.variables?.id === r.id}
                  deletePending={deleteMut.isPending && deleteMut.variables?.id === r.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProducersSection({
  list,
  canWrite,
  queryClient,
}: {
  list: ProducerRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo ?? ''} ${r.nombre}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof producerSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(producerSchema),
    defaultValues: { codigo: '', nombre: '' },
  });
  const mut = useMutation({
    mutationFn: (body: z.infer<typeof producerSchema>) =>
      apiJson('/api/masters/producers', {
        method: 'POST',
        body: JSON.stringify({ nombre: body.nombre, codigo: body.codigo?.trim() || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'producers'] });
      toast.success('Productor creado');
      setOpen(false);
      form.reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { codigo?: string; nombre?: string } }) =>
      apiJson(`/api/masters/producers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'producers'] });
      toast.success('Productor actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (source: ProducerRow) => {
      const codes = list.map((x) => x.codigo).filter((c): c is string => c != null && c.trim() !== '');
      const lower = new Set(codes.map((c) => c.toLowerCase()));
      const base =
        (source.codigo && source.codigo.trim()) ||
        source.nombre
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 24)
          .toUpperCase() ||
        'PROD';
      const newCode = uniqueDuplicateCode(base, lower);
      return apiJson('/api/masters/producers', {
        method: 'POST',
        body: JSON.stringify({
          nombre: source.nombre.trim(),
          codigo: newCode,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'producers'] });
      toast.success('Productor duplicado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/producers/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'producers'] });
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/producers', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'producers'] });
      toast.success('Productor borrado');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Productores</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> + Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo productor</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input placeholder="Opcional" {...form.register('codigo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mut.isPending}>
                    Crear
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className={cn(tableShell, 'overflow-x-auto')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[9.5rem]">Estado</TableHead>
                {canWrite ? <TableHead className="w-[1%]"> </TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <InlineProducerRow
                  key={r.id}
                  row={r}
                  canWrite={canWrite}
                  onPatch={(id, body) => updateMut.mutate({ id, body })}
                  onDuplicate={(src) => duplicateMut.mutate(src)}
                  onSetActivo={(id, activo) => setActivoMut.mutate({ id, activo })}
                  onDelete={(row) => {
                    if (
                      window.confirm(
                        `¿Borrar ${row.codigo ?? 'sin código'} — ${row.nombre}? Esta acción no se puede deshacer.`,
                      )
                    ) {
                      deleteMut.mutate({ id: row.id });
                    }
                  }}
                  patchPending={updateMut.isPending && updateMut.variables?.id === r.id}
                  duplicatePending={duplicateMut.isPending && duplicateMut.variables?.id === r.id}
                  activoPending={setActivoMut.isPending && setActivoMut.variables?.id === r.id}
                  deletePending={deleteMut.isPending && deleteMut.variables?.id === r.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function VarietiesSection({
  list,
  species,
  canWrite,
  queryClient,
}: {
  list: VarietyRow[];
  species: SpeciesRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () =>
      filterRows(list, filter, (r) =>
        `${r.nombre} ${r.codigo ?? ''} ${r.species?.nombre ?? ''} ${String(r.species_id)}`,
      ),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const speciesOptions = useMemo(() => species.filter((s) => s.activo), [species]);
  const form = useForm<z.infer<typeof varietySchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(varietySchema),
    defaultValues: { species_id: 0, codigo: '', nombre: '' },
  });

  useEffect(() => {
    if (!open || speciesOptions.length === 0) return;
    form.reset({
      species_id: speciesOptions[0]?.id ?? 0,
      codigo: '',
      nombre: '',
    });
  }, [open, speciesOptions, form.reset]);
  const mut = useMutation({
    mutationFn: (body: z.infer<typeof varietySchema>) =>
      apiJson('/api/masters/varieties', {
        method: 'POST',
        body: JSON.stringify({
          species_id: body.species_id,
          nombre: body.nombre,
          codigo: body.codigo?.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      toast.success('Variedad creada');
      setOpen(false);
      form.reset({ species_id: 0, codigo: '', nombre: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: z.infer<typeof varietySchema> }) =>
      apiJson(`/api/masters/varieties/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          species_id: body.species_id,
          nombre: body.nombre.trim(),
          codigo: body.codigo?.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      toast.success('Variedad actualizada');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/varieties/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/varieties', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'varieties'] });
      setConfirmDeactivate(null);
      toast.success('Variedad borrada');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Variedades</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nueva
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva variedad</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Especie</Label>
                  <select
                    className={filterSelectClass}
                    {...form.register('species_id', { valueAsNumber: true })}
                  >
                    <option value={0}>Elegir…</option>
                    {speciesOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre} ({s.codigo})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Código (opc.)</Label>
                    <Input {...form.register('codigo')} autoComplete="off" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Especie</TableHead>
              <TableHead>Variedad</TableHead>
              <TableHead>Código</TableHead>
              <TableHead className="w-20">Activo</TableHead>
              {canWrite ? <TableHead className="w-[1%]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.species?.nombre ?? r.species_id}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell className="font-mono text-sm">{r.codigo ?? '—'}</TableCell>
                <TableCell>{r.activo ? 'Sí' : 'No'}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: `${r.nombre} (${r.species?.nombre ?? r.species_id})` })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editing ? (
          <Dialog open onOpenChange={(o) => !o && setEditId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar variedad</DialogTitle>
              </DialogHeader>
              <VarietyEditForm
                row={editing}
                speciesOptions={speciesOptions}
                allSpecies={species}
                onClose={() => setEditId(null)}
                onSave={(body) => updateMut.mutate({ id: editing.id, body })}
                pending={updateMut.isPending}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <MasterDeleteDialog
          open={confirmDeactivate != null}
          onOpenChange={(o) => !o && setConfirmDeactivate(null)}
          title="Borrar variedad"
          label={confirmDeactivate?.label ?? ''}
          pending={deleteMut.isPending}
          onConfirm={() =>
            confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
          }
        />
      </CardContent>
    </Card>
  );
}

function VarietyEditForm({
  row,
  speciesOptions,
  allSpecies,
  onClose,
  onSave,
  pending,
}: {
  row: VarietyRow;
  speciesOptions: SpeciesRow[];
  allSpecies: SpeciesRow[];
  onClose: () => void;
  onSave: (body: z.infer<typeof varietySchema>) => void;
  pending: boolean;
}) {
  const selectSpecies = (() => {
    const m = new Map(speciesOptions.map((s) => [s.id, s]));
    const need = allSpecies.find((s) => s.id === row.species_id);
    if (need && !m.has(need.id)) m.set(need.id, need);
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  })();
  const f = useForm<z.infer<typeof varietySchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(varietySchema),
    defaultValues: {
      species_id: row.species_id,
      codigo: row.codigo ?? '',
      nombre: row.nombre,
    },
  });
  return (
    <form
      onSubmit={f.handleSubmit((v) =>
        onSave({
          species_id: v.species_id,
          nombre: v.nombre.trim(),
          codigo: v.codigo?.trim() || undefined,
        }),
      )}
      className="grid gap-3"
    >
      <div className="grid gap-2">
        <Label>Especie</Label>
        <select
          className={filterSelectClass}
          {...f.register('species_id', { valueAsNumber: true })}
        >
          {selectSpecies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} ({s.codigo})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label>Código (opcional)</Label>
        <Input {...f.register('codigo')} />
      </div>
      <div className="grid gap-2">
        <Label>Nombre</Label>
        <Input {...f.register('nombre')} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function formatPayloadFromForm(body: z.infer<typeof formatSchema>, mode: 'create' | 'update') {
  const sid = body.species_id_str?.trim();
  let species_id: number | null | undefined;
  if (sid === '') {
    species_id = mode === 'update' ? null : undefined;
  } else if (sid) {
    const n = Number.parseInt(sid, 10);
    species_id = Number.isFinite(n) ? n : undefined;
  }
  const box_kind =
    body.box_kind === '' ? (mode === 'update' ? null : undefined) : (body.box_kind as 'mano' | 'maquina');
  const clamshell_label_kind =
    body.clamshell_label_kind === ''
      ? mode === 'update'
        ? null
        : undefined
      : (body.clamshell_label_kind as 'generica' | 'marca');
  return {
    format_code: body.format_code.trim(),
    species_id,
    descripcion: body.descripcion?.trim() || undefined,
    net_weight_lb_per_box: body.net_weight_lb_per_box,
    max_boxes_per_pallet: body.max_boxes_per_pallet,
    ...(box_kind !== undefined ? { box_kind } : {}),
    ...(clamshell_label_kind !== undefined ? { clamshell_label_kind } : {}),
  };
}

function FormatsSection({
  list,
  species,
  canWrite,
  queryClient,
}: {
  list: FormatRow[];
  species: SpeciesRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () =>
      filterRows(list, filter, (r) =>
        `${r.format_code} ${r.species?.nombre ?? ''} ${r.descripcion ?? ''} ${r.net_weight_lb_per_box ?? ''}`,
      ),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const speciesOptions = species.filter((s) => s.activo);
  const form = useForm<z.infer<typeof formatSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(formatSchema),
    defaultValues: {
      format_code: '',
      species_id_str: '',
      descripcion: '',
      net_weight_lb_per_box: 1,
      max_boxes_per_pallet: undefined,
      box_kind: '',
      clamshell_label_kind: '',
    },
  });
  const mut = useMutation({
    mutationFn: (body: z.infer<typeof formatSchema>) =>
      apiJson('/api/masters/presentation-formats', {
        method: 'POST',
        body: JSON.stringify(formatPayloadFromForm(body, 'create')),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'formats'] });
      toast.success('Formato creado');
      setOpen(false);
      form.reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: z.infer<typeof formatSchema> }) =>
      apiJson(`/api/masters/presentation-formats/${id}`, {
        method: 'PUT',
        body: JSON.stringify(formatPayloadFromForm(body, 'update')),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'formats'] });
      toast.success('Formato actualizado');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/presentation-formats/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'formats'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/presentation-formats', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'formats'] });
      setConfirmDeactivate(null);
      toast.success('Formato borrado');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Formatos N×Moz</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo formato</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Código (NxMoz)</Label>
                  <Input placeholder="4x16oz" {...form.register('format_code')} autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label>Especie (opcional)</Label>
                  <select
                    className={filterSelectClass}
                    {...form.register('species_id_str')}
                  >
                    <option value="">Todas</option>
                    {speciesOptions.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Peso neto por caja (lb)</Label>
                  <Input type="number" step="0.0001" min="0.0001" {...form.register('net_weight_lb_per_box', { valueAsNumber: true })} />
                </div>
                <div className="grid gap-2">
                  <Label>Descripción</Label>
                  <Input {...form.register('descripcion')} />
                </div>
                <div className="grid gap-2">
                  <Label>Tope cajas por pallet/unidad PT (opcional)</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Ej. 100"
                    {...form.register('max_boxes_per_pallet', { valueAsNumber: true })}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label>Tipo de caja (empaque)</Label>
                    <select
                      className={filterSelectClass}
                      {...form.register('box_kind')}
                    >
                      <option value="">Sin definir</option>
                      <option value="mano">Mano</option>
                      <option value="maquina">Máquina</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label>Etiqueta clamshell</Label>
                    <select
                      className={filterSelectClass}
                      {...form.register('clamshell_label_kind')}
                    >
                      <option value="">Sin definir</option>
                      <option value="generica">Genérica</option>
                      <option value="marca">Marca</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Especie</TableHead>
              <TableHead>lb/caja</TableHead>
              <TableHead>Máx/Pt</TableHead>
              <TableHead>Caja</TableHead>
              <TableHead>Clamshell</TableHead>
              <TableHead className="max-w-[140px]">Nota</TableHead>
              <TableHead className="w-20">Activo</TableHead>
              {canWrite ? <TableHead className="w-[1%]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.format_code}</TableCell>
                <TableCell>{r.species?.nombre ?? '—'}</TableCell>
                <TableCell className="font-mono">{r.net_weight_lb_per_box ?? '—'}</TableCell>
                <TableCell>{r.max_boxes_per_pallet ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {r.box_kind === 'mano' ? 'Mano' : r.box_kind === 'maquina' ? 'Máquina' : '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {r.clamshell_label_kind === 'generica'
                    ? 'Genérica'
                    : r.clamshell_label_kind === 'marca'
                      ? 'Marca'
                      : '—'}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{r.descripcion ?? '—'}</TableCell>
                <TableCell>{r.activo ? 'Sí' : 'No'}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: r.format_code })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editing ? (
          <Dialog open onOpenChange={(o) => !o && setEditId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar formato</DialogTitle>
              </DialogHeader>
              <FormatEditForm
                row={editing}
                onClose={() => setEditId(null)}
                onSave={(body) => updateMut.mutate({ id: editing.id, body })}
                pending={updateMut.isPending}
                speciesOptions={speciesOptions}
                allSpecies={species}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <MasterDeleteDialog
          open={confirmDeactivate != null}
          onOpenChange={(o) => !o && setConfirmDeactivate(null)}
          title="Borrar formato"
          label={confirmDeactivate?.label ?? ''}
          pending={deleteMut.isPending}
          onConfirm={() =>
            confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
          }
        />
      </CardContent>
    </Card>
  );
}

function FormatEditForm({
  row,
  onClose,
  onSave,
  pending,
  speciesOptions,
  allSpecies,
}: {
  row: FormatRow;
  onClose: () => void;
  onSave: (body: z.infer<typeof formatSchema>) => void;
  pending: boolean;
  speciesOptions: SpeciesRow[];
  allSpecies: SpeciesRow[];
}) {
  const speciesSelect = (() => {
    const m = new Map(speciesOptions.map((s) => [s.id, s]));
    const need = row.species_id != null ? allSpecies.find((s) => s.id === row.species_id) : undefined;
    if (need && !m.has(need.id)) m.set(need.id, need);
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  })();
  const nw = Number(row.net_weight_lb_per_box);
  const f = useForm<z.infer<typeof formatSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(formatSchema),
    defaultValues: {
      format_code: row.format_code,
      species_id_str: row.species_id != null ? String(row.species_id) : '',
      descripcion: row.descripcion ?? '',
      net_weight_lb_per_box: Number.isFinite(nw) && nw > 0 ? nw : 0.0001,
      max_boxes_per_pallet: row.max_boxes_per_pallet ?? undefined,
      box_kind: row.box_kind === 'mano' || row.box_kind === 'maquina' ? row.box_kind : '',
      clamshell_label_kind:
        row.clamshell_label_kind === 'generica' || row.clamshell_label_kind === 'marca'
          ? row.clamshell_label_kind
          : '',
    },
  });
  return (
    <form onSubmit={f.handleSubmit((v) => onSave(v))} className="grid gap-3">
      <div className="grid gap-2">
        <Label>Código (NxMoz)</Label>
        <Input {...f.register('format_code')} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label>Especie (opcional)</Label>
        <select className={filterSelectClass} {...f.register('species_id_str')}>
          <option value="">Todas</option>
          {speciesSelect.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label>Peso neto por caja (lb)</Label>
        <Input type="number" step="0.0001" min="0.0001" {...f.register('net_weight_lb_per_box', { valueAsNumber: true })} />
      </div>
      <div className="grid gap-2">
        <Label>Descripción</Label>
        <Input {...f.register('descripcion')} />
      </div>
      <div className="grid gap-2">
        <Label>Tope cajas por pallet/unidad PT (opcional)</Label>
        <Input
          type="number"
          min={1}
          placeholder="Ej. 100"
          {...f.register('max_boxes_per_pallet', { valueAsNumber: true })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Tipo de caja (empaque)</Label>
          <select className={filterSelectClass} {...f.register('box_kind')}>
            <option value="">Sin definir</option>
            <option value="mano">Mano</option>
            <option value="maquina">Máquina</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label>Etiqueta clamshell</Label>
          <select
            className={filterSelectClass}
            {...f.register('clamshell_label_kind')}
          >
            <option value="">Sin definir</option>
            <option value="generica">Genérica</option>
            <option value="marca">Marca</option>
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function ProcessResultComponentsSection({
  list,
  species,
  canWrite,
  queryClient,
}: {
  list: ProcessResultComponentRow[];
  species: SpeciesRow[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo} ${r.nombre} ${r.sort_order}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [speciesCfgId, setSpeciesCfgId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);

  const form = useForm<z.infer<typeof processResultComponentSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(processResultComponentSchema),
    defaultValues: { codigo: '', nombre: '', sort_order: 0 },
  });

  const { data: speciesComponents } = useQuery({
    queryKey: ['masters', 'species', speciesCfgId, 'process-result-components'],
    queryFn: () =>
      apiJson<SpeciesProcessResultComponentRow[]>(
        `/api/masters/species/${speciesCfgId}/process-result-components?include_inactive=true`,
      ),
    enabled: speciesCfgId != null,
  });

  const createMut = useMutation({
    mutationFn: (body: z.infer<typeof processResultComponentSchema>) =>
      apiJson('/api/masters/process-result-components', {
        method: 'POST',
        body: JSON.stringify({
          codigo: body.codigo.trim().toUpperCase(),
          nombre: body.nombre.trim(),
          sort_order: body.sort_order,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-result-components'] });
      toast.success('Componente creado');
      setOpen(false);
      form.reset({ codigo: '', nombre: '', sort_order: 0 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: z.infer<typeof editProcessResultComponentSchema> }) =>
      apiJson(`/api/masters/process-result-components/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          codigo: body.codigo.trim().toUpperCase(),
          nombre: body.nombre.trim(),
          sort_order: body.sort_order,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-result-components'] });
      toast.success('Componente actualizado');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/process-result-components/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-result-components'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/process-result-components', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'process-result-components'] });
      setConfirmDeactivate(null);
      toast.success('Componente borrado');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const saveSpeciesConfigMut = useMutation({
    mutationFn: ({ sid, activeIds }: { sid: number; activeIds: number[] }) =>
      apiJson(`/api/masters/species/${sid}/process-result-components`, {
        method: 'PUT',
        body: JSON.stringify({ active_component_ids: activeIds }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'species', vars.sid, 'process-result-components'] });
      toast.success('Configuración por especie guardada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editing = editId != null ? list.find((x) => x.id === editId) : null;

  const speciesForProcessConfig = (() => {
    const active = species.filter((s) => s.activo);
    const m = new Map(active.map((s) => [s.id, s]));
    if (speciesCfgId != null) {
      const cur = species.find((s) => s.id === speciesCfgId);
      if (cur && !m.has(cur.id)) m.set(cur.id, cur);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Resultados de proceso</CardTitle>
        {canWrite ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nuevo componente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo componente</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input {...form.register('codigo')} placeholder="IQF" autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Orden</Label>
                  <Input type="number" {...form.register('sort_order', { valueAsNumber: true })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-16">Orden</TableHead>
              <TableHead className="w-24">Estado</TableHead>
              {canWrite ? <TableHead className="w-[1%]">Acción</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell>{r.sort_order}</TableCell>
                <TableCell>
                  <Badge variant={r.activo ? 'default' : 'secondary'}>{r.activo ? 'activo' : 'inactivo'}</Badge>
                </TableCell>
                {canWrite ? (
                  <TableCell>
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: `${r.codigo} — ${r.nombre}` })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="grid gap-2 sm:max-w-sm">
          <Label>Configurar componentes por especie</Label>
          <select
            className={filterSelectClass}
            value={speciesCfgId ?? 0}
            onChange={(e) => setSpeciesCfgId(Number(e.target.value) || null)}
          >
            <option value={0}>Elegir especie…</option>
            {speciesForProcessConfig.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {!s.activo ? ' (inactiva)' : ''}
              </option>
            ))}
          </select>
          {speciesCfgId != null && speciesComponents ? (
            <div className="space-y-2 rounded-md border p-3">
              {speciesComponents.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.activo}
                    onChange={(e) => {
                      const next = speciesComponents.map((x) => (x.id === c.id ? { ...x, activo: e.target.checked } : x));
                      queryClient.setQueryData(['masters', 'species', speciesCfgId, 'process-result-components'], next);
                    }}
                  />
                  <span className="font-mono">{c.codigo}</span>
                  <span>{c.nombre}</span>
                  {!c.master_activo ? <Badge variant="secondary">maestro inactivo</Badge> : null}
                </label>
              ))}
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    saveSpeciesConfigMut.mutate({
                      sid: speciesCfgId,
                      activeIds: (speciesComponents ?? []).filter((x) => x.activo).map((x) => x.id),
                    })
                  }
                  disabled={saveSpeciesConfigMut.isPending}
                >
                  Guardar especie
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>

      {editing ? (
        <EditProcessResultComponentDialog
          row={editing}
          onClose={() => setEditId(null)}
          onSave={(body) => updateMut.mutate({ id: editing.id, body })}
          pending={updateMut.isPending}
        />
      ) : null}
      <MasterDeleteDialog
        open={confirmDeactivate != null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
        title="Borrar componente"
        label={confirmDeactivate?.label ?? ''}
        pending={deleteMut.isPending}
        onConfirm={() =>
          confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
        }
      />
    </Card>
  );
}

function EditProcessResultComponentDialog({
  row,
  onClose,
  onSave,
  pending,
}: {
  row: ProcessResultComponentRow;
  onClose: () => void;
  onSave: (body: z.infer<typeof editProcessResultComponentSchema>) => void;
  pending: boolean;
}) {
  const f = useForm<z.infer<typeof editProcessResultComponentSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(editProcessResultComponentSchema),
    defaultValues: {
      codigo: row.codigo,
      nombre: row.nombre,
      sort_order: row.sort_order,
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar componente variable</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={f.handleSubmit((v) =>
            onSave({
              codigo: v.codigo.trim().toUpperCase(),
              nombre: v.nombre.trim(),
              sort_order: v.sort_order,
            }),
          )}
          className="grid gap-3"
        >
          <div className="grid gap-2">
            <Label>Código</Label>
            <Input {...f.register('codigo')} />
          </div>
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input {...f.register('nombre')} />
          </div>
          <div className="grid gap-2">
            <Label>Orden</Label>
            <Input type="number" {...f.register('sort_order', { valueAsNumber: true })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const clientMasterSchema = z.object({
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(1).max(200),
  pais: z.string().optional(),
  mercado_id: z.coerce.number().int().min(0),
});

const editClientMasterSchema = clientMasterSchema;

type ClientUpdatePayload = {
  codigo: string;
  nombre: string;
  pais?: string;
  mercado_id: number | null;
};

function ClientsSection({
  list,
  mercados,
  canWrite,
  queryClient,
}: {
  list: ClientMasterRow[];
  mercados: { id: number; codigo: string; nombre: string; activo: boolean }[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo} ${r.nombre} ${r.pais ?? ''} ${r.mercado?.nombre ?? ''}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: number; label: string } | null>(null);
  const form = useForm<z.infer<typeof clientMasterSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(clientMasterSchema),
    defaultValues: { codigo: '', nombre: '', pais: '', mercado_id: 0 },
  });

  const createMut = useMutation({
    mutationFn: (body: z.infer<typeof clientMasterSchema>) =>
      apiJson('/api/masters/clients', {
        method: 'POST',
        body: JSON.stringify({
          codigo: body.codigo.trim(),
          nombre: body.nombre.trim(),
          pais: body.pais?.trim() || undefined,
          mercado_id: body.mercado_id > 0 ? body.mercado_id : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'clients'] });
      toast.success('Cliente creado');
      setOpen(false);
      form.reset({ codigo: '', nombre: '', pais: '', mercado_id: 0 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Partial<ClientUpdatePayload>;
    }) =>
      apiJson(`/api/masters/clients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'clients'] });
      toast.success('Cliente actualizado');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/clients/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'clients'] });
      setConfirmDeactivate(null);
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint('/api/masters/clients', id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'clients'] });
      setConfirmDeactivate(null);
      toast.success('Cliente borrado');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const editing = editId != null ? list.find((r) => r.id === editId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Clientes</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Nuevo cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo cliente</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input {...form.register('codigo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>País (opc.)</Label>
                    <Input {...form.register('pais')} placeholder="Chile" autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Mercado (opc.)</Label>
                    <select
                      className={filterSelectClass}
                      {...form.register('mercado_id', { valueAsNumber: true })}
                    >
                      <option value={0}>—</option>
                      {mercados
                        .filter((m) => m.activo !== false)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMut.isPending}>
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Mercado</TableHead>
              <TableHead className="w-24">Activo</TableHead>
              {canWrite ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell>{r.pais ?? '—'}</TableCell>
                <TableCell>{r.mercado?.nombre ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={r.activo ? 'default' : 'secondary'}>{r.activo ? 'Sí' : 'No'}</Badge>
                </TableCell>
                {canWrite ? (
                  <TableCell className="text-right">
                    <MasterRowActions
                      canWrite
                      activo={r.activo}
                      onEdit={() => setEditId(r.id)}
                      onDeleteClick={() =>
                        setConfirmDeactivate({ id: r.id, label: `${r.codigo} — ${r.nombre}` })
                      }
                      onReactivate={() => setActivoMut.mutate({ id: r.id, activo: true })}
                      reactivatePending={setActivoMut.isPending}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editing ? (
          <EditClientDialog
            row={editing}
            mercados={mercados}
            onClose={() => setEditId(null)}
            onSave={(body) => updateMut.mutate({ id: editing.id, body })}
            pending={updateMut.isPending}
          />
        ) : null}
        <MasterDeleteDialog
          open={confirmDeactivate != null}
          onOpenChange={(o) => !o && setConfirmDeactivate(null)}
          title="Borrar cliente"
          label={confirmDeactivate?.label ?? ''}
          pending={deleteMut.isPending}
          onConfirm={() =>
            confirmDeactivate != null && deleteMut.mutate({ id: confirmDeactivate.id })
          }
        />
      </CardContent>
    </Card>
  );
}

function EditClientDialog({
  row,
  mercados,
  onClose,
  onSave,
  pending,
}: {
  row: ClientMasterRow;
  mercados: { id: number; codigo: string; nombre: string; activo: boolean }[];
  onClose: () => void;
  onSave: (body: ClientUpdatePayload) => void;
  pending: boolean;
}) {
  const f = useForm<z.infer<typeof editClientMasterSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(editClientMasterSchema),
    defaultValues: {
      codigo: row.codigo,
      nombre: row.nombre,
      pais: row.pais ?? '',
      mercado_id: row.mercado_id ?? 0,
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={f.handleSubmit((v) =>
            onSave({
              codigo: v.codigo.trim(),
              nombre: v.nombre.trim(),
              pais: v.pais?.trim() || undefined,
              mercado_id: v.mercado_id > 0 ? v.mercado_id : null,
            }),
          )}
          className="grid gap-3"
        >
          <div className="grid gap-2">
            <Label>Código</Label>
            <Input {...f.register('codigo')} />
          </div>
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input {...f.register('nombre')} />
          </div>
          <div className="grid gap-2">
            <Label>País</Label>
            <Input {...f.register('pais')} />
          </div>
          <div className="grid gap-2">
            <Label>Mercado</Label>
            <select
              className={filterSelectClass}
              {...f.register('mercado_id', { valueAsNumber: true })}
            >
              <option value={0}>—</option>
              {mercados
                .filter((m) => m.activo !== false)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const simpleCatalogSchema = z.object({
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(1).max(120),
});

function SimpleCatalogSection({
  title,
  description,
  list,
  canWrite,
  queryClient,
  queryKey,
  apiPath,
}: {
  title: string;
  description?: string;
  list: { id: number; codigo: string; nombre: string; activo: boolean }[];
  canWrite: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
  queryKey: string[];
  apiPath: string;
}) {
  const { role } = useAuth();
  const canForceDelete = role === 'admin';
  const { filter } = useMastersRowFilter();
  const rows = useMemo(
    () => filterRows(list, filter, (r) => `${r.codigo} ${r.nombre}`),
    [list, filter],
  );
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof simpleCatalogSchema>>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(simpleCatalogSchema),
    defaultValues: { codigo: '', nombre: '' },
  });

  const createMut = useMutation({
    mutationFn: (body: z.infer<typeof simpleCatalogSchema>) =>
      apiJson(`/api/masters/${apiPath}`, {
        method: 'POST',
        body: JSON.stringify({ codigo: body.codigo.trim(), nombre: body.nombre.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Registro creado');
      setOpen(false);
      form.reset({ codigo: '', nombre: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { codigo?: string; nombre?: string } }) =>
      apiJson(`/api/masters/${apiPath}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (source: InlineCodigoNombreRow) => {
      const lower = new Set(list.map((x) => x.codigo.toLowerCase()));
      const newCode = uniqueDuplicateCode(source.codigo, lower);
      return apiJson(`/api/masters/${apiPath}`, {
        method: 'POST',
        body: JSON.stringify({ codigo: newCode, nombre: source.nombre.trim() }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Duplicado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActivoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiJson(`/api/masters/${apiPath}/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(v.activo ? 'Reactivado' : 'Desactivado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiJson(buildMasterDeleteEndpoint(`/api/masters/${apiPath}`, id, force), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Registro borrado');
    },
    onError: (e: Error, vars) => {
      if (
        canForceDelete &&
        !vars.force &&
        canOfferForceDelete(e.message) &&
        window.confirm('Este registro está en uso. ¿Forzar borrado (admin)? Se eliminarán dependencias relacionadas.')
      ) {
        deleteMut.mutate({ id: vars.id, force: true });
        return;
      }
      toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> + Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo — {title}</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => createMut.mutate(v))} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Código</Label>
                    <Input {...form.register('codigo')} autoComplete="off" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Nombre</Label>
                    <Input {...form.register('nombre')} autoComplete="off" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    Crear
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className={cn(tableShell, 'overflow-x-auto')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[9.5rem]">Estado</TableHead>
                {canWrite ? <TableHead className="w-[1%]"> </TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <InlineCodigoNombreCatalogRow
                  key={r.id}
                  row={r}
                  canWrite={canWrite}
                  onPatch={(id, body) => updateMut.mutate({ id, body })}
                  onDuplicate={(src) => duplicateMut.mutate(src)}
                  onSetActivo={(id, activo) => setActivoMut.mutate({ id, activo })}
                  onDelete={(row) => {
                    if (window.confirm(`¿Borrar ${row.codigo} — ${row.nombre}? Esta acción no se puede deshacer.`)) {
                      deleteMut.mutate({ id: row.id });
                    }
                  }}
                  patchPending={updateMut.isPending && updateMut.variables?.id === r.id}
                  duplicatePending={duplicateMut.isPending && duplicateMut.variables?.id === r.id}
                  activoPending={setActivoMut.isPending && setActivoMut.variables?.id === r.id}
                  deletePending={deleteMut.isPending && deleteMut.variables?.id === r.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
