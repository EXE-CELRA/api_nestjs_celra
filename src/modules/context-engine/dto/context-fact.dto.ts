import { IsNotEmpty, IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContextGroup, ContextStatus } from '@prisma/client';

export class CreateContextFactDto {
  @ApiProperty({ example: 'q_tax_corp_2', description: 'Mã định danh dữ kiện' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ example: 'Tạm nộp thuế TNDN 4 quý đạt tối thiểu 80%', description: 'Tên nhãn hiển thị' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: ContextGroup, example: ContextGroup.thue_ke_toan, description: 'Thuộc nhóm bối cảnh' })
  @IsEnum(ContextGroup)
  @IsNotEmpty()
  group!: ContextGroup;

  @ApiProperty({ example: 'Đã tạm nộp đầy đủ hàng quý đạt từ 80% trở lên', description: 'Giá trị dữ kiện hiện tại' })
  @IsString()
  @IsNotEmpty()
  currentValue!: string;

  @ApiProperty({ example: 'Khảo sát tình huống Thuế TNDN', description: 'Nguồn cung cấp dữ kiện' })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiPropertyOptional({ enum: ContextStatus, default: ContextStatus.unconfirmed })
  @IsOptional()
  @IsEnum(ContextStatus)
  status?: ContextStatus;

  @ApiPropertyOptional({ example: ['RULE-TAX-TNDN-80'], description: 'Các mã quy tắc bị ảnh hưởng' })
  @IsOptional()
  @IsArray()
  affectedRules?: string[];

  @ApiPropertyOptional({ description: 'Chi tiết xung đột nếu có' })
  @IsOptional()
  @IsString()
  conflictDetails?: string;
}

export class UpdateContextFactDto {
  @ApiProperty({ example: 'Đã tạm nộp đầy đủ qua cổng eTax', description: 'Giá trị mới cần cập nhật' })
  @IsString()
  @IsNotEmpty()
  currentValue!: string;

  @ApiPropertyOptional({ example: 'Đối chiếu từ Giấy nộp tiền NSNN tiểu mục 1052', description: 'Ghi chú lý do thay đổi' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: ContextStatus })
  @IsOptional()
  @IsEnum(ContextStatus)
  status?: ContextStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conflictDetails?: string;
}

export class GenerateChecklistFromFactDto {
  @ApiPropertyOptional({ description: 'Tiêu đề checklist muốn tạo' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Nhóm phân loại' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Mức độ ưu tiên' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ description: 'Căn cứ pháp lý' })
  @IsOptional()
  @IsString()
  legalBasis?: string;

  @ApiPropertyOptional({ description: 'Danh sách các nhiệm vụ kiểm tra' })
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
