import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AddDispatchTagDto,
  AddManualInvoiceLineDto,
  AttachFinalPalletsDto,
  CreateDispatchDto,
  UpdateDispatchMetaDto,
  UpdateDispatchOrderLinkDto,
  UpdateDispatchBolDto,
  UpdateDispatchUnitPricesDto,
  CreateSalesOrderDto,
  ModifySalesOrderDto,
  RegenerateEmptyInvoicesDto,
} from './dispatch.dto';
import { DispatchBillingService } from './dispatch-billing.service';
import { SalesOrderProgressService } from './sales-order-progress.service';

@ApiTags('despacho / facturación')
@ApiBearerAuth('JWT-auth')
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispatchBillingController {
  constructor(
    private readonly service: DispatchBillingService,
    private readonly salesOrderProgress: SalesOrderProgressService,
  ) {}

  @Get('sales-orders')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listSalesOrders() {
    return this.service.listSalesOrders();
  }

  @Get('sales-orders/:id/progress')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  getSalesOrderProgress(@Param('id', ParseIntPipe) id: number) {
    return this.salesOrderProgress.getProgress(id);
  }

  @Post('sales-orders')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createSalesOrder(@Body() dto: CreateSalesOrderDto) {
    return this.service.createSalesOrder(dto);
  }

  @Put('sales-orders/:id')
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  modifySalesOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifySalesOrderDto) {
    return this.service.modifySalesOrder(id, dto);
  }

  @Get('dispatches')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listDispatches() {
    return this.service.listDispatchesWithItems();
  }

  @Get('dispatches/linkable-pt-packing-lists')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listLinkablePtPackingLists() {
    return this.service.listLinkablePtPackingLists();
  }

  /** Auditoría: facturas sin líneas (afecta liquidación). */
  @Get('dispatches/invoice-health')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  invoiceHealth() {
    return this.service.listInvoicesWithNoLines();
  }

  /** Regenera factura (POST …/invoice/generate) solo para despachos listados en invoice-health. Solo admin. */
  @Post('dispatches/invoice/regenerate-empty')
  @HttpCode(201)
  @Roles(ROLES.ADMIN)
  regenerateEmptyInvoices(@Body() dto: RegenerateEmptyInvoicesDto) {
    return this.service.regenerateEmptyInvoices(dto.dispatch_ids);
  }

  @Post('dispatches')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  createDispatch(@Body() dto: CreateDispatchDto) {
    return this.service.createDispatch(dto);
  }

  @Post('dispatches/:id/confirm')
  @HttpCode(201)
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  confirmDispatch(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirmDispatch(id);
  }

  @Post('dispatches/:id/despachar')
  @HttpCode(201)
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  despacharDispatch(@Param('id', ParseIntPipe) id: number) {
    return this.service.despacharDispatch(id);
  }

  @Post('dispatches/:id/revert-despachado')
  @HttpCode(201)
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  revertDespachado(@Param('id', ParseIntPipe) id: number) {
    return this.service.revertDespachado(id);
  }

  @Post('dispatches/:id/tags')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  addTag(@Param('id', ParseIntPipe) id: number, @Body() dto: AddDispatchTagDto) {
    return this.service.addTag(id, dto);
  }

  @Post('dispatches/:id/final-pallets')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  attachFinalPallets(@Param('id', ParseIntPipe) id: number, @Body() dto: AttachFinalPalletsDto) {
    return this.service.attachFinalPallets(id, dto);
  }

  @Patch('dispatches/:id/unit-prices')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  updateDispatchUnitPrices(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDispatchUnitPricesDto) {
    return this.service.updateDispatchUnitPrices(id, dto);
  }

  @Patch('dispatches/:id/bol')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  updateDispatchBol(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDispatchBolDto) {
    return this.service.updateDispatchBol(id, dto);
  }

  @Patch('dispatches/:id/meta')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  updateDispatchMeta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDispatchMetaDto) {
    return this.service.updateDispatchMeta(id, dto);
  }

  @Patch('dispatches/:id/order-link')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  updateDispatchOrderLink(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDispatchOrderLinkDto) {
    return this.service.updateDispatchOrderLink(id, dto);
  }

  @Post('dispatches/:id/packing-list/generate')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  genPacking(@Param('id', ParseIntPipe) id: number) {
    return this.service.generatePackingList(id);
  }

  @Post('dispatches/:id/invoice/generate')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  genInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.service.generateInvoice(id);
  }

  @Post('dispatches/:id/invoice/lines')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  addInvoiceLine(@Param('id', ParseIntPipe) id: number, @Body() dto: AddManualInvoiceLineDto) {
    return this.service.addManualInvoiceLine(id, dto);
  }

  @Delete('dispatches/:id/invoice/lines/:lineId')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  deleteInvoiceLine(@Param('id', ParseIntPipe) id: number, @Param('lineId', ParseIntPipe) lineId: number) {
    return this.service.deleteManualInvoiceLine(id, lineId);
  }

  /** Vincula despachos sin PL PT (legacy) a un `pt_packing_lists` por BOL+cliente y copia pallets a `pt_packing_list_items`. */
  @Post('admin/reconcile-legacy-dispatches')
  @Roles(ROLES.ADMIN)
  reconcileLegacyDispatches(@Query('dryRun') dryRun?: string) {
    const flag = dryRun === 'true' || dryRun === '1';
    return this.service.reconcileLegacyDispatches({ dryRun: flag });
  }
}
