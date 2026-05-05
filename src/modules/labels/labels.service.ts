import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SalesOrder } from '../dispatch/dispatch.entities';
import { FinalPallet } from '../final-pallet/final-pallet.entities';
import { PtPackingList } from '../pt-packing-list/pt-packing-list.entities';
import { PresentationFormat, Producer, Variety } from '../traceability/traceability.entities';
import { FruitProcess, PtTag, PtTagItem } from '../process/process.entities';
import { TARJA_TEMPLATE_REGISTRY } from './tarja-template-registry';
import { resolveTarjaTemplate, type TarjaLabelTemplate } from './tarja-zpl.types';
import { buildTarjaZpl } from './zpl-tarja.factory';

@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(PtTag)
    private readonly ptTags: Repository<PtTag>,
    @InjectRepository(PtTagItem)
    private readonly ptTagItems: Repository<PtTagItem>,
    @InjectRepository(FruitProcess)
    private readonly fruitProcesses: Repository<FruitProcess>,
    @InjectRepository(Producer)
    private readonly producers: Repository<Producer>,
    @InjectRepository(Variety)
    private readonly varieties: Repository<Variety>,
    @InjectRepository(PresentationFormat)
    private readonly formats: Repository<PresentationFormat>,
    @InjectRepository(FinalPallet)
    private readonly finalPallets: Repository<FinalPallet>,
    @InjectRepository(PtPackingList)
    private readonly ptPackingLists: Repository<PtPackingList>,
    @InjectRepository(SalesOrder)
    private readonly salesOrders: Repository<SalesOrder>,
  ) {}

  listTarjaTemplates() {
    return TARJA_TEMPLATE_REGISTRY;
  }

  async getTarjaZpl(id: number, templateRaw?: string): Promise<string> {
    const tag = await this.ptTags.findOne({
      where: { id },
      relations: ['client', 'brand'],
    });
    if (!tag) {
      throw new NotFoundException(`Tarja ${id} no encontrada`);
    }
    const clamshellLabel = await this.resolveClamshellLabel(tag.format_code, tag.brand?.nombre ?? null);
    const qrPayload = await this.resolveStandardQrPayload(id, tag.tag_code);
    const template: TarjaLabelTemplate = resolveTarjaTemplate(templateRaw);
    if (template !== 'detailed') {
      return buildTarjaZpl(tag, template, { clamshellLabel, qrPayload });
    }

    const items = await this.ptTagItems.find({ where: { tarja_id: id } });
    if (items.length === 0) {
      return buildTarjaZpl(tag, template, { contributions: [], clamshellLabel, qrPayload });
    }

    const processIds = [...new Set(items.map((i) => Number(i.process_id)).filter((x) => Number.isFinite(x) && x > 0))];
    const producerIds = [...new Set(items.map((i) => Number(i.productor_id)).filter((x) => Number.isFinite(x) && x > 0))];

    const processes = processIds.length
      ? await this.fruitProcesses.find({ where: { id: In(processIds) } })
      : [];
    const processById = new Map<number, FruitProcess>();
    for (const p of processes) processById.set(Number(p.id), p);

    const varietyIds = [...new Set(processes.map((p) => Number(p.variedad_id)).filter((x) => Number.isFinite(x) && x > 0))];

    const [producerRows, varietyRows] = await Promise.all([
      producerIds.length ? this.producers.find({ where: { id: In(producerIds) } }) : [],
      varietyIds.length ? this.varieties.find({ where: { id: In(varietyIds) } }) : [],
    ]);

    const producerById = new Map<number, string>();
    for (const p of producerRows) {
      const code = p.codigo?.trim();
      producerById.set(Number(p.id), code ? `${code} ${p.nombre}` : p.nombre);
    }
    const varietyById = new Map<number, string>();
    for (const v of varietyRows) varietyById.set(Number(v.id), v.nombre);

    const aggregate = new Map<string, { producer: string; variety: string; boxes: number }>();
    for (const item of items) {
      const producerId = Number(item.productor_id);
      const process = processById.get(Number(item.process_id));
      const varietyId = process ? Number(process.variedad_id) : 0;
      const producer = producerById.get(producerId) ?? `Prod #${producerId}`;
      const variety = varietyById.get(varietyId) ?? (varietyId > 0 ? `Var #${varietyId}` : 'Variedad');
      const boxes = Math.max(0, Number(item.cajas_generadas) || 0);
      const key = `${producer}__${variety}`;
      const prev = aggregate.get(key);
      if (prev) {
        prev.boxes += boxes;
      } else {
        aggregate.set(key, { producer, variety, boxes });
      }
    }

    const contributions = [...aggregate.values()].sort((a, b) => b.boxes - a.boxes).slice(0, 3);
    return buildTarjaZpl(tag, template, { contributions, clamshellLabel, qrPayload });
  }

  private async resolveClamshellLabel(formatCode: string, brandName: string | null): Promise<string | undefined> {
    const fmt = formatCode.trim();
    if (!fmt) return undefined;
    const row = await this.formats
      .createQueryBuilder('f')
      .where('LOWER(f.format_code) = LOWER(:code)', { code: fmt })
      .getOne();
    const kind = row?.clamshell_label_kind?.trim().toLowerCase();
    if (kind === 'marca' && brandName?.trim()) {
      return `Marca ${brandName.trim()}`;
    }
    if (kind === 'generica') {
      return 'Generica';
    }
    return undefined;
  }

  private async resolveStandardQrPayload(tarjaId: number, tagCode: string): Promise<string> {
    const fp = await this.finalPallets.findOne({
      where: { tarja_id: tarjaId },
      order: { id: 'DESC' },
      select: ['id', 'pt_packing_list_id', 'planned_sales_order_id'],
    });
    const plCode = fp?.pt_packing_list_id
      ? (
          await this.ptPackingLists.findOne({
            where: { id: Number(fp.pt_packing_list_id) },
            select: ['list_code'],
          })
        )?.list_code ?? ''
      : '';
    const orderNumber = fp?.planned_sales_order_id
      ? (
          await this.salesOrders.findOne({
            where: { id: Number(fp.planned_sales_order_id) },
            select: ['order_number'],
          })
        )?.order_number ?? ''
      : '';

    const clean = (s: string) => s.replace(/[,\^\~\r\n|]/g, ' ').trim();
    const parts = [`TAR:${clean(tagCode)}`];
    if (plCode) parts.push(`PL:${clean(plCode)}`);
    if (orderNumber) parts.push(`ORD:${clean(orderNumber)}`);
    return parts.join('|');
  }
}
