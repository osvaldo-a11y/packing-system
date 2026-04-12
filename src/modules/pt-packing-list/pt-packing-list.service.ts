import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { FinalPalletService } from '../final-pallet/final-pallet.service';
import { CreatePtPackingListDto, UpdatePtPackingListBolDto } from './pt-packing-list.dto';
import { Dispatch, DispatchPtPackingList, SalesOrder } from '../dispatch/dispatch.entities';
import { PtPackingList, PtPackingListItem, PtPackingListReversalEvent } from './pt-packing-list.entities';

@Injectable()
export class PtPackingListService {
  constructor(
    @InjectRepository(PtPackingList) private readonly plRepo: Repository<PtPackingList>,
    @InjectRepository(PtPackingListItem) private readonly itemRepo: Repository<PtPackingListItem>,
    @InjectRepository(PtPackingListReversalEvent)
    private readonly reversalRepo: Repository<PtPackingListReversalEvent>,
    @InjectRepository(FinalPallet) private readonly palletRepo: Repository<FinalPallet>,
    @InjectRepository(FinalPalletLine) private readonly lineRepo: Repository<FinalPalletLine>,
    @InjectRepository(DispatchPtPackingList) private readonly dispatchPlRepo: Repository<DispatchPtPackingList>,
    @InjectRepository(Dispatch) private readonly dispatchRepo: Repository<Dispatch>,
    @InjectRepository(SalesOrder) private readonly salesOrderRepo: Repository<SalesOrder>,
    private readonly finalPalletService: FinalPalletService,
  ) {}

  private listCodeFromId(id: number) {
    return `PL-${id}`;
  }

  private safeIso(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (d instanceof Date) return d.toISOString();
    return String(d);
  }

  private palletTotals(palletId: number, lines: FinalPalletLine[]) {
    const ls = lines.filter((l) => Number(l.final_pallet_id) === palletId);
    const boxes = ls.reduce((s, l) => s + l.amount, 0);
    const pounds = ls.reduce((s, l) => s + Number(l.pounds), 0);
    return { boxes, pounds };
  }

  private async assertPalletsAvailableForPl(
    finalPalletIds: number[],
    opts?: { excludePackingListId?: number },
  ): Promise<FinalPallet[]> {
    const pallets = await this.palletRepo.findBy({ id: In(finalPalletIds) });
    if (pallets.length !== finalPalletIds.length) {
      throw new BadRequestException('Uno o más pallets no existen.');
    }
    for (const p of pallets) {
      if (p.status !== 'definitivo') {
        throw new BadRequestException(
          `Pallet #${p.id}: debe estar en estado definitivo (actual: ${p.status}).`,
        );
      }
      if (p.dispatch_id != null && Number(p.dispatch_id) > 0) {
        throw new BadRequestException(`Pallet #${p.id}: tiene despacho asignado; no puede incluirse en packing list.`);
      }
      if (p.pt_packing_list_id != null && Number(p.pt_packing_list_id) > 0) {
        throw new BadRequestException(`Pallet #${p.id}: ya está vinculado a un packing list.`);
      }
    }
    const qb = this.itemRepo
      .createQueryBuilder('i')
      .innerJoin('i.packing_list', 'pl')
      .where('i.final_pallet_id IN (:...ids)', { ids: finalPalletIds })
      .andWhere("pl.status IN ('borrador', 'confirmado')");
    if (opts?.excludePackingListId != null) {
      qb.andWhere('pl.id != :ex', { ex: opts.excludePackingListId });
    }
    const conflictCount = await qb.getCount();
    if (conflictCount > 0) {
      throw new BadRequestException(
        'Uno o más pallets ya figuran en otro packing list activo (borrador o confirmado).',
      );
    }
    return pallets;
  }

  private clientWarnings(pallets: FinalPallet[]): string[] {
    const warnings: string[] = [];
    const cids = new Set(
      pallets.map((p) => (p.client_id != null && Number(p.client_id) > 0 ? Number(p.client_id) : null)),
    );
    if (cids.size > 1) {
      warnings.push('Los pallets seleccionados tienen distintos clientes (cabecera sin cliente único).');
    }
    return warnings;
  }

  private resolveHeaderClientId(pallets: FinalPallet[]): number | null {
    const cids = pallets.map((p) => (p.client_id != null && Number(p.client_id) > 0 ? Number(p.client_id) : null));
    const unique = [...new Set(cids)];
    if (unique.length === 1) return unique[0];
    return null;
  }

