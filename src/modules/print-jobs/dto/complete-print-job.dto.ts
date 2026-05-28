import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompletePrintJobDto {
  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  printer?: string;
}
