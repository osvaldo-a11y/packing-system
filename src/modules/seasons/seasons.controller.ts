import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinalChargeImportService } from './final-charge-import.service';
import { PhysicalBalanceImportService } from './physical-balance-import.service';
import { SeasonExportService } from './season-export.service';
import { SeasonReadService } from './season-read.service';
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
    private readonly seasonRead: SeasonReadService,
    private readonly seasonExport: SeasonExportService,
    private readonly finalChargeImport: FinalChargeImportService,
    private readonly physicalBalanceImport: PhysicalBalanceImportService,
  ) {}

  @Get()
  listSeasons() {
    return this.seasonRead.listSeasons();
  }

  @Get('compare')
  @ApiQuery({ name: 'years', example: '2025,2026', description: 'Años separados por coma' })
  compareSeasons(@Query('years') years: string) {
    if (!years?.trim()) {
      throw new BadRequestException('Query years es requerido (ej. years=2025,2026)');
    }
    return this.seasonRead.compareSeasons(years);
  }

  @Get(':year/overview')
  getOverview(@Param('year', ParseIntPipe) year: number) {
    return this.seasonRead.getOverview(year);
  }

  @Get(':year/settlement/lines')
  @ApiQuery({ name: 'producer', required: false })
  @ApiQuery({ name: 'format', required: false })
  @ApiQuery({ name: 'bol', required: false })
  @ApiQuery({ name: 'variety', required: false })
  @ApiQuery({ name: 'brand', required: false })
  getSettlementLines(
    @Param('year', ParseIntPipe) year: number,
    @Query('producer') producer?: string,
    @Query('format') format?: string,
    @Query('bol') bol?: string,
    @Query('variety') variety?: string,
    @Query('brand') brand?: string,
  ) {
    return this.seasonRead.getSettlementLines(year, { producer, format, bol, variety, brand });
  }

  @Get(':year/export/settlement.xlsx')
  async exportSettlementXlsx(@Param('year', ParseIntPipe) year: number, @Res() res: Response) {
    const { buffer, mime, filename } = await this.seasonExport.buildSettlementXlsx(year);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':year/export/mass-balance.xlsx')
  async exportMassBalanceXlsx(@Param('year', ParseIntPipe) year: number, @Res() res: Response) {
    const { buffer, mime, filename } = await this.seasonExport.buildMassBalanceXlsx(year);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':year/export/settlement.pdf')
  async exportSettlementPdf(@Param('year', ParseIntPipe) year: number, @Res() res: Response) {
    const { buffer, mime, filename } = await this.seasonExport.buildSettlementPdf(year);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

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
