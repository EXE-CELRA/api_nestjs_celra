import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, WaitingOnRole, TaskStatus, Priority } from '@prisma/client';

export class CreateTaskDto {
  @ApiPropertyOptional({ example: 'TASK-HD-01' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'TASK-HD-01', description: 'Mã nhiệm vụ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maNhiemVu?: string;

  @ApiPropertyOptional({ example: 'Chuẩn hóa hóa đơn điện tử máy tính tiền' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Chuẩn hóa hóa đơn điện tử máy tính tiền', description: 'Tiêu đề tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tieuDe?: string;

  @ApiPropertyOptional({ example: 'Hóa đơn & Doanh thu' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Hóa đơn & Doanh thu', description: 'Danh mục tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  danhMuc?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ enum: Priority, description: 'Độ ưu tiên tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(Priority)
  doUuTien?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Mã phòng ban tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maPhongBan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Mã người xử lý tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maNguoiXuLy?: string;

  @ApiPropertyOptional({ example: 'Trần Thu Lan' })
  @IsOptional()
  @IsString()
  assigneeName?: string;

  @ApiPropertyOptional({ example: 'Trần Thu Lan', description: 'Tên người xử lý tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenNguoiXuLy?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.owner })
  @IsOptional()
  @IsEnum(UserRole)
  assigneeRole?: UserRole;

  @ApiPropertyOptional({ enum: UserRole, description: 'Vai trò người xử lý tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(UserRole)
  vaiTroNguoiXuLy?: UserRole;

  @ApiPropertyOptional({ enum: WaitingOnRole, default: WaitingOnRole.none })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional({ enum: WaitingOnRole, description: 'Vai trò chờ đợi tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  vaiTroChoDoi?: WaitingOnRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiPropertyOptional({ description: 'Tên người chờ đợi tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenNguoiChoDoi?: string;

  @ApiPropertyOptional({ example: '2026-10-25T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: '2026-10-25T00:00:00.000Z', description: 'Hạn chót tiếng Việt (camelCase)' })
  @IsOptional()
  @IsDateString()
  hanChot?: string;

  @ApiPropertyOptional({ example: 'Rà soát và thiết lập mẫu hóa đơn máy tính tiền chuẩn' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Rà soát và thiết lập mẫu hóa đơn máy tính tiền chuẩn', description: 'Mô tả tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  moTa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleCode?: string;

  @ApiPropertyOptional({ description: 'Mã quy tắc tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maQuyTac?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalBasis?: string;

  @ApiPropertyOptional({ description: 'Căn cứ pháp lý tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  canCuPhapLy?: string;
}

export class UpdateTaskStatusDto {
  @ApiPropertyOptional({ enum: TaskStatus, example: TaskStatus.waiting_verification })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskStatus, description: 'Trạng thái tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(TaskStatus)
  trangThai?: TaskStatus;

  @ApiPropertyOptional({ enum: WaitingOnRole, example: WaitingOnRole.service_accountant })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional({ enum: WaitingOnRole, description: 'Vai trò chờ đợi tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  vaiTroChoDoi?: WaitingOnRole;

  @ApiPropertyOptional({ example: 'Lê Thu Hà (Kế toán dịch vụ)' })
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiPropertyOptional({ example: 'Lê Thu Hà (Kế toán dịch vụ)', description: 'Tên người chờ đợi tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenNguoiChoDoi?: string;

  @ApiPropertyOptional({ example: 'Chủ DN đã tải lên mẫu hóa đơn, chuyển Kế toán dịch vụ thẩm định' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'Chủ DN đã tải lên mẫu hóa đơn, chuyển Kế toán dịch vụ thẩm định', description: 'Ghi chú tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ghiChu?: string;
}

export class AddTaskCommentDto {
  @ApiPropertyOptional({ example: 'Đã bổ sung phụ lục hợp đồng lao động có điều khoản BHXH' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'Đã bổ sung phụ lục hợp đồng lao động có điều khoản BHXH', description: 'Nội dung tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  noiDung?: string;

  @ApiPropertyOptional({ example: false, description: 'Chỉ hiển thị nội bộ' })
  @IsOptional()
  @IsBoolean()
  isInternalOnly?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Chỉ nội bộ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  chiNoiBo?: boolean;
}

export class SelfCertifyTaskDto {
  @ApiPropertyOptional({ example: 'Doanh nghiệp cam kết tự chịu trách nhiệm theo biên bản cam kết' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: 'Doanh nghiệp cam kết tự chịu trách nhiệm theo biên bản cam kết', description: 'Lý do tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  lyDo?: string;
}

export class CreateCalendarNoteDto {
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Ngày của ghi chú (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Ngày tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ngay?: string;

  @ApiPropertyOptional({ example: 'Nộp báo cáo thuế GTGT Quý 3' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Nộp báo cáo thuế GTGT Quý 3', description: 'Tiêu đề tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tieuDe?: string;

  @ApiPropertyOptional({ example: 'Kiểm tra kỹ hóa đơn đầu vào trước 17h' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'Kiểm tra kỹ hóa đơn đầu vào trước 17h', description: 'Nội dung tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  noiDung?: string;

  @ApiPropertyOptional({ example: 'tax', enum: ['general', 'tax', 'labor', 'legal', 'reminder'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'tax', description: 'Danh mục tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  danhMuc?: string;
}

export class UpdateCalendarNoteDto {
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Ngày tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ngay?: string;

  @ApiPropertyOptional({ example: 'Nộp báo cáo thuế GTGT Quý 3' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Nộp báo cáo thuế GTGT Quý 3', description: 'Tiêu đề tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tieuDe?: string;

  @ApiPropertyOptional({ example: 'Đã hoàn thành kiểm tra và nộp' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'Đã hoàn thành kiểm tra và nộp', description: 'Nội dung tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  noiDung?: string;

  @ApiPropertyOptional({ example: 'tax' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'tax', description: 'Danh mục tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  danhMuc?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Đã hoàn thành tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  daHoanThanh?: boolean;
}
