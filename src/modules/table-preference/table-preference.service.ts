import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ColumnConfigItemDto } from './dto/table-preference.dto';

@Injectable()
export class TablePreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeScope(orgId?: string): string {
    const trimmed = (orgId || '').trim();
    return trimmed.length > 0 ? trimmed : 'GLOBAL';
  }

  async getPreference(userId: string, orgId: string | undefined, tableKey: string) {
    const organizationScope = this.normalizeScope(orgId);

    const pref = await this.prisma.userTablePreference.findUnique({
      where: {
        userId_organizationScope_tableKey: {
          userId,
          organizationScope,
          tableKey,
        },
      },
    });

    if (!pref && organizationScope !== 'GLOBAL') {
      // Fallback sang cấu hình GLOBAL nếu doanh nghiệp hiện tại chưa có cấu hình riêng
      const globalPref = await this.prisma.userTablePreference.findUnique({
        where: {
          userId_organizationScope_tableKey: {
            userId,
            organizationScope: 'GLOBAL',
            tableKey,
          },
        },
      });
      if (globalPref) {
        return {
          tableKey: globalPref.tableKey,
          organizationScope: globalPref.organizationScope,
          columnsConfig: globalPref.columnsConfig,
          updatedAt: globalPref.updatedAt,
        };
      }
    }

    return {
      tableKey,
      organizationScope,
      columnsConfig: pref ? pref.columnsConfig : [],
      updatedAt: pref ? pref.updatedAt : null,
    };
  }

  async upsertPreference(
    userId: string,
    orgId: string | undefined,
    tableKey: string,
    columnsConfig: ColumnConfigItemDto[],
  ) {
    const organizationScope = this.normalizeScope(orgId);
    const jsonPayload = columnsConfig as unknown as Prisma.InputJsonValue;

    const saved = await this.prisma.userTablePreference.upsert({
      where: {
        userId_organizationScope_tableKey: {
          userId,
          organizationScope,
          tableKey,
        },
      },
      create: {
        userId,
        organizationScope,
        tableKey,
        columnsConfig: jsonPayload,
      },
      update: {
        columnsConfig: jsonPayload,
      },
    });

    return {
      tableKey: saved.tableKey,
      organizationScope: saved.organizationScope,
      columnsConfig: saved.columnsConfig,
      updatedAt: saved.updatedAt,
    };
  }

  async resetPreference(userId: string, orgId: string | undefined, tableKey: string) {
    const organizationScope = this.normalizeScope(orgId);

    await this.prisma.userTablePreference.deleteMany({
      where: {
        userId,
        organizationScope,
        tableKey,
      },
    });

    return {
      tableKey,
      organizationScope,
      columnsConfig: [],
      reset: true,
    };
  }
}
