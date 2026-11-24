import { IsEmail, IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export const ALLOWED_MEMBER_ROLES: UserRole[] = [
  UserRole.owner,
  UserRole.hr_staff,
  UserRole.internal_accountant,
  UserRole.service_accountant,
  UserRole.expert,
];

export class InviteMemberDto {
  @ApiProperty({ example: 'tranthulan@bepviet.vn', description: 'Email của thành viên' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Trần Thu Lan', description: 'Họ và tên thành viên' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: ALLOWED_MEMBER_ROLES, example: UserRole.hr_staff, description: 'Vai trò trong doanh nghiệp (không cho phép gán admin toàn hệ thống)' })
  @IsIn(ALLOWED_MEMBER_ROLES, { message: 'Không được phép gán vai trò Quản trị hệ thống' })
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
  @ApiPropertyOptional({ enum: ALLOWED_MEMBER_ROLES })
  @IsOptional()
  @IsIn(ALLOWED_MEMBER_ROLES, { message: 'Không được phép gán vai trò Quản trị hệ thống' })
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
