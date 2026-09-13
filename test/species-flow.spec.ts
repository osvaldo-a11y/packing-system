import {
  normalizeFlowType,
  resolveSpeciesCapabilities,
  serializeSpeciesWithFlow,
} from '../src/modules/traceability/species-flow';

describe('species-flow', () => {
  it('defaults unknown to PROCESSED', () => {
    expect(normalizeFlowType(undefined)).toBe('PROCESSED');
    expect(normalizeFlowType('')).toBe('PROCESSED');
    expect(normalizeFlowType('direct')).toBe('DIRECT');
  });

  it('derives capabilities without species codes', () => {
    const p = resolveSpeciesCapabilities('PROCESSED');
    expect(p.requires_processing).toBe(true);
    expect(p.allows_direct_dispatch).toBe(false);
    const d = resolveSpeciesCapabilities('DIRECT');
    expect(d.requires_processing).toBe(false);
    expect(d.allows_direct_dispatch).toBe(true);
    expect(d.quantity_basis).toBe('weight_lb');
  });

  it('serializes species with flow + capabilities', () => {
    const row = serializeSpeciesWithFlow({
      id: 1,
      codigo: 'ORAN',
      nombre: 'Orange',
      activo: true,
      flow_type: 'DIRECT',
    });
    expect(row.flow_type).toBe('DIRECT');
    expect(row.capabilities.allows_direct_dispatch).toBe(true);
  });
});
