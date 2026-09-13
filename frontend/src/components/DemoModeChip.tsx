import { Eye, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Props = {
  writable?: boolean;
  className?: string;
};

/** Chip compacto de entorno demo/sandbox (reemplaza el banner alto). */
export function DemoModeChip({ writable = false, className }: Props) {
  const { t } = useTranslation('common');
  const Icon = writable ? FlaskConical : Eye;
  const label = writable ? t('auth.demoChipSandbox') : t('auth.demoChipReadonly');
  const tip = writable ? t('auth.sandboxChipTooltip') : t('auth.demoChipTooltip');

  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-[9.5rem] items-center gap-1 rounded-md border px-2 text-[11px] font-semibold tracking-wide',
        writable
          ? 'border-amber-300/90 bg-amber-50 text-amber-950'
          : 'border-emerald-300/90 bg-emerald-50 text-emerald-950',
        className,
      )}
      title={tip}
      aria-label={tip}
      role="status"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.25} />
      <span className="truncate">{label}</span>
    </span>
  );
}
