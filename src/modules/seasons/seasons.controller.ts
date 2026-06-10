import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateSeasonSnapshotDto } from './seasons.dto';
import { SeasonsService } from './seasons.service';

type JwtRequest = Request & { user?: { username?: string } };

@ApiTags('seasons')
@ApiBearerAuth('JWT-auth')
@Controller('api/seasons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get(':year')
  getSeason(@Param('year', ParseIntPipe) year: number) {
    return this.seasons.getCurrentSnapshot(year);
  }

  @Post(':year/snapshot/generate')
  generateSnapshot(
    @Param('year', ParseIntPipe) year: number,
    @Body() body: GenerateSeasonSnapshotDto,
    @Req() req: JwtRequest,
  ) {
    const username = req.user?.username?.trim() || 'unknown';
    return this.seasons.generateSnapshot(year, body ?? {}, username);
  }

  /**
   * Bloqueo definitivo — disponible cuando el cliente confirme totales.
   * No ejecutar hasta entonces.
   */
  @Post(':year/close')
  closeSeason(@Param('year', ParseIntPipe) year: number) {
    return this.seasons.closeSeason(year);
  }
}
