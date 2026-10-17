import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateEngagementDto, UpdateEngagementDto } from './dto/engagement.dto';

@Injectable()
export class ServiceEngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateEngagementDto) {
    return this.prisma.serviceEngagement.create({
      data: {
        organizationId: orgId,
        firmName: dto.firmName,
        leadName: dto.leadName,
        email: dto.email,
        phone: dto.phone,
        scope: dto.scope,
        outOfScope: dto.outOfScope,
      },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.serviceEngagement.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const engagement = await this.prisma.serviceEngagement.findUnique({
      where: { id },
    });

    if (!engagement) {
      throw new NotFoundException('Không tìm thấy thông tin hợp đồng dịch vụ');
    }

    return engagement;
  }

  async update(id: string, dto: UpdateEngagementDto) {
    const engagement = await this.prisma.serviceEngagement.findUnique({
      where: { id },
    });

    if (!engagement) {
      throw new NotFoundException('Không tìm thấy hợp đồng dịch vụ');
    }

    return this.prisma.serviceEngagement.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const engagement = await this.prisma.serviceEngagement.findUnique({
      where: { id },
    });

    if (!engagement) {
      throw new NotFoundException('Không tìm thấy hợp đồng');
    }

    return this.prisma.serviceEngagement.delete({ where: { id } });
  }
}
