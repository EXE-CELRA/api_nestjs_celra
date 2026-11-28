import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { SubscribePlanDto, ToggleAutoRenewDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ValidatedOrgId } from '../../common/decorators/current-user.decorator';

@ApiTags('Subscriptions & Plans (Quản Lý Gói Dịch Vụ & Thuê Bao)')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, RolesGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('current')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy thông tin gói thuê bao hiện tại và hạn mức đã sử dụng' })
  async getCurrent(
    @ValidatedOrgId() targetOrgId: string,
  ) {
    return this.subscriptionService.getCurrentSubscription(targetOrgId);
  }

  @Get('invoices')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách lịch sử hóa đơn thanh toán thuê bao' })
  async getInvoices(
    @ValidatedOrgId() targetOrgId: string,
  ) {
    return this.subscriptionService.getInvoices(targetOrgId);
  }

  @Post('subscribe')
  @Roles(UserRole.owner, UserRole.internal_accountant)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Đăng ký hoặc nâng cấp gói dịch vụ (Starter, Professional, Enterprise)' })
  async subscribe(
    @ValidatedOrgId() targetOrgId: string,
    @Body() dto: SubscribePlanDto,
  ) {
    return this.subscriptionService.subscribe(targetOrgId, dto);
  }

  @Patch('auto-renew')
  @Roles(UserRole.owner, UserRole.internal_accountant)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Bật / Tắt tự động gia hạn gói' })
  async toggleAutoRenew(
    @ValidatedOrgId() targetOrgId: string,
    @Body() dto: ToggleAutoRenewDto,
  ) {
    return this.subscriptionService.toggleAutoRenew(targetOrgId, dto.autoRenew);
  }

  @Post('cancel')
  @Roles(UserRole.owner)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Hủy tự động gia hạn gói (vẫn giữ quyền lợi đến hết hạn)' })
  async cancel(
    @ValidatedOrgId() targetOrgId: string,
  ) {
    return this.subscriptionService.cancelSubscription(targetOrgId);
  }
}
