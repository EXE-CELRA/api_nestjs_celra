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

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  matKhau?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu bí danh' })
  @IsOptional()
  @IsString()
  passwordHash?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', description: 'Họ và tên tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  hoVaTen?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', description: 'Họ và tên bí danh' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.owner, description: 'Vai trò ban đầu' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserRole, description: 'Vai trò tiếng Việt (camelCase)' })
  @IsOptional()
  @IsEnum(UserRole)
  vaiTro?: UserRole;

  @ApiPropertyOptional({ example: 'Chủ doanh nghiệp', description: 'Chức danh' })
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional({ example: 'Chủ doanh nghiệp', description: 'Chức danh tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  chucDanh?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  soDienThoai?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại bí danh' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
  
  @ApiPropertyOptional({ example: '123456', description: 'Mã xác thực OTP 6 số' })
  @IsOptional()
  @IsString()
  otp?: string;
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

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  matKhau?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu bí danh' })
  @IsOptional()
  @IsString()
  passwordHash?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu hiện tại' })
  @IsOptional()
  @IsString()
  oldPassword?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Mật khẩu cũ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  matKhauCu?: string;

  @ApiPropertyOptional({ example: 'newpassword123', description: 'Mật khẩu mới' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới tối thiểu 6 ký tự' })
  newPassword?: string;

  @ApiPropertyOptional({ example: 'newpassword123', description: 'Mật khẩu mới tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới tối thiểu 6 ký tự' })
  matKhauMoi?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Trung Hậu', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Trung Hậu', description: 'Họ và tên tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  hoVaTen?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  soDienThoai?: string;

  @ApiPropertyOptional({ example: 'hauntce190069@gmail.com', description: 'Email' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;
}
export class SendOtpDto {
  @ApiProperty({ example: 'ceo@gmail.com', description: 'Email nhận mã OTP' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;
  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Họ và tên người nhận' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class ForgotPasswordSendOtpDto {
  @ApiProperty({ example: 'ceo@gmail.com', description: 'Email tài khoản cần khôi phục mật khẩu' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'ceo@gmail.com', description: 'Email tài khoản' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã xác thực OTP 6 số' })
  @IsString({ message: 'Mã OTP phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  otp!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'ceo@gmail.com', description: 'Email tài khoản' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã xác thực OTP 6 số' })
  @IsString({ message: 'Mã OTP phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  otp!: string;

  @ApiProperty({ example: 'Password123!@#', description: 'Mật khẩu mới' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu mới tối thiểu 6 ký tự' })
  newPassword!: string;

  @ApiPropertyOptional({ example: 'Password123!@#', description: 'Mật khẩu mới tiếng Việt' })
  @IsOptional()
  @IsString()
  matKhauMoi?: string;
}
