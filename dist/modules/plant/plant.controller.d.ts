import { UpdatePlantSettingsDto } from './plant.dto';
import { PlantService } from './plant.service';
export declare class PlantController {
    private readonly service;
    constructor(service: PlantService);
    get(): Promise<import("./plant.entities").PlantSettings>;
    update(dto: UpdatePlantSettingsDto): Promise<import("./plant.entities").PlantSettings>;
}
