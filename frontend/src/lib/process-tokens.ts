/**
 * Tokens semánticos de módulo — superficies EXACTAS de la referencia Pinebloom.
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

/** Colores literales de la especificación (no HSL reinterpretado). */
export const processTokens: Record<ProcessSemantic, ProcessTokenClasses> = {
  reception: {
    surface: 'bg-[#EFF2E9]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#5E6654]',
    accent: 'bg-[#87966C]',
    iconWell: 'bg-[#E4EAD9] text-[#5E6654]',
    stripe: 'border-l-[#87966C]',
    ring: 'focus-visible:ring-[#87966C]',
  },
  process: {
    surface: 'bg-[#F1EFEA]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#8D887E]',
    accent: 'bg-[#8D887E]',
    iconWell: 'bg-[#E8E5DF] text-[#6F6A62]',
    stripe: 'border-l-[#8D887E]',
    ring: 'focus-visible:ring-[#8D887E]',
  },
  pt: {
    surface: 'bg-[#EEF4F6]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#8AA9B7]',
    accent: 'bg-[#8AA9B7]',
    iconWell: 'bg-[#E0EBF0] text-[#5F7F8C]',
    stripe: 'border-l-[#8AA9B7]',
    ring: 'focus-visible:ring-[#8AA9B7]',
  },
  stock: {
    surface: 'bg-[#EEF4F6]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#8AA9B7]',
    accent: 'bg-[#8AA9B7]',
    iconWell: 'bg-[#E0EBF0] text-[#5F7F8C]',
    stripe: 'border-l-[#8AA9B7]',
    ring: 'focus-visible:ring-[#8AA9B7]',
  },
  dispatch: {
    surface: 'bg-[#F7F1E3]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#B8995D]',
    accent: 'bg-[#B8995D]',
    iconWell: 'bg-[#EFE4CC] text-[#8A7040]',
    stripe: 'border-l-[#B8995D]',
    ring: 'focus-visible:ring-[#B8995D]',
  },
  materials: {
    surface: 'bg-[#EFF2E9]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#87966C]',
    accent: 'bg-[#87966C]',
    iconWell: 'bg-[#E4EAD9] text-[#5E6654]',
    stripe: 'border-l-[#87966C]',
    ring: 'focus-visible:ring-[#87966C]',
  },
  error: {
    surface: 'bg-[#F8EEEE]',
    border: 'border-[#E5C8C6]',
    ink: 'text-[#B84A43]',
    accent: 'bg-[#B84A43]',
    iconWell: 'bg-[#F0DADA] text-[#B84A43]',
    stripe: 'border-l-[#B84A43]',
    ring: 'focus-visible:ring-[#B84A43]',
  },
  admin: {
    surface: 'bg-[#F1EFEA]',
    border: 'border-[#D7D8D2]',
    ink: 'text-[#484C47]',
    accent: 'bg-[#484C47]',
    iconWell: 'bg-[#E8E5DF] text-[#484C47]',
    stripe: 'border-l-[#484C47]',
    ring: 'focus-visible:ring-[#484C47]',
  },
};
