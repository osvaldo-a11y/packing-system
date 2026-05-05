/**
 * Lienzo **4×2 pulgadas @ 203 dpi** (812 × 406 dots) — etiqueta corner board.
 * `PW` = barrido 4", `LL` = avance 2". No cambiar sin recalibrar en la Zebra.
 *
 * Orientación: composición “paisaje” para lectura de frente al rabillo.
 * Si en planta la etiqueta queda boca abajo respecto al diseño, se puede probar
 * **una sola línea** `^POI` justo después de `^LH0,0` en una plantilla de prueba
 * (invierte 180° todo el lienzo; no está activado por defecto).
 */
export const TARJA_ZPL_PW = 812;
export const TARJA_ZPL_LL = 406;

export const FO_X = 28;
export const FO_X_TEXT = 36;
export const FO_X_BAR = 36;
/** Ancho útil (márgenes simétricos ~28 pts). */
export const CONTENT_W = 756;
