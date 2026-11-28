import { IsNotEmpty, IsString, IsEnum, IsOptional, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class AcknowledgeLegalUpdateDto {
  @ApiProperty({ enum: ['LEGAL_DOCUMENT', 'RULE'], description: 'Loại nguồn cập nhật pháp luật' })
  @IsString()
  @IsIn(['LEGAL_DOCUMENT', 'RULE'])
  sourceType!: 'LEGAL_DOCUMENT' | 'RULE';

  @ApiProperty({ example: '67/2025/QH15', description: 'Số hiệu văn bản hoặc mã quy tắc' })
  @IsString()
  @IsNotEmpty()
  sourceCode!: string;

  @ApiProperty({ description: 'Phiên bản hoặc mốc đồng bộ của văn bản/quy tắc' })
  @IsString()
  @IsNotEmpty()
  sourceVersion!: string;

  @ApiProperty({ enum: ['CONFIRMED', 'DISMISSED'], description: 'Trạng thái phản hồi của doanh nghiệp' })
  @IsString()
  @IsIn(['CONFIRMED', 'DISMISSED'])
  status!: 'CONFIRMED' | 'DISMISSED';

  @ApiPropertyOptional({ description: 'Lựa chọn tình trạng tuân thủ thực tế' })
  @IsOptional()
  @IsString()
  selectedOption?: string;

  @ApiPropertyOptional({ description: 'Tên văn bản / quy định được xác nhận' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Căn cứ pháp lý đính kèm' })
  @IsOptional()
  @IsString()
  legalReference?: string;
}
