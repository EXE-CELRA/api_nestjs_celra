import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceStatus } from '@prisma/client';

export class VerifyEvidenceDto {
  @ApiProperty({ enum: EvidenceStatus, example: EvidenceStatus.accepted, description: 'Trạng thái thẩm tra: accepted hoặc rejected' })
  @IsEnum(EvidenceStatus)
  @IsNotEmpty()
  status!: EvidenceStatus;

  @ApiPropertyOptional({ example: 'Hợp đồng lao động còn thiếu điều khoản đóng BHXH bắt buộc', description: 'Lý do từ chối' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UploadEvidenceDto {
  @ApiPropertyOptional({ example: 'Hợp đồng lao động mẫu' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'ID Tác vụ liên kết' })
  @IsOptional()
  @IsString()
  taskId?: string;
}
