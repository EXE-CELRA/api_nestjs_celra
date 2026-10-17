import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, FindingStatus } from '@prisma/client';

export class CreateFindingDto {
  @ApiProperty({ example: 'FND-LD-01', description: 'Mã định danh phát hiện sai sót' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Hợp đồng lao động thiếu điều khoản BHXH bắt buộc', description: 'Tiêu đề rủi ro' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Qua rà soát 5 hợp đồng lao động, phát hiện chưa có điều khoản thỏa thuận về mức đóng và trách nhiệm đóng BHXH bắt buộc theo luật' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.high })
  @IsOptional()
  @IsEnum(Priority)
  severity?: Priority;

  @ApiPropertyOptional({ description: 'ID Tác vụ gốc gây ra sai sót' })
  @IsOptional()
  @IsString()
  relatedTaskId?: string;

  @ApiPropertyOptional({ example: 'TASK-LD-02' })
  @IsOptional()
  @IsString()
  relatedTaskCode?: string;

  @ApiPropertyOptional({ description: 'ID Bằng chứng có sai sót' })
  @IsOptional()
  @IsString()
  relatedEvidenceId?: string;

  @ApiPropertyOptional({ description: 'ID Phòng ban chịu trách nhiệm khắc phục' })
  @IsOptional()
  @IsString()
  responsibleDepartmentId?: string;

  @ApiProperty({ example: '2026-10-20T00:00:00.000Z' })
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ example: 'Lập phụ lục hợp đồng lao động bổ sung điều khoản BHXH cho 5 nhân sự' })
  @IsString()
  @IsNotEmpty()
  proposedAction!: string;
}

export class UpdateFindingStatusDto {
  @ApiProperty({ enum: FindingStatus, example: FindingStatus.remediated })
  @IsEnum(FindingStatus)
  @IsNotEmpty()
  status!: FindingStatus;
}
