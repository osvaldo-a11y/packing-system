import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Props = {
  writable?: boolean;
  className?: string;
};

/** Chip DEMO quieto — Gold Master topbar. */
export function DemoModeChip({ writable = false, className }: Props) {
  const { t } = useTranslation('common');
  const tip = writable ? t('auth.sandboxChipTooltip') : t('auth.demoChipTooltip');

  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border border-[var(--stone-300)] bg-[var(--stone-100)] px-2.5 text-[10px] font-semibold tracking-[0.1em] text-[var(--ink)]',
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
