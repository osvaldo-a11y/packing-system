import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
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
@Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
export class PackagingController {
  constructor(private readonly service: PackagingService) {}

  @Post('materials')
  createMaterial(@Body() dto: CreateMaterialDto) {
    return this.service.createMaterial(dto);
  }

  @Get('materials/summary-by-format')
  materialsSummaryByFormat() {
    return this.service.materialsSummaryByFormat();
  }

  @Get('materials')
  listMaterials() {
    return this.service.listMaterials();
  }

  @Patch('materials/:id')
  updateMaterial(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialDto) {
    return this.service.updateMaterial(id, dto);
  }

  @Delete('materials/:id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  deleteMaterial(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteMaterial(id);
  }

  @Post('materials/:id/movements')
  recordMaterialMovement(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordMaterialMovementDto) {
    return this.service.recordMaterialMovement(id, dto);
  }

  @Get('materials/:id/movements')
  listMaterialMovements(@Param('id', ParseIntPipe) id: number) {
    return this.service.listMaterialMovements(id);
  }

  @Post('recipes')
  createRecipe(@Body() dto: CreateRecipeDto) {
    return this.service.createRecipe(dto);
  }

  @Get('recipes')
  listRecipes() {
    return this.service.listRecipesWithItems();
  }

  @Post('recipes/:id/items')
  addRecipeItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddRecipeItemDto) {
    return this.service.addRecipeItem(id, dto);
  }

  @Put('recipes/:recipeId/items/:itemId')
  updateRecipeItem(
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateRecipeItemDto,
  ) {
    return this.service.updateRecipeItem(recipeId, itemId, dto);
  }

  @Delete('recipes/:id')
  deleteRecipe(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteRecipe(id);
  }

  @Delete('recipes')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  resetRecipes() {
    return this.service.resetRecipes();
  }

  @Post('consumptions')
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
  recalculateConsumptions(@Body() dto: RecalculateConsumptionsDto) {
    return this.service.recalculateConsumptions(dto.tarja_id);
  }
}
