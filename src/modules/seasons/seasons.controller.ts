import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinalChargeImportService } from './final-charge-import.service';
import { PhysicalBalanceImportService } from './physical-balance-import.service';
import { GenerateSeasonSnapshotDto } from './seasons.dto';
import { SeasonsService } from './seasons.service';

type JwtRequest = Request & { user?: { username?: string } };

@ApiTags('seasons')
@ApiBearerAuth('JWT-auth')
@Controller('api/seasons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class SeasonsController {
  constructor(
    private readonly seasons: SeasonsService,
    private readonly finalChargeImport: FinalChargeImportService,
    private readonly physicalBalanceImport: PhysicalBalanceImportService,
  ) {}

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

  @Get(':year/settlement/summary')
  getSettlementSummary(@Param('year', ParseIntPipe) year: number) {
    return this.finalChargeImport.getSettlementSummary(year);
  }

  @Get(':year/mass-balance/summary')
  getMassBalanceSummary(@Param('year', ParseIntPipe) year: number) {
    return this.physicalBalanceImport.getMassBalanceSummary(year);
  }

  @Post(':year/import/final-charge')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  importFinalCharge(
    @Param('year', ParseIntPipe) year: number,
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
    @Req() req: JwtRequest,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunte el archivo Excel en el campo file');
    }
    const username = req.user?.username?.trim() || 'unknown';
    return this.finalChargeImport.importFinalCharge(year, file.buffer, username);
  }
}
