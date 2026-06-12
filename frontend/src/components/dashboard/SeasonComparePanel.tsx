import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeasonCompareResult, SeasonOverview } from '@/api/seasons';
import { formatLb, formatMoney, formatPercent } from '@/lib/number-format';
import { sectionHint, sectionTitle } from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  yearA: number;
  yearB: number;
  data: SeasonCompareResult | undefined;
  loading: boolean;
};

type ProducerStatus = 'both' | 'new_in_a' | 'exit_from_a';

type ProducerCardRow = {
  producerId: number | null;
  name: string;
  commercialA: boolean;
  commercialB: boolean;
  salesA: number;
  salesB: number;
  growerA: number;
  growerB: number;
  packoutA: number;
  packoutB: number;
  pctPackoutA: number | null;
  pctPackoutB: number | null;
  status: ProducerStatus;
  salesDeltaPct: number | null;
  growerDeltaPct: number | null;
};

function producerMergeKey(producerId: number | null, producerName: string): string {
  if (producerId != null && Number.isFinite(producerId)) return `id:${producerId}`;
  return `name:${producerName.trim().toUpperCase()}`;
}

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function emptyRow(producerId: number | null, name: string): ProducerCardRow {
  return {
    producerId,
    name,
    commercialA: false,
    commercialB: false,
    salesA: 0,
    salesB: 0,
    growerA: 0,
    growerB: 0,
    packoutA: 0,
    packoutB: 0,
    pctPackoutA: null,
    pctPackoutB: null,
    status: 'both',
    salesDeltaPct: null,
    growerDeltaPct: null,
  };
}

function buildProducerCards(a: SeasonOverview, b: SeasonOverview): ProducerCardRow[] {
  const map = new Map<string, ProducerCardRow>();

  for (const p of a.commercial?.by_producer ?? []) {
    const key = producerMergeKey(p.producer_id, p.producer_name);
    const row = map.get(key) ?? emptyRow(p.producer_id, p.producer_name);
    row.name = p.producer_name || row.name;
    row.commercialA = true;
    row.salesA = p.sales;
    row.growerA = p.grower_return;
    map.set(key, row);
  }
  for (const p of b.commercial?.by_producer ?? []) {
    const key = producerMergeKey(p.producer_id, p.producer_name);
    const row = map.get(key) ?? emptyRow(p.producer_id, p.producer_name);
    row.name = p.producer_name || row.name;
    row.commercialB = true;
    row.salesB = p.sales;
    row.growerB = p.grower_return;
    map.set(key, row);
  }
  for (const p of a.mass_balance?.by_producer ?? []) {
    const key = producerMergeKey(p.producer_id, p.producer_name);
    const row = map.get(key) ?? emptyRow(p.producer_id, p.producer_name);
    row.name = p.producer_name || row.name;
    row.packoutA = p.lb_packout;
    row.pctPackoutA = p.pct_packout;
    map.set(key, row);
  }
  for (const p of b.mass_balance?.by_producer ?? []) {
    const key = producerMergeKey(p.producer_id, p.producer_name);
    const row = map.get(key) ?? emptyRow(p.producer_id, p.producer_name);
    row.name = p.producer_name || row.name;
    row.packoutB = p.lb_packout;
    row.pctPackoutB = p.pct_packout;
    map.set(key, row);
  }

  const rows = [...map.values()].filter(
    (r) => r.commercialA || r.commercialB || r.packoutA > 0 || r.packoutB > 0,
  );

  for (const row of rows) {
    if (row.commercialA && !row.commercialB) row.status = 'new_in_a';
    else if (!row.commercialA && row.commercialB) row.status = 'exit_from_a';
    else row.status = 'both';

    if (row.status === 'both') {
      row.salesDeltaPct = pctDelta(row.salesA, row.salesB);
      row.growerDeltaPct = pctDelta(row.growerA, row.growerB);
    }
  }

  return rows;
}

function partitionAndSort(rows: ProducerCardRow[]): {
  main: ProducerCardRow[];
  rotation: ProducerCardRow[];
} {
  const main: ProducerCardRow[] = [];
  const rotation: ProducerCardRow[] = [];
  for (const r of rows) {
    if (r.status === 'both') main.push(r);
    else rotation.push(r);
  }
  main.sort((x, y) => (y.salesDeltaPct ?? -Infinity) - (x.salesDeltaPct ?? -Infinity));
  rotation.sort((x, y) => x.name.localeCompare(y.name, 'es'));
  return { main, rotation };
}

