import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchSeasonCompare,
  fetchSeasonList,
  fetchSeasonOverview,
  pickDefaultSeasonYear,
} from '@/api/seasons';
import { SeasonComparePanel } from '@/components/dashboard/SeasonComparePanel';
import { SeasonSummaryPanel } from '@/components/dashboard/SeasonSummaryPanel';
import { cn } from '@/lib/utils';

export function SeasonReportingSection() {
  const { t } = useTranslation('common');
  const tr = (k: string, opts?: Record<string, unknown>) =>
    String(t(`reporting.season.${k}`, opts as never));

  const [seasonYear, setSeasonYear] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYearB, setCompareYearB] = useState<number | null>(null);

  const { data: seasonList } = useQuery({
    queryKey: ['seasons', 'list'],
    queryFn: fetchSeasonList,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (!seasonList?.length || seasonYear != null) return;
    setSeasonYear(pickDefaultSeasonYear(seasonList));
  }, [seasonList, seasonYear]);

  useEffect(() => {
    if (!seasonList?.length || seasonYear == null) return;
    if (compareYearB != null && seasonList.some((s) => s.season_year === compareYearB)) return;
    const alt = seasonList.find((s) => s.season_year !== seasonYear);
    if (alt) setCompareYearB(alt.season_year);
  }, [seasonList, seasonYear, compareYearB]);

  const selectedSeasonMeta = seasonList?.find((s) => s.season_year === seasonYear);
  const fineTraceability = selectedSeasonMeta?.capabilities.fine_traceability ?? false;

  const { data: seasonOverview, isLoading: seasonOverviewLoading } = useQuery({
    queryKey: ['seasons', 'overview', seasonYear],
    queryFn: () => fetchSeasonOverview(seasonYear!),
    enabled: seasonYear != null,
    staleTime: 120_000,
  });

  const compareYearsKey =
    compareMode && seasonYear != null && compareYearB != null
      ? `${Math.min(seasonYear, compareYearB)},${Math.max(seasonYear, compareYearB)}`
      : null;

  const { data: seasonCompare, isLoading: seasonCompareLoading } = useQuery({
    queryKey: ['seasons', 'compare', compareYearsKey],
    queryFn: () => fetchSeasonCompare(compareYearsKey!),
    enabled: compareYearsKey != null,
    staleTime: 120_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <select
          className="h-8 min-w-[7.5rem] rounded-full border border-[#1D9E75] bg-[#E7F7F1] px-3 py-1 text-xs font-medium text-[#0F6E56] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/40"
          value={seasonYear ?? ''}
          onChange={(e) => setSeasonYear(Number(e.target.value))}
          disabled={!seasonList?.length}
        >
          {(seasonList ?? []).map((s) => (
            <option key={s.season_year} value={s.season_year}>
              {s.label || s.season_year}
            </option>
          ))}
        </select>
        <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs font-medium">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={compareMode}
            onChange={(e) => setCompareMode(e.target.checked)}
          />
          {tr('compareToggle')}
        </label>
        {compareMode ? (
          <select
            className="h-8 min-w-[7rem] rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground shadow-sm"
            value={compareYearB ?? ''}
            onChange={(e) => setCompareYearB(Number(e.target.value))}
          >
            {(seasonList ?? [])
              .filter((s) => s.season_year !== seasonYear)
              .map((s) => (
                <option key={s.season_year} value={s.season_year}>
                  {s.label || s.season_year}
                </option>
              ))}
          </select>
        ) : null}
        {selectedSeasonMeta ? (
          <span
            className={cn(
              'ml-auto text-[11px] font-medium',
              fineTraceability ? 'text-[#0F6E56]' : 'text-slate-500',
            )}
          >
            {fineTraceability ? tr('sourceSnapshot') : tr('sourceLegacy')}
          </span>
        ) : null}
      </div>

      {!fineTraceability && seasonYear != null ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900/90">
          {tr('legacyNotice')}
        </p>
      ) : null}

      {compareMode && seasonYear != null && compareYearB != null ? (
        <SeasonComparePanel
          yearA={seasonYear}
          yearB={compareYearB}
          data={seasonCompare}
          loading={seasonCompareLoading}
        />
      ) : (
        <SeasonSummaryPanel overview={seasonOverview} loading={seasonOverviewLoading} />
      )}
    </div>
  );
}
