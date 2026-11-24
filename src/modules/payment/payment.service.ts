import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../../database/prisma.service';
import { GenerateVietQrDto, SepayWebhookDto } from './dto/payment.dto';
import { deterministicUuidFromKey } from '../../common/utils/deterministic-uuid.util';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly config: ConfigService,
  ) {}

  private safeCompareSecret(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  async generateVietQr(orgId: string, dto: GenerateVietQrDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new BadRequestException('Không tìm thấy doanh nghiệp');
    }

    const bankId = this.config.get<string>('VIETQR_BANK_ID', 'MB');
    const accountNo = this.config.get<string>('VIETQR_ACCOUNT_NO', '0987654321');
    const template = this.config.get<string>('VIETQR_TEMPLATE', 'compact');

    // Cú pháp nạp tiền: CELRA <ORG_SHORT_ID> [PACKAGE_OR_NOTE]
    const shortOrgId = orgId.substring(0, 8);
    const customText = dto.packageId || dto.note || dto.description || '';
    const cleanText = customText.replace(/^CELRA\s*/i, '').trim();
    const memo = cleanText ? `CELRA ${shortOrgId} ${cleanText}`.substring(0, 50) : `CELRA ${shortOrgId}`;

    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${dto.amount}&addInfo=${encodeURIComponent(memo)}`;

    return {
      qrUrl,
      bankId,
      accountNo,
      accountName: 'CONG TY CP CONG NGHE CELRA',
      amount: dto.amount,
      content: memo,
      orgId,
      orgName: org.name,
    };
  }

  async handleSepayWebhook(dto: SepayWebhookDto, authHeader?: string) {
    // 1. Bắt buộc xác thực Authorization: Apikey <SEPAY_WEBHOOK_API_KEY> bằng timingSafeEqual
    const expectedApiKey = (
      process.env.SEPAY_WEBHOOK_API_KEY ||
      this.config.get<string>('SEPAY_WEBHOOK_API_KEY') ||
      ''
    ).trim();

    if (!expectedApiKey) {
      this.logger.error('SEPAY_WEBHOOK_API_KEY chưa được cấu hình — từ chối webhook để đảm bảo an toàn.');
      throw new UnauthorizedException('Cổng webhook SePay chưa được cấu hình khóa xác thực');
    }

    const apiKeyMatch = typeof authHeader === 'string' ? authHeader.trim().match(/^Apikey\s+(.+)$/i) : null;
    const providedApiKey = apiKeyMatch?.[1]?.trim() || '';
    if (!providedApiKey || !this.safeCompareSecret(providedApiKey, expectedApiKey)) {
      this.logger.warn('Từ chối webhook SePay: thiếu hoặc sai Authorization Apikey.');
      throw new UnauthorizedException('Khóa xác thực Webhook SePay không hợp lệ');
    }

    this.logger.log(`Nhận webhook thanh toán SePay hợp lệ GD #${dto.id} (${dto.transferAmount} VND)`);

    if (dto.transferType !== 'in' || dto.transferAmount < 10000) {
      throw new BadRequestException('Giao dịch không hợp lệ hoặc số tiền nạp nhỏ hơn 10.000đ');
    }

    // 2. Xác minh số tài khoản thụ hưởng khớp cấu hình hệ thống
    const expectedAccountNo = (
      process.env.VIETQR_ACCOUNT_NO ||
      this.config.get<string>('VIETQR_ACCOUNT_NO', '0987654321')
    ).trim();
    if (expectedAccountNo && dto.accountNumber?.trim() !== expectedAccountNo) {
      this.logger.warn(
        `Từ chối webhook SePay GD #${dto.id}: số tài khoản nhận (${dto.accountNumber}) không khớp cấu hình.`,
      );
      throw new BadRequestException('Số tài khoản thụ hưởng không khớp cấu hình hệ thống');
    }

    // 3. Tìm mã Organization trong chuỗi content (chuẩn hóa lowercase vì ngân hàng thường đổi chữ HOA)
    const match = dto.content.match(/CELRA\s+([a-zA-Z0-9]{8})/i);
    if (!match) {
      this.logger.warn(`Không nhận diện được mã tổ chức CELRA trong content: ${dto.content}`);
      return { success: false, message: 'Nội dung chuyển khoản không hợp lệ' };
    }

    const shortOrgId = match[1].toLowerCase();

    const org = await this.prisma.organization.findFirst({
      where: {
        id: {
          startsWith: shortOrgId,
        },
      },
    });

    if (!org) {
      this.logger.error(`Không tìm thấy doanh nghiệp có prefix ID: ${shortOrgId}`);
      return { success: false, message: 'Doanh nghiệp không tồn tại' };
    }

    // 4. Nạp tiền tự động vào ví với Idempotency nguyên tử qua Deterministic PK
    const idempotencyId = deterministicUuidFromKey(`sepay:${dto.id}`);
    const depositResult: any = await this.walletService.deposit(
      org.id,
      dto.transferAmount,
      `Nạp tự động qua VietQR/SePay GD #${dto.id} - ${dto.content}`,
      'Cổng thanh toán VietQR / SePay',
      { idempotencyId },
    );

    if (depositResult?.duplicated) {
      this.logger.log(`[IDEMPOTENCY] Bỏ qua webhook SePay trùng lặp GD #${dto.id}`);
      return {
        success: true,
        duplicated: true,
        message: 'Giao dịch đã được ghi nhận trước đó',
        orgId: org.id,
        amount: dto.transferAmount,
      };
    }

    this.logger.log(`✅ Đã nạp thành công ${dto.transferAmount.toLocaleString()}đ vào ví của ${org.name} (${org.id})`);

    return {
      success: true,
      message: 'Xử lý nạp tiền tự động thành công',
      orgId: org.id,
      amount: dto.transferAmount,
    };
  }
}
