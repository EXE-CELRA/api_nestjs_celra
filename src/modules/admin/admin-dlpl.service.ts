import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AIAssistantService } from '../ai-assistant/ai-assistant.service';
import { cleanDLPLUrl } from '../../common/constants/legal-docs.constant';
import { AdminConfigStore } from './admin-config.store';

/**
 * Quản trị kho dữ liệu văn bản pháp luật & kết nối cổng Dữ Liệu Pháp Luật (DLPL).
 */
@Injectable()
export class AdminDlplService {
  private readonly logger = new Logger(AdminDlplService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly configStore: AdminConfigStore,
    @Inject(forwardRef(() => AIAssistantService))
    private readonly aiAssistantService: AIAssistantService,
  ) {}

  async getDLPLQuota() {
    const [totalRules, dlplRes] = await Promise.all([
      this.prisma.rule.count(),
      this.aiAssistantService.getDLPLQuota(),
    ]);

    let totalLimit = 1000;
    let remainingCalls = 1000;
    let usedCalls = 0;

    // Phân tích đúng cấu trúc trả về từ API DLPL: dlplRes.data.quota
    const dlplPayload = dlplRes as {
      data?: { quota?: Record<string, number> };
      quota?: Record<string, number>;
    };
    const quotaObj = dlplPayload?.data?.quota || dlplPayload?.quota;
    if (quotaObj) {
      totalLimit = quotaObj.monthly_limit ?? totalLimit;
      usedCalls = quotaObj.monthly_used ?? (quotaObj.used ?? usedCalls);
      remainingCalls = quotaObj.monthly_remaining ?? (quotaObj.remaining ?? (totalLimit - usedCalls));
    }

    const configRecord = await this.prisma.systemConfig.findUnique({
      where: { key: 'DLPL_CONFIG' },
    });
    const parsedConfig = configRecord ? JSON.parse(configRecord.value) : null;
    const customKey = parsedConfig?.apiKey || '';

    return {
      success: true,
      provider: 'Dữ Liệu Pháp Luật (dulieuphapluat.vn)',
      apiUrl: parsedConfig?.apiUrl || this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1'),
      customApiKey: customKey ? `${customKey.slice(0, 8)}...${customKey.slice(-4)}` : '',
      hasCustomKey: Boolean(customKey),
      totalMonthlyLimit: totalLimit,
      remainingCalls,
      usedCalls,
      usagePercent: Math.round((usedCalls / totalLimit) * 100),
      totalRulesInDb: totalRules,
      lastSyncAt: this.configStore.getConfig().lastSyncAt,
      nextScheduledSync: 'Chu kỳ tự động 15 ngày/lần (Ngày 1 & Ngày 15 hàng tháng)',
    };
  }

