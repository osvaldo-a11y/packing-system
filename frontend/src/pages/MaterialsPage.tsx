import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Pencil, Plus, PlusCircle, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  btnToolbarPrimary,
  contentCard,
  filterInputClass,
  filterSelectClass,
  pageHeaderRow,
  pageSubtitle,
  pageTitle,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import type { RecipeApi } from './RecipesPage';

const MATERIAL_UOM_OPTIONS = ['unidad', 'lb', 'ml', 'kg'] as const;

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
  presentation_format_scope_ids?: number[];
  /** Presente en listados con relación cargada. */
  presentation_format?: { id: number; format_code: string } | null;
  client_id?: number | null;
  client_scope_ids?: number[];
  client?: { id: number; codigo: string; nombre: string } | null;
  clamshell_units_per_box?: string | null;
  activo: boolean;
};

type FormatPick = { id: number; format_code: string };

const createMaterialSchema = z.object({
  nombre_material: z.string().min(1, 'Requerido'),
  material_category_id: z.coerce.number().int().positive(),
  descripcion: z.string().optional(),
  unidad_medida: z.enum(MATERIAL_UOM_OPTIONS),
  costo_unitario: z.coerce.number().min(0),
  cantidad_disponible: z.coerce.number().min(0),
  presentation_format_ids: z.array(z.coerce.number().int().positive()).default([]),
  client_ids: z.array(z.coerce.number().int().positive()).default([]),
  clamshell_units_per_box: z.coerce.number().min(0).optional(),
});

const quickMaterialSchema = z.object({
  nombre_material: z.string().min(1, 'Requerido'),
  material_category_id: z.coerce.number().int().positive('Elegí categoría'),
});

type CreateMaterialForm = z.infer<typeof createMaterialSchema>;
type QuickMaterialForm = z.infer<typeof quickMaterialSchema>;

type MaterialMovementRow = {
  id: number;
  material_id: number;
  quantity_delta: string;
  ref_type: string | null;
  ref_id: number | null;
  nota: string | null;
  created_at: string;
};

type PatchMaterialBody = {
  nombre_material?: string;
  costo_unitario?: number;
  activo?: boolean;
  material_category_id?: number;
  presentation_format_id?: number | null;
  presentation_format_ids?: number[];
  client_id?: number | null;
  client_ids?: number[];
  clamshell_units_per_box?: number | null;
  unidad_medida?: string;
};

type MaterialFormatSummary = {
  generico: Array<{
    id: number;
    nombre_material: string;
    cantidad_disponible: string;
    unidad_medida: string;
    material_category_codigo: string | null;
    alcance: 'todos' | 'exclusivo';
    presentation_format_id: number | null;
    format_code: string | null;
  }>;
  por_formato: Array<{
    presentation_format_id: number;
    format_code: string;
    exclusivos: MaterialFormatSummary['generico'];
  }>;
};

type PackingSupplierRow = { id: number; codigo: string; nombre: string; activo: boolean };

type PackingMaterialLinkRow = {
  material_id: number;
  supplier_id: number;
  supplier_item_code: string | null;
  supplier_item_name: string | null;
  supplier: PackingSupplierRow;
};

function fetchMaterials() {
  return apiJson<PackagingMaterialRow[]>('/api/packaging/materials');
}

function fetchRecipes() {
  return apiJson<RecipeApi[]>('/api/packaging/recipes');
}

