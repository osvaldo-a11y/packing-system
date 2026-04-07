import { Repository } from 'typeorm';
import { AddDispatchTagDto, CreateDispatchDto, CreateSalesOrderDto, ModifySalesOrderDto } from './dispatch.dto';
import { Dispatch, DispatchTagItem, Invoice, InvoiceItem, PackingList, SalesOrder, SalesOrderModification } from './dispatch.entities';
export declare class DispatchBillingService {
    private readonly soRepo;
    private readonly dispatchRepo;
    private readonly dtiRepo;
    private readonly plRepo;
    private readonly invRepo;
    private readonly invItemRepo;
    private readonly soModRepo;
    constructor(soRepo: Repository<SalesOrder>, dispatchRepo: Repository<Dispatch>, dtiRepo: Repository<DispatchTagItem>, plRepo: Repository<PackingList>, invRepo: Repository<Invoice>, invItemRepo: Repository<InvoiceItem>, soModRepo: Repository<SalesOrderModification>);
    createSalesOrder(dto: CreateSalesOrderDto): Promise<SalesOrder>;
    modifySalesOrder(orderId: number, dto: ModifySalesOrderDto): Promise<SalesOrder>;
    createDispatch(dto: CreateDispatchDto): Promise<Dispatch>;
    addTag(dispatchId: number, dto: AddDispatchTagDto): Promise<DispatchTagItem>;
    generatePackingList(dispatchId: number): Promise<PackingList>;
    generateInvoice(dispatchId: number): Promise<Invoice>;
}
