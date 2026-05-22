import type { PtTag } from '../process/process.entities';
import { buildTarjaLabelData, finalizeZpl } from './zpl-utils';
import { CONTENT_W, FO_X_TEXT, TARJA_ZPL_LL, TARJA_ZPL_PW } from './zpl-tarja-layout';

/**
 * Estándar 4×2: QR legible (TAR|BOL|… vía API), bloque de texto alineado a la izquierda,
 * márgenes simétricos y bloque centrado en vertical para aspecto más prolijo (sin pie vacío).
 */
export function buildTarjaStandardZpl(tag: PtTag, options?: { clamshellLabel?: string; qrPayload?: string }): string {
  const d = buildTarjaLabelData(tag, options);
  const qr = d.qrPayload ?? `TAR:${d.tagCode}`;
  const csLine = d.clamshellLabel ? `Clamshell · ${d.clamshellLabel}` : '';
  const innerId = `#${tag.id}`;
  const tw = CONTENT_W - (FO_X_TEXT - 28);
  /** Columna derecha: QR ~160–180 pts ancho @ mag 7 → FO ≈ 812 - 28 - 180 */
  const QR_X = 512;
  const QR_MAG = 7;
  /** Alturas relativas (compactas); luego se suma `pad` para centrar en 406. */
  const rHeader = 4;
  const rQr = 4;
  const rTag = 118;
  const rCliente = 176;
  const rFormato = 204;
  const rFecha = 228;
  const rTipo = 252;
  let footBottom = rTipo + 40;
  if (csLine) footBottom += 22;
  if (d.bol) footBottom += 22;
  const pad = Math.min(38, Math.max(6, Math.floor((TARJA_ZPL_LL - footBottom - 16) / 2)));
  const y = (v: number) => v + pad;

  const lines: string[] = [
    '^XA',
    '^CI28',
    '^MMT',
    `^PW${TARJA_ZPL_PW}`,
    `^LL${TARJA_ZPL_LL}`,
    '^LH0,0',
    `^FO${FO_X_TEXT},${y(rHeader)}^A0N,17,17^FB${tw},1,0,L,,^FDUnidad PT^FS`,
    `^FO${QR_X},${y(rQr)}^BQN,2,${QR_MAG}`,
    `^FDLA,${qr}^FS`,
    `^FO${FO_X_TEXT},${y(rTag)}^A0N,60,50^FB${tw},1,0,L,,^FD${d.tagCode}^FS`,
    `^FO${FO_X_TEXT},${y(rCliente)}^A0N,24,20^FB${tw},2,0,L,,^FD${d.cliente}^FS`,
    `^FO${FO_X_TEXT},${y(rFormato)}^A0N,18,16^FB${tw},1,0,L,,^FD${d.formato}^FS`,
    `^FO${FO_X_TEXT},${y(rFecha)}^A0N,18,16^FB${tw},1,0,L,,^FD${d.fecha}^FS`,
    `^FO${FO_X_TEXT},${y(rTipo)}^A0N,18,16^FB${tw},2,0,L,,^FD${d.tipo} · ID ${innerId}^FS`,
  ];
  let nextY = y(rTipo) + 36;
  if (csLine) {
    lines.push(`^FO${FO_X_TEXT},${nextY}^A0N,18,16^FB${tw},2,0,L,,^FD${csLine}^FS`);
    nextY += 24;
  }
  if (d.bol) {
    lines.push(`^FO${FO_X_TEXT},${nextY}^A0N,18,16^FB${tw},1,0,L,,^FDBOL ${d.bol}^FS`);
    nextY += 24;
  }
  lines.push('^PQ1,0,1,Y', '^XZ');
  return finalizeZpl(lines);
}