function recipeUsageCountByMaterial(recipes: RecipeApi[] | undefined): Map<number, number> {
  const m = new Map<number, number>();
  if (!recipes) return m;
  for (const r of recipes) {
    for (const it of r.items ?? []) {
      const id = it.material_id;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
  }
  return m;
}

function InlineCostInput({
  materialId,
  costo,
  onCommit,
  disabled,
}: {
  materialId: number;
  costo: string;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState(costo);
  useEffect(() => setVal(costo), [costo, materialId]);
  return (
    <Input
      type="number"
      step="0.0001"
      min={0}
      disabled={disabled}
      className={cn(filterInputClass, 'h-8 w-[7.5rem] tabular-nums')}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) {
          setVal(costo);
          return;
        }
        const prev = Number(costo);
        if (Math.abs(n - prev) < 1e-9) return;
        onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function SupplierLinkRow({
  link,
  canEditAlias,
  canUnlink,
  onSaveAlias,
  onUnlink,
  saving,
  unlinking,
}: {
  link: PackingMaterialLinkRow;
  canEditAlias: boolean;
  canUnlink: boolean;
  onSaveAlias: (p: { supplier_item_code?: string | null; supplier_item_name?: string | null }) => void;
  onUnlink: () => void;
  saving: boolean;
  unlinking: boolean;
}) {
  const [code, setCode] = useState(link.supplier_item_code ?? '');
  const [name, setName] = useState(link.supplier_item_name ?? '');
  useEffect(() => {
    setCode(link.supplier_item_code ?? '');
    setName(link.supplier_item_name ?? '');
  }, [link.supplier_item_code, link.supplier_item_name, link.material_id, link.supplier_id]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{link.supplier.nombre}</p>
          <p className="font-mono text-xs text-muted-foreground">{link.supplier.codigo}</p>
        </div>
        {canUnlink ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            disabled={unlinking}
            onClick={onUnlink}
          >
            Quitar
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-xs text-slate-600">Código en guía / factura</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!canEditAlias || saving}
            className={filterInputClass}
            placeholder="Ej. SKU proveedor"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-slate-600">Nombre según proveedor</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEditAlias || saving}
            className={filterInputClass}
            placeholder="Texto en remito"
          />
        </div>
      </div>
      {canEditAlias ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={saving}
          onClick={() =>
            onSaveAlias({
              supplier_item_code: code.trim() || null,
              supplier_item_name: name.trim() || null,
            })
          }
        >
          Guardar texto de guía
        </Button>
      ) : null}
    </div>
  );
}

function AddSupplierLinkForm({
  materialId,
  existingSupplierIds,
  suppliers,
  onLink,
  pending,
}: {
  materialId: number;
  existingSupplierIds: number[];
  suppliers: PackingSupplierRow[];
  onLink: (body: {
    material_id: number;
    supplier_id: number;
    supplier_item_code?: string | null;
    supplier_item_name?: string | null;
  }) => void;
  pending: boolean;
}) {
  const [supplierId, setSupplierId] = useState(0);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const available = suppliers.filter((s) => !existingSupplierIds.includes(s.id));

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agregar proveedor</p>
      <select
        className={filterSelectClass}
        value={supplierId}
        onChange={(e) => setSupplierId(Number(e.target.value))}
      >
        <option value={0}>Elegir proveedor…</option>
        {available.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre} ({s.codigo})
          </option>
        ))}
      </select>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Código en guía (opc.)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={filterInputClass}
        />
        <Input
          placeholder="Nombre en guía (opc.)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={filterInputClass}
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending || supplierId <= 0 || available.length === 0}
        onClick={() =>
          onLink({
            material_id: materialId,
            supplier_id: supplierId,
            supplier_item_code: code.trim() || null,
            supplier_item_name: name.trim() || null,
          })
        }
      >
        Vincular
      </Button>
    </div>
  );
}

function formatScopeIdsFromRow(row: PackagingMaterialRow): number[] {
  const scope = row.presentation_format_scope_ids;
  if (scope && scope.length > 0) return [...scope];
  if (row.presentation_format_id != null && row.presentation_format_id > 0) return [row.presentation_format_id];
  return [];
}

function clientScopeIdsFromRow(row: PackagingMaterialRow): number[] {
  const scope = row.client_scope_ids;
  if (scope && scope.length > 0) return [...scope];
  if (row.client_id != null && row.client_id > 0) return [row.client_id];
  return [];
}

