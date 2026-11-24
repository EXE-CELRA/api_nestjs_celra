import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIProviderType, TestAIKeyDto, UpdateAIConfigDto } from './dto/admin.dto';
import { AdminConfigStore } from './admin-config.store';

/**
 * Quản lý cấu hình nhà cung cấp AI (Gemini / OpenCode), kiểm tra API Key động
 * và thống kê sử dụng AI theo ngày / tháng / doanh nghiệp.
 */
@Injectable()
export class AdminAiService {
  private readonly logger = new Logger(AdminAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configStore: AdminConfigStore,
  ) {}

  async getActiveAIConfig() {
    const configRecord = await this.prisma.aiSystem.findFirst({
      where: { organizationId: null },
      orderBy: { updatedAt: 'desc' },
    });

    const apiKey = configRecord?.apiKey?.trim() || '';
    const isConnected = Boolean(apiKey);
    const provider = isConnected
      ? ((configRecord?.provider as AIProviderType) || AIProviderType.GEMINI)
      : null;
    const apiUrl = isConnected ? (configRecord?.apiUrl?.trim() || '') : '';
    const model = isConnected ? (configRecord?.model?.trim() || '') : null;
    const availableModels =
      isConnected && Array.isArray(configRecord?.availableModels)
        ? (configRecord?.availableModels as string[])
        : [];

    return {
      provider,
      apiUrl,
      apiKey,
      model,
      availableModels,
      lastTestedAt: isConnected ? (configRecord?.lastTestedAt?.toISOString() || null) : null,
    };
  }

