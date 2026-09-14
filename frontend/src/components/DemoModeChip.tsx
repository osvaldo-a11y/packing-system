import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Props = {
  writable?: boolean;
  className?: string;
};

/**
 * Chip DEMO del mockup aprobado: píldora quieta con borde fino.
 * El tooltip distingue sandbox vs solo lectura sin romper el look.
 */
export function DemoModeChip({ writable = false, className }: Props) {
  const { t } = useTranslation('common');
  const tip = writable ? t('auth.sandboxChipTooltip') : t('auth.demoChipTooltip');

  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border border-[hsl(var(--brand-charcoal))]/35 bg-[hsl(var(--brand-surface-elevated))] px-2.5 text-[10px] font-semibold tracking-[0.14em] text-[hsl(var(--brand-charcoal))]',
        className,
      )}
      title={tip}
      aria-label={tip}
      role="status"
    >
      DEMO
    </span>
  );
}
