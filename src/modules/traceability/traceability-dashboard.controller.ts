import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TraceabilityDashboardService } from './traceability-dashboard.service';

@ApiTags('trazabilidad')
@ApiBearerAuth('JWT-auth')
@Controller('api/traceability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TraceabilityDashboardController {
  constructor(private readonly traceabilityDashboard: TraceabilityDashboardService) {}

  @Get('dashboard')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  getDashboard() {
    return this.traceabilityDashboard.getSummary();
  }
}
