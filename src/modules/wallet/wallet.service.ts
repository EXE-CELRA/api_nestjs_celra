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

  getPackages() {
    return CREDIT_PACKAGES;
  }

  async getWallet(orgId: string) {
    let targetOrgId = orgId;
    if (!targetOrgId) {
      const first = await this.prisma.organization.findFirst();
      if (first) targetOrgId = first.id;
    }

    if (!targetOrgId) {
      throw new NotFoundException('Không tìm thấy tổ chức doanh nghiệp');
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

    return wallet;
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
    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { timestamp: 'desc' },
    });
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
