import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeasonOverview } from '@/api/seasons';
import { formatLb } from '@/lib/number-format';
import { sectionHint, sectionTitle, tableBodyRow, tableHeaderRow, tableShell } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

type Props = {
  overview: SeasonOverview | undefined;
};

export function SeasonPhysicalBalancePanel({ overview }: Props) {
  const { t } = useTranslation('common');
  const tr = (k: string) => String(t(`reporting.season.${k}`));
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const rows = overview?.mass_balance?.by_producer ?? [];
  if (!overview?.mass_balance || rows.length === 0) return null;

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className={sectionTitle}>{tr('physicalTitle')}</h2>
        <p className={sectionHint}>{tr('physicalHint')}</p>
      </div>

      <div className={tableShell}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className={tableHeaderRow}>
                <th className="w-8 px-2 py-2" aria-hidden />
                <th className="px-3 py-2 font-medium text-slate-500">{tr('colProducer')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('physicalReceived')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('physicalProcessed')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('packout')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('waste')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('pctPackout')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('rejected')}</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">{tr('forFrozen')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expanded.has(r.producer_id);
                const showExtra = r.lb_rejected > 0 || r.lb_for_frozen > 0;
                return (
                  <Fragment key={r.producer_id}>
                    <tr className={tableBodyRow}>
                      <td className="px-2 py-2">
                        {showExtra ? (
                          <button
                            type="button"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => toggle(r.producer_id)}
                            aria-expanded={open}
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.producer_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatLb(r.lb_received)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatLb(r.lb_processed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatLb(r.lb_packout)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatLb(r.lb_waste)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pct_packout.toFixed(1)}%</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', r.lb_rejected > 0 && 'text-amber-800')}>
                        {r.lb_rejected > 0 ? formatLb(r.lb_rejected) : '—'}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', r.lb_for_frozen > 0 && 'text-sky-800')}>
                        {r.lb_for_frozen > 0 ? formatLb(r.lb_for_frozen) : '—'}
                      </td>
                    </tr>
                    {open && showExtra ? (
                      <tr className="bg-slate-50/80">
                        <td colSpan={9} className="px-4 py-2 text-xs text-slate-600">
                          {r.lb_frozen_to_frozen > 0 ? (
                            <span className="mr-4">
                              {tr('frozenToFrozen')}: <strong>{formatLb(r.lb_frozen_to_frozen)} lb</strong>
                            </span>
                          ) : null}
                          {r.receptions > 0 ? (
                            <span className="mr-4">
                              {tr('physicalReceptions')}: <strong>{r.receptions}</strong>
                            </span>
                          ) : null}
                          {r.processes > 0 ? (
                            <span>
                              {tr('physicalProcesses')}: <strong>{r.processes}</strong>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
