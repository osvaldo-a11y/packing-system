import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AddRecipeItemDto, CreateConsumptionDto, CreateMaterialDto, CreateRecipeDto } from './packaging.dto';
import { PackagingService } from './packaging.service';

@Controller('api/packaging')
export class PackagingController {
  constructor(private readonly service: PackagingService) {}

  @Post('materials')
  createMaterial(@Body() dto: CreateMaterialDto) {
    return this.service.createMaterial(dto);
  }

  @Get('materials')
  listMaterials() {
    return this.service.listMaterials();
  }

  @Post('recipes')
  createRecipe(@Body() dto: CreateRecipeDto) {
    return this.service.createRecipe(dto);
  }

  @Post('recipes/:id/items')
  addRecipeItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddRecipeItemDto) {
    return this.service.addRecipeItem(id, dto);
  }

  @Post('consumptions')
  createConsumption(@Body() dto: CreateConsumptionDto) {
    return this.service.createConsumption(dto);
  }

  @Get('consumptions/:id')
  getConsumption(@Param('id', ParseIntPipe) id: number) {
    return this.service.getConsumption(id);
  }
}
