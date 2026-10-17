import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../../database/prisma.service';
import { GenerateVietQrDto, SepayWebhookDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly config: ConfigService,
  ) {}

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

  async handleSepayWebhook(dto: SepayWebhookDto) {
    this.logger.log(`Nhận webhook thanh toán SePay: ${JSON.stringify(dto)}`);

    if (dto.transferType !== 'in' || dto.transferAmount <= 0) {
      return { success: false, message: 'Giao dịch không phải nạp tiền' };
    }

    // Tìm mã Organization trong chuỗi content
    const match = dto.content.match(/CELRA\s+([a-zA-Z0-9]{8})/i);
    if (!match) {
      this.logger.warn(`Không nhận diện được mã tổ chức CELRA trong content: ${dto.content}`);
      return { success: false, message: 'Nội dung chuyển khoản không hợp lệ' };
    }

    const shortOrgId = match[1];

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

    // Nạp tiền tự động vào ví
    await this.walletService.deposit(
      org.id,
      dto.transferAmount,
      `Nạp tự động qua VietQR/SePay GD #${dto.id} - ${dto.content}`,
      'Cổng thanh toán VietQR / SePay',
    );

    this.logger.log(`✅ Đã nạp thành công ${dto.transferAmount.toLocaleString()}đ vào ví của ${org.name} (${org.id})`);

    return {
      success: true,
      message: 'Xử lý nạp tiền tự động thành công',
      orgId: org.id,
      amount: dto.transferAmount,
    };
  }
}
