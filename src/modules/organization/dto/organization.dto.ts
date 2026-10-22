import { IsNotEmpty, IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên pháp nhân công ty' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên doanh nghiệp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenDoanhNghiep?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt', description: 'Tên viết tắt tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenVietTat?: string;

  @ApiPropertyOptional({ example: '0317895621', description: 'Mã số thuế doanh nghiệp' })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional({ example: '0317895621', description: 'Mã số thuế tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  maSoThue?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH 1 thành viên', description: 'Loại hình doanh nghiệp' })
  @IsOptional()
  @IsString()
  legalType?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH 1 thành viên', description: 'Loại hình pháp lý tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  loaiHinhPhapLy?: string;

  @ApiPropertyOptional({ example: 'Dịch vụ ăn uống', description: 'Ngành nghề hoạt động' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Dịch vụ ăn uống', description: 'Ngành nghề tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  nganhNghe?: string;

  @ApiPropertyOptional({ example: 'TP. Hồ Chí Minh' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'TP. Hồ Chí Minh', description: 'Thành phố tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  thanhPho?: string;

  @ApiPropertyOptional({ example: 'Giám đốc/Người đại diện' })
  @IsOptional()
  @IsString()
  registrantRole?: string;

  @ApiPropertyOptional({ example: 'Giám đốc/Người đại diện', description: 'Vai trò người đăng ký tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  vaiTroDangKy?: string;

  @ApiPropertyOptional({ example: 'Đang hoạt động bình thường' })
  @IsOptional()
  @IsString()
  operatingStatus?: string;

  @ApiPropertyOptional({ example: 'Đang hoạt động bình thường', description: 'Tình trạng hoạt động tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tinhTrangHoatDong?: string;

  @ApiPropertyOptional({ example: 'Trực tiếp tại cơ sở và trực tuyến' })
  @IsOptional()
  @IsString()
  businessModel?: string;

  @ApiPropertyOptional({ example: 'Trực tiếp tại cơ sở và trực tuyến', description: 'Mô hình kinh doanh tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  moHinhKinhDoanh?: string;

  @ApiPropertyOptional({ example: '1 - 3 năm' })
  @IsOptional()
  @IsString()
  operatingYears?: string;

  @ApiPropertyOptional({ example: '1 - 3 năm', description: 'Số năm hoạt động tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  soNamHoatDong?: string;

  @ApiPropertyOptional({ example: 'Đã phát sinh doanh thu' })
  @IsOptional()
  @IsString()
  revenueStatus?: string;

  @ApiPropertyOptional({ example: 'Đã phát sinh doanh thu', description: 'Tình trạng doanh thu tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tinhTrangDoanhThu?: string;

  @ApiPropertyOptional({ example: 5, description: 'Số lượng nhân sự hiện tại' })
  @IsOptional()
  @IsInt()
  employeeCount?: number;

  @ApiPropertyOptional({ example: 5, description: 'Số lượng nhân sự tiếng Việt (camelCase)' })
  @IsOptional()
  @IsInt()
  soLuongNhanSu?: number;

  @ApiPropertyOptional({ example: '120 Nguyễn Đình Chiểu, Phường Đa Kao, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  locations?: string;

  @ApiPropertyOptional({ example: '120 Nguyễn Đình Chiểu, Phường Đa Kao, Quận 1, TP.HCM', description: 'Địa điểm kinh doanh tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  diaDiemKinhDoanh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;

  @ApiPropertyOptional({ description: 'Có bán hàng online tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  coBanHangOnline?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  diaChi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiPropertyOptional({ description: 'Tên người đại diện tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenNguoiDaiDien?: string;

  // Step 2 checklist context attributes
  @ApiPropertyOptional({ example: 'TT133' })
  @IsOptional()
  @IsString()
  accountingRegime?: string;

  @ApiPropertyOptional({ example: 'TT133', description: 'Chế độ kế toán tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  cheDoKeToan?: string;

  @ApiPropertyOptional({ example: 'KHAU_TRU' })
  @IsOptional()
  @IsString()
  vatMethod?: string;

  @ApiPropertyOptional({ example: 'KHAU_TRU', description: 'Phương pháp VAT tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  phuongPhapVat?: string;

  @ApiPropertyOptional({ example: 'QUY' })
  @IsOptional()
  @IsString()
  taxCycle?: string;

  @ApiPropertyOptional({ example: 'QUY', description: 'Kỳ khai thuế tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  kyKhaiThue?: string;

  @ApiPropertyOptional({ example: 'DA_DONG_DU' })
  @IsOptional()
  @IsString()
  hasLaborContractAndInsurance?: string;

  @ApiPropertyOptional({ example: 'DA_DONG_DU', description: 'Hợp đồng & BHXH tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  hopDongVaBaoHiem?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasElectronicInvoice?: boolean;

  @ApiPropertyOptional({ description: 'Có hóa đơn điện tử tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  coHoaDonDienTu?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasFireSafetyCert?: boolean;

  @ApiPropertyOptional({ description: 'Có chứng nhận PCCC tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  coChungNhanPccc?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasSectoralPermit?: boolean;

  @ApiPropertyOptional({ description: 'Có giấy phép chuyên ngành tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  coGiayPhepCon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasTrademarkRegistered?: boolean;

  @ApiPropertyOptional({ description: 'Có đăng ký nhãn hiệu tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  coDangKyNhanHieu?: boolean;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Công ty TNHH Bếp Việt Sài Gòn', description: 'Tên doanh nghiệp tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenDoanhNghiep?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional({ example: 'Bếp Việt', description: 'Tên viết tắt tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenVietTat?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeCount?: number;

  @ApiPropertyOptional({ example: 8, description: 'Số lượng nhân sự tiếng Việt (camelCase)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  soLuongNhanSu?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  diaChi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiPropertyOptional({ description: 'Tên người đại diện tiếng Việt (camelCase)' })
  @IsOptional()
  @IsString()
  tenNguoiDaiDien?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOnlineSales?: boolean;

  @ApiPropertyOptional({ description: 'Có bán hàng trực tuyến tiếng Việt (camelCase)' })
  @IsOptional()
  @IsBoolean()
  coBanHangOnline?: boolean;
}
