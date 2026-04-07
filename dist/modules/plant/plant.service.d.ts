import { Repository } from 'typeorm';
import { UpdatePlantSettingsDto } from './plant.dto';
import { PlantSettings } from './plant.entities';
export declare class PlantService {
    private readonly repo;
    constructor(repo: Repository<PlantSettings>);
    getOrCreate(): Promise<PlantSettings>;
    update(dto: UpdatePlantSettingsDto): Promise<PlantSettings>;
}
