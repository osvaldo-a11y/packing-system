import {
  BadRequestException,
  Body,
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
import { PurgeProcessesByIdsDto } from './purge-processes-by-ids.dto';
import { PurgePtTagsByIdsDto } from './purge-pt-tags-by-ids.dto';
import { PurgeReceptionsByIdsDto } from './purge-receptions-by-ids.dto';
import { PurgeSalesOrdersByIdsDto } from './purge-sales-orders-by-ids.dto';

type JwtRequest = Request & { user?: { username?: string } };

@ApiTags('importaci?n masiva')
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

  /** Vista previa de recepciones recientes (id, referencia, estado) para armar borrado selectivo. */
  @Get('receptions/recent-for-delete')
  async receptionsRecentForDelete(@Query('limit') limit?: string) {
    const parsed = limit != null ? Number(limit) : undefined;
    return this.importService.listRecentReceptionsPreview(parsed);
  }

  /**
   * Borra solo las recepciones listadas (p. ej. las del ?ltimo CSV). Requiere borrador y sin procesos vinculados.
   * Header: `X-Confirm-Purge: CONFIRMO-BORRAR-RECEPCIONES-POR-ID`
   */
  @Post('receptions/delete-by-ids')
  async deleteReceptionsByIds(
    @Headers('x-confirm-purge') confirmHeader: string | undefined,
    @Body() body: PurgeReceptionsByIdsDto,
  ) {
    const expected = 'CONFIRMO-BORRAR-RECEPCIONES-POR-ID';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        `Envi? el header X-Confirm-Purge con el valor exacto: ${expected}`,
      );
    }
    return this.importService.purgeReceptionsByIds(body.reception_ids);
  }

  @Delete('receptions/purge-all')
  async purgeAllReceptions(@Headers('x-confirm-purge') confirmHeader?: string) {
    const expected = 'CONFIRMO-BORRAR-RECEPCIONES';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        'Acci?n peligrosa. Envi? el header X-Confirm-Purge con el valor exacto para confirmar.',
      );
    }
    const purged = await this.importService.purgeAllReceptions();
    return {
      purged,
      warning:
        'Esta acci?n no se puede deshacer. Asegurate de tener el backup descargado.',
    };
  }

  /** Vista previa de pedidos recientes (para armar `sales_order_ids` antes de borrar selectivo). */
  @Get('sales-orders/recent-for-delete')
  async salesOrdersRecentForDelete(@Query('limit') limit?: string) {
    const parsed = limit != null ? Number(limit) : undefined;
    return this.importService.listRecentSalesOrdersPreview(parsed);
  }

  /**
   * Borra solo los pedidos listados si no tienen despachos (`dispatches.orden_id`).
   * Header: `X-Confirm-Purge: CONFIRMO-BORRAR-PEDIDOS-POR-ID`
   */
  @Post('sales-orders/delete-by-ids')
  async deleteSalesOrdersByIds(
    @Headers('x-confirm-purge') confirmHeader: string | undefined,
    @Body() body: PurgeSalesOrdersByIdsDto,
  ) {
    const expected = 'CONFIRMO-BORRAR-PEDIDOS-POR-ID';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        `Envi? el header X-Confirm-Purge con el valor exacto: ${expected}`,
      );
    }
    return this.importService.purgeSalesOrdersByIds(body.sales_order_ids);
  }

  /** Vista previa de unidades PT recientes (id, c?digo, despachos, etc.) para borrado selectivo. */
  @Get('pt-tags/recent-for-delete')
  async ptTagsRecentForDelete(@Query('limit') limit?: string) {
    const parsed = limit != null ? Number(limit) : undefined;
    return this.importService.listRecentPtTagsPreview(parsed);
  }

  /** Vista previa de procesos recientes (para armar `process_ids` antes de borrar selectivo). */
  @Get('processes/recent-for-delete')
  async processesRecentForDelete(@Query('limit') limit?: string) {
    const parsed = limit != null ? Number(limit) : undefined;
    return this.importService.listRecentProcessesPreview(parsed);
  }

  /**
   * Borra procesos por id (solo borrador, balance abierto, sin PT / pallet final / factura / repalet).
   * Header: `X-Confirm-Purge: CONFIRMO-BORRAR-PROCESOS-POR-ID`
   */
  @Post('processes/delete-by-ids')
  async deleteProcessesByIds(
    @Headers('x-confirm-purge') confirmHeader: string | undefined,
    @Body() body: PurgeProcessesByIdsDto,
  ) {
    const expected = 'CONFIRMO-BORRAR-PROCESOS-POR-ID';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        `Envi? el header X-Confirm-Purge con el valor exacto: ${expected}`,
      );
    }
    return this.importService.purgeProcessesByIds(body.process_ids);
  }

  /**
   * Borra unidades PT por id (mismas reglas que `purgePtTagById`: sin despacho, factura ni merge).
   * Header: `X-Confirm-Purge: CONFIRMO-BORRAR-UNIDADES-PT-POR-ID`
   */
  @Post('pt-tags/delete-by-ids')
  async deletePtTagsByIds(
    @Headers('x-confirm-purge') confirmHeader: string | undefined,
    @Body() body: PurgePtTagsByIdsDto,
  ) {
    const expected = 'CONFIRMO-BORRAR-UNIDADES-PT-POR-ID';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        `Envi? el header X-Confirm-Purge con el valor exacto: ${expected}`,
      );
    }
    return this.importService.purgePtTagsByIds(body.tarja_ids);
  }

  @Delete('sales-orders-dispatches/purge-all')
  async purgeAllSalesOrdersDispatches(@Headers('x-confirm-purge') confirmHeader?: string) {
    const expected = 'CONFIRMO-BORRAR-PEDIDOS-Y-DESPACHOS';
    if ((confirmHeader ?? '').trim() !== expected) {
      throw new BadRequestException(
        'Acci?n peligrosa. Envi? el header X-Confirm-Purge con el valor exacto para confirmar.',
      );
    }
    const purged = await this.importService.purgeAllSalesOrdersDispatches();
    return {
      purged,
      warning:
        'Esta acci?n no se puede deshacer. Facturas, packing lists y despachos vinculados se eliminan.',
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
      throw new BadRequestException('Adjunt? un archivo CSV en el campo file');
    }
    const username = req.user?.username?.trim() || 'unknown';
    return this.importService.runImport(entity, file.buffer, username);
  }
}
