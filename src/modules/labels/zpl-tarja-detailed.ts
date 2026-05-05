import type { PtTag } from '../process/process.entities';
import { buildTarjaLabelData, escapeZplFd, finalizeZpl } from './zpl-utils';
import { CONTENT_W, FO_X, FO_X_BAR, TARJA_ZPL_LL, TARJA_ZPL_PW } from './zpl-tarja-layout';

export type TarjaDetailContribution = {
  producer: string;
  variety: string;
  boxes: number;
};

const IND = 12;

/** Línea compacta tipo `PRODUCTOR — VARIEDAD — N cajas` (máx. ~72 chars ZPL-seguro). */
function formatContributionRow(c: TarjaDetailContribution): string {
  const producer = c.producer?.trim() || 'Productor';
  const variety = c.variety?.trim() || 'Variedad';
  const boxes = Number.isFinite(c.boxes) ? Math.max(0, Math.round(c.boxes)) : 0;
  const raw = `${producer} — ${variety} — ${boxes} cajas`;
  return escapeZplFd(raw.replace(/\r?\n/g, ' '), 72);
}

/**
 * Detallada 4×2: cliente / operativo / **productor—variedad—cajas** (hasta 3 líneas si hay datos) + barcode al pie.
 */
export function buildTarjaDetailedZpl(
  tag: PtTag,
  contributions: TarjaDetailContribution[] = [],
  options?: { clamshellLabel?: string; qrPayload?: string },
): string {
  const d = buildTarjaLabelData(tag, options);
  const qr = d.qrPayload ?? `TAR:${d.tagCode}`;
  const tw = CONTENT_W - IND;

  const lines: string[] = [
    '^XA',
    '^CI28',
    '^MMT',
    `^PW${TARJA_ZPL_PW}`,
    `^LL${TARJA_ZPL_LL}`,
    '^LH0,0',
    `^FO${FO_X},6^A0N,18,18^FDUnidad PT^FS`,
    '^FO658,6^BQN,2,2',
    `^FDLA,${qr}^FS`,
    `^FO${FO_X},30^GB${CONTENT_W},2,2^FS`,
    `^FO${FO_X},40^A0N,12,12^FDCliente^FS`,
    `^FO${FO_X + IND},52^A0N,16,16^FB${tw},2,0,L,0^FD${d.cliente}^FS`,
    `^FO${FO_X},98^GB${CONTENT_W},2,2^FS`,
    `^FO${FO_X},108^A0N,12,12^FDOperativo^FS`,
    `^FO${FO_X + IND},120^A0N,14,14^FB${tw},1,0,L,0^FDFormato · ${d.formato}^FS`,
    `^FO${FO_X + IND},138^A0N,14,14^FB${tw},1,0,L,0^FDFecha · ${d.fecha}^FS`,
    `^FO${FO_X + IND},156^A0N,14,14^FB${tw},1,0,L,0^FDID · ${d.idLabel}^FS`,
    `^FO${FO_X + IND},174^A0N,14,14^FB${tw},1,0,L,0^FDTipo · ${d.tipo}^FS`,
  ];

  let y = 196;
  if (d.clamshellLabel) {
    lines.push(`^FO${FO_X + IND},${y}^A0N,13,13^FDClamshell · ${d.clamshellLabel}^FS`);
    y += 15;
  }
  if (d.bol) {
    lines.push(`^FO${FO_X + IND},${y}^A0N,13,13^FDBOL · ${d.bol}^FS`);
    y += 15;
  }

  const contributRows = contributions
    .filter((x) => (x.producer || '').trim() || (x.variety || '').trim() || Number(x.boxes) > 0)
    .slice(0, 3)
    .map(formatContributionRow)
    .filter(Boolean);

  if (contributRows.length > 0) {
    lines.push(`^FO${FO_X},${y}^GB${CONTENT_W},2,2^FS`);
    y += 6;
    lines.push(`^FO${FO_X},${y}^A0N,12,12^FDProductor — variedad — cajas^FS`);
    y += 13;
    for (const row of contributRows) {
      lines.push(`^FO${FO_X + IND},${y}^A0N,13,13^FB${tw},1,0,L,0^FD${row}^FS`);
      y += 14;
    }
  }

  const barcodeH = Math.min(76, Math.max(62, TARJA_ZPL_LL - y - 14));
  const maxBarTop = TARJA_ZPL_LL - barcodeH - 8;
  const barTop = Math.min(y + 6, maxBarTop);
  lines.push(`^FO${FO_X},${barTop}^GB${CONTENT_W},2,2^FS`);
  lines.push(`^FO${FO_X_BAR},${barTop + 8}^BY3,3,76^BCN,${barcodeH},Y,N,N^FD${d.barcodeData}^FS`);
  lines.push('^PQ1,0,1,Y', '^XZ');
  return finalizeZpl(lines);
}
