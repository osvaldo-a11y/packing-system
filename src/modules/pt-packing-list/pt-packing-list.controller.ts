import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OPERATE_ROLES, READ_ACCESS_ROLES, ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePtPackingListDto,
  ReversePtPackingListDto,
  UpdatePtPackingListBolDto,
  UpdatePtPackingListClientDto,
} from './pt-packing-list.dto';
import { PtPackingListService } from './pt-packing-list.service';

@ApiTags('packing list PT (logístico)')
@ApiBearerAuth('JWT-auth')
@Controller('api/pt-packing-lists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PtPackingListController {
  constructor(private readonly service: PtPackingListService) {}

  @Post()
  @Roles(...OPERATE_ROLES)
  create(@Body() dto: CreatePtPackingListDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(...READ_ACCESS_ROLES)
  list() {
    return this.service.findAll();
  }

  @Patch(':id/numero-bol')
  @Roles(...OPERATE_ROLES)
  patchNumeroBol(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePtPackingListBolDto) {
    return this.service.updateNumeroBol(id, dto);
  }

  @Patch(':id/client')
  @Roles(...OPERATE_ROLES)
  patchClient(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePtPackingListClientDto) {
    return this.service.updateClient(id, dto);
  }

  @Get(':id')
  @Roles(...READ_ACCESS_ROLES)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/confirm')
  @Roles(...OPERATE_ROLES)
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirm(id);
  }

  @Post(':id/reverse')
  @Roles(...OPERATE_ROLES)
  reverse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversePtPackingListDto,
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const username = req.user?.username ?? 'unknown';
    return this.service.reverseConfirmed(id, username, dto?.notes);
  }

  @Post(':id/annul')
  @Roles(...OPERATE_ROLES)
  annul(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversePtPackingListDto,
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const username = req.user?.username ?? 'unknown';
    return this.service.reverseConfirmed(id, username, dto?.notes);
  }

  /**
   * Reversa un PL confirmado aunque esté vinculado a un despacho: primero desvincula (y elimina el despacho si queda vacío).
   * Destructivo; solo administración.
   */
  @Post(':id/reverse-master')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  reverseMaster(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversePtPackingListDto,
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const username = req.user?.username ?? 'unknown';
    return this.service.reverseConfirmed(id, username, dto?.notes, { unlinkDispatchFirst: true });
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...OPERATE_ROLES)
  async deleteDraft(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteDraft(id);
  }
}