  async getDLPLDocumentsPaginated(page: number, limit: number, _query = 'thuế thu nhập doanh nghiệp') {
    const skip = (page - 1) * limit;

    // ĐỌC TRỰC TIẾP TỪ DATABASE POSTGRESQL (Bảng van_ban_phap_luat)
    const [totalInDb, docsInDb] = await Promise.all([
      this.prisma.legalDocument.count({ where: { category: 'TAX_CIT' } }),
      this.prisma.legalDocument.findMany({
        where: { category: 'TAX_CIT' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    if (docsInDb.length > 0) {
      return {
        data: docsInDb.map((d) => ({
          code: d.code,
          name: d.name,
          category: d.category,
          issuedBy: d.issuedBy || 'Cơ quan nhà nước',
          status: d.status,
          effectiveDate: d.effectiveDate || 'Đang áp dụng',
          sourceUrl: cleanDLPLUrl(d.sourceUrl),
        })),
        total: totalInDb,
        page,
        limit,
        hasMore: skip + docsInDb.length < totalInDb,
      };
    }

    return { data: [], total: 0, page, limit };
  }

  async triggerInstantSync(categories?: string[]) {
    this.logger.log(
      `[ADMIN ACTION] Kích hoạt đồng bộ tức thời từ API Dữ Liệu Pháp Luật (Danh mục: ${categories?.join(', ') || 'Tất cả'})...`,
    );
    const syncResult = await this.aiAssistantService.syncLegalRulesFromExternalApi(categories);

    const platformConfig = this.configStore.getConfig();
    platformConfig.lastSyncAt = new Date().toISOString();
    this.configStore.save();

    return {
      success: true,
      message: `Đã kích hoạt và hoàn tất đồng bộ thành công cho các danh mục: ${categories?.join(', ') || 'Tất cả'}!`,
      details: syncResult,
      syncedAt: platformConfig.lastSyncAt,
    };
  }

  async updateDLPLConfig(apiKey: string, apiUrl?: string) {
    const targetKey = apiKey.trim();
    const targetUrl = (apiUrl || this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1')).trim();

    if (!targetKey) {
      throw new BadRequestException('API Key không được để trống.');
    }

    // BƯỚC BẮT BUỘC: Gửi request test trực tiếp lên DLPL để xác minh key hợp lệ
    let testData: {
      data?: { quota?: Record<string, number> };
      quota?: Record<string, number>;
    } | null = null;
    try {
      const testRes = await fetch(`${targetUrl.replace(/\/+$/, '')}/me`, {
        headers: { Authorization: `Bearer ${targetKey}` },
      });

      if (!testRes.ok) {
        const errBody = await testRes.text();
        throw new BadRequestException(
          `Kết nối thất bại (Mã lỗi ${testRes.status}): API Key không hợp lệ hoặc đã hết hạn trên Cổng Dữ Liệu Pháp Luật! Chi tiết: ${errBody.slice(0, 100)}`,
        );
      }

      testData = await testRes.json();
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'Lỗi mạng';
      throw new BadRequestException(`Không thể kết nối đến máy chủ Dữ Liệu Pháp Luật: ${msg}`);
    }

    // Lưu trực tiếp vào Database PostgreSQL (Bảng cau_hinh_he_thong)
    await this.prisma.systemConfig.upsert({
      where: { key: 'DLPL_CONFIG' },
      update: {
        value: JSON.stringify({ apiKey: targetKey, apiUrl: targetUrl }),
      },
      create: {
        key: 'DLPL_CONFIG',
        value: JSON.stringify({ apiKey: targetKey, apiUrl: targetUrl }),
        note: 'API Key Cổng Dữ Liệu Pháp Luật do Admin cấu hình qua Web UI',
      },
    });

    const quota = testData?.data?.quota || testData?.quota;
    const remaining = quota?.monthly_remaining ?? 1000;
    const limit = quota?.monthly_limit ?? 1000;
    const used = quota?.monthly_used ?? 0;

    this.logger.log(
      `[DLPL CONFIG] ✅ Đã xác minh và kết nối thành công API Key DLPL! Còn lại: ${remaining}/${limit} lượt.`,
    );
    return {
      success: true,
      message: `Xác thực thành công! Key hợp lệ, còn lại ${remaining.toLocaleString('vi-VN')} / ${limit.toLocaleString('vi-VN')} lượt gọi trong tháng.`,
      quota: {
        remainingCalls: remaining,
        usedCalls: used,
        totalMonthlyLimit: limit,
      },
    };
  }

  async deleteDLPLConfig() {
    await this.prisma.systemConfig.deleteMany({
      where: { key: 'DLPL_CONFIG' },
    });
    return {
      success: true,
      message: 'Đã xóa API Key Dữ Liệu Pháp Luật tùy chỉnh trong Database, quay về cấu hình .env mặc định',
    };
  }

  async getEffectiveDLPLKeyAsync(): Promise<{ apiKey: string; apiUrl: string }> {
    try {
      const rec = await this.prisma.systemConfig.findUnique({ where: { key: 'DLPL_CONFIG' } });
      if (rec && rec.value) {
        const parsed = JSON.parse(rec.value);
        if (parsed.apiKey) {
          return {
            apiKey: parsed.apiKey.trim(),
            apiUrl: parsed.apiUrl || this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1'),
          };
        }
      }
    } catch {
      // ignore
    }
    return {
      apiKey: '',
      apiUrl: 'https://api.dulieuphapluat.vn/v1',
    };
  }
}
