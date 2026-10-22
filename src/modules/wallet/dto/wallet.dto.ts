import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ example: 500000, description: 'Số tiền nạp vào ví (VND)' })
  @IsNumber()
  @Min(10000, { message: 'Số tiền nạp tối thiểu là 10.000đ' })
  amount!: number;

  @ApiPropertyOptional({ example: 500000, description: 'Số tiền nạp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsNumber()
  @Min(10000, { message: 'Số tiền nạp tối thiểu là 10.000đ' })
  soTien?: number;

  @ApiPropertyOptional({ example: 'Nạp tiền thanh toán dịch vụ thẩm định ATTP' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'Nạp tiền thanh toán dịch vụ thẩm định ATTP', description: 'Ghi chú tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ghiChu?: string;
}

export class GenerateVietQrDto {
  @ApiProperty({ example: 500000, description: 'Số tiền cần nạp' })
  @IsNumber()
  @Min(10000)
  amount!: number;

  @ApiPropertyOptional({ example: 500000, description: 'Số tiền cần nạp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsNumber()
  @Min(10000)
  soTien?: number;
}

export class BuyPackageDto {
  @ApiProperty({ example: 'PKG_120', description: 'Mã gói Credit muốn mua (PKG_50, PKG_120, PKG_450)' })
  @IsNotEmpty()
  @IsString()
  packageId!: string;

  @ApiPropertyOptional({ example: 'PKG_120', description: 'Mã gói tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maGoi?: string;

  @ApiPropertyOptional({ example: 'Nạp gói 120 Credit qua VietQR' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'Nạp gói 120 Credit qua VietQR', description: 'Ghi chú tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ghiChu?: string;
}

export class SandboxPaymentDto {
  @ApiPropertyOptional({ example: 'c2388fc9-b684-48cb-bce6-3b95d9a26569', description: 'ID tổ chức doanh nghiệp' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ description: 'Mã doanh nghiệp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maDoanhNghiep?: string;

  @ApiPropertyOptional({ example: 'CELRA-SBX-12345', description: 'Mã đơn hàng theo dõi' })
  @IsOptional()
  @IsString()
  orderCode?: string;

  @ApiPropertyOptional({ description: 'Mã đơn hàng tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maDonHang?: string;

  @ApiPropertyOptional({ example: 'PKG_120', description: 'Mã gói Credit' })
  @IsOptional()
  @IsString()
  packageId?: string;

  @ApiPropertyOptional({ description: 'Mã gói tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maGoi?: string;

  @ApiPropertyOptional({ example: 200000, description: 'Số tiền nạp VND (nếu không chọn gói)' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Số tiền nạp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsNumber()
  soTien?: number;

  @ApiProperty({ example: 'SUCCESS', enum: ['SUCCESS', 'FAILED'], description: 'Kết quả kịch bản thanh toán sandbox' })
  @IsNotEmpty()
  @IsString()
  outcome!: 'SUCCESS' | 'FAILED';

  @ApiPropertyOptional({ example: 'SUCCESS', enum: ['SUCCESS', 'FAILED'], description: 'Kết quả tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  ketQua?: 'SUCCESS' | 'FAILED';

  @ApiPropertyOptional({ example: 'Tài khoản không đủ số dư', description: 'Lý do thất bại nếu outcome=FAILED' })
  @IsOptional()
  @IsString()
  failureReason?: string;

  @ApiPropertyOptional({ description: 'Lý do thất bại tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  lyDoThatBai?: string;

  @ApiPropertyOptional({ example: 'MBBank - 0987654321', description: 'Tên ngân hàng ảo' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Tên ngân hàng tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenNganHang?: string;
}
