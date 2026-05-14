import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

export class PurgeProcessesByIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  process_ids!: number[];
}
