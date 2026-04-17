import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CreatePresentationFormatDto,
  CreateProcessResultComponentDto,
  CreateProcessMachineDto,
  CreateProducerDto,
  CreateQualityGradeDto,
  CreateReceptionDto,
  CreateReceptionLineDto,
  CreateSpeciesDto,
  CreateVarietyDto,
  UpdatePresentationFormatDto,
  UpdateProcessResultComponentDto,
  UpdateProcessMachineDto,
  UpdateProducerDto,
  UpdateQualityGradeDto,
  UpdateReceptionDto,
  UpdateSpeciesDto,
  UpdateVarietyDto,
  UpdateSpeciesProcessComponentsDto,
  TransitionReceptionStateDto,
} from './traceability.dto';
import { RawMaterialMovement } from '../process/process.entities';
import { QueryFailedError } from 'typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { receptionDateKey, sanitizeProducerCodeForReference } from '../../common/reception-reference';
import {
  PresentationFormat,
  ProcessResultComponent,
  ProcessMachine,
  Producer,
  QualityGrade,
  Reception,
  ReceptionLine,
  SpeciesProcessResultComponent,
  Species,
  Variety,
} from './traceability.entities';
import { ReturnableContainer } from './operational.entities';
import { DocumentState, Mercado, ReceptionType } from './catalog.entities';
import { MasterUsageService } from './master-usage.service';

const FORMAT_CODE_RE = /^(\d+)x(\d+)oz$/i;
const FORMAT_ALIAS_RE = /^pinta\s+(regular|low\s+profile)$/i;

const WEIGHT_BASIS = new Set(['net_lb', 'gross_lb']);
const QUALITY_INTENTS = new Set(['exportacion', 'proceso']);

/** Transiciones válidas entre códigos de `document_states` para recepciones. */
const RECEPTION_STATE_TRANSITIONS: Record<string, Set<string>> = {
  borrador: new Set(['borrador', 'confirmado', 'anulado']),
  confirmado: new Set(['confirmado', 'cerrado', 'anulado']),
  cerrado: new Set(['cerrado']),
  anulado: new Set(['anulado']),
};

@Injectable()
export class TraceabilityService {
  constructor(
    @InjectRepository(Species) private readonly speciesRepo: Repository<Species>,
    @InjectRepository(Producer) private readonly producerRepo: Repository<Producer>,
    @InjectRepository(Variety) private readonly varietyRepo: Repository<Variety>,
    @InjectRepository(PresentationFormat) private readonly formatRepo: Repository<PresentationFormat>,
    @InjectRepository(Reception) private readonly receptionRepo: Repository<Reception>,
    @InjectRepository(ReceptionLine) private readonly receptionLineRepo: Repository<ReceptionLine>,
    @InjectRepository(QualityGrade) private readonly qualityRepo: Repository<QualityGrade>,
    @InjectRepository(ProcessMachine) private readonly processMachineRepo: Repository<ProcessMachine>,
    @InjectRepository(ProcessResultComponent) private readonly resultComponentRepo: Repository<ProcessResultComponent>,
    @InjectRepository(SpeciesProcessResultComponent)
    private readonly speciesResultComponentRepo: Repository<SpeciesProcessResultComponent>,
    @InjectRepository(RawMaterialMovement) private readonly rawMovementRepo: Repository<RawMaterialMovement>,
    @InjectRepository(DocumentState) private readonly documentStateRepo: Repository<DocumentState>,
    @InjectRepository(ReceptionType) private readonly receptionTypeRepo: Repository<ReceptionType>,
    @InjectRepository(Mercado) private readonly mercadoRepo: Repository<Mercado>,
    private readonly masterUsage: MasterUsageService,
  ) {}

  private isDeactivating(rowActivo: boolean, dtoActivo?: boolean): boolean {
    return rowActivo && dtoActivo === false;
  }

  private async assertUniqueSpecies(codigo: string, nombre: string, excludeId?: number) {
    const qb = this.speciesRepo
      .createQueryBuilder('s')
      .where('(LOWER(TRIM(s.codigo)) = LOWER(TRIM(:c)) OR LOWER(TRIM(s.nombre)) = LOWER(TRIM(:n)))', {
        c: codigo,
        n: nombre,
      });
    if (excludeId != null) qb.andWhere('s.id != :id', { id: excludeId });
    if (await qb.getOne()) throw new BadRequestException('Ya existe otra especie con el mismo código o nombre.');
  }

  private async assertUniqueProducer(codigo: string | null, nombre: string, excludeId?: number) {
    const qbN = this.producerRepo
      .createQueryBuilder('p')
      .where('LOWER(TRIM(p.nombre)) = LOWER(TRIM(:n))', { n: nombre });
    if (excludeId != null) qbN.andWhere('p.id != :id', { id: excludeId });
    if (await qbN.getOne()) throw new BadRequestException('Ya existe otro productor con el mismo nombre.');
    if (codigo != null && codigo.trim() !== '') {
      const c = codigo.trim();
      const qbC = this.producerRepo
        .createQueryBuilder('p')
        .where('p.codigo IS NOT NULL AND LOWER(TRIM(p.codigo)) = LOWER(TRIM(:c))', { c });
      if (excludeId != null) qbC.andWhere('p.id != :id', { id: excludeId });
      if (await qbC.getOne()) throw new BadRequestException('Ya existe otro productor con el mismo código.');
    }
  }

  private async assertUniqueVariety(
    speciesId: number,
    codigo: string | null,
    nombre: string,
    excludeId?: number,
  ) {
    const qbN = this.varietyRepo
      .createQueryBuilder('v')
      .where('v.species_id = :sid AND LOWER(TRIM(v.nombre)) = LOWER(TRIM(:n))', { sid: speciesId, n: nombre });
    if (excludeId != null) qbN.andWhere('v.id != :id', { id: excludeId });
    if (await qbN.getOne()) throw new BadRequestException('Ya existe otra variedad con el mismo nombre en esta especie.');
    if (codigo != null && codigo.trim() !== '') {
      const c = codigo.trim();
      const qbC = this.varietyRepo
        .createQueryBuilder('v')
        .where('v.species_id = :sid AND v.codigo IS NOT NULL AND LOWER(TRIM(v.codigo)) = LOWER(TRIM(:c))', {
          sid: speciesId,
          c,
        });
      if (excludeId != null) qbC.andWhere('v.id != :id', { id: excludeId });
      if (await qbC.getOne()) throw new BadRequestException('Ya existe otra variedad con el mismo código en esta especie.');
    }
  }