function deltaTone(n: number): string {
  if (n > 0) return 'text-[#0F6E56]';
  if (n < 0) return 'text-red-700';
  return 'text-slate-600';
}

function MiniMetricBars({ valueA, valueB }: { valueA: number; valueB: number }) {
  const max = Math.max(valueA, valueB, 1);
  const pctA = (valueA / max) * 100;
  const pctB = (valueB / max) * 100;
  return (
    <div className="mt-1 flex gap-1">
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#1D9E75]" style={{ width: `${pctA}%` }} />
      </div>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-400" style={{ width: `${pctB}%` }} />
      </div>
    </div>
  );
}

function SalesDeltaHero({
  row,
  yearA,
  tr,
}: {
  row: ProducerCardRow;
  yearA: number;
  tr: (k: string, opts?: Record<string, unknown>) => string;
}) {
  if (row.status === 'exit_from_a') {
    return (
      <p className="text-sm font-semibold text-amber-800">{tr('compareNoActivity', { year: yearA })}</p>
    );
  }
  if (row.status === 'new_in_a') {
    return <p className="text-sm font-semibold text-sky-800">{tr('compareNew', { year: yearA })}</p>;
  }
  if (row.salesDeltaPct == null) return <p className="text-sm text-slate-500">—</p>;
  const up = row.salesDeltaPct >= 0;
  return (
    <p className={cn('text-2xl font-bold tabular-nums leading-none', deltaTone(row.salesDeltaPct))}>
      {up ? '+' : ''}
      {formatPercent(row.salesDeltaPct, 1)}% {up ? '▲' : '▼'}
    </p>
  );
}

function SecondaryDelta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-400">—</span>;
  const up = pct >= 0;
  return (
    <span className={cn('text-xs font-semibold tabular-nums', deltaTone(pct))}>
      {up ? '+' : ''}
      {formatPercent(pct, 1)}%
    </span>
  );
}

function MetricPair({
  label,
  yearA,
  yearB,
  valueA,
  valueB,
  formatValue,
  deltaPct,
  showBars,
}: {
  label: string;
  yearA: number;
  yearB: number;
  valueA: number;
  valueB: number;
  formatValue: (n: number) => string;
  deltaPct?: number | null;
  showBars?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {deltaPct != null ? <SecondaryDelta pct={deltaPct} /> : null}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs tabular-nums">
        <div className="min-w-0 truncate">
          <span className="text-[10px] font-medium text-slate-400">{yearA}</span>{' '}
          <span className="font-medium text-slate-800">{valueA > 0 ? formatValue(valueA) : '—'}</span>
        </div>
        <div className="min-w-0 truncate text-right">
          <span className="text-[10px] font-medium text-slate-400">{yearB}</span>{' '}
          <span className="font-medium text-slate-700">{valueB > 0 ? formatValue(valueB) : '—'}</span>
        </div>
      </div>
      {showBars && (valueA > 0 || valueB > 0) ? (
        <MiniMetricBars valueA={valueA} valueB={valueB} />
      ) : null}
    </div>
  );
}

