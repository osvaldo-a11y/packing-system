import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddRecipeItemDto, CreateConsumptionDto, CreateMaterialDto, CreateRecipeDto } from './packaging.dto';
import {
  MaterialCategory,
  PackagingCostBreakdown,
  PackagingMaterial,
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
  ) {}

  createMaterial(dto: CreateMaterialDto) {
    return this.materialRepo.save(
      this.materialRepo.create({
        ...dto,
        costo_unitario: dto.costo_unitario.toFixed(4),
        cantidad_disponible: dto.cantidad_disponible.toFixed(3),
      }),
    );
  }

  listMaterials() {
    return this.materialRepo.find({ order: { id: 'DESC' } });
  }

  createRecipe(dto: CreateRecipeDto) {
    return this.recipeRepo.save(this.recipeRepo.create(dto));
  }

  async addRecipeItem(recipeId: number, dto: AddRecipeItemDto) {
    if (!['box', 'pallet'].includes(dto.base_unidad)) {
      throw new BadRequestException('base_unidad debe ser box o pallet');
    }
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Receta no encontrada');
    const material = await this.materialRepo.findOne({ where: { id: dto.material_id, activo: true } });
    if (!material) throw new NotFoundException('Material no encontrado');
    return this.recipeItemRepo.save(
      this.recipeItemRepo.create({
        recipe_id: recipeId,
        material_id: dto.material_id,
        qty_per_unit: dto.qty_per_unit.toFixed(4),
        base_unidad: dto.base_unidad,
      }),
    );
  }

  private async findMaterialByCategory(categoria: MaterialCategory) {
    return this.materialRepo.findOne({ where: { categoria, activo: true }, order: { id: 'ASC' } });
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

    const tapeMat = await this.findMaterialByCategory(MaterialCategory.TAPE);
    if (tapeMat && dto.tape_linear_meters > 0) {
      const qtyUsed = dto.tape_linear_meters;
      const lineTotal = qtyUsed * Number(tapeMat.costo_unitario);
      if (Number(tapeMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de tape');
      tapeMat.cantidad_disponible = (Number(tapeMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(tapeMat);
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

    const cornerMat = await this.findMaterialByCategory(MaterialCategory.CORNER_BOARD);
    if (cornerMat && dto.corner_boards_qty > 0) {
      const qtyUsed = dto.corner_boards_qty;
      const lineTotal = qtyUsed * Number(cornerMat.costo_unitario);
      if (Number(cornerMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de corner board');
      cornerMat.cantidad_disponible = (Number(cornerMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(cornerMat);
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

    const labelMat = await this.findMaterialByCategory(MaterialCategory.ETIQUETA);
    if (labelMat && dto.labels_qty > 0) {
      const qtyUsed = dto.labels_qty;
      const lineTotal = qtyUsed * Number(labelMat.costo_unitario);
      if (Number(labelMat.cantidad_disponible) < qtyUsed) throw new BadRequestException('Inventario insuficiente de etiquetas');
      labelMat.cantidad_disponible = (Number(labelMat.cantidad_disponible) - qtyUsed).toFixed(3);
      await this.materialRepo.save(labelMat);
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
}
