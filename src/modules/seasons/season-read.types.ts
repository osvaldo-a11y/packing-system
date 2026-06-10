export type SeasonDataSource = 'snapshot' | 'legacy';

export type SeasonCapabilities = {
  commercial: boolean;
  mass_balance: boolean;
  commercial_line_detail: boolean;
  /** EOD diario, tarja a tarja — solo temporada operativa con trazabilidad fina. */
  fine_traceability: boolean;
};

export type CommercialProducerRow = {
  producer_id: number | null;
  producer_name: string;
  sales: number;
  /** Legacy Final Charge: grower_return. Snapshot 2026: mapeado desde producer_net (neto tras costos). */
  grower_return: number;
  /** Solo snapshot (precio objetivo / neto productor). */
  producer_net?: number;
  boxes: number;
  pounds: number;
};

export type CommercialOverview = {
  sales: number;
  grower_return: number;
  producer_net?: number;
  boxes: number;
  pounds: number;
  by_producer: CommercialProducerRow[];
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

export type MassBalanceOverview = {
  lb_received: number;
  lb_processed: number;
  lb_packout: number;
  lb_waste: number;
  pct_packout: number;
  lb_rejected: number;
  lb_for_frozen: number;
  lb_frozen_to_frozen: number;
  by_producer: MassBalanceProducerRow[];
};

export type SeasonOverview = {
  season_year: number;
  season_status: string;
  season_source: string;
  source: SeasonDataSource;
  capabilities: SeasonCapabilities;
  commercial: CommercialOverview | null;
  mass_balance: MassBalanceOverview | null;
  /** En snapshot: producer_net es neto-tras-costos (precio objetivo). En legacy: grower_return del Final Charge. */
  commercial_field_notes?: string;
};

export type SeasonListItem = {
  season_year: number;
  label: string;
  status: string;
  source: string;
  capabilities: SeasonCapabilities;
  data_source: SeasonDataSource;
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

export type SettlementLineFilters = {
  producer?: string;
  format?: string;
  bol?: string;
  variety?: string;
  brand?: string;
};
