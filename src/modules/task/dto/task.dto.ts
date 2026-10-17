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
  @ApiProperty({ example: 'TASK-HD-01' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Chuẩn hóa hóa đơn điện tử máy tính tiền' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Hóa đơn & Doanh thu' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiProperty({ example: 'Trần Thu Lan' })
  @IsString()
  @IsNotEmpty()
  assigneeName!: string;

  @ApiProperty({ enum: UserRole, default: UserRole.owner })
  @IsEnum(UserRole)
  assigneeRole!: UserRole;

  @ApiPropertyOptional({ enum: WaitingOnRole, default: WaitingOnRole.none })
  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @ApiProperty({ example: '2026-10-25T00:00:00.000Z' })
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ example: 'Rà soát và thiết lập mẫu hóa đơn máy tính tiền chuẩn' })
  @IsString()
  @IsNotEmpty()
  description!: string;

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
  @ApiProperty({ enum: TaskStatus, example: TaskStatus.waiting_verification })
  @IsEnum(TaskStatus)
  @IsNotEmpty()
  status!: TaskStatus;

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
  @ApiProperty({ example: 'Đã bổ sung phụ lục hợp đồng lao động có điều khoản BHXH' })
  @IsString()
  @IsNotEmpty()
  content!: string;

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
