import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { apiJson } from '@/api';
import { CommercialOfferCalculatorBlock } from '@/components/pt-tags/CommercialOfferCalculatorBlock';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildEodReportHtml,
  buildEodReportPlain,
  formatDayKeySpanishLong,
  wrapHtmlFragmentForClipboard,
  type EodReportClientBlock,
  type EodReportLabels,
} from '@/lib/eod-report-clipboard';
import { dispatchCountsAsShippedOnDay, toLocalDayKey } from '@/lib/dispatch-shipped-day';
import { formatCount, formatLb } from '@/lib/number-format';
import { contentCard, kpiFootnote, kpiLabel, kpiValueMd, sectionHint } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

type PtTagLite = {
  id: number;
  fecha: string;
  format_code?: string | null;
  total_cajas: number;
  client_id?: number | null;
  excluida_suma_packout?: boolean;
};

type DispatchDayRow = {
  id: number;
  fecha_despacho: string;
  status?: string;
  despachado_at?: string | null;
  cliente_nombre?: string | null;
  client_nombre?: string | null;
  client_id?: number | null;
  items: Array<{ cajas?: number; cajas_despachadas?: number; tarja_id?: number }>;
  invoice?: {
    lines?: Array<{
      cajas?: number | string | null;
      packaging_code?: string | null;
      tarja_id?: number | null;
    }>;
  } | null;
};

type CommercialClientLite = { id: number; nombre: string };
type ExistenciasCamaraEodRow = {
  client_id: number | null;
  client_nombre: string | null;
  format_code: string | null;
  boxes: number;
  repalletizaje?: 'no' | 'resultado' | 'origen';
};

type PresentationFormatLite = {
  format_code: string;
  activo: boolean;
  descripcion?: string | null;
  net_weight_lb_per_box?: string | null;
  max_boxes_per_pallet?: number | null;
};

type FormatBreakdownRow = { format: string; cajas: number };
type EndOfDayClientRow = {
  label: string;
  packed: FormatBreakdownRow[];
  cooler: FormatBreakdownRow[];
  shipped: FormatBreakdownRow[];
};

function escDay(isoOrDate: string | Date): string {
  if (typeof isoOrDate === 'string') {
    const s = isoOrDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  return toLocalDayKey(isoOrDate);
}

function normFormatKey(raw: string): string {
  const t = raw.trim();
  return t ? t.toLowerCase() : '—';
}

function titleCaseFormatFallback(normKey: string): string {
  if (normKey === '—') return '—';
  if (normKey === 'sin formato') return 'Sin formato';
  return normKey
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function stripParenthesesText(s: string): string {
  return s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function countsTowardPtProductionTotals(t: PtTagLite): boolean {
  return !t.excluida_suma_packout;
}

function mergeFormatIntoMap(target: Map<string, number>, rawFormat: string, cajas: number) {
  const nk = normFormatKey(rawFormat);
  target.set(nk, (target.get(nk) ?? 0) + cajas);
}

function mapToSortedBreakdown(m: Map<string, number>, canonicalByNorm: Map<string, string>): FormatBreakdownRow[] {
  return [...m.entries()]
    .filter(([, cajas]) => cajas > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nk, cajas]) => ({
      format: nk === '—' ? '—' : (canonicalByNorm.get(nk) ?? titleCaseFormatFallback(nk)),
      cajas,
    }));
}

function breakdownRowsToNormQty(rows: FormatBreakdownRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const nk = normFormatKey(r.format);
    m.set(nk, (m.get(nk) ?? 0) + r.cajas);
  }
  return m;
}

function shippedCajasByFormat(d: DispatchDayRow, formatByTarjaId: Map<number, string>): Map<string, number> {
  const out = new Map<string, number>();
  const invLines = d.invoice?.lines;
  if (invLines && invLines.length > 0) {
    for (const li of invLines) {
      const cajas = Number(li.cajas) || 0;
      if (cajas <= 0) continue;
      let fc = (li.packaging_code ?? '').trim();
      if (!fc && li.tarja_id != null && Number(li.tarja_id) > 0) {
        fc = formatByTarjaId.get(Number(li.tarja_id)) ?? '';
      }
      mergeFormatIntoMap(out, fc || 'sin formato', cajas);
    }
    return out;
  }
  for (const it of d.items ?? []) {
    const cajas = Number(it.cajas_despachadas ?? it.cajas ?? 0);
    if (cajas <= 0) continue;
    const tid = Number(it.tarja_id);
    const fc = Number.isFinite(tid) && tid > 0 ? formatByTarjaId.get(tid) ?? 'sin formato' : 'sin formato';
    mergeFormatIntoMap(out, fc, cajas);
  }
  return out;
}

