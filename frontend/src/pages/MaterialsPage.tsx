import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  Box,
  Boxes,
  Check,
  ChevronDown,
  ClipboardList,
  Droplets,
  FileStack,
  Filter,
  Info,
  Layers,
  LayoutGrid,
  Link2,
  Package,
  PackageOpen,
  Plus,
  Printer,
  Ribbon,
  Search,
  Shrink,
  Tag,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { localDateYmd } from '@/lib/date-filter';
import { z } from 'zod';
import { apiJson } from '@/api';
import { useAuth } from '@/AuthContext';
import {
  PineBoxesIcon,
  PineCubeIcon,
  PineDocumentIcon,
  PineLeafIcon,
  PinePlusIcon,
} from '@/components/icons/pinebloom';
import { appBranding } from '@/lib/branding';
import { canOperate, canSupervise } from '@/lib/roles';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  contentCard,
  filterInputClass,
  filterSelectClass,
  kpiCard,
  kpiLabel,
  kpiValueLg,
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
  material_category_id: z.coerce.number().int().positive('Elegí una categoría'),
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
  occurred_at: string | null;
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

type PurchaseSuppliersResult = {
  material_id: number;
  material_category_id: number;
  suppliers: PackingSupplierRow[];
  preferred_supplier_id: number | null;
};

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

const materialCardFieldLabelClass = 'text-[11px] uppercase tracking-wide text-muted-foreground';

