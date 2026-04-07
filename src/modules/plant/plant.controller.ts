import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdatePlantSettingsDto } from './plant.dto';
import { PlantService } from './plant.service';

@ApiTags('planta')
@Controller('api/plant-settings')
export class PlantController {
  constructor(private readonly service: PlantService) {}

  @Get()
  get() {
    return this.service.getOrCreate();
  }

  @Put()
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  update(@Body() dto: UpdatePlantSettingsDto) {
    return this.service.update(dto);
  }
}
