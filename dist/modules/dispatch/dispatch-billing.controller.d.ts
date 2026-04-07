import { AddDispatchTagDto, CreateDispatchDto, CreateSalesOrderDto, ModifySalesOrderDto } from './dispatch.dto';
import { DispatchBillingService } from './dispatch-billing.service';
export declare class DispatchBillingController {
    private readonly service;
    constructor(service: DispatchBillingService);
    createSalesOrder(dto: CreateSalesOrderDto): Promise<import("./dispatch.entities").SalesOrder>;
    modifySalesOrder(id: number, dto: ModifySalesOrderDto): Promise<import("./dispatch.entities").SalesOrder>;
    createDispatch(dto: CreateDispatchDto): Promise<import("./dispatch.entities").Dispatch>;
    addTag(id: number, dto: AddDispatchTagDto): Promise<import("./dispatch.entities").DispatchTagItem>;
    genPacking(id: number): Promise<import("./dispatch.entities").PackingList>;
    genInvoice(id: number): Promise<import("./dispatch.entities").Invoice>;
}
