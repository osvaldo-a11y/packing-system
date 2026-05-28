import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompletePrintJobDto } from './dto/complete-print-job.dto';
import { CreatePrintJobDto } from './dto/create-print-job.dto';
import { PrintJob } from './print-job.entity';

function assertValidZpl(zpl: string): string {
  const text = String(zpl ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!text) {
    throw new BadRequestException('`zpl` es obligatorio.');
  }
  const head = text.slice(0, 800);
  if (/<!DOCTYPE\s+html/i.test(head) || /<\s*html[\s>/]/i.test(head)) {
    throw new BadRequestException('El cuerpo parece HTML, no ZPL.');
  }
  if (!/^\^XA/i.test(text)) {
    throw new BadRequestException('ZPL inválido: debe empezar con ^XA.');
  }
  return text;
}

@Injectable()
export class PrintJobsService {
  constructor(
    @InjectRepository(PrintJob)
    private readonly repo: Repository<PrintJob>,
  ) {}

  async create(dto: CreatePrintJobDto, userId?: number | null): Promise<PrintJob> {
    const zpl = assertValidZpl(dto.zpl);
    const copies = Math.min(Math.max(Number(dto.copies ?? 1) || 1, 1), 99);
    const row = this.repo.create({
      filename: String(dto.filename ?? 'label.zpl').trim().slice(0, 200) || 'label.zpl',
      zpl,
      printer_name: dto.printerName?.trim() || null,
      copies,
      status: 'pending',
      created_by_user_id: userId != null && Number.isFinite(userId) ? String(userId) : null,
    });
    return this.repo.save(row);
  }

  async claimPending(limit = 5): Promise<PrintJob[]> {
    const take = Math.min(Math.max(Number(limit) || 5, 1), 20);
    return this.repo.manager.transaction(async (em) => {
      const rows = await em
        .createQueryBuilder(PrintJob, 'j')
        .where('j.status = :status', { status: 'pending' })
        .orderBy('j.created_at', 'ASC')
        .limit(take)
        .setLock('pessimistic_write')
        .getMany();
      if (!rows.length) return [];
      const now = new Date();
      for (const row of rows) {
        row.status = 'claimed';
        row.claimed_at = now;
      }
      await em.save(rows);
      return rows;
    });
  }

  async complete(id: string, dto: CompletePrintJobDto): Promise<PrintJob> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Trabajo de impresión no encontrado.');
    if (row.status === 'done' || row.status === 'failed') {
      return row;
    }
    row.status = dto.ok ? 'done' : 'failed';
    row.error_message = dto.ok ? null : String(dto.error ?? 'Error de impresión').trim().slice(0, 2000);
    row.completed_at = new Date();
    if (dto.printer?.trim()) {
      row.printer_name = dto.printer.trim().slice(0, 200);
    }
    return this.repo.save(row);
  }
}
