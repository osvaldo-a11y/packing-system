/**
 * Bloque 2.5A — Species flow discriminator.
 * Runtime keys off flow_type / derived capabilities — never permanent if(codigo===BLUE|ORAN).
 */

export const SPECIES_FLOW_TYPES = ['PROCESSED', 'DIRECT'] as const;
export type SpeciesFlowType = (typeof SPECIES_FLOW_TYPES)[number];

export type SpeciesQuantityBasis = 'PT_FORMAT' | 'RAW_WEIGHT';

export type SpeciesCapabilities = {
  requires_processing: boolean;
  allows_direct_dispatch: boolean;
  quantity_basis: SpeciesQuantityBasis;
};

const PROCESSED_CAPABILITIES: SpeciesCapabilities = {
  requires_processing: true,
  allows_direct_dispatch: false,
  quantity_basis: 'PT_FORMAT',
};

const DIRECT_CAPABILITIES: SpeciesCapabilities = {
  requires_processing: false,
  allows_direct_dispatch: true,
  quantity_basis: 'RAW_WEIGHT',
};

/** Unknown / empty / null → PROCESSED (safe historical default). */
export function normalizeSpeciesFlowType(raw: string | null | undefined): SpeciesFlowType {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  return v === 'DIRECT' ? 'DIRECT' : 'PROCESSED';
}

export function getSpeciesCapabilities(
  flowType: SpeciesFlowType | string | null | undefined,
): SpeciesCapabilities {
  return normalizeSpeciesFlowType(flowType) === 'DIRECT'
    ? { ...DIRECT_CAPABILITIES }
    : { ...PROCESSED_CAPABILITIES };
}

export function serializeSpeciesWithFlow(row: {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  created_at?: Date;
  flow_type?: string | null;
}) {
  const flow_type = normalizeSpeciesFlowType(row.flow_type);
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    activo: row.activo,
    created_at: row.created_at,
    flow_type,
    capabilities: getSpeciesCapabilities(flow_type),
  };
}
