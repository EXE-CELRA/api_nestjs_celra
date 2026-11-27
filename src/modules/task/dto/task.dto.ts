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
  @ApiPropertyOptional({ example: 'TASK-HD-01' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Chuẩn hóa hóa đơn điện tử máy tính tiền' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Hóa đơn & Doanh thu' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.need_info })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'Trần Thu Lan' })
  @IsOptional()
  @IsString()
  assigneeName?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.owner })
  @IsOptional()
  @IsEnum(UserRole)
  assigneeRole?: UserRole;

  @ApiPropertyOptional({ enum: WaitingOnRole, default: WaitingOnRole.none })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiPropertyOptional({ example: '2026-10-25T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Rà soát và thiết lập mẫu hóa đơn máy tính tiền chuẩn' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalBasis?: string;
}

export class UpdateTaskStatusDto {
  @ApiPropertyOptional({ enum: TaskStatus, example: TaskStatus.waiting_verification })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: WaitingOnRole, example: WaitingOnRole.service_accountant })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional({ example: 'Lê Thu Hà (Kế toán dịch vụ)' })
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiPropertyOptional({ example: 'Chủ DN đã tải lên mẫu hóa đơn, chuyển Kế toán dịch vụ thẩm định' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AddTaskCommentDto {
  @ApiPropertyOptional({ example: 'Đã bổ sung phụ lục hợp đồng lao động có điều khoản BHXH' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: false, description: 'Chỉ hiển thị nội bộ' })
  @IsOptional()
  @IsBoolean()
  isInternalOnly?: boolean;
}

export class SelfCertifyTaskDto {
  @ApiPropertyOptional({ example: 'Doanh nghiệp cam kết tự chịu trách nhiệm theo biên bản cam kết' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateCalendarNoteDto {
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Ngày của ghi chú (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Nộp báo cáo thuế GTGT Quý 3' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Kiểm tra kỹ hóa đơn đầu vào trước 17h' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'tax', enum: ['general', 'tax', 'labor', 'legal', 'reminder'] })
  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateCalendarNoteDto {
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Nộp báo cáo thuế GTGT Quý 3' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Đã hoàn thành kiểm tra và nộp' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'tax' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class UpdateTaskPriorityDto {
  @ApiProperty({ example: 'high', description: 'Mức độ ưu tiên vận hành (urgent, high, medium, low)' })
  @IsNotEmpty()
  @IsString()
  priority!: string;

  @ApiPropertyOptional({ example: 'Ưu tiên xử lý trước hạn', description: 'Lý do thay đổi mức ưu tiên vận hành' })
  @IsOptional()
  @IsString()
  reason?: string;
}

