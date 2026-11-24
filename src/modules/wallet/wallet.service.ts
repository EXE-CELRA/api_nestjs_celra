import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { TransactionStatus, TransactionType, MembershipStatus } from '@prisma/client';
import { deterministicUuidFromKey } from '../../common/utils/deterministic-uuid.util';

const EPHEMERAL_SANDBOX_SECRET = crypto.randomBytes(32).toString('hex');

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceVnd: number;
  badge: string;
  bonusText: string;
  popular?: boolean;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'PKG_50',
    name: 'Gói Khởi Động',
    credits: 50,
    priceVnd: 100000,
    badge: 'Khởi đầu',
    bonusText: 'Trải nghiệm rà soát cơ bản',
    popular: false,
  },
  {
    id: 'PKG_120',
    name: 'Gói Tiêu Chuẩn',
    credits: 120,
    priceVnd: 200000,
    badge: 'Phổ biến nhất',
    bonusText: 'Tặng thêm 20 Credit (Tiết kiệm 17%)',
    popular: true,
  },
  {
    id: 'PKG_450',
    name: 'Gói Doanh Nghiệp',
    credits: 450,
    priceVnd: 500000,
    badge: 'Tiết kiệm 45%',
    bonusText: 'Tặng thêm 200 Credit (Tối ưu chi phí)',
    popular: false,
  },
];

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private generateTransactionCode(prefix: string): string {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private getSandboxHmacSecret(): string {
    return (
      process.env.SANDBOX_HMAC_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      EPHEMERAL_SANDBOX_SECRET
    );
  }

  private computeSandboxSignature(
    orderCode: string,
    orgId: string,
    packageId: string,
    amount: number,
    expiresAt: number,
  ): string {
    const payload = `${orderCode}|${orgId}|${packageId}|${amount}|${expiresAt}`;
    return crypto
      .createHmac('sha256', this.getSandboxHmacSecret())
      .update(payload)
      .digest('hex');
  }

  private safeCompareHex(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  private isSandboxEnabled(): boolean {
    return process.env.ENABLE_SANDBOX_PAYMENT === 'true';
  }

  private convertVndToCredits(amountVnd: number): number {
    if (!Number.isFinite(amountVnd) || amountVnd < 10000) {
      throw new BadRequestException('Số tiền nạp tối thiểu là 10.000đ');
    }
    if (amountVnd === 100000) return 50;
    if (amountVnd === 200000) return 120;
    if (amountVnd === 500000) return 450;
    return Math.max(1, Math.round(amountVnd / 2000));
  }

  private enrichWalletWithVietnamese(wallet: any) {
    if (!wallet) return wallet;
    return {
      ...wallet,
      soDu: wallet.balance,
      soTienTamGiu: wallet.heldAmount,
      donViTienTe: wallet.currency,
      taoLuc: wallet.createdAt,
      capNhatLuc: wallet.updatedAt,
      giaoDich: wallet.transactions ? wallet.transactions.map((t: any) => this.enrichTransactionWithVietnamese(t)) : undefined,
    };
  }

  private enrichTransactionWithVietnamese(tx: any) {
    if (!tx) return tx;
    return {
      ...tx,
      maGiaoDich: tx.code,
      tenTacVu: tx.taskName,
      soTien: tx.amount,
      soDuSauGiaoDich: tx.amount,
      loaiGiaoDich: tx.type,
      trangThai: tx.status,
      ghiChu: tx.note,
      thoiGian: tx.timestamp,
    };
  }

  getPackages() {
    return CREDIT_PACKAGES;
  }

  async getWallet(orgId: string, userId?: string) {
    let targetOrgId = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId, status: MembershipStatus.active },
      });
      if (userOrg) {
        targetOrgId = userOrg.organizationId;
      }
    }

    if (!targetOrgId) {
      return {
        balance: 0,
        heldAmount: 0,
        currency: 'CREDIT',
        transactions: [],
      };
    }

    let wallet = await this.prisma.wallet.findUnique({
      where: { organizationId: targetOrgId },
      include: {
        transactions: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          organizationId: targetOrgId,
          balance: 100,
          heldAmount: 0,
          currency: 'CREDIT',
        },
        include: {
          transactions: true,
        },
      });
    } else if (wallet.currency === 'VND') {
      // Chỉ chuyển đổi một lần duy nhất các ví cũ còn đơn vị VND sang CREDIT (KHÔNG bao giờ reset ví CREDIT >= 1000!)
      const convertedCredit = Math.max(50, Math.round(wallet.balance / 2000));
      wallet = await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: convertedCredit,
          currency: 'CREDIT',
        },
        include: {
          transactions: {
            orderBy: { timestamp: 'desc' },
            take: 50,
          },
        },
      });
    }

    return this.enrichWalletWithVietnamese(wallet);
  }

  /**
   * Mua và kích hoạt gói Credit (Chặn tự cộng miễn phí trên Production)
   */
  async buyPackage(orgId: string, packageId: string, requestedBy: string) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ENABLE_DIRECT_PACKAGE_PURCHASE !== 'true'
    ) {
      throw new ForbiddenException(
        'Không thể cộng Credit trực tiếp khi chưa xác nhận giao dịch thanh toán hợp lệ. Vui lòng nạp qua VietQR/SePay.',
      );
    }

    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      throw new BadRequestException(`Gói Credit không tồn tại: ${packageId}`);
    }

    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ');
    }
    const transactionCode = this.generateTransactionCode('PKG');

    return this.prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: pkg.credits },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          code: transactionCode,
          taskName: `Nạp ${pkg.name} (+${pkg.credits} Credit)`,
          requestedBy,
          amount: pkg.credits,
          type: TransactionType.deposit,
          status: TransactionStatus.success,
          note: `Thanh toán VietQR ${pkg.priceVnd.toLocaleString('vi-VN')}đ nhận ${pkg.credits} Credit`,
        },
      });

      return updatedWallet;
    });
  }

  /**
   * Khởi tạo phiên thanh toán Sandbox có chữ ký HMAC-SHA256 một lần (hiệu lực 10 phút)
   */
  async createSandboxSession(
    orgId: string,
    dto: { packageId?: string; amount?: number },
  ) {
    if (!this.isSandboxEnabled()) {
      throw new ForbiddenException('Cổng thanh toán Sandbox hiện đang bị vô hiệu hóa.');
    }

    if (!orgId) {
      throw new ForbiddenException('Không xác định được doanh nghiệp hợp lệ.');
    }

    let resolvedPackageId = '';
    let resolvedAmount = 100000;

    if (dto.packageId) {
      const pkg = CREDIT_PACKAGES.find((p) => p.id === dto.packageId);
      if (!pkg) {
        throw new BadRequestException(`Gói Credit không tồn tại: ${dto.packageId}`);
      }
      resolvedPackageId = pkg.id;
      resolvedAmount = pkg.priceVnd;
    } else if (dto.amount !== undefined) {
      this.convertVndToCredits(dto.amount);
      resolvedAmount = dto.amount;
    } else {
      resolvedPackageId = 'PKG_50';
      resolvedAmount = 100000;
    }

    const orderCode = this.generateTransactionCode('SBX');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const signature = this.computeSandboxSignature(
      orderCode,
      orgId,
      resolvedPackageId,
      resolvedAmount,
      expiresAt,
    );

    return {
      orderCode,
      orgId,
      packageId: resolvedPackageId || undefined,
      amount: resolvedAmount,
      expiresAt,
      signature,
    };
  }

  /**
   * Cổng thanh toán Sandbox mô phỏng giao dịch thực tế (Yêu cầu ENABLE_SANDBOX_PAYMENT=true + chữ ký HMAC hợp lệ)
   */
  async processSandboxPayment(
    orgId: string,
    dto: {
      orgId?: string;
      maDoanhNghiep?: string;
      orderCode?: string;
      maDonHang?: string;
      packageId?: string;
      maGoi?: string;
      amount?: number;
      soTien?: number;
      outcome: 'SUCCESS' | 'FAILED';
      ketQua?: 'SUCCESS' | 'FAILED';
      failureReason?: string;
      lyDoThatBai?: string;
      bankName?: string;
      tenNganHang?: string;
      signature?: string;
      expiresAt?: number;
    },
    requestedBy: string,
  ) {
    if (!this.isSandboxEnabled()) {
      throw new ForbiddenException('Cổng thanh toán Sandbox hiện đang bị vô hiệu hóa.');
    }

    const targetOrgId = (orgId || dto.orgId || dto.maDoanhNghiep || '').trim();
    const orderCode = (dto.orderCode || dto.maDonHang || '').trim();
    const packageId = (dto.packageId || dto.maGoi || '').trim();
    const rawAmount = dto.amount ?? dto.soTien;
    const outcome = (dto.outcome || dto.ketQua) as 'SUCCESS' | 'FAILED';
    const signature = dto.signature?.trim() || '';
    const expiresAt = dto.expiresAt;

    if (!targetOrgId || !orderCode || !orderCode.startsWith('SBX-')) {
      throw new ForbiddenException('Thiếu thông tin phiên thanh toán Sandbox hợp lệ.');
    }

    if (!signature || typeof expiresAt !== 'number') {
      throw new ForbiddenException('Thiếu chữ ký xác thực phiên thanh toán Sandbox.');
    }

    if (Date.now() > expiresAt) {
      throw new ForbiddenException('Phiên thanh toán Sandbox đã hết hạn. Vui lòng tạo mã QR mới.');
    }

    let credits = 0;
    let priceVnd = 0;
    let packageName = '';

    if (packageId) {
      const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
      if (!pkg) {
        throw new BadRequestException(`Gói Credit không tồn tại: ${packageId}`);
      }
      credits = pkg.credits;
      priceVnd = pkg.priceVnd;
      packageName = pkg.name;
    } else if (rawAmount !== undefined) {
      credits = this.convertVndToCredits(rawAmount);
      priceVnd = rawAmount;
      packageName = `Nạp ${credits} Credit`;
    } else {
      throw new BadRequestException('Vui lòng chỉ định gói nạp hoặc số tiền nạp hợp lệ.');
    }

    // Xác thực chữ ký HMAC-SHA256 chống giả mạo số tiền / orgId / mã đơn
    const expectedSignature = this.computeSandboxSignature(
      orderCode,
      targetOrgId,
      packageId,
      priceVnd,
      expiresAt,
    );
    if (!this.safeCompareHex(signature, expectedSignature)) {
      throw new ForbiddenException('Chữ ký xác thực phiên thanh toán Sandbox không hợp lệ.');
    }

    const wallet = await this.getWallet(targetOrgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ.');
    }

    const bankDisplay = dto.bankName || dto.tenNganHang || 'MBBank (Tài khoản ảo)';

    if (outcome === 'SUCCESS') {
      // Idempotency nguyên tử cho kết quả SUCCESS bằng Deterministic PK (vẫn cho phép thử lại sau FAILED)
      const idempotencyId = deterministicUuidFromKey(`sbx_success:${orderCode}`);

      try {
        return await this.prisma.$transaction(async (tx) => {
          const transaction = await tx.walletTransaction.create({
            data: {
              id: idempotencyId,
              walletId: wallet.id,
              code: orderCode,
              taskName: `Thanh toán Sandbox: ${packageName}`,
              requestedBy,
              amount: credits,
              type: TransactionType.deposit,
              status: TransactionStatus.success,
              note: `Thành công qua Cổng Sandbox (${bankDisplay}) - Số tiền: ${priceVnd.toLocaleString('vi-VN')}đ`,
            },
          });

          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: credits },
            },
          });

          return {
            success: true,
            status: 'success',
            code: orderCode,
            creditsAdded: credits,
            amountVnd: priceVnd,
            packageName,
            wallet: updatedWallet,
            transaction,
            message: `Thanh toán thành công qua Sandbox! Đã cộng +${credits} Credit.`,
          };
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          throw new ConflictException('Phiên thanh toán Sandbox này đã được xử lý thành công trước đó.');
        }
        throw err;
      }
    } else {
      // OUTCOME === 'FAILED': dùng UUID mặc định để người dùng vẫn có thể bấm "Thử lại" với cùng orderCode
      const reason =
        dto.failureReason ||
        dto.lyDoThatBai ||
        'Số dư tài khoản nguồn không đủ hoặc người dùng hủy giao dịch';
      return this.prisma.$transaction(async (tx) => {
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            code: orderCode,
            taskName: `Giao dịch Sandbox thất bại: ${packageName}`,
            requestedBy,
            amount: 0,
            type: TransactionType.deposit,
            status: TransactionStatus.failed,
            note: `Lỗi: ${reason}. Đã hoàn tiền về tài khoản ngân hàng ảo.`,
          },
        });

        return {
          success: false,
          status: 'failed',
          code: orderCode,
          creditsAdded: 0,
          amountVnd: priceVnd,
          packageName,
          wallet,
          transaction,
          failureReason: reason,
          message: `Giao dịch thất bại: ${reason}. Đã kích hoạt hoàn trả về tài khoản nguồn.`,
        };
      });
    }
  }

  async getSandboxStatus(code: string) {
    if (!this.isSandboxEnabled()) {
      throw new ForbiddenException('Cổng thanh toán Sandbox hiện đang bị vô hiệu hóa.');
    }

    // Chỉ cho phép tra cứu mã đơn Sandbox (SBX-), tuyệt đối không lộ giao dịch thật (DEP-, CR-ADJUST-,...)
    if (!code || !code.startsWith('SBX-')) {
      return { found: false, status: 'pending' };
    }

    const tx = await this.prisma.walletTransaction.findFirst({
      where: { code },
      orderBy: { timestamp: 'desc' },
      select: {
        status: true,
        code: true,
      },
    });
    if (!tx) {
      return { found: false, status: 'pending' };
    }
    return {
      found: true,
      status: tx.status,
    };
  }

  async deposit(
    orgId: string,
    amount: number,
    note: string,
    requestedBy: string,
    options?: { idempotencyId?: string },
  ) {
    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ');
    }

    // Bắt buộc số tiền VND >= 10.000đ (triệt tiêu lỗ hổng chuyển 999đ nhận 999 Credit)
    const credits = this.convertVndToCredits(amount);
    const transactionCode = this.generateTransactionCode('DEP');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Ghi nhật ký giao dịch TRƯỚC (nếu trùng idempotencyId -> P2002 rollback tức thì trước khi cộng ví)
        await tx.walletTransaction.create({
          data: {
            ...(options?.idempotencyId ? { id: options.idempotencyId } : {}),
            walletId: wallet.id,
            code: transactionCode,
            taskName: `Nạp Credit ví CELRA (+${credits} Credit)`,
            requestedBy,
            amount: credits,
            type: TransactionType.deposit,
            status: TransactionStatus.success,
            note: note || `Nạp ${credits} Credit qua cổng VietQR`,
          },
        });

        // 2. Cộng Credit vào số dư khả dụng
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: credits },
          },
        });

        return updatedWallet;
      });
    } catch (err: any) {
      if (options?.idempotencyId && err?.code === 'P2002') {
        return { ...wallet, duplicated: true };
      }
      throw err;
    }
  }

  async hold(orgId: string, amount: number, taskName: string, requestedBy: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền ký quỹ phải lớn hơn 0');
    }

    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ');
    }

    const transactionCode = this.generateTransactionCode('HLD');

    return this.prisma.$transaction(async (tx) => {
      // Atomic conditional update: chống Race Condition / âm số dư khi gửi đồng thời
      const result = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: {
          balance: { decrement: amount },
          heldAmount: { increment: amount },
        },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          `Số dư ví không đủ để ký quỹ (${wallet.balance.toLocaleString()} < ${amount.toLocaleString()}). Vui lòng nạp thêm Credit.`,
        );
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          code: transactionCode,
          taskName,
          requestedBy,
          amount,
          type: TransactionType.hold,
          status: TransactionStatus.held,
          note: `Tạm giữ ký quỹ dịch vụ chuyên gia cho tác vụ: ${taskName}`,
        },
      });

      return tx.wallet.findUnique({ where: { id: wallet.id } });
    });
  }

  async capture(orgId: string, amount: number, taskName: string, requestedBy: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền quyết toán phải lớn hơn 0');
    }

    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ');
    }

    const transactionCode = this.generateTransactionCode('CAP');

    return this.prisma.$transaction(async (tx) => {
      // Atomic conditional update trên heldAmount
      const result = await tx.wallet.updateMany({
        where: { id: wallet.id, heldAmount: { gte: amount } },
        data: {
          heldAmount: { decrement: amount },
        },
      });

      if (result.count === 0) {
        throw new BadRequestException('Số tiền tạm giữ không đủ để quyết toán');
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          code: transactionCode,
          taskName,
          requestedBy,
          amount,
          type: TransactionType.capture,
          status: TransactionStatus.success,
          note: `Quyết toán phí dịch vụ chuyên gia cho tác vụ: ${taskName}`,
        },
      });

      return tx.wallet.findUnique({ where: { id: wallet.id } });
    });
  }

  async refund(orgId: string, amount: number, taskName: string, requestedBy: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền hoàn cọc phải lớn hơn 0');
    }

    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ');
    }

    const transactionCode = this.generateTransactionCode('REF');

    return this.prisma.$transaction(async (tx) => {
      // Atomic conditional update: bắt buộc heldAmount >= amount để chống bơm tiền miễn phí & âm heldAmount
      const result = await tx.wallet.updateMany({
        where: { id: wallet.id, heldAmount: { gte: amount } },
        data: {
          heldAmount: { decrement: amount },
          balance: { increment: amount },
        },
      });

      if (result.count === 0) {
        throw new BadRequestException('Số tiền tạm giữ không đủ để hoàn cọc');
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          code: transactionCode,
          taskName,
          requestedBy,
          amount,
          type: TransactionType.refund,
          status: TransactionStatus.refunded,
          note: `Hoàn cọc dịch vụ chuyên gia cho tác vụ: ${taskName}`,
        },
      });

      return tx.wallet.findUnique({ where: { id: wallet.id } });
    });
  }

  async getTransactions(orgId: string) {
    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      return [];
    }
    const txs = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { timestamp: 'desc' },
    });
    return txs.map((t: any) => this.enrichTransactionWithVietnamese(t));
  }

  /**
   * Khấu trừ phí rà soát tuân thủ thẻ bối cảnh (25 Credit / thẻ)
   * Dùng atomic conditional update chống Race Condition
   */
  async deductAuditFee(orgId: string, factLabel: string, requestedBy: string) {
    const AUDIT_CREDIT_FEE = 25;
    const wallet = await this.getWallet(orgId);
    if (!wallet?.id) {
      throw new NotFoundException('Không tìm thấy ví doanh nghiệp hợp lệ');
    }

    const transactionCode = this.generateTransactionCode('AUD');

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: AUDIT_CREDIT_FEE } },
        data: {
          balance: { decrement: AUDIT_CREDIT_FEE },
        },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          `Số dư ví CELRA không đủ để rà soát tuân thủ (${wallet.balance} Credit < ${AUDIT_CREDIT_FEE} Credit). Vui lòng nạp thêm gói Credit để tiếp tục.`,
        );
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          code: transactionCode,
          taskName: `Rà soát tuân thủ: ${factLabel} (-${AUDIT_CREDIT_FEE} Credit)`,
          requestedBy,
          amount: AUDIT_CREDIT_FEE,
          type: TransactionType.capture,
          status: TransactionStatus.success,
          note: `Khấu trừ ${AUDIT_CREDIT_FEE} Credit cho phiên rà soát AI thẻ: ${factLabel}`,
        },
      });

      return tx.wallet.findUnique({ where: { id: wallet.id } });
    });
  }
}
