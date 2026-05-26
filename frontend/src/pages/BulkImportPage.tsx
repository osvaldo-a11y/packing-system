import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  const TABS = [
    { key: 'receptions' as const, label: t('bulkImport.tabs.receptions') },
    { key: 'processes' as const, label: t('bulkImport.tabs.processes') },
    { key: 'pt-tags' as const, label: t('bulkImport.tabs.ptTags') },
    { key: 'final-pallets' as const, label: t('bulkImport.tabs.finalPallets') },
    { key: 'sales-orders' as const, label: t('bulkImport.tabs.salesOrders') },
    { key: 'dispatches' as const, label: t('bulkImport.tabs.dispatches') },
  ];
  const STEPS = [
    t('bulkImport.steps.template'),
    t('bulkImport.steps.file'),
    t('bulkImport.steps.preview'),
    t('bulkImport.steps.result'),
  ];
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
      toast.error(t('bulkImport.toast.csvOnly'));
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      const csvText = typeof reader.result === 'string' ? reader.result : '';
      const parsedCsv = parseCsvForUi(csvText);
      setParsed(parsedCsv);
      setCurrentStep(3);
    };
    reader.readAsText(f, 'UTF-8');
  }, [t]);

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
        t('bulkImport.toast.deletedSalesOrders', {
          orders: data.deleted_sales_orders,
          lines: data.deleted_lines,
          pallets: data.cleared_planned_pallets,
          mods: data.deleted_modifications,
        }),
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errDelete')),
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
      toast.success(t('bulkImport.toast.deletedPtTags', { count: data.deleted_pt_tags }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errDelete')),
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
        t('bulkImport.toast.deletedProcesses', {
          processes: data.deleted_processes,
          movements: data.deleted_raw_movements,
        }),
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errDelete')),
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
        t('bulkImport.toast.deletedReceptions', {
          receptions: data.deleted_receptions,
          lines: data.deleted_lines,
          movements: data.deleted_movements,
        }),
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errDelete')),
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
      toast.success(t('bulkImport.toast.receptionsDraftLimit', { count: ids.length, n }));
    } else {
      toast.success(t('bulkImport.toast.receptionsDraftSelected', { count: ids.length }));
    }
  }, [receptionDeleteLastN, receptionsPreviewQuery.data, t]);

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
      toast.success(t('bulkImport.toast.salesOrdersLimit', { count: ids.length, n }));
    } else {
      toast.success(t('bulkImport.toast.salesOrdersSelected', { count: ids.length }));
    }
  }, [salesOrderDeleteLastN, salesOrdersPreviewQuery.data, t]);

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
      toast.success(t('bulkImport.toast.ptTagsLimit', { count: ids.length, n }));
    } else {
      toast.success(t('bulkImport.toast.ptTagsSelected', { count: ids.length }));
    }
  }, [ptTagDeleteLastN, ptTagsPreviewQuery.data, t]);

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
      toast.success(t('bulkImport.toast.processesLimit', { count: ids.length, n }));
    } else {
      toast.success(t('bulkImport.toast.processesSelected', { count: ids.length }));
    }
  }, [processDeleteLastN, processesPreviewQuery.data, t]);

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
      toast.success(t('bulkImport.toast.templateOk'));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errDownload')),
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
      toast.success(t('bulkImport.toast.backupOk', { filename }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errBackup')),
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
    onError: (e) => toast.error(e instanceof Error ? e.message : t('bulkImport.toast.errNetwork')),
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
            <h1 className={pageTitle}>{t('bulkImport.pageTitle')}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('bulkImport.adminBadge')}</span>
          </div>
          <p className={pageSubtitle}>
            {t('bulkImport.pageSubtitle')}
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
          {backupMutation.isPending ? t('bulkImport.backupGenerating') : t('bulkImport.backupButton')}
        </Button>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{t('bulkImport.warningTitle')}</p>
            <p className="mt-1 whitespace-pre-line">{t('bulkImport.warningSteps')}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-border pb-2">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => {
              setTab(tabItem.key);
              resetFlow();
            }}
            className={cn(
              'border-b-2 px-1 pb-2 text-sm transition-colors',
              tab === tabItem.key
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'receptions' && (
        <section className="rounded-lg border border-rose-200 bg-rose-50/50">
          <header className="border-b border-rose-200 px-4 py-2.5 text-[11px] uppercase tracking-wide text-rose-900">
            {t('bulkImport.sections.deleteReceptions')}
          </header>
          <div className="space-y-3 p-4 text-sm text-rose-950">
            <p>{t('bulkImport.labels.receptionDesc')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-300 bg-white"
                disabled={receptionsPreviewQuery.isFetching}
                onClick={() => void receptionsPreviewQuery.refetch()}
              >
                {receptionsPreviewQuery.isFetching ? t('bulkImport.actions.loading') : t('bulkImport.actions.updateList')}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-rose-900 whitespace-nowrap" htmlFor="bulk-del-last-n">
                  {t('bulkImport.labels.lastNDraft')}
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
                {t('bulkImport.actions.select')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-300 bg-white"
                onClick={() => setReceptionDeleteSelected([])}
              >
                {t('bulkImport.actions.clearSelection')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-rose-700 text-white hover:bg-rose-800"
                disabled={receptionDeleteSelected.length === 0}
                onClick={() => setReceptionDeleteDialogOpen(true)}
              >
                {t('bulkImport.actions.deleteSelected', { count: receptionDeleteSelected.length || '…' })}
              </Button>
            </div>

            {receptionsPreviewQuery.isError ? (
              <p className="text-sm text-red-700">{t('bulkImport.labels.previewError')}</p>
            ) : receptionsPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t('bulkImport.actions.loading')}</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-rose-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">{t('bulkImport.cols.id')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.reference')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.state')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.lines')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.created')}</TableHead>
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
            {t('bulkImport.sections.deleteProcesses')}
          </header>
          <div className="space-y-3 p-4 text-sm text-violet-950">
            <p>{t('bulkImport.labels.processDesc')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-300 bg-white"
                disabled={processesPreviewQuery.isFetching}
                onClick={() => void processesPreviewQuery.refetch()}
              >
                {processesPreviewQuery.isFetching ? t('bulkImport.actions.loading') : t('bulkImport.actions.updateList')}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-violet-950 whitespace-nowrap" htmlFor="bulk-del-proc-last-n">
                  {t('bulkImport.labels.firstNDeletable')}
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
                {t('bulkImport.actions.select')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-300 bg-white"
                onClick={() => setProcessDeleteSelected([])}
              >
                {t('bulkImport.actions.clearSelection')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-violet-800 text-white hover:bg-violet-900"
                disabled={processDeleteSelected.length === 0}
                onClick={() => setProcessDeleteDialogOpen(true)}
              >
                {t('bulkImport.actions.deleteSelectedM', { count: processDeleteSelected.length || '…' })}
              </Button>
            </div>

            {processesPreviewQuery.isError ? (
              <p className="text-sm text-red-700">{t('bulkImport.labels.previewError')}</p>
            ) : processesPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t('bulkImport.actions.loading')}</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-violet-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">{t('bulkImport.cols.id')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.state')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.recepcion')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.lbProc')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.pt')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.fpl')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.invoice')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.repallet')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.date')}</TableHead>
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
            {t('bulkImport.sections.deleteSalesOrders')}
          </header>
          <div className="space-y-3 p-4 text-sm text-orange-950">
            <p>{t('bulkImport.labels.salesOrderDesc')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-orange-300 bg-white"
                disabled={salesOrdersPreviewQuery.isFetching}
                onClick={() => void salesOrdersPreviewQuery.refetch()}
              >
                {salesOrdersPreviewQuery.isFetching ? t('bulkImport.actions.loading') : t('bulkImport.actions.updateList')}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-orange-950 whitespace-nowrap" htmlFor="bulk-del-so-last-n">
                  {t('bulkImport.labels.lastNNoDispatch')}
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
                {t('bulkImport.actions.select')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-orange-300 bg-white"
                onClick={() => setSalesOrderDeleteSelected([])}
              >
                {t('bulkImport.actions.clearSelection')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-orange-800 text-white hover:bg-orange-900"
                disabled={salesOrderDeleteSelected.length === 0}
                onClick={() => setSalesOrderDeleteDialogOpen(true)}
              >
                {t('bulkImport.actions.deleteSelectedM', { count: salesOrderDeleteSelected.length || '…' })}
              </Button>
            </div>

            {salesOrdersPreviewQuery.isError ? (
              <p className="text-sm text-red-700">{t('bulkImport.labels.previewError')}</p>
            ) : salesOrdersPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t('bulkImport.actions.loading')}</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-orange-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">{t('bulkImport.cols.id')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.order')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.dispatches')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.lines')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.commercialState')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.orderDate')}</TableHead>
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
            {t('bulkImport.sections.deletePtTags')}
          </header>
          <div className="space-y-3 p-4 text-sm text-indigo-950">
            <p>{t('bulkImport.labels.ptTagDesc')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-indigo-300 bg-white"
                disabled={ptTagsPreviewQuery.isFetching}
                onClick={() => void ptTagsPreviewQuery.refetch()}
              >
                {ptTagsPreviewQuery.isFetching ? t('bulkImport.actions.loading') : t('bulkImport.actions.updateList')}
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-indigo-950 whitespace-nowrap" htmlFor="bulk-del-pt-last-n">
                  {t('bulkImport.labels.firstNDeletablePt')}
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
                {t('bulkImport.actions.select')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-indigo-300 bg-white"
                onClick={() => setPtTagDeleteSelected([])}
              >
                {t('bulkImport.actions.clearSelection')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-indigo-800 text-white hover:bg-indigo-900"
                disabled={ptTagDeleteSelected.length === 0}
                onClick={() => setPtTagDeleteDialogOpen(true)}
              >
                {t('bulkImport.actions.deleteSelected', { count: ptTagDeleteSelected.length || '…' })}
              </Button>
            </div>

            {ptTagsPreviewQuery.isError ? (
              <p className="text-sm text-red-700">{t('bulkImport.labels.previewError')}</p>
            ) : ptTagsPreviewQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t('bulkImport.actions.loading')}</p>
            ) : (
              <div className={cn(tableShell, 'max-h-72 overflow-auto rounded-md border border-indigo-200 bg-white')}>
                <Table>
                  <TableHeader>
                    <TableRow className={tableHeaderRow}>
                      <TableHead className="w-10 text-xs" />
                      <TableHead className="text-xs">{t('bulkImport.cols.id')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.tag')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.format')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.boxes')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.disp')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.invoice')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.merge')}</TableHead>
                      <TableHead className="text-xs">{t('bulkImport.cols.client')}</TableHead>
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
            <DialogTitle>{t('bulkImport.dialogs.deleteReceptionsTitle')}</DialogTitle>
            <DialogDescription>
              {t('bulkImport.dialogs.deleteReceptionsDesc', { count: receptionDeleteSelected.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setReceptionDeleteDialogOpen(false)}>
              {t('bulkImport.actions.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-rose-700 text-white hover:bg-rose-800"
              disabled={deleteReceptionsMutation.isPending || receptionDeleteSelected.length === 0}
              onClick={() => deleteReceptionsMutation.mutate(receptionDeleteSelected)}
            >
              {deleteReceptionsMutation.isPending ? t('bulkImport.actions.deleting') : t('bulkImport.actions.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={salesOrderDeleteDialogOpen} onOpenChange={setSalesOrderDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bulkImport.dialogs.deleteSalesOrdersTitle')}</DialogTitle>
            <DialogDescription>
              {t('bulkImport.dialogs.deleteSalesOrdersDesc', { count: salesOrderDeleteSelected.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSalesOrderDeleteDialogOpen(false)}>
              {t('bulkImport.actions.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-orange-800 text-white hover:bg-orange-900"
              disabled={deleteSalesOrdersMutation.isPending || salesOrderDeleteSelected.length === 0}
              onClick={() => deleteSalesOrdersMutation.mutate(salesOrderDeleteSelected)}
            >
              {deleteSalesOrdersMutation.isPending ? t('bulkImport.actions.deleting') : t('bulkImport.actions.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ptTagDeleteDialogOpen} onOpenChange={setPtTagDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bulkImport.dialogs.deletePtTagsTitle')}</DialogTitle>
            <DialogDescription>
              {t('bulkImport.dialogs.deletePtTagsDesc', { count: ptTagDeleteSelected.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPtTagDeleteDialogOpen(false)}>
              {t('bulkImport.actions.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-indigo-800 text-white hover:bg-indigo-900"
              disabled={deletePtTagsMutation.isPending || ptTagDeleteSelected.length === 0}
              onClick={() => deletePtTagsMutation.mutate(ptTagDeleteSelected)}
            >
              {deletePtTagsMutation.isPending ? t('bulkImport.actions.deleting') : t('bulkImport.actions.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={processDeleteDialogOpen} onOpenChange={setProcessDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bulkImport.dialogs.deleteProcessesTitle')}</DialogTitle>
            <DialogDescription>
              {t('bulkImport.dialogs.deleteProcessesDesc', { count: processDeleteSelected.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setProcessDeleteDialogOpen(false)}>
              {t('bulkImport.actions.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-violet-800 text-white hover:bg-violet-900"
              disabled={deleteProcessesMutation.isPending || processDeleteSelected.length === 0}
              onClick={() => deleteProcessesMutation.mutate(processDeleteSelected)}
            >
              {deleteProcessesMutation.isPending ? t('bulkImport.actions.deleting') : t('bulkImport.actions.confirmDelete')}
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
            {t('bulkImport.sections.step1')}
          </header>
          <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('bulkImport.labels.templateHint')}</p>
              <p className="text-sm font-semibold">{t('bulkImport.labels.templateFill')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={templateMutation.isPending}
              onClick={() => templateMutation.mutate()}
            >
              {templateMutation.isPending ? t('bulkImport.actions.downloadingTemplate') : t('bulkImport.actions.downloadTemplate')}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('bulkImport.sections.step2')}
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
                <p className="mt-2 text-sm">{t('bulkImport.labels.dragDrop')}</p>
                <p className="text-xs text-muted-foreground">{t('bulkImport.labels.csvOnly')}</p>
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
                    {t('bulkImport.actions.change')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('bulkImport.sections.step3')}
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
                      {t('bulkImport.actions.cancel')}
                    </Button>
                    <Button
                      type="button"
                      className="bg-primary text-white hover:bg-primary/90"
                      disabled={importMutation.isPending}
                      onClick={() => importMutation.mutate()}
                    >
                      {importMutation.isPending ? t('bulkImport.actions.importing') : t('bulkImport.actions.confirmImport')}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('bulkImport.labels.uploadPreview')}</p>
            )}
          </div>
        </section>

        {summary && (
          <section className="rounded-lg border border-border bg-background">
            <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('bulkImport.sections.step4')}
            </header>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
                  <div className="text-xs uppercase">{t('bulkImport.result.inserted')}</div>
                  <div className="text-xl font-semibold">{summary.inserted}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                  <div className="text-xs uppercase">{t('bulkImport.result.deleted')}</div>
                  <div className="text-xl font-semibold">{summary.deleted ?? 0}</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-700">
                  <div className="text-xs uppercase">{t('bulkImport.result.skipped')}</div>
                  <div className="text-xl font-semibold">{summary.skipped}</div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <div className="text-xs uppercase">{t('bulkImport.result.errors')}</div>
                  <div className="text-xl font-semibold">{summary.errors.length}</div>
                </div>
              </div>

              {summary.errors.length > 0 && (
                <div className="rounded-lg border border-red-200">
                  <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    <span>{t('bulkImport.labels.errorsTitle')}</span>
                    <button type="button" onClick={() => setShowErrors((v) => !v)} className="text-xs">
                      {showErrors ? t('bulkImport.actions.hideErrors') : t('bulkImport.actions.showErrors')}
                    </button>
                  </div>
                  {showErrors && (
                    <div className={tableShell}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('bulkImport.labels.rowLabel')}</TableHead>
                            <TableHead>{t('bulkImport.labels.fieldLabel')}</TableHead>
                            <TableHead>{t('bulkImport.labels.messageLabel')}</TableHead>
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
                  {t('bulkImport.actions.newImport')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('bulkImport.labels.logSaved', { user: username ?? 'unknown', date: nowFmt })}
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="border-t border-border pt-3" />
        <section className="rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('bulkImport.sections.history')}
          </header>
          <div className="p-4">
            {logsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('bulkImport.labels.historyLoading')}</p>
            ) : logsQuery.isError ? (
              <p className="text-sm text-red-600">{t('bulkImport.labels.historyError')}</p>
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
                          {t('bulkImport.actions.viewDetail')}
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
                          <p className="text-xs text-muted-foreground">{t('bulkImport.labels.noErrorSample')}</p>
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
            {t('bulkImport.sections.backups')}
          </header>
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t('bulkImport.labels.lastBackup')}{' '}
              <span className="font-medium text-foreground">
                {lastBackupTs ? formatDateTime(lastBackupTs) : t('bulkImport.labels.noBackup')}
              </span>
            </p>
            {shouldWarnBackup && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {t('bulkImport.labels.warnBackup')}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
