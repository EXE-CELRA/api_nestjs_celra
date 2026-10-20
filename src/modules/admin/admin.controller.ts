import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  UpdateEnterpriseStatusDto,
  AdjustCreditDto,
  UpdatePlatformSettingsDto,
  UpdatePackageDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';

@ApiTags('Admin Portal (Super Administrator Only)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // 1. DASHBOARD OVERVIEW
  @Get('stats')
  @ApiOperation({ summary: 'Lấy các chỉ số KPI tổng quan toàn nền tảng' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // 2. DOANH NGHIỆP
  @Get('enterprises')
  @ApiOperation({ summary: 'Danh sách doanh nghiệp toàn sàn (có lọc & tìm kiếm)' })
  async getEnterprises(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('industry') industry?: string,
  ) {
    return this.adminService.getEnterprises({ search, status, industry });
  }

  @Patch('enterprises/:id/status')
  @ApiOperation({ summary: 'Khóa / Mở khóa trạng thái hoạt động của doanh nghiệp' })
  async updateEnterpriseStatus(
    @Param('id') orgId: string,
    @Body() dto: UpdateEnterpriseStatusDto,
  ) {
    return this.adminService.updateEnterpriseStatus(orgId, dto);
  }

  // 3. KHO LUẬT DLPL & QUOTA AI
  @Get('dlpl/quota')
  @ApiOperation({ summary: 'Lấy hạn mức API Quota Dữ Liệu Pháp Luật (dulieuphapluat.vn)' })
  async getDLPLQuota() {
    return this.adminService.getDLPLQuota();
  }

  @Post('dlpl/sync-now')
  @ApiOperation({ summary: 'Kích hoạt đồng bộ luật mới tức thì từ DLPL (Không cần chờ 15 ngày)' })
  async triggerInstantSync() {
    return this.adminService.triggerInstantSync();
  }

  @Get('ai/status')
  @ApiOperation({ summary: 'Giám sát sức khỏe & thống kê sử dụng AI Copilot (OpenCode Go / DeepSeek)' })
  async getAIServiceStatus() {
    return this.adminService.getAIServiceStatus();
  }

  // 4. TÀI CHÍNH & SỔ CÁI
  @Get('finance/overview')
  @ApiOperation({ summary: 'Tổng quan dòng tiền, doanh thu & các gói nạp' })
  async getFinanceOverview() {
    return this.adminService.getFinanceOverview();
  }

  @Post('finance/adjust-credit')
  @ApiOperation({ summary: 'Admin can thiệp cộng Credit đền bù cho doanh nghiệp' })
  async adjustCredit(@Body() dto: AdjustCreditDto) {
    return this.adminService.adjustCredit(dto);
  }

  @Patch('finance/packages')
  @ApiOperation({ summary: 'Cập nhật giá bán và ưu đãi của gói Credit' })
  async updatePackage(@Body() dto: UpdatePackageDto) {
    return this.adminService.updatePackage(dto);
  }

  // 5. BÁO CÁO TUÂN THỦ VĨ MÔ
  @Get('compliance/macro-analytics')
  @ApiOperation({ summary: 'Báo cáo bức tranh tuân thủ pháp lý vĩ mô toàn sàn' })
  async getComplianceMacroAnalytics() {
    return this.adminService.getComplianceMacroAnalytics();
  }

  // 6. CẤU HÌNH HỆ THỐNG
  @Get('settings')
  @ApiOperation({ summary: 'Lấy cấu hình tham số nền tảng' })
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Cập nhật tham số nền tảng (STK ngân hàng, tỷ giá Credit, chi phí rà soát)' })
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.adminService.updateSettings(dto);
  }
}
