import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  SUBSCRIPTION_PLANS_BACKEND,
  type SubscriptionPlanCode,
  type PlanFeatureConfig,
} from '../../common/constants/subscription-plans.constant';
import type { SubscribePlanDto } from './dto/subscription.dto';

export interface SubscriptionResponse {
  organizationId: string;
  plan: SubscriptionPlanCode;
  planName: string;
  priceVnd: number;
  status: string;
  startedAt: string;
  expiresAt: string;
  nextBillingAt: string;
  autoRenew: boolean;
  usage: {
    aiChatboxUsed: number;
    aiChatboxLimit: number;
    docAnalysisUsed: number;
    docAnalysisLimit: number;
    storageUsedGb: number;
    storageLimitGb: number;
    daysRemaining: number;
  };
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chuyển đổi fileSize lưu trong DB (số bytes hoặc chuỗi "0.25 MB", "512 KB", "1.2 GB") về số bytes */
  private parseFileSizeToBytes(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(0, raw);
    }
    const text = String(raw || '').trim();
    if (!text) return 0;
    const numericOnly = Number(text);
    if (!Number.isNaN(numericOnly) && Number.isFinite(numericOnly)) {
      return Math.max(0, numericOnly);
    }
    const match = text.match(/^([\d.,]+)\s*(B|KB|MB|GB|TB)?$/i);
    if (!match) return 0;
    const value = Number(match[1].replace(',', '.'));
    if (Number.isNaN(value)) return 0;
    const unit = (match[2] || 'B').toUpperCase();
    const multipliers: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };
    return Math.round(value * (multipliers[unit] || 1));
  }

  /**
   * 1. LẤY THÔNG TIN GÓI HIỆN TẠI & HẠN MỨC SỬ DỤNG
   */
  async getCurrentSubscription(orgId: string): Promise<SubscriptionResponse> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        evidenceDocuments: {
          select: { fileSize: true },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp hợp lệ trong hệ thống');
    }

    const now = new Date();

    // Tự động khởi tạo chu kỳ gói nếu chưa có trong DB (Mặc định gói Professional 30 ngày dùng thử)
    let planCode = (org.subscriptionPlan as SubscriptionPlanCode) || 'PROFESSIONAL';
    if (!SUBSCRIPTION_PLANS_BACKEND[planCode]) {
      planCode = 'PROFESSIONAL';
    }

    let startedAt = org.subscriptionStartedAt;
    let expiresAt = org.subscriptionExpiresAt;
    let cycleStart = org.currentBillingCycleStart;

    if (!startedAt || !expiresAt) {
      startedAt = new Date(now.getTime() - 6 * 86400 * 1000);
      expiresAt = new Date(now.getTime() + 24 * 86400 * 1000);
      cycleStart = startedAt;

      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          subscriptionPlan: planCode,
          subscriptionStatus: 'ACTIVE',
          subscriptionStartedAt: startedAt,
          subscriptionExpiresAt: expiresAt,
          subscriptionNextBillingAt: expiresAt,
          currentBillingCycleStart: cycleStart,
        },
      });
    }

    // Kiểm tra reset chu kỳ tháng (nếu chu kỳ đã quá 30 ngày)
    let aiUsed = org.aiQueriesUsedThisMonth;
    let docUsed = org.docAnalysesUsedThisMonth;
    if (cycleStart && now.getTime() - new Date(cycleStart).getTime() >= 30 * 86400 * 1000) {
      aiUsed = 0;
      docUsed = 0;
      cycleStart = now;

      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          aiQueriesUsedThisMonth: 0,
          docAnalysesUsedThisMonth: 0,
          currentBillingCycleStart: now,
        },
      });
    }

    const planConfig = SUBSCRIPTION_PLANS_BACKEND[planCode];

    // Tính tổng dung lượng chứng từ đã lưu trữ (đổi sang GB, chính xác cả số bytes lẫn chuỗi MB/KB)
    const totalBytes = (org.evidenceDocuments || []).reduce(
      (sum, d) => sum + this.parseFileSizeToBytes(d.fileSize),
      0,
    );
    const rawGb = totalBytes / (1024 * 1024 * 1024);
    const storageUsedGb = totalBytes > 0 ? Math.max(0.01, Math.round(rawGb * 100) / 100) : 0;

    // Tính số ngày còn lại
    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (86400 * 1000)));

    const status = daysRemaining > 0 ? (org.subscriptionStatus || 'ACTIVE') : 'EXPIRED';

    return {
      organizationId: org.id,
      plan: planCode,
      planName: planConfig.name,
      priceVnd: planConfig.priceVnd,
      status,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nextBillingAt: (org.subscriptionNextBillingAt || expiresAt).toISOString(),
      autoRenew: org.autoRenew,
      usage: {
        aiChatboxUsed: aiUsed,
        aiChatboxLimit: planConfig.aiChatboxMonthlyLimit,
        docAnalysisUsed: docUsed,
        docAnalysisLimit: planConfig.docAnalysisMonthlyLimit,
        storageUsedGb,
        storageLimitGb: planConfig.storageGbLimit,
        daysRemaining,
      },
    };
  }

  /**
   * 2. LẤY DANH SÁCH LỊCH SỬ HÓA ĐƠN THANH TOÁN THUÊ BAO
   */
  async getInvoices(orgId: string) {
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    if (invoices.length === 0) {
      // Khởi tạo 1 hóa đơn mẫu để người dùng đối soát
      const currentSub = await this.getCurrentSubscription(orgId);
      const plan = SUBSCRIPTION_PLANS_BACKEND[currentSub.plan];

      const initialInvoice = await this.prisma.subscriptionInvoice.create({
        data: {
          organizationId: orgId,
          code: `INV-${orgId.slice(0, 6).toUpperCase()}-01`,
          planCode: plan.code,
          planName: plan.name,
          amountVnd: plan.priceVnd,
          billingMonths: 1,
          paymentMethod: 'VietQR',
          status: 'SUCCESS',
          paidAt: new Date(currentSub.startedAt),
          periodStart: new Date(currentSub.startedAt),
          periodEnd: new Date(currentSub.expiresAt),
          taxNote: 'Hóa đơn VAT điện tử hợp lệ phục vụ khấu trừ thuế TNDN',
        },
      });

      return [initialInvoice];
    }

    return invoices;
  }

  /**
   * 3. ĐĂNG KÝ / NÂNG CẤP / GIA HẠN GÓI DỊCH VỤ
   */
  async subscribe(orgId: string, dto: SubscribePlanDto): Promise<SubscriptionResponse> {
    const plan = SUBSCRIPTION_PLANS_BACKEND[dto.planCode];
    if (!plan) {
      throw new BadRequestException(`Mã gói không hợp lệ: ${dto.planCode}`);
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp hợp lệ');
    }

    const now = new Date();
    const isYearly = dto.billingCycle === 'YEARLY';
    const billingMonths = isYearly ? 12 : 1;
    const durationDays = isYearly ? 365 : 30;
    const finalAmountVnd = isYearly ? Math.round(plan.priceVnd * 12 * 0.85) : plan.priceVnd;

    // Nếu gói hiện tại còn hạn và cùng gói -> cộng thêm chu kỳ vào ngày hết hạn
    let newExpiresAt = new Date(now.getTime() + durationDays * 86400 * 1000);
    if (org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) > now && org.subscriptionPlan === dto.planCode) {
      newExpiresAt = new Date(new Date(org.subscriptionExpiresAt).getTime() + durationDays * 86400 * 1000);
    }

    const invoiceCode = `SUB-${Date.now().toString().slice(-6)}`;

    // Thực hiện trong Transaction an toàn
    await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật gói cho Organization
      await tx.organization.update({
        where: { id: orgId },
        data: {
          subscriptionPlan: dto.planCode,
          subscriptionStatus: 'ACTIVE',
          subscriptionStartedAt: now,
          subscriptionExpiresAt: newExpiresAt,
          subscriptionNextBillingAt: newExpiresAt,
          currentBillingCycleStart: now,
          aiQueriesUsedThisMonth: 0,
          docAnalysesUsedThisMonth: 0,
        },
      });

      // 2. Tạo hóa đơn thanh toán Subscription
      await tx.subscriptionInvoice.create({
        data: {
          organizationId: orgId,
          code: invoiceCode,
          planCode: plan.code,
          planName: plan.name,
          amountVnd: finalAmountVnd,
          billingMonths,
          paymentMethod: dto.paymentMethod || 'VietQR',
          status: 'SUCCESS',
          paidAt: now,
          periodStart: now,
          periodEnd: newExpiresAt,
          taxNote:
            dto.note ||
            `Kích hoạt ${plan.name} (${isYearly ? '12 tháng - Tiết kiệm 15%' : '30 ngày'}) qua ${dto.paymentMethod || 'VietQR'} thành công`,
        },
      });
    });

    return this.getCurrentSubscription(orgId);
  }

  /**
   * 4. BẬT / TẮT TỰ ĐỘNG GIA HẠN
   */
  async toggleAutoRenew(orgId: string, autoRenew: boolean) {
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { autoRenew },
      select: { autoRenew: true },
    });
    return updated;
  }

  /**
   * 5. HỦY TỰ ĐỘNG GIA HẠN
   */
  async cancelSubscription(orgId: string) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { autoRenew: false },
    });
    return { success: true, message: 'Đã hủy tự động gia hạn thành công. Gói dịch vụ vẫn có hiệu lực đến hết chu kỳ hiện tại.' };
  }

  /**
   * 6. KIỂM TRA QUYỀN TRUY CẬP TÍNH NĂNG (FEATURE GATE)
   */
  async assertFeatureAccess(orgId: string, featureKey: keyof PlanFeatureConfig['features']) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionPlan: true, subscriptionStatus: true, subscriptionExpiresAt: true },
    });

    if (!org) {
      throw new NotFoundException('Doanh nghiệp không tồn tại');
    }

    if (org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) < new Date()) {
      throw new ForbiddenException('Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn gói để tiếp tục sử dụng tính năng này.');
    }

    const planCode = (org.subscriptionPlan as SubscriptionPlanCode) || 'STARTER';
    const plan = SUBSCRIPTION_PLANS_BACKEND[planCode] || SUBSCRIPTION_PLANS_BACKEND.STARTER;

    if (!plan.features[featureKey]) {
      throw new ForbiddenException(
        `Tính năng này yêu cầu gói cao cấp hơn (Gói hiện tại: ${plan.name}). Vui lòng nâng cấp gói để mở khóa.`
      );
    }

    return true;
  }

  /**
   * 7. TIÊU THỤ HẠN MỨC AI CHATBOX
   */
  async consumeAiQuota(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        subscriptionPlan: true,
        aiQueriesUsedThisMonth: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!org) return;

    if (org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) < new Date()) {
      throw new ForbiddenException(
        'Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn gói để tiếp tục sử dụng Trợ lý AI.',
      );
    }

    const planCode = (org.subscriptionPlan as SubscriptionPlanCode) || 'STARTER';
    const plan = SUBSCRIPTION_PLANS_BACKEND[planCode] || SUBSCRIPTION_PLANS_BACKEND.STARTER;

    if (org.aiQueriesUsedThisMonth >= plan.aiChatboxMonthlyLimit) {
      throw new ForbiddenException(
        `Doanh nghiệp của bạn đã sử dụng hết hạn mức ${plan.aiChatboxMonthlyLimit} câu hỏi AI trong tháng này. Vui lòng nâng cấp gói hoặc chờ chu kỳ tháng tiếp theo.`,
      );
    }

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { aiQueriesUsedThisMonth: { increment: 1 } },
    });
  }

  /**
   * 8. TIÊU THỤ HẠN MỨC PHÂN TÍCH HỒ SƠ
   */
  async consumeDocAnalysisQuota(orgId: string, count = 1) {
    const step = Math.max(1, Math.round(count));
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        subscriptionPlan: true,
        docAnalysesUsedThisMonth: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!org) return;

    if (org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) < new Date()) {
      throw new ForbiddenException(
        'Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn gói để tiếp tục phân tích hồ sơ.',
      );
    }

    const planCode = (org.subscriptionPlan as SubscriptionPlanCode) || 'STARTER';
    const plan = SUBSCRIPTION_PLANS_BACKEND[planCode] || SUBSCRIPTION_PLANS_BACKEND.STARTER;

    if (org.docAnalysesUsedThisMonth >= plan.docAnalysisMonthlyLimit || org.docAnalysesUsedThisMonth + step > plan.docAnalysisMonthlyLimit) {
      throw new ForbiddenException(
        `Doanh nghiệp của bạn đã sử dụng hết hạn mức ${plan.docAnalysisMonthlyLimit} lượt phân tích hồ sơ trong tháng. Vui lòng nâng cấp gói để tiếp tục.`,
      );
    }

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { docAnalysesUsedThisMonth: { increment: step } },
    });
  }

  /**
   * 9. KIỂM TRA DUNG LƯỢNG LƯU TRỮ CÒN TRỐNG TRƯỚC KHI TẢI BẰNG CHỨNG
   */
  async assertStorageAvailable(orgId: string, incomingBytes = 0) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
        evidenceDocuments: { select: { fileSize: true } },
      },
    });

    if (!org) return true;

    if (org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) < new Date()) {
      throw new ForbiddenException(
        'Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn gói để tiếp tục tải lên hồ sơ & bằng chứng.',
      );
    }

    const planCode = (org.subscriptionPlan as SubscriptionPlanCode) || 'STARTER';
    const plan = SUBSCRIPTION_PLANS_BACKEND[planCode] || SUBSCRIPTION_PLANS_BACKEND.STARTER;
    const limitBytes = plan.storageGbLimit * 1024 * 1024 * 1024;
    const usedBytes = (org.evidenceDocuments || []).reduce(
      (sum, d) => sum + this.parseFileSizeToBytes(d.fileSize),
      0,
    );

    if (usedBytes + Math.max(0, incomingBytes) > limitBytes) {
      throw new ForbiddenException(
        `Dung lượng lưu trữ đã đạt giới hạn ${plan.storageGbLimit} GB của ${plan.name}. Vui lòng xóa bớt tệp cũ hoặc nâng cấp gói để mở rộng dung lượng.`,
      );
    }

    return true;
  }
}
