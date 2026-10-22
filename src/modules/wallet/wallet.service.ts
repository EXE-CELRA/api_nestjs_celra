import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TransactionStatus, TransactionType } from '@prisma/client';

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
        where: { userId },
      });
      if (userOrg) {
        targetOrgId = userOrg.organizationId;
      }
    }

    if (!targetOrgId) {
      return {
        balance: 0,
        heldAmount: 0,
        currency: 'VND',
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
    } else if (wallet.currency === 'VND' || wallet.balance >= 1000) {
      // Chuyển đổi số dư cũ từ VND sang Credit
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
   * Mua và kích hoạt gói Credit
   */
  async buyPackage(orgId: string, packageId: string, requestedBy: string) {
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      throw new BadRequestException(`Gói Credit không tồn tại: ${packageId}`);
    }

    const wallet = await this.getWallet(orgId);
    const transactionCode = `PKG-${Date.now()}`;

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
   * Cổng thanh toán Sandbox mô phỏng giao dịch thực tế (Thành công / Thất bại)
   */
  async processSandboxPayment(
    orgId: string,
    dto: {
      orgId?: string;
      orderCode?: string;
      packageId?: string;
      amount?: number;
      outcome: 'SUCCESS' | 'FAILED';
      failureReason?: string;
      bankName?: string;
    },
    requestedBy: string,
  ) {
    const targetOrgId = orgId || dto.orgId || '';
    const wallet = await this.getWallet(targetOrgId);
    let credits = 50;
    let priceVnd = 100000;
    let packageName = 'Gói Khởi Động';

    if (dto.packageId) {
      const pkg = CREDIT_PACKAGES.find((p) => p.id === dto.packageId);
      if (pkg) {
        credits = pkg.credits;
        priceVnd = pkg.priceVnd;
        packageName = pkg.name;
      }
    } else if (dto.amount) {
      priceVnd = dto.amount;
      if (priceVnd === 100000) credits = 50;
      else if (priceVnd === 200000) credits = 120;
      else if (priceVnd === 500000) credits = 450;
      else credits = Math.max(1, Math.round(priceVnd / 2000));
      packageName = `Nạp ${credits} Credit`;
    }

    const transactionCode = dto.orderCode || `SBX-${Date.now()}`;
    const bankDisplay = dto.bankName || 'MBBank (Tài khoản ảo)';

    if (dto.outcome === 'SUCCESS') {
      return this.prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: credits },
          },
        });

        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            code: transactionCode,
            taskName: `Thanh toán Sandbox: ${packageName}`,
            requestedBy,
            amount: credits,
            type: TransactionType.deposit,
            status: TransactionStatus.success,
            note: `Thành công qua Cổng Sandbox (${bankDisplay}) - Số tiền: ${priceVnd.toLocaleString('vi-VN')}đ`,
          },
        });

        return {
          success: true,
          status: 'success',
          code: transactionCode,
          creditsAdded: credits,
          amountVnd: priceVnd,
          packageName,
          wallet: updatedWallet,
          transaction,
          message: `Thanh toán thành công qua Sandbox! Đã cộng +${credits} Credit.`,
        };
      });
    } else {
      // OUTCOME === 'FAILED'
      const reason = dto.failureReason || 'Số dư tài khoản nguồn không đủ hoặc người dùng hủy giao dịch';
      return this.prisma.$transaction(async (tx) => {
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            code: transactionCode,
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
          code: transactionCode,
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
    const tx = await this.prisma.walletTransaction.findFirst({
      where: { code },
    });
    if (!tx) {
      return { found: false, status: 'pending' };
    }
    return {
      found: true,
      status: tx.status,
      code: tx.code,
      amount: tx.amount,
      taskName: tx.taskName,
      note: tx.note,
      transaction: tx,
    };
  }

  async deposit(orgId: string, amount: number, note: string, requestedBy: string) {
    const wallet = await this.getWallet(orgId);

    // Tính số credit được nạp
    let credits = amount;
    if (amount === 100000) credits = 50;
    else if (amount === 200000) credits = 120;
    else if (amount === 500000) credits = 450;
    else if (amount >= 10000) credits = Math.max(1, Math.round(amount / 2000));

    const transactionCode = `DEP-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      // 1. Cộng Credit vào số dư khả dụng
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: credits },
        },
      });

      // 2. Ghi nhật ký giao dịch
      await tx.walletTransaction.create({
        data: {
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

      return updatedWallet;
    });
  }

  async hold(orgId: string, amount: number, taskName: string, requestedBy: string) {
    const wallet = await this.getWallet(orgId);

    if (wallet.balance < amount) {
      throw new BadRequestException(
        `Số dư ví không đủ để ký quỹ (${wallet.balance.toLocaleString()}đ < ${amount.toLocaleString()}đ). Vui lòng nạp thêm tiền.`,
      );
    }

    const transactionCode = `HLD-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      // Trừ balance, cộng vào heldAmount
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: amount },
          heldAmount: { increment: amount },
        },
      });

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

      return updatedWallet;
    });
  }

  async capture(orgId: string, amount: number, taskName: string, requestedBy: string) {
    const wallet = await this.getWallet(orgId);

    if (wallet.heldAmount < amount) {
      throw new BadRequestException('Số tiền tạm giữ không đủ để quyết toán');
    }

    const transactionCode = `CAP-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      // Trừ heldAmount
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          heldAmount: { decrement: amount },
        },
      });

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

      return updatedWallet;
    });
  }

  async refund(orgId: string, amount: number, taskName: string, requestedBy: string) {
    const wallet = await this.getWallet(orgId);

    const transactionCode = `REF-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      // Trả tiền từ heldAmount về lại balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          heldAmount: { decrement: amount },
          balance: { increment: amount },
        },
      });

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

      return updatedWallet;
    });
  }

  async getTransactions(orgId: string) {
    const wallet = await this.getWallet(orgId);
    const txs = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { timestamp: 'desc' },
    });
    return txs.map((t: any) => this.enrichTransactionWithVietnamese(t));
  }

  /**
   * Khấu trừ phí rà soát tuân thủ thẻ bối cảnh (25 Credit / thẻ)
   * Tạo giao dịch thanh toán minh bạch trong ví doanh nghiệp
   */
  async deductAuditFee(orgId: string, factLabel: string, requestedBy: string) {
    const AUDIT_CREDIT_FEE = 25;
    const wallet = await this.getWallet(orgId);

    if (wallet.balance < AUDIT_CREDIT_FEE) {
      throw new BadRequestException(
        `Số dư ví CELRA không đủ để rà soát tuân thủ (${wallet.balance} Credit < ${AUDIT_CREDIT_FEE} Credit). Vui lòng nạp thêm gói Credit để tiếp tục.`,
      );
    }

    const transactionCode = `AUD-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: AUDIT_CREDIT_FEE },
        },
      });

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

      return updatedWallet;
    });
  }
}
