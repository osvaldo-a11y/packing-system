import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

export class PurgePtTagsByIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  tarja_ids!: number[];
}
