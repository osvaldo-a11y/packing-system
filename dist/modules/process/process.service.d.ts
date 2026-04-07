import { Repository } from 'typeorm';
import { AddPtTagItemDto, CreateFruitProcessDto, CreatePtTagDto, UpdatePtTagDto } from './process.dto';
import { FruitProcess, PtTag, PtTagAudit, PtTagItem } from './process.entities';
export declare class ProcessService {
    private readonly processRepo;
    private readonly tagRepo;
    private readonly tagItemRepo;
    private readonly tagAuditRepo;
    constructor(processRepo: Repository<FruitProcess>, tagRepo: Repository<PtTag>, tagItemRepo: Repository<PtTagItem>, tagAuditRepo: Repository<PtTagAudit>);
    createProcess(dto: CreateFruitProcessDto): Promise<FruitProcess>;
    createTag(dto: CreatePtTagDto): Promise<PtTag>;
    private boxWeight;
    addProcessToTag(tagId: number, dto: AddPtTagItemDto): Promise<PtTag>;
    updateTag(tagId: number, dto: UpdatePtTagDto): Promise<PtTag>;
}
