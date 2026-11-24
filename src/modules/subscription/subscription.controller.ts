import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { SubscribePlanDto, ToggleAutoRenewDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { OrgRolesGuard } from '../../common/guards/org-roles.guard';
import { ValidatedOrgId } from '../../common/decorators/validated-org-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Subscriptions & Plans (Quản Lý Gói Dịch Vụ & Thuê Bao)')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('current')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy thông tin gói thuê bao hiện tại và hạn mức đã sử dụng' })
  async getCurrent(@ValidatedOrgId() orgId: string) {
    return this.subscriptionService.getCurrentSubscription(orgId);
  }

  @Get('invoices')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách lịch sử hóa đơn thanh toán thuê bao' })
  async getInvoices(@ValidatedOrgId() orgId: string) {
    return this.subscriptionService.getInvoices(orgId);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Đăng ký hoặc nâng cấp gói dịch vụ (Starter, Professional, Enterprise)' })
  async subscribe(
    @ValidatedOrgId() orgId: string,
    @Body() dto: SubscribePlanDto,
  ) {
    return this.subscriptionService.subscribe(orgId, dto);
  }

  @Patch('auto-renew')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Bật / Tắt tự động gia hạn gói' })
  async toggleAutoRenew(
    @ValidatedOrgId() orgId: string,
    @Body() dto: ToggleAutoRenewDto,
  ) {
    return this.subscriptionService.toggleAutoRenew(orgId, dto.autoRenew);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Hủy tự động gia hạn gói (vẫn giữ quyền lợi đến hết hạn)' })
  async cancel(@ValidatedOrgId() orgId: string) {
    return this.subscriptionService.cancelSubscription(orgId);
  }
}
