import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompletePrintJobDto } from './dto/complete-print-job.dto';
import { CreatePrintJobDto } from './dto/create-print-job.dto';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintJobsService } from './print-jobs.service';

@ApiTags('print-jobs')
@Controller('api/print-jobs')
export class PrintJobsController {
  constructor(private readonly printJobs: PrintJobsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  @ApiBearerAuth('JWT-auth')
  async create(@Body() dto: CreatePrintJobDto, @Req() req: { user?: { sub?: number } }) {
    const userId = req.user?.sub != null ? Number(req.user.sub) : null;
    const job = await this.printJobs.create(dto, Number.isFinite(userId) ? userId : null);
    return {
      ok: true,
      id: job.id,
      status: job.status,
      message: 'Trabajo encolado para impresión en planta.',
    };
  }

  @Get('pending')
  @UseGuards(PrintAgentGuard)
  async pending(@Query('limit') limit?: string) {
    const jobs = await this.printJobs.claimPending(limit != null ? Number(limit) : 5);
    return {
      ok: true,
      jobs: jobs.map((j) => ({
        id: j.id,
        filename: j.filename,
        zpl: j.zpl,
        printerName: j.printer_name,
        copies: j.copies,
        createdAt: j.created_at,
      })),
    };
  }

  @Patch(':id/complete')
  @UseGuards(PrintAgentGuard)
  async complete(@Param('id') id: string, @Body() dto: CompletePrintJobDto) {
    const job = await this.printJobs.complete(id, dto);
    return { ok: true, id: job.id, status: job.status };
  }
}
