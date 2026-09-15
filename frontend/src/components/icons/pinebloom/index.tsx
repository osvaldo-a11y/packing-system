import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

/** Silueta industrial — camión clásico de caja y cabina. */
export function PineTruckIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <g transform="translate(-0.96 -2.46) scale(1.04)">
        <path fill="currentColor" d="M0 0h30v25H0z" />
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M32 5h7l9 11v10H32V5Zm3 4v9h9l-6-9h-3Z"
        />
        <path fill="currentColor" d="M0 25h48v4H0z" />
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M10.5 27a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM39.5 27a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
        />
      </g>
    </svg>
  );
}

/** Reloj operativo sólido, con lectura editorial compacta. */
export function PineClockIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M24 3a21 21 0 1 1 0 42 21 21 0 0 1 0-42Zm0 5a16 16 0 1 0 0 32 16 16 0 0 0 0-32Zm-2.5 5.5h5V23l8 5-2.7 4.2L21.5 26V13.5Z"
      />
    </svg>
  );
}

/** Pesa de recepción sólida, con asa calada. */
export function PineWeightIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M18 14a6 6 0 0 1 12 0v3h4.2c1.9 0 3.5 1.3 3.9 3.1L43 42H5l4.9-21.9a4 4 0 0 1 3.9-3.1H18v-3Zm5 3h2v-3a1 1 0 1 0-2 0v3Z"
      />
    </svg>
  );
}

/** Grupo de productores en silueta sólida. */
export function PineUsersIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <circle cx="24" cy="14" r="8" fill="currentColor" />
      <circle cx="9.5" cy="20" r="5.5" fill="currentColor" opacity=".84" />
      <circle cx="38.5" cy="20" r="5.5" fill="currentColor" opacity=".84" />
      <path fill="currentColor" d="M10 43c.3-11 5.2-17 14-17s13.7 6 14 17H10Z" />
      <path fill="currentColor" d="M0 42c.2-8 3.6-12.5 9.8-12.5 2.4 0 4.5.7 6.1 2.1A20.7 20.7 0 0 0 12.5 42H0ZM48 42c-.2-8-3.6-12.5-9.8-12.5-2.4 0-4.5.7-6.1 2.1A20.7 20.7 0 0 1 35.5 42H48Z" opacity=".84" />
    </svg>
  );
}

/** Camión de despacho — caja de carga más larga y cabina lateral compacta. */
export function PineDispatchTruckIcon({ size = 24, strokeWidth: _strokeWidth, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...props}>
      <g transform="translate(-0.96 -2.46) scale(1.04)">
        <path fill="currentColor" d="M0 3h33v23H0z" />
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M34 6h6l8 10v10H34V6Zm3 4v8h7l-5-8h-2Z"
        />
        <path fill="currentColor" d="M0 26h48v4H0z" />
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M11 28a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM40 28a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
        />
      </g>
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
        <path
          d="m15 7 9 5 9-5M24 12v11M4 26l9 5 9-5M13 31v11M26 26l9 5 9-5M35 31v11"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.15"
        />
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

/** Familia lineal compacta para formularios operativos Pinebloom. */
export function PinePersonIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="7.5" r="3.25" />
      <path d="M5.75 20c.35-4.4 2.45-6.6 6.25-6.6s5.9 2.2 6.25 6.6" />
    </svg>
  );
}

export function PineDocumentIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 3.5h8l4 4V20.5H6z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </svg>
  );
}

export function PineCalendarIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17M8 14h2M14 14h2M8 17.5h2" />
    </svg>
  );
}

export function PineLeafIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 4.5C12.2 4.6 6.5 7.1 6.5 13.1c0 3.2 2.1 5.4 5.1 5.4 6.2 0 8.4-6.8 8.4-14Z" />
      <path d="M4 20c2.8-4.2 6.2-7.2 10.4-9.3" />
    </svg>
  );
}

export function PineEllipsisIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="5" cy="12" r="1.65" />
      <circle cx="12" cy="12" r="1.65" />
      <circle cx="19" cy="12" r="1.65" />
    </svg>
  );
}

export function PinePlusIcon({ size = 24, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PineCopyIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" aria-hidden {...props}>
      <rect x="8" y="8" width="11.5" height="12" rx="1.8" />
      <path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v9.4A1.8 1.8 0 0 0 5.8 17H8" />
    </svg>
  );
}

export function PinePrinterIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M7 8V3.75h10V8M7 17H5.25A2.25 2.25 0 0 1 3 14.75v-4.5A2.25 2.25 0 0 1 5.25 8h13.5A2.25 2.25 0 0 1 21 10.25v4.5A2.25 2.25 0 0 1 18.75 17H17" />
      <rect x="7" y="14" width="10" height="6.25" rx="1" />
      <circle cx="17.5" cy="11.25" r=".75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PineTrashIcon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4.5 7h15M9 7V4.5h6V7M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

export function PineChevronIcon({ size = 24, strokeWidth = 1.9, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export type PineIconComponent = typeof PineTruckIcon;
