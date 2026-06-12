export type PaceMetricKey = 'received_lb' | 'packout_lb' | 'sold_usd' | 'boxes';

export type PaceMetricBlock = {
  received_lb: number;
  packout_lb: number;
  sold_usd: number;
  boxes: number;
};

export type PaceIsoWeekPoint = {
  iso_week: number;
  weekly: PaceMetricBlock;
  cumulative: PaceMetricBlock;
};

export type PaceSeasonSeries = {
  season_year: number;
  day1: string;
  start_iso_week: number;
  weeks: PaceIsoWeekPoint[];
  totals: PaceMetricBlock;
};

export type PaceMetricComparison = {
  metric: PaceMetricKey;
  active_value: number;
  previous_value: number;
  delta_abs: number;
  delta_pct: number | null;
  projected_final: number | null;
};

export type SeasonPaceResult = {
  active_year: number;
  previous_year: number;
  current_iso_week: number;
  iso_week_min: number;
  iso_week_max: number;
  active: PaceSeasonSeries;
  previous: PaceSeasonSeries;
  comparisons: PaceMetricComparison[];
};
