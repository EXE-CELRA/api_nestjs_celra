import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AIProviderType, UpdatePlatformSettingsDto } from './dto/admin.dto';

export interface PlatformPackage {
  id: string;
  name: string;
  priceVnd: number;
  credits: number;
  bonusCredits: number;
  badge: string;
}

export interface PlatformConfig {
  bankId: string;
  accountNo: string;
  accountName: string;
  creditRate: number;
  auditCost: number;
  freeTierCredits: number;
  suspendedOrgIds: string[];
  lastSyncAt: string | null;
  dlplApiKey?: string;
  dlplApiUrl?: string;
  aiProvider?: {
    provider: AIProviderType;
    apiKey: string;
    apiUrl: string;
    model: string;
    availableModels?: string[];
    lastTestedAt?: string;
  };
  aiStats?: {
    todayRequests: number;
    totalTokensUsed: number;
    lastDate: string;
    // Dữ liệu theo tháng
    currentMonth?: string; // YYYY-MM
    monthRequests?: number;
    monthTokens?: number;
    // Diễn biến theo ngày trong tháng (key là YYYY-MM-DD: { requests, tokens })
    dailyUsage?: Record<string, { requests: number; tokens: number }>;
    // Phân bổ theo từng doanh nghiệp (key là orgId: { orgId, orgName, taxCode, requests, tokens, lastUsedAt })
    orgUsage?: Record<
      string,
      {
        orgId: string;
        orgName: string;
        taxCode?: string;
        requests: number;
        tokens: number;
        lastUsedAt: string;
      }
    >;
  };
  packages: PlatformPackage[];
}

/**
 * Quản lý cấu hình persistent (JSON Storage: data/platform-settings.json)
 * cho toàn bộ phân hệ Admin.
 */
@Injectable()
export class AdminConfigStore {
  private readonly logger = new Logger(AdminConfigStore.name);
  private readonly configFilePath = path.join(process.cwd(), 'data', 'platform-settings.json');
  private platformConfig: PlatformConfig;

  constructor() {
    this.platformConfig = this.loadFromDisk();
  }

  getConfig(): PlatformConfig {
    return this.platformConfig;
  }

  reloadFromDisk(): PlatformConfig {
    this.platformConfig = this.loadFromDisk();
    return this.platformConfig;
  }

  save(): void {
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.platformConfig, null, 2), 'utf8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi lưu file cấu hình admin: ${msg}`);
    }
  }

  getSettings() {
    return {
      bankId: this.platformConfig.bankId,
      accountNo: this.platformConfig.accountNo,
      accountName: this.platformConfig.accountName,
      creditRate: this.platformConfig.creditRate,
      auditCost: this.platformConfig.auditCost,
      freeTierCredits: this.platformConfig.freeTierCredits,
    };
  }

  updateSettings(dto: UpdatePlatformSettingsDto) {
    if (dto.bankId !== undefined) this.platformConfig.bankId = dto.bankId;
    if (dto.accountNo !== undefined) this.platformConfig.accountNo = dto.accountNo;
    if (dto.accountName !== undefined) this.platformConfig.accountName = dto.accountName;
    if (dto.creditRate !== undefined) this.platformConfig.creditRate = dto.creditRate;
    if (dto.auditCost !== undefined) this.platformConfig.auditCost = dto.auditCost;
    if (dto.freeTierCredits !== undefined) this.platformConfig.freeTierCredits = dto.freeTierCredits;

    this.save();

    return {
      success: true,
      message: 'Đã lưu thành công cấu hình tham số nền tảng CELRA',
      settings: this.getSettings(),
    };
  }

  recordAITokenUsage(tokens: number): void {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.platformConfig.aiStats || this.platformConfig.aiStats.lastDate !== today) {
      this.platformConfig.aiStats = {
        todayRequests: 1,
        totalTokensUsed: tokens,
        lastDate: today,
      };
    } else {
      this.platformConfig.aiStats.todayRequests += 1;
      this.platformConfig.aiStats.totalTokensUsed += tokens;
    }
    this.save();
  }

  private loadFromDisk(): PlatformConfig {
    const defaultConfig: PlatformConfig = {
      bankId: 'MB',
      accountNo: '0987654321',
      accountName: 'CONG TY CP CONG NGHE CELRA VIET NAM',
      creditRate: 2000,
      auditCost: 25,
      freeTierCredits: 100,
      suspendedOrgIds: [],
      lastSyncAt: new Date().toISOString(),
      packages: [
        {
          id: 'starter',
          name: 'Gói Khởi Động',
          priceVnd: 100000,
          credits: 50,
          bonusCredits: 0,
          badge: 'Cơ Bản',
        },
        {
          id: 'standard',
          name: 'Gói Tiêu Chuẩn',
          priceVnd: 200000,
          credits: 100,
          bonusCredits: 20,
          badge: 'Khuyên Dùng',
        },
        {
          id: 'enterprise',
          name: 'Gói Doanh Nghiệp',
          priceVnd: 500000,
          credits: 300,
          bonusCredits: 150,
          badge: 'Tiết Kiệm Nhất',
        },
      ],
    };

    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf8');
        return { ...defaultConfig, ...JSON.parse(raw) };
      }

      fs.writeFileSync(this.configFilePath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      return defaultConfig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Lỗi đọc file cấu hình admin: ${msg}. Dùng config mặc định.`);
      return defaultConfig;
    }
  }
}
