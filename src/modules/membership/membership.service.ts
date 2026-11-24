import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { InviteMemberDto, UpdateMemberDto } from './dto/membership.dto';
import { MembershipStatus, UserRole } from '@prisma/client';
import { EmailService } from '../auth/email.service';

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async invite(orgId: string, dto: InviteMemberDto) {
    // Chặn tuyệt đối leo thang đặc quyền lên Super Admin qua endpoint mời thành viên
    if (dto.role === UserRole.admin) {
      throw new ForbiddenException('Không được phép gán vai trò Quản trị hệ thống');
    }

    // Kiểm tra departmentId (nếu có) phải thuộc đúng doanh nghiệp orgId
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: orgId },
      });
      if (!dept) {
        throw new BadRequestException('Phòng ban không thuộc doanh nghiệp hiện tại');
      }
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    let temporaryPassword: string | null = null;
    if (!user) {
      // Sinh mật khẩu tạm ngẫu nhiên an toàn (CSPRNG 12 ký tự) thay cho mật khẩu cứng yếu
      temporaryPassword = crypto.randomBytes(9).toString('base64url');
      const randomPasswordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: randomPasswordHash,
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
        organization: {
          select: {
            name: true,
          },
        },
      },
    });

    // Cập nhật member count cho department nếu có
    if (dto.departmentId) {
      await this.prisma.department.update({
        where: { id: dto.departmentId },
        data: { memberCount: { increment: 1 } },
      });
    }

    // Gửi email chứa mật khẩu tạm ngẫu nhiên cho tài khoản mới tạo
    if (temporaryPassword) {
      const orgName = membership.organization?.name || 'Doanh nghiệp CELRA';
      await this.emailService
        .sendMemberInviteEmail(normalizedEmail, dto.name || 'Thành viên mới', orgName, temporaryPassword)
        .catch(() => false);
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

  async update(membershipId: string, orgId: string, dto: UpdateMemberDto) {
    if (dto.role === UserRole.admin) {
      throw new ForbiddenException('Không được phép gán vai trò Quản trị hệ thống');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy thành viên trong tổ chức');
    }

    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: orgId },
      });
      if (!dept) {
        throw new BadRequestException('Phòng ban không thuộc doanh nghiệp hiện tại');
      }
    }

    return this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.roleTitle !== undefined && { roleTitle: dto.roleTitle }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      },
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

  async remove(membershipId: string, orgId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy thành viên');
    }

    if (membership.departmentId) {
      await this.prisma.department.updateMany({
        where: { id: membership.departmentId, organizationId: orgId, memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      });
    }

    return this.prisma.membership.delete({ where: { id: membershipId } });
  }
}
