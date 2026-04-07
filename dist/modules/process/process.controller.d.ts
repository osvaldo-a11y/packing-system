import { AddPtTagItemDto, CreateFruitProcessDto, CreatePtTagDto, UpdatePtTagDto } from './process.dto';
import { ProcessService } from './process.service';
export declare class ProcessController {
    private readonly service;
    constructor(service: ProcessService);
    createProcess(dto: CreateFruitProcessDto): Promise<import("./process.entities").FruitProcess>;
    createTag(dto: CreatePtTagDto): Promise<import("./process.entities").PtTag>;
    addToTag(id: number, dto: AddPtTagItemDto): Promise<import("./process.entities").PtTag>;
    updateTag(id: number, dto: UpdatePtTagDto): Promise<import("./process.entities").PtTag>;
}
