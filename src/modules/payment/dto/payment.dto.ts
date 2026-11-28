import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class GenerateVietQrDto {
  @IsNumber()
  @Min(10000)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SepayWebhookDto {
  @IsNumber()
  id!: number;

  @IsString()
  gateway!: string;

  @IsString()
  transactionDate!: string;

  @IsString()
  accountNumber!: string;

  @IsString()
  code!: string;

  @IsString()
  content!: string;

  @IsString()
  transferType!: string;

  @IsNumber()
  transferAmount!: number;

  @IsNumber()
  accumulated!: number;

  @IsOptional()
  @IsString()
  referenceCode?: string;
}
