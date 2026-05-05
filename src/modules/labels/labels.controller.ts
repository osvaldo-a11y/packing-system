import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LabelsService } from './labels.service';
import type { TarjaTemplateMeta } from './tarja-template-registry';

@ApiTags('labels / Zebra')
@ApiBearerAuth('JWT-auth')
@Controller('api/labels')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get('templates')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  @ApiOkResponse({
    description: 'Catálogo de plantillas ZPL para tarjas PT',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['compact', 'standard', 'detailed'] },
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  })
  listTemplates(): TarjaTemplateMeta[] {
    return this.labels.listTarjaTemplates();
  }

  @Get('tarja/:id')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  @ApiProduces('text/plain')
  @ApiQuery({
    name: 'template',
    required: false,
    enum: ['compact', 'standard', 'detailed'],
    description: 'Plantilla ZPL de etiqueta',
  })
  @ApiOkResponse({ description: 'ZPL para impresora Zebra', schema: { type: 'string' } })
  async tarjaZpl(
    @Param('id', ParseIntPipe) id: number,
    @Query('template') template: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const zpl = await this.labels.getTarjaZpl(id, template);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(zpl);
  }
}
