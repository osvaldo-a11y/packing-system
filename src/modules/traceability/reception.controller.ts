import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReceptionDto, TransitionReceptionStateDto, UpdateReceptionDto } from './traceability.dto';
import { TraceabilityService } from './traceability.service';

@ApiTags('recepción')
@ApiBearerAuth('JWT-auth')
@Controller('api/receptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReceptionController {
  constructor(private readonly trace: TraceabilityService) {}

  @Get()
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  list() {
    return this.trace.listReceptions();
  }

  @Get(':id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.trace.getReception(id);
  }

  @Post()
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  create(@Body() dto: CreateReceptionDto) {
    return this.trace.createReception(dto);
  }

  @Put(':id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReceptionDto) {
    return this.trace.updateReception(id, dto);
  }

  @Patch(':id/state')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  transitionState(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionReceptionStateDto) {
    return this.trace.transitionReceptionState(id, dto);
  }
}
