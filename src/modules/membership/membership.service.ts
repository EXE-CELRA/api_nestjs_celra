import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { InviteMemberDto, UpdateMemberDto } from './dto/membership.dto';
import { MembershipStatus } from '@prisma/client';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(orgId: string, dto: InviteMemberDto) {
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      // Tạo user mới với mật khẩu mặc định 12345678
      const defaultPasswordHash = await bcrypt.hash('12345678', 10);
      user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: defaultPasswordHash,
          name: dto.name,
          role: dto.role,
          roleTitle: dto.roleTitle || 'Thành viên',
          phone: dto.phone,
        },
      });
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      throw new BadRequestException('Thành viên này đã tham gia doanh nghiệp');
    }

    const membership = await this.prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: dto.role,
        roleTitle: dto.roleTitle || 'Thành viên',
        departmentId: dto.departmentId,
        status: MembershipStatus.active,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            phone: true,
          },
        },
        department: true,
      },
    });

    // Cập nhật member count cho department nếu có
    if (dto.departmentId) {
      await this.prisma.department.update({
        where: { id: dto.departmentId },
        data: { memberCount: { increment: 1 } },
      });
    }

    return membership;
  }

  async findAll(orgId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phone: true,
          },
        },
        department: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(membershipId: string, dto: UpdateMemberDto) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy thành viên trong tổ chức');
    }

    return this.prisma.membership.update({
      where: { id: membershipId },
      data: dto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        department: true,
      },
    });
  }

  async remove(membershipId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy thành viên');
    }

    if (membership.departmentId) {
      await this.prisma.department.update({
        where: { id: membership.departmentId },
        data: { memberCount: { decrement: 1 } },
      });
    }

    return this.prisma.membership.delete({ where: { id: membershipId } });
  }
}
