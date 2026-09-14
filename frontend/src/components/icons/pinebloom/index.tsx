import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

/** Silueta industrial — camión clásico de caja y cabina. */
export function PineTruckIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <path fill="currentColor" d="M2 11h28v18H2z" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M29 17h9l8 9v4H29V17Zm4 4v6h8l-5.2-6H33Z"
      />
      <rect x="3" y="28" width="42" height="4" rx="1" fill="currentColor" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 28a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM37 28a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
      />
    </svg>
  );
}

/** Engranaje clásico sólido, con dientes grandes y centro abierto. */
export function PineGearIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <g fill="currentColor">
        <rect x="20.5" y="3" width="7" height="10" rx="1.25" />
        <rect x="20.5" y="35" width="7" height="10" rx="1.25" />
        <rect x="35" y="20.5" width="10" height="7" rx="1.25" />
        <rect x="3" y="20.5" width="10" height="7" rx="1.25" />
        <rect x="20.5" y="3" width="7" height="10" rx="1.25" transform="rotate(45 24 24)" />
        <rect x="20.5" y="35" width="7" height="10" rx="1.25" transform="rotate(45 24 24)" />
        <rect x="35" y="20.5" width="10" height="7" rx="1.25" transform="rotate(45 24 24)" />
        <rect x="3" y="20.5" width="10" height="7" rx="1.25" transform="rotate(45 24 24)" />
      </g>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M24 9a15 15 0 1 1 0 30 15 15 0 0 1 0-30Zm0 7.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"
      />
    </svg>
  );
}

/** Tres cajas físicas agrupadas: una superior y dos inferiores. */
export function PineBoxesIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <g fill="currentColor">
        <path d="m24 2 9 5-9 5-9-5 9-5Z" />
        <path d="m15 7 9 5v11l-9-5V7Z" opacity=".78" />
        <path d="m33 7-9 5v11l9-5V7Z" opacity=".58" />
        <path d="m13 21 9 5-9 5-9-5 9-5Z" />
        <path d="m4 26 9 5v11l-9-5V26Z" opacity=".78" />
        <path d="m22 26-9 5v11l9-5V26Z" opacity=".58" />
        <path d="m35 21 9 5-9 5-9-5 9-5Z" />
        <path d="m26 26 9 5v11l-9-5V26Z" opacity=".78" />
        <path d="m44 26-9 5v11l9-5V26Z" opacity=".58" />
      </g>
    </svg>
  );
}

/** Copo clásico de seis ramas, grueso y de lectura inmediata. */
export function PineSnowflakeIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  const weight = Math.max(3, strokeWidth * 1.65);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth={weight}>
        <path d="M24 3v42M6 13.5l36 21M6 34.5l36-21" />
        <path d="m24 11-6-4m6 4 6-4M24 37l-6 4m6-4 6 4" />
        <path d="m13 17-7 1m7-1-2-7M35 31l7-1m-7 1 2 7" />
        <path d="m13 31-7-1m7 1-2 7M35 17l7 1m-7-1 2-7" />
      </g>
    </svg>
  );
}

/** Cubo isométrico simple, con aristas de peso industrial. */
export function PineCubeIcon({ size = 24, strokeWidth = 1.85, ...props }: IconProps) {
  const weight = Math.max(3.2, strokeWidth * 2);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={weight}>
        <path d="m24 4 17 9.5v21L24 44 7 34.5v-21L24 4Z" />
        <path d="m7 13.5 17 10 17-10M24 23.5V44" />
      </g>
    </svg>
  );
}

export type PineIconComponent = typeof PineTruckIcon;
