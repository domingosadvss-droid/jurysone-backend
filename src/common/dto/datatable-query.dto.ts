import { IsOptional, IsNumber, IsString } from 'class-validator';

export class DataTableQueryDto {
  @IsOptional()
  @IsNumber()
  start?: number = 0;

  @IsOptional()
  @IsNumber()
  length?: number = 10;

  @IsOptional()
  @IsString()
  search?: string = '';

  @IsOptional()
  @IsString()
  orderBy?: string;

  @IsOptional()
  @IsString()
  orderDir?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsString()
  filter?: string;
}
