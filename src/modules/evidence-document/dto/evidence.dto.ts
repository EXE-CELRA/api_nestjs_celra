import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceStatus } from '@prisma/client';

export class VerifyEvidenceDto {
  @ApiPropertyOptional({ enum: EvidenceStatus, example: EvidenceStatus.accepted, description: 'Trạng thái thẩm tra: accepted hoặc rejected' })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;

  @ApiPropertyOptional({ enum: EvidenceStatus, description: 'Trạng thái thẩm tra tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  trangThai?: EvidenceStatus;

  @ApiPropertyOptional({ example: 'Hợp đồng lao động còn thiếu điều khoản đóng BHXH bắt buộc', description: 'Lý do từ chối' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ example: 'Hợp đồng lao động còn thiếu điều khoản đóng BHXH bắt buộc', description: 'Lý do từ chối tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  lyDoTuChoi?: string;
}

export class UploadEvidenceDto {
  @ApiPropertyOptional({ example: 'Bảng kê Doanh thu & Chi phí Quý 1/2026' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Bảng kê Doanh thu & Chi phí Quý 1/2026' })
  @IsOptional()
  @IsString()
  tenTaiLieu?: string;

  @ApiPropertyOptional({ example: 'Thuế Doanh Nghiệp' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Thuế Doanh Nghiệp', description: 'Danh mục chứng từ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  danhMuc?: string;

  @ApiPropertyOptional({ example: 'Bảng kê thu - chi' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  quarter?: string | number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  quy?: string | number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  year?: string | number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  nam?: string | number;

  @ApiPropertyOptional({ description: 'ID Tác vụ liên kết' })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ description: 'Mã nhiệm vụ liên kết tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maNhiemVu?: string;

  @ApiPropertyOptional({ description: 'Dữ liệu JSON metadata đính kèm' })
  @IsOptional()
  metadata?: string;
}
