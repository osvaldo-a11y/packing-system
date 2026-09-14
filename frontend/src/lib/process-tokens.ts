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
    surface: 'bg-[color-mix(in_srgb,var(--sage-100)_72%,white)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--olive-700)]',
    accent: 'bg-[var(--olive-700)]',
    iconWell: 'bg-[color-mix(in_srgb,var(--sage-200)_65%,white)] text-[var(--pine-950)]',
    stripe: 'border-l-[var(--olive-600)]',
    ring: 'focus-visible:ring-[var(--olive-700)]',
  },
  process: {
    surface: 'bg-[color-mix(in_srgb,var(--stone-100)_70%,white)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--pine-800)]',
    accent: 'bg-[var(--pine-800)]',
    iconWell: 'bg-[color-mix(in_srgb,var(--stone-200)_60%,white)] text-[var(--pine-950)]',
    stripe: 'border-l-[var(--pine-800)]',
    ring: 'focus-visible:ring-[var(--pine-800)]',
  },
  pt: {
    surface: 'bg-[color-mix(in_srgb,var(--bluegray-100)_68%,white)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--bluegray-700)]',
    accent: 'bg-[var(--bluegray-700)]',
    iconWell: 'bg-[color-mix(in_srgb,var(--bluegray-200)_58%,white)] text-[var(--bluegray-700)]',
    stripe: 'border-l-[var(--bluegray-700)]',
    ring: 'focus-visible:ring-[var(--bluegray-700)]',
  },
  stock: {
    surface: 'bg-[color-mix(in_srgb,var(--ice-100)_70%,white)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--ice-700)]',
    accent: 'bg-[var(--ice-700)]',
    iconWell: 'bg-[color-mix(in_srgb,var(--ice-200)_55%,white)] text-[var(--ice-700)]',
    stripe: 'border-l-[var(--ice-700)]',
    ring: 'focus-visible:ring-[var(--ice-700)]',
  },
  dispatch: {
    surface: 'bg-[color-mix(in_srgb,var(--harvest-100)_68%,white)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--harvest-700)]',
    accent: 'bg-[var(--harvest-700)]',
    iconWell: 'bg-[color-mix(in_srgb,var(--harvest-200)_55%,white)] text-[var(--harvest-700)]',
    stripe: 'border-l-[var(--harvest-700)]',
    ring: 'focus-visible:ring-[var(--harvest-700)]',
  },
  materials: {
    surface: 'bg-[color-mix(in_srgb,var(--sage-100)_70%,white)]',
    border: 'border-[var(--stone-300)]',
    ink: 'text-[var(--olive-600)]',
    accent: 'bg-[var(--olive-600)]',
    iconWell: 'bg-[color-mix(in_srgb,var(--sage-200)_62%,white)] text-[var(--olive-700)]',
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
