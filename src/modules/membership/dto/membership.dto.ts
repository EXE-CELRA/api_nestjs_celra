import { IsEmail, IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class InviteMemberDto {
  @ApiProperty({ example: 'tranthulan@bepviet.vn', description: 'Email của thành viên' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Trần Thu Lan', description: 'Họ và tên thành viên' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.hr_staff, description: 'Vai trò trong hệ thống' })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role!: UserRole;

  @ApiPropertyOptional({ example: 'Nhân viên Nhân sự' })
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional({ description: 'ID phòng ban được phân công' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;
}
