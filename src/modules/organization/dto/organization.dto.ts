import { IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';

export class CreateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @IsString()
  legalType?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  registrantRole?: string;

  @IsOptional()
  @IsString()
  operatingStatus?: string;

  @IsOptional()
  @IsString()
  businessModel?: string;

  @IsOptional()
  @IsString()
  operatingYears?: string;

  @IsOptional()
  @IsString()
  revenueStatus?: string;

  @IsOptional()
  @IsInt()
  employeeCount?: number;

  @IsOptional()
  @IsString()
  locations?: string;

  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  representativeName?: string;

  @IsOptional()
  @IsString()
  accountingRegime?: string;

  @IsOptional()
  @IsString()
  vatMethod?: string;

  @IsOptional()
  @IsString()
  taxCycle?: string;

  @IsOptional()
  @IsBoolean()
  hasElectronicInvoice?: boolean;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  employeeCount?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  representativeName?: string;

  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;
}