export function MaterialsPage() {
  const { role } = useAuth();
  const canDelete = role === 'admin' || role === 'supervisor' || role === 'operator';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [kardexOpen, setKardexOpen] = useState(false);
  const [kardexMaterialId, setKardexMaterialId] = useState(0);
  const [moveDelta, setMoveDelta] = useState('');
  const [moveRefType, setMoveRefType] = useState('entrada');
  const [moveSupplierId, setMoveSupplierId] = useState(0);
  const [moveGuideRef, setMoveGuideRef] = useState('');
  const [moveNota, setMoveNota] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [scopeEditRow, setScopeEditRow] = useState<PackagingMaterialRow | null>(null);
  const [scopeFormatIds, setScopeFormatIds] = useState<number[]>([]);
  const [scopeClientIds, setScopeClientIds] = useState<number[]>([]);
  const [renameRow, setRenameRow] = useState<PackagingMaterialRow | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['packaging', 'materials'],
    queryFn: fetchMaterials,
  });

  const { data: recipes } = useQuery({
    queryKey: ['packaging', 'recipes'],
    queryFn: fetchRecipes,
  });

  const usageByMaterial = useMemo(() => recipeUsageCountByMaterial(recipes), [recipes]);

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

  const { data: movements } = useQuery({
    queryKey: ['packaging', 'movements', kardexMaterialId],
    queryFn: () => apiJson<MaterialMovementRow[]>(`/api/packaging/materials/${kardexMaterialId}/movements`),
    enabled: kardexMaterialId > 0 && kardexOpen,
  });

  const { data: formatSummary } = useQuery({
    queryKey: ['packaging', 'materials', 'summary-by-format'],
    queryFn: () => apiJson<MaterialFormatSummary>('/api/packaging/materials/summary-by-format'),
    staleTime: 60_000,
  });

  const { data: packingSuppliers } = useQuery({
    queryKey: ['masters', 'packing-suppliers'],
    queryFn: () => apiJson<PackingSupplierRow[]>('/api/masters/packing-suppliers'),
    staleTime: 120_000,
  });

  const [linkDialogMaterialId, setLinkDialogMaterialId] = useState(0);

  const { data: materialLinks } = useQuery({
    queryKey: ['masters', 'packing-material-links', linkDialogMaterialId],
    queryFn: () =>
      apiJson<PackingMaterialLinkRow[]>(`/api/masters/packing-material-links?material_id=${linkDialogMaterialId}`),
    enabled: linkDialogMaterialId > 0,
  });

  const { data: kardexMaterialLinks } = useQuery({
    queryKey: ['masters', 'packing-material-links', 'kardex', kardexMaterialId],
    queryFn: () =>
      apiJson<PackingMaterialLinkRow[]>(`/api/masters/packing-material-links?material_id=${kardexMaterialId}`),
    enabled: kardexMaterialId > 0 && kardexOpen,
  });

  const form = useForm<CreateMaterialForm>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      nombre_material: '',
      material_category_id: 0,
      descripcion: '',
      unidad_medida: 'unidad',
      costo_unitario: 0,
      cantidad_disponible: 0,
      presentation_format_ids: [],
      client_ids: [],
      clamshell_units_per_box: undefined,
    },
  });

  const quickForm = useForm<QuickMaterialForm>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(quickMaterialSchema),
    defaultValues: { nombre_material: '', material_category_id: 0 },
  });

  const defaultCategoryId = useMemo(
    () => materialCategories?.find((c) => c.activo !== false)?.id ?? 0,
    [materialCategories],
  );

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      const fid = materialCategories?.find((c) => c.activo !== false)?.id ?? 0;
      form.reset({
        nombre_material: '',
        material_category_id: fid,
        descripcion: '',
        unidad_medida: 'unidad',
        costo_unitario: 0,
        cantidad_disponible: 0,
        presentation_format_ids: [],
        client_ids: [],
        clamshell_units_per_box: undefined,
      });
    }
    prevOpen.current = open;
  }, [open, materialCategories, form.reset]);

  const prevQuick = useRef(false);
  useEffect(() => {
    if (quickOpen && !prevQuick.current) {
      quickForm.reset({
        nombre_material: '',
        material_category_id: defaultCategoryId || 0,
      });
    }
    prevQuick.current = quickOpen;
  }, [quickOpen, defaultCategoryId, quickForm.reset]);

  useEffect(() => {
    if (!scopeEditRow) return;
    setScopeFormatIds(formatScopeIdsFromRow(scopeEditRow));
    setScopeClientIds(clientScopeIdsFromRow(scopeEditRow));
  }, [scopeEditRow]);

  useEffect(() => {
    if (renameRow) setRenameValue(renameRow.nombre_material);
  }, [renameRow]);

  const materialCategoryIdW = useWatch({ control: form.control, name: 'material_category_id' });
  const selectedCatCodigo = materialCategories?.find((c) => c.id === materialCategoryIdW)?.codigo;
  const selectedFormatIds = useWatch({ control: form.control, name: 'presentation_format_ids' }) ?? [];
  const selectedClientIds = useWatch({ control: form.control, name: 'client_ids' }) ?? [];

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: PatchMaterialBody }) =>
      apiJson<PackagingMaterialRow>(`/api/packaging/materials/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials', 'summary-by-format'] });
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar'),
  });

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
          presentation_format_ids: body.presentation_format_ids,
          client_ids: body.client_ids,
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
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials', 'summary-by-format'] });
      toast.success('Material creado');
      setOpen(false);
      form.reset({
        nombre_material: '',
        material_category_id: defaultCategoryId,
        descripcion: '',
        unidad_medida: 'unidad',
        costo_unitario: 0,
        cantidad_disponible: 0,
        presentation_format_ids: [],
        client_ids: [],
        clamshell_units_per_box: undefined,
      });
    },
    onError: (e: Error) => {
      toast.error(e.message || 'No se pudo crear');
    },
  });

  const quickMutation = useMutation({
    mutationFn: (body: QuickMaterialForm) => {
      const nameNorm = body.nombre_material.trim().toLowerCase();
      const exists = (data ?? []).some((m) => m.activo && m.nombre_material.trim().toLowerCase() === nameNorm);
      if (exists) {
        throw new Error('Ya existe un material activo con ese nombre.');
      }
      return apiJson<PackagingMaterialRow>('/api/packaging/materials', {
        method: 'POST',
        body: JSON.stringify({
          nombre_material: body.nombre_material.trim(),
          material_category_id: body.material_category_id,
          unidad_medida: 'kg',
          costo_unitario: 0,
          cantidad_disponible: 0,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials', 'summary-by-format'] });
      toast.success('Material creado · completá costo en la tabla');
      setQuickOpen(false);
      quickForm.reset({ nombre_material: '', material_category_id: defaultCategoryId || 0 });
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo crear'),
  });

  const movementMut = useMutation({
    mutationFn: () => {
      const delta = Number(moveDelta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('Indicá un delta distinto de cero');
      const parts: string[] = [];
      if (moveGuideRef.trim()) parts.push(`Guía: ${moveGuideRef.trim()}`);
      if (moveSupplierId > 0) {
        const s = (kardexMaterialLinks ?? []).find((x) => x.supplier_id === moveSupplierId)?.supplier;
        if (s) parts.push(`Proveedor: ${s.nombre}`);
      }
      if (moveNota.trim()) parts.push(moveNota.trim());
      return apiJson<PackagingMaterialRow>(`/api/packaging/materials/${kardexMaterialId}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          quantity_delta: delta,
          nota: parts.length ? parts.join(' · ') : undefined,
          ref_type: moveRefType,
          ref_id: moveSupplierId > 0 ? moveSupplierId : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'movements', kardexMaterialId] });
      toast.success('Movimiento registrado');
      setMoveDelta('');
      setMoveRefType('entrada');
      setMoveGuideRef('');
      setMoveSupplierId(0);
      setMoveNota('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/packaging/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials', 'summary-by-format'] });
      toast.success('Material eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canManageSupplierLinks = role === 'admin' || role === 'supervisor';
  const canEditSupplierAliases = role === 'admin' || role === 'supervisor' || role === 'operator';

  const linkMut = useMutation({
    mutationFn: (body: {
      material_id: number;
      supplier_id: number;
      supplier_item_code?: string | null;
      supplier_item_name?: string | null;
    }) =>
      apiJson<PackingMaterialLinkRow>('/api/masters/packing-material-links', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'packing-material-links'] });
      toast.success('Proveedor vinculado');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo vincular'),
  });

  const patchLinkMut = useMutation({
    mutationFn: (body: {
      material_id: number;
      supplier_id: number;
      supplier_item_code?: string | null;
      supplier_item_name?: string | null;
    }) =>
      apiJson<PackingMaterialLinkRow>('/api/masters/packing-material-links', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'packing-material-links'] });
      toast.success('Datos de guía actualizados');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar'),
  });

  const unlinkMut = useMutation({
    mutationFn: (body: { material_id: number; supplier_id: number }) =>
      apiJson('/api/masters/packing-material-links/unlink', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'packing-material-links'] });
      toast.success('Vínculo quitado');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo quitar'),
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

  const tableRows = useMemo(() => {
    const list = data ?? [];
    const q = tableSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.nombre_material.toLowerCase().includes(q) ||
        (m.material_category?.nombre ?? '').toLowerCase().includes(q) ||
        (m.presentation_format?.format_code ?? '').toLowerCase().includes(q) ||
        (m.client?.nombre ?? '').toLowerCase().includes(q),
    );
  }, [data, tableSearch]);

  const savingId = updateMut.isPending && updateMut.variables ? updateMut.variables.id : null;

  const categoryOptions = (materialCategories ?? []).filter((c) => c.activo !== false);

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
    <div className="space-y-5">
      <div className={pageHeaderRow}>
        <div>
          <h1 className={pageTitle}>Materiales de empaque</h1>
          <p className={pageSubtitle}>Editá costo, categoría y estado desde la tabla · alta en segundos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="shrink-0 rounded-xl"
            type="button"
            onClick={() => {
              setKardexMaterialId(0);
              setMoveRefType('entrada');
              setMoveDelta('');
              setMoveGuideRef('');
              setMoveSupplierId(0);
              setMoveNota('');
              setKardexOpen(true);
            }}
          >
            Movimiento / kardex
          </Button>
          <Dialog
            open={quickOpen}
            onOpenChange={setQuickOpen}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="default" className={cn(btnToolbarPrimary, 'gap-2 rounded-xl')}>
                <Zap className="h-4 w-4" />
                Material rápido
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Material rápido</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={quickForm.handleSubmit((v) => quickMutation.mutate(v))}
                className="grid gap-4 py-1"
              >
                <div className="grid gap-1.5">
                  <Label className="text-xs text-slate-600">Nombre</Label>
                  <Input
                    className={filterInputClass}
                    autoComplete="off"
                    placeholder="Ej. Cinta 48mm"
                    {...quickForm.register('nombre_material')}
                  />
                  {quickForm.formState.errors.nombre_material && (
                    <p className="text-xs text-destructive">{quickForm.formState.errors.nombre_material.message}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-slate-600">Categoría</Label>
                  <select
                    className={filterSelectClass}
                    {...quickForm.register('material_category_id', { valueAsNumber: true })}
                  >
                    <option value={0}>Elegir…</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.codigo})
                      </option>
                    ))}
                  </select>
                  {quickForm.formState.errors.material_category_id && (
                    <p className="text-xs text-destructive">{quickForm.formState.errors.material_category_id.message}</p>
                  )}
                </div>
                <p className="text-xs text-slate-500">Unidad por defecto «unidad», costo 0 y stock 0. Ajustá en la tabla después.</p>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setQuickOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="rounded-xl" disabled={quickMutation.isPending}>
                    {quickMutation.isPending ? 'Creando…' : 'Crear'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="shrink-0 gap-2 rounded-xl">
                <Plus className="h-4 w-4" />
                Agregar material
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo material</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((vals) => mutation.mutate(vals))} className="grid gap-3 py-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="nombre_material">Nombre</Label>
                    <Input id="nombre_material" {...form.register('nombre_material')} autoComplete="off" />
                    {form.formState.errors.nombre_material && (
                      <p className="text-xs text-destructive">{form.formState.errors.nombre_material.message}</p>
                    )}
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="material_category_id">Categoría</Label>
                    <select
                      id="material_category_id"
                      className={filterSelectClass}
                      {...form.register('material_category_id', { valueAsNumber: true })}
                    >
                      <option value={0}>Elegir…</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({c.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Alcance por formato (check múltiple)</Label>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 px-2 py-2">
                    {(formatList ?? [])
                      .filter((f) => (f as { activo?: boolean }).activo !== false)
                      .map((f) => {
                        const checked = selectedFormatIds.includes(f.id);
                        return (
                          <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? selectedFormatIds.filter((id) => id !== f.id)
                                  : [...selectedFormatIds, f.id];
                                form.setValue('presentation_format_ids', next, { shouldDirty: true });
                              }}
                            />
                            <span>{f.format_code}</span>
                          </label>
                        );
                      })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Sin checks = todos los formatos. Con checks = exclusivo para los formatos seleccionados.
                  </p>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Alcance por cliente (check múltiple)</Label>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 px-2 py-2">
                    {(commercialClients ?? []).map((c) => {
                      const checked = selectedClientIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? selectedClientIds.filter((id) => id !== c.id)
                                : [...selectedClientIds, c.id];
                              form.setValue('client_ids', next, { shouldDirty: true });
                            }}
                          />
                          <span>
                            {c.nombre} ({c.codigo})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Sin checks = todos los clientes. Ideal para etiquetas/clamshell diferenciados por cliente.
                  </p>
                </div>
                {selectedCatCodigo === 'clamshell' ? (
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Unid. clamshell / caja (opc.)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      placeholder="1"
                      {...form.register('clamshell_units_per_box', { valueAsNumber: true })}
                    />
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="descripcion">Nota (opc.)</Label>
                  <Input id="descripcion" {...form.register('descripcion')} autoComplete="off" />
                </div>
                <div className="grid gap-3 sm:col-span-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="costo_unitario">Costo unit.</Label>
                    <Input
                      id="costo_unitario"
                      type="number"
                      step="0.0001"
                      min={0}
                      className={filterInputClass}
                      {...form.register('costo_unitario')}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cantidad_disponible">Stock inicial</Label>
                    <Input
                      id="cantidad_disponible"
                      type="number"
                      step="0.001"
                      min={0}
                      className={filterInputClass}
                      {...form.register('cantidad_disponible')}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="unidad_medida">Unidad medida</Label>
                    <select id="unidad_medida" className={filterSelectClass} {...form.register('unidad_medida')}>
                      {MATERIAL_UOM_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Guardando…' : 'Agregar material'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={kardexOpen}
            onOpenChange={(o) => {
              setKardexOpen(o);
              if (!o) setKardexMaterialId(0);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Kardex · movimientos de stock</DialogTitle>
                <DialogDescription>
                  Compras y reposición: cantidad <strong>positiva</strong> y tipo «Entrada» o «Inventario inicial». El
                  consumo en planta se descuenta al registrar <strong>consumos de tarja</strong>; acá solo ajustás
                  existencias (entradas, salidas manuales, inventario).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Material</Label>
                  <select
                    className={filterSelectClass}
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
                    {(() => {
                      const sel = (data ?? []).find((m) => m.id === kardexMaterialId);
                      const cur = sel ? Number(sel.cantidad_disponible) : NaN;
                      const d = Number(moveDelta);
                      const preview =
                        Number.isFinite(cur) && Number.isFinite(d) && d !== 0 ? (cur + d).toFixed(3) : null;
                      return sel ? (
                        <p className="text-sm text-muted-foreground">
                          Saldo actual:{' '}
                          <span className="font-mono font-medium text-foreground">{sel.cantidad_disponible}</span>
                          {preview != null ? (
                            <>
                              {' '}
                              → después del movimiento:{' '}
                              <span className="font-mono font-medium text-foreground">{preview}</span>
                            </>
                          ) : null}
                        </p>
                      ) : null;
                    })()}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Tipo de movimiento</Label>
                        <select
                          className={filterSelectClass}
                          value={moveRefType}
                          onChange={(e) => setMoveRefType(e.target.value)}
                        >
                          <option value="entrada">Entrada (compra / reposición)</option>
                          <option value="compra">Entrada factura / OC</option>
                          <option value="inventario_inicial">Inventario inicial (carga única)</option>
                          <option value="salida">Salida manual / merma</option>
                          <option value="final_inventario">Cierre inventario (temporada)</option>
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Cantidad (+ entra / − sale)</Label>
                        <Input
                          value={moveDelta}
                          onChange={(e) => setMoveDelta(e.target.value)}
                          placeholder="Ej. 500 (entrada) o -20 (salida)"
                          className={filterInputClass}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Entradas: número positivo. Salidas: negativo o tipo «Salida» con negativo.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label>Proveedor ligado (opc.)</Label>
                        <select
                          className={filterSelectClass}
                          value={moveSupplierId}
                          onChange={(e) => setMoveSupplierId(Number(e.target.value) || 0)}
                        >
                          <option value={0}>—</option>
                          {(kardexMaterialLinks ?? []).map((lnk) => (
                            <option key={lnk.supplier_id} value={lnk.supplier_id}>
                              {lnk.supplier.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Guía / referencia (opc.)</Label>
                        <Input
                          value={moveGuideRef}
                          onChange={(e) => setMoveGuideRef(e.target.value)}
                          placeholder="Ej. guía 12345"
                        />
                      </div>
                      <div className="grid gap-2 sm:col-span-2">
                        <Label>Nota (opc.)</Label>
                        <Input value={moveNota} onChange={(e) => setMoveNota(e.target.value)} placeholder="—" />
                      </div>
                    </div>
                    <Button type="button" disabled={movementMut.isPending} onClick={() => movementMut.mutate()}>
                      {movementMut.isPending ? 'Guardando…' : 'Registrar'}
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
        </div>
      </div>

      <Card className={contentCard}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Stock por alcance (referencial)</CardTitle>
          <CardDescription>
            Un mismo material tiene un solo saldo; «genérico» aplica a todos los formatos; «exclusivo» documenta uso
            principal. Para guías de entrada, abrí «Proveedor / guía» en cada fila y cargá código o nombre del proveedor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Genéricos (todos los formatos)</p>
            {formatSummary && formatSummary.generico.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50/50 p-2">
                {formatSummary.generico.map((m) => (
                  <li key={m.id} className="flex flex-wrap justify-between gap-2 text-[13px]">
                    <span className="font-medium text-slate-800">{m.nombre_material}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {m.cantidad_disponible} {m.unidad_medida}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">Ninguno activo con alcance «todos».</p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Por formato (exclusivos)</p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {(formatSummary?.por_formato ?? []).map((block) => (
                <div key={block.presentation_format_id} className="rounded-lg border border-slate-100 bg-white p-2">
                  <p className="font-mono text-xs font-semibold text-slate-700">{block.format_code}</p>
                  {block.exclusivos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin insumos marcados solo para este formato.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {block.exclusivos.map((m) => (
                        <li key={m.id} className="flex flex-wrap justify-between gap-2 text-[12px]">
                          <span>{m.nombre_material}</span>
                          <span className="font-mono tabular-nums text-slate-600">
                            {m.cantidad_disponible} {m.unidad_medida}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={linkDialogMaterialId > 0}
        onOpenChange={(o) => {
          if (!o) setLinkDialogMaterialId(0);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Proveedor y texto de guía</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Vinculá proveedores de empaque y el código o nombre que figura en remitos. Cualquier operador puede editar
              esos textos; dar de alta vínculos nuevos: supervisor/admin.
            </p>
          </DialogHeader>
          {linkDialogMaterialId > 0 && (
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium">
                {(data ?? []).find((m) => m.id === linkDialogMaterialId)?.nombre_material ?? `#${linkDialogMaterialId}`}
              </p>
              {(materialLinks ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin proveedores vinculados.</p>
              ) : (
                <div className="space-y-3">
                  {(materialLinks ?? []).map((lnk) => (
                    <SupplierLinkRow
                      key={`${lnk.material_id}-${lnk.supplier_id}`}
                      link={lnk}
                      canEditAlias={canEditSupplierAliases}
                      canUnlink={canManageSupplierLinks}
                      onSaveAlias={(patch) =>
                        patchLinkMut.mutate({
                          material_id: lnk.material_id,
                          supplier_id: lnk.supplier_id,
                          ...patch,
                        })
                      }
                      onUnlink={() =>
                        unlinkMut.mutate({ material_id: lnk.material_id, supplier_id: lnk.supplier_id })
                      }
                      saving={patchLinkMut.isPending}
                      unlinking={unlinkMut.isPending}
                    />
                  ))}
                </div>
              )}
              {canManageSupplierLinks && packingSuppliers && packingSuppliers.filter((s) => s.activo).length > 0 ? (
                <AddSupplierLinkForm
                  materialId={linkDialogMaterialId}
                  existingSupplierIds={(materialLinks ?? []).map((l) => l.supplier_id)}
                  suppliers={packingSuppliers.filter((s) => s.activo)}
                  onLink={(body) => linkMut.mutate(body)}
                  pending={linkMut.isPending}
                />
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={scopeEditRow != null}
        onOpenChange={(o) => {
          if (!o) setScopeEditRow(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alcance: formatos y clientes</DialogTitle>
          </DialogHeader>
          {scopeEditRow ? (
            <div className="grid gap-4 py-2">
              <p className="text-sm text-muted-foreground">
                Material: <span className="font-medium text-foreground">{scopeEditRow.nombre_material}</span>
              </p>
              <div className="grid gap-1.5">
                <Label>Formatos (sin checks = todos)</Label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 px-2 py-2">
                  {(formatList ?? [])
                    .filter((f) => (f as { activo?: boolean }).activo !== false)
                    .map((f) => {
                      const checked = scopeFormatIds.includes(f.id);
                      return (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setScopeFormatIds(
                                checked ? scopeFormatIds.filter((id) => id !== f.id) : [...scopeFormatIds, f.id],
                              );
                            }}
                          />
                          <span>{f.format_code}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Clientes (sin checks = todos)</Label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 px-2 py-2">
                  {(commercialClients ?? []).map((c) => {
                    const checked = scopeClientIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setScopeClientIds(
                              checked ? scopeClientIds.filter((id) => id !== c.id) : [...scopeClientIds, c.id],
                            );
                          }}
                        />
                        <span>
                          {c.nombre} ({c.codigo})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setScopeEditRow(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={updateMut.isPending || !scopeEditRow}
              onClick={() => {
                if (!scopeEditRow) return;
                updateMut.mutate(
                  {
                    id: scopeEditRow.id,
                    body: {
                      presentation_format_ids: scopeFormatIds,
                      client_ids: scopeClientIds,
                    },
                  },
                  {
                    onSuccess: () => {
                      toast.success('Alcance actualizado');
                      setScopeEditRow(null);
                    },
                  },
                );
              }}
            >
              {updateMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameRow != null}
        onOpenChange={(o) => {
          if (!o) setRenameRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar material</DialogTitle>
          </DialogHeader>
          {renameRow ? (
            <div className="grid gap-2 py-2">
              <Label htmlFor="rename_material_name">Nombre</Label>
              <Input
                id="rename_material_name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoComplete="off"
                disabled={savingId === renameRow.id}
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRenameRow(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                !renameRow ||
                updateMut.isPending ||
                savingId === renameRow?.id ||
                !renameValue.trim() ||
                renameValue.trim() === renameRow?.nombre_material
              }
              onClick={() => {
                if (!renameRow) return;
                const next = renameValue.trim();
                if (!next || next === renameRow.nombre_material) return;
                updateMut.mutate(
                  { id: renameRow.id, body: { nombre_material: next } },
                  {
                    onSuccess: () => {
                      toast.success('Nombre actualizado');
                      setRenameRow(null);
                    },
                  },
                );
              }}
            >
              {updateMut.isPending && savingId === renameRow?.id ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className={contentCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Inventario</CardTitle>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Filtrar tabla…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className={cn(filterInputClass, 'max-w-md')}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className={tableShell}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="min-w-[140px] text-xs font-semibold uppercase text-slate-500">Material</TableHead>
                    <TableHead className="min-w-[160px] text-xs font-semibold uppercase text-slate-500">Categoría</TableHead>
                    <TableHead className="min-w-[130px] text-xs font-semibold uppercase text-slate-500">Alcance</TableHead>
                    <TableHead className="min-w-[120px] text-xs font-semibold uppercase text-slate-500">Cliente</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-slate-500">Costo unit.</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Stock</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase text-slate-500">En recetas</TableHead>
                    <TableHead className="min-w-[100px] text-xs font-semibold uppercase text-slate-500">Estado</TableHead>
                    <TableHead className="w-11 text-center text-xs font-semibold uppercase text-slate-500">Guía</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-slate-500">
                        Sin filas
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRows.map((row) => {
                      const usage = usageByMaterial.get(row.id) ?? 0;
                      const busy = savingId === row.id;
                      return (
                        <TableRow key={row.id} className="border-slate-100/90">
                          <TableCell className="max-w-[200px]">
                            <div className="flex items-center gap-2">
                              {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" /> : null}
                              <span className="min-w-0 flex-1 font-medium text-slate-900">{row.nombre_material}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-800"
                                title="Renombrar"
                                disabled={busy}
                                onClick={() => setRenameRow(row)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <select
                              className={cn(filterSelectClass, 'h-8 min-w-[150px] max-w-[200px] text-sm')}
                              value={row.material_category_id}
                              disabled={busy}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (v === row.material_category_id) return;
                                updateMut.mutate({ id: row.id, body: { material_category_id: v } });
                              }}
                            >
                              {!categoryOptions.some((c) => c.id === row.material_category_id) && (
                                <option value={row.material_category_id}>
                                  {row.material_category?.nombre ?? `#${row.material_category_id}`}
                                </option>
                              )}
                              {categoryOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell>
                            {(row.presentation_format_scope_ids?.length ?? 0) > 1 ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">Múltiple ({row.presentation_format_scope_ids?.length})</Badge>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={busy}
                                  onClick={() => setScopeEditRow(row)}
                                >
                                  Editar
                                </Button>
                              </div>
                            ) : (
                              <select
                                className={cn(filterSelectClass, 'h-8 min-w-[120px] max-w-[190px] text-sm')}
                                value={row.presentation_format_id ?? 0}
                                disabled={busy}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  const next: number | null = v > 0 ? v : null;
                                  const cur = row.presentation_format_id ?? null;
                                  if (next === cur) return;
                                  updateMut.mutate({ id: row.id, body: { presentation_format_id: next } });
                                }}
                              >
                                <option value={0}>Todos</option>
                                {(formatList ?? [])
                                  .filter((f) => (f as { activo?: boolean }).activo !== false)
                                  .map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.format_code}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </TableCell>
                          <TableCell>
                            {(row.client_scope_ids?.length ?? 0) > 1 ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">Múltiple ({row.client_scope_ids?.length})</Badge>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={busy}
                                  onClick={() => setScopeEditRow(row)}
                                >
                                  Editar
                                </Button>
                              </div>
                            ) : (
                              <select
                                className={cn(filterSelectClass, 'h-8 min-w-[110px] max-w-[200px] text-sm')}
                                value={row.client_id ?? 0}
                                disabled={busy}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  const next: number | null = v > 0 ? v : null;
                                  if (next === (row.client_id ?? null)) return;
                                  updateMut.mutate({ id: row.id, body: { client_id: next } });
                                }}
                              >
                                <option value={0}>Todos</option>
                                {(commercialClients ?? []).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
                                  </option>
                                ))}
                              </select>
                            )}
                          </TableCell>
                          <TableCell>
                            <InlineCostInput
                              materialId={row.id}
                              costo={row.costo_unitario}
                              disabled={busy}
                              onCommit={(n) => updateMut.mutate({ id: row.id, body: { costo_unitario: n } })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="font-mono text-sm tabular-nums text-slate-800">{row.cantidad_disponible}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-800"
                                title="Registrar entrada o movimiento (kardex)"
                                disabled={busy}
                                onClick={() => {
                                  setKardexMaterialId(row.id);
                                  setMoveRefType('entrada');
                                  setMoveDelta('');
                                  setMoveGuideRef('');
                                  setMoveSupplierId(0);
                                  setMoveNota('');
                                  setKardexOpen(true);
                                }}
                              >
                                <PlusCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {usage > 0 ? (
                              <Badge variant="secondary" className="tabular-nums">
                                {usage}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <select
                              className={cn(filterSelectClass, 'h-8 w-[110px] text-sm')}
                              value={row.activo ? '1' : '0'}
                              disabled={busy}
                              onChange={(e) => {
                                const on = e.target.value === '1';
                                if (on === row.activo) return;
                                updateMut.mutate({ id: row.id, body: { activo: on } });
                              }}
                            >
                              <option value="1">Activo</option>
                              <option value="0">Inactivo</option>
                            </select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="Proveedor / texto de guía"
                              onClick={() => setLinkDialogMaterialId(row.id)}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            {canDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'text-destructive hover:text-destructive',
                                  usage > 0 && 'opacity-60 hover:opacity-80',
                                )}
                                disabled={deleteMut.isPending}
                                title={
                                  usage > 0
                                    ? `Usado en ${usage} línea(s) de receta — quitá el insumo en Recetas antes de eliminar`
                                    : 'Eliminar material'
                                }
                                aria-label={
                                  usage > 0
                                    ? `Eliminar no disponible: en ${usage} línea(s) de receta`
                                    : `Eliminar ${row.nombre_material}`
                                }
                                onClick={() => {
                                  if (usage > 0) {
                                    toast.error(
                                      `No se puede eliminar: el material está en ${usage} línea(s) de receta. En «Recetas», editá cada receta y quitá este insumo.`,
                                    );
                                    return;
                                  }
                                  if (!confirm(`¿Eliminar «${row.nombre_material}»?`)) return;
                                  deleteMut.mutate(row.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Avisos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">Duplicados (mismo nombre)</p>
            {duplicates.length === 0 ? (
              <p className="text-muted-foreground">Ninguno.</p>
            ) : (
              <div className="space-y-2">
                {duplicates.map((g) => (
                  <div key={g.name} className="rounded-md border border-border p-2">
                    <p className="font-medium">{g.rows[0].nombre_material}</p>
                    <p className="text-xs text-muted-foreground">Dejar uno activo.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {g.rows.map((r, idx) => (
                        <Button
                          key={r.id}
                          type="button"
                          size="sm"
                          variant={idx === 0 ? 'outline' : 'destructive'}
                          disabled={!canDelete || deleteMut.isPending || idx === 0}
                          title={idx === 0 ? 'Conservar (más antiguo)' : 'Eliminar'}
                          onClick={() => deleteMut.mutate(r.id)}
                        >
                          {idx === 0 ? `Mantener #${r.id}` : `Quitar #${r.id}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-foreground">Nombre igual a un formato</p>
            {formatLikeMaterials.length === 0 ? (
              <p className="text-muted-foreground">Ninguno.</p>
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
                    Quitar «{m.nombre_material}»
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
