import {
  Boxes,
  Cog,
  Box,
  Package,
  Snowflake,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessSemantic } from '@/lib/process-tokens';

/** Pictogramas del mockup aprobado (stroke uniforme). */
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
      <Icon className={cn('h-6 w-6 sm:h-7 sm:w-7', iconClassName)} strokeWidth={2} />
    </span>
  );
}
