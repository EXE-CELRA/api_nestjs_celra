import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import {
  DepositDto,
  BuyPackageDto,
  SandboxPaymentDto,
  CreateSandboxSessionDto,
} from './dto/wallet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { OrgRolesGuard } from '../../common/guards/org-roles.guard';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ValidatedOrgId } from '../../common/decorators/validated-org-id.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit, SkipRateLimit } from '../../common/decorators/rate-limit.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Wallet & Escrow (Ví Doanh nghiệp & Ký quỹ)')
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('packages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách các gói nạp Credit CELRA' })
  async getPackages() {
    return this.walletService.getPackages();
  }

  @Get('my-wallet')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy số dư khả dụng và số tiền tạm giữ (Hold) của ví doanh nghiệp' })
  async getWallet(
    @ValidatedOrgId() orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.walletService.getWallet(orgId, userId);
  }

  @Post('buy-package')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
  @Roles(UserRole.owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Mua và kích hoạt gói Credit vào ví' })
  async buyPackage(
    @ValidatedOrgId() orgId: string,
    @CurrentUser('name') userName: string,
    @Body() dto: BuyPackageDto,
  ) {
    return this.walletService.buyPackage(orgId, dto.packageId, userName || 'Chủ doanh nghiệp');
  }

  @Post('deposit')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard, OrganizationMembershipGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Nạp tiền thủ công vào ví doanh nghiệp (Chỉ Super Admin)' })
  async deposit(
    @ValidatedOrgId() orgId: string,
    @CurrentUser('name') userName: string,
    @Body() dto: DepositDto,
  ) {
    return this.walletService.deposit(
      orgId,
      dto.amount,
      dto.note || dto.ghiChu || 'Nạp tiền ví thủ công bởi Quản trị viên',
      userName || 'CELRA Super Admin',
    );
  }

  @Post('sandbox-session')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
  @Roles(UserRole.owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Khởi tạo phiên thanh toán Sandbox có ký số HMAC một lần' })
  async createSandboxSession(
    @ValidatedOrgId() orgId: string,
    @Body() dto: CreateSandboxSessionDto,
  ) {
    return this.walletService.createSandboxSession(orgId, dto);
  }

  @Public()
  @RateLimit({ limit: 10, ttlMs: 60_000 })
  @Post('sandbox-payment')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp (tùy chọn)', required: false })
  @ApiOperation({ summary: 'Cổng thanh toán Sandbox mô phỏng giao dịch ngân hàng thực tế (Yêu cầu chữ ký HMAC)' })
  async sandboxPayment(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('name') userName: string,
    @Body() dto: SandboxPaymentDto,
  ) {
    return this.walletService.processSandboxPayment(
      orgId || dto.orgId || '',
      dto,
      userName || 'Khách hàng Mobile Sandbox',
    );
  }

  @Public()
  @SkipRateLimit()
  @Get('sandbox-status/:code')
  @ApiOperation({ summary: 'Kiểm tra trạng thái giao dịch Sandbox theo mã đơn hàng SBX-' })
  async getSandboxStatus(@Param('code') code: string) {
    return this.walletService.getSandboxStatus(code);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy lịch sử giao dịch sao kê ví doanh nghiệp' })
  async getTransactions(@ValidatedOrgId() orgId: string) {
    return this.walletService.getTransactions(orgId);
  }
}
