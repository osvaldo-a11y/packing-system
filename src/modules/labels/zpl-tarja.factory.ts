import type { PtTag } from '../process/process.entities';
import type { TarjaLabelTemplate } from './tarja-zpl.types';
import { buildTarjaCompactZpl } from './zpl-tarja-compact';
import { buildTarjaDetailedZpl, type TarjaDetailContribution } from './zpl-tarja-detailed';
import { buildTarjaStandardZpl } from './zpl-tarja-standard';

export function buildTarjaZpl(
  tag: PtTag,
  template: TarjaLabelTemplate,
  detail: { contributions?: TarjaDetailContribution[]; clamshellLabel?: string; qrPayload?: string } = {},
): string {
  if (template === 'compact') {
    return buildTarjaCompactZpl(tag, { clamshellLabel: detail.clamshellLabel, qrPayload: detail.qrPayload });
  }
  if (template === 'detailed') {
    return buildTarjaDetailedZpl(tag, detail.contributions ?? [], {
      clamshellLabel: detail.clamshellLabel,
      qrPayload: detail.qrPayload,
    });
  }
  return buildTarjaStandardZpl(tag, { clamshellLabel: detail.clamshellLabel, qrPayload: detail.qrPayload });
}
