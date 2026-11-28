import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class DepositDto {
  @IsNumber()
  @Min(10000, { message: 'Số tiền nạp tối thiểu là 10.000đ' })
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class GenerateVietQrDto {
  @IsNumber()
  @Min(10000)
  amount!: number;
}

export class BuyPackageDto {
  @IsNotEmpty()
  @IsString()
  packageId!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class SandboxPaymentDto {
  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsString()
  orderCode?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsNotEmpty()
  @IsString()
  outcome!: 'SUCCESS' | 'FAILED';

  @IsOptional()
  @IsString()
  failureReason?: string;

  @IsOptional()
  @IsString()
  bankName?: string;
}
