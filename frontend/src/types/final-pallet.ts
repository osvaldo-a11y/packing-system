/** Respuesta de `GET /api/final-pallets` (p. ej. Despachos). */
export type FinalPalletApi = {
  id: number;
  status: string;
  species_id: number | null;
  species_nombre?: string;
  quality_grade_id: number | null;
  quality_nombre?: string;
  corner_board_code: string;
  clamshell_label: string;
  brand_id: number | null;
  brand_nombre?: string | null;
  dispatch_unit: string;
  packing_type: string;
  market: string;
  bol: string | null;
  planned_sales_order_id?: number | null;
  planned_order_number?: string | null;
  client_id: number | null;
  client_nombre?: string | null;
  fruit_quality_mode: string;
  presentation_format_id: number | null;
  format_code?: string | null;
  max_boxes_per_pallet?: number | null;
  net_weight_lb_per_box?: number | null;
  lines: Array<{
    id: number;
    fruit_process_id: number | null;
    fecha: string;
    ref_text: string | null;
    variety_id: number;
    variety_nombre?: string;
    caliber: string | null;
    amount: number;
    pounds: string;
    net_lb: string | null;
  }>;
  totals: { amount: number; pounds: number };
  dispatch_id?: number | null;
  /** Packing list PT que reservó el pallet (BOL documental suele vivir en el PL). */
  pt_packing_list_id?: number | null;
  codigo_unidad_pt_display?: string;
  tag_code?: string | null;
  trazabilidad_pt?: 'unica' | 'varias' | 'sin_trazabilidad';
};
