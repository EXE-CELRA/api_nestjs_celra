import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { StatutoryCycleType, UserRole, Priority } from '@prisma/client';

export function normalizeUserRole(val: any): UserRole {
  if (!val) return UserRole.owner;
  const s = String(val).toUpperCase();
  if (s === 'BUSINESS_OWNER' || s === 'OWNER') return UserRole.owner;
  if (s === 'INTERNAL_ACCOUNTANT') return UserRole.internal_accountant;
  if (s === 'OUTSOURCED_AGENT' || s === 'SERVICE_ACCOUNTANT') return UserRole.service_accountant;
  if (s === 'HR_OFFICER' || s === 'HR_STAFF') return UserRole.hr_staff;
  if (s === 'EXPERT' || s === 'VERIFIER_EXPERT') return UserRole.expert;
  if (s === 'ADMIN' || s === 'SUPER_ADMIN') return UserRole.admin;
  if (Object.values(UserRole).includes(val)) return val;
  return UserRole.owner;
}

export class BatchAuditContextDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  factIds?: string[];

  @IsOptional()
  @IsString()
  scope?: string;
}

export class ConfirmChecklistItemDto {
  @IsOptional()
  @IsString()
  findingId?: string;

  @IsString()
  @IsNotEmpty()
  ruleCode!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsEnum(StatutoryCycleType)
  cycleType!: StatutoryCycleType;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  assigneeName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeUserRole(value))
  @IsEnum(UserRole)
  assigneeRole?: UserRole;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  legalBasis?: string;

  @IsOptional()
  @IsString()
  legalDocUrl?: string;

  @IsOptional()
  @IsString()
  evidenceRequirement?: string;

  @IsOptional()
  @IsArray()
  tasks?: Array<{
    code?: string;
    title: string;
    description?: string;
    priority?: Priority;
    dueDate?: string;
  }>;
}

export class ConfirmChecklistsDto {
  @IsOptional()
  @IsString()
  auditId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmChecklistItemDto)
  items!: ConfirmChecklistItemDto[];
}
