import { IsNotEmpty, IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContextGroup, ContextStatus } from '@prisma/client';

export class CreateContextFactDto {
  @ApiProperty({ example: 'tax_invoice_model', description: 'Mã định danh dữ kiện' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiPropertyOptional({ example: 'tax_invoice_model', description: 'Mã khóa dữ kiện tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  khoa?: string;

  @ApiProperty({ example: 'Mô hình hóa đơn điện tử', description: 'Tên nhãn hiển thị' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ example: 'Mô hình hóa đơn điện tử', description: 'Nhãn hiển thị tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  nhan?: string;

  @ApiProperty({ enum: ContextGroup, example: ContextGroup.hoa_don_dong_tien, description: 'Thuộc nhóm bối cảnh' })
  @IsEnum(ContextGroup)
  @IsNotEmpty()
  group!: ContextGroup;

  @ApiPropertyOptional({ enum: ContextGroup, description: 'Nhóm bối cảnh tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(ContextGroup)
  nhom?: ContextGroup;

  @ApiProperty({ example: 'Khởi tạo từ máy tính tiền kết nối cơ quan thuế', description: 'Giá trị dữ kiện hiện tại' })
  @IsString()
  @IsNotEmpty()
  currentValue!: string;

  @ApiPropertyOptional({ example: 'Khởi tạo từ máy tính tiền kết nối cơ quan thuế', description: 'Giá trị hiện tại tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  giaTriHienTai?: string;

  @ApiProperty({ example: 'Khảo sát tình huống', description: 'Nguồn cung cấp dữ kiện' })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiPropertyOptional({ example: 'Khảo sát tình huống', description: 'Nguồn cung cấp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  nguon?: string;

  @ApiPropertyOptional({ enum: ContextStatus, default: ContextStatus.unconfirmed })
  @IsOptional()
  @IsEnum(ContextStatus)
  status?: ContextStatus;

  @ApiPropertyOptional({ enum: ContextStatus, description: 'Trạng thái tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(ContextStatus)
  trangThai?: ContextStatus;

  @ApiPropertyOptional({ example: ['RULE-HD-01'], description: 'Các mã quy tắc bị ảnh hưởng' })
  @IsOptional()
  @IsArray()
  affectedRules?: string[];

  @ApiPropertyOptional({ example: ['RULE-HD-01'], description: 'Các quy tắc liên quan tiếng Việt (camelCase)' })
  @IsOptional()
  @IsArray()
  cacQuyTacLienQuan?: string[];

  @ApiPropertyOptional({ description: 'Chi tiết xung đột nếu có' })
  @IsOptional()
  @IsString()
  conflictDetails?: string;

  @ApiPropertyOptional({ description: 'Chi tiết xung đột tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  chiTietXungDot?: string;
}

export class UpdateContextFactDto {
  @ApiProperty({ example: 'Đã xuất hóa đơn từng lần', description: 'Giá trị mới cần cập nhật' })
  @IsString()
  @IsNotEmpty()
  currentValue!: string;

  @ApiPropertyOptional({ example: 'Đã xuất hóa đơn từng lần', description: 'Giá trị hiện tại tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  giaTriHienTai?: string;

  @ApiPropertyOptional({ example: 'Đối chiếu từ sao kê phần mềm POS', description: 'Ghi chú lý do thay đổi' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'Đối chiếu từ sao kê phần mềm POS', description: 'Ghi chú tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ghiChu?: string;

  @ApiPropertyOptional({ enum: ContextStatus })
  @IsOptional()
  @IsEnum(ContextStatus)
  status?: ContextStatus;

  @ApiPropertyOptional({ enum: ContextStatus, description: 'Trạng thái tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(ContextStatus)
  trangThai?: ContextStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conflictDetails?: string;

  @ApiPropertyOptional({ description: 'Chi tiết xung đột tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  chiTietXungDot?: string;
}

export class GenerateChecklistFromFactDto {
  @ApiPropertyOptional({ description: 'Tiêu đề checklist muốn tạo' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Tiêu đề tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tieuDe?: string;

  @ApiPropertyOptional({ description: 'Nhóm phân loại' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Danh mục tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  danhMuc?: string;

  @ApiPropertyOptional({ description: 'Mức độ ưu tiên' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ description: 'Độ ưu tiên tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  doUuTien?: string;

  @ApiPropertyOptional({ description: 'Căn cứ pháp lý' })
  @IsOptional()
  @IsString()
  legalBasis?: string;

  @ApiPropertyOptional({ description: 'Căn cứ pháp lý tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  canCuPhapLy?: string;

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

  @ApiPropertyOptional({ description: 'Danh sách nhiệm vụ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsArray()
  danhSachNhiemVu?: Array<{
    tieuDe?: string;
    moTa?: string;
    doUuTien?: string;
    canCuPhapLy?: string;
    soNgayHanChot?: number;
  }>;
}
