import { BadRequestException, Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OPERATE_ROLES, READ_ACCESS_ROLES, ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReceptionDto, TransitionReceptionStateDto, UpdateReceptionDto, BulkCloseBorradorReceptionsDto } from './traceability.dto';
import { TraceabilityService } from './traceability.service';

@ApiTags('recepción')
@ApiBearerAuth('JWT-auth')
@Controller('api/receptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReceptionController {
  constructor(private readonly trace: TraceabilityService) {}

  @Get()
  @Roles(...READ_ACCESS_ROLES)
  list() {
    return this.trace.listReceptions();
  }

  /**
   * Cierre masivo: borrador → confirmado → cerrado por filtro de fecha de `received_at`.
   * Sin `dry_run`: header `X-Confirm-Bulk-Reception-Close: CONFIRMO-CERRAR-RECEPCIONES-BORRADOR-POR-FECHA`.
   */
  @Post('admin/bulk-close-borrador')
  @Roles(ROLES.ADMIN)
  bulkCloseBorrador(
    @Headers('x-confirm-bulk-reception-close') confirmHeader: string | undefined,
    @Body() dto: BulkCloseBorradorReceptionsDto,
  ) {
    if (dto.dry_run !== true) {
      const expected = 'CONFIRMO-CERRAR-RECEPCIONES-BORRADOR-POR-FECHA';
      if ((confirmHeader ?? '').trim() !== expected) {
        throw new BadRequestException(
          `Enviá el header X-Confirm-Bulk-Reception-Close con el valor exacto: ${expected}`,
        );
      }
    }
    return this.trace.bulkCloseBorradorReceptions(dto);
  }

  @Get(':id')
  @Roles(...READ_ACCESS_ROLES)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.trace.getReception(id);
  }

  @Post()
  @Roles(...OPERATE_ROLES)
  create(@Body() dto: CreateReceptionDto) {
    return this.trace.createReception(dto);
  }

  @Put(':id')
  @Roles(...OPERATE_ROLES)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReceptionDto) {
    return this.trace.updateReception(id, dto);
  }

  /** Admin: asignar estado del documento sin restricción «solo borrador» (ver servicio para anulado). */
  @Patch(':id/state-admin')
  @Roles(ROLES.ADMIN)
  transitionStateAdmin(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionReceptionStateDto) {
    return this.trace.patchAdminReceptionDocumentState(id, dto);
  }

  @Patch(':id/state')
  @Roles(...OPERATE_ROLES)
  transitionState(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionReceptionStateDto) {
    return this.trace.transitionReceptionState(id, dto);
  }
}