  async create(dto: CreatePtPackingListDto) {
    const ids = [...new Set(dto.final_pallet_ids.map(Number))].filter((id) => Number.isFinite(id) && id > 0);
    const pallets = await this.assertPalletsAvailableForPl(ids);
    const warnings = this.clientWarnings(pallets);
    const clientId = this.resolveHeaderClientId(pallets);
    const listDate = dto.list_date?.trim() ? new Date(dto.list_date) : new Date();
    if (Number.isNaN(listDate.getTime())) {
      throw new BadRequestException('list_date inválida.');
    }

    const row = this.plRepo.create({
      list_code: '—',
      client_id: clientId,
      list_date: listDate,
      status: 'borrador',
      notes: dto.notes?.trim() || null,
    });
    const saved = await this.plRepo.save(row);
    saved.list_code = this.listCodeFromId(saved.id);
    await this.plRepo.save(saved);

    for (const pid of ids) {
      await this.itemRepo.insert({ packing_list_id: saved.id, final_pallet_id: pid });
    }

    const detail = await this.findOne(saved.id);
    return { ...detail, warnings };
  }

  async findAll() {
    const rows = await this.plRepo.find({
      order: { id: 'DESC' },
      take: 300,
      relations: { client: true },
    });
    const plIds = rows.map((r) => r.id);
    const revs =
      plIds.length > 0
        ? await this.reversalRepo.find({ where: { packing_list_id: In(plIds) } })
        : [];
    const revByPl = new Map(revs.map((r) => [Number(r.packing_list_id), r]));
    const plDispatchMeta = await this.buildDispatchMetaForPlIds(plIds);
    return Promise.all(
      rows.map((r) => this.toSummaryRow(r, revByPl.get(r.id), plDispatchMeta.get(r.id) ?? null)),
    );
  }

  private async buildDispatchMetaForPlIds(
    plIds: number[],
  ): Promise<Map<number, { dispatch_id: number; orden_id: number | null; order_number: string | null }>> {
    const map = new Map<number, { dispatch_id: number; orden_id: number | null; order_number: string | null }>();
    if (plIds.length === 0) return map;
    const links = await this.dispatchPlRepo.find({ where: { pt_packing_list_id: In(plIds) } });
    if (links.length === 0) return map;
    const dispatchIds = [...new Set(links.map((l) => Number(l.dispatch_id)))];
    const dispatches = await this.dispatchRepo.find({
      where: { id: In(dispatchIds) },
      select: ['id', 'orden_id'],
    });
    const dispById = new Map(dispatches.map((d) => [Number(d.id), d]));
    const ordenIds = [
      ...new Set(
        dispatches
          .map((d) => (d.orden_id != null ? Number(d.orden_id) : null))
          .filter((x): x is number => x != null && x > 0),
      ),
    ];
    const orders =
      ordenIds.length > 0
        ? await this.salesOrderRepo.find({ where: { id: In(ordenIds) }, select: ['id', 'order_number'] })
        : [];
    const orderById = new Map(orders.map((o) => [Number(o.id), o.order_number?.trim() || null]));
    for (const link of links) {
      const plid = Number(link.pt_packing_list_id);
      const did = Number(link.dispatch_id);
      const disp = dispById.get(did);
      const oid = disp?.orden_id != null ? Number(disp.orden_id) : null;
      const onum = oid != null ? orderById.get(oid) ?? null : null;
      map.set(plid, { dispatch_id: did, orden_id: oid, order_number: onum });
    }
    return map;
  }

  private async toSummaryRow(
    pl: PtPackingList,
    reversal?: PtPackingListReversalEvent | undefined,
    dispatchMeta?: { dispatch_id: number; orden_id: number | null; order_number: string | null } | null,
  ) {
    const items = await this.itemRepo.find({ where: { packing_list_id: pl.id } });
    const palletIds = items.map((i) => Number(i.final_pallet_id));
    const lines =
      palletIds.length > 0
        ? await this.lineRepo.find({ where: { final_pallet_id: In(palletIds) } })
        : [];
    let totalBoxes = 0;
    let totalPounds = 0;
    for (const pid of palletIds) {
      const t = this.palletTotals(pid, lines);
      totalBoxes += t.boxes;
      totalPounds += t.pounds;
    }
    return {
      id: pl.id,
      list_code: pl.list_code,
      client_id: pl.client_id != null ? Number(pl.client_id) : null,
      client_nombre: pl.client?.nombre ?? null,
      list_date: pl.list_date instanceof Date ? pl.list_date.toISOString().slice(0, 10) : String(pl.list_date),
      status: pl.status,
      notes: pl.notes ?? null,
      created_at: this.safeIso(pl.created_at) ?? '',
      confirmed_at: this.safeIso(pl.confirmed_at),
      reversed_at: reversal?.created_at ? this.safeIso(reversal.created_at) : null,
      pallet_count: items.length,
      total_boxes: totalBoxes,
      total_pounds: totalPounds,
      numero_bol: pl.numero_bol?.trim() || null,
      dispatch_id: dispatchMeta?.dispatch_id ?? null,
      orden_id: dispatchMeta?.orden_id ?? null,
      order_number: dispatchMeta?.order_number ?? null,
    };
  }

