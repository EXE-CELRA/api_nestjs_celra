import { IsNotEmpty, IsIn, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SubscriptionPlanCode } from '../../../common/constants/subscription-plans.constant';

export class SubscribePlanDto {
  @ApiProperty({ example: 'PROFESSIONAL', enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] })
  @IsNotEmpty()
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  planCode!: SubscriptionPlanCode;

  @ApiPropertyOptional({ example: 'VietQR', enum: ['VietQR', 'Sandbox', 'BankTransfer'] })
  @IsOptional()
  @IsString()
  paymentMethod?: 'VietQR' | 'Sandbox' | 'BankTransfer' = 'VietQR';

  @ApiPropertyOptional({ example: 'Gia hạn gói Professional 30 ngày' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ToggleAutoRenewDto {
  @ApiProperty({ example: true })
  @IsNotEmpty()
  @IsBoolean()
  autoRenew!: boolean;
}
