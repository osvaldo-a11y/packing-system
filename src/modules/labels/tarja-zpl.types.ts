export const TARJA_LABEL_TEMPLATES = ['compact', 'standard', 'detailed'] as const;
export const TARJA_LABEL_DPI = [203, 300] as const;

export type TarjaLabelTemplate = (typeof TARJA_LABEL_TEMPLATES)[number];
export type TarjaLabelDpi = (typeof TARJA_LABEL_DPI)[number];

export function resolveTarjaTemplate(input?: string | null): TarjaLabelTemplate {
  if (!input) return 'standard';
  const key = input.trim().toLowerCase();
  if (key === 'compact' || key === 'standard' || key === 'detailed') {
    return key;
  }
  return 'standard';
}

export function resolveTarjaDpi(input?: string | number | null): TarjaLabelDpi {
  const raw = String(input ?? '').trim();
  if (raw === '300') return 300;
  return 203;
}
