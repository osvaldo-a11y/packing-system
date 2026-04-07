import { toJsonRecord } from '../../common/to-json-record';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddPtTagItemDto, CreateFruitProcessDto, CreatePtTagDto, UpdatePtTagDto } from './process.dto';
import { FruitProcess, PtTag, PtTagAudit, PtTagItem } from './process.entities';

@Injectable()
export class ProcessService {
  constructor(
    @InjectRepository(FruitProcess) private readonly processRepo: Repository<FruitProcess>,
    @InjectRepository(PtTag) private readonly tagRepo: Repository<PtTag>,
    @InjectRepository(PtTagItem) private readonly tagItemRepo: Repository<PtTagItem>,
    @InjectRepository(PtTagAudit) private readonly tagAuditRepo: Repository<PtTagAudit>,
  ) {}

  async createProcess(dto: CreateFruitProcessDto) {
    const pct = (dto.peso_procesado_lb / 1000) * 100;
    const row = this.processRepo.create({
      ...dto,
      fecha_proceso: new Date(dto.fecha_proceso),
      porcentaje_procesado: pct.toFixed(4),
      peso_procesado_lb: dto.peso_procesado_lb.toFixed(2),
      merma_lb: dto.merma_lb.toFixed(2),
    });
    return this.processRepo.save(row);
  }

  async createTag(dto: CreatePtTagDto) {
    const seq = (await this.tagRepo.count()) + 1;
    const ymd = dto.fecha.slice(0, 10).replace(/-/g, '');
    return this.tagRepo.save(
      this.tagRepo.create({
        ...dto,
        fecha: new Date(dto.fecha),
        tag_code: `TAR-${ymd}-${String(seq).padStart(5, '0')}`,
      }),
    );
  }

  private boxWeight(formatCode: string) {
    const m = /^(\d+)x(\d+)oz$/i.exec(formatCode);
    if (!m) throw new BadRequestException('format_code inválido');
    return (Number(m[1]) * Number(m[2])) / 16;
  }

  async addProcessToTag(tagId: number, dto: AddPtTagItemDto) {
    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    const proc = await this.processRepo.findOne({ where: { id: dto.process_id } });
    if (!tag || !proc) throw new NotFoundException('Tarja o proceso no encontrado');

    const exists = await this.tagItemRepo.findOne({ where: { tarja_id: tagId, process_id: dto.process_id } });
    if (exists) throw new BadRequestException('Proceso ya agregado a esta tarja');

    const net = Number(proc.peso_procesado_lb) - Number(proc.merma_lb);
    const cajas = Math.floor(net / this.boxWeight(tag.format_code));
    const pallets = Math.max(1, Math.ceil(cajas / tag.cajas_por_pallet));

    await this.tagItemRepo.save(
      this.tagItemRepo.create({
        tarja_id: tagId,
        process_id: proc.id,
        productor_id: proc.productor_id,
        cajas_generadas: cajas,
        pallets_generados: pallets,
      }),
    );

    proc.tarja_id = tagId;
    await this.processRepo.save(proc);

    const items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });
    tag.total_cajas = items.reduce((a, i) => a + i.cajas_generadas, 0);
    tag.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
    await this.tagRepo.save(tag);

    return tag;
  }

  async updateTag(tagId: number, dto: UpdatePtTagDto) {
    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Tarja no encontrada');
    const before = { ...tag };
    tag.format_code = dto.format_code;
    tag.cajas_por_pallet = dto.cajas_por_pallet;
    await this.tagRepo.save(tag);

    const items = await this.tagItemRepo.find({ where: { tarja_id: tagId } });
    for (const item of items) {
      item.pallets_generados = Math.max(1, Math.ceil(item.cajas_generadas / tag.cajas_por_pallet));
      await this.tagItemRepo.save(item);
    }
    tag.total_pallets = items.reduce((a, i) => a + i.pallets_generados, 0);
    await this.tagRepo.save(tag);

    await this.tagAuditRepo.save(
      this.tagAuditRepo.create({
        tarja_id: tagId,
        action: 'update_tag',
        before_payload: toJsonRecord(before),
        after_payload: toJsonRecord(tag),
      }),
    );
    return tag;
  }
}
