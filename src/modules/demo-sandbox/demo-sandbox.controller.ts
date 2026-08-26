import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DemoSandboxService } from './demo-sandbox.service';

@ApiTags('demo')
@ApiBearerAuth('JWT-auth')
@Controller('api/demo')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DemoSandboxController {
  constructor(private readonly demo: DemoSandboxService) {}

  /** Solo con DEMO_SANDBOX=true. Borra operación; conserva maestros. */
  @Post('reset')
  @Roles(ROLES.ADMIN)
  reset() {
    return this.demo.resetTransactionalData();
  }
}
