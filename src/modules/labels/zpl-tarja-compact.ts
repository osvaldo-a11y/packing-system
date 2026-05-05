import type { PtTag } from '../process/process.entities';
import { buildTarjaLabelData, finalizeZpl } from './zpl-utils';
import { CONTENT_W, FO_X, TARJA_ZPL_LL, TARJA_ZPL_PW } from './zpl-tarja-layout';

/**
 * Resumida 4×2: **código TAR-xx** lo más grande posible, barcode ancho abajo, título mínimo.
 */
export function buildTarjaCompactZpl(tag: PtTag, options?: { clamshellLabel?: string; qrPayload?: string }): string {
  const d = buildTarjaLabelData(tag, options);
  const code = d.tagCode;

  const hasFmt = Boolean(d.formato.trim() && d.formato !== '—');
  const fmtLine = hasFmt ? d.formato : '';
  const clamLine = d.clamshellLabel ? `Lbl ${d.clamshellLabel}` : '';

  const lines: string[] = [
    '^XA',
    '^CI28',
    '^MMT',
    `^PW${TARJA_ZPL_PW}`,
    `^LL${TARJA_ZPL_LL}`,
    '^LH0,0',
    `^FO${FO_X},4^A0N,14,14^FB${CONTENT_W},1,0,R,,^FDUnidad PT^FS`,
    `^FO${FO_X},22^A0N,196,156^FB${CONTENT_W},1,0,C,,^FD${code}^FS`,
  ];

  let y = 212;
  if (fmtLine) {
    lines.push(`^FO${FO_X},${y}^A0N,20,20^FB${CONTENT_W},1,0,C,,^FD${fmtLine}^FS`);
    y += 26;
  }
  if (clamLine) {
    lines.push(`^FO${FO_X},${y}^A0N,16,16^FB${CONTENT_W},1,0,C,,^FD${clamLine}^FS`);
    y += 22;
  }

  const ruleY = Math.min(y + 4, TARJA_ZPL_LL - 112);
  const barY = ruleY + 6;
  const room = TARJA_ZPL_LL - barY - 6;
  const barH = Math.max(84, Math.min(124, room));
  lines.push(
    `^FO${FO_X},${ruleY}^GB${CONTENT_W},2,2^FS`,
    `^FO${FO_X + 32},${barY}^BY4,3,124^BCN,${barH},Y,N,N^FD${d.barcodeData}^FS`,
    '^PQ1,0,1,Y',
    '^XZ',
  );
  return finalizeZpl(lines);
}
