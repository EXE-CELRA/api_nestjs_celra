import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'nguyenminhanh@bepviet.vn', description: 'Email người dùng' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiProperty({ example: '12345678', description: 'Mật khẩu tối thiểu 6 ký tự' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password!: string;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  name?: string;

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

  @ApiProperty({ example: '12345678', description: 'Mật khẩu' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: '12345678', description: 'Mật khẩu hiện tại' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu cũ không được để trống' })
  oldPassword!: string;

  @ApiProperty({ example: 'newpassword123', description: 'Mật khẩu mới' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới tối thiểu 6 ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  newPassword!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Trung Hậu', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'hauntce190069@gmail.com', description: 'Email' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional({ description: 'Ảnh đại diện (URL hoặc Base64)' })
  @IsOptional()
  @IsString()
  avatar?: string;
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
