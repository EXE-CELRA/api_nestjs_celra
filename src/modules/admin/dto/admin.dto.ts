import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum EnterpriseStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateEnterpriseStatusDto {
  @ApiProperty({ enum: EnterpriseStatus, example: EnterpriseStatus.ACTIVE })
  @IsEnum(EnterpriseStatus)
  status: EnterpriseStatus;
}

export class AdjustCreditDto {
  @ApiProperty({ example: 'org-uuid-here', description: 'ID Doanh nghiệp nhận Credit bù' })
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty({ example: 50, description: 'Số Credit cần cộng hoặc điều chỉnh' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Đền bù sự cố mạng ngày 19/10/2026', description: 'Lý do can thiệp' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'Cộng Credit Đền Bù Từ Admin' })
  @IsString()
  @IsOptional()
  taskName?: string;
}

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ example: 'MB' })
  @IsString()
  @IsOptional()
  bankId?: string;

  @ApiPropertyOptional({ example: '0987654321' })
  @IsString()
  @IsOptional()
  accountNo?: string;

  @ApiPropertyOptional({ example: 'CONG TY CP CONG NGHE CELRA VIET NAM' })
  @IsString()
  @IsOptional()
  accountName?: string;

  @ApiPropertyOptional({ example: 2000, description: '1 Credit = 2.000 VND' })
  @IsNumber()
  @IsOptional()
  creditRate?: number;

  @ApiPropertyOptional({ example: 25, description: '25 Credit / lần rà soát' })
  @IsNumber()
  @IsOptional()
  auditCost?: number;

  @ApiPropertyOptional({ example: 100, description: 'Hạn mức Credit tặng ban đầu' })
  @IsNumber()
  @IsOptional()
  freeTierCredits?: number;
}

export class UpdatePackageDto {
  @ApiProperty({ example: 'standard' })
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @ApiProperty({ example: 'Gói Tiêu Chuẩn' })
  @IsString()
  name: string;

  @ApiProperty({ example: 200000 })
  @IsNumber()
  priceVnd: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  credits: number;

  @ApiPropertyOptional({ example: 20 })
  @IsNumber()
  @IsOptional()
  bonusCredits?: number;

  @ApiPropertyOptional({ example: 'Phổ biến nhất' })
  @IsString()
  @IsOptional()
  badge?: string;
}
