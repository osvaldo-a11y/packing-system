import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ChevronDown, Filter, Info, ListOrdered, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { PineBoxesIcon, PineCubeIcon, PineSnowflakeIcon, PineWeightIcon } from '@/components/icons/pinebloom';
import { appBranding } from '@/lib/branding';
import { apiJson } from '@/api';
import { OperateOnly } from '@/components/OperateOnly';
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

function PalletStatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    definitivo: 'border-emerald-200/80 bg-emerald-50 text-emerald-900',
    borrador: 'border-slate-200 bg-slate-100 text-slate-700',
    anulado: 'border-rose-200/90 bg-rose-50 text-rose-900',
    repaletizado: 'border-violet-200/80 bg-violet-50 text-violet-900',
    revertido: 'border-amber-200/80 bg-amber-50 text-amber-950',
    asignado_pl: 'border-sky-200/80 bg-sky-50 text-sky-900',
  };
  const labelMap: Record<string, string> = {
    definitivo: t('repallet.palletStatus.definitivo'),
    borrador: t('repallet.palletStatus.borrador'),
    anulado: t('repallet.palletStatus.anulado'),
    repaletizado: t('repallet.palletStatus.repaletizado'),
    revertido: t('repallet.palletStatus.revertido'),
    asignado_pl: t('repallet.palletStatus.asignado_pl'),
  };
  return (
    <span className={cn(badgePill, 'max-w-[140px]', map[s] ?? 'border-slate-200 bg-slate-50 text-slate-800')} title={status}>
      {labelMap[s] ?? status}
    </span>
  );
}

