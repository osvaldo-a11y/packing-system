import {
  Box,
  Boxes,
  Cog,
  Package,
  Snowflake,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessSemantic } from '@/lib/process-tokens';

/** Pictogramas EXACTOS de la especificación (no sustituir). */
const PICTOGRAMS: Record<Exclude<ProcessSemantic, 'error' | 'admin'>, LucideIcon> = {
  reception: Truck,
  process: Cog,
  pt: Boxes,
  stock: Snowflake,
  dispatch: Truck,
  materials: Box,
};

type Props = {
  semantic: ProcessSemantic;
  primary?: LucideIcon;
  className?: string;
  iconClassName?: string;
};

export function OperationalPictogram({ semantic, primary, className, iconClassName }: Props) {
  const Icon =
    primary ??
    (semantic === 'error' || semantic === 'admin' ? Package : PICTOGRAMS[semantic] ?? Package);

  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden>
      <Icon className={cn('h-7 w-7 sm:h-[28px] sm:w-[28px]', iconClassName)} strokeWidth={2.35} />
    </span>
  );
}
