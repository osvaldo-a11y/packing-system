import { DollarSign, Scale, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SeasonOverview } from '@/api/seasons';
import { formatBoxes, formatLb, formatMoney } from '@/lib/number-format';
import { sectionHint, sectionTitle, tableBodyRow, tableHeaderRow, tableShell } from '@/lib/page-ui';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  overview: SeasonOverview | undefined;
  loading: boolean;
};

export function SeasonSummaryPanel({ overview, loading }: Props) {
  const { t } = useTranslation('common');

  if (loading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </section>
    );
  }

  if (!overview?.commercial || !overview.mass_balance) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
        {t('reporting.season.noData')}
      </section>
    );
  }

  const { commercial, mass_balance: mb } = overview;
  const supportMetrics = [
    { key: 'boxes', label: t('reporting.season.boxes'), value: formatBoxes(commercial.boxes), show: commercial.boxes > 0 },
    { key: 'pounds', label: t('reporting.season.pounds'), value: `${formatLb(commercial.pounds)} lb`, show: commercial.pounds > 0 },
    { key: 'rejected', label: t('reporting.season.rejected'), value: `${formatLb(mb.lb_rejected)} lb`, show: mb.lb_rejected > 0 },
    { key: 'frozen', label: t('reporting.season.forFrozen'), value: `${formatLb(mb.lb_for_frozen)} lb`, show: mb.lb_for_frozen > 0 },
  ].filter((m) => m.show);

  const rows = commercial.by_producer.map((cp) => {
    const phys = mb.by_producer.find((p) => p.producer_id === cp.producer_id);
    return {
      id: cp.producer_id ?? cp.producer_name,
      name: cp.producer_name,
      sales: cp.sales,
      grower_return: cp.grower_return,
      lb_packout: phys?.lb_packout ?? 0,
      pct_packout: phys?.pct_packout ?? 0,
    };
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className={sectionTitle}>
          {t('reporting.season.summaryTitle', { year: overview.season_year })}
        </h2>
        <p className={sectionHint}>
          {overview.source === 'live'
            ? t('reporting.season.sourceLive')
            : overview.source === 'snapshot'
              ? t('reporting.season.sourceSnapshot')
              : t('reporting.season.sourceLegacy')}
          {overview.commercial_field_notes ? ` · ${overview.commercial_field_notes}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#A6E6D3] bg-gradient-to-br from-[#E7F7F1] to-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#0F6E56]">
            <DollarSign className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
              {t('reporting.season.sales')}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#0F6E56] sm:text-3xl">
            {formatMoney(commercial.sales)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#A6E6D3] bg-gradient-to-br from-[#E7F7F1] to-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#0F6E56]">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
              {t('reporting.season.growerReturn')}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#0F6E56] sm:text-3xl">
            {formatMoney(commercial.grower_return)}
          </p>
          {commercial.producer_net != null && (overview.source === 'snapshot' || overview.source === 'live') ? (
            <p className="mt-1 text-[10px] text-[#0F6E56]/80">{t('reporting.season.producerNetNote')}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('reporting.season.packout')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatLb(mb.lb_packout)} lb</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('reporting.season.waste')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatLb(mb.lb_waste)} lb</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('reporting.season.pctPackout')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{mb.pct_packout.toFixed(1)}%</p>
        </div>
      </div>

      {supportMetrics.length > 0 ? (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {supportMetrics.map((m) => (
            <span key={m.key} className="rounded-full border border-slate-200 bg-white px-3 py-1">
              <Scale className="mr-1 inline h-3 w-3 text-slate-400" />
              {m.label}: <strong className="font-semibold text-slate-800">{m.value}</strong>
            </span>
          ))}
        </div>
      ) : null}

      <div className={tableShell}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className={tableHeaderRow}>
                <th className="px-4 py-3 font-medium text-slate-500">{t('reporting.season.colProducer')}</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">{t('reporting.season.colSales')}</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">{t('reporting.season.colGrower')}</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">{t('reporting.season.colPackout')}</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">% pkout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className={tableBodyRow}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.sales)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.grower_return)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatLb(r.lb_packout)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.pct_packout.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
