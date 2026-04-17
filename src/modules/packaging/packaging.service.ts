import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  AddRecipeItemDto,
  CreateConsumptionDto,
  CreateMaterialDto,
  CreateRecipeDto,
  RecordMaterialMovementDto,
  UpdateMaterialDto,
  UpdateRecipeItemDto,
} from './packaging.dto';
import { MaterialCategory as MaterialCategoryEntity } from '../traceability/catalog.entities';
import { Brand, Client } from '../traceability/operational.entities';
import { PresentationFormat } from '../traceability/traceability.entities';
import {
  MATERIAL_CATEGORY_CODES,
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingMaterialMovement,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from './packaging.entities';
import { PtTag } from '../process/process.entities';

@Injectable()
export class PackagingService {
  constructor(
    @InjectRepository(PackagingMaterial) private readonly materialRepo: Repository<PackagingMaterial>,
    @InjectRepository(PackagingRecipe) private readonly recipeRepo: Repository<PackagingRecipe>,
    @InjectRepository(PackagingRecipeItem) private readonly recipeItemRepo: Repository<PackagingRecipeItem>,
    @InjectRepository(PackagingPalletConsumption) private readonly consumptionRepo: Repository<PackagingPalletConsumption>,
    @InjectRepository(PackagingCostBreakdown) private readonly breakdownRepo: Repository<PackagingCostBreakdown>,
    @InjectRepository(PackagingMaterialMovement) private readonly movementRepo: Repository<PackagingMaterialMovement>,
    @InjectRepository(MaterialCategoryEntity) private readonly materialCategoryRepo: Repository<MaterialCategoryEntity>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(PtTag) private readonly ptTagRepo: Repository<PtTag>,
    @InjectRepository(PresentationFormat) private readonly presentationFormatRepo: Repository<PresentationFormat>,
    private readonly dataSource: DataSource,
  ) {}

  private async logMaterialMovement(
    materialId: number,
    quantityDelta: number,
    refType: string,
    refId: number,
    nota?: string,
  ) {
    await this.logMaterialMovementTx(this.dataSource.manager, materialId, quantityDelta, refType, refId, nota);
  }

  private async logMaterialMovementTx(
    em: EntityManager,
    materialId: number,
    quantityDelta: number,
    refType: string,
    refId: number,
    nota?: string,
  ) {
    await em.save(
      em.create(PackagingMaterialMovement, {
        material_id: materialId,
        quantity_delta: quantityDelta.toFixed(4),
        ref_type: refType,
        ref_id: refId,
        nota: nota ?? null,
      }),
    );
  }

  private async findMaterialByCategoryCodigoTx(em: EntityManager, codigo: string) {
    const cat = await em.findOne(MaterialCategoryEntity, { where: { codigo } });
    if (!cat) return null;
    return em.findOne(PackagingMaterial, {
      where: { material_category_id: cat.id, activo: true },
      order: { id: 'ASC' },
    });
  }

  private async resolveRecipeForTagTx(
    em: EntityManager,
    tag: PtTag,
    preferredRecipeId?: number,
  ): Promise<PackagingRecipe> {
    const tagFormat = tag.format_code?.trim().toLowerCase();
    if (!tagFormat) throw new BadRequestException('Tarja sin formato válido');
    const pf = await em.findOne(PresentationFormat, { where: { format_code: tagFormat, activo: true } });
    if (!pf) throw new BadRequestException(`Formato ${tag.format_code} no encontrado o inactivo`);
    const tagBrandId = tag.brand_id != null ? Number(tag.brand_id) : null;

    const recipeMatchesTag = (r: PackagingRecipe | null): r is PackagingRecipe =>
      !!r &&
      r.activo &&
      Number(r.presentation_format_id) === Number(pf.id) &&
      (tagBrandId == null || r.brand_id == null || Number(r.brand_id) === tagBrandId);

    if (preferredRecipeId != null) {
      const preferred = await em.findOne(PackagingRecipe, { where: { id: preferredRecipeId } });
      if (recipeMatchesTag(preferred)) return preferred;
    }

    if (tagBrandId != null) {
      const branded = await em.findOne(PackagingRecipe, {
        where: { presentation_format_id: Number(pf.id), brand_id: tagBrandId, activo: true },
        order: { id: 'DESC' },
      });
      if (branded) return branded;
    }

    const generic = await em.findOne(PackagingRecipe, {
      where: { presentation_format_id: Number(pf.id), brand_id: IsNull(), activo: true },
      order: { id: 'DESC' },
    });
    if (generic) return generic;

    throw new BadRequestException(
      `No hay receta activa para formato ${tag.format_code}${tagBrandId != null ? ' y marca de la tarja' : ''}.`,
    );
  }

  private async appliedConsumptionDeltaByMaterialTx(em: EntityManager, consumptionId: number): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    const movementRows = await em.find(PackagingMaterialMovement, {
      where: { ref_id: consumptionId },
      order: { id: 'ASC' },
    });
    for (const mv of movementRows) {
      if (mv.ref_type !== 'consumption' && mv.ref_type !== 'consumption_revert') continue;
      const materialId = Number(mv.material_id);
      const delta = Number(mv.quantity_delta) || 0;
      out.set(materialId, (out.get(materialId) ?? 0) + delta);
    }
    if (out.size > 0) return out;

    // Compatibilidad con históricos sin movimientos por consumo: usar breakdown actual.
    const breakdowns = await em.find(PackagingCostBreakdown, { where: { consumption_id: consumptionId } });
    for (const b of breakdowns) {
      const materialId = Number(b.material_id);
      const qty = Number(b.qty_used) || 0;
      if (qty <= 0) continue;
      out.set(materialId, (out.get(materialId) ?? 0) - qty);
    }
    return out;
  }

  private async revertConsumptionEffectTx(em: EntityManager, consumption: PackagingPalletConsumption) {
    const applied = await this.appliedConsumptionDeltaByMaterialTx(em, Number(consumption.id));
    for (const [materialId, netDelta] of applied.entries()) {
      if (!Number.isFinite(netDelta) || Math.abs(netDelta) < 1e-9) continue;
      const revertDelta = -netDelta;
      const material = await em.findOne(PackagingMaterial, { where: { id: materialId } });
      if (!material) continue;
      const next = Number(material.cantidad_disponible) + revertDelta;
      if (!Number.isFinite(next) || next < 0) {
        throw new BadRequestException(`No se pudo revertir consumo #${consumption.id}: stock negativo en material ${materialId}.`);
      }
      material.cantidad_disponible = next.toFixed(3);
      await em.save(material);
      await this.logMaterialMovementTx(
        em,
        materialId,
        revertDelta,
        'consumption_revert',
        Number(consumption.id),
        'Reversa automática previa a recálculo/depuración',
      );
    }
    await em.delete(PackagingCostBreakdown, { consumption_id: Number(consumption.id) });
  }

  private async purgeConsumptionDuplicateTx(em: EntityManager, consumptionId: number) {
    const consumption = await em.findOne(PackagingPalletConsumption, { where: { id: consumptionId } });
    if (!consumption) return;
    await this.revertConsumptionEffectTx(em, consumption);
    await em.delete(PackagingPalletConsumption, { id: Number(consumption.id) });
  }

  private async recalculateConsumptionTx(em: EntityManager, consumptionId: number) {
    const consumption = await em.findOne(PackagingPalletConsumption, { where: { id: consumptionId } });
    if (!consumption) throw new NotFoundException('Consumo no encontrado');
    const tag = await em.findOne(PtTag, { where: { id: Number(consumption.tarja_id) } });
    if (!tag) throw new BadRequestException(`Tarja ${consumption.tarja_id} no encontrada`);
    await this.revertConsumptionEffectTx(em, consumption);

    const recipe = await this.resolveRecipeForTagTx(em, tag, Number(consumption.recipe_id));
    const recipeItems = await em.find(PackagingRecipeItem, { where: { recipe_id: recipe.id } });
    if (!recipeItems.length) throw new BadRequestException(`La receta ${recipe.id} no tiene materiales`);

    const recipeMaterialIds = [...new Set(recipeItems.map((i) => Number(i.material_id)))];
    const materialsForRecipe = await em.find(PackagingMaterial, {
      where: { id: In(recipeMaterialIds) },
      relations: ['material_category'],
    });
    const matById = new Map(materialsForRecipe.map((m) => [Number(m.id), m]));
    const fromRecipe = this.sumRecipeQtyByCategoryCodes(
      recipeItems,
      matById,
      Number(consumption.boxes_count) || 0,
      Number(consumption.pallet_count) || 0,
    );

    const existingTape = Number(consumption.tape_linear_meters) || 0;
    const existingLabels = Number(consumption.labels_qty) || 0;
    const existingCorner = Number(consumption.corner_boards_qty) || 0;
    const storedTapeMeters = fromRecipe.tapeMeters > 0 ? fromRecipe.tapeMeters : Math.max(0, existingTape);
    const storedLabelsQty = fromRecipe.labelsQty > 0 ? Math.round(fromRecipe.labelsQty) : Math.max(0, existingLabels);
    const storedCornerQty = fromRecipe.cornerQty > 0 ? Math.round(fromRecipe.cornerQty) : Math.max(0, existingCorner);

    let total = 0;
    const breakdowns: PackagingCostBreakdown[] = [];
    for (const item of recipeItems) {
      const material = await em.findOne(PackagingMaterial, { where: { id: item.material_id } });
      if (!material) throw new NotFoundException(`Material ${item.material_id} no existe`);
      const qtyFactor = item.base_unidad === 'box' ? Number(consumption.boxes_count) || 0 : Number(consumption.pallet_count) || 0;
      const qtyUsed = Number(item.qty_per_unit) * qtyFactor;
      const lineTotal = qtyUsed * Number(material.costo_unitario);
      if (Number(material.cantidad_disponible) < qtyUsed) {
        throw new BadRequestException(`Inventario insuficiente para ${material.nombre_material}`);
      }
      material.cantidad_disponible = (Number(material.cantidad_disponible) - qtyUsed).toFixed(3);
      await em.save(material);
      await this.logMaterialMovementTx(em, Number(material.id), -qtyUsed, 'consumption', Number(consumption.id), 'Recálculo');
      total += lineTotal;
      breakdowns.push(
        em.create(PackagingCostBreakdown, {
          consumption_id: Number(consumption.id),
          material_id: Number(material.id),
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(material.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    const tapeMat = await this.findMaterialByCategoryCodigoTx(em, MATERIAL_CATEGORY_CODES.TAPE);
    if (tapeMat && storedTapeMeters > 0 && fromRecipe.tapeMeters <= 0) {
      const qtyUsed = storedTapeMeters;
      const lineTotal = qtyUsed * Number(tapeMat.costo_unitario);
      if (Number(tapeMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de tape');
      tapeMat.cantidad_disponible = (Number(tapeMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await em.save(tapeMat);
      await this.logMaterialMovementTx(em, Number(tapeMat.id), -qtyUsed, 'consumption', Number(consumption.id), 'Recálculo');
      total += lineTotal;
      breakdowns.push(
        em.create(PackagingCostBreakdown, {
          consumption_id: Number(consumption.id),
          material_id: Number(tapeMat.id),
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(tapeMat.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    const cornerMat = await this.findMaterialByCategoryCodigoTx(em, MATERIAL_CATEGORY_CODES.CORNER_BOARD);
    if (cornerMat && storedCornerQty > 0 && fromRecipe.cornerQty <= 0) {
      const qtyUsed = storedCornerQty;
      const lineTotal = qtyUsed * Number(cornerMat.costo_unitario);
      if (Number(cornerMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de corner board');
      cornerMat.cantidad_disponible = (Number(cornerMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await em.save(cornerMat);
      await this.logMaterialMovementTx(em, Number(cornerMat.id), -qtyUsed, 'consumption', Number(consumption.id), 'Recálculo');
      total += lineTotal;
      breakdowns.push(
        em.create(PackagingCostBreakdown, {
          consumption_id: Number(consumption.id),
          material_id: Number(cornerMat.id),
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(cornerMat.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    const labelMat = await this.findMaterialByCategoryCodigoTx(em, MATERIAL_CATEGORY_CODES.ETIQUETA);
    if (labelMat && storedLabelsQty > 0 && fromRecipe.labelsQty <= 0) {
      const qtyUsed = storedLabelsQty;
      const lineTotal = qtyUsed * Number(labelMat.costo_unitario);
      if (Number(labelMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de etiquetas');
      labelMat.cantidad_disponible = (Number(labelMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await em.save(labelMat);
      await this.logMaterialMovementTx(em, Number(labelMat.id), -qtyUsed, 'consumption', Number(consumption.id), 'Recálculo');
      total += lineTotal;
      breakdowns.push(
        em.create(PackagingCostBreakdown, {
          consumption_id: Number(consumption.id),
          material_id: Number(labelMat.id),
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(labelMat.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    await em.save(PackagingCostBreakdown, breakdowns);
    consumption.recipe_id = Number(recipe.id);
    consumption.tape_linear_meters = storedTapeMeters.toFixed(3);
    consumption.labels_qty = storedLabelsQty;
    consumption.corner_boards_qty = storedCornerQty;
    consumption.material_cost_total = total.toFixed(2);
    await em.save(consumption);

    return {
      consumption_id: Number(consumption.id),
      tarja_id: Number(consumption.tarja_id),
      recipe_id: Number(recipe.id),
      total_cost: Number(total.toFixed(2)),
    };
  }

  private normalizeIdList(values: number[] | null | undefined): number[] {
    if (!values || values.length === 0) return [];
    return [...new Set(values.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0).map((x) => Math.floor(x)))];
  }

  private parseBigintArray(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    return values
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n));
  }

  private async assertActiveFormatIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.presentationFormatRepo.find({
      where: { id: In(ids), activo: true },
      select: { id: true },
    });
    if (rows.length !== ids.length) throw new BadRequestException('Hay presentation_format_ids inválidos o inactivos.');
  }

  private async assertClientIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.clientRepo.find({
      where: { id: In(ids) },
      select: { id: true },
    });
    if (rows.length !== ids.length) throw new BadRequestException('Hay client_ids inválidos.');
  }

  async createMaterial(dto: CreateMaterialDto) {
    const cat = await this.materialCategoryRepo.findOne({ where: { id: dto.material_category_id } });
    if (!cat) throw new BadRequestException('material_category_id inválido');
    const normalizedName = dto.nombre_material.trim().toLowerCase();
    if (!normalizedName) throw new BadRequestException('nombre_material requerido');
    const dup = await this.materialRepo
      .createQueryBuilder('m')
      .where('LOWER(TRIM(m.nombre_material)) = :n', { n: normalizedName })
      .andWhere('m.activo = true')
      .getOne();
    if (dup) {
      throw new BadRequestException(`Ya existe un material activo con ese nombre (ID ${dup.id}).`);
    }
    const singleFormatId =
      dto.presentation_format_id != null && dto.presentation_format_id > 0 ? dto.presentation_format_id : null;
    const formatScopeIds = this.normalizeIdList(
      dto.presentation_format_ids ?? (singleFormatId != null ? [singleFormatId] : []),
    );
    await this.assertActiveFormatIds(formatScopeIds);
    const clamshell_units_per_box =
      dto.clamshell_units_per_box != null && dto.clamshell_units_per_box > 0
        ? dto.clamshell_units_per_box.toFixed(4)
        : null;
    const singleClientId = dto.client_id != null && dto.client_id > 0 ? dto.client_id : null;
    const clientScopeIds = this.normalizeIdList(dto.client_ids ?? (singleClientId != null ? [singleClientId] : []));
    await this.assertClientIds(clientScopeIds);
    const client_id = clientScopeIds.length === 1 ? clientScopeIds[0] : null;
    const presentation_format_id = formatScopeIds.length === 1 ? formatScopeIds[0] : null;
    return this.materialRepo.save(
      this.materialRepo.create({
        nombre_material: dto.nombre_material.trim(),
        material_category_id: cat.id,
        descripcion: dto.descripcion,
        unidad_medida: dto.unidad_medida,
        presentation_format_id,
        presentation_format_scope_ids: formatScopeIds.length > 0 ? formatScopeIds : null,
        client_id,
        client_scope_ids: clientScopeIds.length > 0 ? clientScopeIds : null,
        clamshell_units_per_box,
        costo_unitario: dto.costo_unitario.toFixed(4),
        cantidad_disponible: dto.cantidad_disponible.toFixed(3),
      }),
    );
  }

  async deleteMaterial(id: number) {
    const row = await this.materialRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Material no encontrado');
    const inRecipes = await this.recipeItemRepo.count({ where: { material_id: id } });
    if (inRecipes > 0) {
      throw new BadRequestException(
        `No se puede eliminar: el material está usado en ${inRecipes} línea(s) de receta. Quitalo de recetas primero.`,
      );
    }
    const inBreakdown = await this.breakdownRepo.count({ where: { material_id: id } });
    if (inBreakdown > 0) {
      throw new BadRequestException(
        'No se puede eliminar: el material tiene consumos históricos registrados (breakdown).',
      );
    }
    await this.materialRepo.delete({ id });
    return { ok: true, deleted_material_id: id };
  }

  async listMaterials() {
    const rows = await this.materialRepo.find({
      relations: ['material_category', 'presentation_format'],
      order: { id: 'DESC' },
    });
    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.client_id, ...this.parseBigintArray(r.client_scope_ids)])
          .filter((id): id is number => id != null && Number(id) > 0),
      ),
    ].map(Number);
    const clients = ids.length ? await this.clientRepo.findBy({ id: In(ids) }) : [];
    const cById = new Map(
      clients.map((c) => [Number(c.id), { id: Number(c.id), codigo: c.codigo, nombre: c.nombre }]),
    );
    return rows.map((m) => ({
      ...m,
      presentation_format_scope_ids: this.parseBigintArray(m.presentation_format_scope_ids),
      client_scope_ids: this.parseBigintArray(m.client_scope_ids),
      client: m.client_id != null ? cById.get(Number(m.client_id)) ?? null : null,
    }));
  }

  /**
   * Vista referencial: insumos genéricos (sin formato) vs exclusivos por formato.
   * El stock (`cantidad_disponible`) sigue siendo una sola cifra por material; esto clasifica alcance.
   */
  async materialsSummaryByFormat() {
    const materials = await this.materialRepo.find({
      where: { activo: true },
      relations: ['material_category', 'presentation_format'],
      order: { nombre_material: 'ASC' },
    });
    const cids = [
      ...new Set(materials.map((m) => m.client_id).filter((id): id is number => id != null && Number(id) > 0)),
    ].map(Number);
    const clients = cids.length ? await this.clientRepo.findBy({ id: In(cids) }) : [];
    const clientNombreById = new Map(clients.map((c) => [Number(c.id), c.nombre.trim()]));
    const formats = await this.presentationFormatRepo.find({
      where: { activo: true },
      order: { format_code: 'ASC' },
    });
    const row = (m: PackagingMaterial) => ({
      id: Number(m.id),
      nombre_material: m.nombre_material,
      cantidad_disponible: m.cantidad_disponible,
      unidad_medida: m.unidad_medida,
      material_category_codigo: m.material_category?.codigo ?? null,
      alcance:
        this.parseBigintArray(m.presentation_format_scope_ids).length === 0 && m.presentation_format_id == null
          ? ('todos' as const)
          : ('exclusivo' as const),
      presentation_format_id: m.presentation_format_id != null ? Number(m.presentation_format_id) : null,
      presentation_format_scope_ids: this.parseBigintArray(m.presentation_format_scope_ids),
      format_code: m.presentation_format?.format_code ?? null,
      client_id: m.client_id != null ? Number(m.client_id) : null,
      client_scope_ids: this.parseBigintArray(m.client_scope_ids),
      client_nombre: m.client_id != null ? clientNombreById.get(Number(m.client_id)) ?? null : null,
    });
    const materialFormatIds = (m: PackagingMaterial): number[] => {
      const arr = this.parseBigintArray(m.presentation_format_scope_ids);
      if (arr.length > 0) return arr;
      return m.presentation_format_id != null ? [Number(m.presentation_format_id)] : [];
    };
    const generico = materials.filter((m) => materialFormatIds(m).length === 0).map(row);
    const por_formato = formats.map((f) => ({
      presentation_format_id: Number(f.id),
      format_code: f.format_code,
      exclusivos: materials
        .filter((m) => materialFormatIds(m).includes(Number(f.id)))
        .map(row),
    }));
    return { generico, por_formato };
  }

  async updateMaterial(id: number, dto: UpdateMaterialDto) {
    const row = await this.materialRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Material no encontrado');
    if (dto.material_category_id != null) {
      const cat = await this.materialCategoryRepo.findOne({ where: { id: dto.material_category_id } });
      if (!cat) throw new BadRequestException('material_category_id inválido');
      row.material_category_id = cat.id;
    }
    if (dto.nombre_material != null) {
      const trimmed = dto.nombre_material.trim();
      if (!trimmed) throw new BadRequestException('nombre_material no puede quedar vacío');
      const normalizedName = trimmed.toLowerCase();
      const dup = await this.materialRepo
        .createQueryBuilder('m')
        .where('LOWER(TRIM(m.nombre_material)) = :n', { n: normalizedName })
        .andWhere('m.activo = true')
        .andWhere('m.id != :id', { id })
        .getOne();
      if (dup) {
        throw new BadRequestException(`Ya existe otro material activo con ese nombre (ID ${dup.id}).`);
      }
      row.nombre_material = trimmed;
    }
    if (dto.unidad_medida != null) {
      const u = dto.unidad_medida.trim();
      if (!u) throw new BadRequestException('unidad_medida no puede quedar vacío');
      row.unidad_medida = u.slice(0, 20);
    }
    if (dto.costo_unitario != null) {
      row.costo_unitario = dto.costo_unitario.toFixed(4);
    }
    if (dto.activo != null) {
      row.activo = dto.activo;
    }
    if (dto.presentation_format_id !== undefined) {
      const v = dto.presentation_format_id;
      if (v == null || (typeof v === 'number' && v <= 0)) {
        row.presentation_format_id = null;
      } else {
        const pf = await this.presentationFormatRepo.findOne({ where: { id: v, activo: true } });
        if (!pf) throw new BadRequestException('presentation_format_id inválido o inactivo');
        row.presentation_format_id = v;
      }
    }
    if (dto.presentation_format_ids !== undefined) {
      const ids = this.normalizeIdList(dto.presentation_format_ids);
      await this.assertActiveFormatIds(ids);
      row.presentation_format_scope_ids = ids.length > 0 ? ids : null;
      row.presentation_format_id = ids.length === 1 ? ids[0] : null;
    }
    if (dto.clamshell_units_per_box !== undefined) {
      const v = dto.clamshell_units_per_box;
      row.clamshell_units_per_box =
        v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v).toFixed(4);
    }
    if (dto.client_id !== undefined) {
      const v = dto.client_id;
      if (v == null || (typeof v === 'number' && v <= 0)) {
        row.client_id = null;
      } else {
        const cl = await this.clientRepo.findOne({ where: { id: v } });
        if (!cl) throw new BadRequestException('client_id inválido');
        row.client_id = v;
      }
    }
    if (dto.client_ids !== undefined) {
      const ids = this.normalizeIdList(dto.client_ids);
      await this.assertClientIds(ids);
      row.client_scope_ids = ids.length > 0 ? ids : null;
      row.client_id = ids.length === 1 ? ids[0] : null;
    }
    await this.materialRepo.save(row);
    const updated = await this.materialRepo.findOne({
      where: { id: row.id },
      relations: ['material_category', 'presentation_format'],
    });
    if (!updated) throw new NotFoundException('Material no encontrado');
    return updated;
  }

  async createRecipe(dto: CreateRecipeDto) {
    const pf = await this.presentationFormatRepo.findOne({ where: { id: dto.presentation_format_id, activo: true } });
    if (!pf) throw new BadRequestException('presentation_format_id inválido o inactivo');
    const brandId = dto.brand_id != null && Number(dto.brand_id) > 0 ? Number(dto.brand_id) : null;
    if (brandId != null) {
      const brand = await this.brandRepo.findOne({ where: { id: brandId, activo: true } });
      if (!brand) throw new BadRequestException('brand_id inválido o inactivo');
    }
    if (brandId == null) {
      const existingGeneric = await this.recipeRepo.findOne({
        where: { presentation_format_id: dto.presentation_format_id, brand_id: IsNull() },
      });
      if (existingGeneric) throw new BadRequestException('Ya existe receta genérica para ese formato.');
    } else {
      const existingBranded = await this.recipeRepo.findOne({
        where: { presentation_format_id: dto.presentation_format_id, brand_id: brandId },
      });
      if (existingBranded) throw new BadRequestException('Ya existe receta para ese formato y marca.');
    }
    return this.recipeRepo.save(
      this.recipeRepo.create({
        presentation_format_id: dto.presentation_format_id,
        brand_id: brandId,
        descripcion: dto.descripcion,
      }),
    );
  }

  /** Listado para UI: recetas con líneas y datos mínimos del material. */
  async listRecipesWithItems() {
    const recipes = await this.recipeRepo.find({
      order: { id: 'DESC' },
      relations: ['presentation_format', 'brand'],
    });
    const allItems = await this.recipeItemRepo.find({ order: { id: 'ASC' } });
    const materials = await this.materialRepo.find();
    const matById = new Map(materials.map((m) => [m.id, m]));
    return recipes.map((r) => ({
      id: r.id,
      presentation_format_id: Number(r.presentation_format_id),
      format_code: r.presentation_format?.format_code ?? `PF#${r.presentation_format_id}`,
      brand_id: r.brand_id != null ? Number(r.brand_id) : null,
      brand: r.brand ? { id: Number(r.brand.id), nombre: r.brand.nombre, codigo: r.brand.codigo } : null,
      descripcion: r.descripcion,
      activo: r.activo,
      items: allItems
        .filter((i) => Number(i.recipe_id) === r.id)
        .map((i) => {
          const mat = matById.get(Number(i.material_id));
          return {
            id: i.id,
            recipe_id: Number(i.recipe_id),
            material_id: Number(i.material_id),
            qty_per_unit: i.qty_per_unit,
            // Compatibilidad con líneas históricas: si falta info, asumir directo + caja.
            base_unidad: (i.base_unidad ?? 'box') as 'box' | 'pallet',
            cost_type: (i.cost_type ?? 'directo') as 'directo' | 'tripaje',
            material: mat
              ? {
                  id: mat.id,
                  nombre_material: mat.nombre_material,
                  unidad_medida: mat.unidad_medida,
                }
              : null,
          };
        }),
    }));
  }

  async addRecipeItem(recipeId: number, dto: AddRecipeItemDto) {
    if (!['box', 'pallet'].includes(dto.base_unidad)) {
      throw new BadRequestException('base_unidad debe ser box o pallet');
    }
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    const material = await this.materialRepo.findOne({ where: { id: dto.material_id, activo: true } });
    if (!material) throw new NotFoundException('Material no encontrado');
    /** Una sola regla: caja → directo, pallet → tripaje (sin elegir en UI). */
    const costType = dto.base_unidad === 'box' ? 'directo' : 'tripaje';
    return this.recipeItemRepo.save(
      this.recipeItemRepo.create({
        recipe_id: recipeId,
        material_id: dto.material_id,
        qty_per_unit: dto.qty_per_unit.toFixed(4),
        base_unidad: dto.base_unidad,
        cost_type: costType,
      }),
    );
  }

  async updateRecipeItem(recipeId: number, itemId: number, dto: UpdateRecipeItemDto) {
    if (!['box', 'pallet'].includes(dto.base_unidad)) {
      throw new BadRequestException('base_unidad debe ser box o pallet');
    }
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    const row = await this.recipeItemRepo.findOne({ where: { id: itemId, recipe_id: recipeId } });
    if (!row) throw new NotFoundException('Línea de receta no encontrada');
    const material = await this.materialRepo.findOne({ where: { id: dto.material_id, activo: true } });
    if (!material) throw new NotFoundException('Material no encontrado');
    const costType = dto.base_unidad === 'box' ? 'directo' : 'tripaje';
    row.material_id = dto.material_id;
    row.qty_per_unit = dto.qty_per_unit.toFixed(4);
    row.base_unidad = dto.base_unidad;
    row.cost_type = costType;
    return this.recipeItemRepo.save(row);
  }

  async deleteRecipe(recipeId: number) {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    await this.recipeItemRepo.delete({ recipe_id: recipeId });
    await this.recipeRepo.delete({ id: recipeId });
    return { ok: true, deleted_recipe_id: recipeId };
  }

  async resetRecipes() {
    const items = await this.recipeItemRepo.count();
    const recipes = await this.recipeRepo.count();
    await this.recipeItemRepo.clear();
    await this.recipeRepo.clear();
    return { ok: true, deleted_items: items, deleted_recipes: recipes };
  }

  private async findMaterialByCategoryCodigo(codigo: string) {
    const cat = await this.materialCategoryRepo.findOne({ where: { codigo } });
    if (!cat) return null;
    return this.materialRepo.findOne({
      where: { material_category_id: cat.id, activo: true },
      order: { id: 'ASC' },
    });
  }

  /**
   * Metros de cinta / unidades de etiqueta o esquineros implícitos en la receta (qty_per_unit × cajas o pallets).
   * La cinta de sellado clamshell va típicamente `base_unidad: box` (metros por caja).
   */
  private sumRecipeQtyByCategoryCodes(
    recipeItems: PackagingRecipeItem[],
    matById: Map<number, PackagingMaterial>,
    boxesCount: number,
    palletCount: number,
  ): { tapeMeters: number; labelsQty: number; cornerQty: number } {
    let tapeMeters = 0;
    let labelsQty = 0;
    let cornerQty = 0;
    for (const item of recipeItems) {
      const material = matById.get(Number(item.material_id));
      const codigo = material?.material_category?.codigo?.trim().toLowerCase();
      if (!codigo) continue;
      const factor = item.base_unidad === 'box' ? boxesCount : palletCount;
      const lineQty = Number(item.qty_per_unit) * factor;
      if (codigo === MATERIAL_CATEGORY_CODES.TAPE) tapeMeters += lineQty;
      else if (codigo === MATERIAL_CATEGORY_CODES.ETIQUETA) labelsQty += lineQty;
      else if (codigo === MATERIAL_CATEGORY_CODES.CORNER_BOARD) cornerQty += lineQty;
    }
    return { tapeMeters, labelsQty, cornerQty };
  }

  async createConsumption(dto: CreateConsumptionDto) {
    const tag = await this.ptTagRepo.findOne({ where: { id: dto.tarja_id } });
    if (!tag) throw new NotFoundException('Tarja no encontrada');
    const existing = await this.consumptionRepo.findOne({ where: { tarja_id: dto.tarja_id }, order: { id: 'DESC' } });
    if (existing) {
      throw new BadRequestException(`La tarja #${dto.tarja_id} ya tiene consumo registrado (#${existing.id}).`);
    }
    const recipe = await this.recipeRepo.findOne({
      where: { id: dto.recipe_id, activo: true },
      relations: ['presentation_format'],
    });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    const recipeFormat = recipe.presentation_format?.format_code?.trim().toLowerCase();
    const tagFormat = tag.format_code?.trim().toLowerCase();
    if (!recipeFormat || !tagFormat || recipeFormat !== tagFormat) {
      throw new BadRequestException('La receta seleccionada no coincide con el formato de la tarja.');
    }
    if (recipe.brand_id != null) {
      const tagBrandId = tag.brand_id != null ? Number(tag.brand_id) : null;
      if (tagBrandId == null || Number(recipe.brand_id) !== tagBrandId) {
        throw new BadRequestException('La receta seleccionada no coincide con la marca de la tarja.');
      }
    }
    const recipeItems = await this.recipeItemRepo.find({ where: { recipe_id: dto.recipe_id } });
    if (!recipeItems.length) throw new BadRequestException('La receta no tiene materiales');

    const recipeMaterialIds = [...new Set(recipeItems.map((i) => Number(i.material_id)))];
    const materialsForRecipe = await this.materialRepo.find({
      where: { id: In(recipeMaterialIds) },
      relations: ['material_category'],
    });
    const matById = new Map(materialsForRecipe.map((m) => [Number(m.id), m]));
    const fromRecipe = this.sumRecipeQtyByCategoryCodes(recipeItems, matById, dto.boxes_count, dto.pallet_count);

    const storedTapeMeters = fromRecipe.tapeMeters > 0 ? fromRecipe.tapeMeters : Math.max(0, dto.tape_linear_meters);
    const storedLabelsQty =
      fromRecipe.labelsQty > 0 ? Math.round(fromRecipe.labelsQty) : Math.max(0, dto.labels_qty);
    const storedCornerQty =
      fromRecipe.cornerQty > 0 ? Math.round(fromRecipe.cornerQty) : Math.max(0, dto.corner_boards_qty);

    const consumption = await this.consumptionRepo.save(
      this.consumptionRepo.create({
        ...dto,
        tape_linear_meters: storedTapeMeters.toFixed(3),
        labels_qty: storedLabelsQty,
        corner_boards_qty: storedCornerQty,
      }),
    );

    let total = 0;
    const breakdowns: PackagingCostBreakdown[] = [];

    for (const item of recipeItems) {
      const material = await this.materialRepo.findOne({ where: { id: item.material_id } });
      if (!material) throw new NotFoundException(`Material ${item.material_id} no existe`);
      const qtyFactor = item.base_unidad === 'box' ? dto.boxes_count : dto.pallet_count;
      const qtyUsed = Number(item.qty_per_unit) * qtyFactor;
      const lineTotal = qtyUsed * Number(material.costo_unitario);
      if (Number(material.cantidad_disponible) < qtyUsed) {
        throw new BadRequestException(`Inventario insuficiente para ${material.nombre_material}`);
      }
      material.cantidad_disponible = (Number(material.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(material);
      await this.logMaterialMovement(material.id, -qtyUsed, 'consumption', consumption.id);
      total += lineTotal;
      breakdowns.push(
        this.breakdownRepo.create({
          consumption_id: consumption.id,
          material_id: material.id,
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(material.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    const tapeMat = await this.findMaterialByCategoryCodigo(MATERIAL_CATEGORY_CODES.TAPE);
    /** Solo si la cinta no está en la receta (evita doble descuento / doble costo). */
    if (tapeMat && dto.tape_linear_meters > 0 && fromRecipe.tapeMeters <= 0) {
      const qtyUsed = dto.tape_linear_meters;
      const lineTotal = qtyUsed * Number(tapeMat.costo_unitario);
      if (Number(tapeMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de tape');
      tapeMat.cantidad_disponible = (Number(tapeMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(tapeMat);
      await this.logMaterialMovement(tapeMat.id, -qtyUsed, 'consumption', consumption.id);
      total += lineTotal;
      breakdowns.push(
        this.breakdownRepo.create({
          consumption_id: consumption.id,
          material_id: tapeMat.id,
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(tapeMat.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    const cornerMat = await this.findMaterialByCategoryCodigo(MATERIAL_CATEGORY_CODES.CORNER_BOARD);
    if (cornerMat && dto.corner_boards_qty > 0 && fromRecipe.cornerQty <= 0) {
      const qtyUsed = dto.corner_boards_qty;
      const lineTotal = qtyUsed * Number(cornerMat.costo_unitario);
      if (Number(cornerMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de corner board');
      cornerMat.cantidad_disponible = (Number(cornerMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(cornerMat);
      await this.logMaterialMovement(cornerMat.id, -qtyUsed, 'consumption', consumption.id);
      total += lineTotal;
      breakdowns.push(
        this.breakdownRepo.create({
          consumption_id: consumption.id,
          material_id: cornerMat.id,
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(cornerMat.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    const labelMat = await this.findMaterialByCategoryCodigo(MATERIAL_CATEGORY_CODES.ETIQUETA);
    if (labelMat && dto.labels_qty > 0 && fromRecipe.labelsQty <= 0) {
      const qtyUsed = dto.labels_qty;
      const lineTotal = qtyUsed * Number(labelMat.costo_unitario);
      if (Number(labelMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de etiquetas');
      labelMat.cantidad_disponible = (Number(labelMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(labelMat);
      await this.logMaterialMovement(labelMat.id, -qtyUsed, 'consumption', consumption.id);
      total += lineTotal;
      breakdowns.push(
        this.breakdownRepo.create({
          consumption_id: consumption.id,
          material_id: labelMat.id,
          qty_used: qtyUsed.toFixed(4),
          unit_cost: Number(labelMat.costo_unitario).toFixed(4),
          line_total: lineTotal.toFixed(2),
        }),
      );
    }

    await this.breakdownRepo.save(breakdowns);
    consumption.material_cost_total = total.toFixed(2);
    await this.consumptionRepo.save(consumption);

    return {
      consumption,
      breakdowns,
      total_cost: Number(total.toFixed(2)),
    };
  }

  async getConsumption(id: number) {
    const consumption = await this.consumptionRepo.findOne({ where: { id } });
    if (!consumption) throw new NotFoundException('Consumo no encontrado');
    const breakdowns = await this.breakdownRepo.find({ where: { consumption_id: id } });
    return { consumption, breakdowns };
  }

  async recordMaterialMovement(materialId: number, dto: RecordMaterialMovementDto) {
    return this.dataSource.transaction(async (em) => {
      const mat = await em.findOne(PackagingMaterial, { where: { id: materialId } });
      if (!mat) throw new NotFoundException('Material no encontrado');
      const next = Number(mat.cantidad_disponible) + dto.quantity_delta;
      if (next < 0) throw new BadRequestException('La operación dejaría existencia negativa');
      mat.cantidad_disponible = next.toFixed(3);
      await em.save(mat);
      const mov = em.create(PackagingMaterialMovement, {
        material_id: materialId,
        quantity_delta: dto.quantity_delta.toFixed(4),
        ref_type: dto.ref_type ?? 'manual',
        ref_id: dto.ref_id ?? null,
        nota: dto.nota ?? null,
      });
      await em.save(mov);
      return mat;
    });
  }

  async listMaterialMovements(materialId: number) {
    const rows = await this.movementRepo.find({
      where: { material_id: materialId },
      order: { id: 'DESC' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      material_id: Number(r.material_id),
      quantity_delta: r.quantity_delta,
      ref_type: r.ref_type,
      ref_id: r.ref_id != null ? Number(r.ref_id) : null,
      nota: r.nota,
      created_at: r.created_at,
    }));
  }

  async listConsumptions() {
    const rows = await this.consumptionRepo.find({ order: { id: 'DESC' }, take: 200 });
    return rows.map((c) => ({
      id: c.id,
      tarja_id: Number(c.tarja_id),
      dispatch_tag_item_id: c.dispatch_tag_item_id != null ? Number(c.dispatch_tag_item_id) : null,
      recipe_id: Number(c.recipe_id),
      pallet_count: c.pallet_count,
      boxes_count: c.boxes_count,
      tape_linear_meters: c.tape_linear_meters,
      corner_boards_qty: c.corner_boards_qty,
      labels_qty: c.labels_qty,
      material_cost_total: c.material_cost_total,
      created_at: c.created_at,
    }));
  }

  async recalculateConsumptions(tarjaId?: number) {
    const where = tarjaId != null ? { tarja_id: tarjaId } : undefined;
    const rows = await this.consumptionRepo.find({
      where,
      order: { id: 'DESC' },
      take: 500,
    });
    if (!rows.length) {
      return {
        ok: true,
        total: 0,
        recalculated: 0,
        failed: 0,
        results: [],
      };
    }

    const results: Array<{
      consumption_id: number;
      tarja_id: number;
      ok: boolean;
      recipe_id?: number;
      total_cost?: number;
      error?: string;
    }> = [];

    const byTarja = new Map<number, PackagingPalletConsumption[]>();
    for (const row of rows) {
      const key = Number(row.tarja_id);
      const arr = byTarja.get(key) ?? [];
      arr.push(row);
      byTarja.set(key, arr);
    }

    const recalcTargets: PackagingPalletConsumption[] = [];
    const duplicateRows: PackagingPalletConsumption[] = [];
    for (const arr of byTarja.values()) {
      const [latest, ...dups] = arr;
      if (latest) recalcTargets.push(latest);
      if (dups.length) duplicateRows.push(...dups);
    }

    for (const dup of duplicateRows) {
      try {
        await this.dataSource.transaction((em) => this.purgeConsumptionDuplicateTx(em, Number(dup.id)));
        results.push({
          consumption_id: Number(dup.id),
          tarja_id: Number(dup.tarja_id),
          ok: true,
          total_cost: 0,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          consumption_id: Number(dup.id),
          tarja_id: Number(dup.tarja_id),
          ok: false,
          error: `Duplicado no depurado: ${msg}`,
        });
      }
    }

    for (const row of recalcTargets) {
      try {
        const done = await this.dataSource.transaction((em) => this.recalculateConsumptionTx(em, Number(row.id)));
        results.push({
          consumption_id: done.consumption_id,
          tarja_id: done.tarja_id,
          ok: true,
          recipe_id: done.recipe_id,
          total_cost: done.total_cost,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          consumption_id: Number(row.id),
          tarja_id: Number(row.tarja_id),
          ok: false,
          error: msg,
        });
      }
    }

    const recalculated = results.filter((r) => r.ok).length;
    return {
      ok: recalculated > 0,
      total: results.length,
      recalculated,
      failed: results.length - recalculated,
      results,
    };
  }
}
