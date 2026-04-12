import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AddRecipeItemDto,
  CreateConsumptionDto,
  CreateMaterialDto,
  CreateRecipeDto,
  RecordMaterialMovementDto,
  UpdateRecipeItemDto,
} from './packaging.dto';
import { MaterialCategory as MaterialCategoryEntity } from '../traceability/catalog.entities';
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
    await this.movementRepo.save(
      this.movementRepo.create({
        material_id: materialId,
        quantity_delta: quantityDelta.toFixed(4),
        ref_type: refType,
        ref_id: refId,
        nota: nota ?? null,
      }),
    );
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
    const presentation_format_id =
      dto.presentation_format_id != null && dto.presentation_format_id > 0 ? dto.presentation_format_id : null;
    const clamshell_units_per_box =
      dto.clamshell_units_per_box != null && dto.clamshell_units_per_box > 0
        ? dto.clamshell_units_per_box.toFixed(4)
        : null;
    return this.materialRepo.save(
      this.materialRepo.create({
        nombre_material: dto.nombre_material.trim(),
        material_category_id: cat.id,
        descripcion: dto.descripcion,
        unidad_medida: dto.unidad_medida,
        presentation_format_id,
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

  listMaterials() {
    return this.materialRepo.find({ relations: ['material_category'], order: { id: 'DESC' } });
  }

  async createRecipe(dto: CreateRecipeDto) {
    const pf = await this.presentationFormatRepo.findOne({ where: { id: dto.presentation_format_id, activo: true } });
    if (!pf) throw new BadRequestException('presentation_format_id inválido o inactivo');
    const existing = await this.recipeRepo.findOne({ where: { presentation_format_id: dto.presentation_format_id } });
    if (existing) throw new BadRequestException('Ya existe receta para ese formato.');
    return this.recipeRepo.save(
      this.recipeRepo.create({
        presentation_format_id: dto.presentation_format_id,
        descripcion: dto.descripcion,
      }),
    );
  }

  /** Listado para UI: recetas con líneas y datos mínimos del material. */
  async listRecipesWithItems() {
    const recipes = await this.recipeRepo.find({
      order: { id: 'DESC' },
      relations: ['presentation_format'],
    });
    const allItems = await this.recipeItemRepo.find({ order: { id: 'ASC' } });
    const materials = await this.materialRepo.find();
    const matById = new Map(materials.map((m) => [m.id, m]));
    return recipes.map((r) => ({
      id: r.id,
      presentation_format_id: Number(r.presentation_format_id),
      format_code: r.presentation_format?.format_code ?? `PF#${r.presentation_format_id}`,
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
    const suggested = dto.base_unidad === 'box' ? 'directo' : 'tripaje';
    const costType = dto.cost_type ?? suggested;
    if (costType === 'directo' && dto.base_unidad === 'pallet') {
      throw new BadRequestException('Combinación inválida: directo + pallet.');
    }
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
    if (!['directo', 'tripaje'].includes(dto.cost_type)) {
      throw new BadRequestException('cost_type debe ser directo o tripaje');
    }
    if (dto.cost_type === 'directo' && dto.base_unidad === 'pallet') {
      throw new BadRequestException('Combinación inválida: directo + pallet.');
    }
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    const row = await this.recipeItemRepo.findOne({ where: { id: itemId, recipe_id: recipeId } });
    if (!row) throw new NotFoundException('Línea de receta no encontrada');
    const material = await this.materialRepo.findOne({ where: { id: dto.material_id, activo: true } });
    if (!material) throw new NotFoundException('Material no encontrado');
    row.material_id = dto.material_id;
    row.qty_per_unit = dto.qty_per_unit.toFixed(4);
    row.base_unidad = dto.base_unidad;
    row.cost_type = dto.cost_type;
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

  async createConsumption(dto: CreateConsumptionDto) {
    const recipe = await this.recipeRepo.findOne({ where: { id: dto.recipe_id, activo: true } });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    const recipeItems = await this.recipeItemRepo.find({ where: { recipe_id: dto.recipe_id } });
    if (!recipeItems.length) throw new BadRequestException('La receta no tiene materiales');

    const consumption = await this.consumptionRepo.save(
      this.consumptionRepo.create({
        ...dto,
        tape_linear_meters: dto.tape_linear_meters.toFixed(3),
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
    if (tapeMat && dto.tape_linear_meters > 0) {
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
    if (cornerMat && dto.corner_boards_qty > 0) {
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
    if (labelMat && dto.labels_qty > 0) {
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
}
