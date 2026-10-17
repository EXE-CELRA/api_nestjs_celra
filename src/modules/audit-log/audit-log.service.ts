import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAuditLogDto } from './dto/audit-log.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(orgId: string, userId: string, ip: string, dto: CreateAuditLogDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';
    const actorRole = user ? user.role : UserRole.owner;

    return this.prisma.auditEvent.create({
      data: {
        organizationId: orgId,
        actorId: userId,
        actorName,
        actorRole,
        action: dto.action,
        entityType: dto.entityType,
        entityId: dto.entityId,
        previousValue: dto.previousValue,
        newValue: dto.newValue,
        simulatedIp: ip || '127.0.0.1',
        details: dto.details || '',
      },
    });
  }

  async findAll(orgId: string, query?: { entityType?: string; actorId?: string }) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (query?.entityType) where.entityType = query.entityType;
    if (query?.actorId) where.actorId = query.actorId;

    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  }
}
