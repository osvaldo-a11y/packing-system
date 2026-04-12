import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, ListOrdered, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  kpiCard,
  kpiCardSm,
  kpiFootnote,
  kpiLabel,
  kpiValueLg,
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

function OrigenDestinoCells({ r }: { r: ExistenciaPtRow }) {
  const isOrigen = r.repalletizaje === 'origen';
  const isDestino = r.repalletizaje === 'resultado';
  return (
    <>
      <TableCell className="align-top text-xs text-slate-600">
        {isOrigen ? (
          <span className="font-mono text-[11px] text-slate-800">{palletDisplay(r)}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="align-top text-xs text-slate-600">
        {isDestino ? (
          <span className="font-mono text-[11px] text-slate-800">{palletDisplay(r)}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TableCell>
    </>
  );
}

function DiferenciaCell({ r }: { r: ExistenciaPtRow }) {
  if (r.repalletizaje === 'origen') {
    return (
      <span className="text-[11px] text-amber-800" title="Pallet origen en evento de repaletizaje">
        Origen consumido
      </span>
    );
  }
  if (r.repalletizaje === 'resultado') {
    return (
      <span className="text-[11px] text-violet-900" title="Pallet nuevo generado por repaletizaje">
        Pallet nuevo
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
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

  const filteredRows = useMemo(() => {
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
    return lines;
  }, [kpis.sinCajas, kpis.conDespacho, kpis.origen, kpis.resultado]);

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
          <h2 className={pageTitle}>Repaletizaje</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>
              Reorganizá cajas entre pallets en depósito y generá un pallet resultado con trazabilidad.
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
              Volver a inventario cámara
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
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Procesando…' : 'Crear pallet resultado'}
          </Button>
        </div>
      </div>

      <section aria-labelledby="repallet-kpis" className="space-y-4">
        <h2 id="repallet-kpis" className="sr-only">
          Indicadores
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCard}>
            <p className={kpiLabel}>Pallets en vista</p>
            <p className={kpiValueLg}>{formatCount(kpis.total)}</p>
            <p className={kpiFootnote}>Depósito (filtros actuales)</p>
          </div>
          <div className={kpiCard}>
            <p className={kpiLabel}>Stock operativo</p>
            <p className={kpiValueLg}>{formatCount(kpis.stockNormal)}</p>
            <p className={kpiFootnote}>Sin marca origen/resultado</p>
          </div>
          <div
            className={cn(
              kpiCard,
              kpis.origen > 0 ? 'border-amber-200/85 bg-amber-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Origen rep.</p>
            <p className={cn(kpiValueLg, kpis.origen > 0 ? 'text-amber-950' : '')}>{formatCount(kpis.origen)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Pallets consumidos</p>
          </div>
          <div
            className={cn(
              kpiCard,
              kpis.resultado > 0 ? 'border-violet-200/85 bg-violet-50/40' : '',
            )}
          >
            <p className={kpiLabel}>Resultado rep.</p>
            <p className={cn(kpiValueLg, kpis.resultado > 0 ? 'text-violet-950' : '')}>{formatCount(kpis.resultado)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Pallets nuevos post-evento</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className={cn(
              kpiCardSm,
              kpis.borrador > 0 ? 'border-slate-200/90 bg-slate-50/50' : '',
            )}
          >
            <p className={kpiLabel}>En proceso</p>
            <p className={kpiValueMd}>{formatCount(kpis.borrador)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Estado borrador en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Confirmados</p>
            <p className={kpiValueMd}>{formatCount(kpis.definitivo)}</p>
            <p className={kpiFootnote}>Estado definitivo</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Cerrados logísticos</p>
            <p className={kpiValueMd}>{formatCount(kpis.asignadoPl)}</p>
            <p className={kpiFootnote}>Reservados en PL</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Repalet marcados</p>
            <p className={kpiValueMd}>{formatCount(kpis.repaletMarcados)}</p>
            <p className={kpiFootnote}>Origen + resultado</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Cajas totales</p>
            <p className={kpiValueMd}>{formatCount(kpis.totalCajas)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>Peso total (lb)</p>
            <p className={kpiValueMd}>{formatLb(kpis.totalLb, 2)}</p>
            <p className={kpiFootnote}>Suma en vista</p>
          </div>
          <div
            className={cn(
              kpiCardSm,
              'sm:col-span-2',
              kpis.sinCajas > 0 ? 'border-amber-200/90 bg-amber-50/35' : '',
            )}
          >
            <p className={kpiLabel}>Incidencias / huecos</p>
            <p className={cn(kpiValueMd, kpis.sinCajas > 0 ? 'text-amber-950' : '')}>{formatCount(kpis.sinCajas)}</p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>Pallets con 0 cajas en vista</p>
          </div>
        </div>
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
          <div className="grid gap-2 lg:col-span-4">
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
              Inventario depósito (referencia)
            </h2>
            <p className={sectionHint}>
              {filteredRows.length} pallet(s) · mismos datos que el selector de orígenes
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
          <p className={emptyStatePanel}>Sin coincidencias con el filtro.</p>
        ) : (
          <div className={tableShell}>
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow className={tableHeaderRow}>
                  <TableHead className="min-w-[120px]">Estado pallet</TableHead>
                  <TableHead className="whitespace-nowrap text-slate-500">Fecha</TableHead>
                  <TableHead className="min-w-[100px]">Origen</TableHead>
                  <TableHead className="min-w-[100px]">Destino</TableHead>
                  <TableHead className="min-w-[120px]">Productor</TableHead>
                  <TableHead className="min-w-[140px]">Variedad</TableHead>
                  <TableHead className="min-w-[88px]">Formato</TableHead>
                  <TableHead className="text-right tabular-nums">Cajas</TableHead>
                  <TableHead className="text-right tabular-nums">Peso (lb)</TableHead>
                  <TableHead className="min-w-[120px]">Resultado</TableHead>
                  <TableHead className="w-[108px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.id} className={tableBodyRow}>
                    <TableCell className="max-w-[200px] py-3.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PalletStatusBadge status={r.status} />
                        <RepalletRoleBadge r={r} />
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-xs text-slate-400">—</TableCell>
                    <OrigenDestinoCells r={r} />
                    <TableCell className="max-w-[160px] align-top">
                      <p className="truncate text-xs text-slate-800" title={r.client_nombre ?? ''}>
                        {r.client_nombre?.trim() || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top">
                      <p className="text-xs leading-snug text-slate-700" title={r.variedades_label}>
                        {r.variedades_label || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs text-slate-800">
                      {r.format_code?.trim() || '—'}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums text-slate-900">
                      {formatCount(r.boxes)}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums text-slate-900">
                      {formatLb(r.pounds, 2)}
                    </TableCell>
                    <TableCell className="align-top">
                      <DiferenciaCell r={r} />
                    </TableCell>
                    <TableCell className="align-top text-right">
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

      <Card id="repallet-origenes" className={contentCard}>
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className={sectionTitle}>Nuevo repaletizaje</CardTitle>
          <CardDescription className="text-[13px] text-slate-500">
            Orígenes (FIFO por líneas de cada pallet). Elegí pallets del listado actual; las cajas no pueden superar lo
            disponible por pallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sources.map((row, idx) => {
            const meta = row.palletId > 0 ? byId.get(row.palletId) : undefined;
            const max = meta?.boxes ?? 0;
            const over = meta && row.boxes ? Number.parseInt(row.boxes, 10) > max : false;
            return (
              <div
                key={row.key}
                className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/30 p-4 sm:flex-row sm:items-end"
              >
                <div className="grid min-w-0 flex-1 gap-2">
                  <Label className="text-xs text-slate-500">Pallet origen #{idx + 1}</Label>
                  <select
                    className={filterSelectClass}
                    value={row.palletId || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSources((prev) => prev.map((r) => (r.key === row.key ? { ...r, palletId: v } : r)));
                    }}
                  >
                    <option value="">Seleccionar…</option>
                    {(rows ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {palletDisplay(r)} · {r.format_code ?? '—'} · {r.boxes} cajas
                      </option>
                    ))}
                  </select>
                  {meta ? (
                    <p className="text-[11px] text-slate-500">
                      Disponible: {meta.boxes} cajas · {meta.variedades_label}
                    </p>
                  ) : null}
                </div>
                <div className="grid w-full gap-2 sm:w-40">
                  <Label className="text-xs text-slate-500">Cajas a mover</Label>
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
            <Label className="text-xs text-slate-500">Notas (opcional)</Label>
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
        </CardContent>
      </Card>
    </div>
  );
}
