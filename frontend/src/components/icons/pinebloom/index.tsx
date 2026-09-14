import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Outline editorial — camión de ingreso / despacho. */
export function PineTruckIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...props}>
      <g {...base} strokeWidth={strokeWidth}>
        <path d="M1.75 7.25h11.5v8.5H8.2" />
        <path d="M13.25 10.25h4.1l3.9 3.35v2.15h-2.35" />
        <path d="M1.75 12.5h11.5" />
        <circle cx="6.15" cy="16.85" r="1.85" />
        <circle cx="17.85" cy="16.85" r="1.85" />
        <path d="M8.05 16.85h7.9" />
      </g>
    </svg>
  );
}

/** Outline editorial — engranaje / procesos. */
export function PineGearIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...props}>
      <g {...base} strokeWidth={strokeWidth}>
        <circle cx="12" cy="12" r="3.05" />
        <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M5.9 5.9l1.55 1.55M16.55 16.55l1.55 1.55M18.1 5.9l-1.55 1.55M7.45 16.55l-1.55 1.55" />
        <path d="M9.35 4.55l.55 2.05M14.65 4.55l-.55 2.05M19.45 9.35l-2.05.55M19.45 14.65l-2.05-.55M14.65 19.45l-.55-2.05M9.35 19.45l.55-2.05M4.55 14.65l2.05-.55M4.55 9.35l2.05.55" />
      </g>
    </svg>
  );
}

/** Outline editorial — cajas agrupadas (PT). */
export function PineBoxesIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...props}>
      <g {...base} strokeWidth={strokeWidth}>
        <path d="M4.2 10.4 8 8.3l3.8 2.1v4.4L8 16.9l-3.8-2.1z" />
        <path d="M8 8.3v4.35" />
        <path d="M8.6 11.55 12.2 9.5l3.8 2.1v4.35l-3.8 2.1-3.55-1.95" />
        <path d="M12.2 9.5v4.25" />
        <path d="M9.3 6.55 12.9 4.55 16.7 6.65v.95" />
        <path d="M12.9 4.55v2.85" />
      </g>
    </svg>
  );
}

/** Outline editorial — copo / cámara. */
export function PineSnowflakeIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...props}>
      <g {...base} strokeWidth={strokeWidth}>
        <path d="M12 3.4v17.2" />
        <path d="M4.55 7.7 19.45 16.3" />
        <path d="M4.55 16.3 19.45 7.7" />
        <path d="M12 7.05l-1.7-1.2M12 7.05l1.7-1.2" />
        <path d="M12 16.95l-1.7 1.2M12 16.95l1.7 1.2" />
        <path d="M7.2 9.2 5.35 9.55M7.2 9.2l.2-1.9" />
        <path d="M16.8 14.8l1.85-.35M16.8 14.8l-.2 1.9" />
        <path d="M7.2 14.8 5.35 14.45M7.2 14.8l.2 1.9" />
        <path d="M16.8 9.2l1.85.35M16.8 9.2l-.2-1.9" />
      </g>
    </svg>
  );
}

/** Outline editorial — cubo / materiales. */
export function PineCubeIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...props}>
      <g {...base} strokeWidth={strokeWidth}>
        <path d="M12 3.6 19.1 7.55v8.9L12 20.4 4.9 16.45v-8.9z" />
        <path d="M12 12.05 19.1 7.55" />
        <path d="M12 12.05 4.9 7.55" />
        <path d="M12 12.05v8.35" />
      </g>
    </svg>
  );
}

export type PineIconComponent = typeof PineTruckIcon;
