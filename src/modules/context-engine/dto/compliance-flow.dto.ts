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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description: 'Danh sách ID các thẻ bối cảnh cần rà soát (để trống để rà soát toàn bộ)',
    type: [String],
    example: ['fact-uuid-1', 'fact-uuid-2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  factIds?: string[];

  @ApiPropertyOptional({ example: 'ALL' })
  @IsOptional()
  @IsString()
  scope?: string;
}

export class ConfirmChecklistItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  findingId?: string;

  @ApiProperty({ example: 'RULE-TAX-GTGT' })
  @IsString()
  @IsNotEmpty()
  ruleCode!: string;

  @ApiProperty({ example: 'Kê khai và nộp thuế GTGT định kỳ' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Thuế Doanh Nghiệp' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ enum: StatutoryCycleType, example: StatutoryCycleType.QUARTERLY })
  @IsEnum(StatutoryCycleType)
  cycleType!: StatutoryCycleType;

  @ApiPropertyOptional({
    description: 'Ngày phát sinh sự kiện đối với các đợt theo sự kiện (EVENT_*)',
    example: '2026-10-21T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  assigneeName?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.owner })
  @IsOptional()
  @Transform(({ value }) => normalizeUserRole(value))
  @IsEnum(UserRole)
  assigneeRole?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalBasis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalDocUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceRequirement?: string;

  @ApiPropertyOptional()
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
  @ApiPropertyOptional({ description: 'ID phiên rà soát (ComplianceAudit ID)' })
  @IsOptional()
  @IsString()
  auditId?: string;

  @ApiProperty({ type: [ConfirmChecklistItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmChecklistItemDto)
  items!: ConfirmChecklistItemDto[];
}
