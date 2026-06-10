import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeasonCompareResult, SeasonOverview } from '@/api/seasons';
import { formatMoney } from '@/lib/number-format';
import { sectionHint, sectionTitle } from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  yearA: number;
  yearB: number;
  data: SeasonCompareResult | undefined;
  loading: boolean;
};

type ProducerCompareRow = {
  producerId: number | null;
  name: string;
  salesA: number;
  salesB: number;
  growerA: number;
  growerB: number;
};

function producerMergeKey(producerId: number | null, producerName: string): string {
  if (producerId != null && Number.isFinite(producerId)) return `id:${producerId}`;
  return `name:${producerName.trim().toUpperCase()}`;
}

function buildProducerRows(a: SeasonOverview, b: SeasonOverview): ProducerCompareRow[] {
  const map = new Map<string, ProducerCompareRow>();
  for (const p of a.commercial?.by_producer ?? []) {
    const key = producerMergeKey(p.producer_id, p.producer_name);
    map.set(key, {
      producerId: p.producer_id,
      name: p.producer_name,
      salesA: p.sales,
      salesB: 0,
      growerA: p.grower_return,
      growerB: 0,
    });
  }
  for (const p of b.commercial?.by_producer ?? []) {
    const key = producerMergeKey(p.producer_id, p.producer_name);
    const row = map.get(key) ?? {
      producerId: p.producer_id,
      name: p.producer_name,
      salesA: 0,
      salesB: 0,
      growerA: 0,
      growerB: 0,
    };
    row.name = p.producer_name || row.name;
    row.salesB = p.sales;
    row.growerB = p.grower_return;
    map.set(key, row);
  }
  return [...map.values()].sort(
    (x, y) => Math.max(y.salesA, y.salesB) - Math.max(x.salesA, x.salesB),
  );
}

function CompareBars({
  rows,
  yearA,
  yearB,
  field,
  formatValue,
}: {
  rows: ProducerCompareRow[];
  yearA: number;
  yearB: number;
  field: 'sales' | 'grower';
  formatValue: (n: number) => string;
}) {
  const max = Math.max(
    ...rows.flatMap((r) => [field === 'sales' ? r.salesA : r.growerA, field === 'sales' ? r.salesB : r.growerB]),
    1,
  );

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const valA = field === 'sales' ? r.salesA : r.growerA;
        const valB = field === 'sales' ? r.salesB : r.growerB;
        const pctA = (valA / max) * 100;
        const pctB = (valB / max) * 100;
        return (
          <div key={`${r.producerId ?? r.name}-${field}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
            <p className="mb-2 truncate text-sm font-medium text-slate-800">{r.name}</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] font-medium text-slate-500">{yearA}</span>
                <div className="min-w-0 flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#1D9E75]"
                      style={{ width: `${pctA}%` }}
                    />
                  </div>
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-700">
                  {valA > 0 ? formatValue(valA) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] font-medium text-slate-500">{yearB}</span>
                <div className="min-w-0 flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${pctB}%` }}
                    />
                  </div>
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-700">
                  {valB > 0 ? formatValue(valB) : '—'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SeasonComparePanel({ yearA, yearB, data, loading }: Props) {
  const { t } = useTranslation('common');

  const overviewA = data?.overviews.find((o) => o.season_year === yearA);
  const overviewB = data?.overviews.find((o) => o.season_year === yearB);
  const variation = data?.variations.find((v) => v.from_year === Math.min(yearA, yearB) && v.to_year === Math.max(yearA, yearB))
    ?? data?.variations.find((v) => v.from_year === yearA && v.to_year === yearB);

  const rows = useMemo(() => {
    if (!overviewA || !overviewB) return [];
    return buildProducerRows(overviewA, overviewB);
  }, [overviewA, overviewB]);

  if (loading) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  if (!overviewA || !overviewB) {
    return (
      <p className="text-sm text-slate-500">{t('reporting.season.compareNoData')}</p>
    );
  }

  const deltaSign = (n: number) => (n > 0 ? '+' : '');

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
      <div>
        <h2 className={sectionTitle}>{t('reporting.season.compareTitle', { yearA, yearB })}</h2>
        <p className={sectionHint}>{t('reporting.season.compareHint')}</p>
      </div>

      {variation ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#A6E6D3] bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Δ {t('reporting.season.sales')}</p>
            <p className={cn('mt-1 text-lg font-bold tabular-nums', variation.sales_delta >= 0 ? 'text-[#0F6E56]' : 'text-red-700')}>
              {deltaSign(variation.sales_delta)}
              {formatMoney(variation.sales_delta)} ({deltaSign(variation.sales_delta_pct)}
              {variation.sales_delta_pct.toFixed(2)}%)
            </p>
          </div>
          <div className="rounded-xl border border-[#A6E6D3] bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Δ {t('reporting.season.growerReturn')}</p>
            <p className={cn('mt-1 text-lg font-bold tabular-nums', variation.grower_return_delta >= 0 ? 'text-[#0F6E56]' : 'text-red-700')}>
              {deltaSign(variation.grower_return_delta)}
              {formatMoney(variation.grower_return_delta)} ({deltaSign(variation.grower_return_delta_pct)}
              {variation.grower_return_delta_pct.toFixed(2)}%)
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('reporting.season.compareSales')}</h3>
        <CompareBars rows={rows} yearA={yearA} yearB={yearB} field="sales" formatValue={formatMoney} />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('reporting.season.compareGrower')}</h3>
        <CompareBars rows={rows} yearA={yearA} yearB={yearB} field="grower" formatValue={formatMoney} />
      </div>
    </section>
  );
}
