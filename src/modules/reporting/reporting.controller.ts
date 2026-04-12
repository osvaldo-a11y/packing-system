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
import { ReportExportQueryDto, ReportFilterDto, SaveReportDto, UpsertPackingCostDto } from './reporting.dto';
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
    const v = variant === 'internal' ? 'internal' : 'producer';
    const { buffer, mime, filename } = await this.exportService.buildProducerSettlementPdf(v, query);
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
}
