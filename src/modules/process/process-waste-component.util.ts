/** Componente de resultado merma/desperdicio (código legacy MERMA o alias WASTE / nombre). */
export function isMermaResultComponent(c: { codigo?: string | null; nombre?: string | null }): boolean {
  const cod = (c.codigo ?? '').trim().toUpperCase();
  const nom = (c.nombre ?? '').trim().toLowerCase();
  return cod === 'MERMA' || cod === 'WASTE' || nom.includes('merma') || nom.includes('waste');
}

export function findMermaResultComponent<T extends { codigo: string }>(list: T[]): T | undefined {
  return list.find((c) => isMermaResultComponent(c));
}
