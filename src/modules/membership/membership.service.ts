import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { InviteMemberDto, UpdateMemberDto } from './dto/membership.dto';
import { MembershipStatus, UserRole } from '@prisma/client';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(orgId: string, dto: InviteMemberDto) {
    // Chặn leo thang đặc quyền: Không cho phép mời thành viên với vai trò admin hệ thống
    const safeRole = dto.role === UserRole.admin ? UserRole.staff : dto.role;

    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: orgId },
        select: { id: true },
      });
      if (!dept) {
        throw new ForbiddenException('Phòng ban được chọn không thuộc doanh nghiệp hiện tại.');
      }
    }

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
          role: safeRole,
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
        role: safeRole,
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

    OrganizationMembershipGuard.invalidateMembershipCache(orgId, user.id);
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

  async update(membershipId: string, dto: UpdateMemberDto, orgId?: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy thành viên trong tổ chức');
    }

    if (orgId && membership.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa thành viên của doanh nghiệp khác.');
    }

    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: membership.organizationId },
        select: { id: true },
      });
      if (!dept) {
        throw new ForbiddenException('Phòng ban được chọn không thuộc doanh nghiệp hiện tại.');
      }
    }

    const sanitizedDto: UpdateMemberDto = {
      ...dto,
      ...(dto.role === UserRole.admin ? { role: UserRole.staff } : {}),
    };

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: sanitizedDto,
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

    OrganizationMembershipGuard.invalidateMembershipCache(membership.organizationId, membership.userId);
    return updated;
  }

  async remove(membershipId: string, orgId?: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy thành viên');
    }

    if (orgId && membership.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền xóa thành viên của doanh nghiệp khác.');
    }

    if (membership.departmentId) {
      await this.prisma.department.update({
        where: { id: membership.departmentId },
        data: { memberCount: { decrement: 1 } },
      });
    }

    const deleted = await this.prisma.membership.delete({ where: { id: membershipId } });
    OrganizationMembershipGuard.invalidateMembershipCache(membership.organizationId, membership.userId);
    return deleted;
  }
}
