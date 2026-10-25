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
import { DepositDto, BuyPackageDto, SandboxPaymentDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Wallet & Escrow (Ví Doanh nghiệp & Ký quỹ)')
@Controller('wallets')
@UseGuards(JwtAuthGuard, RolesGuard, OrganizationMembershipGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('packages')
  @ApiOperation({ summary: 'Lấy danh sách các gói nạp Credit CELRA' })
  async getPackages() {
    return this.walletService.getPackages();
  }

  @Get('my-wallet')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy số dư khả dụng và số tiền tạm giữ (Hold) của ví doanh nghiệp' })
  async getWallet(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.walletService.getWallet(orgId, userId);
  }

  @Post('buy-package')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Mua và kích hoạt gói Credit vào ví' })
  async buyPackage(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('name') userName: string,
    @Body() dto: BuyPackageDto,
  ) {
    return this.walletService.buyPackage(orgId, dto.packageId, userName || 'Chủ doanh nghiệp');
  }

  @Post('deposit')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Nạp tiền thủ công / xác nhận nạp tiền vào ví' })
  async deposit(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('name') userName: string,
    @Body() dto: DepositDto,
  ) {
    return this.walletService.deposit(orgId, dto.amount, dto.note || 'Nạp tiền ví', userName || 'Chủ doanh nghiệp');
  }

  @Public()
  @Post('sandbox-payment')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp (tùy chọn)', required: false })
  @ApiOperation({ summary: 'Cổng thanh toán Sandbox mô phỏng giao dịch ngân hàng thực tế (Thành công / Thất bại)' })
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
  @Get('sandbox-status/:code')
  @ApiOperation({ summary: 'Kiểm tra trạng thái giao dịch Sandbox theo mã đơn hàng' })
  async getSandboxStatus(@Param('code') code: string) {
    return this.walletService.getSandboxStatus(code);
  }

  @Get('transactions')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy lịch sử giao dịch sao kê ví doanh nghiệp' })
  async getTransactions(@Headers('x-organization-id') orgId: string) {
    return this.walletService.getTransactions(orgId);
  }
}