  async updateNumeroBol(id: number, dto: UpdatePtPackingListBolDto) {
    const pl = await this.plRepo.findOne({ where: { id } });
    if (!pl) throw new NotFoundException('Packing list no encontrado');
    if (pl.status === 'anulado') {
      throw new BadRequestException('No se puede editar el BOL de un packing list anulado.');
    }
    const link = await this.dispatchPlRepo.findOne({ where: { pt_packing_list_id: id } });
    if (link) {
      throw new BadRequestException(
        `Este packing list está en el despacho #${link.dispatch_id}. Cambiá el BOL desde Despachos (solo despacho o también en PL).`,
      );
    }
    pl.numero_bol = dto.numero_bol.trim() ? dto.numero_bol.trim() : null;
    await this.plRepo.save(pl);
    return this.findOne(id);
  }

  async findOne(id: number) {
    const pl = await this.plRepo.findOne({
      where: { id },
      relations: { client: true, items: true },
    });
    if (!pl) throw new NotFoundException('Packing list no encontrado');

    const plLink = await this.dispatchPlRepo.findOne({ where: { pt_packing_list_id: id } });
    let linked_orden_id: number | null = null;
    if (plLink != null) {
      const disp = await this.dispatchRepo.findOne({
        where: { id: Number(plLink.dispatch_id) },
        select: ['id', 'orden_id'],
      });
      linked_orden_id = disp?.orden_id != null ? Number(disp.orden_id) : null;
    }

    const rev = await this.reversalRepo.findOne({ where: { packing_list_id: id } });

    const palletIds = (pl.items ?? []).map((i) => Number(i.final_pallet_id));
    const lines =
      palletIds.length > 0
        ? await this.lineRepo.find({
            where: { final_pallet_id: In(palletIds) },
            relations: { variety: true },
            order: { line_order: 'ASC', id: 'ASC' },
          })
        : [];

    const traceByPallet =
      palletIds.length > 0
        ? await this.finalPalletService.resolveUnidadPtTraceabilityForPalletIds(palletIds)
        : new Map();

    const pallets = [];
    let totalBoxes = 0;
    let totalPounds = 0;
    for (const pid of palletIds) {
      const p = await this.palletRepo.findOne({
        where: { id: pid },
        relations: { presentation_format: true, client: true, species: true },
      });
      if (!p) continue;
      const t = this.palletTotals(pid, lines);
      totalBoxes += t.boxes;
      totalPounds += t.pounds;
      const tr = traceByPallet.get(Number(p.id));
      const logistic =
        p.corner_board_code?.trim() && p.corner_board_code.trim().length > 0
          ? p.corner_board_code.trim()
          : `PF-${p.id}`;
      pallets.push({
        id: p.id,
        corner_board_code: p.corner_board_code,
        codigo_unidad_pt_display: tr?.codigo_unidad_pt_display ?? logistic,
        trazabilidad_pt: tr?.trazabilidad_pt ?? 'sin_trazabilidad',
        species_nombre: p.species?.nombre ?? null,
        presentation_format_id:
          p.presentation_format_id != null && Number(p.presentation_format_id) > 0
            ? Number(p.presentation_format_id)
            : null,
        format_code: p.presentation_format?.format_code ?? null,
        client_nombre: p.client?.nombre ?? null,
        status: p.status,
        boxes: t.boxes,
        pounds: t.pounds,
      });
    }

    return {
      id: pl.id,
      list_code: pl.list_code,
      client_id: pl.client_id != null ? Number(pl.client_id) : null,
      client_nombre: pl.client?.nombre ?? null,
      list_date: pl.list_date instanceof Date ? pl.list_date.toISOString().slice(0, 10) : String(pl.list_date),
      status: pl.status,
      notes: pl.notes ?? null,
      numero_bol: pl.numero_bol?.trim() || null,
      linked_dispatch_id: plLink != null ? Number(plLink.dispatch_id) : null,
      linked_orden_id,
      created_at: this.safeIso(pl.created_at) ?? '',
      confirmed_at: this.safeIso(pl.confirmed_at),
      reversal: rev
        ? {
            reversed_at: this.safeIso(rev.created_at) ?? '',
            reversed_by_username: rev.reversed_by_username,
            notes: rev.notes ?? null,
          }
        : null,
      pallets,
      total_boxes: totalBoxes,
      total_pounds: totalPounds,
    };
  }

