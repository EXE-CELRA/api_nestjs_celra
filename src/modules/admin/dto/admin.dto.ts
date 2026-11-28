import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum EnterpriseStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateEnterpriseStatusDto {
  @IsEnum(EnterpriseStatus)
  status: EnterpriseStatus;
}

export class AdjustCreditDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  taskName?: string;
}

export class UpdatePlatformSettingsDto {
  @IsString()
  @IsOptional()
  bankId?: string;

  @IsString()
  @IsOptional()
  accountNo?: string;

  @IsString()
  @IsOptional()
  accountName?: string;

  @IsNumber()
  @IsOptional()
  creditRate?: number;

  @IsNumber()
  @IsOptional()
  auditCost?: number;

  @IsNumber()
  @IsOptional()
  freeTierCredits?: number;
}

export class UpdatePackageDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsString()
  name: string;

  @IsNumber()
  priceVnd: number;

  @IsNumber()
  credits: number;

  @IsNumber()
  @IsOptional()
  bonusCredits?: number;

  @IsString()
  @IsOptional()
  badge?: string;
}

export enum AIProviderType {
  GEMINI = 'GEMINI',
  OPENCODE = 'OPENCODE',
  CUSTOM = 'CUSTOM',
}

export class TestAIKeyDto {
  @IsEnum(AIProviderType)
  provider: AIProviderType;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  apiUrl?: string;
}

export class UpdateAIConfigDto {
  @IsEnum(AIProviderType)
  provider: AIProviderType;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  apiUrl?: string;

  @IsString()
  @IsNotEmpty()
  model: string;
}

export class SyncDLPLCategoryDto {
  @IsOptional()
  categories?: string[];
}

export class UpdateDLPLConfigDto {
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @IsString()
  @IsOptional()
  apiUrl?: string;
}
