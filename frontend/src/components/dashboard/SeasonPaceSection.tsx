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
  type PaceIsoWeekPoint,
  type PaceMetricComparison,
  type PaceMetricKey,
  type PaceSeasonSeries,
  type SeasonPaceResult,
} from '@/api/seasonPace';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/number-format';
import { cn } from '@/lib/utils';

const METRICS: PaceMetricKey[] = ['received_lb', 'packout_lb', 'sold_usd', 'boxes'];
type ChartView = 'weekly' | 'cumulative';

function metricFromPoint(
  point: PaceIsoWeekPoint | undefined,
  metric: PaceMetricKey,
  view: ChartView,
): number | null {
  if (!point) return null;
  return view === 'weekly' ? point.weekly[metric] : point.cumulative[metric];
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
  iso_week: number;
  active: number | null;
  previous: number | null;
  projection: number | null;
  labelActive?: string;
  labelPrevious?: string;
  labelProjection?: string;
};

function findWeek(series: PaceSeasonSeries, isoWeek: number): PaceIsoWeekPoint | undefined {
  return series.weeks.find((w) => w.iso_week === isoWeek);
}

/** Dominio del eje X: rango con datos ±1 semana (sin extender a la semana ISO calendario actual). */
function chartIsoDomain(data: SeasonPaceResult): { min: number; max: number } {
  const margin = 1;
  const min = Math.max(1, data.iso_week_min - margin);
  const max = data.iso_week_max + margin;
  return { min, max };
}

function buildChartRows(
  data: SeasonPaceResult,
  metric: PaceMetricKey,
  view: ChartView,
  locale: string,
): ChartRow[] {
  const { active, previous, current_iso_week: currentIso } = data;
  const { min: minW, max: maxW } = chartIsoDomain(data);

  const activeAtCurrent = metricFromPoint(findWeek(active, currentIso), metric, 'cumulative');
  const prevAtCurrent = metricFromPoint(findWeek(previous, currentIso), metric, 'cumulative');

  const rows: ChartRow[] = [];
  for (let w = minW; w <= maxW; w++) {
    const a = metricFromPoint(findWeek(active, w), metric, view);
    const p = metricFromPoint(findWeek(previous, w), metric, view);

    let projection: number | null = null;
    if (
      view === 'cumulative' &&
      w >= currentIso &&
      activeAtCurrent != null &&
      prevAtCurrent != null &&
      prevAtCurrent > 0
    ) {
      const prevAtW =
        metricFromPoint(findWeek(previous, w), metric, 'cumulative') ?? previous.totals[metric];
      projection = Number((activeAtCurrent * (prevAtW / prevAtCurrent)).toFixed(2));
    }

    const row: ChartRow = { iso_week: w, active: a, previous: p, projection };
    if (view === 'cumulative' && w === currentIso && a != null) {
      row.labelActive = formatMetricValue(metric, a, locale);
    }
    if (w === maxW && p != null) {
      row.labelPrevious = formatMetricValue(metric, p, locale);
    }
    if (view === 'cumulative' && w === maxW && projection != null) {
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
  const [chartView, setChartView] = useState<ChartView>('weekly');

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
  const vsPriorLabel = tr('vsPriorIso');

  const chartDomain = useMemo(() => (data ? chartIsoDomain(data) : null), [data]);

  const chartRows = useMemo(
    () => (data ? buildChartRows(data, metric, chartView, locale) : []),
    [data, metric, chartView, locale],
  );

  const xTicks = useMemo(() => {
    if (!chartDomain) return [];
    const n = chartDomain.max - chartDomain.min + 1;
    if (n > 18) {
      const step = Math.ceil(n / 12);
      const ticks: number[] = [];
      for (let w = chartDomain.min; w <= chartDomain.max; w += step) ticks.push(w);
      if (ticks[ticks.length - 1] !== chartDomain.max) ticks.push(chartDomain.max);
      return ticks;
    }
    return Array.from({ length: n }, (_, i) => chartDomain.min + i);
  }, [chartDomain]);

  if (!enabled) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{tr('title')}</h2>
        <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
          {data
            ? tr('subtitleIso', {
                active: data.active_year,
                previous: data.previous_year,
                activeIso: data.active.start_iso_week,
                activeDay1: data.active.day1,
                prevIso: data.previous.start_iso_week,
                prevDay1: data.previous.day1,
                currentIso: data.current_iso_week,
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
              <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setChartView('weekly')}
                  className={cn(
                    'h-7 rounded-full px-3 text-xs font-medium transition-colors',
                    chartView === 'weekly'
                      ? 'bg-white text-[#0F6E56] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {tr('viewWeekly')}
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('cumulative')}
                  className={cn(
                    'h-7 rounded-full px-3 text-xs font-medium transition-colors',
                    chartView === 'cumulative'
                      ? 'bg-white text-[#0F6E56] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {tr('viewCumulative')}
                </button>
              </div>
              <span className="hidden h-5 border-l border-slate-200 sm:block" aria-hidden />
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
                    type="number"
                    dataKey="iso_week"
                    domain={chartDomain ? [chartDomain.min, chartDomain.max] : undefined}
                    allowDataOverflow
                    ticks={xTicks}
                    tick={{ fontSize: 11 }}
                    label={{
                      value: tr('isoWeekAxis'),
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
                        : `${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatMetricValue(metric, Number(value ?? 0), locale),
                      '',
                    ]}
                    labelFormatter={(w) => tr('isoWeekTooltip', { week: w })}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartDomain &&
                  data.current_iso_week >= chartDomain.min &&
                  data.current_iso_week <= chartDomain.max ? (
                    <ReferenceLine
                      x={data.current_iso_week}
                      stroke="#1D9E75"
                      strokeDasharray="4 4"
                      label={{
                        value: tr('currentIsoWeek'),
                        position: 'insideTopLeft',
                        fontSize: 10,
                        fill: '#0F6E56',
                      }}
                    />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="active"
                    name={tr('seriesActive', { year: data.active_year })}
                    stroke="#0F6E56"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  >
                    {chartView === 'cumulative' ? (
                      <LabelList dataKey="labelActive" position="top" fontSize={10} fill="#0F6E56" />
                    ) : null}
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
                  {chartView === 'cumulative' ? (
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
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