function ProducerCompareCard({
  row,
  yearA,
  yearB,
  tr,
}: {
  row: ProducerCardRow;
  yearA: number;
  yearB: number;
  tr: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-900">{row.name}</h3>
        <div className="shrink-0 text-right">
          <SalesDeltaHero row={row} yearA={yearA} tr={tr} />
        </div>
      </div>

      <div className="mt-auto space-y-3">
        <MetricPair
          label={tr('sales')}
          yearA={yearA}
          yearB={yearB}
          valueA={row.salesA}
          valueB={row.salesB}
          formatValue={formatMoney}
          showBars
        />
        <MetricPair
          label={tr('growerReturn')}
          yearA={yearA}
          yearB={yearB}
          valueA={row.growerA}
          valueB={row.growerB}
          formatValue={formatMoney}
          deltaPct={row.status === 'both' ? row.growerDeltaPct : null}
          showBars
        />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {tr('packout')}
          </p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs tabular-nums">
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-slate-400">{yearA}</span>{' '}
              <span className="font-medium text-slate-800">
                {row.packoutA > 0 ? `${formatLb(row.packoutA)} lb` : '—'}
                {row.pctPackoutA != null && row.packoutA > 0 ? (
                  <span className="ml-1 text-slate-500">
                    ({formatPercent(row.pctPackoutA, 1)}% {tr('pctPackoutShort')})
                  </span>
                ) : null}
              </span>
            </div>
            <div className="min-w-0 text-right">
              <span className="text-[10px] font-medium text-slate-400">{yearB}</span>{' '}
              <span className="font-medium text-slate-700">
                {row.packoutB > 0 ? `${formatLb(row.packoutB)} lb` : '—'}
                {row.pctPackoutB != null && row.packoutB > 0 ? (
                  <span className="ml-1 text-slate-500">
                    ({formatPercent(row.pctPackoutB, 1)}% {tr('pctPackoutShort')})
                  </span>
                ) : null}
              </span>
            </div>
          </div>
          {row.packoutA > 0 || row.packoutB > 0 ? (
            <MiniMetricBars valueA={row.packoutA} valueB={row.packoutB} />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function SeasonComparePanel({ yearA, yearB, data, loading }: Props) {
  const { t } = useTranslation('common');
  const tr = (k: string, opts?: Record<string, unknown>) =>
    String(t(`reporting.season.${k}`, opts as never));

  const overviewA = data?.overviews.find((o) => o.season_year === yearA);
  const overviewB = data?.overviews.find((o) => o.season_year === yearB);
  const variation =
    data?.variations.find(
      (v) => v.from_year === Math.min(yearA, yearB) && v.to_year === Math.max(yearA, yearB),
    ) ?? data?.variations.find((v) => v.from_year === yearA && v.to_year === yearB);

  const { main, rotation } = useMemo(() => {
    if (!overviewA || !overviewB) return { main: [], rotation: [] };
    return partitionAndSort(buildProducerCards(overviewA, overviewB));
  }, [overviewA, overviewB]);

  if (loading) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  if (!overviewA || !overviewB) {
    return <p className="text-sm text-slate-500">{tr('compareNoData')}</p>;
  }

  const deltaSign = (n: number) => (n > 0 ? '+' : '');

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
      <div>
        <h2 className={sectionTitle}>{tr('compareTitle', { yearA, yearB })}</h2>
        <p className={sectionHint}>{tr('compareHint')}</p>
      </div>

      {variation ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#A6E6D3] bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Δ {tr('sales')}
            </p>
            <p
              className={cn(
                'mt-1 text-lg font-bold tabular-nums',
                variation.sales_delta >= 0 ? 'text-[#0F6E56]' : 'text-red-700',
              )}
            >
              {deltaSign(variation.sales_delta)}
              {formatMoney(variation.sales_delta)} ({deltaSign(variation.sales_delta_pct)}
              {variation.sales_delta_pct.toFixed(2)}%)
            </p>
          </div>
          <div className="rounded-xl border border-[#A6E6D3] bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Δ {tr('growerReturn')}
            </p>
            <p
              className={cn(
                'mt-1 text-lg font-bold tabular-nums',
                variation.grower_return_delta >= 0 ? 'text-[#0F6E56]' : 'text-red-700',
              )}
            >
              {deltaSign(variation.grower_return_delta)}
              {formatMoney(variation.grower_return_delta)} ({deltaSign(variation.grower_return_delta_pct)}
              {variation.grower_return_delta_pct.toFixed(2)}%)
            </p>
          </div>
        </div>
      ) : null}

      {main.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {main.map((row) => (
            <ProducerCompareCard
              key={`${row.producerId ?? row.name}-main`}
              row={row}
              yearA={yearA}
              yearB={yearB}
              tr={tr}
            />
          ))}
        </div>
      ) : null}

      {rotation.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {tr('compareRotation')}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rotation.map((row) => (
              <ProducerCompareCard
                key={`${row.producerId ?? row.name}-rot`}
                row={row}
                yearA={yearA}
                yearB={yearB}
                tr={tr}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
