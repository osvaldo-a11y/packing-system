import type { PtTag } from '../process/process.entities';
import { buildTarjaLabelData, finalizeZpl } from './zpl-utils';
import { FO_X, CONTENT_W, TARJA_ZPL_LL, TARJA_ZPL_PW } from './zpl-tarja-layout';

export function buildTarjaStandardZpl(
  tag: PtTag,
  options?: { clamshellLabel?: string; qrPayload?: string; lang?: 'es' | 'en' },
): string {
  const d    = buildTarjaLabelData(tag, options);
  const lang = options?.lang ?? 'es';
  const qr   = d.qrPayload ?? `TAR:${d.tagCode}`;

  const cajasLabel  = lang === 'en' ? 'boxes' : 'cajas';
  const bolLabel    = 'BOL';

  // QR a la derecha — tamaño moderado para no competir con el TAR
  const QR_X   = 548;
  const QR_MAG = 6;
  const TXT_W  = QR_X - FO_X - 8;

  const lines: string[] = [
    '^XA',
    '^CI28',
    '^MMT',
    `^PW${TARJA_ZPL_PW}`,
    `^LL${TARJA_ZPL_LL}`,
    '^LH0,0',

    // ── QR arriba derecha ──
    `^FO${QR_X},10^BQN,2,${QR_MAG}`,
    `^FDLA,${qr}^FS`,

    // ── Código TAR — máximo protagonismo ──
    `^FO${FO_X},8^A0N,88,72^FB${TXT_W},1,0,L,,^FD${d.tagCode}^FS`,
  ];

  let y = 102;

  // ── Marca/clamshell — negrita, segunda línea más importante ──
  if (d.clamshellLabel) {
    lines.push(`^FO${FO_X},${y}^A0N,30,26^FB${TXT_W},1,0,L,,^FD${d.clamshellLabel}^FS`);
    y += 36;
  }

  // ── Separador ──
  lines.push(`^FO${FO_X},${y}^GB${CONTENT_W},2,2^FS`);
  y += 8;

  // ── Cliente ──
  lines.push(`^FO${FO_X},${y}^A0N,24,20^FB${TXT_W + 200},1,0,L,,^FD${d.clienteShort}^FS`);
  y += 30;

  // ── Formato + Cajas en una línea ──
  lines.push(`^FO${FO_X},${y}^A0N,22,20^FB${TXT_W + 200},1,0,L,,^FD${d.formato}  ·  ${tag.total_cajas} ${cajasLabel}^FS`);
  y += 28;

  // ── Fecha ──
  lines.push(`^FO${FO_X},${y}^A0N,18,16^FB${TXT_W + 200},1,0,L,,^FD${d.fecha}^FS`);
  y += 24;

  // ── BOL ──
  if (d.bol) {
    lines.push(`^FO${FO_X},${y}^A0N,24,22^FB${TXT_W + 200},1,0,L,,^FD${bolLabel} ${d.bol}^FS`);
    y += 30;
  }

  const remainY = Math.max(y + 8, TARJA_ZPL_LL - 60);
  lines.push(
    `^FO${FO_X},${remainY}^GB${CONTENT_W},1,1^FS`,
    `^FO${FO_X},${remainY + 6}^A0N,14,12^FB${CONTENT_W},1,0,R,,^FD${d.tagCode}^FS`,
  );

  lines.push('^PQ1,0,1,Y', '^XZ');

  return finalizeZpl(lines);
}