function stableClientKeyForEod(
  clientId: number | null | undefined,
  nombreHint: string | null | undefined,
  clients: CommercialClientLite[] | undefined,
): string {
  const cid = clientId != null && Number(clientId) > 0 ? Number(clientId) : 0;
  if (cid > 0) return `id:${cid}`;
  const raw = (nombreHint ?? '').trim();
  if (!raw) return 'n:SIN CLIENTE';
  const u = raw.toUpperCase();
  const list = clients ?? [];
  const exact = list.find((c) => c.nombre.trim().toUpperCase() === u);
  if (exact) return `id:${exact.id}`;
  if (raw.length >= 4) {
    const loose = list.find((c) => {
      const n = c.nombre.trim().toUpperCase();
      return n.startsWith(u) || u.startsWith(n);
    });
    if (loose) return `id:${loose.id}`;
  }
  return `n:${u}`;
}

async function fetchMpDisponibleProcesoResumen(): Promise<{
  totalLb: number;
  lineCount: number;
  producerCount: number;
}> {
  const r = await apiJson<{ total_lb: number; line_count: number; producer_count: number }>(
    '/api/processes/mp-disponible-resumen',
  );
  return {
    totalLb: Number(r.total_lb) || 0,
    lineCount: Number(r.line_count) || 0,
    producerCount: Number(r.producer_count) || 0,
  };
}

type EodPlanningSectionProps = {
  showCommercialOffer?: boolean;
  /** KPIs Planificación diaria (packed/cámara/shipped y MP proceso). Por defecto visible. */
  showDailyPlanningKpis?: boolean;
  /** Bloque «Fin del día» con tabla por cliente/formato y copiar. Por defecto visible. */
  showFinDelDia?: boolean;
  /** Ancla scroll (p. ej. Reportes → Operación → Fin del día). */
  finDelDiaDomId?: string;
  planningDomId?: string;
  finFirst?: boolean;
  finOpenByDefault?: boolean;
  /** Reemplaza el texto de ayuda bajo «Planificación diaria» (p. ej. Reportes → Operación). */
  planningHint?: string;
};

