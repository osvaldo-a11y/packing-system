/**
 * Branding frontend centralizado (white-label).
 * Colores de marca ≠ colores de estado ≠ acentos sutiles de módulo.
 */

export type AppBranding = {
  companyName: string;
  productName: string;
  displayName: string;
  /** Monograma compacto (rail colapsado), p.ej. PB */
  monogram: string;
  /** URL del logo completo (wordmark). */
  logoUrl: string;
  /** URL del mark cuadrado. */
  markUrl: string;
  documentTitle: string;
};

const envCompany = import.meta.env.VITE_COMPANY_NAME as string | undefined;
const envProduct = import.meta.env.VITE_PRODUCT_NAME as string | undefined;
const envMonogram = import.meta.env.VITE_BRAND_MONOGRAM as string | undefined;
const envLogo = import.meta.env.VITE_BRAND_LOGO_URL as string | undefined;
const envMark = import.meta.env.VITE_BRAND_MARK_URL as string | undefined;

const company = envCompany?.trim() || 'Pinebloom Farms';
const product = envProduct?.trim() || 'Packing';

function defaultMonogram(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  return (name.slice(0, 2) || 'PB').toUpperCase();
}

export const appBranding: AppBranding = {
  companyName: company,
  productName: product,
  displayName: company.trim(),
  monogram: envMonogram?.trim() || defaultMonogram(company),
  logoUrl: envLogo?.trim() || '/branding/pinebloom-wordmark.svg',
  markUrl: envMark?.trim() || '/branding/pinebloom-mark.svg',
  documentTitle: `${company} · ${product}`,
};

export function brandMarkParts(): { company: string; product: string; monogram: string } {
  return {
    company: appBranding.companyName,
    product: appBranding.productName,
    monogram: appBranding.monogram,
  };
}
