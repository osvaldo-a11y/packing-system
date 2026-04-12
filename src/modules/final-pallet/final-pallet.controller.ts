import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateFinalPalletDto,
  ListExistenciasPtQueryDto,
  PatchFinalPalletDto,
  BulkAssignBolDto,
  RepalletDto,
  RepalletReverseDto,
} from './final-pallet.dto';
import { FinalPalletService } from './final-pallet.service';

@ApiTags('pallet final / trazabilidad')
@ApiBearerAuth('JWT-auth')
@Controller('api/final-pallets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinalPalletController {
  constructor(private readonly service: FinalPalletService) {}

  @Get()
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  list() {
    return this.service.listPallets();
  }

  /** Vista inventario PT: pallets finales con filtros (ruta antes de :id). */
  @Get('existencias-pt')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listExistenciasPt(@Query() q: ListExistenciasPtQueryDto) {
    return this.service.listExistenciasPt(q);
  }

  /** Tras migración de `status` en pallets con tarja: recalcula `finished_pt_stock` / inventario por pallet. */
  @Post('admin/reconcile-tarja-inventory')
  @Roles(ROLES.ADMIN)
  reconcileTarjaInventory() {
    return this.service.reconcileInventoryForAllTarjaLinkedPallets();
  }

  /** Asigna el mismo BOL a varios pallets (definitivo, sin despacho). */
  @Post('bulk-assign-bol')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  bulkAssignBol(@Body() dto: BulkAssignBolDto) {
    return this.service.bulkAssignBol(dto);
  }

  @Get('packout-budget/:processId')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  packoutBudget(
    @Param('processId', ParseIntPipe) processId: number,
    @Query('presentation_format_id') presentationFormatId?: string,
  ) {
    const q = presentationFormatId != null ? Number.parseInt(presentationFormatId, 10) : NaN;
    return this.service.getPackoutBudget(processId, Number.isFinite(q) && q > 0 ? q : undefined);
  }

  /** Repaletizaje controlado: descuenta orígenes, crea pallet destino y guarda trazabilidad origen→destino. */
  @Post('repallet')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  repallet(@Body() dto: RepalletDto) {
    return this.service.executeRepallet(dto);
  }

  /** Reversa operativa del repaletizaje (pallet resultado → revertido; orígenes recuperan stock). */
  @Post(':id/repallet-reverse')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  reverseRepallet(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RepalletReverseDto,
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const username = req.user?.username ?? 'unknown';
    return this.service.executeRepalletReversal(id, username, dto);
  }

  /** Detalle solo lectura: recepción → proceso → líneas de pallet (trazabilidad PT). */
  @Get(':id/traceability')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  getTraceability(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPalletTraceabilityDetail(id);
  }

  @Get(':id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPallet(id);
  }

  /** Alta manual reservada a administración / migración; el flujo normal crea el pallet desde la unidad PT. */
  @Post()
  @Roles(ROLES.ADMIN)
  create(@Body() dto: CreateFinalPalletDto) {
    return this.service.createPallet(dto);
  }

  @Patch(':id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  patch(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchFinalPalletDto) {
    return this.service.patchPallet(id, dto);
  }
}