export function EodPlanningSection({
  showCommercialOffer = true,
  showDailyPlanningKpis = true,
  showFinDelDia = true,
  finDelDiaDomId,
  planningDomId,
  finFirst = false,
  finOpenByDefault = false,
  planningHint,
}: EodPlanningSectionProps) {
  const { t } = useTranslation('common');
  const [opsDayKey, setOpsDayKey] = useState<string>(() => escDay(new Date()));

  const { data: tags } = useQuery({
    queryKey: ['pt-tags', 'planning-eod'],
    queryFn: () => apiJson<PtTagLite[]>('/api/pt-tags'),
    staleTime: 60_000,
  });
  const { data: dispatchesList } = useQuery({
    queryKey: ['dispatches', 'planning-eod'],
    queryFn: () => apiJson<DispatchDayRow[]>('/api/dispatches'),
    staleTime: 60_000,
  });
  const { data: presFormats } = useQuery({
    queryKey: ['masters', 'formats', 'planning-eod'],
    queryFn: () => apiJson<PresentationFormatLite[]>('/api/masters/presentation-formats'),
    staleTime: 120_000,
  });
  const { data: commercialClients } = useQuery({
    queryKey: ['masters', 'clients', 'planning-eod'],
    queryFn: () => apiJson<CommercialClientLite[]>('/api/masters/clients'),
    staleTime: 120_000,
  });
  const { data: existenciasCamaraRows } = useQuery({
    queryKey: ['final-pallets', 'existencias-pt', 'planning-eod'],
    queryFn: () => apiJson<ExistenciasCamaraEodRow[]>('/api/final-pallets/existencias-pt?solo_deposito=1'),
    staleTime: 120_000,
  });
  const { data: mpDisponibleProceso, isPending: mpDisponiblePending } = useQuery({
    queryKey: ['processes', 'mp-disponible-eod-resumen', 'planning-eod'],
    queryFn: fetchMpDisponibleProcesoResumen,
    staleTime: 120_000,
  });

  const activePresFormats = useMemo(() => (presFormats ?? []).filter((f) => f.activo), [presFormats]);

  const formatCanonicalByNorm = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of presFormats ?? []) {
      const code = f.format_code.trim();
      if (!code) continue;
      const nk = code.toLowerCase();
      if (!m.has(nk)) m.set(nk, code);
    }
    return m;
  }, [presFormats]);

  const formatByTarjaId = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of tags ?? []) {
      m.set(t.id, (t.format_code ?? '').trim() || '—');
    }
    return m;
  }, [tags]);

  const shippedDay = useMemo(() => {
    let shippedToday = 0;
    const shippedByClientNorm = new Map<string, Map<string, number>>();
    for (const d of dispatchesList ?? []) {
      if (!dispatchCountsAsShippedOnDay(d, opsDayKey)) continue;
      const byF = shippedCajasByFormat(d, formatByTarjaId);
      const nombre = (d.client_nombre ?? d.cliente_nombre ?? '').trim();
      const cid = d.client_id != null ? Number(d.client_id) : 0;
      const clientKey = stableClientKeyForEod(cid > 0 ? cid : null, nombre || null, commercialClients);
      for (const [nk, cajas] of byF.entries()) {
        if (cajas <= 0) continue;
        shippedToday += cajas;
        let m = shippedByClientNorm.get(clientKey);
        if (!m) {
          m = new Map();
          shippedByClientNorm.set(clientKey, m);
        }
        m.set(nk, (m.get(nk) ?? 0) + cajas);
      }
    }
    return { shippedToday, shippedByClientNorm };
  }, [dispatchesList, formatByTarjaId, commercialClients, opsDayKey]);

  const operationalDaily = useMemo(() => {
    let packedToday = 0;
    for (const t of tags ?? []) {
      if (escDay(t.fecha) !== opsDayKey) continue;
      if (!countsTowardPtProductionTotals(t)) continue;
      packedToday += Number(t.total_cajas) || 0;
    }
    const shippedToday = shippedDay.shippedToday;
    const coolerBoxes = Math.max(0, packedToday - shippedToday);
    return { packedToday, shippedToday, coolerBoxes };
  }, [tags, shippedDay.shippedToday, opsDayKey]);

  const endOfDayByClient = useMemo((): EndOfDayClientRow[] => {
    type Agg = { label: string; packed: Map<string, number>; cooler: Map<string, number>; shipped: Map<string, number> };
    const clientMap = new Map<string, Agg>();
    function labelFor(key: string, nombre: string | null | undefined) {
      if (key.startsWith('id:')) {
        const id = Number(key.slice(3));
        const c = (commercialClients ?? []).find((x) => x.id === id);
        return (c?.nombre ?? nombre ?? `Cliente #${id}`).trim().toUpperCase();
      }
      return (nombre ?? 'SIN CLIENTE').trim().toUpperCase() || 'SIN CLIENTE';
    }
    const ensure = (key: string, nombre: string | null | undefined) => {
      const cur = clientMap.get(key);
      if (cur) return cur;
      const a: Agg = { label: labelFor(key, nombre), packed: new Map(), cooler: new Map(), shipped: new Map() };
      clientMap.set(key, a);
      return a;
    };
    for (const t of tags ?? []) {
      if (escDay(t.fecha) !== opsDayKey) continue;
      if (!countsTowardPtProductionTotals(t)) continue;
      const cid = t.client_id != null ? Number(t.client_id) : 0;
      const cn = cid > 0 ? (commercialClients ?? []).find((c) => c.id === cid)?.nombre ?? null : null;
      const key = stableClientKeyForEod(cid > 0 ? cid : null, null, commercialClients);
      const cell = ensure(key, cn);
      const fc = (t.format_code ?? '').trim() || '—';
      mergeFormatIntoMap(cell.packed, fc, t.total_cajas);
    }
    for (const [clientKey, normMap] of shippedDay.shippedByClientNorm) {
      const cell = ensure(clientKey, null);
      for (const [nk, cajas] of normMap) {
        const fc = formatCanonicalByNorm.get(nk) ?? titleCaseFormatFallback(nk);
        mergeFormatIntoMap(cell.shipped, fc, cajas);
      }
    }
    const camaraByKey = new Map<string, Map<string, number>>();
    const nombreHintCamara = new Map<string, string>();
    for (const row of existenciasCamaraRows ?? []) {
      if (row.repalletizaje === 'origen') continue;
      const key = stableClientKeyForEod(row.client_id, row.client_nombre, commercialClients);
      if (!nombreHintCamara.has(key) && row.client_nombre?.trim()) nombreHintCamara.set(key, row.client_nombre.trim());
      const m = camaraByKey.get(key) ?? new Map<string, number>();
      mergeFormatIntoMap(m, (row.format_code ?? '').trim() || '—', row.boxes);
      camaraByKey.set(key, m);
    }
    for (const [key, cell] of clientMap.entries()) {
      const cm = camaraByKey.get(key);
      cell.cooler = cm ? new Map(cm) : new Map();
    }
    for (const key of camaraByKey.keys()) {
      if (!clientMap.has(key)) {
        const cell = ensure(key, nombreHintCamara.get(key) ?? null);
        cell.cooler = new Map(camaraByKey.get(key)!);
      }
    }
    return [...clientMap.values()]
      .map((a) => ({
        label: a.label,
        packed: mapToSortedBreakdown(a.packed, formatCanonicalByNorm),
        cooler: mapToSortedBreakdown(a.cooler, formatCanonicalByNorm),
        shipped: mapToSortedBreakdown(a.shipped, formatCanonicalByNorm),
      }))
      .filter((r) => r.packed.length + r.cooler.length + r.shipped.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tags, shippedDay, commercialClients, formatCanonicalByNorm, opsDayKey, existenciasCamaraRows]);

  const eodLabels = useMemo<EodReportLabels>(
    () => ({
      title: t('eod.email.title'),
      mpLabel: t('eod.email.mpLabel'),
      clientPrefix: t('eod.email.clientPrefix'),
      noMovement: t('eod.email.noMovement'),
      noBoxes: t('eod.email.noBoxes'),
      packed: t('eod.email.packed'),
      camara: t('eod.email.camara'),
      shipped: t('eod.email.shipped'),
      pageTitle: t('eod.email.pageTitle'),
      days: t('eod.email.days', { returnObjects: true }) as string[],
      months: t('eod.email.months', { returnObjects: true }) as string[],
      dateFormat: t('eod.email.dateFormat'),
    }),
    [t],
  );

  const eodClipboardPayload = useMemo(() => {
    const mpLine =
      mpDisponibleProceso != null && mpDisponibleProceso.totalLb > 0
        ? `${formatLb(mpDisponibleProceso.totalLb, 2)} lb`
        : t('eod.email.mpNone');
    const fechaHeaderEs = formatDayKeySpanishLong(opsDayKey, eodLabels);
    const blocks: EodReportClientBlock[] = endOfDayByClient.map((r) => {
      const pM = breakdownRowsToNormQty(r.packed);
      const cM = breakdownRowsToNormQty(r.cooler);
      const sM = breakdownRowsToNormQty(r.shipped);
      const norms = [...new Set<string>([...pM.keys(), ...cM.keys(), ...sM.keys()])].sort((a, b) => a.localeCompare(b));
      const nums = new Map<string, { packed: number; camara: number; shipped: number }>();
      for (const nk of norms) {
        nums.set(nk, {
          packed: pM.get(nk) ?? 0,
          camara: cM.get(nk) ?? 0,
          shipped: sM.get(nk) ?? 0,
        });
      }
      return {
        label: r.label,
        norms,
        nums,
        formatLabel: (nk: string) =>
          stripParenthesesText(nk === '—' ? '—' : (formatCanonicalByNorm.get(nk) ?? titleCaseFormatFallback(nk))),
      };
    });
    const htmlFragment = buildEodReportHtml({ fechaHeaderEs, mpLine, blocks, labels: eodLabels });
    const plain = buildEodReportPlain({ fechaHeaderEs, mpLine, blocks, labels: eodLabels });
    const htmlDoc = wrapHtmlFragmentForClipboard(htmlFragment, eodLabels.pageTitle);
    return { htmlDoc, plain, htmlFragment };
  }, [endOfDayByClient, mpDisponibleProceso, opsDayKey, formatCanonicalByNorm, eodLabels]);

  const finDelDiaBlock = (
    <details
      id={finDelDiaDomId}
      className={cn(contentCard, 'scroll-mt-24 group overflow-hidden px-0 py-0 opacity-95')}
      open={finOpenByDefault}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{t('eod.title')}</p>
          <p className="text-xs text-slate-500">{t('eod.subtitle')}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#1D9E75] px-3 text-xs font-medium text-white hover:bg-[#178a65]"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            const { htmlDoc, plain } = eodClipboardPayload;
            void (async () => {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({
                    'text/html': new Blob([htmlDoc], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' }),
                  }),
                ]);
                toast.success(t('eod.toastSuccess'));
              } catch {
                try {
                  await navigator.clipboard.writeText(plain);
                  toast.success(t('eod.toastSuccessPlain'));
                } catch {
                  toast.error(t('eod.toastError'));
                }
              }
            })();
          }}
        >
          <Copy className="h-3 w-3" aria-hidden />
          {t('eod.copyButton')}
        </button>
      </summary>
      <div className="border-t border-slate-100 px-4 pb-4 pt-2 sm:px-5">
        <div
          className="eod-report-preview max-h-[min(48vh,360px)] overflow-auto rounded-lg border border-slate-200/80 bg-white p-3 text-[12px] leading-normal text-slate-800 sm:p-4"
          dangerouslySetInnerHTML={{ __html: eodClipboardPayload.htmlFragment }}
        />
      </div>
    </details>
  );

  const planningKpisCard = (
    <div id={planningDomId} className={cn(contentCard, 'scroll-mt-24 px-4 py-4 sm:px-5 sm:py-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="rep-planificacion-diaria" className="text-base font-semibold text-slate-900">
            {t('eod.planning.title')}
          </h2>
          <p className={sectionHint}>
            {planningHint ??
              t('eod.planning.hintBase') +
                (showCommercialOffer ? t('eod.planning.hintCommercial') : '') +
                '.' +
                (showFinDelDia ? (finFirst ? t('eod.planning.hintFinFirst') : t('eod.planning.hintFinEnd')) : '')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-slate-500">{t('eod.planning.dateLabel')}</Label>
          <Input
            type="date"
            className="h-8 w-[160px] bg-white"
            value={opsDayKey}
            onChange={(e) => setOpsDayKey(e.target.value || escDay(new Date()))}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 sm:gap-3">
        <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
          <p className={kpiLabel}>{t('eod.planning.packedDay')}</p>
          <p className={cn(kpiValueMd, 'text-xl')}>{formatCount(operationalDaily.packedToday)}</p>
          <p className={kpiFootnote}>{t('eod.planning.packedUnit')}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
          <p className={kpiLabel}>{t('eod.planning.coolerBalance')}</p>
          <p className={cn(kpiValueMd, 'text-xl')}>{formatCount(operationalDaily.coolerBoxes)}</p>
          <p className={kpiFootnote}>{t('eod.planning.coolerDesc')}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
          <p className={kpiLabel}>{t('eod.planning.shippedDay')}</p>
          <p className={cn(kpiValueMd, 'text-xl')}>
            {operationalDaily.shippedToday > 0 ? formatCount(operationalDaily.shippedToday) : '—'}
          </p>
          <p className={kpiFootnote}>
            {operationalDaily.shippedToday > 0
              ? t('eod.planning.shippedDesc')
              : t('eod.planning.shippedNone')}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100/90 bg-emerald-50/50 px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
          <p className={kpiLabel}>{t('eod.planning.mpTitle')}</p>
          <p className={cn(kpiValueMd, 'text-xl text-emerald-950')}>
            {mpDisponibleProceso == null ? '…' : mpDisponibleProceso.totalLb > 0 ? formatLb(mpDisponibleProceso.totalLb, 2) : '—'}
          </p>
          <p className={kpiFootnote}>
            {mpDisponibleProceso == null
              ? t('eod.planning.mpLoading')
              : mpDisponibleProceso.totalLb > 0
                ? t('eod.planning.mpDetail', {
                    producers: mpDisponibleProceso.producerCount,
                    lines: mpDisponibleProceso.lineCount,
                  })
                : t('eod.planning.mpNone')}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="space-y-4" aria-labelledby="rep-planificacion-diaria">
      {!showDailyPlanningKpis ? (
        <h2 id="rep-planificacion-diaria" className="sr-only">
          {t('eod.planning.srOnly')}
        </h2>
      ) : null}
      {finFirst && showFinDelDia ? finDelDiaBlock : null}
      {showDailyPlanningKpis ? planningKpisCard : null}

      {showCommercialOffer ? (
        <CommercialOfferCalculatorBlock
          mpTotalLb={mpDisponibleProceso?.totalLb}
          mpPending={mpDisponiblePending}
          commercialClients={commercialClients?.map((c) => ({ id: c.id, nombre: c.nombre }))}
          presentationFormats={activePresFormats.map((f) => ({
            format_code: f.format_code,
            descripcion: f.descripcion ?? null,
            net_weight_lb_per_box: f.net_weight_lb_per_box ?? null,
            max_boxes_per_pallet: f.max_boxes_per_pallet ?? null,
          }))}
        />
      ) : null}

      {!finFirst && showFinDelDia ? finDelDiaBlock : null}
    </section>
  );
}
