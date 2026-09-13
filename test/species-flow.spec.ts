import {
  getSpeciesCapabilities,
  normalizeSpeciesFlowType,
  serializeSpeciesWithFlow,
} from '../src/modules/traceability/species-flow';

describe('species-flow (2.5A)', () => {
  it('normalize undefined → PROCESSED', () => {
    expect(normalizeSpeciesFlowType(undefined)).toBe('PROCESSED');
  });

  it('normalize null/empty → PROCESSED', () => {
    expect(normalizeSpeciesFlowType(null)).toBe('PROCESSED');
    expect(normalizeSpeciesFlowType('')).toBe('PROCESSED');
    expect(normalizeSpeciesFlowType('   ')).toBe('PROCESSED');
  });

  it('normalize PROCESSED → PROCESSED', () => {
    expect(normalizeSpeciesFlowType('PROCESSED')).toBe('PROCESSED');
    expect(normalizeSpeciesFlowType('processed')).toBe('PROCESSED');
  });

  it('normalize DIRECT → DIRECT', () => {
    expect(normalizeSpeciesFlowType('DIRECT')).toBe('DIRECT');
    expect(normalizeSpeciesFlowType('direct')).toBe('DIRECT');
  });

  it('invalid flow_type safely normalizes to PROCESSED', () => {
    expect(normalizeSpeciesFlowType('ORANGE')).toBe('PROCESSED');
    expect(normalizeSpeciesFlowType('BLUE')).toBe('PROCESSED');
    expect(normalizeSpeciesFlowType('nope')).toBe('PROCESSED');
  });

  it('capabilities PROCESSED', () => {
    const c = getSpeciesCapabilities('PROCESSED');
    expect(c.requires_processing).toBe(true);
    expect(c.allows_direct_dispatch).toBe(false);
    expect(c.quantity_basis).toBe('PT_FORMAT');
  });

  it('capabilities DIRECT', () => {
    const c = getSpeciesCapabilities('DIRECT');
    expect(c.requires_processing).toBe(false);
    expect(c.allows_direct_dispatch).toBe(true);
    expect(c.quantity_basis).toBe('RAW_WEIGHT');
  });

  it('serialize species includes flow_type + capabilities', () => {
    const row = serializeSpeciesWithFlow({
      id: 2,
      codigo: 'BLUE',
      nombre: 'Blueberry',
      activo: true,
      flow_type: 'PROCESSED',
    });
    expect(row.flow_type).toBe('PROCESSED');
    expect(row.capabilities.requires_processing).toBe(true);
    expect(row.capabilities.allows_direct_dispatch).toBe(false);
  });

  it('legacy species without flow_type behaves PROCESSED', () => {
    const row = serializeSpeciesWithFlow({
      id: 1,
      codigo: '_MIG',
      nombre: 'Especie (dato legado)',
      activo: true,
    });
    expect(row.flow_type).toBe('PROCESSED');
    expect(row.capabilities.quantity_basis).toBe('PT_FORMAT');
  });
});
