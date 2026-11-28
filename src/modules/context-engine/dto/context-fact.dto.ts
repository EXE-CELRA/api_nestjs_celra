import { IsNotEmpty, IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ContextGroup, ContextStatus } from '@prisma/client';

export class CreateContextFactDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsEnum(ContextGroup)
  @IsNotEmpty()
  group!: ContextGroup;

  @IsString()
  @IsNotEmpty()
  currentValue!: string;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsOptional()
  @IsEnum(ContextStatus)
  status?: ContextStatus;

  @IsOptional()
  @IsArray()
  affectedRules?: string[];

  @IsOptional()
  @IsString()
  conflictDetails?: string;
}

export class UpdateContextFactDto {
  @IsString()
  @IsNotEmpty()
  currentValue!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(ContextStatus)
  status?: ContextStatus;

  @IsOptional()
  @IsString()
  conflictDetails?: string;
}

export class GenerateChecklistFromFactDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  legalBasis?: string;

  @IsOptional()
  @IsArray()
  tasks?: Array<{
    title: string;
    description: string;
    priority?: string;
    legalBasis?: string;
    dueDateDays?: number;
  }>;
}
