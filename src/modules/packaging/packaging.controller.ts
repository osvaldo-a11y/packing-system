import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddRecipeItemDto, CreateConsumptionDto, CreateMaterialDto, CreateRecipeDto } from './packaging.dto';
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
