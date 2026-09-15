/**
 * Tokens semánticos de módulo — GOLD MASTER Pinebloom.
 */

export type ProcessSemantic =
  | 'reception'
  | 'process'
  | 'pt'
  | 'stock'
  | 'dispatch'
  | 'materials'
  | 'error'
  | 'admin';

export type ProcessTokenClasses = {
  surface: string;
  border: string;
  ink: string;
  accent: string;
  iconWell: string;
  stripe: string;
  ring: string;
};

export const processTokens: Record<ProcessSemantic, ProcessTokenClasses> = {
  reception: {
    surface: 'bg-[#ECEEE8]',
    border: 'border-[#97A28C]',
    ink: 'text-[var(--olive-700)]',
    accent: 'bg-[var(--olive-700)]',
    iconWell: 'bg-[#BDC6B2] text-[#4D5F3C]',
    stripe: 'border-l-[var(--olive-600)]',
    ring: 'focus-visible:ring-[var(--olive-700)]',
  },
  process: {
    surface: 'bg-[#F0EFEB]',
    border: 'border-[#AAA69D]',
    ink: 'text-[var(--pine-800)]',
    accent: 'bg-[var(--pine-800)]',
    iconWell: 'bg-[#CCC7BA] text-[#454642]',
    stripe: 'border-l-[var(--pine-800)]',
    ring: 'focus-visible:ring-[var(--pine-800)]',
  },
  pt: {
    surface: 'bg-[#ECF0F2]',
    border: 'border-[#83A5B6]',
    ink: 'text-[var(--bluegray-700)]',
    accent: 'bg-[var(--bluegray-700)]',
    iconWell: 'bg-[#B4C5CE] text-[#405B68]',
    stripe: 'border-l-[var(--bluegray-700)]',
    ring: 'focus-visible:ring-[var(--bluegray-700)]',
  },
  stock: {
    surface: 'bg-[#EAEFF1]',
    border: 'border-[#82A8BA]',
    ink: 'text-[var(--ice-700)]',
    accent: 'bg-[var(--ice-700)]',
    iconWell: 'bg-[#B1C2CC] text-[#405B68]',
    stripe: 'border-l-[var(--ice-700)]',
    ring: 'focus-visible:ring-[var(--ice-700)]',
  },
  dispatch: {
    surface: 'bg-[#F5F0E5]',
    border: 'border-[#CAA969]',
    ink: 'text-[var(--harvest-700)]',
    accent: 'bg-[var(--harvest-700)]',
    iconWell: 'bg-[#DBC8A3] text-[#725B2D]',
    stripe: 'border-l-[var(--harvest-700)]',
    ring: 'focus-visible:ring-[var(--harvest-700)]',
  },
  materials: {
    surface: 'bg-[#EDEFE9]',
    border: 'border-[#98A98A]',
    ink: 'text-[var(--olive-600)]',
    accent: 'bg-[var(--olive-600)]',
    iconWell: 'bg-[#BAC4AE] text-[#44583A]',
    stripe: 'border-l-[var(--olive-600)]',
    ring: 'focus-visible:ring-[var(--olive-600)]',
  },
  error: {
    surface: 'bg-[#F8EEEE]',
    border: 'border-[#E5C8C6]',
    ink: 'text-[var(--status-danger)]',
    accent: 'bg-[var(--status-danger)]',
    iconWell: 'bg-[#F0DADA] text-[var(--status-danger)]',
    stripe: 'border-l-[var(--status-danger)]',
    ring: 'focus-visible:ring-[var(--status-danger)]',
  },
  admin: {
    surface: 'bg-[var(--stone-100)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--pine-800)]',
    accent: 'bg-[var(--pine-800)]',
    iconWell: 'bg-[var(--stone-200)] text-[var(--pine-950)]',
    stripe: 'border-l-[var(--pine-800)]',
    ring: 'focus-visible:ring-[var(--pine-800)]',
  },
};
