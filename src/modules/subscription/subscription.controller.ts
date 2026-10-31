import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { SubscribePlanDto, ToggleAutoRenewDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';

interface AuthenticatedOrgRequest extends Request {
  validatedOrgId?: string;
}

@ApiTags('Subscriptions & Plans (Quản Lý Gói Dịch Vụ & Thuê Bao)')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('current')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy thông tin gói thuê bao hiện tại và hạn mức đã sử dụng' })
  async getCurrent(
    @Req() req: AuthenticatedOrgRequest,
    @Headers('x-organization-id') orgId: string,
  ) {
    const targetOrgId = req.validatedOrgId || orgId;
    return this.subscriptionService.getCurrentSubscription(targetOrgId);
  }

  @Get('invoices')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách lịch sử hóa đơn thanh toán thuê bao' })
  async getInvoices(
    @Req() req: AuthenticatedOrgRequest,
    @Headers('x-organization-id') orgId: string,
  ) {
    const targetOrgId = req.validatedOrgId || orgId;
    return this.subscriptionService.getInvoices(targetOrgId);
  }

  @Post('subscribe')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Đăng ký hoặc nâng cấp gói dịch vụ (Starter, Professional, Enterprise)' })
  async subscribe(
    @Req() req: AuthenticatedOrgRequest,
    @Headers('x-organization-id') orgId: string,
    @Body() dto: SubscribePlanDto,
  ) {
    const targetOrgId = req.validatedOrgId || orgId;
    return this.subscriptionService.subscribe(targetOrgId, dto);
  }

  @Patch('auto-renew')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Bật / Tắt tự động gia hạn gói' })
  async toggleAutoRenew(
    @Req() req: AuthenticatedOrgRequest,
    @Headers('x-organization-id') orgId: string,
    @Body() dto: ToggleAutoRenewDto,
  ) {
    const targetOrgId = req.validatedOrgId || orgId;
    return this.subscriptionService.toggleAutoRenew(targetOrgId, dto.autoRenew);
  }

  @Post('cancel')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Hủy tự động gia hạn gói (vẫn giữ quyền lợi đến hết hạn)' })
  async cancel(
    @Req() req: AuthenticatedOrgRequest,
    @Headers('x-organization-id') orgId: string,
  ) {
    const targetOrgId = req.validatedOrgId || orgId;
    return this.subscriptionService.cancelSubscription(targetOrgId);
  }
}
