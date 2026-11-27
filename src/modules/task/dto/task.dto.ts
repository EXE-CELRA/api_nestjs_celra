import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, WaitingOnRole, TaskStatus, Priority } from '@prisma/client';

export class CreateTaskDto {
  @ApiPropertyOptional({ example: 'TASK-TNDN-80', description: 'Mã tác vụ tuân thủ' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Tạm nộp thuế TNDN Quý 4 đạt ngưỡng tối thiểu 80%', description: 'Tiêu đề tác vụ' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Thuế TNDN', description: 'Danh mục phân loại' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium, description: 'Mức độ ưu tiên' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.need_info, description: 'Trạng thái tác vụ' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'ID phòng ban phụ trách' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'ID nhân sự thực hiện' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'Trần Thu Lan', description: 'Tên nhân sự thực hiện' })
  @IsOptional()
  @IsString()
  assigneeName?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.owner, description: 'Vai trò người thực hiện' })
  @IsOptional()
  @IsEnum(UserRole)
  assigneeRole?: UserRole;

  @ApiPropertyOptional({ enum: WaitingOnRole, default: WaitingOnRole.none, description: 'Vai trò đang chờ phối hợp' })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional({ description: 'Tên người đang chờ đối soát' })
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiPropertyOptional({ example: '2027-01-31T00:00:00.000Z', description: 'Hạn chót hoàn thành (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Rà soát sổ thu chi và lập giấy nộp tiền tạm nộp thuế TNDN tiểu mục 1052', description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'RULE-TAX-TNDN-80', description: 'Mã quy tắc pháp lý liên kết' })
  @IsOptional()
  @IsString()
  ruleCode?: string;

  @ApiPropertyOptional({ description: 'Căn cứ pháp lý áp dụng' })
  @IsOptional()
  @IsString()
  legalBasis?: string;
}

export class UpdateTaskStatusDto {
  @ApiPropertyOptional({ enum: TaskStatus, example: TaskStatus.waiting_verification, description: 'Trạng thái mới của tác vụ' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: WaitingOnRole, example: WaitingOnRole.service_accountant, description: 'Vai trò chờ phối hợp' })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional({ example: 'Lê Thu Hà (Kế toán dịch vụ)', description: 'Tên người chờ phối hợp' })
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiPropertyOptional({ example: 'Chủ DN đã tải lên Giấy nộp tiền NSNN, chuyển Kế toán đối soát', description: 'Ghi chú cập nhật' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AddTaskCommentDto {
  @ApiPropertyOptional({ example: 'Đã bổ sung Ủy nhiệm chi ngân hàng và hóa đơn điện tử hợp lệ cho khoản chi Quý 4', description: 'Nội dung bình luận' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: false, description: 'Chỉ hiển thị nội bộ' })
  @IsOptional()
  @IsBoolean()
  isInternalOnly?: boolean;
}

export class SelfCertifyTaskDto {
  @ApiPropertyOptional({ example: 'Doanh nghiệp cam kết tự lưu trữ bản gốc chứng từ tại trụ sở', description: 'Lý do tự xác nhận' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateCalendarNoteDto {
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Ngày của ghi chú (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Chốt sổ chi phí Mục B4 Quý 3', description: 'Tiêu đề ghi chú' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Kiểm tra kỹ chứng từ chuyển khoản các hóa đơn từ 5 triệu đồng trở lên', description: 'Nội dung chi tiết' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'tax', enum: ['general', 'tax', 'b4_expense', 'legal', 'reminder'], description: 'Nhóm ghi chú lịch' })
  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateCalendarNoteDto {
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Ngày của ghi chú (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Chốt sổ chi phí Mục B4 Quý 3', description: 'Tiêu đề ghi chú' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Đã hoàn thành đối soát toàn bộ ủy nhiệm chi', description: 'Nội dung chi tiết' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'tax', description: 'Nhóm ghi chú lịch' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: true, description: 'Trạng thái đã hoàn thành' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class UpdateTaskPriorityDto {
  @ApiProperty({ example: 'high', description: 'Mức độ ưu tiên vận hành (urgent, high, medium, low)' })
  @IsNotEmpty()
  @IsString()
  priority!: string;

  @ApiPropertyOptional({ example: 'Ưu tiên xử lý trước hạn nộp thuế quý', description: 'Lý do thay đổi mức ưu tiên vận hành' })
  @IsOptional()
  @IsString()
  reason?: string;
}
