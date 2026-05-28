import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePrintJobDto {
  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsString()
  zpl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  printerName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  copies?: number;
}
