import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinalChargeImportService } from './final-charge-import.service';
import { PhysicalBalanceImportService } from './physical-balance-import.service';
import { PhysicalLinesImportService } from './physical-lines-import.service';
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
    private readonly physicalLinesImport: PhysicalLinesImportService,
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

  @Get(':year/export/full.xlsx')
  @ApiQuery({ name: 'lang', required: false, enum: ['es', 'en'] })
  async exportFullXlsx(
    @Param('year', ParseIntPipe) year: number,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.seasonExport.buildFullXlsx(year, lang, acceptLanguage);
    this.sendExport(res, file);
  }

  @Get(':year/export/settlement.xlsx')
  @ApiQuery({ name: 'lang', required: false, enum: ['es', 'en'] })
  async exportSettlementXlsx(
    @Param('year', ParseIntPipe) year: number,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.seasonExport.buildSettlementXlsx(year, lang, acceptLanguage);
    this.sendExport(res, file);
  }

  @Get(':year/export/mass-balance.xlsx')
  @ApiQuery({ name: 'lang', required: false, enum: ['es', 'en'] })
  async exportMassBalanceXlsx(
    @Param('year', ParseIntPipe) year: number,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.seasonExport.buildMassBalanceXlsx(year, lang, acceptLanguage);
    this.sendExport(res, file);
  }

  @Get(':year/export/summary.pdf')
  @ApiQuery({ name: 'lang', required: false, enum: ['es', 'en'] })
  async exportSummaryPdf(
    @Param('year', ParseIntPipe) year: number,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.seasonExport.buildSummaryPdf(year, lang, acceptLanguage);
    this.sendExport(res, file);
  }

  @Get(':year/export/settlement.pdf')
  @ApiQuery({ name: 'lang', required: false, enum: ['es', 'en'] })
  async exportSettlementPdf(
    @Param('year', ParseIntPipe) year: number,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.seasonExport.buildSettlementPdf(year, lang, acceptLanguage);
    this.sendExport(res, file);
  }

  private sendExport(res: Response, file: { buffer: Buffer; mime: string; filename: string }) {
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
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

  @Get(':year/physical-lines/verify')
  verifyPhysicalLines(@Param('year', ParseIntPipe) year: number) {
    return this.physicalLinesImport.verifyAgainstMassBalance(year);
  }

  @Post(':year/import/physical-lines')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'receptions', maxCount: 1 },
        { name: 'processes', maxCount: 1 },
      ],
      { limits: { fileSize: 25 * 1024 * 1024 } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        receptions: { type: 'string', format: 'binary' },
        processes: { type: 'string', format: 'binary' },
      },
      required: ['receptions', 'processes'],
    },
  })
  importPhysicalLines(
    @Param('year', ParseIntPipe) year: number,
    @UploadedFiles()
    files: {
      receptions?: Array<{ buffer: Buffer }>;
      processes?: Array<{ buffer: Buffer }>;
    },
    @Req() req: JwtRequest,
  ) {
    const receptions = files.receptions?.[0]?.buffer;
    const processes = files.processes?.[0]?.buffer;
    if (!receptions?.length || !processes?.length) {
      throw new BadRequestException('Adjunte recepciones y procesos en los campos receptions y processes');
    }
    const username = req.user?.username?.trim() || 'unknown';
    return this.physicalLinesImport.importPhysicalLines(year, receptions, processes, username);
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
