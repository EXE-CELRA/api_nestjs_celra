import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  EnterpriseStatus,
  UpdateEnterpriseStatusDto,
  AdjustCreditDto,
  UpdatePlatformSettingsDto,
  UpdatePackageDto,
  TestAIKeyDto,
  UpdateAIConfigDto,
} from './dto/admin.dto';
import { AdminConfigStore } from './admin-config.store';
import { AdminDlplService } from './admin-dlpl.service';
import { AdminAiService } from './admin-ai.service';
import { AdminFinanceService } from './admin-finance.service';

/**
 * Facade điều phối toàn bộ phân hệ Admin Portal:
 * - Dashboard KPIs & quản trị doanh nghiệp (xử lý trực tiếp tại đây)
 * - Kho luật DLPL -> AdminDlplService
 * - Cấu hình & thống kê AI -> AdminAiService
 * - Tài chính, Credit & báo cáo tuân thủ vĩ mô -> AdminFinanceService
 * - Tham số nền tảng JSON -> AdminConfigStore
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configStore: AdminConfigStore,
    private readonly dlplService: AdminDlplService,
    private readonly aiService: AdminAiService,
    private readonly financeService: AdminFinanceService,
  ) {}

  // ============================================================================
  // 1. TỔNG QUAN CHỈ SỐ SÀN (DASHBOARD STATS)
  // ============================================================================
  async getDashboardStats() {
    const [
      totalEnterprises,
      totalUsers,
      totalTasks,
      totalRules,
      depositTxs,
      spendTxs,
      recentTxs,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count(),
      this.prisma.task.count(),
      this.prisma.rule.count(),
      this.prisma.walletTransaction.findMany({
        where: { type: TransactionType.deposit, status: TransactionStatus.success },
        select: { amount: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { type: TransactionType.capture, status: TransactionStatus.success },
        select: { amount: true },
      }),
      this.prisma.walletTransaction.findMany({
        take: 5,
        orderBy: { timestamp: 'desc' },
        include: {
          wallet: {
            include: {
              organization: {
                select: { name: true, taxCode: true },
              },
            },
          },
        },
      }),
    ]);

    const platformConfig = this.configStore.getConfig();
    const totalRevenueVnd = depositTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const totalCreditsSpent = spendTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const suspendedCount = platformConfig.suspendedOrgIds.length;
    const activeEnterprises = Math.max(0, totalEnterprises - suspendedCount);

    return {
      kpis: {
        totalEnterprises,
        activeEnterprises,
        suspendedEnterprises: suspendedCount,
        totalUsers,
        totalTasks,
        totalRules,
        totalRevenueVnd,
        totalCreditsSpent,
      },
      recentTransactions: recentTxs.map((tx) => ({
        id: tx.id,
        code: tx.code,
        taskName: tx.taskName,
        orgName: tx.wallet?.organization?.name || 'Doanh nghiệp',
        taxCode: tx.wallet?.organization?.taxCode || '',
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
        timestamp: tx.timestamp,
        note: tx.note,
      })),
      lastSyncAt: platformConfig.lastSyncAt,
    };
  }

  // ============================================================================
  // 2. QUẢN TRỊ DOANH NGHIỆP (ENTERPRISES MANAGEMENT)
  // ============================================================================
  async getEnterprises(query: { search?: string; status?: string; industry?: string }) {
    const whereClause: Prisma.OrganizationWhereInput = {};

    if (query.search) {
      const q = query.search.trim();
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { taxCode: { contains: q, mode: 'insensitive' } },
        { representativeName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.industry && query.industry !== 'all') {
      whereClause.industry = { contains: query.industry, mode: 'insensitive' };
    }

    const orgs = await this.prisma.organization.findMany({
      where: whereClause,
      include: {
        wallet: true,
        _count: {
          select: { tasks: true, evidenceDocuments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const suspendedSet = new Set(this.configStore.getConfig().suspendedOrgIds);

    const formatted = orgs.map((org) => {
      const isSuspended = suspendedSet.has(org.id);
      return {
        id: org.id,
        name: org.name,
        taxCode: org.taxCode,
        legalType: org.legalType,
        industry: org.industry,
        businessModel: org.businessModel,
        employeeCount: org.employeeCount,
        operatingYears: org.operatingYears,
        revenueStatus: org.revenueStatus,
        hasOnlineSales: org.hasOnlineSales,
        createdAt: org.createdAt,
        creditBalance: org.wallet?.balance || 0,
        taskCount: org._count.tasks,
        docCount: org._count.evidenceDocuments,
        status: isSuspended ? EnterpriseStatus.SUSPENDED : EnterpriseStatus.ACTIVE,
      };
    });

    if (query.status && query.status !== 'all') {
      return formatted.filter((o) => o.status === query.status);
    }

    return formatted;
  }

  async updateEnterpriseStatus(orgId: string, dto: UpdateEnterpriseStatusDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp');
    }

    const platformConfig = this.configStore.getConfig();
    const set = new Set(platformConfig.suspendedOrgIds);
    if (dto.status === EnterpriseStatus.SUSPENDED) {
      set.add(orgId);
    } else {
      set.delete(orgId);
    }

    platformConfig.suspendedOrgIds = Array.from(set);
    this.configStore.save();

    return {
      success: true,
      message: `Đã cập nhật trạng thái doanh nghiệp "${org.name}" sang ${dto.status}`,
      orgId,
      status: dto.status,
    };
  }

  // ============================================================================
  // 3. KHO LUẬT DLPL (DELEGATED -> AdminDlplService)
  // ============================================================================
  getDLPLQuota() {
    return this.dlplService.getDLPLQuota();
  }

  getDLPLDocumentsPaginated(page: number, limit: number, query = 'thuế thu nhập doanh nghiệp') {
    return this.dlplService.getDLPLDocumentsPaginated(page, limit, query);
  }

  triggerInstantSync(categories?: string[]) {
    return this.dlplService.triggerInstantSync(categories);
  }

  updateDLPLConfig(apiKey: string, apiUrl?: string) {
    return this.dlplService.updateDLPLConfig(apiKey, apiUrl);
  }

  deleteDLPLConfig() {
    return this.dlplService.deleteDLPLConfig();
  }

  getEffectiveDLPLKeyAsync(): Promise<{ apiKey: string; apiUrl: string }> {
    return this.dlplService.getEffectiveDLPLKeyAsync();
  }

  // ============================================================================
  // 3.1. CẤU HÌNH & GIÁM SÁT AI (DELEGATED -> AdminAiService & AdminConfigStore)
  // ============================================================================
  getActiveAIConfig() {
    return this.aiService.getActiveAIConfig();
  }

  getAIServiceStatus() {
    return this.aiService.getAIServiceStatus();
  }

  getAIAnalytics() {
    return this.aiService.getAIAnalytics();
  }

  testAIKeyAndFetchModels(dto: TestAIKeyDto) {
    return this.aiService.testAIKeyAndFetchModels(dto);
  }

  updateAIConfig(dto: UpdateAIConfigDto) {
    return this.aiService.updateAIConfig(dto);
  }

  recordAITokenUsage(tokens: number) {
    return this.configStore.recordAITokenUsage(tokens);
  }

  resetAIKeyConfig() {
    return this.aiService.resetAIKeyConfig();
  }

  // ============================================================================
  // 4 & 5. TÀI CHÍNH & BÁO CÁO TUÂN THỦ VĨ MÔ (DELEGATED -> AdminFinanceService)
  // ============================================================================
  getFinanceOverview() {
    return this.financeService.getFinanceOverview();
  }

  adjustCredit(dto: AdjustCreditDto) {
    return this.financeService.adjustCredit(dto);
  }

  updatePackage(dto: UpdatePackageDto) {
    return this.financeService.updatePackage(dto);
  }

  getComplianceMacroAnalytics() {
    return this.financeService.getComplianceMacroAnalytics();
  }

  // ============================================================================
  // 6. CẤU HÌNH THAM SỐ NỀN TẢNG (DELEGATED -> AdminConfigStore)
  // ============================================================================
  getSettings() {
    return this.configStore.getSettings();
  }

  updateSettings(dto: UpdatePlatformSettingsDto) {
    return this.configStore.updateSettings(dto);
  }
}
