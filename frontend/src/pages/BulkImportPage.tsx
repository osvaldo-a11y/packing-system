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
  skipped: number;
  errors: { row: number; field?: string; message: string }[];
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
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
                  <div className="text-xs uppercase">Insertadas</div>
                  <div className="text-xl font-semibold">{summary.inserted}</div>
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
