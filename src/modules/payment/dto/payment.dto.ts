import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateVietQrDto {
  @ApiProperty({ example: 500000, description: 'Số tiền cần nạp vào ví (VND)' })
  @IsNumber()
  @Min(10000)
  amount!: number;

  @ApiPropertyOptional({ example: 'CELRA NAP PKG_50', description: 'Ghi chú / nội dung nạp tiền' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'PKG_50', description: 'Mã gói nạp (nếu có)' })
  @IsOptional()
  @IsString()
  packageId?: string;

  @ApiPropertyOptional({ example: 'CELRA NAP PKG_50', description: 'Mô tả nạp tiền' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class SepayWebhookDto {
  @ApiProperty({ example: 123456 })
  @IsNumber()
  id!: number;

  @ApiProperty({ example: 'MBBank' })
  @IsString()
  gateway!: string;

  @ApiProperty({ example: '2026-10-10 21:00:00' })
  @IsString()
  transactionDate!: string;

  @ApiProperty({ example: '0987654321' })
  @IsString()
  accountNumber!: string;

  @ApiProperty({ example: 'CELRA 8f3d1234' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'CELRA 8f3d1234 nap tien vi' })
  @IsString()
  content!: string;

  @ApiProperty({ example: 'in' })
  @IsString()
  transferType!: string;

  @ApiProperty({ example: 500000 })
  @IsNumber()
  transferAmount!: number;

  @ApiProperty({ example: 1000000 })
  @IsNumber()
  accumulated!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceCode?: string;
}