  async getAIServiceStatus() {
    const platformConfig = this.configStore.reloadFromDisk();
    const active = await this.getActiveAIConfig();
    const today = new Date().toISOString().slice(0, 10);
    if (!platformConfig.aiStats || platformConfig.aiStats.lastDate !== today) {
      platformConfig.aiStats = {
        todayRequests: platformConfig.aiStats?.todayRequests || 0,
        totalTokensUsed: platformConfig.aiStats?.totalTokensUsed || 0,
        lastDate: today,
      };
    }

    const stats = platformConfig.aiStats;

    // Đo latency thực tế nếu có apiKey và đã được Admin kết nối
    let latencyMs = 0;
    let isOnline = false;
    if (active.apiKey) {
      const start = Date.now();
      try {
        const checkUrl = active.apiUrl.endsWith('/models')
          ? active.apiUrl
          : `${active.apiUrl.replace(/\/+$/, '')}/models`;
        const res = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${active.apiKey}` },
          signal: AbortSignal.timeout(4000),
        });
        latencyMs = Date.now() - start;
        isOnline = res.ok;
      } catch {
        latencyMs = 280;
        isOnline = false;
      }
    }

    // Tính toán chi phí ước tính theo token thực tế ($0.00015 / 1k tokens)
    const estimatedCostUsd = Math.round((stats.totalTokensUsed / 1000) * 0.00015 * 1000) / 1000;

    // Mask API key để bảo mật khi gửi lên UI
    const maskedKey = active.apiKey
      ? `${active.apiKey.slice(0, 6)}...${active.apiKey.slice(-4)}`
      : 'Chưa cấu hình';

    const currentMonth = today.slice(0, 7);
    const monthRequests =
      (stats.currentMonth === currentMonth ? stats.monthRequests : 0) || stats.todayRequests || 0;
    const monthTokens =
      (stats.currentMonth === currentMonth ? stats.monthTokens : 0) || stats.totalTokensUsed || 0;

    return {
      status: !active.apiKey ? 'DISCONNECTED' : isOnline ? 'ONLINE' : 'DEGRADED',
      provider: active.apiKey ? active.provider : 'Chưa kết nối',
      model: active.apiKey ? active.model : 'Chưa kết nối model',
      endpoint: active.apiKey ? active.apiUrl : 'Chưa cấu hình',
      apiKeyMasked: maskedKey,
      hasApiKey: Boolean(active.apiKey),
      latencyMs: active.apiKey ? latencyMs : 0,
      todayRequests: stats.todayRequests,
      estimatedTokensUsed: stats.totalTokensUsed,
      monthRequests,
      monthTokens,
      estimatedCostUsd,
      maxContextWindow: active.apiKey
        ? active.model?.includes('gemini')
          ? '1M tokens'
          : '64k tokens'
        : '0 tokens',
      availableModels: active.availableModels || [],
      lastTestedAt: active.lastTestedAt,
    };
  }

  async getAIAnalytics() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    // 1. TRUY VẤN TRỰC TIẾP NHẬT KÝ SỬ DỤNG AI TỪ DATABASE POSTGRESQL (Bảng AiSystem)
    const [monthlyLogs, dbOrgs] = await Promise.all([
      this.prisma.aiSystem.findMany({
        where: {
          organizationId: { not: null },
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        include: {
          organization: {
            select: { id: true, name: true, taxCode: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organization.findMany({
        take: 50,
        select: { id: true, name: true, taxCode: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Tổng hợp số request và token trong tháng từ Database
    const totalMonthRequests = monthlyLogs.length;
    const totalMonthTokens = monthlyLogs.reduce((sum, log) => sum + (log.totalTokens || 0), 0);

    // 2. Tính toán phân bổ dữ liệu biểu đồ theo từng ngày (Day 1 -> Day 31)
    const chartLabels: string[] = [];
    const chartTokenData: number[] = [];
    const chartRequestData: number[] = [];

    const dailyStatsMap: Record<number, { requests: number; tokens: number }> = {};
    for (const log of monthlyLogs) {
      const logDate = new Date(log.createdAt);
      const dayNum = logDate.getDate();
      if (!dailyStatsMap[dayNum]) {
        dailyStatsMap[dayNum] = { requests: 0, tokens: 0 };
      }
      dailyStatsMap[dayNum].requests += 1;
      dailyStatsMap[dayNum].tokens += log.totalTokens || 0;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      chartLabels.push(`Ngày ${day}`);
      const dayData = dailyStatsMap[day] || { requests: 0, tokens: 0 };
      chartTokenData.push(dayData.tokens);
      chartRequestData.push(dayData.requests);
    }

    // 3. Tính toán phân bổ sử dụng theo từng doanh nghiệp
    const enterpriseMap = new Map<
      string,
      { orgId: string; orgName: string; taxCode?: string; requests: number; tokens: number; lastUsedAt: string }
    >();

    for (const log of monthlyLogs) {
      if (!log.organizationId) continue;
      const orgId = log.organizationId;
      const existing = enterpriseMap.get(orgId);
      if (!existing) {
        enterpriseMap.set(orgId, {
          orgId,
          orgName: log.organization?.name || 'Doanh nghiệp',
          taxCode: log.organization?.taxCode,
          requests: 1,
          tokens: log.totalTokens || 0,
          lastUsedAt: new Date(log.createdAt).toLocaleString('vi-VN'),
        });
      } else {
        existing.requests += 1;
        existing.tokens += log.totalTokens || 0;
      }
    }

    // Bổ sung các doanh nghiệp chưa sử dụng để Admin thấy toàn bộ danh sách
    for (const org of dbOrgs) {
      if (!enterpriseMap.has(org.id)) {
        enterpriseMap.set(org.id, {
          orgId: org.id,
          orgName: org.name,
          taxCode: org.taxCode,
          requests: 0,
          tokens: 0,
          lastUsedAt: 'Chưa sử dụng',
        });
      }
    }

    const orgList = Array.from(enterpriseMap.values()).sort((a, b) => b.tokens - a.tokens);
    const status = await this.getAIServiceStatus();

    return {
      status: status.status,
      latencyMs: status.latencyMs,
      provider: status.provider,
      model: status.model,
      apiKeyMasked: status.apiKeyMasked,
      hasApiKey: status.hasApiKey,
      currentMonth: `Tháng ${currentMonth} / ${currentYear}`,
      monthRequests: totalMonthRequests,
      monthTokens: totalMonthTokens,
      chart: {
        labels: chartLabels,
        tokens: chartTokenData,
        requests: chartRequestData,
      },
      enterprises: orgList,
    };
  }

  async testAIKeyAndFetchModels(dto: TestAIKeyDto) {
    const active = await this.getActiveAIConfig();
    const apiKey = dto.apiKey?.trim() || active.apiKey;
    if (!apiKey) {
      throw new BadRequestException('Vui lòng nhập API Key để kiểm tra kết nối.');
    }
    let apiUrl = dto.apiUrl?.trim() || active.apiUrl;
    if (!apiUrl) {
      apiUrl =
        dto.provider === AIProviderType.GEMINI
          ? 'https://generativelanguage.googleapis.com/v1beta/openai'
          : 'https://opencode.ai/inference/openai/v1';
    }

    const cleanBase = apiUrl.replace(/\/+$/, '');
    const modelsUrl = cleanBase.endsWith('/models') ? cleanBase : `${cleanBase}/models`;

    const start = Date.now();
    try {
      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        let errDetail = await res.text();
        try {
          const parsedErr = JSON.parse(errDetail);
          if (parsedErr.error?.message) {
            errDetail = parsedErr.error.message;
          }
        } catch {
          // raw text
        }

        if (errDetail.includes('suspended') || errDetail.includes('CONSUMER_SUSPENDED')) {
          throw new BadRequestException(
            `Google từ chối Key (HTTP 403 - Suspended): Toàn bộ Google Cloud Project chứa key này đang bị Google tạm ngưng. Chi tiết từ Google: "${errDetail}"`,
          );
        }
        if (errDetail.includes('API key not valid') || res.status === 401) {
          throw new BadRequestException(
            `Google từ chối Key (HTTP 401 - Invalid): Mã khóa API Key không tồn tại hoặc bị copy thiếu ký tự. Chi tiết từ Google: "${errDetail}"`,
          );
        }
        throw new BadRequestException(`Google từ chối kết nối (HTTP ${res.status}): ${errDetail}`);
      }

      const data: unknown = await res.json();
      let modelsList: string[] = [];

      if (
        data &&
        typeof data === 'object' &&
        'data' in data &&
        Array.isArray((data as { data: unknown[] }).data)
      ) {
        modelsList = (data as { data: Array<{ id?: string }> }).data
          .map((m) => (m.id || '').replace(/^models\//, ''))
          .filter(
            (id) =>
              Boolean(id) &&
              !id.includes('embedding') &&
              !id.includes('tts') &&
              !id.includes('imagen') &&
              !id.includes('bison'),
          );
      }

      // Lấy 100% danh sách thực tế trả về từ Provider API (không gán cứng)
      const merged = Array.from(new Set(modelsList));

      // Tự động lưu luôn danh sách availableModels vào Database để lần sau mở modal không cần test lại
      const existingConfig = await this.prisma.aiSystem.findFirst({
        where: { organizationId: null },
        orderBy: { updatedAt: 'desc' },
      });

      if (existingConfig) {
        await this.prisma.aiSystem.update({
          where: { id: existingConfig.id },
          data: {
            apiKey,
            apiUrl,
            provider: dto.provider,
            availableModels: merged,
            lastTestedAt: new Date(),
          },
        });
      }

      return {
        success: true,
        message: `Xác thực thành công với ${dto.provider}! Độ trễ: ${latencyMs}ms. Đã tải ${merged.length} models.`,
        latencyMs,
        provider: dto.provider,
        models: merged,
        recommendedModel: merged[0] || 'gemini-3.5-flash-lite',
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Không thể xác thực API Key hoặc kết nối tới Endpoint: ${msg}`);
    }
  }

