import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, UserRole } from '@prisma/client';

export class AIChatMessageDto {
  @ApiPropertyOptional({ example: 'Doanh nghiệp tôi F&B có 5 nhân sự thì cần làm gì về hợp đồng lao động và BHXH?' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ example: 'Doanh nghiệp tôi F&B có 5 nhân sự thì cần làm gì về thuế TNDN?' })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({ example: 'conv-12345' })
  @IsOptional()
  @IsString()
  conversationId?: string;
}

export class AcceptProposalDto {
  @ApiPropertyOptional({ example: 'prop-12345' })
  @IsOptional()
  @IsString()
  proposalId?: string;

  @ApiProperty({ example: 'Rà soát hợp đồng lao động & đóng BHXH bắt buộc' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'TASK-AI-01' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Lao động & BHXH' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ enum: Priority, default: Priority.high })
  @IsNotEmpty()
  priority!: Priority;

  @ApiProperty({ example: 'Phát hiện thiếu điều khoản BHXH bắt buộc cho nhân sự' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ example: 'Bộ luật Lao động 2019 và Luật BHXH 2014' })
  @IsString()
  @IsNotEmpty()
  legalBasis!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.hr_staff })
  @IsOptional()
  assigneeRole?: UserRole;
}

export class UpdateLegalRuleDto {
  @ApiPropertyOptional({ example: 'Nghị định 126/2020/NĐ-CP và Nghị định 22/2020/NĐ-CP' })
  @IsOptional()
  @IsString()
  legalReference?: string;

  @ApiPropertyOptional({ example: '2.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;

  @ApiPropertyOptional({ example: 'Nội dung hướng dẫn chi tiết quy định pháp luật mới...' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'Tóm tắt quy định sửa đổi' })
  @IsOptional()
  @IsString()
  conditionSummary?: string;

  @ApiPropertyOptional({ example: 'Quy định thuế môn bài mới' })
  @IsOptional()
  @IsString()
  title?: string;
}

