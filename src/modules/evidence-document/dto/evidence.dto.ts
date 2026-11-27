import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceStatus } from '@prisma/client';

export class VerifyEvidenceDto {
  @ApiPropertyOptional({ enum: EvidenceStatus, example: EvidenceStatus.accepted, description: 'Trạng thái thẩm tra: accepted hoặc rejected' })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;

  @ApiPropertyOptional({ example: 'Hóa đơn mua vào từ 5 triệu đồng trở lên chưa kèm Ủy nhiệm chi ngân hàng công ty', description: 'Lý do từ chối' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UploadEvidenceDto {
  @ApiPropertyOptional({ example: 'Bảng kê Doanh thu & Chi phí TNDN Quý 4/2026', description: 'Tiêu đề chứng từ' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Thuế TNDN', description: 'Danh mục phân loại' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'TAX_DECLARATION', description: 'Loại chứng từ tải lên' })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional({ example: 'Bảng kê thu - chi', description: 'Nhãn gắn thẻ' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: '4', description: 'Kỳ quý áp dụng' })
  @IsOptional()
  quarter?: string | number;

  @ApiPropertyOptional({ example: 2026, description: 'Năm tài chính áp dụng' })
  @IsOptional()
  year?: string | number;

  @ApiPropertyOptional({ description: 'ID tác vụ liên kết' })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ description: 'Dữ liệu JSON metadata đính kèm' })
  @IsOptional()
  metadata?: string;
}
