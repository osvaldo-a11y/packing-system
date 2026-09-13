import {
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  Layers,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Truck,
  Warehouse,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessSemantic } from '@/lib/process-tokens';

type PictogramDef = {
  primary: LucideIcon;
  secondary?: LucideIcon;
};

const PICTOGRAMS: Record<Exclude<ProcessSemantic, 'error' | 'admin'>, PictogramDef> = {
  reception: { primary: PackageOpen, secondary: ArrowDownToLine },
  process: { primary: Boxes, secondary: RefreshCw },
  pt: { primary: PackageCheck },
  stock: { primary: Warehouse, secondary: Archive },
  dispatch: { primary: Truck, secondary: ArrowUpRight },
  materials: { primary: PackageSearch, secondary: Layers },
};

type Props = {
  semantic: ProcessSemantic;
  /** Override del pictograma principal. */
  primary?: LucideIcon;
  className?: string;
  iconClassName?: string;
};

/**
 * Pictograma operacional literal (Lucide, stroke uniforme).
 * Composición 1–2 iconos; sin emoji ni filled.
 */
export function OperationalPictogram({ semantic, primary, className, iconClassName }: Props) {
  const fallback: PictogramDef = { primary: PackageOpen };
  const def =
    semantic === 'error' || semantic === 'admin' ? fallback : PICTOGRAMS[semantic] ?? fallback;
  const Primary = primary ?? def.primary;
  const Secondary = def.secondary;

  return (
    <span className={cn('relative inline-flex items-center justify-center', className)} aria-hidden>
      <Primary className={cn('h-7 w-7 sm:h-[30px] sm:w-[30px]', iconClassName)} strokeWidth={2.15} />
      {Secondary ? (
        <span className="absolute -bottom-1 -right-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-md bg-[hsl(var(--brand-surface))] text-[hsl(var(--brand-charcoal))] ring-1 ring-[hsl(var(--brand-border))] sm:h-5 sm:w-5">
          <Secondary className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={2.4} />
        </span>
      ) : null}
    </span>
  );
}
