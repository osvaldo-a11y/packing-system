import { cn } from '@/lib/utils';
import type { ProcessSemantic } from '@/lib/process-tokens';
import {
  PineBoxesIcon,
  PineCubeIcon,
  PineGearIcon,
  PineSnowflakeIcon,
  PineTruckIcon,
  type PineIconComponent,
} from '@/components/icons/pinebloom';

/** Pictogramas Pinebloom locales (réplica mock). */
const PICTOGRAMS: Record<Exclude<ProcessSemantic, 'error' | 'admin'>, PineIconComponent> = {
  reception: PineTruckIcon,
  process: PineGearIcon,
  pt: PineBoxesIcon,
  stock: PineSnowflakeIcon,
  dispatch: PineTruckIcon,
  materials: PineCubeIcon,
};

type Props = {
  semantic: ProcessSemantic;
  className?: string;
  iconClassName?: string;
  size?: number;
};

export function OperationalPictogram({ semantic, className, iconClassName, size }: Props) {
  const Icon =
    semantic === 'error' || semantic === 'admin'
      ? PineCubeIcon
      : PICTOGRAMS[semantic] ?? PineCubeIcon;

  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden>
      <Icon
        size={size ?? 30}
        className={iconClassName}
        strokeWidth={1.85}
      />
    </span>
  );
}

export function pictogramForSemantic(semantic: ProcessSemantic): PineIconComponent {
  if (semantic === 'error' || semantic === 'admin') return PineCubeIcon;
  return PICTOGRAMS[semantic] ?? PineCubeIcon;
}