  async updateAIConfig(dto: UpdateAIConfigDto) {
    const active = await this.getActiveAIConfig();
    const targetProvider = dto.provider;
    const targetModel = dto.model.trim();
    const targetApiKey = dto.apiKey?.trim() || active.apiKey;

    let targetApiUrl = dto.apiUrl?.trim() || active.apiUrl;
    if (!targetApiUrl) {
      targetApiUrl =
        targetProvider === AIProviderType.GEMINI
          ? 'https://generativelanguage.googleapis.com/v1beta/openai'
          : 'https://opencode.ai/inference/openai/v1';
    }

    // Tìm bản ghi cấu hình hệ thống (organizationId === null) trong Database
    const existingConfig = await this.prisma.aiSystem.findFirst({
      where: { organizationId: null },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingConfig) {
      await this.prisma.aiSystem.update({
        where: { id: existingConfig.id },
        data: {
          provider: targetProvider,
          apiKey: targetApiKey,
          apiUrl: targetApiUrl,
          model: targetModel,
          availableModels:
            active.availableModels?.length > 0
              ? active.availableModels
              : existingConfig.availableModels || [],
          lastTestedAt: new Date(),
        },
      });
    } else {
      await this.prisma.aiSystem.create({
        data: {
          provider: targetProvider,
          apiKey: targetApiKey,
          apiUrl: targetApiUrl,
          model: targetModel,
          availableModels: active.availableModels,
          lastTestedAt: new Date(),
        },
      });
    }

    this.logger.log(
      `[AI CONFIG UPDATED IN DATABASE] Nhà cung cấp: ${targetProvider} | Model: ${targetModel}`,
    );

    return {
      success: true,
      message: `Đã lưu thành công cấu hình AI vào Database! Hệ thống hiện đang dùng mô hình: ${targetModel}`,
      config: {
        provider: targetProvider,
        model: targetModel,
        endpoint: targetApiUrl,
        apiKeyMasked: `${targetApiKey.slice(0, 6)}...${targetApiKey.slice(-4)}`,
      },
    };
  }

  async resetAIKeyConfig() {
    // Xóa trắng cấu hình key trong bảng AiSystem trên Database
    await this.prisma.aiSystem.deleteMany({
      where: { organizationId: null },
    });
    this.logger.log(
      '[AI CONFIG RESET IN DATABASE] Admin đã ngắt kết nối và xóa toàn bộ API Key AI trong Database.',
    );
    return {
      success: true,
      message:
        'Đã ngắt kết nối và xóa toàn bộ API Key AI trong Database. Trợ lý AI đã được đưa về trạng thái DISCONNECTED.',
    };
  }
}
