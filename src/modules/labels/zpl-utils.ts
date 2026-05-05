import { ProcessResult, type PtTag } from '../process/process.entities';
import type { TarjaLabelDpi } from './tarja-zpl.types';

export function escapeZplFd(text: string, maxLen: number): string {
  const collapsed = text.replace(/\r|\n/g, ' ').replace(/\^/g, ' ').replace(/~/g, ' ').trim();
  if (!collapsed) return '—';
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen - 1)}…` : collapsed;
}

export function labelResultado(r: ProcessResult): string {
  switch (r) {
    case ProcessResult.CAJAS:
      return 'Cajas';
    case ProcessResult.IQF:
      return 'IQF';
    case ProcessResult.JUGO:
      return 'Jugo';
    case ProcessResult.PERDIDO:
      return 'Perdido';
    case ProcessResult.OTRO:
      return 'Otro';
    default:
      return String(r);
  }
}

export function formatFechaTag(fecha: Date): string {
  try {
    return fecha.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return fecha.toISOString().slice(0, 16);
  }
}

export type TarjaLabelData = {
  tagCode: string;
  cliente: string;
  clienteShort: string;
  formato: string;
  fecha: string;
  idLabel: string;
  tipo: string;
  barcodeData: string;
  clamshellLabel?: string;
  qrPayload?: string;
  bol?: string;
};

export function buildTarjaLabelData(
  tag: PtTag,
  options?: { clamshellLabel?: string; qrPayload?: string },
): TarjaLabelData {
  const clientLine = tag.client?.nombre
    ? `${tag.client.codigo ? `${tag.client.codigo} · ` : ''}${tag.client.nombre}`
    : 'Sin cliente asignado';
  const clientShort = tag.client?.nombre ? tag.client.nombre : 'Sin cliente';
  const fecha = formatFechaTag(tag.fecha instanceof Date ? tag.fecha : new Date(tag.fecha));
  const bol = tag.bol?.trim() ? escapeZplFd(tag.bol.trim(), 64) : '';
  const barcodeData = escapeZplFd(tag.tag_code, 62).replace(/…$/, '');
  return {
    tagCode: escapeZplFd(tag.tag_code, 40),
    cliente: escapeZplFd(clientLine, 72),
    clienteShort: escapeZplFd(clientShort, 36),
    formato: escapeZplFd(tag.format_code, 48),
    fecha: escapeZplFd(fecha, 40),
    idLabel: `#${tag.id} | ${escapeZplFd(tag.tag_code, 40)}`,
    tipo: escapeZplFd(labelResultado(tag.resultado), 32),
    barcodeData,
    clamshellLabel: options?.clamshellLabel ? escapeZplFd(options.clamshellLabel, 48) : undefined,
    qrPayload: options?.qrPayload ? escapeZplFd(options.qrPayload, 120) : undefined,
    bol: bol || undefined,
  };
}

export function finalizeZpl(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

/** Coordenadas base diseñadas a 203 dpi; escala lineal para 300 dpi cuando corresponda. */
export function scaleForDpi(value: number, dpi: TarjaLabelDpi): number {
  if (dpi === 203) return Math.round(value);
  return Math.round((value * dpi) / 203);
}
