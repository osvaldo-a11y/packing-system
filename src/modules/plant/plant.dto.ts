import { IsNumber, Max, Min } from 'class-validator';

export class UpdatePlantSettingsDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  yield_tolerance_percent: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  min_yield_percent: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  max_merma_percent: number;
}
