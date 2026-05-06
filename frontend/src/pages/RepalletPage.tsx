import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Info, ListOrdered, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatLb } from '@/lib/number-format';
import {
  badgePill,
  btnToolbarOutline,
  btnToolbarPrimary,
  contentCard,
  emptyStatePanel,
  errorStatePanel,
  filterInputClass,
  filterPanel,
  filterSelectClass,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueMd,
  pageHeaderRow,
  pageInfoButton,
  pageSubtitle,
  pageTitle,
  sectionHint,
  sectionTitle,
  signalsPanel,
  signalsTitle,
  tableBodyRow,
  tableHeaderRow,
  tableShell,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import type { ExistenciaPtRow } from './ExistenciasPtPage';

type SourceRow = { key: string; palletId: number; boxes: string };

function newRow(): SourceRow {
  return { key: `${Date.now()}-${Math.random()}`, palletId: 0, boxes: '' };
}

type FinalPalletResponse = { id: number; corner_board_code?: string };

function palletDisplay(r: ExistenciaPtRow): string {
  return (
    r.codigo_unidad_pt_display?.trim() ||
    r.tag_code?.trim() ||
    r.corner_board_code ||
    `PF-${r.id}`
  );
}

/** Orden correlativo TAR-# / PF-# / id tarja. */
function tarjaSortKey(r: ExistenciaPtRow): number {
  const blob = `${r.tag_code ?? ''} ${r.codigo_unidad_pt_display ?? ''}`;
  const m = /TAR-(\d+)/i.exec(blob);
  if (m) return Number(m[1]);
  const m2 = /PF-(\d+)/i.exec(blob);
  if (m2) return Number(m2[1]) + 1_000_000;
  if (r.tarja_ids?.length) return Number(r.tarja_ids[0]);
  return Number(r.id) + 2_000_000;
}

function sortRepalletOrigins(list: ExistenciaPtRow[]): ExistenciaPtRow[] {
  return [...list].sort((a, b) => {
    const ka = tarjaSortKey(a);
    const kb = tarjaSortKey(b);
    if (ka !== kb) return ka - kb;
    const pa = isPartialPallet(a) ? 1 : 0;
    const pb = isPartialPallet(b) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return a.id - b.id;
  });
}

/** Pallet con menos cajas que el tope del formato (cuando el maestro lo define). */
function isPartialPallet(r: ExistenciaPtRow): boolean {
  const max = r.max_boxes_per_pallet;
  if (max == null || !Number.isFinite(max) || max <= 0) return false;
  return (Number(r.boxes) || 0) < max;
}

function PalletStatusBadge({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    definitivo: 'border-emerald-200/80 bg-emerald-50 text-emerald-900',
    borrador: 'border-slate-200 bg-slate-100 text-slate-700',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
    repaletizado: 'border-violet-200/80 bg-violet-50 text-violet-900',
    revertido: 'border-amber-200/80 bg-amber-50 text-amber-950',
    asignado_pl: 'border-sky-200/80 bg-sky-50 text-sky-900',
  };
  return (
    <span className={cn(badgePill, 'max-w-[140px]', map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800')} title={status}>
      {status}
    </span>
  );
}

function RepalletRoleBadge({ r }: { r: ExistenciaPtRow }) {
  if (r.repalletizaje === 'resultado') {
    return (
      <span
        className="inline-flex rounded-full border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900"
        title="Resultado de repaletizaje"
      >
        Resultado
      </span>
    );
  }
  if (r.repalletizaje === 'origen') {
    return (
      <span
        className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-950"
        title="Origen consumido en repallet"
      >
        Origen
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      Operativo
    </span>
  );
}

export function RepalletPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: rows, isPending } = useQuery({
    queryKey: ['existencias-pt', 'repallet'],
    queryFn: () => apiJson<ExistenciaPtRow[]>(`/api/final-pallets/existencias-pt?solo_deposito=1`),
  });

  const byId = useMemo(() => {
    const m = new Map<number, ExistenciaPtRow>();
    for (const r of rows ?? []) m.set(r.id, r);
    return m;
  }, [rows]);

  const [sources, setSources] = useState<SourceRow[]>(() => [newRow()]);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState(0);
  const [filterFormatId, setFilterFormatId] = useState(0);
  const [filterRepallet, setFilterRepallet] = useState<string>('');
  /** Solo pallets con menos cajas que el tope del formato (cuando el maestro define tope). */
  const [filterPartialOnly, setFilterPartialOnly] = useState<'all' | 'partial'>('all');

  const speciesOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows ?? []) {
      if (r.species_id != null && r.species_id > 0 && r.species_nombre?.trim()) {
        m.set(r.species_id, r.species_nombre.trim());
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [rows]);

  const formatOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows ?? []) {
      if (r.presentation_format_id != null && r.presentation_format_id > 0 && r.format_code?.trim()) {
        m.set(r.presentation_format_id, r.format_code.trim());
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [rows]);

  const filteredRowsBase = useMemo(() => {
    if (!rows?.length) return [];
    let list = rows;
    if (filterSpeciesId > 0) {
      list = list.filter((r) => Number(r.species_id ?? 0) === filterSpeciesId);
    }
    if (filterFormatId > 0) {
      list = list.filter((r) => Number(r.presentation_format_id ?? 0) === filterFormatId);
    }
    if (filterRepallet === 'no') {
      list = list.filter((r) => !r.repalletizaje || r.repalletizaje === 'no');
    } else if (filterRepallet === 'origen') {
      list = list.filter((r) => r.repalletizaje === 'origen');
    } else if (filterRepallet === 'resultado') {
      list = list.filter((r) => r.repalletizaje === 'resultado');
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const code = palletDisplay(r).toLowerCase();
        return (
          code.includes(q) ||
          String(r.id).includes(q) ||
          (r.corner_board_code?.toLowerCase().includes(q) ?? false) ||
          (r.client_nombre?.toLowerCase().includes(q) ?? false) ||
          (r.variedades_label?.toLowerCase().includes(q) ?? false) ||
          (r.format_code?.toLowerCase().includes(q) ?? false)
        );
      });
    }
    return list;
  }, [rows, filterSpeciesId, filterFormatId, filterRepallet, search]);

  const partialCountInBase = useMemo(
    () => filteredRowsBase.filter(isPartialPallet).length,
    [filteredRowsBase],
  );

  const filteredRows = useMemo(() => {
    if (filterPartialOnly !== 'partial') return filteredRowsBase;
    return filteredRowsBase.filter(isPartialPallet);
  }, [filteredRowsBase, filterPartialOnly]);

  /** Misma lista que la tabla, ordenada por TAR/PF para los desplegables de orígenes. */
  const sortedOriginsForSelect = useMemo(() => sortRepalletOrigins(filteredRows), [filteredRows]);

  const totalCajasAMover = useMemo(() => {
    let s = 0;
    for (const src of sources) {
      const n = Number.parseInt(src.boxes, 10);
      if (Number.isFinite(n) && n > 0) s += n;
    }
    return s;
  }, [sources]);

  const kpis = useMemo(() => {
    const list = filteredRows;
    let stockNormal = 0;
    let origen = 0;
    let resultado = 0;
    let borrador = 0;
    let definitivo = 0;
    let asignadoPl = 0;
    let totalCajas = 0;
    let totalLb = 0;
    let sinCajas = 0;
    let conDespacho = 0;
    for (const r of list) {
      const rp = r.repalletizaje;
      if (rp === 'origen') origen++;
      else if (rp === 'resultado') resultado++;
      else stockNormal++;
      const st = String(r.status || '').toLowerCase();
      if (st === 'borrador') borrador++;
      else if (st === 'definitivo') definitivo++;
      else if (st === 'asignado_pl') asignadoPl++;
      totalCajas += Number(r.boxes) || 0;
      totalLb += Number(r.pounds) || 0;
      if ((Number(r.boxes) || 0) <= 0) sinCajas++;
      if (r.dispatch_id != null && r.dispatch_id > 0) conDespacho++;
    }
    const repaletMarcados = origen + resultado;
    return {
      total: list.length,
      stockNormal,
      origen,
      resultado,
      repaletMarcados,
      borrador,
      definitivo,
      asignadoPl,
      totalCajas,
      totalLb,
      sinCajas,
      conDespacho,
    };
  }, [filteredRows]);

  const alertLines = useMemo(() => {
    const lines: { key: string; tone: 'warn' | 'info'; text: string }[] = [];
    if (kpis.sinCajas > 0) {
      lines.push({
        key: 'sin-cajas',
        tone: 'warn',
        text: `${formatCount(kpis.sinCajas)} pallet(s) con 0 cajas en la vista — revisá consistencia antes de mover stock.`,
      });
    }
    if (kpis.conDespacho > 0) {
      lines.push({
        key: 'despacho',
        tone: 'info',
        text: `${formatCount(kpis.conDespacho)} registro(s) muestran vínculo con despacho; el listado sigue el filtro “solo depósito” del servidor.`,
      });
    }
    if (kpis.origen > 0 && kpis.resultado > 0) {
      lines.push({
        key: 'traza',
        tone: 'info',
        text: `En vista: ${formatCount(kpis.origen)} origen(es) y ${formatCount(kpis.resultado)} resultado(s) de repaletizaje para trazabilidad.`,
      });
    }
    if (partialCountInBase > 0) {
      lines.push({
        key: 'parciales',
        tone: 'info',
        text: `${formatCount(partialCountInBase)} pallet(s) con menos cajas que el tope del formato (en el universo antes de “solo incompletos”). Usá el filtro Completitud para acotar tabla y selectores de origen.`,
      });
    }
    return lines;
  }, [kpis.sinCajas, kpis.conDespacho, kpis.origen, kpis.resultado, partialCountInBase]);

  const mut = useMutation({
    mutationFn: async () => {
      const parsed: { final_pallet_id: number; boxes: number }[] = [];
      for (const s of sources) {
        const pid = s.palletId;
        const b = Number.parseInt(s.boxes, 10);
        if (pid <= 0 || !Number.isFinite(b) || b <= 0) continue;
        parsed.push({ final_pallet_id: pid, boxes: b });
      }
      if (!parsed.length) {
        throw new Error('Indicá al menos un origen con pallet y cantidad de cajas válida.');
      }
      return apiJson<FinalPalletResponse>(`/api/final-pallets/repallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: parsed, notes: notes.trim() || undefined }),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['existencias-pt'] });
      navigate(`/existencias-pt/detalle/${data.id}`);
    },
  });

  const helpBody =
    'Tomá cajas de uno o más pallets en depósito (definitivo, sin despacho) y formá un pallet nuevo. La restricción principal es que compartan formato (y el resto de cabecera: cliente, especie, calidad operativa, packing, mercado, marca). Podés mezclar varias variedades en el destino; cada combinación proceso/variedad/ref queda en su línea. Registra el evento para trazabilidad.';

  const nuevoRepalletInfo =
    'Orígenes (FIFO por líneas). Los filtros (incl. Completitud: solo incompletos vs tope) y la tabla usan el mismo universo (solo depósito). Las cajas a mover no pueden superar lo disponible por pallet.';

  const scrollToForm = () => {
    document.getElementById('repallet-origenes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-1.5">
          <h2 className={pageTitle}>Existencias PT · Repaletizaje</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>
              Reorganizá cajas entre pallets PT en depósito y generá un pallet resultado con trazabilidad.
            </p>
            <button type="button" className={pageInfoButton} title={helpBody} aria-label="Ayuda repaletizaje">
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            <Link
              to="/existencias-pt/inventario"
              className="text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              Volver a Existencias PT (inventario cámara)
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className={btnToolbarOutline} onClick={scrollToForm}>
            <Plus className="mr-1.5 h-4 w-4" />
            Configurar orígenes
          </Button>
          <Button
            type="button"
            size="sm"
            className={btnToolbarPrimary}
            disabled={totalCajasAMover === 0 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Procesando…' : 'Crear pallet resultado'}
          </Button>
        </div>
      </div>

      <Card id="repallet-origenes" className={contentCard}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className={cn(sectionTitle, 'mb-0')}>Nuevo repaletizaje</CardTitle>
            <button type="button" className={pageInfoButton} title={nuevoRepalletInfo} aria-label="Instrucciones nuevo repaletizaje">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)] lg:items-start">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2.5">
                <div className="grid min-w-[min(100%,14rem)] flex-1 gap-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Formato (orígenes)</Label>
                  <select
                    className={filterSelectClass}
                    value={filterFormatId}
                    onChange={(e) => setFilterFormatId(Number(e.target.value))}
                  >
                    <option value={0}>Todos los formatos</option>
                    {formatOptions.map(([id, code]) => (
                      <option key={id} value={id}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="max-w-md flex-1 text-[11px] leading-snug text-slate-500">
                  Repaletizá dentro del mismo formato: al elegir uno, la lista y la tabla quedan alineadas. Los pallets con
                  menos cajas que el tope del formato aparecen como parciales abajo.
                </p>
              </div>
          {sources.map((row, idx) => {
            const meta = row.palletId > 0 ? byId.get(row.palletId) : undefined;
            const max = meta?.boxes ?? 0;
            const over = meta && row.boxes ? Number.parseInt(row.boxes, 10) > max : false;
            const partial = meta ? isPartialPallet(meta) : false;
            return (
              <div
                key={row.key}
                className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/30 p-4 sm:flex-row sm:items-end"
              >
                <div className="grid min-w-0 flex-1 gap-2">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Pallet origen #{idx + 1}</Label>
                  <select
                    className={filterSelectClass}
                    value={row.palletId || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSources((prev) => prev.map((r) => (r.key === row.key ? { ...r, palletId: v } : r)));
                    }}
                  >
                    <option value="">Seleccionar…</option>
                    {sortedOriginsForSelect.map((r) => {
                      const par = isPartialPallet(r);
                      const label = `${par ? '◐ ' : ''}${palletDisplay(r)} · ${r.format_code ?? '—'} · ${r.boxes} cajas`;
                      return (
                        <option key={r.id} value={r.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  {meta ? (
                    <p
                      className={cn(
                        'text-[11px]',
                        partial ? 'font-medium text-amber-900' : 'text-slate-500',
                      )}
                    >
                      {partial ? (
                        <span title="Menos cajas que el tope del formato en maestro">Pallet parcial · </span>
                      ) : null}
                      Disponible: {meta.boxes} cajas · {meta.variedades_label}
                    </p>
                  ) : null}
                </div>
                <div className="grid w-full gap-2 sm:w-40">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Cajas a mover</Label>
                  <Input
                    className={filterInputClass}
                    inputMode="numeric"
                    placeholder="0"
                    value={row.boxes}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSources((prev) => prev.map((r) => (r.key === row.key ? { ...r, boxes: v } : r)));
                    }}
                  />
                  {meta && row.boxes ? (
                    <p className="text-[11px] text-slate-500">
                      Máx. sugerido: {max}
                      {over ? <span className="text-destructive"> · supera disponible</span> : null}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 rounded-xl border-slate-200"
                  disabled={sources.length <= 1}
                  onClick={() => setSources((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  Quitar
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 rounded-xl"
            onClick={() => setSources((p) => [...p, newRow()])}
          >
            Agregar origen
          </Button>

          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas</Label>
            <Input
              className={filterInputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referencia interna del movimiento"
            />
          </div>

          {mut.isError ? (
            <div role="alert" className={errorStatePanel}>
              {(mut.error as Error)?.message ?? 'Error'}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" className={btnToolbarPrimary} disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Procesando…' : 'Crear pallet resultado'}
            </Button>
          </div>
            </div>

            <aside
              className="sticky top-4 shrink-0 rounded-xl border border-border bg-background p-4 shadow-sm lg:min-h-0"
              title="Suma de todas las cajas que estás asignando a mover en los orígenes"
            >
              <div className="flex items-center gap-2">
                <Boxes
                  className={cn('h-4 w-4 shrink-0', totalCajasAMover > 0 ? 'text-[#1D9E75]' : 'text-muted-foreground')}
                  aria-hidden
                />
                <p className={kpiLabel}>Total cajas a mover</p>
              </div>
              <p
                className={cn(
                  'mt-2 text-3xl tabular-nums',
                  totalCajasAMover === 0 ? 'text-muted-foreground' : 'font-bold text-[#1D9E75]',
                )}
              >
                {formatCount(totalCajasAMover)}
              </p>
              <p className={cn(kpiFootnote, 'mt-1')}>Según filas de orígenes arriba</p>
            </aside>
          </div>
        </CardContent>
      </Card>

      <div className={filterPanel}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>Filtros</span>
          <button
            type="button"
            className={pageInfoButton}
            title="Filtran el inventario mostrado en la tabla. Los orígenes del formulario usan el mismo universo (solo depósito)."
            aria-label="Ayuda filtros"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
          <div className="grid gap-2 lg:col-span-3">
            <Label className="text-xs text-slate-500">Especie</Label>
            <select
              className={filterSelectClass}
              value={filterSpeciesId}
              onChange={(e) => setFilterSpeciesId(Number(e.target.value))}
            >
              <option value={0}>Todas</option>
              {speciesOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Formato</Label>
            <select
              className={filterSelectClass}
              value={filterFormatId}
              onChange={(e) => setFilterFormatId(Number(e.target.value))}
            >
              <option value={0}>Todos</option>
              {formatOptions.map(([id, code]) => (
                <option key={id} value={id}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-3">
            <Label className="text-xs text-slate-500">Rol repaletizaje</Label>
            <select
              className={filterSelectClass}
              value={filterRepallet}
              onChange={(e) => setFilterRepallet(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="no">Stock operativo</option>
              <option value="origen">Origen</option>
              <option value="resultado">Resultado</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Completitud</Label>
            <select
              className={filterSelectClass}
              value={filterPartialOnly}
              onChange={(e) => setFilterPartialOnly(e.target.value as 'all' | 'partial')}
              title="Solo pallets con cajas por debajo del tope del formato (si el maestro define tope)"
            >
              <option value="all">Todos</option>
              <option value="partial">Solo incompletos (vs tope)</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">Buscar</Label>
            <Input
              className={filterInputClass}
              placeholder="Unidad PT, cliente, variedad, código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="repallet-tabla">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="repallet-tabla" className={sectionTitle}>
              Existencia en cámara (vista rápida)
            </h2>
            <p className={sectionHint}>
              {filteredRows.length} pallet(s) en tabla
              {filterPartialOnly === 'partial' && filteredRowsBase.length > 0
                ? ` (de ${filteredRowsBase.length} con filtros actuales)`
                : null}
              {filterPartialOnly === 'all' && partialCountInBase > 0
                ? ` · ${partialCountInBase} incompletos vs tope`
                : null}
              {' · '}
              mismo universo que los orígenes
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className={btnToolbarOutline}>
            <Link to="/existencias-pt/inventario" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Inventario cámara
            </Link>
          </Button>
        </div>

        {!rows?.length ? (
          <p className={emptyStatePanel}>No hay pallets en depósito para repaletizar.</p>
        ) : !filteredRows.length ? (
          <p className={emptyStatePanel}>
            {filterPartialOnly === 'partial' && filteredRowsBase.length > 0
              ? 'No hay pallets incompletos (vs tope de formato) con los filtros actuales.'
              : 'Sin coincidencias con el filtro.'}
          </p>
        ) : (
          <div className={cn(tableShell, 'max-h-[min(52vh,520px)] overflow-auto')}>
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[160px]">Código · estado</TableHead>
                  <TableHead className="min-w-[72px]">Formato</TableHead>
                  <TableHead className="min-w-[108px] text-right tabular-nums">Cajas / tope</TableHead>
                  <TableHead className="min-w-[120px]">Cliente</TableHead>
                  <TableHead className="min-w-[100px]">Marca</TableHead>
                  <TableHead className="min-w-[100px]">BOL</TableHead>
                  <TableHead className="w-[72px] text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={cn(tableBodyRow, isPartialPallet(r) ? 'bg-amber-50/35' : '')}
                  >
                    <TableCell className="max-w-[220px] py-2.5 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[12px] font-medium text-slate-900">{palletDisplay(r)}</span>
                        <PalletStatusBadge status={r.status} />
                        <RepalletRoleBadge r={r} />
                      </div>
                    </TableCell>
                    <TableCell className="align-middle font-mono text-xs text-slate-800">
                      {r.format_code?.trim() || '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'align-middle text-right text-sm tabular-nums',
                        isPartialPallet(r) ? 'text-amber-950' : 'text-slate-900',
                      )}
                      title={
                        r.max_boxes_per_pallet != null && r.max_boxes_per_pallet > 0
                          ? 'Cajas actuales / tope del formato en maestro'
                          : 'Sin tope definido para el formato'
                      }
                    >
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {isPartialPallet(r) ? (
                          <span
                            className="inline-flex h-5 min-w-[2.75rem] items-center justify-center rounded-full border border-amber-200/90 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-950"
                            title="Menos cajas que el tope del formato (pallet parcial)"
                          >
                            Parcial
                          </span>
                        ) : null}
                        <span className="font-mono text-[12px]">
                          {formatCount(r.boxes)} /{' '}
                          {r.max_boxes_per_pallet != null &&
                          Number.isFinite(r.max_boxes_per_pallet) &&
                          r.max_boxes_per_pallet > 0
                            ? formatCount(r.max_boxes_per_pallet)
                            : '—'}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[140px] align-middle">
                      <p className="truncate text-xs text-slate-800" title={r.client_nombre ?? ''}>
                        {r.client_nombre?.trim() || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[120px] align-middle">
                      <p className="truncate text-xs text-slate-600" title={r.brand_nombre ?? ''}>
                        {r.brand_nombre?.trim() || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[120px] align-middle font-mono text-[11px] text-slate-700">
                      {r.bol?.trim() || '—'}
                    </TableCell>
                    <TableCell className="align-middle text-right">
                      <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg text-slate-700">
                        <Link to={`/existencias-pt/detalle/${r.id}`}>Ver</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {alertLines.length > 0 ? (
        <div className={signalsPanel}>
          <p className={signalsTitle}>Señales operativas</p>
          <ul className="space-y-2">
            {alertLines.map((a) => (
              <li
                key={a.key}
                className={cn(
                  'rounded-xl border px-3 py-2 text-[13px] leading-snug',
                  a.tone === 'warn'
                    ? 'border-amber-200/90 bg-white text-amber-950'
                    : 'border-slate-200/90 bg-white text-slate-700',
                )}
              >
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-labelledby="repallet-kpis-resumen" className="space-y-3">
        <h2 id="repallet-kpis-resumen" className="sr-only">
          Resumen
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Pallets en vista</p>
            <p className={kpiValueMd}>{formatCount(kpis.total)}</p>
            <p className={kpiFootnote}>
              {filterPartialOnly === 'partial'
                ? 'Solo incompletos vs tope'
                : partialCountInBase > 0
                  ? `Filtros actuales · ${formatCount(partialCountInBase)} incompletos`
                  : 'Filtros actuales'}
            </p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={kpiValueMd}>{formatCount(kpis.totalCajas)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Peso (lb)</p>
            <p className={kpiValueMd}>{formatLb(kpis.totalLb, 2)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div
            className={cn(
              kpiCardSm,
              kpis.sinCajas > 0 ? 'border-amber-200/90 bg-amber-50/35' : '',
            )}
          >
            <p className={kpiLabel}>Repallet / huecos</p>
            <p className={cn(kpiValueMd, kpis.sinCajas > 0 ? 'text-amber-950' : '')}>
              {formatCount(kpis.origen)} orig. · {formatCount(kpis.resultado)} res. ·{' '}
              {formatCount(kpis.sinCajas)} sin cajas
            </p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Trazas y anomalías</p>
          </div>
        </div>
      </section>
    </div>
  );
}
