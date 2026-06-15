import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OPERATE_ROLES, READ_ACCESS_ROLES, ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AddRecipeItemDto,
  CreateConsumptionDto,
  CreateMaterialDto,
  CreateRecipeDto,
  RecalculateConsumptionsDto,
  RecordMaterialMovementDto,
  UpdateMaterialDto,
  UpdateRecipeItemDto,
} from './packaging.dto';
import { PackagingService } from './packaging.service';

@ApiTags('empaque')
@ApiBearerAuth('JWT-auth')
@Controller('api/packaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...READ_ACCESS_ROLES)
export class PackagingController {
  constructor(private readonly service: PackagingService) {}

  @Post('materials')
  @Roles(...OPERATE_ROLES)
  createMaterial(@Body() dto: CreateMaterialDto) {
    return this.service.createMaterial(dto);
  }

  @Get('materials/summary-by-format')
  materialsSummaryByFormat() {
    return this.service.materialsSummaryByFormat();
  }

  @Get('materials/operational-stock')
  listOperationalStock() {
    return this.service.listOperationalStockSummary();
  }

  @Get('materials')
  listMaterials() {
    return this.service.listMaterials();
  }

  @Patch('materials/:id')
  @Roles(...OPERATE_ROLES)
  updateMaterial(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialDto) {
    return this.service.updateMaterial(id, dto);
  }

  @Delete('materials/:id')
  @Roles(...OPERATE_ROLES)
  deleteMaterial(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteMaterial(id);
  }

  @Post('materials/:id/movements')
  @Roles(...OPERATE_ROLES)
  recordMaterialMovement(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordMaterialMovementDto) {
    return this.service.recordMaterialMovement(id, dto);
  }

  @Get('materials/:id/movements')
  listMaterialMovements(@Param('id', ParseIntPipe) id: number) {
    return this.service.listMaterialMovements(id);
  }

  @Get('materials/:id/kardex-operational')
  getKardexOperational(@Param('id', ParseIntPipe) id: number) {
    return this.service.getKardexOperational(id);
  }

  @Post('recipes')
  @Roles(...OPERATE_ROLES)
  createRecipe(@Body() dto: CreateRecipeDto) {
    return this.service.createRecipe(dto);
  }

  @Get('recipes')
  listRecipes() {
    return this.service.listRecipesWithItems();
  }

  @Post('recipes/:id/items')
  @Roles(...OPERATE_ROLES)
  addRecipeItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddRecipeItemDto) {
    return this.service.addRecipeItem(id, dto);
  }

  @Put('recipes/:recipeId/items/:itemId')
  @Roles(...OPERATE_ROLES)
  updateRecipeItem(
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateRecipeItemDto,
  ) {
    return this.service.updateRecipeItem(recipeId, itemId, dto);
  }

  @Delete('recipes/:id')
  @Roles(...OPERATE_ROLES)
  deleteRecipe(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteRecipe(id);
  }

  @Delete('recipes')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  resetRecipes() {
    return this.service.resetRecipes();
  }

  @Post('consumptions')
  @Roles(...OPERATE_ROLES)
  createConsumption(@Body() dto: CreateConsumptionDto) {
    return this.service.createConsumption(dto);
  }

  @Get('consumptions')
  listConsumptions() {
    return this.service.listConsumptions();
  }

  @Get('consumptions/:id')
  getConsumption(@Param('id', ParseIntPipe) id: number) {
    return this.service.getConsumption(id);
  }

  @Post('consumptions/recalculate')
  @Roles(...OPERATE_ROLES)
  recalculateConsumptions(@Body() dto: RecalculateConsumptionsDto) {
    return this.service.recalculateConsumptions(dto.tarja_id);
  }
}
