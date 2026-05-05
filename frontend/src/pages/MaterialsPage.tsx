import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Boxes,
  Check,
  ClipboardList,
  Droplets,
  FileStack,
  Info,
  Layers,
  LayoutGrid,
  Package,
  PackageOpen,
  Plus,
  Printer,
  Ribbon,
  Search,
  Shrink,
  Tag,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
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
  operationalModalBodyClass,
  operationalModalContentClass,
  operationalModalDescriptionClass,
  operationalModalFooterClass,
  operationalModalFormClass,
  operationalModalHeaderClass,
  operationalModalSectionCard,
  operationalModalSectionMuted,
  operationalModalSectionHeadingRow,
  operationalModalStepBadge,
  operationalModalStepTitle,
  operationalModalTitleClass,
  pageHeaderRow,
  pageSubtitle,
  pageTitle,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

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

function formatQty(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

function formatMoneySimple(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const KARDEX_MATERIAL_GROUP_ORDER = ['Etiquetas', 'Cajas', 'Clamshell', 'Otros'] as const;

function kardexMaterialPickerGroupLabel(cat?: { codigo: string; nombre: string }): string {
  const code = (cat?.codigo ?? 'otros').toLowerCase();
  if (code === 'etiquetas' || code === 'cintas') return 'Etiquetas';
  if (code === 'cajas' || code === 'caja' || code.includes('caja')) return 'Cajas';
  if (code === 'clamshell') return 'Clamshell';
  if (code === 'otros') return 'Otros';
  if (code.includes('etiqueta')) return 'Etiquetas';
  if (code.includes('clam')) return 'Clamshell';
  return 'Otros';
}

function kardexMaterialGroupSortKey(label: string): number {
  const i = (KARDEX_MATERIAL_GROUP_ORDER as readonly string[]).indexOf(label);
  return i === -1 ? 99 : i;
}

const PACKAGING_CATEGORY_HEADER_TONES = [
  'border-sky-200/80 bg-sky-50 text-sky-800 shadow-sm',
  'border-violet-200/75 bg-violet-50 text-violet-900 shadow-sm',
  'border-emerald-200/75 bg-emerald-50 text-emerald-900 shadow-sm',
  'border-amber-200/80 bg-amber-50 text-amber-950 shadow-sm',
] as const;

function packagingCategorySlug(cat: { codigo: string; nombre: string }): string {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return `${norm(cat.codigo)} ${norm(cat.nombre)}`.trim();
}

/** Ícono para encabezado de grupo en inventario; usa código + nombre de la categoría. */
function packagingCategorySectionIcon(cat: { codigo: string; nombre: string }): LucideIcon {
  const raw = packagingCategorySlug(cat);

  if (/\bclamshell\b|clam/.test(raw)) return PackageOpen;
  if (/corner|esquin|corner\s*board|angul protector/.test(raw)) return LayoutGrid;
  if (/\bpalet|pallet|tarima\b/.test(raw)) return Boxes;
  if (/etiquet|\blabel\b/.test(raw)) return Tag;
  if (/cinta|adhesiv|tape/.test(raw)) return Ribbon;
  if (/\bcaja|cajas\b/.test(raw)) return Box;
  if (/bolsa|poly|saco\b/.test(raw)) return Package;
  if (/film|stretch|envol|rollo estir/.test(raw)) return Shrink;
  if (/liqu|gel|\bml\b|tapon|\btapa\b/.test(raw)) return Droplets;
  if (/foam|espum|insert|separador|division/.test(raw)) return Layers;
  if (/papel|carton|corruga|liner|linerboard/.test(raw)) return FileStack;
  if (/impres|\bribbon\b/.test(raw)) return Printer;
  if (/herramient|consum|misc|\botros\b|\bgeneral\b/.test(raw)) return ClipboardList;
  return Package;
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
  const [moveRefType, setMoveRefType] = useState('compra');
  const [moveSupplierId, setMoveSupplierId] = useState(0);
  const [moveGuideRef, setMoveGuideRef] = useState('');
  const [moveGuiaRef, setMoveGuiaRef] = useState('');
  const [moveInvoiceRef, setMoveInvoiceRef] = useState('');
  const [moveNota, setMoveNota] = useState('');
  const [moveUnitCostRef, setMoveUnitCostRef] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState(0);
  const [materialPickerSearch, setMaterialPickerSearch] = useState('');
  const [scopeEditRow, setScopeEditRow] = useState<PackagingMaterialRow | null>(null);
  const [scopeFormatIds, setScopeFormatIds] = useState<number[]>([]);
  const [scopeClientIds, setScopeClientIds] = useState<number[]>([]);
  const [renameRow, setRenameRow] = useState<PackagingMaterialRow | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data, isPending, isError, error } = useQuery({
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

  const { data: movements } = useQuery({
    queryKey: ['packaging', 'movements', kardexMaterialId],
    queryFn: () => apiJson<MaterialMovementRow[]>(`/api/packaging/materials/${kardexMaterialId}/movements`),
    enabled: kardexMaterialId > 0 && kardexOpen,
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
      if (moveRefType === 'compra') {
        if (moveGuideRef.trim()) parts.push(`OC: ${moveGuideRef.trim()}`);
        if (moveGuiaRef.trim()) parts.push(`Guía: ${moveGuiaRef.trim()}`);
        if (moveInvoiceRef.trim()) parts.push(`Factura: ${moveInvoiceRef.trim()}`);
      } else if (moveGuideRef.trim()) {
        parts.push(`Guía: ${moveGuideRef.trim()}`);
      }
      if (moveRefType === 'compra') {
        if (moveSupplierId > 0) {
          const s = (kardexMaterialLinks ?? []).find((x) => x.supplier_id === moveSupplierId)?.supplier;
          if (s) parts.push(`Proveedor: ${s.nombre}`);
        }
        if (moveUnitCostRef.trim()) parts.push(`Costo unitario ref: ${moveUnitCostRef.trim()}`);
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
      setMoveRefType('compra');
      setMoveGuideRef('');
      setMoveGuiaRef('');
      setMoveInvoiceRef('');
      setMoveSupplierId(0);
      setMoveNota('');
      setMoveUnitCostRef('');
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

  const inventorySummary = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.activo);
    const categories = new Set<number>();
    let stockLines = 0;
    let stockValue = 0;
    for (const r of rows) {
      categories.add(r.material_category_id);
      const qty = Number(r.cantidad_disponible);
      const cost = Number(r.costo_unitario);
      if (Number.isFinite(qty) && Math.abs(qty) > 0) stockLines += 1;
      if (Number.isFinite(qty) && Number.isFinite(cost)) stockValue += qty * cost;
    }
    return { activeMaterials: rows.length, categories: categories.size, stockLines, stockValue };
  }, [data]);

  const groupedInventory = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.activo);
    const byCategory = new Map<number, PackagingMaterialRow[]>();
    for (const row of rows) {
      const arr = byCategory.get(row.material_category_id) ?? [];
      arr.push(row);
      byCategory.set(row.material_category_id, arr);
    }
    return (materialCategories ?? [])
      .filter((c) => byCategory.has(c.id))
      .map((cat) => ({
        category: cat,
        items: (byCategory.get(cat.id) ?? []).sort((a, b) => a.nombre_material.localeCompare(b.nombre_material)),
      }));
  }, [data, materialCategories]);

  const categoryById = useMemo(() => {
    const map = new Map<number, { id: number; codigo: string; nombre: string; activo: boolean }>();
    for (const c of materialCategories ?? []) map.set(c.id, c);
    return map;
  }, [materialCategories]);

  const groupedInventoryFiltered = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    return groupedInventory
      .map((group) => ({
        ...group,
        items: group.items.filter((row) => {
          if (inventoryCategoryFilter > 0 && row.material_category_id !== inventoryCategoryFilter) return false;
          if (!q) return true;
          return row.nombre_material.toLowerCase().includes(q);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedInventory, inventoryCategoryFilter, inventorySearch]);

  const groupedPickerOptions = useMemo(() => {
    const q = materialPickerSearch.trim().toLowerCase();
    const rows = (data ?? [])
      .filter((row) => row.activo)
      .filter((row) => {
        if (!q) return true;
        const cat = categoryById.get(row.material_category_id);
        return (
          row.nombre_material.toLowerCase().includes(q) ||
          (cat?.nombre ?? '').toLowerCase().includes(q) ||
          (cat?.codigo ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.nombre_material.localeCompare(b.nombre_material));

    const map = new Map<string, { label: string; items: PackagingMaterialRow[] }>();
    for (const row of rows) {
      const cat = categoryById.get(row.material_category_id);
      const label = kardexMaterialPickerGroupLabel(cat);
      const bucket = map.get(label) ?? { label, items: [] };
      bucket.items.push(row);
      map.set(label, bucket);
    }
    return [...map.values()].sort((a, b) => {
      const da = kardexMaterialGroupSortKey(a.label);
      const db = kardexMaterialGroupSortKey(b.label);
      if (da !== db) return da - db;
      return a.label.localeCompare(b.label);
    });
  }, [data, materialPickerSearch, categoryById]);

  const selectedKardexMaterial = useMemo(
    () => (data ?? []).find((m) => m.id === kardexMaterialId) ?? null,
    [data, kardexMaterialId],
  );

  const canSubmitAdjustment = useMemo(() => {
    if (!selectedKardexMaterial) return false;
    const delta = Number(moveDelta);
    if (!Number.isFinite(delta) || delta === 0) return false;
    if (moveRefType === 'compra') return moveSupplierId > 0;
    if (moveRefType === 'salida') return moveNota.trim().length > 0;
    if (moveRefType === 'manual') return moveNota.trim().length > 0;
    if (moveRefType === 'inventario_inicial') return true;
    return false;
  }, [selectedKardexMaterial, moveDelta, moveRefType, moveSupplierId, moveNota]);

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
          <p className={pageSubtitle}>Gestión operativa de stock, ajustes y trazabilidad de costos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="shrink-0 rounded-xl"
            type="button"
            onClick={() => {
              setKardexMaterialId(0);
              setMoveRefType('compra');
              setMoveDelta('');
              setMoveGuideRef('');
              setMoveGuiaRef('');
              setMoveInvoiceRef('');
              setMoveSupplierId(0);
              setMoveNota('');
              setMoveUnitCostRef('');
              setMaterialPickerSearch('');
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
            <DialogContent className="max-h-[min(90vh,640px)] w-full max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(28rem,calc(100vw-2rem))]">
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
            <DialogContent
              className={cn(
                operationalModalContentClass,
                'min-h-0 max-h-[min(96vh,920px)] max-w-[min(920px,calc(100vw-2rem))] sm:max-w-[min(920px,calc(100vw-2rem))]',
              )}
            >
              <DialogHeader className={operationalModalHeaderClass}>
                <DialogTitle className={operationalModalTitleClass}>Nuevo material</DialogTitle>
                <DialogDescription className={operationalModalDescriptionClass}>
                  Alta en maestro con alcance, unidad y stock inicial. Queda listo para compras, recetas y Kardex.
                </DialogDescription>
                <details className="group text-[13px] text-muted-foreground">
                  <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                      <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      Consejos para un registro limpio
                    </span>
                  </summary>
                  <ul className="mt-2 max-w-prose list-disc space-y-1.5 pl-4 text-pretty leading-snug">
                    <li>
                      <strong className="font-medium text-foreground">Alcance vacío = general.</strong> Sin formatos ni clientes marcados, el
                      material aplica a toda la operación.
                    </li>
                    <li>
                      Marcá formatos o clientes solo cuando el consumo sea distinto (etiquetas por cliente, clamshell por formato, etc.).
                    </li>
                    <li>
                      El <strong className="font-medium text-foreground">stock inicial</strong> y el costo se pueden ajustar después; conviene
                      que la unidad (unidad, lb, ml, kg) coincida con cómo comprás y consumís en recetas.
                    </li>
                  </ul>
                </details>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit((vals) => mutation.mutate(vals))}
                className={cn(operationalModalFormClass, 'min-h-0 gap-0')}
              >
                <div className={cn(operationalModalBodyClass, 'lg:overflow-hidden lg:px-8 lg:py-5')}>
                  <div className="flex min-h-0 flex-col gap-5 lg:max-h-[min(78vh,760px)] lg:grid lg:grid-cols-2 lg:gap-6 lg:overflow-hidden">
                    <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
                      <section className={operationalModalSectionCard}>
                        <div className={operationalModalSectionHeadingRow}>
                          <span className={operationalModalStepBadge}>1</span>
                          <h3 className={operationalModalStepTitle}>Identificación</h3>
                        </div>
                        <div className="grid gap-3">
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-slate-600" htmlFor="nombre_material">
                              Nombre
                            </Label>
                            <Input
                              id="nombre_material"
                              className={filterInputClass}
                              autoComplete="off"
                              placeholder="Ej. Tape 48mm transparente"
                              {...form.register('nombre_material')}
                            />
                            {form.formState.errors.nombre_material ? (
                              <p className="text-xs text-destructive">{form.formState.errors.nombre_material.message}</p>
                            ) : null}
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-slate-600" htmlFor="material_category_id">
                              Categoría
                            </Label>
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
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-slate-600" htmlFor="descripcion">
                              Nota interna (opc.)
                            </Label>
                            <Input id="descripcion" className={filterInputClass} autoComplete="off" {...form.register('descripcion')} />
                          </div>
                        </div>
                      </section>
                      <section className={operationalModalSectionCard}>
                        <div className={operationalModalSectionHeadingRow}>
                          <span className={operationalModalStepBadge}>2</span>
                          <h3 className={operationalModalStepTitle}>Alcance por formato</h3>
                        </div>
                        <div className="max-h-[min(200px,28vh)] space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 px-2 py-2">
                          {(formatList ?? [])
                            .filter((f) => (f as { activo?: boolean }).activo !== false)
                            .map((f) => {
                              const checked = selectedFormatIds.includes(f.id);
                              return (
                                <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    className="rounded border-slate-300"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? selectedFormatIds.filter((id) => id !== f.id)
                                        : [...selectedFormatIds, f.id];
                                      form.setValue('presentation_format_ids', next, { shouldDirty: true });
                                    }}
                                  />
                                  <span className="font-mono text-[13px]">{f.format_code}</span>
                                </label>
                              );
                            })}
                        </div>
                        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                          Vacío = todos los formatos. Con selección = solo esos códigos.
                        </p>
                      </section>
                    </div>
                    <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pl-1">
                      <section className={operationalModalSectionCard}>
                        <div className={operationalModalSectionHeadingRow}>
                          <span className={operationalModalStepBadge}>3</span>
                          <h3 className={operationalModalStepTitle}>Alcance por cliente</h3>
                        </div>
                        <div className="max-h-[min(200px,28vh)] space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 px-2 py-2">
                          {(commercialClients ?? []).map((c) => {
                            const checked = selectedClientIds.includes(c.id);
                            return (
                              <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? selectedClientIds.filter((id) => id !== c.id)
                                      : [...selectedClientIds, c.id];
                                    form.setValue('client_ids', next, { shouldDirty: true });
                                  }}
                                />
                                <span>
                                  {c.nombre}{' '}
                                  <span className="text-muted-foreground">({c.codigo})</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                          Vacío = todos los clientes. Útil para materiales dedicados por cuenta.
                        </p>
                      </section>
                      <section className={operationalModalSectionMuted}>
                        <div className={operationalModalSectionHeadingRow}>
                          <span className={operationalModalStepBadge}>4</span>
                          <h3 className={operationalModalStepTitle}>Unidad, costos e inventario inicial</h3>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5 sm:col-span-2">
                            <Label className="text-xs text-slate-600" htmlFor="unidad_medida">
                              Unidad de medida
                            </Label>
                            <select id="unidad_medida" className={filterSelectClass} {...form.register('unidad_medida')}>
                              {MATERIAL_UOM_OPTIONS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-slate-600" htmlFor="costo_unitario">
                              Costo unitario
                            </Label>
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
                            <Label className="text-xs text-slate-600" htmlFor="cantidad_disponible">
                              Stock inicial
                            </Label>
                            <Input
                              id="cantidad_disponible"
                              type="number"
                              step="0.001"
                              min={0}
                              className={filterInputClass}
                              {...form.register('cantidad_disponible')}
                            />
                          </div>
                          {selectedCatCodigo === 'clamshell' ? (
                            <div className="grid gap-1.5 sm:col-span-2">
                              <Label className="text-xs text-slate-600">Unidades clamshell por caja (opc.)</Label>
                              <Input
                                type="number"
                                step="0.0001"
                                min={0}
                                placeholder="1"
                                className={filterInputClass}
                                {...form.register('clamshell_units_per_box', { valueAsNumber: true })}
                              />
                            </div>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
                <DialogFooter className={operationalModalFooterClass}>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className={cn(btnToolbarPrimary)} disabled={mutation.isPending}>
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
              if (!o) {
                setKardexMaterialId(0);
                setMaterialPickerSearch('');
              }
            }}
          >
            <DialogContent
              className={cn(
                operationalModalContentClass,
                'min-h-0 max-h-[min(96vh,1000px)] max-w-[min(1280px,calc(100vw-2rem))] sm:max-w-[min(1280px,calc(100vw-2rem))]',
              )}
            >
              <DialogHeader className={operationalModalHeaderClass}>
                <DialogTitle className={operationalModalTitleClass}>Ajuste de inventario</DialogTitle>
                <DialogDescription className={operationalModalDescriptionClass}>
                  Modifica el stock actual y registra el movimiento en Kardex.
                </DialogDescription>
                <details className="group text-[13px] text-muted-foreground">
                  <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                      <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      Más detalle para operación
                    </span>
                  </summary>
                  <p className="mt-2 max-w-prose text-pretty leading-snug">
                    Elegí el material y el tipo de movimiento. Las compras exigen proveedor vinculado; salidas y correcciones exigen motivo
                    claro. El inventario inicial es solo para la primera carga histórica. Todo queda trazado en Kardex con fecha y referencia.
                  </p>
                </details>
              </DialogHeader>

              <div className={operationalModalFormClass}>
                <div
                  className={cn(
                    operationalModalBodyClass,
                    'lg:overflow-hidden lg:px-8 lg:py-6',
                  )}
                >
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:grid lg:max-h-[min(82vh,860px)] lg:grid-cols-[minmax(min(320px,100%),min(460px,44vw))_minmax(0,1fr)] lg:grid-rows-1 lg:items-start lg:gap-8 lg:overflow-hidden">
                    <section
                      className={cn(
                        operationalModalSectionCard,
                        'flex min-h-0 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden',
                      )}
                    >
                      <div className={operationalModalSectionHeadingRow}>
                        <span className={operationalModalStepBadge}>1</span>
                        <h3 className={operationalModalStepTitle}>Material</h3>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div className="relative shrink-0">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={materialPickerSearch}
                            onChange={(e) => setMaterialPickerSearch(e.target.value)}
                            placeholder="Buscar material..."
                            className={cn(filterInputClass, 'pl-9')}
                            aria-label="Buscar material"
                          />
                        </div>
                        <div className="min-h-[200px] flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 lg:min-h-0">
                          {groupedPickerOptions.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados.</p>
                          ) : (
                            <div className="divide-y divide-border/80 p-1.5">
                              {groupedPickerOptions.map((group) => (
                                <div key={group.label} className="py-2 first:pt-0 last:pb-0">
                                  <p className="sticky top-0 z-[1] bg-muted/10 px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-[2px]">
                                    {group.label}
                                  </p>
                                  <div className="space-y-1">
                                    {group.items.map((row) => {
                                      const selected = row.id === kardexMaterialId;
                                      return (
                                        <button
                                          key={`pick-${row.id}`}
                                          type="button"
                                          className={cn(
                                            'flex w-full flex-col gap-0.5 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors sm:flex-row sm:items-start sm:justify-between sm:gap-3',
                                            selected
                                              ? 'border-primary/35 bg-primary/8'
                                              : 'hover:border-border hover:bg-background',
                                          )}
                                          onClick={() => {
                                            setKardexMaterialId(row.id);
                                            setMaterialPickerSearch('');
                                          }}
                                        >
                                          <span className="min-w-0 text-sm font-medium leading-snug text-foreground">{row.nombre_material}</span>
                                          <div className="flex shrink-0 flex-wrap items-baseline gap-x-1.5 sm:flex-col sm:items-end sm:text-right">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stock</span>
                                            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                                              {formatQty(row.cantidad_disponible)}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {kardexMaterialId > 0 ? (
                          <div className="shrink-0 rounded-lg border border-border bg-muted/20 p-3 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Material seleccionado</p>
                            <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{selectedKardexMaterial?.nombre_material}</p>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                              Stock actual:{' '}
                              <span className="font-mono font-semibold tabular-nums text-foreground">
                                {formatQty(selectedKardexMaterial?.cantidad_disponible ?? 0)}
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {kardexMaterialId > 0 ? (
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:h-[min(82vh,860px)] lg:max-h-[min(82vh,860px)] lg:overflow-hidden lg:pr-0.5">
                        <div className="flex min-h-0 flex-shrink-0 flex-col gap-5 overflow-y-auto overscroll-contain lg:max-h-[min(48vh,480px)]">
                        <section className={cn(operationalModalSectionMuted, 'shrink-0')}>
                          <div className={cn(operationalModalSectionHeadingRow, 'mb-1')}>
                            <span className={operationalModalStepBadge}>2</span>
                            <h3 className={operationalModalStepTitle}>Tipo de ajuste</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            {(
                              [
                                {
                                  key: 'compra',
                                  title: 'Compra',
                                  hint: 'Entrada con proveedor, OC/factura y costo.',
                                },
                                {
                                  key: 'salida',
                                  title: 'Salida',
                                  hint: 'Merma o consumo manual.',
                                },
                                {
                                  key: 'manual',
                                  title: 'Corrección',
                                  hint: 'Ajuste delta +/- del saldo.',
                                },
                                {
                                  key: 'inventario_inicial',
                                  title: 'Inventario inicial',
                                  hint: 'Primera carga histórica.',
                                },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.key}
                                type="button"
                                className={cn(
                                  'rounded-xl border p-3.5 text-left shadow-sm transition-colors',
                                  moveRefType === opt.key
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30',
                                )}
                                onClick={() => setMoveRefType(opt.key)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold">{opt.title}</p>
                                  {moveRefType === opt.key ? <Check className="h-4 w-4 shrink-0" /> : null}
                                </div>
                                <p
                                  className={cn(
                                    'mt-1 text-xs leading-snug',
                                    moveRefType === opt.key ? 'text-primary-foreground/90' : 'text-muted-foreground',
                                  )}
                                >
                                  {opt.hint}
                                </p>
                              </button>
                            ))}
                          </div>
                        </section>

                        <section className={cn(operationalModalSectionCard, 'shrink-0')}>
                          <div className={cn(operationalModalSectionHeadingRow, 'mb-3')}>
                            <span className={operationalModalStepBadge}>3</span>
                            <h3 className={operationalModalStepTitle}>Datos del movimiento</h3>
                          </div>
                          {(() => {
                            const sel = (data ?? []).find((m) => m.id === kardexMaterialId);
                            const cur = sel ? Number(sel.cantidad_disponible) : NaN;
                            const d = Number(moveDelta);
                            const preview =
                              Number.isFinite(cur) && Number.isFinite(d) && d !== 0 ? (cur + d).toFixed(3) : null;
                            const uom = sel?.unidad_medida?.trim() || '';
                            return sel ? (
                              <div className="mb-5 flex flex-wrap gap-3">
                                <div className="min-w-[8.5rem] flex-1 rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white px-3.5 py-3 shadow-sm">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Saldo actual
                                  </p>
                                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums leading-none text-slate-900">
                                    {formatQty(sel.cantidad_disponible)}
                                    {uom ? <span className="ml-1 text-xs font-sans font-normal text-slate-500">{uom}</span> : null}
                                  </p>
                                </div>
                                <div
                                  className={cn(
                                    'min-w-[8.5rem] flex-1 rounded-xl border px-3.5 py-3 shadow-sm',
                                    preview != null
                                      ? 'border-primary/25 bg-primary/5'
                                      : 'border-dashed border-slate-200 bg-slate-50/40',
                                  )}
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Saldo después
                                  </p>
                                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums leading-none text-slate-900">
                                    {preview != null ? (
                                      <>
                                        {preview}
                                        {uom ? <span className="ml-1 text-xs font-sans font-normal text-slate-500">{uom}</span> : null}
                                      </>
                                    ) : (
                                      <span className="text-sm font-normal text-slate-500">Indicá cantidad Δ</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            ) : null;
                          })()}
                          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                            {moveRefType === 'compra' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">Proveedor</Label>
                                  <select
                                    className={filterSelectClass}
                                    value={moveSupplierId}
                                    onChange={(e) => setMoveSupplierId(Number(e.target.value) || 0)}
                                  >
                                    <option value={0}>Seleccionar…</option>
                                    {(kardexMaterialLinks ?? []).map((lnk) => (
                                      <option key={lnk.supplier_id} value={lnk.supplier_id}>
                                        {lnk.supplier.nombre}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">Cantidad</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder="Ej. 500"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">OC / pedido</Label>
                                  <Input
                                    value={moveGuideRef}
                                    onChange={(e) => setMoveGuideRef(e.target.value)}
                                    placeholder="Ej. OC-1023"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">Factura</Label>
                                  <Input
                                    value={moveInvoiceRef}
                                    onChange={(e) => setMoveInvoiceRef(e.target.value)}
                                    placeholder="Ej. F-2218"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600" title="Referencia de costo por unidad de medida del material">
                                    Precio unitario
                                  </Label>
                                  <Input
                                    value={moveUnitCostRef}
                                    onChange={(e) => setMoveUnitCostRef(e.target.value)}
                                    placeholder="Ej. 0.052"
                                    title="Referencia de costo por unidad"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">Guía / referencia</Label>
                                  <Input
                                    value={moveGuiaRef}
                                    onChange={(e) => setMoveGuiaRef(e.target.value)}
                                    placeholder="Guía de despacho u otro documento"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">Motivo / nota</Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder="Observación (opcional)"
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                            {moveRefType === 'salida' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">Cantidad</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder="Ej. -20"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">Guía / referencia (opcional)</Label>
                                  <Input
                                    value={moveGuideRef}
                                    onChange={(e) => setMoveGuideRef(e.target.value)}
                                    placeholder="Documento de respaldo"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">
                                    Motivo <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder="Merma, consumo manual, etc."
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                            {moveRefType === 'manual' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">Cantidad delta (+/-)</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder="Ej. +35 o -12"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">
                                    Motivo <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder="Corrección de conteo, ajuste de saldo…"
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                            {moveRefType === 'inventario_inicial' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">Cantidad inicial</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder="Ej. 1200"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">Referencia (opcional)</Label>
                                  <Input
                                    value={moveGuideRef}
                                    onChange={(e) => setMoveGuideRef(e.target.value)}
                                    placeholder="Acta, lote de carga histórica…"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">Motivo / nota</Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder="Observación (opcional)"
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                          </div>
                        </section>
                        </div>

                        <section
                          className={cn(
                            operationalModalSectionMuted,
                            'flex min-h-[min(260px,36vh)] flex-1 shrink-0 flex-col overflow-hidden lg:min-h-[280px]',
                          )}
                        >
                          <div className={cn(operationalModalSectionHeadingRow, 'mb-2')}>
                            <span className={operationalModalStepBadge}>4</span>
                            <h3 className={operationalModalStepTitle}>Confirmación y Kardex</h3>
                          </div>
                          <p className="mb-3 shrink-0 text-xs text-muted-foreground">
                            {moveRefType === 'compra'
                              ? 'Requerido: proveedor y cantidad positiva.'
                              : moveRefType === 'salida' || moveRefType === 'manual'
                                ? 'Requerido: cantidad distinta de cero y motivo.'
                                : 'Requerido: cantidad inicial distinta de cero.'}
                          </p>
                          <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-border lg:min-h-[200px]">
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
                        </section>
                      </div>
                    ) : (
                      <div className="hidden min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-8 text-center text-sm text-muted-foreground lg:flex">
                        Seleccioná un material en la columna izquierda para cargar tipo de ajuste y datos del movimiento.
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className={cn(operationalModalFooterClass, 'flex flex-row flex-wrap justify-end gap-2')}>
                  <Button type="button" variant="outline" onClick={() => setKardexOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={movementMut.isPending || !canSubmitAdjustment}
                    onClick={() => movementMut.mutate()}
                  >
                    {movementMut.isPending ? 'Guardando…' : 'Guardar ajuste'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className={contentCard}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Resumen de inventario</CardTitle>
          <CardDescription>Vista operativa de stock y costo maestro de materiales activos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Materiales activos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{inventorySummary.activeMaterials}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categorías con inventario</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{inventorySummary.categories}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Con stock visible</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{inventorySummary.stockLines}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor referencial stock</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">${formatMoneySimple(inventorySummary.stockValue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={contentCard}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Inventario agrupado por categoría</CardTitle>
          <CardDescription>Materiales activos con lectura rápida para operación diaria y costo maestro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(140px,1fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar material..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className={cn(filterInputClass, 'pl-9')}
              />
            </div>
            <select
              className={filterSelectClass}
              value={inventoryCategoryFilter}
              onChange={(e) => setInventoryCategoryFilter(Number(e.target.value))}
            >
              <option value={0}>Todas las categorías</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          {groupedInventoryFiltered.length === 0 ? (
            <p className="text-sm text-slate-500">Sin materiales activos para mostrar.</p>
          ) : (
            groupedInventoryFiltered.map((group, groupIdx) => {
              const CategoryIcon = packagingCategorySectionIcon(group.category);
              const iconTone =
                PACKAGING_CATEGORY_HEADER_TONES[
                  Math.abs(Number(group.category.id)) % PACKAGING_CATEGORY_HEADER_TONES.length
                ];
              return (
              <section
                key={group.category.id}
                className={cn('space-y-3', groupIdx > 0 && 'border-t border-slate-200/90 pt-6')}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border [&>svg]:h-5 [&>svg]:w-5',
                      iconTone,
                    )}
                    aria-hidden
                  >
                    <CategoryIcon aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold leading-tight text-slate-900">{group.category.nombre}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {group.items.length} {group.items.length === 1 ? 'material' : 'materiales'}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.items.map((row) => (
                    <article key={`card-${row.id}`} className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-[13px] font-semibold leading-snug text-slate-900">
                            {row.nombre_material}
                          </p>
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            {group.category.nombre}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">Stock actual</p>
                          <p className="text-lg font-semibold tabular-nums leading-none text-slate-900">{formatQty(row.cantidad_disponible)}</p>
                          <p className="text-[11px] text-slate-500">{row.unidad_medida}</p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                        <span className="uppercase tracking-wide text-slate-500">Costo maestro</span>
                        <span className="font-semibold tabular-nums text-slate-900">${formatMoneySimple(row.costo_unitario)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => {
                            setKardexMaterialId(row.id);
                            setMoveRefType('compra');
                            setMoveDelta('');
                            setMoveGuideRef('');
                            setMoveGuiaRef('');
                            setMoveInvoiceRef('');
                            setMoveSupplierId(0);
                            setMoveNota('');
                            setMoveUnitCostRef('');
                            setMaterialPickerSearch('');
                            setKardexOpen(true);
                          }}
                        >
                          Ajustar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => {
                            setKardexMaterialId(row.id);
                            setMoveRefType('manual');
                            setMoveDelta('');
                            setMoveGuideRef('');
                            setMoveGuiaRef('');
                            setMoveInvoiceRef('');
                            setMoveSupplierId(0);
                            setMoveNota('');
                            setMoveUnitCostRef('');
                            setMaterialPickerSearch('');
                            setKardexOpen(true);
                          }}
                        >
                          Corregir
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => setRenameRow(row)}
                        >
                          Editar
                        </Button>
                      </div>
                      <div className="mt-1.5">
                        <Button asChild type="button" size="sm" className="h-8 w-full text-[11px]">
                          <Link to={`/packaging/kardex?material=${row.id}`}>Ver Kardex</Link>
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              );
            })
          )}
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
        <DialogContent className="max-h-[min(90vh,720px)] w-full max-w-[min(36rem,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(36rem,calc(100vw-2rem))]">
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
        <DialogContent className="w-full max-w-[min(32rem,calc(100vw-2rem))] sm:max-w-[min(32rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>Renombrar material</DialogTitle>
          </DialogHeader>
          {renameRow ? (
            <div className="grid gap-2 py-2">
              <Label htmlFor="rename_material_name">Nombre</Label>
              <Input
                id="rename_material_name"
                className={filterInputClass}
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
