import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateAuditLogDto {
  @ApiProperty({ example: 'Cập nhật trạng thái tác vụ' })
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiProperty({ example: 'Task' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiProperty({ example: 'task-uuid-12345' })
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiPropertyOptional({ example: 'need_info' })
  @IsOptional()
  @IsString()
  previousValue?: string;

  @ApiPropertyOptional({ example: 'waiting_verification' })
  @IsOptional()
  @IsString()
  newValue?: string;

  @ApiPropertyOptional({ example: 'Đã tải lên bằng chứng' })
  @IsOptional()
  @IsString()
  details?: string;
}
