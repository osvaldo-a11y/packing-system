/**
 * Branding white-label (Pinebloom Farms — GOLD MASTER).
 */

export type AppBranding = {
  companyName: string;
  productName: string;
  displayName: string;
  locationLine: string;
  tagline: string;
  slogan: string;
  sealLine: string;
  estYear: string;
  monogram: string;
  logoUrl: string;
  logoFullUrl: string;
  logoOfficialUrl: string;
  logoSidebarUrl: string;
  logoMobileUrl: string;
  markUrl: string;
  windmillUrl: string;
  windmillMarkUrl: string;
  watermarkUrl: string;
  landscapeUrl: string;
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
  return (name.slice(0, 2) || 'PF').toUpperCase();
}

export const appBranding: AppBranding = {
  companyName: company,
  productName: product,
  displayName: company.trim(),
  locationLine: 'Newton, GA',
  tagline: 'Fruta de nuestra tierra. Un futuro más brillante.',
  slogan: 'BUENAS FRUTAS HACEN UN MEJOR MAÑANA',
  sealLine: 'PINEBLOOM FARMS · NEWTON, GA · EST. 2012',
  estYear: '2012',
  monogram: envMonogram?.trim() || defaultMonogram(company),
  logoUrl: envLogo?.trim() || '/branding/pinebloom-logo-official.png',
  logoFullUrl: '/branding/pinebloom-logo-official.png',
  logoOfficialUrl: '/branding/pinebloom-logo-official.png',
  logoSidebarUrl: '/branding/pinebloom-logo-sidebar.svg',
  logoMobileUrl: '/branding/pinebloom-logo-official.png',
  markUrl: envMark?.trim() || '/branding/pinebloom-windmill-mark.svg',
  windmillUrl: '/branding/pinebloom-windmill-mark-light.svg',
  windmillMarkUrl: '/branding/pinebloom-windmill-mark.svg',
  watermarkUrl: '/branding/pinebloom-field-hero.svg?v=delta7',
  landscapeUrl: '/branding/pinebloom-field-hero.svg?v=delta7',
  documentTitle: `${company} · ${product}`,
};

export function brandMarkParts(): { company: string; product: string; monogram: string } {
  return {
    company: appBranding.companyName,
    product: appBranding.productName,
    monogram: appBranding.monogram,
  };
}
