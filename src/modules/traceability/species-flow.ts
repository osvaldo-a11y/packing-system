/**
 * Species commercial/ops flow model (Bloque 2.5).
 * Runtime must key off flow_type / capabilities — never permanent if(codigo===BLUE|ORAN).
 */

export type SpeciesFlowType = 'PROCESSED' | 'DIRECT';

export type SpeciesQuantityBasis = 'boxes_format' | 'weight_lb';

export interface SpeciesCapabilities {
  requires_processing: boolean;
  creates_finished_product: boolean;
  uses_pt_stock: boolean;
  uses_packaging_materials: boolean;
  allows_direct_dispatch: boolean;
  uses_sales_formats: boolean;
  uses_mass_balance_packout: boolean;
  quantity_basis: SpeciesQuantityBasis;
}

const PROCESSED_CAPABILITIES: SpeciesCapabilities = {
  requires_processing: true,
  creates_finished_product: true,
  uses_pt_stock: true,
  uses_packaging_materials: true,
  allows_direct_dispatch: false,
  uses_sales_formats: true,
  uses_mass_balance_packout: true,
  quantity_basis: 'boxes_format',
};

const DIRECT_CAPABILITIES: SpeciesCapabilities = {
  requires_processing: false,
  creates_finished_product: false,
  uses_pt_stock: false,
  uses_packaging_materials: false,
  allows_direct_dispatch: true,
  uses_sales_formats: false,
  uses_mass_balance_packout: false,
  quantity_basis: 'weight_lb',
};

export function normalizeFlowType(raw: string | null | undefined): SpeciesFlowType {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  return v === 'DIRECT' ? 'DIRECT' : 'PROCESSED';
}

/** Derived defaults from flow_type. Optional overrides merge on top when provided. */
export function resolveSpeciesCapabilities(
  flowType: SpeciesFlowType | string | null | undefined,
  overrides?: Partial<SpeciesCapabilities> | null,
): SpeciesCapabilities {
  const base =
    normalizeFlowType(flowType) === 'DIRECT' ? { ...DIRECT_CAPABILITIES } : { ...PROCESSED_CAPABILITIES };
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export function serializeSpeciesWithFlow(row: {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  created_at?: Date;
  flow_type?: string | null;
}) {
  const flow_type = normalizeFlowType(row.flow_type);
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    activo: row.activo,
    created_at: row.created_at,
    flow_type,
    capabilities: resolveSpeciesCapabilities(flow_type),
  };
}
