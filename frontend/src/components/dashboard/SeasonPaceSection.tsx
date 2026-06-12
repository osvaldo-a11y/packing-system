import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchSeasonPace,
  type PaceMetricComparison,
  type PaceMetricKey,
  type PaceWeekPoint,
  type SeasonPaceResult,
} from '@/api/seasonPace';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/number-format';
import { cn } from '@/lib/utils';

const METRICS: PaceMetricKey[] = ['received_lb', 'packout_lb', 'sold_usd', 'boxes'];

function metricValue(week: PaceWeekPoint | undefined, metric: PaceMetricKey): number | null {
  if (!week) return null;
  return week[metric];
}

function formatMetricValue(metric: PaceMetricKey, value: number, locale: string): string {
  if (metric === 'sold_usd') return `$${formatMoney(value)}`;
  if (metric === 'boxes') return value.toLocaleString(locale);
  return `${value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} lb`;
}

function deltaTone(delta: number): string {
  if (delta > 0) return 'text-[#0F6E56]';
  if (delta < 0) return 'text-[#B32F2F]';
  return 'text-slate-600';
}

type ChartRow = {
  week: number;
  active: number | null;
  previous: number | null;
  projection: number | null;
  labelActive?: string;
  labelPrevious?: string;
  labelProjection?: string;
};

function buildChartRows(
  data: SeasonPaceResult,
  metric: PaceMetricKey,
  locale: string,
): ChartRow[] {
  const { active, previous, current_week: currentWeek } = data;
  const maxWeek = Math.max(active.week_count, previous.week_count, currentWeek);

  const activeAtCurrent = metricValue(
    active.weeks.find((w) => w.week_index === currentWeek),
    metric,
  );
  const prevAtCurrent = metricValue(
    previous.weeks.find((w) => w.week_index === currentWeek),
    metric,
  );

  const rows: ChartRow[] = [];
  for (let w = 1; w <= maxWeek; w++) {
    const a = metricValue(active.weeks.find((p) => p.week_index === w), metric);
    const p = metricValue(previous.weeks.find((p) => p.week_index === w), metric);

    let projection: number | null = null;
    if (
      w >= currentWeek &&
      activeAtCurrent != null &&
      prevAtCurrent != null &&
      prevAtCurrent > 0
    ) {
      const prevAtW =
        metricValue(previous.weeks.find((x) => x.week_index === w), metric) ??
        previous.totals[metric];
      projection = Number((activeAtCurrent * (prevAtW / prevAtCurrent)).toFixed(2));
    }

    const row: ChartRow = { week: w, active: a, previous: p, projection };
    if (w === currentWeek && a != null) {
      row.labelActive = formatMetricValue(metric, a, locale);
    }
    if (w === maxWeek && p != null) {
      row.labelPrevious = formatMetricValue(metric, p, locale);
    }
    if (w === maxWeek && projection != null) {
      row.labelProjection = formatMetricValue(metric, projection, locale);
    }
    rows.push(row);
  }
  return rows;
}

function MetricCard({
  metric,
  comparison,
  locale,
  labels,
  vsPriorLabel,
}: {
  metric: PaceMetricKey;
  comparison: PaceMetricComparison | undefined;
  locale: string;
  labels: Record<PaceMetricKey, string>;
  vsPriorLabel: string;
}) {
  const active = comparison?.active_value ?? 0;
  const delta = comparison?.delta_abs ?? 0;
  const deltaPct = comparison?.delta_pct;

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
        {labels[metric]}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
        {formatMetricValue(metric, active, locale)}
      </p>
      <p className={cn('mt-1.5 text-xs font-medium tabular-nums sm:text-sm', deltaTone(delta))}>
        {delta >= 0 ? '+' : ''}
        {formatMetricValue(metric, Math.abs(delta), locale).replace(/^-/, '')}
        {deltaPct != null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}
        <span className="ml-1 font-normal text-slate-500">{vsPriorLabel}</span>
      </p>
    </article>
  );
}

export function SeasonPaceSection({ enabled }: { enabled: boolean }) {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'es-AR';
  const tr = (k: string, opts?: Record<string, unknown>) =>
    String(t(`dashboard.pace.${k}`, opts as never));

  const [metric, setMetric] = useState<PaceMetricKey>('received_lb');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['seasons', 'pace'],
    queryFn: fetchSeasonPace,
    enabled,
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const metricLabels = useMemo<Record<PaceMetricKey, string>>(
    () => ({
      received_lb: tr('received'),
      packout_lb: tr('packout'),
      sold_usd: tr('sold'),
      boxes: tr('boxes'),
    }),
    [t, i18n.language],
  );
  const vsPriorLabel = tr('vsPrior');

  const chartRows = useMemo(
    () => (data ? buildChartRows(data, metric, locale) : []),
    [data, metric, locale],
  );

  if (!enabled) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{tr('title')}</h2>
        <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
          {data
            ? tr('subtitle', {
                active: data.active_year,
                previous: data.previous_year,
                week: data.current_week,
                day1: data.active.day1,
                prevDay1: data.previous.day1,
              })
            : tr('subtitleLoading')}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : isError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
          {error instanceof Error ? error.message : tr('loadError')}
        </p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {METRICS.map((m) => (
              <MetricCard
                key={m}
                metric={m}
                comparison={data.comparisons.find((c: PaceMetricComparison) => c.metric === m)}
                locale={locale}
                labels={metricLabels}
                vsPriorLabel={vsPriorLabel}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {tr('chartMetric')}
              </span>
              {METRICS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                    metric === m
                      ? 'border-[#1D9E75] bg-[#E7F7F1] text-[#0F6E56]'
                      : 'border-border bg-background text-foreground hover:bg-muted/60',
                  )}
                >
                  {metricLabels[m]}
                </button>
              ))}
            </div>

            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: tr('weekAxis'),
                      position: 'insideBottom',
                      offset: -2,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      metric === 'sold_usd'
                        ? `$${(v / 1000).toFixed(0)}k`
                        : metric === 'boxes'
                          ? `${(v / 1000).toFixed(0)}k`
                          : `${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatMetricValue(metric, Number(value ?? 0), locale),
                      '',
                    ]}
                    labelFormatter={(w) => tr('weekTooltip', { week: w })}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine
                    x={data.current_week}
                    stroke="#1D9E75"
                    strokeDasharray="4 4"
                    label={{
                      value: tr('currentWeek'),
                      position: 'insideTopLeft',
                      fontSize: 10,
                      fill: '#0F6E56',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="active"
                    name={tr('seriesActive', { year: data.active_year })}
                    stroke="#0F6E56"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  >
                    <LabelList
                      dataKey="labelActive"
                      position="top"
                      fontSize={10}
                      fill="#0F6E56"
                    />
                  </Line>
                  <Line
                    type="monotone"
                    dataKey="previous"
                    name={tr('seriesPrevious', { year: data.previous_year })}
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                  >
                    <LabelList
                      dataKey="labelPrevious"
                      position="bottom"
                      fontSize={10}
                      fill="#64748b"
                    />
                  </Line>
                  <Line
                    type="monotone"
                    dataKey="projection"
                    name={tr('seriesProjection')}
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  >
                    <LabelList
                      dataKey="labelProjection"
                      position="top"
                      fontSize={10}
                      fill="#6366f1"
                    />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
