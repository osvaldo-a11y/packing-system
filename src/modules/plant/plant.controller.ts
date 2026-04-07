import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdatePlantSettingsDto } from './plant.dto';
import { PlantService } from './plant.service';

@Controller('api/plant-settings')
export class PlantController {
  constructor(private readonly service: PlantService) {}

  @Get()
  get() {
    return this.service.getOrCreate();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  update(@Body() dto: UpdatePlantSettingsDto) {
    return this.service.update(dto);
  }
}
