import { apiJson } from '@/api';

export type SeasonCapabilities = {
  commercial: boolean;
  mass_balance: boolean;
  commercial_line_detail: boolean;
  fine_traceability: boolean;
};

export type SeasonListItem = {
  season_year: number;
  label: string;
  status: string;
  source: string;
  capabilities: SeasonCapabilities;
  data_source: 'snapshot' | 'legacy';
};

export type CommercialProducerRow = {
  producer_id: number | null;
  producer_name: string;
  sales: number;
  grower_return: number;
  producer_net?: number;
  boxes: number;
  pounds: number;
};

export type MassBalanceProducerRow = {
  producer_id: number;
  producer_name: string;
  receptions: number;
  lb_received: number;
  lb_rejected: number;
  lb_for_frozen: number;
  lb_frozen_to_frozen: number;
  processes: number;
  lb_processed: number;
  lb_packout: number;
  lb_waste: number;
  pct_packout: number;
  lb_invoiced: number;
  difference: number;
};

export type SeasonOverview = {
  season_year: number;
  season_status: string;
  season_source: string;
  source: 'snapshot' | 'legacy';
  capabilities: SeasonCapabilities;
  commercial: {
    sales: number;
    grower_return: number;
    producer_net?: number;
    boxes: number;
    pounds: number;
    by_producer: CommercialProducerRow[];
  } | null;
  mass_balance: {
    lb_received: number;
    lb_processed: number;
    lb_packout: number;
    lb_waste: number;
    pct_packout: number;
    lb_rejected: number;
    lb_for_frozen: number;
    lb_frozen_to_frozen: number;
    by_producer: MassBalanceProducerRow[];
  } | null;
  commercial_field_notes?: string;
};

export type YearOverYearVariation = {
  from_year: number;
  to_year: number;
  sales_delta: number;
  sales_delta_pct: number;
  grower_return_delta: number;
  grower_return_delta_pct: number;
};

export type SeasonCompareResult = {
  years: number[];
  overviews: SeasonOverview[];
  variations: YearOverYearVariation[];
};

export function fetchSeasonList() {
  return apiJson<SeasonListItem[]>('/api/seasons');
}

export function fetchSeasonOverview(year: number) {
  return apiJson<SeasonOverview>(`/api/seasons/${year}/overview`);
}

export function fetchSeasonCompare(years: string) {
  return apiJson<SeasonCompareResult>(`/api/seasons/compare?years=${encodeURIComponent(years)}`);
}

/** Temporada operativa por defecto: activa, o la que tenga trazabilidad fina. */
export function pickDefaultSeasonYear(seasons: SeasonListItem[]): number {
  const active = seasons.find((s) => s.status === 'active');
  if (active) return active.season_year;
  const traceable = seasons.find((s) => s.capabilities.fine_traceability);
  if (traceable) return traceable.season_year;
  return seasons[0]?.season_year ?? new Date().getFullYear();
}
