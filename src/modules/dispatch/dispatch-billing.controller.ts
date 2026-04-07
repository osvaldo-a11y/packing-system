import { Body, Controller, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddDispatchTagDto, CreateDispatchDto, CreateSalesOrderDto, ModifySalesOrderDto } from './dispatch.dto';
import { DispatchBillingService } from './dispatch-billing.service';

@Controller('api')
export class DispatchBillingController {
  constructor(private readonly service: DispatchBillingService) {}

  @Post('sales-orders')
  createSalesOrder(@Body() dto: CreateSalesOrderDto) {
    return this.service.createSalesOrder(dto);
  }

  @Put('sales-orders/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  modifySalesOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifySalesOrderDto) {
    return this.service.modifySalesOrder(id, dto);
  }

  @Post('dispatches')
  createDispatch(@Body() dto: CreateDispatchDto) {
    return this.service.createDispatch(dto);
  }

  @Post('dispatches/:id/tags')
  addTag(@Param('id', ParseIntPipe) id: number, @Body() dto: AddDispatchTagDto) {
    return this.service.addTag(id, dto);
  }

  @Post('dispatches/:id/packing-list/generate')
  genPacking(@Param('id', ParseIntPipe) id: number) {
    return this.service.generatePackingList(id);
  }

  @Post('dispatches/:id/invoice/generate')
  genInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.service.generateInvoice(id);
  }
}
