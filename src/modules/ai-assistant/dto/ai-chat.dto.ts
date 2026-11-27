import { IsNotEmpty, IsString, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, UserRole } from '@prisma/client';

export class ChatHistoryItemDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'Doanh nghiệp tôi có 5 nhân sự' })
  @IsString()
  content!: string;
}
export class AIChatMessageDto {
  @ApiPropertyOptional({ example: 'Doanh nghiệp tôi F&B doanh thu 2.5 tỷ thì áp dụng thuế suất TNDN bao nhiêu %?' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ example: 'Doanh nghiệp tôi F&B có khoản chi 8 triệu trả tiền mặt có bị loại Mục B4 thuế TNDN không?' })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({ example: 'conv-12345' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ type: [ChatHistoryItemDto], description: 'Lịch sử hội thoại gần nhất (10 messages)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  history?: ChatHistoryItemDto[];
}

export class AcceptProposalDto {
  @ApiPropertyOptional({ example: 'prop-12345' })
  @IsOptional()
  @IsString()
  proposalId?: string;

  @ApiProperty({ example: 'Tạm nộp thuế TNDN Quý đạt tối thiểu 80% quyết toán năm' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'TASK-AI-01' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Thuế TNDN' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ enum: Priority, default: Priority.high })
  @IsNotEmpty()
  priority!: Priority;

  @ApiProperty({ example: 'Cần đối soát chi phí được trừ và tạm nộp đủ ngưỡng 80% thuế TNDN' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ example: 'Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP và Điều 4 Thông tư 96/2015/TT-BTC' })
  @IsString()
  @IsNotEmpty()
  legalBasis!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.internal_accountant })
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

  @ApiPropertyOptional({ example: 'Quy định tạm nộp thuế TNDN 80% và quyết toán Mẫu 03/TNDN' })
  @IsOptional()
  @IsString()
  title?: string;
}

