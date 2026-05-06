import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportService } from './import.service';
import { ImportTemplateService } from './import-template.service';

type JwtRequest = Request & { user?: { username?: string } };

@ApiTags('importación masiva')
@ApiBearerAuth('JWT-auth')
@Controller('api/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly templateService: ImportTemplateService,
  ) {}

  @Get(':entity/template')
  async downloadTemplate(@Param('entity') entity: string) {
    if (!this.importService.isEntityKey(entity)) {
      throw new BadRequestException('Entidad no soportada');
    }
    const { filename, body } = await this.templateService.buildTemplateCsv(entity);
    const bom = '\ufeff';
    const buf = Buffer.from(bom + body, 'utf8');
    return new StreamableFile(buf, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':entity/export')
  async exportData(@Param('entity') entity: string) {
    if (!this.importService.isEntityKey(entity)) {
      throw new BadRequestException('Entidad no soportada');
    }
    const { filename, body } = await this.importService.buildExportCsv(entity);
    const bom = '\ufeff';
    const buf = Buffer.from(bom + body, 'utf8');
    return new StreamableFile(buf, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('logs')
  async logs(@Query('limit') limit?: string) {
    const parsed = limit != null ? Number(limit) : undefined;
    return this.importService.listRecentLogs(parsed);
  }

  @Delete('receptions/purge-all')
  async purgeAllReceptions(@Headers('x-confirm-purge') confirmHeader?: string) {
    const expected = 'CONFIRMO-BORRAR-RECEPCIONES';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        'Acción peligrosa. Enviá el header X-Confirm-Purge con el valor exacto para confirmar.',
      );
    }
    const purged = await this.importService.purgeAllReceptions();
    return {
      purged,
      warning:
        'Esta acción no se puede deshacer. Asegurate de tener el backup descargado.',
    };
  }

  @Delete('sales-orders-dispatches/purge-all')
  async purgeAllSalesOrdersDispatches(@Headers('x-confirm-purge') confirmHeader?: string) {
    const expected = 'CONFIRMO-BORRAR-PEDIDOS-Y-DESPACHOS';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        'Acción peligrosa. Enviá el header X-Confirm-Purge con el valor exacto para confirmar.',
      );
    }
    const purged = await this.importService.purgeAllSalesOrdersDispatches();
    return {
      purged,
      warning:
        'Esta acción no se puede deshacer. Facturas, packing lists y despachos vinculados se eliminan.',
    };
  }

  @Post(':entity')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async upload(
    @Param('entity') entity: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
    @Req() req: JwtRequest,
  ) {
    if (!this.importService.isEntityKey(entity)) {
      throw new BadRequestException('Entidad no soportada');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjuntá un archivo CSV en el campo file');
    }
    const username = req.user?.username?.trim() || 'unknown';
    return this.importService.runImport(entity, file.buffer, username);
  }
}
