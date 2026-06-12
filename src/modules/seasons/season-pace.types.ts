export type PaceMetricKey = 'received_lb' | 'packout_lb' | 'sold_usd' | 'boxes';

export type PaceWeekPoint = {
  week_index: number;
  received_lb: number;
  packout_lb: number;
  sold_usd: number;
  boxes: number;
};

export type PaceSeasonSeries = {
  season_year: number;
  day1: string;
  week_count: number;
  weeks: PaceWeekPoint[];
  totals: {
    received_lb: number;
    packout_lb: number;
    sold_usd: number;
    boxes: number;
  };
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
  current_week: number;
  active: PaceSeasonSeries;
  previous: PaceSeasonSeries;
  comparisons: PaceMetricComparison[];
};
