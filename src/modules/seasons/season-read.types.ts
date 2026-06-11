export type SeasonDataSource = 'live' | 'snapshot' | 'legacy';

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
  /** Texto importado (auditoría); no usar para agrupar ni mostrar. */
  producer_raw?: string;
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

export type SettlementLineRow = {
  id: number;
  producer_id: number;
  producer_name: string;
  producer_raw: string | null;
  brand_raw: string | null;
  variety_raw: string | null;
  format_code: string | null;
  format_raw: string | null;
  ship_date: string | null;
  bol: string | null;
  pallet_ref: string | null;
  boxes: number;
  pounds: number;
  unit_price: number;
  revenue: number;
  grower_return: number;
  source_row_no: number | null;
};

export type SettlementLinesResult = {
  season_year: number;
  source: SeasonDataSource;
  filters: SettlementLineFilters;
  line_count: number;
  total_count: number;
  lines: SettlementLineRow[];
};

export type ReceptionExportLine = {
  producer_id: number;
  producer_name: string;
  reception_date: string;
  variety: string | null;
  quality: 'FRESH' | 'WASTE' | 'FOR_FROZEN';
  incoming_no: string | null;
  trays: number | null;
  quantity: number | null;
  net_lb: number;
  gross_lb: number | null;
  fruit_type: 'hand' | 'machine' | null;
};

export type ProcessExportLine = {
  producer_id: number;
  producer_name: string;
  process_date: string;
  op: string | null;
  variety: string | null;
  format_code: string | null;
  lb_total: number;
  lb_fresh: number;
  lb_waste: number;
  boxes: number | null;
  fruit_type: 'hand' | 'machine' | null;
};

export type DispatchExportGroup = {
  bol: string;
  ship_date: string | null;
  producers: string;
  boxes: number;
  pounds: number;
  revenue: number;
};
