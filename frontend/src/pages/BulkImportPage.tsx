import { useCallback, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Download, FileText, FileUp, ShieldAlert, Upload } from 'lucide-react';
import { apiFetch, apiJson, parseApiError } from '@/api';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  pageHeaderRow,
  pageStack,
  pageSubtitle,
  pageTitle,
  tableBodyRow,
  tableCellComfortable,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { toast } from 'sonner';

type ImportEntity =
  | 'receptions'
  | 'processes'
  | 'pt-tags'
  | 'final-pallets'
  | 'sales-orders'
  | 'dispatches';

const TABS: { key: ImportEntity; label: string }[] = [
  { key: 'receptions', label: 'Recepciones' },
  { key: 'processes', label: 'Procesos' },
  { key: 'pt-tags', label: 'Unidad PT' },
  { key: 'final-pallets', label: 'Existencias PT' },
  { key: 'sales-orders', label: 'Pedidos' },
  { key: 'dispatches', label: 'Despachos' },
];

type ImportSummary = {
  total: number;
  inserted: number;
  deleted?: number;
  skipped: number;
  errors: { row: number; field?: string; message: string }[];
};

type ReceptionPreviewRow = {
  id: number;
  reference_code: string | null;
  created_at: string;
  document_state_codigo: string | null;
  line_count: number;
};

type SalesOrderPreviewRow = {
  id: number;
  order_number: string;
  cliente_id: number;
  line_count: number;
  dispatch_count: number;
  estado_comercial: string | null;
  fecha_pedido: string | null;
};

type PtTagPreviewRow = {
  id: number;
  tag_code: string;
  fecha: string;
  format_code: string;
  total_cajas: number;
  total_pallets: number;
  dispatch_count: number;
  invoice_line_count: number;
  merge_involved: boolean;
  client_nombre: string | null;
  can_delete: boolean;
};

type ProcessPreviewRow = {
  id: number;
  fecha_proceso: string;
  recepcion_id: number;
  process_status: string;
  balance_closed: boolean;
  peso_procesado_lb: string;
  pt_tag_item_count: number;
  final_pallet_line_count: number;
  invoice_item_count: number;
  repallet_prov_count: number;
  can_delete: boolean;
};

type ImportLog = {
  id: number;
  created_at: string;
  username: string;
  entity_key: string;
  total_rows: number;
  inserted: number;
  skipped: number;
  errors_count: number;
  errors_sample?: Array<{ row: number; field?: string; message: string }> | null;
};

const STEPS = ['Plantilla', 'Archivo', 'Preview', 'Resultado'] as const;

type ParsedCsv = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  mainRows: number;
  detailRows: number;
};