function MasterCostEditor({
  row,
  saving,
  onSave,
}: {
  row: PackagingMaterialRow;
  saving: boolean;
  onSave: (cost: number) => void;
}) {
  const { t } = useTranslation('common');
  const base = Number(row.costo_unitario);
  const [text, setText] = useState(String(Number.isFinite(base) ? base : 0));
  useEffect(() => {
    setText(String(Number.isFinite(Number(row.costo_unitario)) ? Number(row.costo_unitario) : 0));
  }, [row.id, row.costo_unitario]);
  const parsed = Number(String(text).replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed >= 0;
  const changed = valid && Math.abs(parsed - base) > 1e-8;
  return (
    <div className="mt-1.5 space-y-1 rounded-md bg-slate-50 px-2 py-1.5">
      <span className={materialCardFieldLabelClass}>{t('materials.masterCost')}</span>
      <div className="flex gap-1.5">
        <Input
          className={cn(filterInputClass, 'h-8 min-w-0 flex-1 font-mono text-right text-sm')}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-[11px]"
          disabled={!changed || !valid || saving}
          onClick={() => onSave(parsed)}
        >
          {saving ? '…' : 'OK'}
        </Button>
      </div>
    </div>
  );
}

function stockDisplayClass(stockNum: number): string {
  if (stockNum <= 0) return 'text-red-600';
  if (stockNum < 100) return 'text-amber-600';
  return 'text-foreground';
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
  const { t } = useTranslation('common');
  const { role } = useAuth();
  const canDelete = canOperate(role);
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
  const [moveOccurredDate, setMoveOccurredDate] = useState(() => localDateYmd());
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState(0);
  const [inventoryMoreFilters, setInventoryMoreFilters] = useState(false);
  const [materialPickerSearch, setMaterialPickerSearch] = useState('');
  const [scopeEditRow, setScopeEditRow] = useState<PackagingMaterialRow | null>(null);
  const [scopeFormatIds, setScopeFormatIds] = useState<number[]>([]);
  const [scopeClientIds, setScopeClientIds] = useState<number[]>([]);
  const [renameRow, setRenameRow] = useState<PackagingMaterialRow | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<PackagingMaterialRow | null>(null);
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

  const { data: purchaseSuppliers, isLoading: purchaseSuppliersLoading } = useQuery({
    queryKey: ['masters', 'packing-suppliers', 'for-purchase', kardexMaterialId],
    queryFn: () =>
      apiJson<PurchaseSuppliersResult>(
        `/api/masters/packing-suppliers/for-purchase?material_id=${kardexMaterialId}`,
      ),
    enabled: kardexMaterialId > 0 && kardexOpen && moveRefType === 'compra',
    staleTime: 30_000,
  });

  useEffect(() => {
    if (moveRefType !== 'compra' || !purchaseSuppliers) return;
    const pref = purchaseSuppliers.preferred_supplier_id;
    setMoveSupplierId(pref != null && pref > 0 ? pref : 0);
  }, [purchaseSuppliers, moveRefType, kardexMaterialId]);

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
  const selectedCatNombre = materialCategories?.find((c) => c.id === materialCategoryIdW)?.nombre;
  const addNombre = useWatch({ control: form.control, name: 'nombre_material' }) ?? '';
  const selectedFormatIds = useWatch({ control: form.control, name: 'presentation_format_ids' }) ?? [];
  const selectedClientIds = useWatch({ control: form.control, name: 'client_ids' }) ?? [];
  const quickNombre = useWatch({ control: quickForm.control, name: 'nombre_material' }) ?? '';
  const quickCategoryId = useWatch({ control: quickForm.control, name: 'material_category_id' }) ?? 0;

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
    onError: (e: Error) => toast.error(e.message || t('materials.toast.errSave')),
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
          /** Inventario inicial y compras solo por «Ajuste de inventario» (movimientos), no en el alta. */
          cantidad_disponible: 0,
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
      toast.success(t('materials.toast.created'));
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
      toast.error(e.message || t('materials.toast.errCreate'));
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
      toast.success(t('materials.toast.createdQuick'));
      setQuickOpen(false);
      quickForm.reset({ nombre_material: '', material_category_id: defaultCategoryId || 0 });
    },
    onError: (e: Error) => toast.error(e.message || t('materials.toast.errCreate')),
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
          const s = (purchaseSuppliers?.suppliers ?? []).find((x) => x.id === moveSupplierId);
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
          occurred_at: moveRefType === 'compra' && moveOccurredDate.trim() ? moveOccurredDate.trim() : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'movements', kardexMaterialId] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials', 'operational-stock'] });
      toast.success(t('materials.toast.movementSaved'));
      setMoveDelta('');
      setMoveRefType('compra');
      setMoveGuideRef('');
      setMoveGuiaRef('');
      setMoveInvoiceRef('');
      setMoveSupplierId(0);
      setMoveNota('');
      setMoveUnitCostRef('');
      setMoveOccurredDate(localDateYmd());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiJson(`/api/packaging/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'recipes'] });
      queryClient.invalidateQueries({ queryKey: ['packaging', 'materials', 'summary-by-format'] });
      toast.success(t('materials.toast.deleted'));
      setDeleteConfirmRow(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canManageSupplierLinks = canSupervise(role);
  const canEditSupplierAliases = canOperate(role);

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
      queryClient.invalidateQueries({ queryKey: ['masters', 'packing-suppliers', 'for-purchase'] });
      toast.success(t('materials.toast.supplierLinked'));
    },
    onError: (e: Error) => toast.error(e.message || t('materials.toast.errLink')),
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
      toast.success(t('materials.toast.guideUpdated'));
    },
    onError: (e: Error) => toast.error(e.message || t('materials.toast.errSave')),
  });

  const unlinkMut = useMutation({
    mutationFn: (body: { material_id: number; supplier_id: number }) =>
      apiJson('/api/masters/packing-material-links/unlink', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'packing-material-links'] });
      toast.success(t('materials.toast.linkRemoved'));
    },
    onError: (e: Error) => toast.error(e.message || t('materials.toast.errRemove')),
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

  const inventoryVisibleCount = useMemo(
    () => groupedInventoryFiltered.reduce((n, group) => n + group.items.length, 0),
    [groupedInventoryFiltered],
  );

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
    if (moveRefType === 'compra') return moveSupplierId > 0 && moveOccurredDate.trim().length > 0;
    if (moveRefType === 'salida') return moveNota.trim().length > 0;
    if (moveRefType === 'manual') return moveNota.trim().length > 0;
    if (moveRefType === 'inventario_inicial') return true;
    return false;
  }, [selectedKardexMaterial, moveDelta, moveRefType, moveSupplierId, moveNota, moveOccurredDate]);

  const savingId = updateMut.isPending && updateMut.variables ? updateMut.variables.id : null;

  const categoryOptions = (materialCategories ?? []).filter((c) => c.activo !== false);

  const openKardexPicker = (materialId = 0, refType = 'compra') => {
    setKardexMaterialId(materialId);
    setMoveRefType(refType);
    setMoveDelta('');
    setMoveGuideRef('');
    setMoveGuiaRef('');
    setMoveInvoiceRef('');
    setMoveSupplierId(0);
    setMoveNota('');
    setMoveUnitCostRef('');
    setMoveOccurredDate(localDateYmd());
    setMaterialPickerSearch('');
    setKardexOpen(true);
  };

  const moveTypeOptions = useMemo(
    () =>
      [
        { key: 'compra' as const, title: t('materials.kardexDialog.typePurchase'), hint: t('materials.kardexDialog.typePurchaseHint') },
        { key: 'salida' as const, title: t('materials.kardexDialog.typeExit'), hint: t('materials.kardexDialog.typeExitHint') },
        { key: 'manual' as const, title: t('materials.kardexDialog.typeManual'), hint: t('materials.kardexDialog.typeManualHint') },
        {
          key: 'inventario_inicial' as const,
          title: t('materials.kardexDialog.typeInitial'),
          hint: t('materials.kardexDialog.typeInitialHint'),
        },
      ] as const,
    [t],
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
    <div className="font-inter space-y-3 max-lg:overflow-x-hidden lg:-mx-7 lg:min-h-[calc(100vh-52px)] lg:space-y-3 lg:bg-[#F9F7F5] lg:px-7 lg:pb-8">
      <header
        data-materials-mobile-hero
        className="relative overflow-hidden rounded-[14px] border border-[var(--stone-300)] bg-white/55 px-3.5 pb-2.5 pt-3 lg:hidden"
      >
        <div className="relative z-[1]">
          <h1 className="font-serif text-[31px] font-semibold leading-none tracking-[-0.55px] text-[var(--ink)]">
            {t('materials.pageTitle')}
          </h1>
          <p className="mt-1.5 text-[14px] leading-snug text-[var(--ink-muted)]">{t('materials.pageSubtitle')}</p>
          <Button
            type="button"
            className="mt-2 h-[42px] w-full gap-2 rounded-[10px] bg-[var(--olive-700)] px-4 text-[15px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]"
            onClick={() => setQuickOpen(true)}
          >
            <PinePlusIcon size={20} strokeWidth={2.1} />
            {t('materials.quickButton')}
          </Button>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[10px] border-[var(--stone-300)] bg-white px-2 text-[12px] font-semibold leading-tight shadow-none hover:bg-[var(--stone-100)]"
              onClick={() => openKardexPicker(0, 'compra')}
            >
              {t('materials.kardexButton')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-1 rounded-[10px] border-[var(--stone-300)] bg-white px-2 text-[12px] font-semibold leading-tight shadow-none hover:bg-[var(--stone-100)]"
              onClick={() => setOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {t('materials.addButton')}
            </Button>
          </div>
        </div>
        <div className="relative mt-2 h-[70px] overflow-hidden border-t border-[var(--stone-200)]">
          <p className="absolute left-0 top-2 z-[1] w-[132px] text-[9px] font-medium uppercase leading-[1.45] tracking-[0.17em] text-[var(--olive-700)]">
            <span className="block">FRUTA DE NUESTRA</span>
            <span className="block">TIERRA.</span>
            <span className="block">UN FUTURO MÁS</span>
            <span className="block">BRILLANTE.</span>
          </p>
          <img
            src={appBranding.landscapeUrl}
            alt=""
            className="pointer-events-none absolute bottom-[-4px] right-[-3px] h-[76px] w-[228px] max-w-none object-contain object-right-bottom opacity-[0.72] contrast-[0.97] brightness-[1.04] saturate-[0.62] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.25)_18%,black_42%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.25)_18%,black_42%,black_100%)]"
            aria-hidden
          />
        </div>
      </header>

      <header
        data-materials-desktop-hero
        className="relative hidden overflow-hidden rounded-[14px] border border-[var(--stone-300)] bg-white/55 px-3.5 pb-3 pt-3.5 lg:flex lg:h-[171px] lg:min-h-[171px] lg:items-start lg:justify-between lg:gap-5 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-[var(--stone-200)] lg:bg-transparent lg:px-0 lg:pb-5 lg:pl-2 lg:pt-7"
      >
        <img
          src={appBranding.landscapeUrl}
          alt=""
          className="pointer-events-none absolute right-0 top-1 hidden h-[118%] w-[680px] max-w-[62%] object-contain object-right opacity-[0.78] contrast-[0.96] brightness-[1.03] saturate-[0.68] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] lg:block"
          aria-hidden
        />
        <div className="relative z-[1] min-w-0 space-y-2">
          <h1 className={cn(pageTitle, 'lg:max-w-[42rem] lg:font-serif lg:text-[66px] lg:font-semibold lg:leading-[1.02] lg:tracking-[-0.9px] lg:text-[var(--ink)]')}>
            {t('materials.pageTitle')}
          </h1>
          <p className={cn(pageSubtitle, 'lg:max-w-[36rem] lg:font-serif lg:text-[20px] lg:leading-tight lg:text-[var(--ink-muted)]')}>
            {t('materials.pageSubtitle')}
          </p>
        </div>
        <div className="relative z-[1] flex shrink-0 flex-col items-end gap-2">
          <Button
            type="button"
            className="h-10 min-w-[168px] gap-2 rounded-[var(--radius-md)] bg-[var(--olive-700)] px-4 text-[13px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]"
            onClick={() => setQuickOpen(true)}
          >
            <PinePlusIcon size={18} strokeWidth={2.1} />
            {t('materials.quickButton')}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[var(--radius-md)] border-[var(--stone-300)] bg-white px-3 text-[12px] font-semibold shadow-none hover:bg-[var(--stone-100)]"
              onClick={() => openKardexPicker(0, 'compra')}
            >
              {t('materials.kardexButton')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-1.5 rounded-[var(--radius-md)] border-[var(--stone-300)] bg-white px-3 text-[12px] font-semibold shadow-none hover:bg-[var(--stone-100)]"
              onClick={() => setOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t('materials.addButton')}
            </Button>
          </div>
        </div>
      </header>

          <Dialog
            open={quickOpen}
            onOpenChange={setQuickOpen}
          >
            <DialogContent
              hideCloseButton
              fullScreenMobile
              data-quick-material-dialog
              className={cn(
                '[&>button]:hidden',
                'max-lg:flex max-lg:h-full max-lg:max-h-none max-lg:w-full max-lg:max-w-none max-lg:flex-col max-lg:gap-0 max-lg:overflow-hidden max-lg:overflow-x-hidden max-lg:bg-[var(--stone-50)] max-lg:p-0',
                'lg:flex lg:max-h-[min(80vh,520px)] lg:w-full lg:min-w-0 lg:max-w-[min(720px,calc(100vw-2rem))] lg:flex-col lg:gap-0 lg:overflow-hidden lg:overflow-x-hidden lg:bg-[var(--stone-50)] lg:p-0 lg:rounded-[12px] lg:border-[var(--stone-300)] lg:shadow-[0_18px_55px_rgba(32,39,34,0.18)] lg:[&>button]:hidden',
              )}
            >
              <DialogHeader
                data-quick-material-header-mobile
                className="relative shrink-0 overflow-hidden max-lg:border-b max-lg:border-[var(--stone-200)] max-lg:bg-[var(--stone-50)] max-lg:px-4 max-lg:pb-4 max-lg:pt-3 lg:hidden"
              >
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--stone-300)]" aria-hidden />
                <img
                  src={appBranding.landscapeUrl}
                  alt=""
                  className="pointer-events-none absolute inset-y-0 right-0 h-full w-[70%] max-w-none object-contain object-right object-bottom opacity-100 contrast-[1.08] brightness-[0.96] [mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_100%)]"
                  aria-hidden
                />
                <div className="relative z-[1] flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="flex items-center gap-2 font-serif text-[23px] font-bold tracking-tight text-[var(--ink)]">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--olive-700)]" />
                      {t('materials.quickDialog.title')}
                    </DialogTitle>
                    <p className="text-[13px] text-[var(--ink-muted)]">{t('materials.quickDialog.hint')}</p>
                    <p className="max-w-[9.5rem] text-[10px] font-medium uppercase leading-[1.45] tracking-[0.18em] text-[var(--sage-700,#6B7A55)]">
                      <span className="block">FRUTA DE</span>
                      <span className="block">NUESTRA TIERRA.</span>
                      <span className="block">UN FUTURO</span>
                      <span className="block">MÁS BRILLANTE.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--sage-100)]"
                    aria-label={t('actions.close')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </DialogHeader>
              <DialogHeader
                data-quick-material-header
                className="relative hidden overflow-hidden lg:flex lg:min-h-[112px] lg:shrink-0 lg:flex-col lg:space-y-1.5 lg:border-b lg:border-[var(--stone-200)] lg:bg-[var(--stone-50)] lg:px-7 lg:pb-5 lg:pt-5 lg:text-left"
              >
                <img
                  src={appBranding.landscapeUrl}
                  alt=""
                  className="pointer-events-none absolute inset-y-0 right-[-1%] hidden h-full w-[58%] max-w-none object-contain object-right object-bottom opacity-[0.72] contrast-[0.98] brightness-[1.02] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.18)_18%,rgba(0,0,0,0.7)_42%,black_68%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.18)_18%,rgba(0,0,0,0.7)_42%,black_68%)] lg:block"
                  aria-hidden
                />
                <div className="relative z-[1] flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="flex items-center gap-2 font-serif text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--olive-700)]" />
                      {t('materials.quickDialog.title')}
                    </DialogTitle>
                    <p className="max-w-[28rem] text-[14px] text-[var(--ink-muted)]">{t('materials.quickDialog.hint')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--sage-100)]"
                    aria-label={t('actions.close')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </DialogHeader>
              <form
                onSubmit={quickForm.handleSubmit((v) => quickMutation.mutate(v))}
                className="grid gap-4 py-1 max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:gap-0 max-lg:py-0 lg:flex lg:flex-col lg:gap-0 lg:py-0"
              >
                <div
                  data-quick-material-body
                  className="min-w-0 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-x-hidden max-lg:overflow-y-auto max-lg:px-[14px] max-lg:py-3 max-lg:pb-24 lg:overflow-x-hidden lg:overflow-y-auto lg:px-7 lg:py-4"
                >
                  <section className="rounded-[10px] border border-[var(--stone-300)] bg-[var(--sage-100)]/55 p-[14px] max-lg:p-[14px] lg:p-4">
                    <div className={cn(operationalModalSectionHeadingRow, 'mb-3 flex flex-nowrap items-start gap-3')}>
                      <span className={cn(operationalModalStepBadge, 'h-[34px] w-[34px] lg:h-9 lg:w-9 lg:text-[14px]')}>1</span>
                      <div className="min-w-0">
                        <h3 className={cn(operationalModalStepTitle, 'text-[19px] lg:text-[20px]')}>{t('materials.quickDialog.stepTitle')}</h3>
                        <p className="mt-0.5 text-[12px] leading-snug text-[var(--ink-muted)] max-lg:text-[13px]">{t('materials.quickDialog.stepHelp')}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]">{t('materials.quickDialog.nameLabel')}</Label>
                  <Input
                    className={cn(filterInputClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-12 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[15px]')}
                    autoComplete="off"
                    placeholder={t('materials.quickDialog.namePlaceholder')}
                    {...quickForm.register('nombre_material')}
                  />
                  {quickForm.formState.errors.nombre_material && (
                    <p className="text-xs text-destructive">{quickForm.formState.errors.nombre_material.message}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]">{t('materials.quickDialog.categoryLabel')}</Label>
                  <select
                    className={cn(filterSelectClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-12 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[15px]')}
                    {...quickForm.register('material_category_id', { valueAsNumber: true })}
                  >
                    <option value={0}>{t('materials.quickDialog.categoryPlaceholder')}</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.codigo})
                      </option>
                    ))}
                  </select>
                  {quickForm.formState.errors.material_category_id && (
                    <p className="text-xs text-destructive">{quickForm.formState.errors.material_category_id.message}</p>
                  )}
                  <p className="text-[12px] leading-snug text-[var(--ink-muted)]">{t('materials.quickDialog.hint')}</p>
                </div>
                    </div>
                  </section>
                </div>
                <DialogFooter
                  data-quick-material-footer-mobile
                  className="sticky bottom-0 z-10 hidden shrink-0 gap-1.5 border-t border-[var(--stone-200)] bg-[var(--stone-50)] px-3.5 py-2 max-lg:!flex max-lg:!flex-col"
                >
                  <div className="flex w-full flex-nowrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-h-11 w-[49%] flex-none rounded-[var(--radius-md)] border-[var(--stone-300)] bg-[var(--stone-100)] text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--stone-200)]"
                      onClick={() => setQuickOpen(false)}
                    >
                      {t('materials.quickDialog.cancelButton')}
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 min-h-11 w-[49%] flex-none rounded-[var(--radius-md)] bg-[var(--olive-700)] px-4 text-[13px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]"
                      disabled={quickMutation.isPending}
                    >
                      {quickMutation.isPending ? t('materials.quickDialog.creatingButton') : t('materials.quickDialog.createButton')}
                    </Button>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-[10px] leading-none text-[var(--ink-muted)]">
                    <span>
                      {t('materials.quickDialog.nameLabel')}{' '}
                      <span className="font-serif font-semibold text-[var(--ink)]">{quickNombre.trim() || '—'}</span>
                      {' · '}
                      {t('materials.quickDialog.categoryLabel')}{' '}
                      <span className="font-serif font-semibold text-[var(--ink)]">
                        {categoryOptions.find((c) => c.id === Number(quickCategoryId))?.nombre ?? '—'}
                      </span>
                    </span>
                  </div>
                </DialogFooter>
                <DialogFooter className="hidden gap-2 sm:gap-0 lg:!flex lg:!flex-row lg:!justify-between lg:min-h-[65px] lg:items-center lg:border-t lg:border-[var(--stone-200)] lg:bg-[var(--stone-50)] lg:px-7 lg:py-3">
                  <div className="hidden min-w-0 items-center gap-2 text-[12px] text-[var(--ink-muted)] lg:flex">
                    <span className="truncate">
                      {t('materials.quickDialog.nameLabel')}{' '}
                      <strong className="font-serif text-[16px] font-semibold text-[var(--ink)]">{quickNombre.trim() || '—'}</strong>
                    </span>
                    <span className="h-5 w-px shrink-0 bg-[var(--stone-300)]" aria-hidden />
                    <span className="truncate">
                      {t('materials.quickDialog.categoryLabel')}{' '}
                      <strong className="font-serif text-[16px] font-semibold text-[var(--ink)]">
                        {categoryOptions.find((c) => c.id === Number(quickCategoryId))?.nombre ?? '—'}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2.5">
                  <Button type="button" variant="outline" className="rounded-xl lg:h-11 lg:min-w-[126px] lg:rounded-[8px] lg:border-[var(--stone-300)] lg:bg-white lg:px-5 lg:text-[13px] lg:font-semibold lg:shadow-none" onClick={() => setQuickOpen(false)}>
                    {t('materials.quickDialog.cancelButton')}
                  </Button>
                  <Button type="submit" className="rounded-xl lg:h-11 lg:min-w-[140px] lg:rounded-[8px] lg:bg-[var(--olive-700)] lg:px-5 lg:text-[13px] lg:font-semibold lg:text-white lg:shadow-none lg:hover:bg-[var(--olive-600)]" disabled={quickMutation.isPending}>
                    {quickMutation.isPending ? t('materials.quickDialog.creatingButton') : t('materials.quickDialog.createButton')}
                  </Button>
                  </div>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              hideCloseButton
              fullScreenMobile
              data-add-material-dialog
              className={cn(
                operationalModalContentClass,
                'min-h-0 max-h-[min(96vh,920px)] max-w-[min(920px,calc(100vw-2rem))] sm:max-w-[min(920px,calc(100vw-2rem))]',
                'max-lg:flex max-lg:h-full max-lg:max-h-none max-lg:w-full max-lg:max-w-none max-lg:flex-col max-lg:gap-0 max-lg:overflow-hidden max-lg:overflow-x-hidden max-lg:bg-[var(--stone-50)] max-lg:p-0',
                'lg:flex lg:h-auto lg:max-h-[min(864px,calc(100vh-36px))] lg:w-full lg:min-w-0 lg:max-w-[min(1050px,calc(100vw-2rem))] lg:flex-col lg:gap-0 lg:overflow-hidden lg:overflow-x-hidden lg:bg-[var(--stone-50)] lg:p-0 lg:rounded-[12px] lg:border-[var(--stone-300)] lg:shadow-[0_18px_55px_rgba(32,39,34,0.18)] lg:[&>button]:hidden',
              )}
            >
              <DialogHeader
                data-add-material-header-mobile
                className="relative shrink-0 overflow-hidden max-lg:border-b max-lg:border-[var(--stone-200)] max-lg:bg-[var(--stone-50)] max-lg:px-4 max-lg:pb-4 max-lg:pt-3 lg:hidden"
              >
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--stone-300)]" aria-hidden />
                <img
                  src={appBranding.landscapeUrl}
                  alt=""
                  className="pointer-events-none absolute inset-y-0 right-0 h-full w-[70%] max-w-none object-contain object-right object-bottom opacity-100 contrast-[1.08] brightness-[0.96] [mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_100%)]"
                  aria-hidden
                />
                <div className="relative z-[1] flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="flex items-center gap-2 font-serif text-[23px] font-bold tracking-tight text-[var(--ink)]">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--olive-700)]" />
                      {t('materials.addDialog.title')}
                    </DialogTitle>
                    <DialogDescription className="text-[13px] leading-snug text-[var(--ink-muted)]">
                      {t('materials.addDialog.description')}
                    </DialogDescription>
                    <p className="max-w-[9.5rem] text-[10px] font-medium uppercase leading-[1.45] tracking-[0.18em] text-[var(--sage-700,#6B7A55)]">
                      <span className="block">FRUTA DE</span>
                      <span className="block">NUESTRA TIERRA.</span>
                      <span className="block">UN FUTURO</span>
                      <span className="block">MÁS BRILLANTE.</span>
                    </p>
                    <details className="group text-[12px] text-[var(--ink-muted)]">
                      <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                          <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          {t('materials.addDialog.tipsTitle')}
                        </span>
                      </summary>
                      <ul className="mt-1.5 max-w-prose list-disc space-y-1 pl-4 text-pretty leading-snug">
                        <li>
                          <strong className="font-medium text-[var(--ink)]">{t('materials.addDialog.tip1Bold')}</strong> {t('materials.addDialog.tip1')}
                        </li>
                        <li>{t('materials.addDialog.tip2')}</li>
                        <li>
                          <strong className="font-medium text-[var(--ink)]">{t('materials.addDialog.tip3Bold')}</strong>{' '}
                          {t('materials.addDialog.tip3')}
                        </li>
                      </ul>
                    </details>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--sage-100)]"
                    aria-label={t('actions.close')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </DialogHeader>
              <DialogHeader
                data-add-material-header
                className="relative hidden overflow-hidden lg:flex lg:min-h-[112px] lg:shrink-0 lg:flex-col lg:space-y-1.5 lg:border-b lg:border-[var(--stone-200)] lg:bg-[var(--stone-50)] lg:px-7 lg:pb-5 lg:pt-5 lg:text-left"
              >
                <img
                  src={appBranding.landscapeUrl}
                  alt=""
                  className="pointer-events-none absolute inset-y-0 right-[-1%] hidden h-full w-[58%] max-w-none object-contain object-right object-bottom opacity-[0.72] contrast-[0.98] brightness-[1.02] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.18)_18%,rgba(0,0,0,0.7)_42%,black_68%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.18)_18%,rgba(0,0,0,0.7)_42%,black_68%)] lg:block"
                  aria-hidden
                />
                <div className="relative z-[1] flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="flex items-center gap-2 font-serif text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--olive-700)]" />
                      {t('materials.addDialog.title')}
                    </DialogTitle>
                    <DialogDescription className="max-w-[32rem] text-[14px] leading-snug text-[var(--ink-muted)]">
                      {t('materials.addDialog.description')}
                    </DialogDescription>
                    <details className="group max-w-[28rem] text-[12px] text-[var(--ink-muted)]">
                      <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                          <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          {t('materials.addDialog.tipsTitle')}
                        </span>
                      </summary>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-pretty leading-snug">
                        <li>
                          <strong className="font-medium text-[var(--ink)]">{t('materials.addDialog.tip1Bold')}</strong> {t('materials.addDialog.tip1')}
                        </li>
                        <li>{t('materials.addDialog.tip2')}</li>
                        <li>
                          <strong className="font-medium text-[var(--ink)]">{t('materials.addDialog.tip3Bold')}</strong>{' '}
                          {t('materials.addDialog.tip3')}
                        </li>
                      </ul>
                    </details>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--sage-100)]"
                    aria-label={t('actions.close')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit((vals) => mutation.mutate(vals))}
                className={cn(operationalModalFormClass, 'min-h-0 gap-0 max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:gap-0 max-lg:py-0 lg:flex-auto')}
              >
                <div
                  data-add-material-body
                  className={cn(
                    operationalModalBodyClass,
                    'max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-x-hidden max-lg:overflow-y-auto max-lg:px-[14px] max-lg:py-3 max-lg:pb-24 lg:flex-auto lg:overflow-x-hidden lg:overflow-y-auto lg:px-7 lg:py-4',
                  )}
                >
                  <div className="flex min-h-0 flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
                    <div className="flex min-h-0 flex-col gap-4">
                      <section
                        data-add-material-step1
                        className={cn(
                          operationalModalSectionCard,
                          'max-lg:rounded-[10px] max-lg:border-[var(--stone-300)] max-lg:bg-[var(--sage-100)]/55 max-lg:p-[14px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--sage-100)]/55 lg:p-4',
                        )}
                      >
                        <div className={cn(operationalModalSectionHeadingRow, 'max-lg:mb-3 max-lg:flex-nowrap max-lg:items-start max-lg:gap-3 lg:mb-3 lg:flex-nowrap lg:items-start lg:gap-3')}>
                          <span className={cn(operationalModalStepBadge, 'max-lg:h-[34px] max-lg:w-[34px] lg:h-9 lg:w-9 lg:text-[14px]')}>1</span>
                          <h3 className={cn(operationalModalStepTitle, 'max-lg:text-[19px] lg:text-[20px]')}>{t('materials.addDialog.step1')}</h3>
                        </div>
                        <div className="grid gap-3">
                          <div className="grid gap-1.5">
                            <Label
                              className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]"
                              htmlFor="nombre_material"
                            >
                              {t('materials.addDialog.nameLabel')}
                            </Label>
                            <Input
                              id="nombre_material"
                              className={cn(filterInputClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-11 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[13px]')}
                              autoComplete="off"
                              placeholder={t('materials.addDialog.namePlaceholder')}
                              {...form.register('nombre_material')}
                            />
                            {form.formState.errors.nombre_material ? (
                              <p className="text-xs text-destructive">{form.formState.errors.nombre_material.message}</p>
                            ) : null}
                          </div>
                          <div className="grid gap-1.5">
                            <Label
                              className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]"
                              htmlFor="material_category_id"
                            >
                              {t('materials.addDialog.categoryLabel')}
                            </Label>
                            <select
                              id="material_category_id"
                              className={cn(filterSelectClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-11 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[13px]')}
                              {...form.register('material_category_id', { valueAsNumber: true })}
                            >
                              <option value={0}>{t('materials.quickDialog.categoryPlaceholder')}</option>
                              {categoryOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre} ({c.codigo})
                                </option>
                              ))}
                            </select>
                            {form.formState.errors.material_category_id ? (
                              <p className="text-xs text-destructive">{form.formState.errors.material_category_id.message}</p>
                            ) : null}
                          </div>
                          <div className="grid gap-1.5">
                            <Label
                              className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]"
                              htmlFor="descripcion"
                            >
                              {t('materials.addDialog.noteLabel')}
                            </Label>
                            <Input
                              id="descripcion"
                              className={cn(filterInputClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-11 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[13px]')}
                              autoComplete="off"
                              {...form.register('descripcion')}
                            />
                          </div>
                        </div>
                      </section>
                      <section
                        data-add-material-step2
                        className={cn(
                          operationalModalSectionCard,
                          'max-lg:rounded-[10px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:p-[14px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-white lg:p-4',
                        )}
                      >
                        <div className={cn(operationalModalSectionHeadingRow, 'max-lg:mb-3 max-lg:flex-nowrap max-lg:items-start max-lg:gap-3 lg:mb-3 lg:flex-nowrap lg:items-start lg:gap-3')}>
                          <span className={cn(operationalModalStepBadge, 'max-lg:h-[34px] max-lg:w-[34px] lg:h-9 lg:w-9 lg:text-[14px]')}>2</span>
                          <h3 className={cn(operationalModalStepTitle, 'max-lg:text-[19px] lg:text-[20px]')}>{t('materials.addDialog.step2')}</h3>
                        </div>
                        <div className="max-h-[min(200px,28vh)] space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 px-2 py-2 max-lg:max-h-[220px] max-lg:overflow-x-hidden max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:p-3 lg:max-h-[220px] lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:p-3">
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
                        <p className="mt-2 text-[11px] leading-snug text-muted-foreground lg:text-[12px] lg:text-[var(--ink-muted)]">
                          {t('materials.addDialog.formatHint')}
                        </p>
                      </section>
                    </div>
                    <div className="flex min-h-0 flex-col gap-4">
                      <section
                        data-add-material-step3
                        className={cn(
                          operationalModalSectionCard,
                          'max-lg:rounded-[10px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:p-[14px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-white lg:p-4',
                        )}
                      >
                        <div className={cn(operationalModalSectionHeadingRow, 'max-lg:mb-3 max-lg:flex-nowrap max-lg:items-start max-lg:gap-3 lg:mb-3 lg:flex-nowrap lg:items-start lg:gap-3')}>
                          <span className={cn(operationalModalStepBadge, 'max-lg:h-[34px] max-lg:w-[34px] lg:h-9 lg:w-9 lg:text-[14px]')}>3</span>
                          <h3 className={cn(operationalModalStepTitle, 'max-lg:text-[19px] lg:text-[20px]')}>{t('materials.addDialog.step3')}</h3>
                        </div>
                        <div className="max-h-[min(200px,28vh)] space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 px-2 py-2 max-lg:max-h-[220px] max-lg:overflow-x-hidden max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:p-3 lg:max-h-[220px] lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:p-3">
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
                        <p className="mt-2 text-[11px] leading-snug text-muted-foreground lg:text-[12px] lg:text-[var(--ink-muted)]">
                          {t('materials.addDialog.clientHint')}
                        </p>
                      </section>
                      <section
                        data-add-material-step4
                        className={cn(
                          operationalModalSectionMuted,
                          'max-lg:rounded-[10px] max-lg:border-[var(--stone-300)] max-lg:bg-[var(--sage-100)]/55 max-lg:p-[14px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--sage-100)]/55 lg:p-4',
                        )}
                      >
                        <div className={cn(operationalModalSectionHeadingRow, 'max-lg:mb-3 max-lg:flex-nowrap max-lg:items-start max-lg:gap-3 lg:mb-3 lg:flex-nowrap lg:items-start lg:gap-3')}>
                          <span className={cn(operationalModalStepBadge, 'max-lg:h-[34px] max-lg:w-[34px] lg:h-9 lg:w-9 lg:text-[14px]')}>4</span>
                          <h3 className={cn(operationalModalStepTitle, 'max-lg:text-[19px] lg:text-[20px]')}>{t('materials.addDialog.step4')}</h3>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5 sm:col-span-2">
                            <Label
                              className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]"
                              htmlFor="unidad_medida"
                            >
                              {t('materials.addDialog.uomLabel')}
                            </Label>
                            <select
                              id="unidad_medida"
                              className={cn(filterSelectClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-11 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[13px]')}
                              {...form.register('unidad_medida')}
                            >
                              {MATERIAL_UOM_OPTIONS.map((u) => (
                                <option key={u} value={u}>
                                  {t(`materials.uom.${u}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-1.5 sm:col-span-2">
                            <Label
                              className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]"
                              htmlFor="costo_unitario"
                            >
                              {t('materials.addDialog.costLabel')}
                            </Label>
                            <Input
                              id="costo_unitario"
                              type="number"
                              step="0.0001"
                              min={0}
                              className={cn(filterInputClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-11 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[13px]')}
                              {...form.register('costo_unitario')}
                            />
                          </div>
                          <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2 lg:text-[12px] lg:text-[var(--ink-muted)]">
                            {t('materials.addDialog.costHint')}
                          </p>
                          {selectedCatCodigo === 'clamshell' ? (
                            <div className="grid gap-1.5 sm:col-span-2">
                              <Label className="text-xs text-slate-600 max-lg:text-[10px] max-lg:font-semibold max-lg:uppercase max-lg:tracking-[0.08em] max-lg:text-[var(--ink-muted)] lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.08em] lg:text-[var(--ink-muted)]">
                                {t('materials.addDialog.clamshellUnitsLabel')}
                              </Label>
                              <Input
                                type="number"
                                step="0.0001"
                                min={0}
                                placeholder="1"
                                className={cn(filterInputClass, 'max-lg:h-12 max-lg:min-h-12 max-lg:rounded-[9px] max-lg:border-[var(--stone-300)] max-lg:bg-white max-lg:text-[15px] lg:h-11 lg:rounded-[9px] lg:border-[var(--stone-300)] lg:bg-white lg:text-[13px]')}
                                {...form.register('clamshell_units_per_box', { valueAsNumber: true })}
                              />
                            </div>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
                <DialogFooter
                  data-add-material-footer-mobile
                  className="sticky bottom-0 z-10 hidden shrink-0 gap-1.5 border-t border-[var(--stone-200)] bg-[var(--stone-50)] px-3.5 py-2 max-lg:!flex max-lg:!flex-col"
                >
                  <div className="flex w-full flex-nowrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-h-11 w-[49%] flex-none rounded-[var(--radius-md)] border-[var(--stone-300)] bg-[var(--stone-100)] text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--stone-200)]"
                      onClick={() => setOpen(false)}
                    >
                      {t('materials.addDialog.cancelButton')}
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 min-h-11 w-[49%] flex-none rounded-[var(--radius-md)] bg-[var(--olive-700)] px-4 text-[13px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)]"
                      disabled={mutation.isPending}
                    >
                      {mutation.isPending ? t('materials.addDialog.savingButton') : t('materials.addDialog.saveButton')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-[10px] leading-tight text-[var(--ink-muted)]">
                    <span>
                      {t('materials.addDialog.nameLabel')}{' '}
                      <span className="font-serif font-semibold text-[var(--ink)]">{addNombre.trim() || '—'}</span>
                      {' · '}
                      {t('materials.addDialog.categoryLabel')}{' '}
                      <span className="font-serif font-semibold text-[var(--ink)]">{selectedCatNombre ?? '—'}</span>
                    </span>
                    <span>
                      <span className="font-serif font-semibold text-[var(--ink)]">{selectedFormatIds.length}</span>
                      {' formatos · '}
                      <span className="font-serif font-semibold text-[var(--ink)]">{selectedClientIds.length}</span>
                      {' clientes'}
                    </span>
                  </div>
                </DialogFooter>
                <DialogFooter
                  data-add-material-footer
                  className="hidden gap-2 border-t border-[var(--stone-200)] bg-[var(--stone-50)] lg:!flex lg:!flex-row lg:!justify-between lg:min-h-[65px] lg:items-center lg:px-7 lg:py-3"
                >
                  <div className="hidden min-w-0 items-center gap-2 text-[12px] text-[var(--ink-muted)] lg:flex">
                    <span className="truncate">
                      {t('materials.addDialog.nameLabel')}{' '}
                      <strong className="font-serif text-[16px] font-semibold text-[var(--ink)]">{addNombre.trim() || '—'}</strong>
                    </span>
                    <span className="h-5 w-px shrink-0 bg-[var(--stone-300)]" aria-hidden />
                    <span className="truncate">
                      {t('materials.addDialog.categoryLabel')}{' '}
                      <strong className="font-serif text-[16px] font-semibold text-[var(--ink)]">{selectedCatNombre ?? '—'}</strong>
                    </span>
                    <span className="h-5 w-px shrink-0 bg-[var(--stone-300)]" aria-hidden />
                    <span className="truncate">
                      <strong className="font-serif text-[16px] font-semibold text-[var(--ink)]">{selectedFormatIds.length}</strong>
                      {' '}formatos
                    </span>
                    <span className="h-5 w-px shrink-0 bg-[var(--stone-300)]" aria-hidden />
                    <span className="truncate">
                      <strong className="font-serif text-[16px] font-semibold text-[var(--ink)]">{selectedClientIds.length}</strong>
                      {' '}clientes
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="lg:h-11 lg:min-w-[126px] lg:rounded-[8px] lg:border-[var(--stone-300)] lg:bg-white lg:px-5 lg:text-[13px] lg:font-semibold lg:shadow-none"
                      onClick={() => setOpen(false)}
                    >
                      {t('materials.addDialog.cancelButton')}
                    </Button>
                    <Button
                      type="submit"
                      className="lg:h-11 lg:min-w-[168px] lg:rounded-[8px] lg:bg-[var(--olive-700)] lg:px-5 lg:text-[13px] lg:font-semibold lg:text-white lg:shadow-none lg:hover:bg-[var(--olive-600)]"
                      disabled={mutation.isPending}
                    >
                      {mutation.isPending ? t('materials.addDialog.savingButton') : t('materials.addDialog.saveButton')}
                    </Button>
                  </div>
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
                <DialogTitle className={operationalModalTitleClass}>{t('materials.kardexDialog.title')}</DialogTitle>
                <DialogDescription className={operationalModalDescriptionClass}>
                  {t('materials.kardexDialog.description')}
                </DialogDescription>
                <details className="group text-[13px] text-muted-foreground">
                  <summary className="cursor-pointer select-none list-none py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                      <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      {t('materials.kardexDialog.detailTitle')}
                    </span>
                  </summary>
                  <p className="mt-2 max-w-prose text-pretty leading-snug">{t('materials.kardexDialog.detailDesc')}</p>
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
                        <h3 className={operationalModalStepTitle}>{t('materials.kardexDialog.step1')}</h3>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div className="relative shrink-0">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={materialPickerSearch}
                            onChange={(e) => setMaterialPickerSearch(e.target.value)}
                            placeholder={t('materials.kardexDialog.searchPlaceholder')}
                            className={cn(filterInputClass, 'pl-9')}
                            aria-label={t('materials.kardexDialog.searchAriaLabel')}
                          />
                        </div>
                        <div className="min-h-[200px] flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 lg:min-h-0">
                          {groupedPickerOptions.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('materials.kardexDialog.noResults')}</p>
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
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t('materials.kardexDialog.selectedLabel')}
                            </p>
                            <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{selectedKardexMaterial?.nombre_material}</p>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                              {t('materials.kardexDialog.currentStock')}{' '}
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
                            <h3 className={operationalModalStepTitle}>{t('materials.kardexDialog.step2')}</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            {moveTypeOptions.map((opt) => (
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
                            <h3 className={operationalModalStepTitle}>{t('materials.kardexDialog.step3')}</h3>
                          </div>
                          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                            {moveRefType === 'compra' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.supplierLabel')}</Label>
                                  {purchaseSuppliersLoading ? (
                                    <p className="text-xs text-slate-500">{t('materials.kardexDialog.supplierLoading')}</p>
                                  ) : (purchaseSuppliers?.suppliers.length ?? 0) === 0 ? (
                                    <p className="text-xs text-amber-800">
                                      {t('materials.kardexDialog.supplierEmpty')}{' '}
                                      <Link
                                        to="/masters?tab=packing_suppliers"
                                        className="font-medium text-[#0F6E56] underline underline-offset-2"
                                      >
                                        {t('materials.kardexDialog.supplierEmptyLink')}
                                      </Link>
                                    </p>
                                  ) : (
                                    <select
                                      className={filterSelectClass}
                                      value={moveSupplierId}
                                      onChange={(e) => setMoveSupplierId(Number(e.target.value) || 0)}
                                    >
                                      <option value={0}>{t('materials.kardexDialog.supplierPlaceholder')}</option>
                                      {(purchaseSuppliers?.suppliers ?? []).map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.nombre}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.purchaseDateLabel')}</Label>
                                  <Input
                                    type="date"
                                    value={moveOccurredDate}
                                    onChange={(e) => setMoveOccurredDate(e.target.value)}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.qtyLabel')}</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder={t('materials.kardexDialog.qtyPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.ocLabel')}</Label>
                                  <Input
                                    value={moveGuideRef}
                                    onChange={(e) => setMoveGuideRef(e.target.value)}
                                    placeholder={t('materials.kardexDialog.ocPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.invoiceLabel')}</Label>
                                  <Input
                                    value={moveInvoiceRef}
                                    onChange={(e) => setMoveInvoiceRef(e.target.value)}
                                    placeholder={t('materials.kardexDialog.invoicePlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600" title="Referencia de costo por unidad de medida del material">
                                    {t('materials.kardexDialog.unitCostLabel')}
                                  </Label>
                                  <Input
                                    value={moveUnitCostRef}
                                    onChange={(e) => setMoveUnitCostRef(e.target.value)}
                                    placeholder={t('materials.kardexDialog.unitCostPlaceholder')}
                                    title="Referencia de costo por unidad"
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.guideLabel')}</Label>
                                  <Input
                                    value={moveGuiaRef}
                                    onChange={(e) => setMoveGuiaRef(e.target.value)}
                                    placeholder={t('materials.kardexDialog.guidePlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.reasonLabel')}</Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder={t('materials.kardexDialog.reasonPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                            {moveRefType === 'salida' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.qtyLabel')}</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder={t('materials.kardexDialog.qtyExitPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.guideOptLabel')}</Label>
                                  <Input
                                    value={moveGuideRef}
                                    onChange={(e) => setMoveGuideRef(e.target.value)}
                                    placeholder={t('materials.kardexDialog.guideOptPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">
                                    {t('materials.kardexDialog.reasonRequired')} <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder={t('materials.kardexDialog.reasonExitPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                            {moveRefType === 'manual' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.qtyDeltaLabel')}</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder={t('materials.kardexDialog.qtyDeltaPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">
                                    {t('materials.kardexDialog.reasonRequired')} <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder={t('materials.kardexDialog.reasonManualPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                              </>
                            ) : null}
                            {moveRefType === 'inventario_inicial' ? (
                              <>
                                <div className="grid min-w-0 gap-1.5">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.qtyInitialLabel')}</Label>
                                  <Input
                                    value={moveDelta}
                                    onChange={(e) => setMoveDelta(e.target.value)}
                                    placeholder={t('materials.kardexDialog.qtyInitialPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.refOptLabel')}</Label>
                                  <Input
                                    value={moveGuideRef}
                                    onChange={(e) => setMoveGuideRef(e.target.value)}
                                    placeholder={t('materials.kardexDialog.refOptPlaceholder')}
                                    className={filterInputClass}
                                  />
                                </div>
                                <div className="grid min-w-0 gap-1.5 sm:col-span-2">
                                  <Label className="text-xs text-slate-600">{t('materials.kardexDialog.reasonLabel')}</Label>
                                  <Input
                                    value={moveNota}
                                    onChange={(e) => setMoveNota(e.target.value)}
                                    placeholder={t('materials.kardexDialog.reasonPlaceholder')}
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
                            <h3 className={operationalModalStepTitle}>{t('materials.kardexDialog.step4')}</h3>
                          </div>
                          <p className="mb-3 shrink-0 text-xs text-muted-foreground">
                            {moveRefType === 'compra'
                              ? t('materials.kardexDialog.reqPurchase')
                              : moveRefType === 'salida' || moveRefType === 'manual'
                                ? t('materials.kardexDialog.reqExitManual')
                                : t('materials.kardexDialog.reqInitial')}
                          </p>
                          <p className={cn(materialCardFieldLabelClass, 'mb-2')}>{t('materials.kardexDialog.recentHistory')}</p>
                          <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-border lg:min-h-[200px]">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t('materials.kardexDialog.histColDate')}</TableHead>
                                  <TableHead>Δ</TableHead>
                                  <TableHead>{t('materials.kardexDialog.histColRef')}</TableHead>
                                  <TableHead>{t('materials.kardexDialog.histColNote')}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(movements ?? []).length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                                      {t('materials.kardexDialog.histEmpty')}
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  (movements ?? []).map((mv) => (
                                    <TableRow key={mv.id}>
                                      <TableCell className="whitespace-nowrap text-xs">
                                        {new Date(mv.occurred_at?.trim() ? mv.occurred_at : mv.created_at).toLocaleString('es')}
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
                        {t('materials.kardexDialog.selectHint')}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className={cn(operationalModalFooterClass, 'flex flex-row flex-wrap justify-end gap-2')}>
                  <Button type="button" variant="outline" onClick={() => setKardexOpen(false)}>
                    {t('materials.kardexDialog.cancelButton')}
                  </Button>
                  <Button
                    type="button"
                    disabled={movementMut.isPending || !canSubmitAdjustment}
                    onClick={() => movementMut.mutate()}
                  >
                    {movementMut.isPending ? t('materials.kardexDialog.savingButton') : t('materials.kardexDialog.saveButton')}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

      <section data-materials-mobile-kpis aria-labelledby="materials-kpis-mobile" className="space-y-2 lg:hidden">
        <div>
          <h2 id="materials-kpis-mobile" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
            {t('materials.summary.title')}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--ink-muted)]">{t('materials.summary.description')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: t('materials.summary.activeMaterials'),
              value: String(inventorySummary.activeMaterials),
              Icon: PineBoxesIcon,
              card: 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
              well: 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
            },
            {
              label: t('materials.summary.categoriesWithStock'),
              value: String(inventorySummary.categories),
              Icon: PineCubeIcon,
              card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
              well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
            },
            {
              label: t('materials.summary.withStock'),
              value: String(inventorySummary.stockLines),
              Icon: PineLeafIcon,
              card:
                inventorySummary.stockLines > 0
                  ? 'border-[var(--sage-200)] bg-[var(--sage-100)]'
                  : 'border-[var(--stone-300)] bg-[var(--stone-100)]',
              well:
                inventorySummary.stockLines > 0
                  ? 'bg-[var(--sage-200)] text-[var(--olive-700)]'
                  : 'bg-[#DED9CF] text-[#41443F]',
            },
            {
              label: t('materials.summary.referenceValue'),
              value: `$${formatMoneySimple(inventorySummary.stockValue)}`,
              Icon: PineDocumentIcon,
              card: 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
              well: 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
            },
          ].map(({ label, value, Icon, card, well }) => (
            <div
              key={label}
              className={cn(
                kpiCard,
                'min-h-[112px] flex-row items-start gap-2.5 rounded-[var(--radius-lg)] px-3 py-3',
                card,
              )}
            >
              <span className={cn('inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[9px]', well)} aria-hidden>
                <Icon size={36} className="h-[30px] w-[30px]" />
              </span>
              <div className="min-w-0">
                <p className="font-serif text-[12px] font-semibold leading-tight text-[var(--ink)]">{label}</p>
                <p className="mt-1 font-serif text-[20px] font-bold tabular-nums leading-tight tracking-[-0.65px] text-[var(--ink)]">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        data-materials-desktop-kpis
        aria-labelledby="materials-kpis-desktop"
        className="hidden space-y-2.5 lg:block lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white/45 lg:px-[14px] lg:py-2.5"
      >
        <div>
          <h2 id="materials-kpis-desktop" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
            {t('materials.summary.title')}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--ink-muted)]">{t('materials.summary.description')}</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: t('materials.summary.activeMaterials'),
              value: String(inventorySummary.activeMaterials),
              Icon: PineBoxesIcon,
              card: 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
              well: 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
            },
            {
              label: t('materials.summary.categoriesWithStock'),
              value: String(inventorySummary.categories),
              Icon: PineCubeIcon,
              card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
              well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
            },
            {
              label: t('materials.summary.withStock'),
              value: String(inventorySummary.stockLines),
              Icon: PineLeafIcon,
              card:
                inventorySummary.stockLines > 0
                  ? 'border-[var(--sage-200)] bg-[var(--sage-100)]'
                  : 'border-[var(--stone-300)] bg-[var(--stone-100)]',
              well:
                inventorySummary.stockLines > 0
                  ? 'bg-[var(--sage-200)] text-[var(--olive-700)]'
                  : 'bg-[#DED9CF] text-[#41443F]',
            },
            {
              label: t('materials.summary.referenceValue'),
              value: `$${formatMoneySimple(inventorySummary.stockValue)}`,
              Icon: PineDocumentIcon,
              card: 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
              well: 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
            },
          ].map(({ label, value, Icon, card, well }) => (
            <div
              key={label}
              className={cn(
                kpiCard,
                'lg:flex lg:min-h-[104px] lg:flex-row lg:items-center lg:gap-4 lg:rounded-[var(--radius-lg)] lg:px-3.5 lg:py-3',
                card,
              )}
            >
              <span className={cn('inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[9px]', well)} aria-hidden>
                <Icon size={36} className="h-9 w-9" />
              </span>
              <div className="min-w-0">
                <p className={cn(kpiLabel, 'lg:font-serif lg:text-[13px] lg:font-medium lg:normal-case lg:tracking-normal lg:text-[var(--ink)]')}>
                  {label}
                </p>
                <p className={cn(kpiValueLg, 'lg:mt-1 lg:font-serif lg:text-[28px] lg:font-bold lg:tabular-nums lg:leading-none lg:tracking-[-0.65px] lg:text-[var(--ink)]')}>
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Card
        data-materials-inventory
        className={cn(
          contentCard,
          'max-lg:rounded-[12px] max-lg:border-[var(--stone-300)] max-lg:bg-white/70 max-lg:shadow-none',
          'lg:mt-1 lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-white/70 lg:shadow-none',
        )}
      >
        <CardHeader className="pb-2 lg:flex lg:flex-row lg:items-end lg:justify-between lg:gap-4 lg:space-y-0">
          <div>
            <CardTitle className="text-base font-semibold max-lg:font-serif max-lg:text-[20px] max-lg:text-[var(--ink)] lg:font-serif lg:text-[22px] lg:text-[var(--ink)]">
              {t('materials.inventory.title')}
            </CardTitle>
            <CardDescription className="max-lg:mt-1 max-lg:text-[13px] max-lg:text-[var(--ink-muted)] lg:mt-1 lg:text-[13px] lg:text-[var(--ink-muted)]">
              {t('materials.inventory.description')}
              {' · '}
              {inventoryVisibleCount}{' '}
              {inventoryVisibleCount === 1 ? t('materials.inventory.material') : t('materials.inventory.materials')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div data-materials-mobile-filters className="space-y-2 rounded-[12px] border border-[var(--stone-300)] bg-white/70 p-3 lg:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
              <Input
                placeholder={t('materials.inventory.searchPlaceholder')}
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className={cn(filterInputClass, 'h-11 border-[var(--stone-300)] bg-white pl-9 text-[13px]')}
                aria-label={t('materials.inventory.searchPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 w-full gap-1.5 rounded-[8px] border-[var(--stone-300)] bg-white px-4 text-[12px] font-semibold"
              onClick={() => setInventoryMoreFilters((v) => !v)}
            >
              <Filter className="h-4 w-4" strokeWidth={2} aria-hidden />
              {inventoryMoreFilters ? t('existenciasPt.filters.hideFilters') : t('existenciasPt.filters.moreFilters')}
              <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', inventoryMoreFilters ? 'rotate-180' : '')} />
            </Button>
            {inventoryMoreFilters || inventoryCategoryFilter > 0 ? (
              <div className="grid gap-1 border-t border-[var(--stone-200)] pt-3">
                <Label className="text-[11px] text-[var(--ink-muted)]">{t('materials.inventory.allCategories')}</Label>
                <select
                  className={cn(filterSelectClass, 'h-11 w-full border-[var(--stone-300)] bg-white text-[13px]')}
                  value={inventoryCategoryFilter}
                  onChange={(e) => setInventoryCategoryFilter(Number(e.target.value))}
                >
                  <option value={0}>{t('materials.inventory.allCategories')}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div
            data-materials-desktop-filters
            className="hidden min-h-[62px] rounded-[10px] border border-[var(--stone-300)] bg-white/70 px-3.5 py-[11px] lg:block"
          >
            <div className="flex items-center gap-2">
              <div className="relative min-w-[16rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
                <Input
                  placeholder={t('materials.inventory.searchPlaceholder')}
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className={cn(filterInputClass, 'h-10 border-[var(--stone-300)] bg-white pl-9')}
                  aria-label={t('materials.inventory.searchPlaceholder')}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 min-w-[146px] gap-1.5 border-[var(--stone-300)] bg-white px-4"
                onClick={() => setInventoryMoreFilters((v) => !v)}
              >
                <Filter className="h-4 w-4" strokeWidth={2} aria-hidden />
                {inventoryMoreFilters ? t('existenciasPt.filters.hideFilters') : t('existenciasPt.filters.moreFilters')}
                <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', inventoryMoreFilters ? 'rotate-180' : '')} />
              </Button>
            </div>
            {inventoryMoreFilters || inventoryCategoryFilter > 0 ? (
              <div className="mt-3 grid grid-cols-12 items-end gap-2 border-t border-[var(--stone-200)] pt-3">
                <div className="col-span-4 grid gap-1.5">
                  <Label className="text-xs text-[var(--ink-muted)]">{t('materials.inventory.allCategories')}</Label>
                  <select
                    className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                    value={inventoryCategoryFilter}
                    onChange={(e) => setInventoryCategoryFilter(Number(e.target.value))}
                  >
                    <option value={0}>{t('materials.inventory.allCategories')}</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </div>
          {groupedInventoryFiltered.length === 0 ? (
            <div
              data-materials-empty
              className="rounded-[10px] border border-dashed border-[var(--stone-300)] bg-[var(--stone-50)]/80 px-4 py-4 text-center max-lg:py-5 lg:py-10"
            >
              <p className="text-sm text-slate-500 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]">
                {t('materials.inventory.empty')}
              </p>
            </div>
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
                      {group.items.length}{' '}
                      {group.items.length === 1 ? t('materials.inventory.material') : t('materials.inventory.materials')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.items.map((row) => {
                    const stockNum = Number(row.cantidad_disponible);
                    const stockN = Number.isFinite(stockNum) ? stockNum : 0;
                    return (
                    <article key={`card-${row.id}`} className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm lg:border-[var(--stone-300)] lg:shadow-none">
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
                          <p className={materialCardFieldLabelClass}>{t('materials.inventory.stockLabel')}</p>
                          <div className="mt-0.5 flex flex-col items-end gap-1">
                            <p
                              className={cn(
                                'text-lg font-semibold tabular-nums leading-none',
                                stockDisplayClass(stockN),
                              )}
                            >
                              {formatQty(row.cantidad_disponible)}
                            </p>
                            {stockN <= 0 ? (
                              <Badge variant="outline" className="border-red-200 bg-red-50 px-1.5 py-0 text-[10px] text-red-700">
                                {t('materials.inventory.noStock')}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-slate-500">{row.unidad_medida}</p>
                        </div>
                      </div>
                      <MasterCostEditor
                        row={row}
                        saving={savingId === row.id}
                        onSave={(cost) =>
                          updateMut.mutate(
                            { id: row.id, body: { costo_unitario: cost } },
                            {
                              onSuccess: () => toast.success(t('materials.toast.costUpdated')),
                            },
                          )
                        }
                      />
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
                            setMoveOccurredDate(localDateYmd());
                            setMaterialPickerSearch('');
                            setKardexOpen(true);
                          }}
                        >
                          {t('materials.inventory.adjustButton')}
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
                            setMoveOccurredDate(localDateYmd());
                            setMaterialPickerSearch('');
                            setKardexOpen(true);
                          }}
                        >
                          {t('materials.inventory.fixButton')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => setRenameRow(row)}
                        >
                          {t('materials.inventory.editButton')}
                        </Button>
                      </div>
                      <div className="mt-1.5 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[10px] text-slate-600"
                          onClick={() => setLinkDialogMaterialId(row.id)}
                          title={t('materials.inventory.suppliersButton')}
                        >
                          <Link2 className="h-3 w-3" aria-hidden />
                          {t('materials.inventory.suppliersButton')}
                        </Button>
                      </div>
                      {canDelete ? (
                        <div className="mt-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-full border-red-200 text-[11px] text-red-700 hover:bg-red-50"
                            disabled={deleteMut.isPending}
                            onClick={() => setDeleteConfirmRow(row)}
                          >
                            {t('materials.inventory.deleteButton')}
                          </Button>
                        </div>
                      ) : null}
                      <div className="mt-1.5">
                        <Button asChild type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 text-[11px]">
                          <Link to={`/packaging/kardex?material=${row.id}`}>
                            <BarChart2 className="h-3.5 w-3.5" aria-hidden />
                            {t('materials.inventory.kardexButton')}
                          </Link>
                        </Button>
                      </div>
                    </article>
                    );
                  })}
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
            <DialogTitle>{t('materials.linkDialog.title')}</DialogTitle>
            <p className="text-sm text-muted-foreground">{t('materials.linkDialog.description')}</p>
          </DialogHeader>
          {linkDialogMaterialId > 0 && (
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium">
                {(data ?? []).find((m) => m.id === linkDialogMaterialId)?.nombre_material ?? `#${linkDialogMaterialId}`}
              </p>
              {(materialLinks ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('materials.linkDialog.noSuppliers')}</p>
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
            <DialogTitle>{t('materials.scopeDialog.title')}</DialogTitle>
          </DialogHeader>
          {scopeEditRow ? (
            <div className="grid gap-4 py-2">
              <p className="text-sm text-muted-foreground">
                {t('materials.scopeDialog.materialLabel')}{' '}
                <span className="font-medium text-foreground">{scopeEditRow.nombre_material}</span>
              </p>
              <div className="grid gap-1.5">
                <Label>{t('materials.scopeDialog.formatsLabel')}</Label>
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
                <Label>{t('materials.scopeDialog.clientsLabel')}</Label>
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
              {t('materials.scopeDialog.cancelButton')}
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
                      toast.success(t('materials.toast.scopeUpdated'));
                      setScopeEditRow(null);
                    },
                  },
                );
              }}
            >
              {updateMut.isPending ? t('materials.scopeDialog.savingButton') : t('materials.scopeDialog.saveButton')}
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
            <DialogTitle>{t('materials.renameDialog.title')}</DialogTitle>
          </DialogHeader>
          {renameRow ? (
            <div className="grid gap-2 py-2">
              <Label htmlFor="rename_material_name">{t('materials.renameDialog.nameLabel')}</Label>
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
              {t('materials.renameDialog.cancelButton')}
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
                      toast.success(t('materials.toast.nameUpdated'));
                      setRenameRow(null);
                    },
                  },
                );
              }}
            >
              {updateMut.isPending && savingId === renameRow?.id
                ? t('materials.renameDialog.savingButton')
                : t('materials.renameDialog.saveButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmRow != null} onOpenChange={(o) => !o && setDeleteConfirmRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('materials.deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('materials.deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          {deleteConfirmRow ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
              {deleteConfirmRow.nombre_material}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmRow(null)}>
              {t('materials.deleteDialog.cancelButton')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteConfirmRow || deleteMut.isPending}
              onClick={() => {
                if (!deleteConfirmRow) return;
                deleteMut.mutate(deleteConfirmRow.id);
              }}
            >
              {deleteMut.isPending ? t('materials.deleteDialog.deletingButton') : t('materials.deleteDialog.deleteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card
        data-materials-notices
        className="max-lg:rounded-[12px] max-lg:border-[var(--stone-300)] max-lg:bg-white/70 max-lg:shadow-none lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-white/70 lg:shadow-none"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base max-lg:font-serif max-lg:text-[20px] max-lg:text-[var(--ink)] lg:font-serif lg:text-[20px] lg:text-[var(--ink)]">{t('materials.notices.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">{t('materials.notices.duplicatesTitle')}</p>
            {duplicates.length === 0 ? (
              <p className="text-muted-foreground">{t('materials.notices.noDuplicates')}</p>
            ) : (
              <div className="space-y-2">
                {duplicates.map((g) => (
                  <div key={g.name} className="rounded-md border border-border p-2">
                    <p className="font-medium">{g.rows[0].nombre_material}</p>
                    <p className="text-xs text-muted-foreground">{t('materials.notices.duplicateHint')}</p>
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
                          {idx === 0 ? t('materials.notices.keepButton', { id: r.id }) : t('materials.notices.removeButton', { id: r.id })}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-foreground">{t('materials.notices.formatLikeTitle')}</p>
            {formatLikeMaterials.length === 0 ? (
              <p className="text-muted-foreground">{t('materials.notices.noFormatLike')}</p>
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
                    {t('materials.notices.removeFormatLike', { name: m.nombre_material })}
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
