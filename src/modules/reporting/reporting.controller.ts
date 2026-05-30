import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import {
  ReportExportQueryDto,
  ReportFilterDto,
  SaveReportDto,
  UpsertMachineProcessingRateDto,
  UpsertPackingCostDto,
  UpsertMaterialCostAdjustmentDto,
  UpsertPackingFormatSurchargeDto,
} from './reporting.dto';
import { ReportingExportService } from './reporting-export.service';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('reportes')
@ApiBearerAuth('JWT-auth')
@Controller('api/reporting')
export class ReportingController {
  constructor(
    private readonly service: ReportingService,
    private readonly exportService: ReportingExportService,
  ) {}

  @Get('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  generate(@Query() query: ReportFilterDto) {
    return this.service.generate(query);
  }

  @Get('format-cost')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  formatCost(@Query() query: ReportFilterDto) {
    return this.service.formatCost(query);
  }

  @Get('producer-settlement')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  producerSettlement(@Query() query: ReportFilterDto) {
    return this.service.producerSettlement(query);
  }

  @Get('producer-settlement-diagnostic')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  producerSettlementDiagnostic(@Query() query: ReportFilterDto) {
    return this.service.producerSettlementDiagnostic(query);
  }

  @Get('producer-settlement/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  async producerSettlementPdf(
    @Query() query: ReportFilterDto,
    @Query('variant') variant: string | undefined,
    @Res() res: Response,
  ) {
    const v =
      variant === 'internal' ? 'internal' :
      variant === 'executive' ? 'executive' : 'producer';
    const lang = query.lang === 'en' ? 'en' : 'es';
    const { buffer, mime, filename } = await this.exportService.buildProducerSettlementPdf(v, query, lang);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('packing-costs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  listPackingCosts() {
    return this.service.listPackingCosts();
  }

  @Post('packing-costs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  upsertPackingCost(@Body() dto: UpsertPackingCostDto) {
    return this.service.upsertPackingCost(dto);
  }

  @Get('packing-format-surcharges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  getPackingFormatSurcharges() {
    return this.service.getPackingFormatSurcharges();
  }

  @Post('packing-format-surcharges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  upsertPackingFormatSurcharge(@Body() dto: UpsertPackingFormatSurchargeDto) {
    return this.service.upsertPackingFormatSurcharge(dto);
  }

  @Get('material-cost-adjustments')
  @UseGuards(JwtAuthGuard)
  getMaterialCostAdjustments() {
    return this.service.getMaterialCostAdjustments();
  }

  @Post('material-cost-adjustments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  upsertMaterialCostAdjustment(@Body() dto: UpsertMaterialCostAdjustmentDto) {
    return this.service.upsertMaterialCostAdjustment(dto);
  }

  @Get('machine-processing-rates')
  @UseGuards(JwtAuthGuard)
  getMachineProcessingRates() {
    return this.service.getMachineProcessingRates();
  }

  @Post('machine-processing-rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  upsertMachineProcessingRate(@Body() dto: UpsertMachineProcessingRateDto) {
    return this.service.upsertMachineProcessingRate(dto);
  }

  @Delete('material-cost-adjustments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  deleteMaterialCostAdjustment(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteMaterialCostAdjustment(id);
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  async export(@Query() query: ReportExportQueryDto, @Res() res: Response) {
    const { buffer, mime, filename } = await this.exportService.build(query.format, query);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('saved-reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  save(@Body() dto: SaveReportDto) {
    return this.service.saveReport(dto);
  }

  @Get('saved-reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR)
  list() {
    return this.service.listSavedReports();
  }

  @Put('saved-reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveReportDto) {
    return this.service.updateSavedReport(id, dto);
  }

  @Delete('saved-reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteSavedReport(id);
  }

  @Get('mass-balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  getMassBalance(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.getMassBalanceByProducer({ desde, hasta });
  }
}
