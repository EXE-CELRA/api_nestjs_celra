import { IsNotEmpty, IsIn, IsOptional, IsString, IsBoolean } from 'class-validator';
import type { SubscriptionPlanCode } from '../../../common/constants/subscription-plans.constant';

export class SubscribePlanDto {
  @IsNotEmpty()
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  planCode!: SubscriptionPlanCode;

  @IsOptional()
  @IsString()
  paymentMethod?: 'VietQR' | 'Sandbox' | 'BankTransfer' = 'VietQR';

  @IsOptional()
  @IsString()
  note?: string;
}

export class ToggleAutoRenewDto {
  @IsNotEmpty()
  @IsBoolean()
  autoRenew!: boolean;
}