function parseCsvForUi(text: string): ParsedCsv {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  const allRows = (parsed.data ?? []).filter((r: string[]) => Array.isArray(r));
  const rowsNoComments = allRows.filter((r: string[]) =>
    (r[0] ?? '').trim() ? !(r[0] ?? '').trim().startsWith('#') : true,
  );
  if (!rowsNoComments.length) {
    return { headers: [], rows: [], totalRows: 0, mainRows: 0, detailRows: 0 };
  }
  const headers = rowsNoComments[0].map((x: string) => x ?? '');
  const rows = rowsNoComments.slice(1).map((r: string[]) => headers.map((_: string, i: number) => r[i] ?? ''));
  const totalRows = rows.length;
  const mainRows = rows.filter((r: string[]) => (r[0] ?? '').trim() !== '').length;
  const detailRows = totalRows - mainRows;
  return { headers, rows, totalRows, mainRows, detailRows };
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function BulkImportPage() {
  const { role, username } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ImportEntity>('receptions');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showErrors, setShowErrors] = useState(true);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<number, boolean>>({});
  const [lastBackupTs, setLastBackupTs] = useState<string | null>(() => localStorage.getItem('last_backup_ts'));
  const [receptionDeleteSelected, setReceptionDeleteSelected] = useState<number[]>([]);
  const [receptionDeleteLastN, setReceptionDeleteLastN] = useState('103');
  const [receptionDeleteDialogOpen, setReceptionDeleteDialogOpen] = useState(false);
  const [salesOrderDeleteSelected, setSalesOrderDeleteSelected] = useState<number[]>([]);
  const [salesOrderDeleteLastN, setSalesOrderDeleteLastN] = useState('103');
  const [salesOrderDeleteDialogOpen, setSalesOrderDeleteDialogOpen] = useState(false);
  const [ptTagDeleteSelected, setPtTagDeleteSelected] = useState<number[]>([]);
  const [ptTagDeleteLastN, setPtTagDeleteLastN] = useState('50');
  const [ptTagDeleteDialogOpen, setPtTagDeleteDialogOpen] = useState(false);
  const [processDeleteSelected, setProcessDeleteSelected] = useState<number[]>([]);
  const [processDeleteLastN, setProcessDeleteLastN] = useState('50');
  const [processDeleteDialogOpen, setProcessDeleteDialogOpen] = useState(false);

  const previewRows = useMemo(() => (parsed ? parsed.rows.slice(0, 8) : []), [parsed]);

  const resetFlow = useCallback(() => {
    setFile(null);
    setParsed(null);
    setCurrentStep(1);
    setSummary(null);
    setShowErrors(true);
  }, []);

  const onPickFile = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      setParsed(null);
      setCurrentStep(2);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.csv')) {
      toast.error('Solo se acepta archivo .csv');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      const t = typeof reader.result === 'string' ? reader.result : '';
      const parsedCsv = parseCsvForUi(t);
      setParsed(parsedCsv);
      setCurrentStep(3);
    };
    reader.readAsText(f, 'UTF-8');
  }, []);

  const logsQuery = useQuery({
    queryKey: ['import-logs'],
    queryFn: () => apiJson<ImportLog[]>('/api/import/logs?limit=20'),
    staleTime: 5_000,
  });

  const receptionsPreviewQuery = useQuery({
    queryKey: ['import-receptions-preview'],
    queryFn: () => apiJson<ReceptionPreviewRow[]>('/api/import/receptions/recent-for-delete?limit=250'),
    enabled: tab === 'receptions',
    staleTime: 8_000,
  });

  const salesOrdersPreviewQuery = useQuery({
    queryKey: ['import-sales-orders-preview'],
    queryFn: () => apiJson<SalesOrderPreviewRow[]>('/api/import/sales-orders/recent-for-delete?limit=250'),
    enabled: tab === 'sales-orders',
    staleTime: 8_000,
  });

  const ptTagsPreviewQuery = useQuery({
    queryKey: ['import-pt-tags-preview'],
    queryFn: () => apiJson<PtTagPreviewRow[]>('/api/import/pt-tags/recent-for-delete?limit=250'),
    enabled: tab === 'pt-tags',
    staleTime: 8_000,
  });

  const processesPreviewQuery = useQuery({
    queryKey: ['import-processes-preview'],
    queryFn: () => apiJson<ProcessPreviewRow[]>('/api/import/processes/recent-for-delete?limit=250'),
    enabled: tab === 'processes',
    staleTime: 8_000,
  });

  const deleteSalesOrdersMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch('/api/import/sales-orders/delete-by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Confirm-Purge': 'CONFIRMO-BORRAR-PEDIDOS-POR-ID',
        },
        body: JSON.stringify({ sales_order_ids: ids }),
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as {
        deleted_sales_orders: number;
        deleted_lines: number;
        cleared_planned_pallets: number;
        deleted_modifications: number;
      };
    },
    onSuccess: (data) => {
      setSalesOrderDeleteDialogOpen(false);
      setSalesOrderDeleteSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['import-sales-orders-preview'] });
      void queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      toast.success(
        `Borrados ${data.deleted_sales_orders} pedido(s), ${data.deleted_lines} línea(s), ` +
          `${data.cleared_planned_pallets} vínculo(s) plan en PT, ${data.deleted_modifications} registro(s) de historial`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo borrar'),
  });

  const deletePtTagsMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch('/api/import/pt-tags/delete-by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Confirm-Purge': 'CONFIRMO-BORRAR-UNIDADES-PT-POR-ID',
        },
        body: JSON.stringify({ tarja_ids: ids }),
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as { deleted_pt_tags: number };
    },
    onSuccess: (data) => {
      setPtTagDeleteDialogOpen(false);
      setPtTagDeleteSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['import-pt-tags-preview'] });
      void queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      toast.success(`Borradas ${data.deleted_pt_tags} unidad(es) PT`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo borrar'),
  });

  const deleteProcessesMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch('/api/import/processes/delete-by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Confirm-Purge': 'CONFIRMO-BORRAR-PROCESOS-POR-ID',
        },
        body: JSON.stringify({ process_ids: ids }),
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as { deleted_processes: number; deleted_raw_movements: number };
    },
    onSuccess: (data) => {
      setProcessDeleteDialogOpen(false);
      setProcessDeleteSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      void queryClient.invalidateQueries({ queryKey: ['import-processes-preview'] });
      void queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      toast.success(
        `Borrados ${data.deleted_processes} proceso(s), ${data.deleted_raw_movements} movimiento(s) de MP asociados`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo borrar'),
  });

  const deleteReceptionsMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch('/api/import/receptions/delete-by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Confirm-Purge': 'CONFIRMO-BORRAR-RECEPCIONES-POR-ID',
        },
        body: JSON.stringify({ reception_ids: ids }),
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as {
        deleted_receptions: number;
        deleted_lines: number;
        deleted_movements: number;
      };
    },
    onSuccess: (data) => {
      setReceptionDeleteDialogOpen(false);
      setReceptionDeleteSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['receptions'] });
      void queryClient.invalidateQueries({ queryKey: ['import-receptions-preview'] });
      void queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(
        `Borradas ${data.deleted_receptions} recepción(es), ${data.deleted_lines} línea(s), ${data.deleted_movements} movimiento(s) de MP`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo borrar'),
  });

  const toggleReceptionDeleteSelect = useCallback((id: number) => {
    setReceptionDeleteSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectLastNBorrador = useCallback(() => {
    const rows = receptionsPreviewQuery.data ?? [];
    const n = Math.max(1, Math.min(500, Number(receptionDeleteLastN) || 103));
    const draft = rows.filter((r) => (r.document_state_codigo ?? '').trim().toLowerCase() === 'borrador');
    const ids = draft.slice(0, n).map((r) => r.id);
    setReceptionDeleteSelected(ids);
    if (ids.length < n) {
      toast.success(`Solo hay ${ids.length} recepción(es) en borrador en esta vista (pediste ${n}).`);
    } else {
      toast.success(`${ids.length} recepciones en borrador seleccionadas.`);
    }
  }, [receptionDeleteLastN, receptionsPreviewQuery.data]);

  const toggleSalesOrderDeleteSelect = useCallback((id: number) => {
    setSalesOrderDeleteSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectLastNSinDespacho = useCallback(() => {
    const rows = salesOrdersPreviewQuery.data ?? [];
    const n = Math.max(1, Math.min(500, Number(salesOrderDeleteLastN) || 103));
    const draft = rows.filter((r) => (r.dispatch_count ?? 0) === 0);
    const ids = draft.slice(0, n).map((r) => r.id);
    setSalesOrderDeleteSelected(ids);
    if (ids.length < n) {
      toast.success(`Solo hay ${ids.length} pedido(s) sin despacho en esta vista (pediste ${n}).`);
    } else {
      toast.success(`${ids.length} pedidos sin despacho seleccionados.`);
    }
  }, [salesOrderDeleteLastN, salesOrdersPreviewQuery.data]);

  const togglePtTagDeleteSelect = useCallback((id: number) => {
    setPtTagDeleteSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectLastNDeletablePtTags = useCallback(() => {
    const rows = ptTagsPreviewQuery.data ?? [];
    const n = Math.max(1, Math.min(500, Number(ptTagDeleteLastN) || 50));
    const draft = rows.filter((r) => r.can_delete);
    const ids = draft.slice(0, n).map((r) => r.id);
    setPtTagDeleteSelected(ids);
    if (ids.length < n) {
      toast.success(
        `Solo hay ${ids.length} unidad(es) PT borrable(s) en esta vista (pediste ${n}). Las demás tienen despacho, factura o merge.`,
      );
    } else {
      toast.success(`${ids.length} unidades PT seleccionadas (borrables).`);
    }
  }, [ptTagDeleteLastN, ptTagsPreviewQuery.data]);

  const toggleProcessDeleteSelect = useCallback((id: number) => {
    setProcessDeleteSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectLastNDeletableProcesses = useCallback(() => {
    const rows = processesPreviewQuery.data ?? [];
    const n = Math.max(1, Math.min(500, Number(processDeleteLastN) || 50));
    const draft = rows.filter((r) => r.can_delete);
    const ids = draft.slice(0, n).map((r) => r.id);
    setProcessDeleteSelected(ids);
    if (ids.length < n) {
      toast.success(
        `Solo hay ${ids.length} proceso(s) borrable(s) en esta vista (pediste ${n}). Revisá estado, balance, tarjas o existencias PT.`,
      );
    } else {
      toast.success(`${ids.length} procesos seleccionados (borrables).`);
    }
  }, [processDeleteLastN, processesPreviewQuery.data]);

  const templateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/import/${tab}/template`, {
        method: 'GET',
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const blob = await res.blob();
      const name = `${tab}_plantilla.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    },
    onSuccess: () => {
      setCurrentStep((s) => Math.max(s, 2));
      toast.success('Plantilla descargada');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo descargar'),
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/backup/full', {
        method: 'GET',
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/i.exec(cd) ?? /filename=([^;\s]+)/i.exec(cd);
      const filename = match?.[1]?.trim() || `packing_backup_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      return filename;
    },
    onSuccess: (filename) => {
      const ts = new Date().toISOString();
      localStorage.setItem('last_backup_ts', ts);
      setLastBackupTs(ts);
      toast.success(`Respaldo descargado: ${filename}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo generar el respaldo'),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Seleccioná un archivo CSV');
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(`/api/import/${tab}`, {
        method: 'POST',
        body: fd,
        psSkipForbiddenRedirect: true,
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as ImportSummary;
    },
    onSuccess: (data) => {
      setSummary(data);
      setCurrentStep(4);
      void queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      if (tab === 'receptions') {
        void queryClient.invalidateQueries({ queryKey: ['receptions'] });
        void queryClient.invalidateQueries({ queryKey: ['import-receptions-preview'] });
        /** Saldo MP por línea (raw_material_movements): KPI «MP disponible p/proceso» y elegibles en Procesos. */
        void queryClient.invalidateQueries({ queryKey: ['processes'] });
      }
      if (tab === 'sales-orders') {
        void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['import-sales-orders-preview'] });
      }
      if (tab === 'pt-tags') {
        void queryClient.invalidateQueries({ queryKey: ['pt-tags'] });
        void queryClient.invalidateQueries({ queryKey: ['import-pt-tags-preview'] });
        /** Los totales de proceso (lb_packout, lb_pt_asignadas) se recalculan en GET /api/processes. */
        void queryClient.invalidateQueries({ queryKey: ['processes'] });
      }
      if (tab === 'processes') {
        void queryClient.invalidateQueries({ queryKey: ['processes'] });
        void queryClient.invalidateQueries({ queryKey: ['import-processes-preview'] });
      }
      toast.success('Importación finalizada');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error de red'),
  });

  const nowFmt = useMemo(() => new Date().toLocaleString(), [summary]);
  const hasData = (logsQuery.data?.length ?? 0) > 0;
  const shouldWarnBackup = useMemo(() => {
    if (!hasData) return false;
    if (!lastBackupTs) return true;
    const diffMs = Date.now() - new Date(lastBackupTs).getTime();
    return diffMs > 24 * 60 * 60 * 1000;
  }, [hasData, lastBackupTs]);

  if (role !== 'admin') {
    return <Navigate to="/forbidden" replace />;
  }

  return (
    <div className={pageStack}>
      <header className={pageHeaderRow}>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            <h1 className={pageTitle}>Carga masiva</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Solo admin</span>
          </div>
          <p className={pageSubtitle}>
            Importá datos históricos desde tu sistema anterior. Descargá la plantilla, completála y subila.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={backupMutation.isPending}
          onClick={() => backupMutation.mutate()}
        >
          <Download className="h-4 w-4" />
          {backupMutation.isPending ? 'Generando respaldo...' : '⬇ Descargar respaldo completo'}
        </Button>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            🛡️ Antes de limpiar o reimportar datos:
            <br />
            1. Descargá el respaldo completo (botón arriba)
            <br />
            2. Guardalo en un lugar seguro
            <br />
            3. Verificá que el ZIP contiene todos los archivos
            <br />
            4. Solo entonces procedé con la limpieza
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              resetFlow();
            }}
            className={cn(
              'border-b-2 px-1 pb-2 text-sm transition-colors',
              tab === t.key
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'receptions' && (
        <section className="rounded-lg border border-rose-200 bg-rose-50/50">
          <header className="border-b border-rose-200 px-4 py-2.5 text-[11px] uppercase tracking-wide text-rose-900">
            Borrar recepciones (solo borrador)
          </header>
          <div className="space-y-3 p-4 text-sm text-rose-950">
            <p>
              Para que desaparezcan en <strong className="font-semibold">Recepciones</strong>, hay que borrarlas en la
              base y refrescar la lista. Solo se pueden eliminar recepciones en estado <strong>borrador</strong> y sin
              procesos vinculados.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-300 bg-white"
                disabled={receptionsPreviewQuery.isFetching}
                onClick={() => void receptionsPreviewQuery.refetch()}
              >
                {receptionsPreviewQuery.isFetching ? 'Cargando…' : 'Actualizar lista'}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-rose-900 whitespace-nowrap" htmlFor="bulk-del-last-n">
                  Últimas N en borrador
                </label>
                <Input
                  id="bulk-del-last-n"
                  className="h-8 w-20 border-rose-200 bg-white"
                  value={receptionDeleteLastN}
                  onChange={(e) => setReceptionDeleteLastN(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="border-rose-300 bg-white" onClick={selectLastNBorrador}>
                Seleccionar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-300 bg-white"
                onClick={() => setReceptionDeleteSelected([])}
              >
                Limpiar selección
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-rose-700 text-white hover:bg-rose-800"
                disabled={receptionDeleteSelected.length === 0}
                onClick={() => setReceptionDeleteDialogOpen(true)}
              >
                Borrar {receptionDeleteSelected.length || '…'} seleccionada(s)
              </Button>
            </div>

            {receptionsPreviewQuery.isError ? (
              <p className="text-sm text-red-700">No se pudo cargar la vista previa.</p>
            ) : receptionsPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando recepciones recientes…</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-rose-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">Id</TableHead>
                      <TableHead className="text-xs">Referencia</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs">Líneas</TableHead>
                      <TableHead className="text-xs">Alta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(receptionsPreviewQuery.data ?? []).map((r) => {
                      const isBorrador = (r.document_state_codigo ?? '').trim().toLowerCase() === 'borrador';
                      const checked = receptionDeleteSelected.includes(r.id);
                      return (
                        <TableRow key={r.id} className={cn(tableBodyRow, !isBorrador && 'opacity-50')}>
                          <TableCell className="text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-rose-700"
                              disabled={!isBorrador}
                              checked={checked}
                              onChange={() => toggleReceptionDeleteSelect(r.id)}
                              aria-label={`Seleccionar recepción ${r.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="text-xs">{r.reference_code ?? '—'}</TableCell>
                          <TableCell className="text-xs">{r.document_state_codigo ?? '—'}</TableCell>
                          <TableCell className="text-xs">{r.line_count}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'processes' && (
        <section className="rounded-lg border border-violet-200 bg-violet-50/50">
          <header className="border-b border-violet-200 px-4 py-2.5 text-[11px] uppercase tracking-wide text-violet-950">
            Borrar procesos (selectivo)
          </header>
          <div className="space-y-3 p-4 text-sm text-violet-950">
            <p>
              Para quitar procesos cargados por CSV (u otros en <strong className="font-semibold">borrador</strong>
              ), elegí filas en la tabla y confirmá. Solo aplica si el proceso está en borrador, sin balance cerrado, sin
              tarja PT vinculada, sin línea en existencias PT, factura ni repalet. También podés filas CSV con{' '}
              <code className="rounded bg-white px-1 text-xs">import_action=borrar</code> y{' '}
              <code className="rounded bg-white px-1 text-xs">process_id</code>.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-300 bg-white"
                disabled={processesPreviewQuery.isFetching}
                onClick={() => void processesPreviewQuery.refetch()}
              >
                {processesPreviewQuery.isFetching ? 'Cargando…' : 'Actualizar lista'}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-violet-950 whitespace-nowrap" htmlFor="bulk-del-proc-last-n">
                  Primeros N borrables
                </label>
                <Input
                  id="bulk-del-proc-last-n"
                  className="h-8 w-20 border-violet-200 bg-white"
                  value={processDeleteLastN}
                  onChange={(e) => setProcessDeleteLastN(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-300 bg-white"
                onClick={selectLastNDeletableProcesses}
              >
                Seleccionar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-300 bg-white"
                onClick={() => setProcessDeleteSelected([])}
              >
                Limpiar selección
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-violet-800 text-white hover:bg-violet-900"
                disabled={processDeleteSelected.length === 0}
                onClick={() => setProcessDeleteDialogOpen(true)}
              >
                Borrar {processDeleteSelected.length || '…'} seleccionado(s)
              </Button>
            </div>

            {processesPreviewQuery.isError ? (
              <p className="text-sm text-red-700">No se pudo cargar la vista previa.</p>
            ) : processesPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando procesos recientes…</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-violet-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">Id</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs">Recep.</TableHead>
                      <TableHead className="text-xs">Lb proc.</TableHead>
                      <TableHead className="text-xs">PT</TableHead>
                      <TableHead className="text-xs">FPL</TableHead>
                      <TableHead className="text-xs">Fact.</TableHead>
                      <TableHead className="text-xs">Rep.</TableHead>
                      <TableHead className="text-xs">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(processesPreviewQuery.data ?? []).map((r) => {
                      const checked = processDeleteSelected.includes(r.id);
                      return (
                        <TableRow key={r.id} className={cn(tableBodyRow, !r.can_delete && 'opacity-50')}>
                          <TableCell className="text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-violet-800"
                              disabled={!r.can_delete}
                              checked={checked}
                              onChange={() => toggleProcessDeleteSelect(r.id)}
                              aria-label={`Seleccionar proceso ${r.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="text-xs">
                            {r.process_status}
                            {r.balance_closed ? ' · bal.cerr.' : ''}
                          </TableCell>
                          <TableCell className="text-xs">{r.recepcion_id}</TableCell>
                          <TableCell className="text-xs">{r.peso_procesado_lb}</TableCell>
                          <TableCell className="text-xs">{r.pt_tag_item_count}</TableCell>
                          <TableCell className="text-xs">{r.final_pallet_line_count}</TableCell>
                          <TableCell className="text-xs">{r.invoice_item_count}</TableCell>
                          <TableCell className="text-xs">{r.repallet_prov_count}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(r.fecha_proceso)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'sales-orders' && (
        <section className="rounded-lg border border-orange-200 bg-orange-50/50">
          <header className="border-b border-orange-200 px-4 py-2.5 text-[11px] uppercase tracking-wide text-orange-950">
            Borrar pedidos (solo sin despacho)
          </header>
          <div className="space-y-3 p-4 text-sm text-orange-950">
            <p>
              Para que desaparezcan en <strong className="font-semibold">Pedidos</strong>, hay que borrarlos en la base
              y refrescar la lista. Solo se pueden eliminar pedidos <strong>sin ningún despacho</strong> vinculado (
              <code className="rounded bg-white/80 px-1">dispatches.orden_id</code>).
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-orange-300 bg-white"
                disabled={salesOrdersPreviewQuery.isFetching}
                onClick={() => void salesOrdersPreviewQuery.refetch()}
              >
                {salesOrdersPreviewQuery.isFetching ? 'Cargando…' : 'Actualizar lista'}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-orange-950 whitespace-nowrap" htmlFor="bulk-del-so-last-n">
                  Últimos N sin despacho
                </label>
                <Input
                  id="bulk-del-so-last-n"
                  className="h-8 w-20 border-orange-200 bg-white"
                  value={salesOrderDeleteLastN}
                  onChange={(e) => setSalesOrderDeleteLastN(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-orange-300 bg-white"
                onClick={selectLastNSinDespacho}
              >
                Seleccionar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-orange-300 bg-white"
                onClick={() => setSalesOrderDeleteSelected([])}
              >
                Limpiar selección
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-orange-800 text-white hover:bg-orange-900"
                disabled={salesOrderDeleteSelected.length === 0}
                onClick={() => setSalesOrderDeleteDialogOpen(true)}
              >
                Borrar {salesOrderDeleteSelected.length || '…'} seleccionado(s)
              </Button>
            </div>

            {salesOrdersPreviewQuery.isError ? (
              <p className="text-sm text-red-700">No se pudo cargar la vista previa.</p>
            ) : salesOrdersPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando pedidos recientes…</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-orange-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">Id</TableHead>
                      <TableHead className="text-xs">Pedido</TableHead>
                      <TableHead className="text-xs">Despachos</TableHead>
                      <TableHead className="text-xs">Líneas</TableHead>
                      <TableHead className="text-xs">Estado com.</TableHead>
                      <TableHead className="text-xs">Fecha pedido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(salesOrdersPreviewQuery.data ?? []).map((r) => {
                      const sinDespacho = (r.dispatch_count ?? 0) === 0;
                      const checked = salesOrderDeleteSelected.includes(r.id);
                      return (
                        <TableRow key={r.id} className={cn(tableBodyRow, !sinDespacho && 'opacity-50')}>
                          <TableCell className="text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-orange-800"
                              disabled={!sinDespacho}
                              checked={checked}
                              onChange={() => toggleSalesOrderDeleteSelect(r.id)}
                              aria-label={`Seleccionar pedido ${r.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="text-xs">{r.order_number}</TableCell>
                          <TableCell className="text-xs">{r.dispatch_count}</TableCell>
                          <TableCell className="text-xs">{r.line_count}</TableCell>
                          <TableCell className="text-xs">{r.estado_comercial ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.fecha_pedido ? formatDateTime(r.fecha_pedido) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'pt-tags' && (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/50">
          <header className="border-b border-indigo-200 px-4 py-2.5 text-[11px] uppercase tracking-wide text-indigo-950">
            Borrar unidades PT (selectivo)
          </header>
          <div className="space-y-3 p-4 text-sm text-indigo-950">
            <p>
              Igual que recepciones: elegí tarjas en la tabla y confirmá el borrado. Solo se pueden eliminar unidades{' '}
              <strong>sin despacho</strong>, <strong>sin líneas en facturas</strong> y <strong>sin participar en un
              merge</strong>. También podés borrar por CSV con la columna <code className="rounded bg-white px-1 text-xs">import_action=borrar</code>.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-indigo-300 bg-white"
                disabled={ptTagsPreviewQuery.isFetching}
                onClick={() => void ptTagsPreviewQuery.refetch()}
              >
                {ptTagsPreviewQuery.isFetching ? 'Cargando…' : 'Actualizar lista'}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-indigo-950 whitespace-nowrap" htmlFor="bulk-del-pt-last-n">
                  Primeras N borrables
                </label>
                <Input
                  id="bulk-del-pt-last-n"
                  className="h-8 w-20 border-indigo-200 bg-white"
                  value={ptTagDeleteLastN}
                  onChange={(e) => setPtTagDeleteLastN(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-indigo-300 bg-white"
                onClick={selectLastNDeletablePtTags}
              >
                Seleccionar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-indigo-300 bg-white"
                onClick={() => setPtTagDeleteSelected([])}
              >
                Limpiar selección
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-indigo-800 text-white hover:bg-indigo-900"
                disabled={ptTagDeleteSelected.length === 0}
                onClick={() => setPtTagDeleteDialogOpen(true)}
              >
                Borrar {ptTagDeleteSelected.length || '…'} seleccionada(s)
              </Button>
            </div>

            {ptTagsPreviewQuery.isError ? (
              <p className="text-sm text-red-700">No se pudo cargar la vista previa.</p>
            ) : ptTagsPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando unidades PT recientes…</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-indigo-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">Id</TableHead>
                      <TableHead className="text-xs">Tarja</TableHead>
                      <TableHead className="text-xs">Formato</TableHead>
                      <TableHead className="text-xs">Cajas</TableHead>
                      <TableHead className="text-xs">Desp.</TableHead>
                      <TableHead className="text-xs">Fact.</TableHead>
                      <TableHead className="text-xs">Merge</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ptTagsPreviewQuery.data ?? []).map((r) => {
                      const checked = ptTagDeleteSelected.includes(r.id);
                      return (
                        <TableRow key={r.id} className={cn(tableBodyRow, !r.can_delete && 'opacity-50')}>
                          <TableCell className="text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-indigo-800"
                              disabled={!r.can_delete}
                              checked={checked}
                              onChange={() => togglePtTagDeleteSelect(r.id)}
                              aria-label={`Seleccionar unidad PT ${r.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="text-xs font-mono">{r.tag_code}</TableCell>
                          <TableCell className="text-xs">{r.format_code}</TableCell>
                          <TableCell className="text-xs">{r.total_cajas}</TableCell>
                          <TableCell className="text-xs">{r.dispatch_count}</TableCell>
                          <TableCell className="text-xs">{r.invoice_line_count}</TableCell>
                          <TableCell className="text-xs">{r.merge_involved ? 'sí' : '—'}</TableCell>
                          <TableCell className="text-xs">{r.client_nombre ?? '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>
      )}

      <Dialog open={receptionDeleteDialogOpen} onOpenChange={setReceptionDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar recepciones seleccionadas</DialogTitle>
            <DialogDescription>
              Se eliminarán {receptionDeleteSelected.length} recepción(es) y sus líneas en la base de datos. No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setReceptionDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-rose-700 text-white hover:bg-rose-800"
              disabled={deleteReceptionsMutation.isPending || receptionDeleteSelected.length === 0}
              onClick={() => deleteReceptionsMutation.mutate(receptionDeleteSelected)}
            >
              {deleteReceptionsMutation.isPending ? 'Borrando…' : 'Confirmar borrado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={salesOrderDeleteDialogOpen} onOpenChange={setSalesOrderDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar pedidos seleccionados</DialogTitle>
            <DialogDescription>
              Se eliminarán {salesOrderDeleteSelected.length} pedido(s) y sus líneas en la base de datos. No se puede
              deshacer. Solo aplica a pedidos sin despacho.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSalesOrderDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-orange-800 text-white hover:bg-orange-900"
              disabled={deleteSalesOrdersMutation.isPending || salesOrderDeleteSelected.length === 0}
              onClick={() => deleteSalesOrdersMutation.mutate(salesOrderDeleteSelected)}
            >
              {deleteSalesOrdersMutation.isPending ? 'Borrando…' : 'Confirmar borrado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ptTagDeleteDialogOpen} onOpenChange={setPtTagDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar unidades PT seleccionadas</DialogTitle>
            <DialogDescription>
              Se eliminarán {ptTagDeleteSelected.length} unidad(es) PT en la base de datos (ítems de proceso, pallet
              técnico borrador, etc.). No se puede deshacer. No aplica a tarjas con despacho, factura o merge.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPtTagDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-indigo-800 text-white hover:bg-indigo-900"
              disabled={deletePtTagsMutation.isPending || ptTagDeleteSelected.length === 0}
              onClick={() => deletePtTagsMutation.mutate(ptTagDeleteSelected)}
            >
              {deletePtTagsMutation.isPending ? 'Borrando…' : 'Confirmar borrado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={processDeleteDialogOpen} onOpenChange={setProcessDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar procesos seleccionados</DialogTitle>
            <DialogDescription>
              Se eliminarán {processDeleteSelected.length} proceso(s), sus asignaciones a líneas de recepción y
              movimientos de MP vinculados a esos procesos. No se puede deshacer. Solo aplica a procesos en borrador sin
              vínculos a PT, existencias PT, factura ni repalet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setProcessDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-violet-800 text-white hover:bg-violet-900"
              disabled={deleteProcessesMutation.isPending || processDeleteSelected.length === 0}
              onClick={() => deleteProcessesMutation.mutate(processDeleteSelected)}
            >
              {deleteProcessesMutation.isPending ? 'Borrando…' : 'Confirmar borrado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center">
            {STEPS.map((s, idx) => {
              const stepNum = idx + 1;
              const done = stepNum < currentStep;
              const active = stepNum === currentStep;
              return (
                <div key={s} className="flex items-center flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-7 w-7 rounded-full border text-xs grid place-items-center',
                        done && 'bg-primary text-white border-primary',
                        active && 'bg-primary text-white border-primary ring-2 ring-primary ring-offset-2',
                        !done && !active && 'bg-muted text-muted-foreground border-border',
                      )}
                    >
                      {done ? '✓' : stepNum}
                    </div>
                    <span className={cn('text-xs', active ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={cn('h-px flex-1 mx-3', stepNum < currentStep ? 'bg-primary' : 'bg-border')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            1 · Descargar plantilla CSV
          </header>
          <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Plantilla con columnas reales del sistema + catálogos de códigos válidos al pie.</p>
              <p className="text-sm font-semibold">Completá con tus datos históricos y guardá como CSV UTF-8.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={templateMutation.isPending}
              onClick={() => templateMutation.mutate()}
            >
              {templateMutation.isPending ? 'Descargando...' : '⬇ Descargar plantilla'}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            2 · Subir archivo CSV
          </header>
          <div className="p-4">
            {!file ? (
              <div
                className="cursor-pointer rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center hover:border-primary"
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onPickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => document.getElementById(`bulk-csv-${tab}`)?.click()}
              >
                <input
                  id={`bulk-csv-${tab}`}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
                <FileUp size={32} className="mx-auto text-muted-foreground" />
                <p className="mt-2 text-sm">Arrastrá tu CSV aquí o hacé click para seleccionar</p>
                <p className="text-xs text-muted-foreground">Solo archivos .csv · UTF-8 · separador coma</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">{formatKb(file.size)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {parsed?.totalRows ?? 0} filas · {parsed?.mainRows ?? 0} registros principales · {parsed?.detailRows ?? 0} líneas de detalle
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onPickFile(null)}>
                    Cambiar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            3 · Preview
          </header>
          <div className="p-4 space-y-3">
            {parsed && parsed.headers.length > 0 ? (
              <>
                <div className={tableShell}>
                  <Table>
                    <TableHeader>
                      <TableRow className={tableHeaderRow}>
                        {parsed.headers.map((h) => (
                          <TableHead key={h} className="text-xs">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, idx) => {
                        const isDetail = (row[0] ?? '').trim() === '';
                        return (
                          <TableRow key={idx} className={cn(tableBodyRow, isDetail && 'bg-muted/40')}>
                            {parsed.headers.map((_, ci) => (
                              <TableCell
                                key={`${idx}-${ci}`}
                                className={cn('text-xs', ci === 0 && isDetail && 'pl-8', tableCellComfortable)}
                              >
                                {row[ci] ?? ''}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {parsed.totalRows} filas totales · {parsed.mainRows} principales · {parsed.detailRows} líneas
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resetFlow}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="bg-primary text-white hover:bg-primary/90"
                      disabled={importMutation.isPending}
                      onClick={() => importMutation.mutate()}
                    >
                      {importMutation.isPending ? 'Importando...' : 'Confirmar e importar →'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Subí un archivo para ver preview.</p>
            )}
          </div>
        </section>

        {summary && (
          <section className="rounded-lg border border-border bg-background">
            <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              4 · Resultado
            </header>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
                  <div className="text-xs uppercase">Insertadas</div>
                  <div className="text-xl font-semibold">{summary.inserted}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                  <div className="text-xs uppercase">Eliminadas (PT)</div>
                  <div className="text-xl font-semibold">{summary.deleted ?? 0}</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-700">
                  <div className="text-xs uppercase">Omitidas</div>
                  <div className="text-xl font-semibold">{summary.skipped}</div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <div className="text-xs uppercase">Con errores</div>
                  <div className="text-xl font-semibold">{summary.errors.length}</div>
                </div>
              </div>

              {summary.errors.length > 0 && (
                <div className="rounded-lg border border-red-200">
                  <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    <span>Detalle de errores</span>
                    <button type="button" onClick={() => setShowErrors((v) => !v)} className="text-xs">
                      {showErrors ? '▴ Ocultar' : '▾ Ver'}
                    </button>
                  </div>
                  {showErrors && (
                    <div className={tableShell}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fila</TableHead>
                            <TableHead>Campo</TableHead>
                            <TableHead>Mensaje</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.errors.map((er, i) => (
                            <TableRow key={i}>
                              <TableCell>{er.row}</TableCell>
                              <TableCell>{er.field ?? '-'}</TableCell>
                              <TableCell>{er.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={resetFlow}>
                  ↩ Nueva importación
                </Button>
                <p className="text-xs text-muted-foreground">
                  Log guardado · {username ?? 'unknown'} · {nowFmt}
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="border-t border-border pt-3" />
        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            Historial de importaciones
          </header>
          <div className="p-4">
            {logsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando historial...</p>
            ) : logsQuery.isError ? (
              <p className="text-sm text-red-600">No se pudo cargar el historial</p>
            ) : (
              <div className="space-y-2">
                {(logsQuery.data ?? []).map((log) => (
                  <div key={log.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{log.entity_key}</Badge>
                        <span className="text-muted-foreground">{formatDateTime(log.created_at)}</span>
                        <span className="text-muted-foreground">{log.username}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">{log.inserted} ok</span>
                        {log.skipped > 0 && <span className="text-amber-600">{log.skipped} omit</span>}
                        {log.errors_count > 0 && <span className="text-red-600">{log.errors_count} err</span>}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExpandedLogIds((prev) => ({
                              ...prev,
                              [log.id]: !prev[log.id],
                            }))
                          }
                        >
                          Ver detalle
                        </Button>
                      </div>
                    </div>
                    {expandedLogIds[log.id] && (
                      <div className="mt-2 rounded border border-border p-2">
                        {log.errors_sample?.length ? (
                          <div className="space-y-1">
                            {log.errors_sample.map((e, idx) => (
                              <p key={idx} className="text-xs text-muted-foreground">
                                Fila {e.row} · {e.field ?? '-'} · {e.message}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sin muestra de errores.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            Respaldos
          </header>
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Último respaldo descargado:{' '}
              <span className="font-medium text-foreground">
                {lastBackupTs ? formatDateTime(lastBackupTs) : 'Sin registros'}
              </span>
            </p>
            {shouldWarnBackup && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                ⚠ Respaldá antes de hacer cambios masivos
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