function RepalletRoleBadge({
  r,
  t,
}: {
  r: ExistenciaPtRow;
  t: (key: string) => string;
}) {
  if (r.repalletizaje === 'resultado') {
    return (
      <span
        className="inline-flex rounded-full border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900"
        title={t('repallet.roleBadge.resultTitle')}
      >
        {t('repallet.roleBadge.result')}
      </span>
    );
  }
  if (r.repalletizaje === 'origen') {
    return (
      <span
        className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-950"
        title={t('repallet.roleBadge.originTitle')}
      >
        {t('repallet.roleBadge.origin')}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {t('repallet.roleBadge.operative')}
    </span>
  );
}

export function RepalletPage() {
  const { t } = useTranslation('common');
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
  const [showMoreFilters, setShowMoreFilters] = useState(false);

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
        text: t('repallet.alerts.sinCajas', { count: formatCount(kpis.sinCajas) }),
      });
    }
    if (kpis.conDespacho > 0) {
      lines.push({
        key: 'despacho',
        tone: 'info',
        text: t('repallet.alerts.conDespacho', { count: formatCount(kpis.conDespacho) }),
      });
    }
    if (kpis.origen > 0 && kpis.resultado > 0) {
      lines.push({
        key: 'traza',
        tone: 'info',
        text: t('repallet.alerts.traza', {
          origins: formatCount(kpis.origen),
          results: formatCount(kpis.resultado),
        }),
      });
    }
    if (partialCountInBase > 0) {
      lines.push({
        key: 'parciales',
        tone: 'info',
        text: t('repallet.alerts.parciales', { count: formatCount(partialCountInBase) }),
      });
    }
    return lines;
  }, [kpis.sinCajas, kpis.conDespacho, kpis.origen, kpis.resultado, partialCountInBase, t]);

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

  const helpBody = t('repallet.helpBody');

  const nuevoRepalletInfo = t('repallet.newRepalletInfo');

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

  const stockTabs = [
    { to: '/existencias-pt/inventario', label: t('existenciasPt.layout.tabInventory'), end: true as const },
    { to: '/existencias-pt/repaletizar', label: t('existenciasPt.layout.tabRepallet') },
    { to: '/existencias-pt/packing-lists', label: t('existenciasPt.layout.tabPackingLists') },
  ];

  const desktopKpis = [
    {
      label: t('repallet.kpis.palletsInView'),
      value: formatCount(kpis.total),
      note:
        filterPartialOnly === 'partial'
          ? t('repallet.kpis.palletsNotePartial')
          : partialCountInBase > 0
            ? t('repallet.kpis.palletsNoteIncomplete', { count: formatCount(partialCountInBase) })
            : t('repallet.kpis.palletsNoteAll'),
      Icon: PineSnowflakeIcon,
      card: 'border-[var(--bluegray-200)] bg-[var(--bluegray-100)]',
      well: 'bg-[var(--bluegray-200)] text-[var(--bluegray-700)]',
    },
    {
      label: t('repallet.kpis.totalBoxes'),
      value: formatCount(kpis.totalCajas),
      note: t('repallet.kpis.totalBoxesNote'),
      Icon: PineCubeIcon,
      card: 'border-[var(--sage-200)] bg-[var(--sage-100)]',
      well: 'bg-[var(--sage-200)] text-[var(--olive-700)]',
    },
    {
      label: t('repallet.kpis.weight'),
      value: formatLb(kpis.totalLb, 2),
      note: t('repallet.kpis.weightNote'),
      Icon: PineWeightIcon,
      card: 'border-[var(--stone-300)] bg-[var(--stone-100)]',
      well: 'bg-[#DED9CF] text-[#41443F]',
    },
    {
      label: t('repallet.kpis.repalletTitle'),
      value: t('repallet.kpis.repalletValue', {
        origins: formatCount(kpis.origen),
        results: formatCount(kpis.resultado),
        noBoxes: formatCount(kpis.sinCajas),
      }),
      note: t('repallet.kpis.repalletNote'),
      Icon: PineBoxesIcon,
      card: kpis.sinCajas > 0 ? 'border-amber-200/90 bg-amber-50/35' : 'border-[var(--harvest-200)] bg-[var(--harvest-100)]',
      well: kpis.sinCajas > 0 ? 'bg-amber-100 text-amber-950' : 'bg-[var(--harvest-200)] text-[var(--harvest-700)]',
    },
  ];

  return (
    <div className="space-y-8 max-lg:overflow-x-hidden lg:-mx-7 lg:min-h-[calc(100vh-52px)] lg:space-y-0 lg:bg-[#F9F7F5] lg:px-7">
      <div className={cn(pageHeaderRow, 'lg:hidden')}>
        <div className="min-w-0 space-y-1.5">
          <h2 className={pageTitle}>{t('repallet.pageTitle')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className={pageSubtitle}>
              {t('repallet.pageSubtitle')}
            </p>
            <button type="button" className={pageInfoButton} title={helpBody} aria-label={t('repallet.pageTitle')}>
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            <Link
              to="/existencias-pt/inventario"
              className="text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              {t('repallet.backLink')}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className={btnToolbarOutline} onClick={scrollToForm}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('repallet.configButton')}
          </Button>
          <Button
            type="button"
            size="sm"
            className={btnToolbarPrimary}
            disabled={totalCajasAMover === 0 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? t('repallet.processingButton') : t('repallet.createButton')}
          </Button>
        </div>
      </div>

      <header
        data-repallet-desktop-hero
        className="relative hidden overflow-hidden rounded-[14px] border border-[var(--stone-300)] bg-white/55 px-3.5 pb-3 pt-3.5 lg:flex lg:h-[171px] lg:min-h-[171px] lg:items-start lg:justify-between lg:gap-5 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-[var(--stone-200)] lg:bg-transparent lg:px-0 lg:pb-5 lg:pl-2 lg:pt-7"
      >
        <img
          src={appBranding.landscapeUrl}
          alt=""
          className="pointer-events-none absolute right-0 top-1 hidden h-[118%] w-[680px] max-w-[62%] object-contain object-right opacity-[0.78] contrast-[0.96] brightness-[1.03] saturate-[0.68] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] lg:block"
          aria-hidden
        />
        <div className="relative z-[1] min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <h1 className={cn(pageTitle, 'lg:font-serif lg:text-[66px] lg:font-semibold lg:leading-[1.05] lg:tracking-[-0.9px] lg:text-[var(--ink)]')}>
              {t('existenciasPt.layout.tabRepallet')}
            </h1>
            <button
              type="button"
              className={cn(pageInfoButton, 'lg:mt-1')}
              title={helpBody}
              aria-label={t('existenciasPt.layout.tabRepallet')}
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className={cn(pageSubtitle, 'lg:max-w-[38rem] lg:font-serif lg:text-[22px] lg:leading-tight lg:text-[var(--ink-muted)]')}>
            {t('repallet.pageSubtitle')}
          </p>
        </div>
        <div className="relative z-[1] flex shrink-0 flex-col items-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-[168px] rounded-[var(--radius-md)] border-[var(--stone-300)] bg-white px-4 text-[13px] font-semibold shadow-none hover:bg-[var(--stone-100)]"
            onClick={scrollToForm}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('repallet.configButton')}
          </Button>
          <Button
            type="button"
            className="h-[52px] min-w-[216px] rounded-[var(--radius-md)] bg-[var(--olive-700)] px-6 text-[16px] font-semibold text-white shadow-none hover:bg-[var(--olive-600)] disabled:opacity-50"
            disabled={totalCajasAMover === 0 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? t('repallet.processingButton') : t('repallet.createButton')}
          </Button>
        </div>
      </header>

      <nav
        data-repallet-desktop-tabs
        className="mb-2 hidden lg:flex lg:flex-wrap lg:gap-1"
        aria-label={t('existenciasPt.layout.navAriaLabel')}
      >
        {stockTabs.map(({ to, label, end = false }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'rounded-[8px] px-3 py-1 text-[12px] font-semibold transition-colors',
                isActive
                  ? 'bg-[var(--olive-700)] text-white'
                  : 'border border-[var(--stone-300)] bg-white text-[var(--ink-muted)] hover:bg-[var(--stone-100)] hover:text-[var(--ink)]',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <section
        data-repallet-desktop-kpis
        aria-labelledby="repallet-kpis-desktop"
        className="hidden space-y-2.5 lg:block lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white/45 lg:px-[14px] lg:py-2.5"
      >
        <h2 id="repallet-kpis-desktop" className="font-serif text-[20px] font-semibold text-[var(--ink)]">
          {t('repallet.kpis.srOnly')}
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {desktopKpis.map(({ label, value, note, Icon, card, well }) => (
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
                <p className={cn(kpiLabel, 'lg:font-serif lg:text-[13px] lg:font-medium lg:normal-case lg:tracking-normal lg:text-[var(--ink)]')}>{label}</p>
                <p className={cn(kpiValueLg, 'lg:mt-1 lg:font-serif lg:text-[22px] lg:font-bold lg:tabular-nums lg:leading-none lg:tracking-[-0.65px] lg:text-[var(--ink)]')}>
                  {value}
                </p>
                <p className={cn(kpiFootnote, 'lg:mt-1 lg:text-[11px] lg:leading-tight lg:text-[var(--ink-muted)]')}>{note}</p>
              </div>
            </div>
          ))}
        </div>
        {alertLines.length > 0 ? (
          <div className="space-y-1.5 rounded-[8px] border border-[var(--stone-200)] bg-white/65 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{t('repallet.alerts.title')}</p>
            <ul className="space-y-1">
              {alertLines.map((a) => (
                <li
                  key={a.key}
                  className={cn(
                    'rounded-[7px] border px-2.5 py-1.5 text-[12px] leading-snug',
                    a.tone === 'warn'
                      ? 'border-amber-200/90 bg-amber-50/50 text-amber-950'
                      : 'border-[var(--stone-200)] bg-white text-[var(--ink-muted)]',
                  )}
                >
                  {a.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div
        data-repallet-desktop-filters
        className="mt-3 hidden min-h-[62px] rounded-[10px] border border-[var(--stone-300)] bg-white/70 px-3.5 py-[11px] lg:block"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-[16rem] flex-1">
            <Input
              className={cn(filterInputClass, 'h-10 border-[var(--stone-300)] bg-white')}
              placeholder="Unidad PT, cliente, variedad, código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-w-[146px] gap-1.5 border-[var(--stone-300)] bg-white px-4"
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" strokeWidth={2} aria-hidden />
            {showMoreFilters ? t('existenciasPt.filters.hideFilters') : t('existenciasPt.filters.moreFilters')}
            <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', showMoreFilters ? 'rotate-180' : '')} />
          </Button>
        </div>
        {showMoreFilters ? (
          <div className="mt-3 grid grid-cols-12 items-end gap-2 border-t border-[var(--stone-200)] pt-3">
            <div className="col-span-3 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('repallet.filters.species')}</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                value={filterSpeciesId}
                onChange={(e) => setFilterSpeciesId(Number(e.target.value))}
              >
                <option value={0}>{t('repallet.filters.speciesAll')}</option>
                {speciesOptions.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('repallet.filters.format')}</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                value={filterFormatId}
                onChange={(e) => setFilterFormatId(Number(e.target.value))}
              >
                <option value={0}>{t('repallet.filters.formatAll')}</option>
                {formatOptions.map(([id, code]) => (
                  <option key={id} value={id}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-4 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">Rol repaletizaje</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                value={filterRepallet}
                onChange={(e) => setFilterRepallet(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="no">Stock operativo</option>
                <option value="origen">Origen</option>
                <option value="resultado">Resultado</option>
              </select>
            </div>
            <div className="col-span-3 grid gap-1.5">
              <Label className="text-xs text-[var(--ink-muted)]">{t('repallet.filters.completeness')}</Label>
              <select
                className={cn(filterSelectClass, 'h-10 border-[var(--stone-300)] bg-white')}
                value={filterPartialOnly}
                onChange={(e) => setFilterPartialOnly(e.target.value as 'all' | 'partial')}
                title="Solo pallets con cajas por debajo del tope del formato (si el maestro define tope)"
              >
                <option value="all">{t('repallet.filters.completenessAll')}</option>
                <option value="partial">{t('repallet.filters.completenessPartial')}</option>
              </select>
            </div>
          </div>
        ) : null}
      </div>

      <Card id="repallet-origenes" className={cn(contentCard, 'lg:mt-[14px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:shadow-none')}>
        <CardHeader className="pb-3 lg:border-b lg:border-[var(--stone-200)] lg:px-[14px] lg:py-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className={cn(sectionTitle, 'mb-0 lg:font-serif lg:text-[21px] lg:leading-tight lg:text-[var(--ink)]')}>{t('repallet.form.title')}</CardTitle>
            <button type="button" className={pageInfoButton} title={nuevoRepalletInfo} aria-label={t('repallet.form.title')}>
              <Info className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 lg:px-[14px] lg:py-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)] lg:items-start">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2.5 lg:rounded-[10px] lg:border-[var(--stone-200)] lg:bg-[var(--sage-100)]/45">
                <div className="grid min-w-[min(100%,14rem)] flex-1 gap-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('repallet.form.formatLabel')}</Label>
                  <select
                    className={filterSelectClass}
                    value={filterFormatId}
                    onChange={(e) => setFilterFormatId(Number(e.target.value))}
                  >
                    <option value={0}>{t('repallet.form.formatAll')}</option>
                    {formatOptions.map(([id, code]) => (
                      <option key={id} value={id}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="max-w-md flex-1 text-[11px] leading-snug text-slate-500">
                  {t('repallet.form.formatHint')}
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
                className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/30 p-4 sm:flex-row sm:items-end lg:rounded-[10px] lg:border-[var(--stone-200)] lg:bg-white"
              >
                <div className="grid min-w-0 flex-1 gap-2">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('repallet.form.sourceLabel', { n: idx + 1 })}</Label>
                  <select
                    className={filterSelectClass}
                    value={row.palletId || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSources((prev) => prev.map((r) => (r.key === row.key ? { ...r, palletId: v } : r)));
                    }}
                  >
                    <option value="">{t('repallet.form.sourcePlaceholder')}</option>
                    {sortedOriginsForSelect.map((r) => {
                      const par = isPartialPallet(r);
                      const label = `${par ? '◐ ' : ''}${palletDisplay(r)} · ${r.format_code ?? '—'} · ${r.boxes} ${t('repallet.form.boxesUnit')}`;
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
                        <span title={t('repallet.form.partialTitle')}>{t('repallet.form.partialBadge')} </span>
                      ) : null}
                      {t('repallet.form.available', { boxes: meta.boxes, varieties: meta.variedades_label })}
                    </p>
                  ) : null}
                </div>
                <div className="grid w-full gap-2 sm:w-40">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('repallet.form.boxesLabel')}</Label>
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
                      {t('repallet.form.maxSuggested', { max })}
                      {over ? <span className="text-destructive"> {t('repallet.form.overAvailable')}</span> : null}
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
                  {t('repallet.form.removeButton')}
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
            {t('repallet.form.addButton')}
          </Button>

          <div className="grid gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('repallet.form.notesLabel')}</Label>
            <Input
              className={filterInputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('repallet.form.notesPlaceholder')}
            />
          </div>

          {mut.isError ? (
            <div role="alert" className={errorStatePanel}>
              {(mut.error as Error)?.message ?? 'Error'}
            </div>
          ) : null}

          <OperateOnly>
            <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" className={cn(btnToolbarPrimary, 'lg:h-10 lg:rounded-[var(--radius-md)] lg:bg-[var(--olive-700)] lg:px-5 lg:text-[14px] lg:font-semibold lg:text-white lg:shadow-none lg:hover:bg-[var(--olive-600)]')} disabled={mut.isPending} onClick={() => mut.mutate()}>
                {mut.isPending ? t('repallet.processingButton') : t('repallet.createButton')}
              </Button>
            </div>
          </OperateOnly>
            </div>

            <aside
              className="sticky top-4 shrink-0 rounded-xl border border-border bg-background p-4 shadow-sm lg:min-h-0 lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-white lg:shadow-none"
              title="Suma de todas las cajas que estás asignando a mover en los orígenes"
            >
              <div className="flex items-center gap-2">
                <Boxes
                  className={cn('h-4 w-4 shrink-0', totalCajasAMover > 0 ? 'text-[#1D9E75]' : 'text-muted-foreground')}
                  aria-hidden
                />
                <p className={kpiLabel}>{t('repallet.form.totalBoxes')}</p>
              </div>
              <p
                className={cn(
                  'mt-2 text-3xl tabular-nums',
                  totalCajasAMover === 0 ? 'text-muted-foreground' : 'font-bold text-[#1D9E75]',
                )}
              >
                {formatCount(totalCajasAMover)}
              </p>
              <p className={cn(kpiFootnote, 'mt-1')}>{t('repallet.form.totalBoxesNote')}</p>
            </aside>
          </div>
        </CardContent>
      </Card>

      <div className={cn(filterPanel, 'lg:hidden')}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={signalsTitle}>{t('repallet.filters.title')}</span>
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
            <Label className="text-xs text-slate-500">{t('repallet.filters.species')}</Label>
            <select
              className={filterSelectClass}
              value={filterSpeciesId}
              onChange={(e) => setFilterSpeciesId(Number(e.target.value))}
            >
              <option value={0}>{t('repallet.filters.speciesAll')}</option>
              {speciesOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="text-xs text-slate-500">{t('repallet.filters.format')}</Label>
            <select
              className={filterSelectClass}
              value={filterFormatId}
              onChange={(e) => setFilterFormatId(Number(e.target.value))}
            >
              <option value={0}>{t('repallet.filters.formatAll')}</option>
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
            <Label className="text-xs text-slate-500">{t('repallet.filters.completeness')}</Label>
            <select
              className={filterSelectClass}
              value={filterPartialOnly}
              onChange={(e) => setFilterPartialOnly(e.target.value as 'all' | 'partial')}
              title="Solo pallets con cajas por debajo del tope del formato (si el maestro define tope)"
            >
              <option value="all">{t('repallet.filters.completenessAll')}</option>
              <option value="partial">{t('repallet.filters.completenessPartial')}</option>
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

      <section
        data-repallet-desktop-list
        className="space-y-3 lg:mt-[14px] lg:space-y-0 lg:overflow-hidden lg:rounded-[10px] lg:border lg:border-[var(--stone-300)] lg:bg-white"
        aria-labelledby="repallet-tabla"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 lg:min-h-[60px] lg:items-center lg:border-b lg:border-[var(--stone-200)] lg:px-[14px] lg:py-2">
          <div>
            <h2 id="repallet-tabla" className={cn(sectionTitle, 'lg:font-serif lg:text-[21px] lg:leading-tight lg:text-[var(--ink)]')}>
              {t('repallet.table.title')}
            </h2>
            <p className={sectionHint}>
              {t('repallet.table.hint', { count: filteredRows.length })}
              {filterPartialOnly === 'partial' && filteredRowsBase.length > 0
                ? t('repallet.table.hintPartial', { total: filteredRowsBase.length })
                : null}
              {filterPartialOnly === 'all' && partialCountInBase > 0
                ? t('repallet.table.hintIncomplete', { count: partialCountInBase })
                : null}
              {t('repallet.table.hintUniverse')}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className={cn(btnToolbarOutline, 'lg:h-9 lg:border-[var(--stone-300)] lg:bg-white')}>
            <Link to="/existencias-pt/inventario" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              {t('repallet.table.inventoryButton')}
            </Link>
          </Button>
        </div>

        {!rows?.length ? (
          <p className={cn(emptyStatePanel, 'lg:m-3 lg:min-h-[180px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:py-16 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]')}>{t('repallet.table.emptyAll')}</p>
        ) : !filteredRows.length ? (
          <p className={cn(emptyStatePanel, 'lg:m-3 lg:min-h-[180px] lg:rounded-[10px] lg:border-[var(--stone-300)] lg:bg-[var(--stone-50)] lg:py-16 lg:font-serif lg:text-[16px] lg:text-[var(--ink-muted)]')}>
            {filterPartialOnly === 'partial' && filteredRowsBase.length > 0
              ? t('repallet.table.emptyPartial')
              : t('repallet.table.emptyFilter')}
          </p>
        ) : (
          <div className={cn(tableShell, 'max-h-[min(52vh,520px)] overflow-auto lg:max-h-none lg:rounded-none lg:border-0 lg:shadow-none')}>
            <Table className="min-w-[780px]">
              <TableHeader>
                  <TableRow className={cn(tableHeaderRow, 'lg:border-[var(--stone-200)] lg:bg-[var(--stone-50)]')}>
                  <TableHead className="min-w-[160px] lg:text-[11px] lg:font-semibold lg:uppercase lg:tracking-[0.04em] lg:text-[var(--ink-muted)]">{t('repallet.table.colCode')}</TableHead>
                  <TableHead className="min-w-[72px]">{t('repallet.table.colFormat')}</TableHead>
                  <TableHead className="min-w-[108px] text-right tabular-nums">{t('repallet.table.colBoxes')}</TableHead>
                  <TableHead className="min-w-[120px]">{t('repallet.table.colClient')}</TableHead>
                  <TableHead className="min-w-[100px]">{t('repallet.table.colBrand')}</TableHead>
                  <TableHead className="min-w-[100px]">{t('repallet.table.colBol')}</TableHead>
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
                        <PalletStatusBadge status={r.status} t={t} />
                        <RepalletRoleBadge r={r} t={t} />
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
                          ? t('repallet.table.colBoxesTitle')
                          : t('repallet.table.colBoxesNoLimit')
                      }
                    >
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {isPartialPallet(r) ? (
                          <span
                            className="inline-flex h-5 min-w-[2.75rem] items-center justify-center rounded-full border border-amber-200/90 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-950"
                            title={t('repallet.table.partialBadgeTitle')}
                          >
                            {t('repallet.table.partialBadge')}
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
                        <Link to={`/existencias-pt/detalle/${r.id}`}>{t('repallet.table.actionView')}</Link>
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
        <div className={cn(signalsPanel, 'lg:hidden')}>
          <p className={signalsTitle}>{t('repallet.alerts.title')}</p>
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

      <section aria-labelledby="repallet-kpis-resumen" className="space-y-3 lg:hidden">
        <h2 id="repallet-kpis-resumen" className="sr-only">
          {t('repallet.kpis.srOnly')}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={kpiCardSm}>
            <p className={kpiLabel}>{t('repallet.kpis.palletsInView')}</p>
            <p className={kpiValueMd}>{formatCount(kpis.total)}</p>
            <p className={kpiFootnote}>
              {filterPartialOnly === 'partial'
                ? t('repallet.kpis.palletsNotePartial')
                : partialCountInBase > 0
                  ? t('repallet.kpis.palletsNoteIncomplete', { count: formatCount(partialCountInBase) })
                  : t('repallet.kpis.palletsNoteAll')}
            </p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>{t('repallet.kpis.totalBoxes')}</p>
            <p className={kpiValueMd}>{formatCount(kpis.totalCajas)}</p>
            <p className={kpiFootnote}>{t('repallet.kpis.totalBoxesNote')}</p>
          </div>
          <div className={kpiCardSm}>
            <p className={kpiLabel}>{t('repallet.kpis.weight')}</p>
            <p className={kpiValueMd}>{formatLb(kpis.totalLb, 2)}</p>
            <p className={kpiFootnote}>{t('repallet.kpis.weightNote')}</p>
          </div>
          <div
            className={cn(
              kpiCardSm,
              kpis.sinCajas > 0 ? 'border-amber-200/90 bg-amber-50/35' : '',
            )}
          >
            <p className={kpiLabel}>{t('repallet.kpis.repalletTitle')}</p>
            <p className={cn(kpiValueMd, kpis.sinCajas > 0 ? 'text-amber-950' : '')}>
              {t('repallet.kpis.repalletValue', {
                origins: formatCount(kpis.origen),
                results: formatCount(kpis.resultado),
                noBoxes: formatCount(kpis.sinCajas),
              })}
            </p>
            <p className={cn(kpiFootnote, 'text-slate-500')}>{t('repallet.kpis.repalletNote')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
