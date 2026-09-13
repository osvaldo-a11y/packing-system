/**
 * Branding frontend centralizado (white-label base).
 * No confundir con colores semánticos de proceso (ver process-tokens).
 */

export type AppBranding = {
  companyName: string;
  productName: string;
  /** Texto corto en chrome (sidebar / login). */
  displayName: string;
  primaryBrandColor: string;
  secondaryBrandColor: string;
  documentTitle: string;
};

/** Override opcional vía Vite (build-time). */
const envCompany = import.meta.env.VITE_COMPANY_NAME as string | undefined;
const envProduct = import.meta.env.VITE_PRODUCT_NAME as string | undefined;

export const appBranding: AppBranding = {
  companyName: envCompany?.trim() || 'Pinebloom',
  productName: envProduct?.trim() || 'Packing',
  displayName: `${envCompany?.trim() || 'Pinebloom'} ${envProduct?.trim() || 'Packing'}`.trim(),
  primaryBrandColor: 'hsl(var(--brand-primary))',
  secondaryBrandColor: 'hsl(var(--brand-secondary))',
  documentTitle: `${envCompany?.trim() || 'Pinebloom'} ${envProduct?.trim() || 'Packing'}`,
};

export function brandMarkParts(): { company: string; product: string } {
  return { company: appBranding.companyName, product: appBranding.productName };
}
