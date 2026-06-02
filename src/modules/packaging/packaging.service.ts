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
import { formatCodeMatchKey } from '../../common/format-code-key';
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

  /** Tarjas que son solo etiqueta unificada de repallet (no duplican cajas en packout). */
  private async repalletUnifiedTarjaIds(tagIds: number[]): Promise<Set<number>> {
    const uniq = [...new Set(tagIds)].filter((id) => id > 0);
    if (uniq.length === 0) return new Set();
    const out = new Set<number>();
    const CHUNK = 8000;
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const slice = uniq.slice(i, i + CHUNK);
      const rows = (await this.dataSource.query(
        `SELECT DISTINCT fp.tarja_id AS tid
         FROM final_pallets fp
         INNER JOIN repallet_events re
           ON re.result_final_pallet_id = fp.id AND re.reversed_at IS NULL
         WHERE fp.tarja_id IS NOT NULL AND fp.tarja_id = ANY($1::bigint[])`,
        [slice],
      )) as { tid: string | number }[];
      for (const r of rows) {
        const n = Number(r.tid);
        if (Number.isFinite(n) && n > 0) out.add(n);
      }
    }
    return out;
  }

  private materialAppliesToFormat(
    m: PackagingMaterial,
    formatId: number,
    tagClientId: number | null,
  ): boolean {
    const formatScope = this.parseBigintArray(m.presentation_format_scope_ids);
    if (formatScope.length > 0) {
      if (!formatScope.includes(formatId)) return false;
    } else {
      const pf = m.presentation_format_id != null ? Number(m.presentation_format_id) : null;
      if (pf != null && pf !== formatId) return false;
    }
    return this.materialAppliesToTagClient(m, tagClientId);
  }

  /** Alcance comercial del material respecto a la tarja (sin filtrar por formato). */
  private materialAppliesToTagClient(m: PackagingMaterial, tagClientId: number | null): boolean {
    const clientScope = this.parseBigintArray(m.client_scope_ids);
    const cid = tagClientId != null && tagClientId > 0 ? tagClientId : null;
    if (clientScope.length > 0) {
      if (cid == null || !clientScope.includes(cid)) return false;
    } else {
      const mid = m.client_id != null ? Number(m.client_id) : null;
      if (mid != null && cid != null && mid !== cid) return false;
    }
    if (m.client_id != null && clientScope.length > 0 && !clientScope.includes(Number(m.client_id))) {
      return false;
    }
    return true;
  }

  private async tryResolveRecipeForTagTx(em: EntityManager, tag: PtTag): Promise<PackagingRecipe | null> {
    try {
      return await this.resolveRecipeForTagTx(em, tag);
    } catch {
      return null;
    }
  }

  /** Catálogo activo: clave estable (minúsculas, pint/pinta) → formato. */
  private presentationFormatByMatchKey(formats: PresentationFormat[]): Map<string, PresentationFormat> {
    const m = new Map<string, PresentationFormat>();
    for (const f of formats) {
      m.set(formatCodeMatchKey(f.format_code), f);
    }
    return m;
  }

  private async findPresentationFormatByCodeTx(
    em: EntityManager,
    formatCode: string,
  ): Promise<PresentationFormat | null> {
    const key = formatCodeMatchKey(formatCode);
    const rows = await em.find(PresentationFormat, { where: { activo: true } });
    return rows.find((f) => formatCodeMatchKey(f.format_code) === key) ?? null;
  }

  /**
   * Misma prioridad que Consumos (`findRecipeForTag`): marca tarja → genérica → receta de marca activa.
   * Si la tarja no tiene marca pero solo existe receta PINEBLOOM (u otra marca), se usa esa.
   */
  private pickRecipeForPtTag(
    formatId: number,
    tagBrandId: number | null,
    recipes: PackagingRecipe[],
    preferredRecipeId?: number,
  ): PackagingRecipe | null {
    const active = recipes.filter(
      (r) => r.activo && Number(r.presentation_format_id) === formatId,
    );
    const sortDesc = (a: PackagingRecipe, b: PackagingRecipe) => Number(b.id) - Number(a.id);
    const brandCompatible = (r: PackagingRecipe) =>
      tagBrandId == null || r.brand_id == null || Number(r.brand_id) === tagBrandId;

    if (preferredRecipeId != null) {
      const preferred = active.find((r) => Number(r.id) === preferredRecipeId);
      if (preferred && brandCompatible(preferred)) return preferred;
    }

    if (tagBrandId != null && tagBrandId > 0) {
      const branded = active
        .filter((r) => Number(r.brand_id) === tagBrandId)
        .sort(sortDesc)[0];
      if (branded) return branded;
    }

    const generic = active.filter((r) => r.brand_id == null).sort(sortDesc)[0];
    if (generic) return generic;

    return active.filter((r) => r.brand_id != null && brandCompatible(r)).sort(sortDesc)[0] ?? null;
  }

  private resolveRecipeForTagFromLists(
    tag: PtTag,
    formatId: number,
    recipes: PackagingRecipe[],
    preferredRecipeId?: number,
  ): PackagingRecipe | null {
    const tagBrandId =
      tag.brand_id != null && Number(tag.brand_id) > 0 ? Number(tag.brand_id) : null;
    return this.pickRecipeForPtTag(formatId, tagBrandId, recipes, preferredRecipeId);
  }

  /**
   * Consumo comprometido por formato: Σ (cajas PT × qty receta) para este material,
   * alineado con la pantalla de Consumos (todas las tarjas, no solo consumos registrados).
   */
  private async computeCommittedConsumptionByFormat(materialId: number): Promise<
    Map<string, { cajas: number; qty: number; pt_units: number }>
  > {
    const mat = await this.materialRepo.findOne({ where: { id: materialId } });
    if (!mat) return new Map();

    const formats = await this.presentationFormatRepo.find({ where: { activo: true } });
    const formatByMatchKey = this.presentationFormatByMatchKey(formats);
    const formatIdByMatchKey = new Map(
      formats.map((f) => [formatCodeMatchKey(f.format_code), Number(f.id)]),
    );
    const labelByMatchKey = new Map(
      formats.map((f) => [formatCodeMatchKey(f.format_code), f.format_code.trim()]),
    );
    const maxBpByFormatId = new Map(
      formats.map((f) => {
        const n = f.max_boxes_per_pallet != null ? Number(f.max_boxes_per_pallet) : 0;
        return [Number(f.id), Number.isFinite(n) && n > 0 ? Math.floor(n) : 0];
      }),
    );

    const recipes = await this.recipeRepo.find({
      where: { activo: true },
      relations: ['presentation_format'],
    });
    const recipeIds = recipes.map((r) => Number(r.id));
    const recipeItems =
      recipeIds.length > 0
        ? await this.recipeItemRepo.find({ where: { recipe_id: In(recipeIds), material_id: materialId } })
        : [];
    const itemsByRecipeId = new Map<number, PackagingRecipeItem[]>();
    for (const it of recipeItems) {
      const rid = Number(it.recipe_id);
      const list = itemsByRecipeId.get(rid) ?? [];
      list.push(it);
      itemsByRecipeId.set(rid, list);
    }

    const tags = await this.ptTagRepo.find({ order: { id: 'ASC' } });
    const skipRepallet = await this.repalletUnifiedTarjaIds(tags.map((t) => Number(t.id)));

    const out = new Map<string, { cajas: number; qty: number; pt_units: number }>();

    /** Formatos donde la receta activa incluye este material (aunque aún no haya PT). */
    for (const recipe of recipes) {
      const rid = Number(recipe.id);
      if (!(itemsByRecipeId.get(rid)?.length ?? 0)) continue;
      const pf =
        recipe.presentation_format ??
        formats.find((f) => Number(f.id) === Number(recipe.presentation_format_id));
      if (!pf) continue;
      const matchKey = formatCodeMatchKey(pf.format_code);
      if (!out.has(matchKey)) out.set(matchKey, { cajas: 0, qty: 0, pt_units: 0 });
    }

    for (const tag of tags) {
      const tagId = Number(tag.id);
      if (skipRepallet.has(tagId)) continue;
      const formatCode = tag.format_code?.trim();
      if (!formatCode) continue;
      const matchKey = formatCodeMatchKey(formatCode);
      const formatId = formatIdByMatchKey.get(matchKey);
      if (formatId == null) continue;

      const tagClientId = tag.client_id != null ? Number(tag.client_id) : null;
      /** Formato lo define la receta de la tarja; no el alcance de formato del material (cajas compartidas). */
      if (!this.materialAppliesToTagClient(mat, tagClientId)) continue;

      const recipe = this.resolveRecipeForTagFromLists(tag, formatId, recipes);
      if (!recipe || Number(recipe.presentation_format_id) !== formatId) continue;

      const items = itemsByRecipeId.get(Number(recipe.id)) ?? [];
      if (!items.length) continue;

      const boxes = Number(tag.total_cajas) || 0;
      if (boxes <= 0) continue;
      const maxBp = maxBpByFormatId.get(formatId) ?? 0;
      const palletsEquiv = maxBp > 0 ? boxes / maxBp : Number(tag.total_pallets) || 0;

      let lineQty = 0;
      for (const it of items) {
        const qtyUnit = Number(it.qty_per_unit);
        if (!Number.isFinite(qtyUnit) || qtyUnit <= 0) continue;
        const factor = it.base_unidad === 'box' ? boxes : palletsEquiv;
        lineQty += qtyUnit * factor;
      }
      if (lineQty <= 0) continue;

      const cur = out.get(matchKey) ?? { cajas: 0, qty: 0, pt_units: 0 };
      cur.cajas += boxes;
      cur.qty += lineQty;
      cur.pt_units += 1;
      out.set(matchKey, cur);
    }

    /** Etiqueta canónica del catálogo (ej. PINT REGULAR) aunque las tarjas digan pint regular. */
    const displayOut = new Map<string, { cajas: number; qty: number; pt_units: number }>();
    for (const [matchKey, agg] of out) {
      const label = labelByMatchKey.get(matchKey) ?? formatByMatchKey.get(matchKey)?.format_code?.trim() ?? matchKey;
      const prev = displayOut.get(label);
      if (prev) {
        prev.cajas += agg.cajas;
        prev.qty += agg.qty;
        prev.pt_units += agg.pt_units;
      } else {
        displayOut.set(label, { ...agg });
      }
    }
    return displayOut;
  }

  private async resolveRecipeForTagTx(
    em: EntityManager,
    tag: PtTag,
    preferredRecipeId?: number,
  ): Promise<PackagingRecipe> {
    if (!tag.format_code?.trim()) throw new BadRequestException('Tarja sin formato válido');
    const pf = await this.findPresentationFormatByCodeTx(em, tag.format_code);
    if (!pf) throw new BadRequestException(`Formato ${tag.format_code} no encontrado o inactivo`);
    const tagBrandId =
      tag.brand_id != null && Number(tag.brand_id) > 0 ? Number(tag.brand_id) : null;

    const formatRecipes = await em.find(PackagingRecipe, {
      where: { presentation_format_id: Number(pf.id), activo: true },
      order: { id: 'DESC' },
    });
    const recipe = this.pickRecipeForPtTag(Number(pf.id), tagBrandId, formatRecipes, preferredRecipeId);
    if (recipe) return recipe;

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

    return this.dataSource.transaction(async (em) => {
      const saved = await em.save(
        em.create(PackagingMaterial, {
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
      const inicial = Number(dto.cantidad_disponible);
      if (Number.isFinite(inicial) && inicial > 0) {
        await em.save(
          em.create(PackagingMaterialMovement, {
            material_id: Number(saved.id),
            quantity_delta: inicial.toFixed(4),
            ref_type: 'inventario_inicial',
            ref_id: Number(saved.id),
            nota: 'Alta de material con existencia inicial.',
            occurred_at: new Date(),
          }),
        );
      }
      return saved;
    });
  }

  async deleteMaterial(id: number) {
    const row = await this.materialRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Material no encontrado');

    const inActiveRecipes = await this.recipeRepo
      .createQueryBuilder('r')
      .innerJoin(PackagingRecipeItem, 'pri', 'pri.recipe_id = r.id')
      .where('pri.material_id = :id', { id })
      .andWhere('r.activo = true')
      .getCount();

    const inBreakdown = await this.breakdownRepo.count({ where: { material_id: id } });

    if (inActiveRecipes > 0) {
      throw new BadRequestException(
        `No se puede eliminar: el material está en ${inActiveRecipes} receta(s) activa(s). Quitá esas líneas desde Recetas (o desactivá la receta) y volvé a intentar.`,
      );
    }
    if (inBreakdown > 0) {
      throw new BadRequestException(
        `No se puede eliminar: hay ${inBreakdown} registro(s) de costo por tarja (breakdown) con este material. Eso es historial de embalaje, no la receta actual. Si es dato erróneo, hace falta corregir la base o el consumo asociado.`,
      );
    }

    await this.dataSource.transaction(async (em) => {
      await em.delete(PackagingRecipeItem, { material_id: id });
      await em.update(Brand, { label_material_id: id }, { label_material_id: null });
      await em.delete(PackagingMaterialMovement, { material_id: id });
      await em.delete(PackagingMaterial, { id });
    });
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
    const recipeFormatKey = formatCodeMatchKey(recipe.presentation_format?.format_code ?? '');
    const tagFormatKey = formatCodeMatchKey(tag.format_code ?? '');
    if (!recipeFormatKey || !tagFormatKey || recipeFormatKey !== tagFormatKey) {
      throw new BadRequestException('La receta seleccionada no coincide con el formato de la tarja.');
    }
    if (recipe.brand_id != null) {
      const tagBrandId =
        tag.brand_id != null && Number(tag.brand_id) > 0 ? Number(tag.brand_id) : null;
      if (tagBrandId != null && Number(recipe.brand_id) !== tagBrandId) {
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
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      material_id: Number(r.material_id),
      quantity_delta: r.quantity_delta,
      ref_type: r.ref_type,
      ref_id: r.ref_id != null ? Number(r.ref_id) : null,
      nota: r.nota,
      created_at: r.created_at,
      occurred_at: r.occurred_at != null ? r.occurred_at.toISOString() : null,
    }));
  }

  /** Resumen operativo de Kardex + consumo PT por formato (tabla breakdown). */
  async getKardexOperational(materialId: number) {
    const mat = await this.materialRepo.findOne({ where: { id: materialId } });
    if (!mat) throw new NotFoundException('Material no encontrado');

    const movements = await this.movementRepo.find({
      where: { material_id: materialId },
      order: { id: 'ASC' },
    });

    let inventario_inicial = 0;
    let compras_total = 0;
    let otros_movimientos_neto = 0;
    let consumoNetDelta = 0;
    let movimientos_sin_consumo_pt = 0;

    for (const m of movements) {
      const d = Number(m.quantity_delta) || 0;
      const rt = (m.ref_type ?? '').trim().toLowerCase();
      if (rt === 'consumption' || rt === 'consumption_revert') {
        consumoNetDelta += d;
        continue;
      }
      movimientos_sin_consumo_pt += 1;
      if (rt === 'inventario_inicial') inventario_inicial += d;
      else if (rt === 'compra' || rt === 'entrada') compras_total += d;
      else otros_movimientos_neto += d;
    }

    const consumoPorMovimientos = Math.max(0, -consumoNetDelta);

    const breakdownAgg = await this.breakdownRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.qty_used), 0)', 'total')
      .where('b.material_id = :id', { id: materialId })
      .getRawOne<{ total: string }>();
    const consumoFromBreakdown = Number(breakdownAgg?.total ?? 0) || 0;

    const consumo_pt_registrado =
      consumoFromBreakdown > 0 ? consumoFromBreakdown : consumoPorMovimientos;

    const porFormatoRaw = await this.dataSource.query<
      Array<{ formato: string; cajas_producidas: string; consumo_total: string }>
    >(
      `
      SELECT t.format_code AS formato,
             COALESCE(SUM(c.boxes_count), 0)::text AS cajas_producidas,
             COALESCE(SUM(b.qty_used::numeric), 0)::text AS consumo_total
      FROM packaging_cost_breakdowns b
      INNER JOIN packaging_pallet_consumptions c ON c.id = b.consumption_id
      INNER JOIN pt_tags t ON t.id = c.tarja_id
      WHERE b.material_id = $1
      GROUP BY t.format_code
      ORDER BY t.format_code ASC
      `,
      [materialId],
    );

    const catalogFormats = await this.presentationFormatRepo.find({ where: { activo: true } });
    const labelByMatchKey = new Map(
      catalogFormats.map((f) => [formatCodeMatchKey(f.format_code), f.format_code.trim()]),
    );

    const registradoByFormato = new Map<string, { cajas: number; qty: number }>();
    for (const row of porFormatoRaw) {
      const raw = row.formato?.trim() ?? '';
      const label = labelByMatchKey.get(formatCodeMatchKey(raw)) ?? raw;
      const cur = registradoByFormato.get(label) ?? { cajas: 0, qty: 0 };
      cur.cajas += Number(row.cajas_producidas) || 0;
      cur.qty += Number(row.consumo_total) || 0;
      registradoByFormato.set(label, cur);
    }

    const comprometidoByFormato = await this.computeCommittedConsumptionByFormat(materialId);
    const formatKeys = new Set<string>([
      ...registradoByFormato.keys(),
      ...comprometidoByFormato.keys(),
    ]);

    const por_formato = [...formatKeys]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((formato) => {
        const reg = registradoByFormato.get(formato) ?? { cajas: 0, qty: 0 };
        const com = comprometidoByFormato.get(formato) ?? { cajas: 0, qty: 0, pt_units: 0 };
        const cajas = com.cajas > 0 ? com.cajas : reg.cajas;
        const consumo_comprometido = com.qty;
        const consumo_registrado = reg.qty;
        const consumo_total = consumo_comprometido > 0 ? consumo_comprometido : consumo_registrado;
        return {
          formato,
          cajas_producidas: cajas,
          pt_unidades: com.pt_units,
          consumo_por_caja: cajas > 0 ? consumo_total / cajas : 0,
          consumo_comprometido,
          consumo_registrado,
          consumo_total,
        };
      });

    const consumo_pt_comprometido = [...comprometidoByFormato.values()].reduce((s, r) => s + r.qty, 0);
    const consumo_pt_total = consumo_pt_comprometido > 0 ? consumo_pt_comprometido : consumo_pt_registrado;

    const stock_final = Number(mat.cantidad_disponible) || 0;
    const total_entradas = inventario_inicial + compras_total;
    const stock_segun_inv_compras_y_pt =
      inventario_inicial + compras_total + otros_movimientos_neto - consumo_pt_total;

    return {
      material_id: materialId,
      nombre_material: mat.nombre_material,
      unidad_medida: mat.unidad_medida,
      inventario_inicial,
      compras_total,
      otros_movimientos_neto,
      movimientos_sin_consumo_pt,
      total_entradas,
      consumo_pt_total,
      consumo_pt_comprometido,
      consumo_pt_registrado,
      stock_segun_inv_compras_y_pt,
      stock_final,
      por_formato,
    };
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
