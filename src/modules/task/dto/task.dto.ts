import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { UserRole, WaitingOnRole, TaskStatus, Priority } from '@prisma/client';

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  assigneeName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  assigneeRole?: UserRole;

  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ruleCode?: string;

  @IsOptional()
  @IsString()
  legalBasis?: string;
}

export class UpdateTaskStatusDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(WaitingOnRole)
  waitingOnRole?: WaitingOnRole;

  @IsOptional()
  @IsString()
  waitingOnName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddTaskCommentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isInternalOnly?: boolean;
}

export class SelfCertifyTaskDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateCalendarNoteDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateCalendarNoteDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class UpdateTaskPriorityDto {
  @IsNotEmpty()
  @IsString()
  priority!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
