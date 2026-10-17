import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ example: 500000, description: 'Số tiền nạp vào ví (VND)' })
  @IsNumber()
  @Min(10000, { message: 'Số tiền nạp tối thiểu là 10.000đ' })
  amount!: number;

  @ApiPropertyOptional({ example: 'Nạp tiền thanh toán dịch vụ thẩm định ATTP' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class GenerateVietQrDto {
  @ApiProperty({ example: 500000, description: 'Số tiền cần nạp' })
  @IsNumber()
  @Min(10000)
  amount!: number;
}

export class BuyPackageDto {
  @ApiProperty({ example: 'PKG_120', description: 'Mã gói Credit muốn mua (PKG_50, PKG_120, PKG_450)' })
  @IsNotEmpty()
  @IsString()
  packageId!: string;

  @ApiPropertyOptional({ example: 'Nạp gói 120 Credit qua VietQR' })
  @IsOptional()
  @IsString()
  note?: string;
}
