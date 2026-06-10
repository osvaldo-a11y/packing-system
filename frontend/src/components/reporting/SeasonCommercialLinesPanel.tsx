import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchSeasonSettlementLines, type SettlementLinesResult } from '@/api/seasons';
import { formatLb, formatMoney } from '@/lib/number-format';
import { filterInputClass, filterLabel, sectionHint, sectionTitle, tableBodyRow, tableHeaderRow, tableShell } from '@/lib/page-ui';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  year: number;
  enabled: boolean;
};

export function SeasonCommercialLinesPanel({ year, enabled }: Props) {
  const { t } = useTranslation('common');
  const tr = (k: string, opts?: Record<string, unknown>) =>
    String(t(`reporting.season.${k}`, opts as never));

  const [producer, setProducer] = useState('');
  const [format, setFormat] = useState('');
  const [bol, setBol] = useState('');

  const filters = useMemo(
    () => ({
      producer: producer.trim() || undefined,
      format: format.trim() || undefined,
      bol: bol.trim() || undefined,
    }),
    [producer, format, bol],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['seasons', 'settlement-lines', year, filters],
    queryFn: () => fetchSeasonSettlementLines(year, filters),
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className={sectionTitle}>{tr('linesTitle')}</h2>
        <p className={sectionHint}>{tr('linesHint')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label className={filterLabel} htmlFor="season-line-producer">{tr('filterProducer')}</label>
          <Input
            id="season-line-producer"
            className={filterInputClass}
            value={producer}
            onChange={(e) => setProducer(e.target.value)}
            placeholder={tr('filterProducerPh')}
          />
        </div>
        <div className="grid gap-1">
          <label className={filterLabel} htmlFor="season-line-format">{tr('filterFormat')}</label>
          <Input
            id="season-line-format"
            className={filterInputClass}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder={tr('filterFormatPh')}
          />
        </div>
        <div className="grid gap-1">
          <label className={filterLabel} htmlFor="season-line-bol">{tr('filterBol')}</label>
          <Input
            id="season-line-bol"
            className={filterInputClass}
            value={bol}
            onChange={(e) => setBol(e.target.value)}
            placeholder={tr('filterBolPh')}
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {tr('linesCount', {
              shown: data?.line_count ?? 0,
              total: data?.total_count ?? 0,
            })}
            {isFetching && !isLoading ? ` · ${tr('linesRefreshing')}` : ''}
          </p>
          <LinesTable data={data} tr={tr} />
        </>
      )}
    </section>
  );
}

function LinesTable({
  data,
  tr,
}: {
  data: SettlementLinesResult | undefined;
  tr: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const lines = data?.lines ?? [];
  if (!lines.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        {tr('linesEmpty')}
      </p>
    );
  }

  return (
    <div className={tableShell}>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className={tableHeaderRow}>
              <th className="px-3 py-2 font-medium text-slate-500">{tr('colProducer')}</th>
              <th className="px-3 py-2 font-medium text-slate-500">{tr('colBol')}</th>
              <th className="px-3 py-2 font-medium text-slate-500">{tr('colFormat')}</th>
              <th className="px-3 py-2 font-medium text-slate-500">{tr('colVariety')}</th>
              <th className="px-3 py-2 font-medium text-slate-500">{tr('colBrand')}</th>
              <th className="px-3 py-2 font-medium text-slate-500">{tr('colDate')}</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('boxes')}</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('pounds')}</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('colUnitPrice')}</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('colSales')}</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('colGrower')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={tableBodyRow}>
                <td className="px-3 py-2 font-medium text-slate-800">{l.producer_name}</td>
                <td className="px-3 py-2 text-slate-600">{l.bol ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{l.format_code ?? l.format_raw ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{l.variety_raw ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{l.brand_raw ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{l.ship_date ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.boxes.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatLb(l.pounds)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.unit_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.grower_return)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
