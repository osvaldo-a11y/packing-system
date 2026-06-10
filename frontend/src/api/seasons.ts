import { apiFetch, apiJson, downloadPdf } from '@/api';

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
  data_source: 'live' | 'snapshot' | 'legacy';
};

export type CommercialProducerRow = {
  producer_id: number | null;
  producer_name: string;
  producer_raw?: string;
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
  source: 'live' | 'snapshot' | 'legacy';
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
  source: 'live' | 'snapshot' | 'legacy';
  filters: { producer?: string; format?: string; bol?: string; variety?: string; brand?: string };
  line_count: number;
  total_count: number;
  lines: SettlementLineRow[];
};

export type SettlementLineFilters = {
  producer?: string;
  format?: string;
  bol?: string;
  variety?: string;
  brand?: string;
};

export function fetchSeasonSettlementLines(year: number, filters: SettlementLineFilters = {}) {
  const q = new URLSearchParams();
  if (filters.producer) q.set('producer', filters.producer);
  if (filters.format) q.set('format', filters.format);
  if (filters.bol) q.set('bol', filters.bol);
  if (filters.variety) q.set('variety', filters.variety);
  if (filters.brand) q.set('brand', filters.brand);
  const qs = q.toString();
  return apiJson<SettlementLinesResult>(
    `/api/seasons/${year}/settlement/lines${qs ? `?${qs}` : ''}`,
  );
}

async function downloadSeasonAttachment(path: string, fallbackFilename: string): Promise<void> {
  const res = await apiFetch(path, { method: 'GET', psSkipForbiddenRedirect: true });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 400) || `Error ${res.status}`);
  }
  const cd = res.headers.get('Content-Disposition');
  const m = cd?.match(/filename="([^"]+)"/i);
  const filename = m?.[1] ?? fallbackFilename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadSeasonSettlementXlsx(year: number) {
  return downloadSeasonAttachment(
    `/api/seasons/${year}/export/settlement.xlsx`,
    `liquidacion-historica-${year}.xlsx`,
  );
}

export function downloadSeasonMassBalanceXlsx(year: number) {
  return downloadSeasonAttachment(
    `/api/seasons/${year}/export/mass-balance.xlsx`,
    `balance-masas-historico-${year}.xlsx`,
  );
}

export function downloadSeasonSettlementPdf(year: number) {
  return downloadPdf(
    `/api/seasons/${year}/export/settlement.pdf`,
    `liquidacion-historica-${year}.pdf`,
  );
}

/** Temporada operativa por defecto: activa, o la que tenga trazabilidad fina. */
export function pickDefaultSeasonYear(seasons: SeasonListItem[]): number {
  const active = seasons.find((s) => s.status === 'active');
  if (active) return active.season_year;
  const traceable = seasons.find((s) => s.capabilities.fine_traceability);
  if (traceable) return traceable.season_year;
  return seasons[0]?.season_year ?? new Date().getFullYear();
}
