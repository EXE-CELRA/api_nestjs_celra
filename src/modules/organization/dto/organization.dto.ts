import { IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên pháp nhân công ty' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên pháp lý đầy đủ trên ĐKKD' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt', description: 'Tên viết tắt doanh nghiệp' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional({ example: '0317895621', description: 'Mã số thuế doanh nghiệp' })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH 1 thành viên', description: 'Loại hình doanh nghiệp' })
  @IsOptional()
  @IsString()
  legalType?: string;

  @ApiPropertyOptional({ example: 'Dịch vụ ăn uống', description: 'Ngành nghề hoạt động' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'TP. Hồ Chí Minh', description: 'Tỉnh / Thành phố đặt trụ sở' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Giám đốc/Người đại diện', description: 'Vai trò người đăng ký' })
  @IsOptional()
  @IsString()
  registrantRole?: string;

  @ApiPropertyOptional({ example: 'Đang hoạt động bình thường', description: 'Tình trạng hoạt động' })
  @IsOptional()
  @IsString()
  operatingStatus?: string;

  @ApiPropertyOptional({ example: 'Trực tiếp tại cơ sở và trực tuyến', description: 'Mô hình kinh doanh' })
  @IsOptional()
  @IsString()
  businessModel?: string;

  @ApiPropertyOptional({ example: '1 - 3 năm', description: 'Số năm hoạt động' })
  @IsOptional()
  @IsString()
  operatingYears?: string;

  @ApiPropertyOptional({ example: 'Đã phát sinh doanh thu', description: 'Tình trạng doanh thu' })
  @IsOptional()
  @IsString()
  revenueStatus?: string;

  @ApiPropertyOptional({ example: 5, description: 'Số lượng nhân sự hiện tại' })
  @IsOptional()
  @IsInt()
  employeeCount?: number;

  @ApiPropertyOptional({ example: '120 Nguyễn Đình Chiểu, Phường Đa Kao, Quận 1, TP.HCM', description: 'Địa điểm kinh doanh' })
  @IsOptional()
  @IsString()
  locations?: string;

  @ApiPropertyOptional({ description: 'Có bán hàng trực tuyến hay không' })
  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;

  @ApiPropertyOptional({ description: 'Địa chỉ trụ sở chính' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Người đại diện theo pháp luật' })
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiPropertyOptional({ example: 'TT133', description: 'Chế độ kế toán áp dụng' })
  @IsOptional()
  @IsString()
  accountingRegime?: string;

  @ApiPropertyOptional({ example: 'KHAU_TRU', description: 'Phương pháp tính thuế GTGT' })
  @IsOptional()
  @IsString()
  vatMethod?: string;

  @ApiPropertyOptional({ example: 'QUY', description: 'Chu kỳ kê khai & tạm nộp thuế' })
  @IsOptional()
  @IsString()
  taxCycle?: string;

  @ApiPropertyOptional({ description: 'Đã kích hoạt hóa đơn điện tử hay chưa' })
  @IsOptional()
  @IsBoolean()
  hasElectronicInvoice?: boolean;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên pháp nhân công ty' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt', description: 'Tên viết tắt doanh nghiệp' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional({ example: 8, description: 'Số lượng nhân sự hiện tại' })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeCount?: number;

  @ApiPropertyOptional({ description: 'Địa chỉ trụ sở chính' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Người đại diện theo pháp luật' })
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiPropertyOptional({ description: 'Có bán hàng trực tuyến hay không' })
  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;
}
