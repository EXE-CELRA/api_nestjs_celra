import { IsNotEmpty, IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên pháp nhân công ty' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiProperty({ example: '0317895621', description: 'Mã số thuế doanh nghiệp' })
  @IsString()
  @IsNotEmpty({ message: 'Mã số thuế không được để trống' })
  taxCode!: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH 1 thành viên', description: 'Loại hình doanh nghiệp' })
  @IsOptional()
  @IsString()
  legalType?: string;

  @ApiPropertyOptional({ example: 'Dịch vụ ăn uống', description: 'Ngành nghề hoạt động' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'TP. Hồ Chí Minh' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Giám đốc/Người đại diện' })
  @IsOptional()
  @IsString()
  registrantRole?: string;

  @ApiPropertyOptional({ example: 'Đang hoạt động bình thường' })
  @IsOptional()
  @IsString()
  operatingStatus?: string;

  @ApiPropertyOptional({ example: 'Trực tiếp tại cơ sở và trực tuyến' })
  @IsOptional()
  @IsString()
  businessModel?: string;

  @ApiPropertyOptional({ example: '1 - 3 năm' })
  @IsOptional()
  @IsString()
  operatingYears?: string;

  @ApiPropertyOptional({ example: 'Đã phát sinh doanh thu' })
  @IsOptional()
  @IsString()
  revenueStatus?: string;

  @ApiPropertyOptional({ example: 5, description: 'Số lượng nhân sự hiện tại' })
  @IsOptional()
  @IsInt()
  employeeCount?: number;

  @ApiPropertyOptional({ example: '120 Nguyễn Đình Chiểu, Phường Đa Kao, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  locations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeName?: string;

  // Step 2 checklist context attributes
  @ApiPropertyOptional({ example: 'TT133' })
  @IsOptional()
  @IsString()
  accountingRegime?: string;

  @ApiPropertyOptional({ example: 'KHAU_TRU' })
  @IsOptional()
  @IsString()
  vatMethod?: string;

  @ApiPropertyOptional({ example: 'QUY' })
  @IsOptional()
  @IsString()
  taxCycle?: string;

  @ApiPropertyOptional({ example: 'DA_DONG_DU' })
  @IsOptional()
  @IsString()
  hasLaborContractAndInsurance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasElectronicInvoice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasFireSafetyCert?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasSectoralPermit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasTrademarkRegistered?: boolean;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;
}
