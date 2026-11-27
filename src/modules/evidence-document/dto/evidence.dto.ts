import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceStatus } from '@prisma/client';

export class VerifyEvidenceDto {
  @ApiPropertyOptional({ enum: EvidenceStatus, example: EvidenceStatus.accepted, description: 'Trạng thái thẩm tra: accepted hoặc rejected' })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;

  @ApiPropertyOptional({ example: 'Hợp đồng lao động còn thiếu điều khoản đóng BHXH bắt buộc', description: 'Lý do từ chối' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UploadEvidenceDto {
  @ApiPropertyOptional({ example: 'Bảng kê Doanh thu & Chi phí Quý 1/2026' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Thuế Doanh Nghiệp' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'LEGAL_LICENSE', description: 'Loại chứng từ tải lên' })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional({ example: 'Bảng kê thu - chi' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  quarter?: string | number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  year?: string | number;

  @ApiPropertyOptional({ description: 'ID Tác vụ liên kết' })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ description: 'Dữ liệu JSON metadata đính kèm' })
  @IsOptional()
  metadata?: string;
}
