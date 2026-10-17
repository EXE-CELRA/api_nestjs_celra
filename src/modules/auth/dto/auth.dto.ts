import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'nguyenminhanh@bepviet.vn', description: 'Email người dùng' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu tối thiểu 6 ký tự' })
  @IsOptional()
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu bí danh' })
  @IsOptional()
  @IsString()
  passwordHash?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', description: 'Họ và tên bí danh' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.owner, description: 'Vai trò ban đầu' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'Chủ doanh nghiệp', description: 'Chức danh' })
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại bí danh' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'nguyenminhanh@bepviet.vn', description: 'Email' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu bí danh' })
  @IsOptional()
  @IsString()
  passwordHash?: string;

  @ApiPropertyOptional({ example: '123456', description: 'Mã 2FA OTP nếu đã kích hoạt' })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '123456', description: 'Mã OTP 6 chữ số' })
  @IsString()
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  code!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: '12345678', description: 'Mật khẩu hiện tại' })
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @ApiProperty({ example: 'newpassword123', description: 'Mật khẩu mới' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới tối thiểu 6 ký tự' })
  newPassword!: string;
}
