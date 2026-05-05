import type { PtTag } from '../process/process.entities';
import { buildTarjaLabelData, finalizeZpl } from './zpl-utils';
import { CONTENT_W, FO_X, FO_X_BAR, FO_X_TEXT, TARJA_ZPL_LL, TARJA_ZPL_PW } from './zpl-tarja-layout';

/**
 * Estándar 4×2: datos repartidos en **toda la altura**, texto a ancho casi completo, barcode bajo para escaneo.
 */
export function buildTarjaStandardZpl(tag: PtTag, options?: { clamshellLabel?: string; qrPayload?: string }): string {
  const d = buildTarjaLabelData(tag, options);
  const qr = d.qrPayload ?? `TAR:${d.tagCode}`;
  const csLine = d.clamshellLabel ? `Clamshell · ${d.clamshellLabel}` : '';
  const innerId = `#${tag.id}`;
  const tw = CONTENT_W - (FO_X_TEXT - FO_X);

  const lines: string[] = [
    '^XA',
    '^CI28',
    '^MMT',
    `^PW${TARJA_ZPL_PW}`,
    `^LL${TARJA_ZPL_LL}`,
    '^LH0,0',
    `^FO${FO_X_TEXT},8^A0N,16,16^FB${tw},1,0,L,,^FDUnidad PT^FS`,
    '^FO654,8^BQN,2,2',
    `^FDLA,${qr}^FS`,
    `^FO${FO_X_TEXT},32^A0N,70,58^FB${tw},1,0,L,,^FD${d.tagCode}^FS`,
    `^FO${FO_X_TEXT},106^A0N,28,24^FB${tw},2,0,L,,^FD${d.cliente}^FS`,
    `^FO${FO_X_TEXT},168^A0N,19,19^FB${tw},1,0,L,,^FD${d.formato}^FS`,
    `^FO${FO_X_TEXT},192^A0N,19,19^FB${tw},1,0,L,,^FD${d.fecha}^FS`,
    `^FO${FO_X_TEXT},216^A0N,19,19^FB${tw},2,0,L,,^FD${d.tipo} · ID ${innerId}^FS`,
  ];
  let nextY = 262;
  if (csLine) {
    lines.push(`^FO${FO_X_TEXT},${nextY}^A0N,17,17^FB${tw},1,0,L,,^FD${csLine}^FS`);
    nextY += 22;
  }
  if (d.bol) {
    lines.push(`^FO${FO_X_TEXT},${nextY}^A0N,17,17^FB${tw},1,0,L,,^FDBOL ${d.bol}^FS`);
    nextY += 22;
  }
  const dividerY = Math.min(nextY + 8, TARJA_ZPL_LL - 92);
  lines.push(`^FO${FO_X},${dividerY}^GB${CONTENT_W},2,2^FS`);
  const barY = dividerY + 8;
  const barH = Math.max(74, Math.min(90, TARJA_ZPL_LL - barY - 6));
  lines.push(
    `^FO${FO_X_BAR},${barY}^BY3,3,86^BCN,${barH},Y,N,N^FD${d.barcodeData}^FS`,
    '^PQ1,0,1,Y',
    '^XZ',
  );
  return finalizeZpl(lines);
}
