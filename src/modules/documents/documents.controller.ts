import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommercialInvoicePdfDto } from './dto/commercial-invoice-pdf.dto';
import { DocumentsPdfService } from './documents-pdf.service';

@ApiTags('documentos PDF')
@ApiBearerAuth('JWT-auth')
@Controller('api/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly pdf: DocumentsPdfService) {}

  @Get('receptions/:id/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async receptionPdf(@Param('id', ParseIntPipe) id: number) {
    const buffer = await this.pdf.buildReceptionPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="recepcion-${id}.pdf"`,
    });
  }

  @Get('processes/:id/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async processPdf(@Param('id', ParseIntPipe) id: number) {
    const buffer = await this.pdf.buildProcessPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="proceso-${id}.pdf"`,
    });
  }

  @Get('pt-tags/:id/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async tagPdf(@Param('id', ParseIntPipe) id: number, @Query('variant') variant?: string) {
    const v = (variant ?? '').toLowerCase();
    const buffer =
      v === 'etiqueta' || v === 'label'
        ? await this.pdf.buildTagLabelPdf(id)
        : await this.pdf.buildTagDetailPdf(id);
    const suffix = v === 'etiqueta' || v === 'label' ? '-etiqueta' : '';
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="unidad-pt-${id}${suffix}.pdf"`,
    });
  }

  /** Etiqueta 4×6 (existencias / pallet final). Tras repaletizaje, usar el id del pallet resultado (ej. PF-81). */
  @Get('final-pallets/:id/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async finalPalletPdf(@Param('id', ParseIntPipe) id: number, @Query('variant') variant?: string) {
    const v = (variant ?? 'etiqueta').toLowerCase();
    if (v === 'etiqueta' || v === 'label') {
      const buffer = await this.pdf.buildFinalPalletLabelPdf(id);
      return new StreamableFile(buffer, {
        type: 'application/pdf',
        disposition: `attachment; filename="existencia-pt-${id}-etiqueta.pdf"`,
      });
    }
    throw new BadRequestException('Solo se admite variant=etiqueta o label (etiqueta pallet existencias).');
  }

  @Get('dispatches/:id/invoice/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async invoicePdf(@Param('id', ParseIntPipe) id: number) {
    const buffer = await this.pdf.buildInvoicePdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="invoice-despacho-${id}.pdf"`,
    });
  }

  @Get('dispatches/:id/packing-list/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async packingListPdf(@Param('id', ParseIntPipe) id: number) {
    const buffer = await this.pdf.buildPackingListPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="packing-list-${id}.pdf"`,
    });
  }

  @Get('pt-packing-lists/:id/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async ptPackingListPdf(@Param('id', ParseIntPipe) id: number) {
    const buffer = await this.pdf.buildPtPackingListPtPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="pt-packing-list-${id}.pdf"`,
    });
  }

  /** Factura comercial PDF desde packing list PT (precios por formato en el cuerpo; no persiste factura). */
  @Post('pt-packing-lists/:id/invoice/pdf')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  async ptPackingListCommercialInvoicePdf(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommercialInvoicePdfDto,
  ) {
    const buffer = await this.pdf.buildPtPackingListCommercialInvoicePdf(id, dto?.unit_prices_by_format_id ?? {});
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="factura-pl-${id}.pdf"`,
    });
  }
}