  async confirm(id: number) {
    const pl = await this.plRepo.findOne({ where: { id }, relations: { items: true } });
    if (!pl) throw new NotFoundException('Packing list no encontrado');
    if (pl.status !== 'borrador') {
      throw new BadRequestException('Solo se puede confirmar un packing list en borrador.');
    }
    const itemRows = pl.items ?? [];
    if (itemRows.length === 0) {
      throw new BadRequestException('El packing list no tiene pallets.');
    }
    const ids = itemRows.map((i) => Number(i.final_pallet_id));
    await this.assertPalletsAvailableForPl(ids, { excludePackingListId: id });

    pl.status = 'confirmado';
    pl.confirmed_at = new Date();
    await this.plRepo.save(pl);

    for (const pid of ids) {
      const p = await this.palletRepo.findOne({ where: { id: pid } });
      if (!p) continue;
      p.status = 'asignado_pl';
      p.pt_packing_list_id = pl.id;
      await this.palletRepo.save(p);
      await this.finalPalletService.reconcileInventoryForPallet(p.id);
    }

    return this.findOne(id);
  }

  /**
   * Reversa operativa: packing list confirmado → anulado; pallets vuelven a definitivo y stock PT se repone.
   * No aplica si algún pallet ya está en un despacho.
   */
  async reverseConfirmed(id: number, username: string, notes?: string | null) {
    let palletIds: number[] = [];

    await this.plRepo.manager.transaction(async (em) => {
      const plRepo = em.getRepository(PtPackingList);
      const palletRepo = em.getRepository(FinalPallet);
      const revRepo = em.getRepository(PtPackingListReversalEvent);

      const plRow = await plRepo.findOne({ where: { id }, relations: { items: true } });
      if (!plRow) throw new NotFoundException('Packing list no encontrado');
      if (plRow.status !== 'confirmado') {
        throw new BadRequestException('Solo se puede revertir un packing list confirmado.');
      }

      palletIds = (plRow.items ?? []).map((i) => Number(i.final_pallet_id));
      if (palletIds.length === 0) {
        throw new BadRequestException('El packing list no tiene pallets.');
      }

      const plLink = await em.getRepository(DispatchPtPackingList).findOne({ where: { pt_packing_list_id: id } });
      if (plLink) {
        throw new BadRequestException(
          `Este packing list está asociado al despacho #${plLink.dispatch_id}. Quitá el vínculo desde Despachos antes de revertir.`,
        );
      }

      const dispatched: number[] = [];
      for (const pid of palletIds) {
        const p = await palletRepo.findOne({ where: { id: pid } });
        if (p && p.dispatch_id != null && Number(p.dispatch_id) > 0) dispatched.push(p.id);
      }
      if (dispatched.length > 0) {
        throw new BadRequestException(
          `No se puede revertir: uno o más pallets ya están asignados a un despacho (PF: ${dispatched.join(', ')}).`,
        );
      }

      plRow.status = 'anulado';
      await plRepo.save(plRow);

      for (const pid of palletIds) {
        const p = await palletRepo.findOne({ where: { id: pid } });
        if (!p) continue;
        if (p.pt_packing_list_id != null && Number(p.pt_packing_list_id) === id) {
          p.status = 'definitivo';
          p.pt_packing_list_id = null;
          await palletRepo.save(p);
        }
      }

      await revRepo.insert({
        packing_list_id: id,
        reversed_by_username: username,
        notes: notes?.trim() ? notes.trim() : null,
      });
    });

    for (const pid of palletIds) {
      await this.finalPalletService.reconcileInventoryForPallet(pid);
    }

    return this.findOne(id);
  }

  /** Solo borrador: elimina cabecera e ítems (CASCADE). No modifica pallets (siguen definitivo). */
  async deleteDraft(id: number): Promise<void> {
    const pl = await this.plRepo.findOne({ where: { id } });
    if (!pl) throw new NotFoundException('Packing list no encontrado');
    if (pl.status !== 'borrador') {
      throw new BadRequestException('Solo se puede eliminar un packing list en borrador.');
    }
    await this.plRepo.delete({ id });
  }
}
