import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdatePlantSettingsDto } from './plant.dto';
import { PlantSettings } from './plant.entities';

@Injectable()
export class PlantService {
  constructor(@InjectRepository(PlantSettings) private readonly repo: Repository<PlantSettings>) {}

  async getOrCreate(): Promise<PlantSettings> {
    // TypeORM 0.3+ no permite findOne solo con order; usar find + take.
    const rows = await this.repo.find({ order: { id: 'ASC' }, take: 1 });
    let row = rows[0];
    if (!row) {
      row = await this.repo.save(
        this.repo.create({
          yield_tolerance_percent: '5.0000',
          min_yield_percent: '70.0000',
          max_merma_percent: '15.0000',
        }),
      );
    }
    return row;
  }

  async update(dto: UpdatePlantSettingsDto): Promise<PlantSettings> {
    const row = await this.getOrCreate();
    if (!row) throw new NotFoundException('Parámetros de planta no inicializados');
    row.yield_tolerance_percent = dto.yield_tolerance_percent.toFixed(4);
    row.min_yield_percent = dto.min_yield_percent.toFixed(4);
    row.max_merma_percent = dto.max_merma_percent.toFixed(4);
    return this.repo.save(row);
  }
}
