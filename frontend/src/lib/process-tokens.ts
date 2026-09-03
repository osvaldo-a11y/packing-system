/**
 * Tokens semánticos de proceso (no son colores de marca).
 * Usar clases Tailwind derivadas de CSS variables en index.css.
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
  /** Fondo suave de tarjeta */
  surface: string;
  /** Borde */
  border: string;
  /** Texto / icono principal */
  ink: string;
  /** Chip / acento */
  accent: string;
  /** Franja lateral (presencia sin sólido completo) */
  stripe: string;
  /** Ring focus */
  ring: string;
};

export const processTokens: Record<ProcessSemantic, ProcessTokenClasses> = {
  reception: {
    surface: 'bg-[hsl(var(--proc-reception-surface))]',
    border: 'border-[hsl(var(--proc-reception-border))]',
    ink: 'text-[hsl(var(--proc-reception-ink))]',
    accent: 'bg-[hsl(var(--proc-reception-accent))]',
    stripe: 'border-l-[hsl(var(--proc-reception-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-reception-ink))]',
  },
  process: {
    surface: 'bg-[hsl(var(--proc-process-surface))]',
    border: 'border-[hsl(var(--proc-process-border))]',
    ink: 'text-[hsl(var(--proc-process-ink))]',
    accent: 'bg-[hsl(var(--proc-process-accent))]',
    stripe: 'border-l-[hsl(var(--proc-process-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-process-ink))]',
  },
  pt: {
    surface: 'bg-[hsl(var(--proc-pt-surface))]',
    border: 'border-[hsl(var(--proc-pt-border))]',
    ink: 'text-[hsl(var(--proc-pt-ink))]',
    accent: 'bg-[hsl(var(--proc-pt-accent))]',
    stripe: 'border-l-[hsl(var(--proc-pt-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-pt-ink))]',
  },
  stock: {
    surface: 'bg-[hsl(var(--proc-stock-surface))]',
    border: 'border-[hsl(var(--proc-stock-border))]',
    ink: 'text-[hsl(var(--proc-stock-ink))]',
    accent: 'bg-[hsl(var(--proc-stock-accent))]',
    stripe: 'border-l-[hsl(var(--proc-stock-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-stock-ink))]',
  },
  dispatch: {
    surface: 'bg-[hsl(var(--proc-dispatch-surface))]',
    border: 'border-[hsl(var(--proc-dispatch-border))]',
    ink: 'text-[hsl(var(--proc-dispatch-ink))]',
    accent: 'bg-[hsl(var(--proc-dispatch-accent))]',
    stripe: 'border-l-[hsl(var(--proc-dispatch-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-dispatch-ink))]',
  },
  materials: {
    surface: 'bg-[hsl(var(--proc-materials-surface))]',
    border: 'border-[hsl(var(--proc-materials-border))]',
    ink: 'text-[hsl(var(--proc-materials-ink))]',
    accent: 'bg-[hsl(var(--proc-materials-accent))]',
    stripe: 'border-l-[hsl(var(--proc-materials-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-materials-ink))]',
  },
  error: {
    surface: 'bg-[hsl(var(--proc-error-surface))]',
    border: 'border-[hsl(var(--proc-error-border))]',
    ink: 'text-[hsl(var(--proc-error-ink))]',
    accent: 'bg-[hsl(var(--proc-error-accent))]',
    stripe: 'border-l-[hsl(var(--proc-error-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-error-ink))]',
  },
  admin: {
    surface: 'bg-[hsl(var(--proc-admin-surface))]',
    border: 'border-[hsl(var(--proc-admin-border))]',
    ink: 'text-[hsl(var(--proc-admin-ink))]',
    accent: 'bg-[hsl(var(--proc-admin-accent))]',
    stripe: 'border-l-[hsl(var(--proc-admin-accent))]',
    ring: 'focus-visible:ring-[hsl(var(--proc-admin-ink))]',
  },
};
