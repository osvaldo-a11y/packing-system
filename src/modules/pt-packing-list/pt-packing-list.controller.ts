import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePtPackingListDto, ReversePtPackingListDto, UpdatePtPackingListBolDto } from './pt-packing-list.dto';
import { PtPackingListService } from './pt-packing-list.service';

@ApiTags('packing list PT (logístico)')
@ApiBearerAuth('JWT-auth')
@Controller('api/pt-packing-lists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PtPackingListController {
  constructor(private readonly service: PtPackingListService) {}

  @Post()
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  create(@Body() dto: CreatePtPackingListDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  list() {
    return this.service.findAll();
  }

  @Patch(':id/numero-bol')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  patchNumeroBol(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePtPackingListBolDto) {
    return this.service.updateNumeroBol(id, dto);
  }

  @Get(':id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/confirm')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirm(id);
  }

  @Post(':id/reverse')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  reverse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversePtPackingListDto,
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const username = req.user?.username ?? 'unknown';
    return this.service.reverseConfirmed(id, username, dto?.notes);
  }

  @Post(':id/annul')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  annul(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversePtPackingListDto,
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const username = req.user?.username ?? 'unknown';
    return this.service.reverseConfirmed(id, username, dto?.notes);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async deleteDraft(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteDraft(id);
  }
}