  private async assertUniqueQuality(codigo: string, nombre: string, excludeId?: number) {
    const qb = this.qualityRepo
      .createQueryBuilder('q')
      .where('(LOWER(TRIM(q.codigo)) = LOWER(TRIM(:c)) OR LOWER(TRIM(q.nombre)) = LOWER(TRIM(:n)))', {
        c: codigo,
        n: nombre,
      });
    if (excludeId != null) qb.andWhere('q.id != :id', { id: excludeId });
    if (await qb.getOne()) throw new BadRequestException('Ya existe otra calidad con el mismo código o nombre.');
  }

  private assertReceptionStateTransition(fromCodigo: string, toCodigo: string) {
    const allowed = RECEPTION_STATE_TRANSITIONS[fromCodigo];
    if (!allowed || !allowed.has(toCodigo)) {
      throw new BadRequestException(`Transición de estado no permitida: ${fromCodigo} → ${toCodigo}`);
    }
  }

  listProcessResultComponents(includeInactive = false) {
    return this.resultComponentRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { sort_order: 'ASC', nombre: 'ASC' },
    });
  }

  async createProcessResultComponent(dto: CreateProcessResultComponentDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    const dupC = await this.resultComponentRepo.findOne({ where: { codigo } });
    if (dupC) throw new BadRequestException(`Ya existe un componente con código ${codigo}`);
    const dupN = await this.resultComponentRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.nombre)) = LOWER(TRIM(:n))', { n: nombre })
      .getOne();
    if (dupN) throw new BadRequestException(`Ya existe un componente con el mismo nombre`);
    return this.resultComponentRepo.save(
      this.resultComponentRepo.create({
        codigo,
        nombre,
        sort_order: dto.sort_order ?? 0,
      }),
    );
  }

  async updateProcessResultComponent(id: number, dto: UpdateProcessResultComponentDto) {
    const row = await this.resultComponentRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Componente de resultado no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateProcessResultComponent(id);
    }
    if (dto.codigo != null) {
      const codigo = dto.codigo.trim().toUpperCase();
      const dup = await this.resultComponentRepo.findOne({ where: { codigo } });
      if (dup && dup.id !== id) throw new BadRequestException(`Ya existe otro componente con código ${codigo}`);
      row.codigo = codigo;
    }
    if (dto.nombre != null) {
      const nombre = dto.nombre.trim();
      const dupN = await this.resultComponentRepo
        .createQueryBuilder('c')
        .where('LOWER(TRIM(c.nombre)) = LOWER(TRIM(:n))', { n: nombre })
        .andWhere('c.id != :id', { id })
        .getOne();
      if (dupN) throw new BadRequestException(`Ya existe otro componente con el mismo nombre`);
      row.nombre = nombre;
    }
    if (dto.sort_order != null) row.sort_order = dto.sort_order;
    if (dto.activo != null) row.activo = dto.activo;
    return this.resultComponentRepo.save(row);
  }

  async deleteProcessResultComponent(id: number) {
    const row = await this.resultComponentRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Componente de resultado no encontrado');
    await this.masterUsage.assertCanDeactivateProcessResultComponent(id);
    try {
      await this.resultComponentRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este componente porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  async listSpeciesProcessResultComponents(speciesId: number, includeInactive = false) {
    const species = await this.speciesRepo.findOne({ where: { id: speciesId } });
    if (!species) throw new NotFoundException('Especie no encontrada');
    const qb = this.resultComponentRepo
      .createQueryBuilder('c')
      .orderBy('c.sort_order', 'ASC')
      .addOrderBy('c.nombre', 'ASC');
    if (!includeInactive) qb.andWhere('c.activo = :a', { a: true });
    const components = await qb.getMany();
    const links = await this.speciesResultComponentRepo.find({
      where: { species_id: speciesId },
      relations: ['component'],
    });
    const active = new Set(links.filter((l) => l.activo).map((l) => Number(l.component_id)));
    return components.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      sort_order: c.sort_order,
      master_activo: c.activo,
      activo: active.has(Number(c.id)),
    }));
  }

  async updateSpeciesProcessResultComponents(speciesId: number, dto: UpdateSpeciesProcessComponentsDto) {
    const species = await this.speciesRepo.findOne({ where: { id: speciesId } });
    if (!species) throw new NotFoundException('Especie no encontrada');

    const all = await this.resultComponentRepo.find();
    const byId = new Map(all.map((c) => [c.id, c]));
    for (const id of dto.active_component_ids) {
      if (!byId.has(id)) throw new BadRequestException(`Componente ${id} no existe`);
    }
    const activeSet = new Set(dto.active_component_ids);
    const existing = await this.speciesResultComponentRepo.find({ where: { species_id: speciesId } });
    const existingByComp = new Map(existing.map((e) => [Number(e.component_id), e]));

    for (const c of all) {
      const row = existingByComp.get(Number(c.id));
      const next = activeSet.has(Number(c.id));
      if (!row) {
        await this.speciesResultComponentRepo.save(
          this.speciesResultComponentRepo.create({
            species_id: speciesId,
            component_id: c.id,
            activo: next,
          }),
        );
      } else if (row.activo !== next) {
        row.activo = next;
        await this.speciesResultComponentRepo.save(row);
      }
    }
    return this.listSpeciesProcessResultComponents(speciesId, true);
  }

  listProcessMachines(includeInactive = false) {
    return this.processMachineRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createProcessMachine(dto: CreateProcessMachineDto) {
    const codigo = dto.codigo.trim();
    const nombre = dto.nombre.trim();
    const dup = await this.processMachineRepo.findOne({ where: { codigo } });
    if (dup) throw new BadRequestException(`Ya existe una máquina con código ${codigo}`);
    const dupN = await this.processMachineRepo
      .createQueryBuilder('m')
      .where('LOWER(TRIM(m.nombre)) = LOWER(TRIM(:n))', { n: nombre })
      .getOne();
    if (dupN) throw new BadRequestException('Ya existe otra línea de proceso con el mismo nombre.');
    return this.processMachineRepo.save(
      this.processMachineRepo.create({
        codigo,
        nombre,
        kind: dto.kind,
      }),
    );
  }

  async updateProcessMachine(id: number, dto: UpdateProcessMachineDto) {
    const row = await this.processMachineRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Máquina / línea de proceso no encontrada');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateProcessMachine(id);
    }
    if (dto.codigo != null) {
      const c = dto.codigo.trim();
      const dup = await this.processMachineRepo.findOne({ where: { codigo: c } });
      if (dup && dup.id !== id) throw new BadRequestException(`Ya existe otra máquina con código ${c}`);
      row.codigo = c;
    }
    if (dto.nombre != null) {
      const nombre = dto.nombre.trim();
      const dupN = await this.processMachineRepo
        .createQueryBuilder('m')
        .where('LOWER(TRIM(m.nombre)) = LOWER(TRIM(:n))', { n: nombre })
        .andWhere('m.id != :id', { id })
        .getOne();
      if (dupN) throw new BadRequestException('Ya existe otra línea de proceso con el mismo nombre.');
      row.nombre = nombre;
    }
    if (dto.kind != null) row.kind = dto.kind;
    if (dto.activo != null) row.activo = dto.activo;
    return this.processMachineRepo.save(row);
  }

  async deleteProcessMachine(id: number) {
    const row = await this.processMachineRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Máquina / línea de proceso no encontrada');
    await this.masterUsage.assertCanDeactivateProcessMachine(id);
    try {
      await this.processMachineRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar esta línea de proceso porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  private isPgUniqueViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as { driverError?: { code?: string } }).driverError?.code === '23505';
  }

  private isPgForeignKeyViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as { driverError?: { code?: string } }).driverError?.code === '23503';
  }

  private parseInsertedRowId(result: unknown): number {
    if (Array.isArray(result) && result[0] && typeof result[0] === 'object' && result[0] !== null && 'id' in result[0]) {
      return Number((result[0] as { id: string | number }).id);
    }
    if (
      result &&
      typeof result === 'object' &&
      'rows' in result &&
      Array.isArray((result as { rows: { id: string | number }[] }).rows)
    ) {
      const id = (result as { rows: { id: string | number }[] }).rows[0]?.id;
      if (id != null) return Number(id);
    }
    return NaN;
  }

  /** Formato: [código productor]-[YYYYMMDD]-[NNN], único por día y productor. */
  private async allocateReceptionReferenceCode(
    em: EntityManager,
    producer: Producer,
    receivedAt: Date,
  ): Promise<string> {
    const pc = sanitizeProducerCodeForReference(producer);
    const dk = receptionDateKey(receivedAt);
    const prefix = `${pc}-${dk}`;
    const rows = (await em.query(
      `SELECT reference_code FROM receptions WHERE reference_code LIKE $1 ORDER BY reference_code DESC`,
      [`${prefix}-%`],
    )) as { reference_code: string }[];
    let max = 0;
    const re = new RegExp(`^${pc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${dk}-(\\d{3})$`);
    for (const r of rows) {
      const m = re.exec(r.reference_code);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const next = max + 1;
    return `${prefix}-${String(next).padStart(3, '0')}`;
  }

  private async insertReceptionLinesAndMovements(
    em: EntityManager,
    receptionId: number,
    lines: CreateReceptionLineDto[],
    receptionReference: string,
  ): Promise<{ sumGross: number; sumNet: number }> {
    if (!Number.isFinite(receptionId) || receptionId < 1) {
      throw new BadRequestException('reception_id inválido al guardar líneas.');
    }
    const ref = receptionReference?.trim();
    if (!ref) {
      throw new BadRequestException('Falta referencia de recepción para generar el lote de cada línea.');
    }
    let sumGross = 0;
    let sumNet = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const lineNum = i + 1;
      const sp = await em.findOne(Species, { where: { id: ln.species_id } });
      const v = await em.findOne(Variety, { where: { id: ln.variety_id } });
      if (!sp || !v) throw new BadRequestException(`Línea ${lineNum}: especie o variedad inválida`);
      if (v.species_id !== ln.species_id) {
        throw new BadRequestException(`Línea ${lineNum}: la variedad no corresponde a la especie seleccionada`);
      }
      const q = await em.findOne(QualityGrade, { where: { id: ln.quality_grade_id } });
      if (!q) throw new BadRequestException(`Línea ${lineNum}: calidad inválida`);
      const net = Number(ln.net_lb);
      if (!Number.isFinite(net) || net <= 0) {
        throw new BadRequestException(`Línea ${lineNum}: neto lb es obligatorio y debe ser mayor que 0`);
      }
      const qty = Number(ln.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        throw new BadRequestException(`Línea ${lineNum}: cantidad (lugs/envases) es obligatoria y debe ser un entero ≥ 1`);
      }
      const rcId = Number(ln.returnable_container_id);
      if (!Number.isFinite(rcId) || rcId < 1) {
        throw new BadRequestException(`Línea ${lineNum}: envase es obligatorio`);
      }
      const rc = await em.findOne(ReturnableContainer, { where: { id: rcId } });
      if (!rc) throw new BadRequestException(`Línea ${lineNum}: envase inválido`);

      const grossPart = ln.gross_lb != null ? Number(ln.gross_lb) : 0;
      const tarePart = ln.tare_lb != null ? Number(ln.tare_lb) : 0;
      if (grossPart > 0) sumGross += grossPart;
      sumNet += net;
      const formatCode = [rc.tipo, rc.capacidad].filter(Boolean).join(' · ') || rc.tipo;
      const lotCode = `${ref}-L${lineNum}`;
      /** INSERT explícito: si el `dist` compilado no incluye `lot_code` en la entidad, TypeORM omitía la columna. */
      const inserted = await em.query(
        `INSERT INTO reception_lines (
          reception_id, line_order, lot_code, species_id, variety_id, quality_grade_id,
          multivariety_note, format_code, returnable_container_id, quantity,
          gross_lb, tare_lb, net_lb, temperature_f
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          receptionId,
          i,
          lotCode,
          ln.species_id,
          ln.variety_id,
          ln.quality_grade_id,
          ln.multivariety_note?.trim() ?? null,
          formatCode,
          rcId,
          qty,
          grossPart.toFixed(3),
          tarePart.toFixed(3),
          net.toFixed(3),
          ln.temperature_f != null ? ln.temperature_f.toFixed(2) : null,
        ],
      );
      const lineRowId = this.parseInsertedRowId(inserted);
      if (!Number.isFinite(lineRowId)) {
        throw new BadRequestException('No se pudo insertar la línea de recepción');
      }
      await em.save(
        RawMaterialMovement,
        em.create(RawMaterialMovement, {
          reception_line_id: lineRowId,
          fruit_process_id: null,
          quantity_delta_lb: net.toFixed(3),
          movement_kind: 'reception_in',
          ref_type: 'reception',
          ref_id: receptionId,
        }),
      );
    }
    return { sumGross, sumNet };
  }

  private async updateReceptionLinesInPlace(
    em: EntityManager,
    receptionId: number,
    existingLines: ReceptionLine[],
    lines: CreateReceptionLineDto[],
    receptionReference: string,
  ): Promise<{ sumGross: number; sumNet: number }> {
    const ref = receptionReference?.trim();
    if (!ref) {
      throw new BadRequestException('Falta referencia de recepción para generar el lote de cada línea.');
    }
    if (existingLines.length !== lines.length) {
      throw new BadRequestException(
        'Esta recepción ya está vinculada a procesos. Solo podés editar las líneas existentes, sin agregar ni quitar líneas.',
      );
    }

    const ordered = [...existingLines].sort((a, b) => Number(a.line_order) - Number(b.line_order) || a.id - b.id);
    let sumGross = 0;
    let sumNet = 0;

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const lineNum = i + 1;
      const row = ordered[i];
      if (!row) throw new BadRequestException(`Línea ${lineNum}: no existe línea base para actualizar`);

      const sp = await em.findOne(Species, { where: { id: ln.species_id } });
      const v = await em.findOne(Variety, { where: { id: ln.variety_id } });
      if (!sp || !v) throw new BadRequestException(`Línea ${lineNum}: especie o variedad inválida`);
      if (v.species_id !== ln.species_id) {
        throw new BadRequestException(`Línea ${lineNum}: la variedad no corresponde a la especie seleccionada`);
      }
      const q = await em.findOne(QualityGrade, { where: { id: ln.quality_grade_id } });
      if (!q) throw new BadRequestException(`Línea ${lineNum}: calidad inválida`);
      const net = Number(ln.net_lb);
      if (!Number.isFinite(net) || net <= 0) {
        throw new BadRequestException(`Línea ${lineNum}: neto lb es obligatorio y debe ser mayor que 0`);
      }
      const qty = Number(ln.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        throw new BadRequestException(`Línea ${lineNum}: cantidad (lugs/envases) es obligatoria y debe ser un entero ≥ 1`);
      }
      const rcId = Number(ln.returnable_container_id);
      if (!Number.isFinite(rcId) || rcId < 1) {
        throw new BadRequestException(`Línea ${lineNum}: envase es obligatorio`);
      }
      const rc = await em.findOne(ReturnableContainer, { where: { id: rcId } });
      if (!rc) throw new BadRequestException(`Línea ${lineNum}: envase inválido`);

      const grossPart = ln.gross_lb != null ? Number(ln.gross_lb) : 0;
      const tarePart = ln.tare_lb != null ? Number(ln.tare_lb) : 0;
      if (grossPart > 0) sumGross += grossPart;
      sumNet += net;
      const formatCode = [rc.tipo, rc.capacidad].filter(Boolean).join(' · ') || rc.tipo;
      const lotCode = `${ref}-L${lineNum}`;

      await em.update(
        ReceptionLine,
        { id: row.id, reception_id: receptionId },
        {
          reception_id: receptionId,
          line_order: i,
          lot_code: lotCode,
          species_id: ln.species_id,
          variety_id: ln.variety_id,
          quality_grade_id: ln.quality_grade_id,
          multivariety_note: ln.multivariety_note?.trim() ?? null,
          format_code: formatCode,
          returnable_container_id: rcId,
          quantity: qty,
          gross_lb: grossPart.toFixed(3),
          tare_lb: tarePart.toFixed(3),
          net_lb: net.toFixed(3),
          temperature_f: ln.temperature_f != null ? ln.temperature_f.toFixed(2) : null,
        },
      );

      const existingMov = await em.findOne(RawMaterialMovement, {
        where: {
          reception_line_id: row.id,
          movement_kind: 'reception_in',
          ref_type: 'reception',
          ref_id: receptionId,
        },
        order: { id: 'ASC' },
      });
      if (existingMov) {
        existingMov.quantity_delta_lb = net.toFixed(3);
        await em.save(RawMaterialMovement, existingMov);
      } else {
        await em.save(
          RawMaterialMovement,
          em.create(RawMaterialMovement, {
            reception_line_id: row.id,
            fruit_process_id: null,
            quantity_delta_lb: net.toFixed(3),
            movement_kind: 'reception_in',
            ref_type: 'reception',
            ref_id: receptionId,
          }),
        );
      }
    }
    return { sumGross, sumNet };
  }

  private async syncProcessVarietyForReceptionLines(em: EntityManager, lineIds: number[]) {
    if (!lineIds.length) return;
    const processRows = (await em.query(
      `SELECT DISTINCT process_id FROM fruit_process_line_allocations WHERE reception_line_id = ANY($1::bigint[])
       UNION
       SELECT id AS process_id FROM fruit_processes WHERE reception_line_id = ANY($1::bigint[]) AND deleted_at IS NULL`,
      [lineIds],
    )) as { process_id: string | number }[];
    for (const pr of processRows) {
      const processId = Number(pr.process_id);
      if (!Number.isFinite(processId) || processId < 1) continue;
      const agg = (await em.query(
        `SELECT COUNT(DISTINCT rl.variety_id)::int AS variety_count,
                MIN(rl.variety_id)::bigint AS single_variety_id
         FROM fruit_process_line_allocations a
         JOIN reception_lines rl ON rl.id = a.reception_line_id
         WHERE a.process_id = $1`,
        [processId],
      )) as { variety_count: number | string; single_variety_id: number | string | null }[];
      const primary = (await em.query(
        `SELECT rl.variety_id
         FROM fruit_processes fp
         LEFT JOIN reception_lines rl ON rl.id = fp.reception_line_id
         WHERE fp.id = $1 AND fp.deleted_at IS NULL`,
        [processId],
      )) as { variety_id: number | string | null }[];

      let nextVarietyId: number | null = null;
      const varietyCount = Number(agg[0]?.variety_count ?? 0);
      const singleVariety = agg[0]?.single_variety_id != null ? Number(agg[0]?.single_variety_id) : null;
      if (varietyCount === 1 && singleVariety != null && Number.isFinite(singleVariety)) {
        nextVarietyId = singleVariety;
      } else {
        const primaryVariety = primary[0]?.variety_id != null ? Number(primary[0].variety_id) : null;
        if (primaryVariety != null && Number.isFinite(primaryVariety)) {
          nextVarietyId = primaryVariety;
        }
      }
      if (nextVarietyId != null) {
        await em.query(`UPDATE fruit_processes SET variedad_id = $2 WHERE id = $1 AND deleted_at IS NULL`, [
          processId,
          nextVarietyId,
        ]);
      }
    }
  }

  private assertFormatCode(code: string) {
    const c = code.trim();
    if (!FORMAT_CODE_RE.test(c) && !FORMAT_ALIAS_RE.test(c)) {
      throw new BadRequestException(
        'format_code debe ser NxMoz (ej. 4x16oz) o uno explícito permitido (PINTA REGULAR / PINTA LOW PROFILE).',
      );
    }
  }

  // --- Quality grades ---
  listQualityGrades(includeInactive = false) {
    return this.qualityRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createQualityGrade(dto: CreateQualityGradeDto) {
    const purpose = (dto.purpose?.trim() || 'both').toLowerCase();
    if (!['exportacion', 'proceso', 'both'].includes(purpose)) {
      throw new BadRequestException('purpose debe ser exportacion, proceso o both');
    }
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueQuality(codigo, nombre);
    return this.qualityRepo.save(
      this.qualityRepo.create({
        codigo,
        nombre,
        purpose,
      }),
    );
  }

  async updateQualityGrade(id: number, dto: UpdateQualityGradeDto) {
    const row = await this.qualityRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Calidad no encontrada');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateQualityGrade(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toUpperCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueQuality(nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.purpose != null) {
      const purpose = dto.purpose.trim().toLowerCase();
      if (!['exportacion', 'proceso', 'both'].includes(purpose)) {
        throw new BadRequestException('purpose debe ser exportacion, proceso o both');
      }
      row.purpose = purpose;
    }
    if (dto.activo != null) row.activo = dto.activo;
    return this.qualityRepo.save(row);
  }

  async deleteQualityGrade(id: number) {
    const row = await this.qualityRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Calidad no encontrada');
    await this.masterUsage.assertCanDeactivateQualityGrade(id);
    try {
      await this.qualityRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar esta calidad porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  // --- Species ---
  listSpecies(includeInactive = false) {
    return this.speciesRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createSpecies(dto: CreateSpeciesDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueSpecies(codigo, nombre);
    return this.speciesRepo.save(
      this.speciesRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updateSpecies(id: number, dto: UpdateSpeciesDto) {
    const row = await this.speciesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Especie no encontrada');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateSpecies(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toUpperCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueSpecies(nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.speciesRepo.save(row);
  }

  async deleteSpecies(id: number) {
    const row = await this.speciesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Especie no encontrada');
    await this.masterUsage.assertCanDeactivateSpecies(id);
    const varietyCount = await this.varietyRepo.count({ where: { species_id: id } });
    if (varietyCount > 0) {
      throw new BadRequestException(
        `No se puede borrar esta especie: tiene ${varietyCount} variedad(es) asociada(s).`,
      );
    }
    try {
      await this.speciesRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar esta especie porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  // --- Producers ---
  listProducers(includeInactive = false) {
    return this.producerRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createProducer(dto: CreateProducerDto) {
    const codigo = dto.codigo?.trim() || null;
    const nombre = dto.nombre.trim();
    await this.assertUniqueProducer(codigo, nombre);
    return this.producerRepo.save(
      this.producerRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updateProducer(id: number, dto: UpdateProducerDto) {
    const row = await this.producerRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Productor no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateProducer(id);
    }
    const nextCodigo = dto.codigo !== undefined ? dto.codigo?.trim() || null : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo !== undefined || dto.nombre != null) {
      await this.assertUniqueProducer(nextCodigo, nextNombre, id);
    }
    if (dto.codigo !== undefined) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.producerRepo.save(row);
  }

  async deleteProducer(id: number) {
    const row = await this.producerRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Productor no encontrado');
    await this.masterUsage.assertCanDeactivateProducer(id);
    try {
      await this.producerRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este productor porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  // --- Varieties ---
  listVarieties(speciesId?: number, includeInactive = false) {
    const where: Record<string, unknown> = {};
    if (speciesId != null) where.species_id = speciesId;
    if (!includeInactive) where.activo = true;
    return this.varietyRepo.find({
      where: where as { species_id?: number; activo?: boolean },
      relations: ['species'],
      order: { nombre: 'ASC' },
    });
  }

  async createVariety(dto: CreateVarietyDto) {
    const sp = await this.speciesRepo.findOne({ where: { id: dto.species_id } });
    if (!sp) throw new BadRequestException('species_id inválido');
    const codigo = dto.codigo?.trim() || null;
    const nombre = dto.nombre.trim();
    await this.assertUniqueVariety(dto.species_id, codigo, nombre);
    return this.varietyRepo.save(
      this.varietyRepo.create({
        species_id: dto.species_id,
        codigo,
        nombre,
      }),
    );
  }

  async updateVariety(id: number, dto: UpdateVarietyDto) {
    const row = await this.varietyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Variedad no encontrada');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateVariety(id);
    }
    if (dto.species_id != null) {
      const sp = await this.speciesRepo.findOne({ where: { id: dto.species_id } });
      if (!sp) throw new BadRequestException('species_id inválido');
      row.species_id = dto.species_id;
    }
    const nextCodigo = dto.codigo !== undefined ? dto.codigo?.trim() || null : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo !== undefined || dto.nombre != null || dto.species_id != null) {
      await this.assertUniqueVariety(row.species_id, nextCodigo, nextNombre, id);
    }
    if (dto.codigo !== undefined) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.varietyRepo.save(row);
  }

  async deleteVariety(id: number) {
    const row = await this.varietyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Variedad no encontrada');
    await this.masterUsage.assertCanDeactivateVariety(id);
    try {
      await this.varietyRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar esta variedad porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  // --- Presentation formats ---
  listPresentationFormats(includeInactive = false) {
    return this.formatRepo.find({
      where: includeInactive ? {} : { activo: true },
      relations: ['species'],
      order: { format_code: 'ASC' },
    });
  }

  async createPresentationFormat(dto: CreatePresentationFormatDto) {
    const code = dto.format_code.trim();
    this.assertFormatCode(code);
    const dupFc = await this.formatRepo
      .createQueryBuilder('f')
      .where('LOWER(TRIM(f.format_code)) = LOWER(TRIM(:code))', { code })
      .getOne();
    if (dupFc) throw new BadRequestException(`Ya existe un formato con código ${dupFc.format_code}`);
    if (dto.species_id != null) {
      const sp = await this.speciesRepo.findOne({ where: { id: dto.species_id } });
      if (!sp) throw new BadRequestException('species_id inválido');
    }
    const descripcion = dto.descripcion?.trim() || null;
    if (descripcion != null && descripcion !== '') {
      const sid = dto.species_id ?? null;
      const qb = this.formatRepo
        .createQueryBuilder('f')
        .where('LOWER(TRIM(f.descripcion)) = LOWER(TRIM(:d))', { d: descripcion });
      if (sid == null) qb.andWhere('f.species_id IS NULL');
      else qb.andWhere('f.species_id = :sid', { sid });
      if (await qb.getOne()) throw new BadRequestException('Ya existe otro formato con la misma descripción para esta especie.');
    }
    return this.formatRepo.save(
      this.formatRepo.create({
        format_code: code,
        species_id: dto.species_id ?? null,
        descripcion,
        net_weight_lb_per_box: dto.net_weight_lb_per_box.toFixed(4),
        max_boxes_per_pallet: dto.max_boxes_per_pallet ?? null,
        box_kind: dto.box_kind ?? null,
        clamshell_label_kind: dto.clamshell_label_kind ?? null,
      }),
    );
  }

  async updatePresentationFormat(id: number, dto: UpdatePresentationFormatDto) {
    const row = await this.formatRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Formato no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivatePresentationFormat(id);
    }
    if (dto.format_code != null) {
      const code = dto.format_code.trim();
      this.assertFormatCode(code);
      const dup = await this.formatRepo
        .createQueryBuilder('f')
        .where('LOWER(TRIM(f.format_code)) = LOWER(TRIM(:code))', { code })
        .getOne();
      if (dup && dup.id !== id) throw new BadRequestException(`Ya existe otro formato con código ${dup.format_code}`);
      row.format_code = code;
    }
    if (dto.species_id !== undefined) {
      if (dto.species_id != null) {
        const sp = await this.speciesRepo.findOne({ where: { id: dto.species_id } });
        if (!sp) throw new BadRequestException('species_id inválido');
        row.species_id = dto.species_id;
      } else {
        row.species_id = null;
      }
    }
    if (dto.descripcion !== undefined) row.descripcion = dto.descripcion?.trim() || null;
    if (dto.net_weight_lb_per_box != null) {
      row.net_weight_lb_per_box = dto.net_weight_lb_per_box.toFixed(4);
    }
    if (dto.max_boxes_per_pallet !== undefined) {
      row.max_boxes_per_pallet = dto.max_boxes_per_pallet;
    }
    if (dto.box_kind !== undefined) row.box_kind = dto.box_kind;
    if (dto.clamshell_label_kind !== undefined) row.clamshell_label_kind = dto.clamshell_label_kind;
    if (dto.activo != null) row.activo = dto.activo;
    const d = row.descripcion;
    if (d != null && d !== '') {
      const sid = row.species_id;
      const qb = this.formatRepo
        .createQueryBuilder('f')
        .where('LOWER(TRIM(f.descripcion)) = LOWER(TRIM(:desc))', { desc: d })
        .andWhere('f.id != :id', { id });
      if (sid == null) qb.andWhere('f.species_id IS NULL');
      else qb.andWhere('f.species_id = :sid', { sid });
      if (await qb.getOne()) throw new BadRequestException('Ya existe otro formato con la misma descripción para esta especie.');
    }
    return this.formatRepo.save(row);
  }

  async deletePresentationFormat(id: number) {
    const row = await this.formatRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Formato no encontrado');
    await this.masterUsage.assertCanDeactivatePresentationFormat(id);
    try {
      await this.formatRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este formato porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  // --- Receptions ---
  private receptionRelations = [
    'producer',
    'variety',
    'variety.species',
    'document_state',
    'reception_type',
    'mercado',
    'lines',
    'lines.species',
    'lines.variety',
    'lines.quality_grade',
    'lines.returnable_container',
  ] as const;

  listReceptions() {
    return this.receptionRepo.find({
      relations: [...this.receptionRelations],
      order: { id: 'DESC' },
      take: 500,
    });
  }

  async getReception(id: number) {
    const r = await this.receptionRepo.findOne({
      where: { id },
      relations: [...this.receptionRelations],
    });
    if (!r) throw new NotFoundException('Recepción no encontrada');
    return r;
  }

  private async resolveDocumentStateForDto(dto: CreateReceptionDto): Promise<DocumentState> {
    if (dto.document_state_id != null) {
      const ds = await this.documentStateRepo.findOne({ where: { id: dto.document_state_id } });
      if (!ds) throw new BadRequestException('document_state_id inválido');
      return ds;
    }
    const def = await this.documentStateRepo.findOne({ where: { codigo: 'borrador' } });
    if (!def) throw new BadRequestException('Estado borrador no configurado en catálogo');
    return def;
  }

  private async resolveReceptionTypeForDto(dto: CreateReceptionDto): Promise<ReceptionType> {
    if (dto.reception_type_id != null) {
      const rt = await this.receptionTypeRepo.findOne({ where: { id: dto.reception_type_id } });
      if (!rt) throw new BadRequestException('reception_type_id inválido');
      return rt;
    }
    const def = await this.receptionTypeRepo.findOne({ where: { codigo: 'hand_picking' } });
    if (!def) throw new BadRequestException('Tipo de recepción por defecto no configurado');
    return def;
  }

  private async resolveMercadoIdForDto(dto: CreateReceptionDto): Promise<number | null> {
    if (dto.mercado_id === null) return null;
    if (dto.mercado_id !== undefined && dto.mercado_id > 0) {
      const m = await this.mercadoRepo.findOne({ where: { id: dto.mercado_id } });
      if (!m) throw new BadRequestException('mercado_id inválido');
      return m.id;
    }
    const usa = await this.mercadoRepo.findOne({ where: { codigo: 'USA' } });
    return usa?.id ?? null;
  }

  async createReception(dto: CreateReceptionDto) {
    const pr = await this.producerRepo.findOne({ where: { id: dto.producer_id } });
    if (!pr) throw new BadRequestException('producer_id inválido');

    const lines = dto.lines ?? [];
    const headerVarietyId = lines.length > 0 ? lines[0].variety_id : dto.variety_id;
    if (headerVarietyId == null) {
      throw new BadRequestException('variety_id o al menos una línea con variedad es requerido');
    }

    const va = await this.varietyRepo.findOne({ where: { id: headerVarietyId } });
    if (!va) throw new BadRequestException('variety_id inválido');

    const weightBasis = (dto.weight_basis?.trim() || 'net_lb').toLowerCase();
    if (!WEIGHT_BASIS.has(weightBasis)) {
      throw new BadRequestException('weight_basis debe ser net_lb o gross_lb');
    }
    const qualityIntent = (dto.quality_intent?.trim() || 'exportacion').toLowerCase();
    if (!QUALITY_INTENTS.has(qualityIntent)) {
      throw new BadRequestException('quality_intent debe ser exportacion o proceso');
    }

    const docState = await this.resolveDocumentStateForDto(dto);
    const recType = await this.resolveReceptionTypeForDto(dto);
    const mercadoId = await this.resolveMercadoIdForDto(dto);

    if (lines.length === 0 && docState.codigo !== 'borrador') {
      throw new BadRequestException('Recepción sin líneas solo puede guardarse como borrador');
    }

    return this.receptionRepo.manager.transaction(async (em) => {
      let saved: Reception | null = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const ref = await this.allocateReceptionReferenceCode(em, pr, new Date(dto.received_at));
        const rec = em.create(Reception, {
          received_at: new Date(dto.received_at),
          document_number: dto.document_number?.trim() || null,
          producer_id: dto.producer_id,
          variety_id: headerVarietyId,
          gross_weight_lb: dto.gross_weight_lb != null ? dto.gross_weight_lb.toFixed(2) : null,
          net_weight_lb: dto.net_weight_lb != null ? dto.net_weight_lb.toFixed(2) : null,
          notes: dto.notes?.trim() || null,
          reference_code: ref,
          plant_code: dto.plant_code?.trim() || null,
          mercado_id: mercadoId,
          lbs_reference: dto.lbs_reference != null ? dto.lbs_reference.toFixed(2) : null,
          lbs_difference: dto.lbs_difference != null ? dto.lbs_difference.toFixed(2) : null,
          document_state_id: docState.id,
          reception_type_id: recType.id,
          weight_basis: weightBasis,
          quality_intent: qualityIntent,
        });
        try {
          saved = await em.save(Reception, rec);
          break;
        } catch (e) {
          if (!this.isPgUniqueViolation(e)) throw e;
          if (attempt === 11) throw new BadRequestException('No se pudo asignar referencia única; reintentá.');
        }
      }
      if (!saved) throw new BadRequestException('No se pudo crear la recepción');
      const refCode = saved.reference_code!;

      if (lines.length > 0) {
        const { sumGross, sumNet } = await this.insertReceptionLinesAndMovements(em, saved.id, lines, refCode);
        saved.gross_weight_lb = sumGross > 0 ? sumGross.toFixed(2) : null;
        saved.net_weight_lb = sumNet.toFixed(2);
        await em.save(Reception, saved);
      }

      const out = await em.findOne(Reception, {
        where: { id: saved.id },
        relations: [...this.receptionRelations],
      });
      if (!out) throw new NotFoundException('Recepción no encontrada tras guardar');
      return out;
    });
  }

  async updateReception(id: number, dto: UpdateReceptionDto) {
    const existing = await this.receptionRepo.findOne({
      where: { id },
      relations: ['lines', 'document_state'],
    });
    if (!existing) throw new NotFoundException('Recepción no encontrada');
    if (existing.document_state.codigo !== 'borrador') {
      throw new BadRequestException('Solo se pueden editar recepciones en estado borrador');
    }

    const pr = await this.producerRepo.findOne({ where: { id: dto.producer_id } });
    if (!pr) throw new BadRequestException('producer_id inválido');

    const lines = dto.lines ?? [];
    const headerVarietyId = lines.length > 0 ? lines[0].variety_id : dto.variety_id;
    if (headerVarietyId == null) {
      throw new BadRequestException('variety_id o al menos una línea con variedad es requerido');
    }

    const va = await this.varietyRepo.findOne({ where: { id: headerVarietyId } });
    if (!va) throw new BadRequestException('variety_id inválido');

    const weightBasis = (dto.weight_basis?.trim() || 'net_lb').toLowerCase();
    if (!WEIGHT_BASIS.has(weightBasis)) {
      throw new BadRequestException('weight_basis debe ser net_lb o gross_lb');
    }
    const qualityIntent = (dto.quality_intent?.trim() || 'exportacion').toLowerCase();
    if (!QUALITY_INTENTS.has(qualityIntent)) {
      throw new BadRequestException('quality_intent debe ser exportacion o proceso');
    }

    const newDocState = await this.resolveDocumentStateForDto(dto);
    this.assertReceptionStateTransition(existing.document_state.codigo, newDocState.codigo);
    const recType = await this.resolveReceptionTypeForDto(dto);
    const mercadoId = await this.resolveMercadoIdForDto(dto);

    if (lines.length === 0 && newDocState.codigo !== 'borrador') {
      throw new BadRequestException('Recepción sin líneas solo puede guardarse como borrador');
    }

    return this.receptionRepo.manager.transaction(async (em) => {
      const existingLinesSnapshot = [...(existing.lines ?? [])];
      const lineIds = existingLinesSnapshot.map((l) => l.id);
      const linkedLineIds = new Set<number>();
      if (lineIds.length) {
        const linkedRows = (await em.query(
          `SELECT DISTINCT reception_line_id
           FROM fruit_processes
           WHERE reception_line_id = ANY($1::bigint[])`,
          [lineIds],
        )) as { reception_line_id: string | number }[];
        for (const row of linkedRows) linkedLineIds.add(Number(row.reception_line_id));
      }
      /** Si dejamos `lines` en el entity, un `save(Reception)` puede intentar insertar hijos huérfanos tras DELETE+INSERT. */
      delete (existing as Reception & { lines?: ReceptionLine[] }).lines;

      existing.received_at = new Date(dto.received_at);
      existing.document_number = dto.document_number?.trim() || null;
      existing.producer_id = dto.producer_id;
      existing.variety_id = headerVarietyId;
      existing.gross_weight_lb = dto.gross_weight_lb != null ? dto.gross_weight_lb.toFixed(2) : null;
      existing.net_weight_lb = dto.net_weight_lb != null ? dto.net_weight_lb.toFixed(2) : null;
      existing.notes = dto.notes?.trim() || null;
      existing.plant_code = dto.plant_code?.trim() || null;
      existing.mercado_id = mercadoId;
      existing.lbs_reference = dto.lbs_reference != null ? dto.lbs_reference.toFixed(2) : null;
      existing.lbs_difference = dto.lbs_difference != null ? dto.lbs_difference.toFixed(2) : null;
      existing.document_state_id = newDocState.id;
      existing.reception_type_id = recType.id;
      existing.weight_basis = weightBasis;
      existing.quality_intent = qualityIntent;

      const needsRefAlloc = lines.length > 0 && !existing.reference_code?.trim();
      let saved: Reception | undefined;
      if (needsRefAlloc) {
        for (let attempt = 0; attempt < 12; attempt++) {
          existing.reference_code = await this.allocateReceptionReferenceCode(em, pr, new Date(dto.received_at));
          try {
            saved = await em.save(Reception, existing);
            break;
          } catch (e) {
            if (!this.isPgUniqueViolation(e)) throw e;
            if (attempt === 11) throw new BadRequestException('No se pudo asignar referencia única; reintentá.');
          }
        }
      } else {
        saved = await em.save(Reception, existing);
      }
      if (!saved) throw new BadRequestException('No se pudo guardar la recepción');

      const finalRef = saved.reference_code?.trim();
      if (lines.length > 0 && !finalRef) {
        throw new BadRequestException('Falta referencia de recepción para las líneas');
      }

      if (lines.length > 0) {
        const receptionId = Number(saved.id ?? id);
        if (!Number.isFinite(receptionId) || receptionId < 1) {
          throw new BadRequestException('No se pudo resolver el ID de recepción para guardar líneas.');
        }
        let sumGross = 0;
        let sumNet = 0;
        if (linkedLineIds.size > 0) {
          const totals = await this.updateReceptionLinesInPlace(em, receptionId, existingLinesSnapshot, lines, finalRef!);
          await this.syncProcessVarietyForReceptionLines(em, Array.from(linkedLineIds));
          sumGross = totals.sumGross;
          sumNet = totals.sumNet;
        } else {
          if (lineIds.length) {
            await em.delete(RawMaterialMovement, { reception_line_id: In(lineIds) });
            await em.delete(ReceptionLine, { reception_id: id });
          }
          const totals = await this.insertReceptionLinesAndMovements(em, receptionId, lines, finalRef!);
          sumGross = totals.sumGross;
          sumNet = totals.sumNet;
        }
        saved.gross_weight_lb = sumGross > 0 ? sumGross.toFixed(2) : null;
        saved.net_weight_lb = sumNet.toFixed(2);
        await em.save(Reception, saved);
      } else {
        if (linkedLineIds.size > 0) {
          throw new BadRequestException('No se pueden quitar todas las líneas: esta recepción ya tiene procesos vinculados.');
        }
        if (lineIds.length) {
          await em.delete(RawMaterialMovement, { reception_line_id: In(lineIds) });
          await em.delete(ReceptionLine, { reception_id: id });
        }
        saved.gross_weight_lb = dto.gross_weight_lb != null ? dto.gross_weight_lb.toFixed(2) : null;
        saved.net_weight_lb = dto.net_weight_lb != null ? dto.net_weight_lb.toFixed(2) : null;
        await em.save(Reception, saved);
      }

      const out = await em.findOne(Reception, {
        where: { id: saved.id },
        relations: [...this.receptionRelations],
      });
      if (!out) throw new NotFoundException('Recepción no encontrada tras guardar');
      return out;
    });
  }

  async transitionReceptionState(id: number, dto: TransitionReceptionStateDto) {
    const r = await this.receptionRepo.findOne({
      where: { id },
      relations: ['document_state', 'lines'],
    });
    if (!r) throw new NotFoundException('Recepción no encontrada');
    const next = await this.documentStateRepo.findOne({ where: { id: dto.document_state_id } });
    if (!next) throw new BadRequestException('document_state_id inválido');
    this.assertReceptionStateTransition(r.document_state.codigo, next.codigo);
    if (next.codigo === 'confirmado') {
      if (!r.lines?.length) {
        throw new BadRequestException('No se puede confirmar una recepción sin líneas de detalle.');
      }
      if (!r.reference_code?.trim()) {
        throw new BadRequestException('No se puede confirmar sin referencia asignada.');
      }
    }
    r.document_state_id = next.id;
    await this.receptionRepo.save(r);
    return this.getReception(id);
  }

  async assertReceptionExists(id: number): Promise<Reception> {
    const r = await this.receptionRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Recepción no encontrada');
    return r;
  }

  async assertReceptionLine(receptionId: number, lineId: number): Promise<ReceptionLine> {
    const line = await this.receptionLineRepo.findOne({ where: { id: lineId, reception_id: receptionId } });
    if (!line) throw new BadRequestException('reception_line_id no pertenece a esta recepción');
    return line;
  }
}
