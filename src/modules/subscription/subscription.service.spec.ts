import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../database/prisma.service';
import { SUBSCRIPTION_PLANS_BACKEND } from '../../common/constants/subscription-plans.constant';

describe('SubscriptionService (12 Mandatory Business Scenarios)', () => {
  let service: SubscriptionService;

  const mockOrg = {
    id: 'org-sub-test-1',
    name: 'Công ty Cổ phần Thương Mại Celra Test',
    taxCode: '0398765432',
    subscriptionPlan: 'STARTER',
    subscriptionStatus: 'ACTIVE',
    subscriptionStartedAt: new Date('2026-02-01'),
    subscriptionExpiresAt: new Date(Date.now() + 20 * 86400 * 1000),
    subscriptionNextBillingAt: new Date(Date.now() + 20 * 86400 * 1000),
    aiQueriesUsedThisMonth: 10,
    docAnalysesUsedThisMonth: 5,
    currentBillingCycleStart: new Date('2026-02-01'),
    autoRenew: true,
    evidenceDocuments: [
      { fileSize: 1024 * 1024 * 500 }, // 500MB
    ],
  };

  const mockPrisma: any = {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscriptionInvoice: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  // Scenario 1: Doanh nghiệp chưa có gói -> Tự động khởi tạo chu kỳ mặc định
  it('1. Doanh nghiệp mới chưa có gói: tự động khởi tạo gói ban đầu hợp lệ', async () => {
    const uninitializedOrg = {
      ...mockOrg,
      subscriptionPlan: null,
      subscriptionStartedAt: null,
      subscriptionExpiresAt: null,
    };
    mockPrisma.organization.findUnique.mockResolvedValueOnce(uninitializedOrg);
    mockPrisma.organization.update.mockResolvedValueOnce({
      ...uninitializedOrg,
      subscriptionPlan: 'PROFESSIONAL',
      subscriptionStatus: 'ACTIVE',
      subscriptionStartedAt: new Date(),
      subscriptionExpiresAt: new Date(Date.now() + 30 * 86400 * 1000),
    });

    const res = await service.getCurrentSubscription('org-sub-test-1');
    expect(res.plan).toBe('PROFESSIONAL');
    expect(res.status).toBe('ACTIVE');
    expect(res.usage.daysRemaining).toBeGreaterThan(0);
    expect(mockPrisma.organization.update).toHaveBeenCalled();
  });

  // Scenario 2: Đăng ký gói Starter (699.000 VNĐ)
  it('2. Doanh nghiệp đăng ký gói Starter: kích hoạt đúng giá 699.000đ và hạn mức 100 câu AI', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockPrisma.organization.update.mockResolvedValue({
      ...mockOrg,
      subscriptionPlan: 'STARTER',
    });
    mockPrisma.subscriptionInvoice.create.mockResolvedValue({
      id: 'inv-1',
      code: 'SUB-123456',
      amountVnd: 699000,
    });

    const res = await service.subscribe('org-sub-test-1', {
      planCode: 'STARTER',
      paymentMethod: 'VietQR',
    });

    expect(res.plan).toBe('STARTER');
    expect(res.priceVnd).toBe(699000);
    expect(res.usage.aiChatboxLimit).toBe(100);
  });

  // Scenario 3: Nâng cấp Starter lên Professional (1.599.000 VNĐ)
  it('3. Nâng cấp Starter lên Professional: mở rộng hạn mức lên 500 câu AI và 100 hồ sơ', async () => {
    mockPrisma.organization.findUnique
      .mockResolvedValueOnce({ ...mockOrg, subscriptionPlan: 'STARTER' })
      .mockResolvedValueOnce({ ...mockOrg, subscriptionPlan: 'PROFESSIONAL' });
    mockPrisma.organization.update.mockResolvedValue({
      ...mockOrg,
      subscriptionPlan: 'PROFESSIONAL',
    });
    const res = await service.subscribe('org-sub-test-1', {
      planCode: 'PROFESSIONAL',
      paymentMethod: 'VietQR',
    });

    expect(res.plan).toBe('PROFESSIONAL');
    expect(res.priceVnd).toBe(1599000);
    expect(res.usage.aiChatboxLimit).toBe(500);
    expect(res.usage.docAnalysisLimit).toBe(100);
  });
  // Scenario 4: Nâng cấp Professional lên Enterprise (4.299.000 VNĐ)
  it('4. Nâng cấp lên Enterprise: kích hoạt gói 4.299.000đ với 1.000 câu AI và 30GB lưu trữ', async () => {
    mockPrisma.organization.findUnique
      .mockResolvedValueOnce({ ...mockOrg, subscriptionPlan: 'PROFESSIONAL' })
      .mockResolvedValueOnce({ ...mockOrg, subscriptionPlan: 'ENTERPRISE' });
    mockPrisma.organization.update.mockResolvedValue({
      ...mockOrg,
      subscriptionPlan: 'ENTERPRISE',
    });
    const res = await service.subscribe('org-sub-test-1', {
      planCode: 'ENTERPRISE',
      paymentMethod: 'Sandbox',
    });

    expect(res.plan).toBe('ENTERPRISE');
    expect(res.priceVnd).toBe(4299000);
    expect(res.usage.aiChatboxLimit).toBe(1000);
    expect(res.usage.storageLimitGb).toBe(30);
  });

  // Scenario 5: Gói hết hạn -> Trạng thái EXPIRED và chặn tính năng cao cấp
  it('5. Gói hết hạn: trả về trạng thái EXPIRED và chặn truy cập tính năng nâng cao', async () => {
    const expiredOrg = {
      ...mockOrg,
      subscriptionExpiresAt: new Date(Date.now() - 2 * 86400 * 1000), // Hết hạn 2 ngày trước
    };
    mockPrisma.organization.findUnique.mockResolvedValue(expiredOrg);

    const res = await service.getCurrentSubscription('org-sub-test-1');
    expect(res.status).toBe('EXPIRED');
    expect(res.usage.daysRemaining).toBe(0);

    // Chặn tính năng khi hết hạn
    await expect(service.assertFeatureAccess('org-sub-test-1', 'citLedgerTaxAnalysis')).rejects.toThrow(
      ForbiddenException
    );
  });

  // Scenario 6: Mã gói không hợp lệ -> Ném BadRequestException
  it('6. Đăng ký với mã gói không hợp lệ: ném lỗi BadRequestException ngay lập tức', async () => {
    await expect(
      service.subscribe('org-sub-test-1', {
        planCode: 'INVALID_PACKAGE' as unknown as 'STARTER',
      })
    ).rejects.toThrow(BadRequestException);
  });

  // Scenario 7: Thanh toán thành công -> Tự động sinh bản ghi SubscriptionInvoice
  it('7. Thanh toán thành công: lưu hóa đơn vào bảng subscriptionInvoice để kế toán đối soát', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockPrisma.organization.update.mockResolvedValue(mockOrg);
    mockPrisma.subscriptionInvoice.create.mockResolvedValue({
      id: 'inv-success',
      planCode: 'PROFESSIONAL',
      amountVnd: 1599000,
    });

    await service.subscribe('org-sub-test-1', {
      planCode: 'PROFESSIONAL',
      paymentMethod: 'VietQR',
      note: 'Thanh toán thuê bao qua VietQR',
    });

    expect(mockPrisma.subscriptionInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-sub-test-1',
          planCode: 'PROFESSIONAL',
          amountVnd: 1599000,
          paymentMethod: 'VietQR',
          status: 'SUCCESS',
        }),
      })
    );
  });

  // Scenario 8: Hết hạn mức AI trong tháng -> Chặn gọi tiếp
  it('8. Hết hạn mức AI trong tháng: ném lỗi ForbiddenException cảnh báo người dùng', async () => {
    const maxedAiOrg = {
      ...mockOrg,
      subscriptionPlan: 'STARTER',
      aiQueriesUsedThisMonth: 100, // Đã đạt trần 100 của Starter
    };
    mockPrisma.organization.findUnique.mockResolvedValue(maxedAiOrg);

    await expect(service.consumeAiQuota('org-sub-test-1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  // Scenario 9: Chu kỳ tháng mới -> Tự động reset hạn mức về 0
  it('9. Chu kỳ tháng mới: tự động làm mới bộ đếm sử dụng AI về 0 sau 30 ngày', async () => {
    const oldCycleOrg = {
      ...mockOrg,
      currentBillingCycleStart: new Date(Date.now() - 32 * 86400 * 1000), // Bắt đầu từ 32 ngày trước
      aiQueriesUsedThisMonth: 95,
      docAnalysesUsedThisMonth: 18,
    };
    mockPrisma.organization.findUnique.mockResolvedValue(oldCycleOrg);
    mockPrisma.organization.update.mockResolvedValue({
      ...oldCycleOrg,
      aiQueriesUsedThisMonth: 0,
      docAnalysesUsedThisMonth: 0,
    });

    const res = await service.getCurrentSubscription('org-sub-test-1');
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiQueriesUsedThisMonth: 0,
          docAnalysesUsedThisMonth: 0,
        }),
      })
    );
    expect(res.usage.aiChatboxUsed).toBe(0);
  });

  // Scenario 10: Hủy tự động gia hạn -> autoRenew = false nhưng vẫn còn hạn
  it('10. Hủy tự động gia hạn: đặt autoRenew = false nhưng vẫn bảo lưu quyền sử dụng đến hết hạn', async () => {
    mockPrisma.organization.update.mockResolvedValue({
      ...mockOrg,
      autoRenew: false,
    });

    const res = await service.cancelSubscription('org-sub-test-1');
    expect(res.success).toBe(true);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-sub-test-1' },
      data: { autoRenew: false },
    });
  });

  // Scenario 11: Truy cập tính năng không thuộc gói -> Chặn phân quyền
  it('11. Người dùng Starter gọi tính năng kiểm toán B4 nâng cao: bị chặn và yêu cầu nâng cấp', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      ...mockOrg,
      subscriptionPlan: 'STARTER',
    });

    await expect(service.assertFeatureAccess('org-sub-test-1', 'citLedgerTaxAnalysis')).rejects.toThrow(
      ForbiddenException
    );
  });

  // Scenario 12: Tiêu thụ quota phân tích hồ sơ và chặn khi chạm trần
  it('12. Tiêu thụ hạn mức phân tích hồ sơ: ghi nhận thành công và chặn khi vượt quá quota', async () => {
    mockPrisma.organization.findUnique.mockResolvedValueOnce({
      ...mockOrg,
      subscriptionPlan: 'STARTER',
      docAnalysesUsedThisMonth: 19, // Còn 1 lượt
    });

    await service.consumeDocAnalysisQuota('org-sub-test-1');
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-sub-test-1' },
      data: { docAnalysesUsedThisMonth: { increment: 1 } },
    });

    // Lần tiếp theo khi đã chạm trần 20
    mockPrisma.organization.findUnique.mockResolvedValueOnce({
      ...mockOrg,
      subscriptionPlan: 'STARTER',
      docAnalysesUsedThisMonth: 20,
    });

    await expect(service.consumeDocAnalysisQuota('org-sub-test-1')).rejects.toThrow(ForbiddenException);
  });
});
