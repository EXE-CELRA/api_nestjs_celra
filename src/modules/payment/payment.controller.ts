import {
  Controller,
  Post,
  Body,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { GenerateVietQrDto, SepayWebhookDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { ValidatedOrgId } from '../../common/decorators/validated-org-id.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Payment & VietQR (Thanh toán & Cổng Webhook)')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('vietqr/generate')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tạo mã VietQR Code nạp tiền động theo đúng cú pháp CELRA' })
  async generateVietQr(
    @ValidatedOrgId() orgId: string,
    @Body() dto: GenerateVietQrDto,
  ) {
    return this.paymentService.generateVietQr(orgId, dto);
  }

  @Public()
  @Post('webhook/sepay')
  @ApiOperation({ summary: 'Webhook nhận thông báo biến động số dư từ cổng SePay/Casso tự động cộng tiền ví' })
  async sepayWebhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: SepayWebhookDto,
  ) {
    return this.paymentService.handleSepayWebhook(dto, authHeader);
  }
}
