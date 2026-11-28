import { IsNotEmpty, IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  conditionSummary!: string;

  @IsOptional()
  conditionsJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  triggeredChecklists?: string[];

  @IsOptional()
  @IsString()
  version?: string;

  @IsString()
  @IsNotEmpty()
  legalReference!: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsString()
  @IsNotEmpty()
  category!: string;
}
