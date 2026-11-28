import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { UserRole, MembershipStatus, Membership } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_ORG_MEMBERSHIP_KEY } from '../decorators/current-user.decorator';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  // Bộ nhớ đệm ngắn hạn (30 giây) giảm tải các truy vấn membership song song trên cùng 1 trang
  private static readonly membershipCache = new Map<string, { membership: Membership; expiresAt: number }>();
  private readonly MEMBERSHIP_CACHE_TTL_MS = 30 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  public static invalidateMembershipCache(orgId: string, userId?: string): void {
    if (userId) {
      OrganizationMembershipGuard.membershipCache.delete(`${orgId}::${userId}`);
      return;
    }
    const prefix = `${orgId}::`;
    for (const key of OrganizationMembershipGuard.membershipCache.keys()) {
      if (key.startsWith(prefix)) {
        OrganizationMembershipGuard.membershipCache.delete(key);
      }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }

      const skipOrgCheck = this.reflector.getAllAndOverride<boolean>(SKIP_ORG_MEMBERSHIP_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (skipOrgCheck) {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      throw new UnauthorizedException('Yêu cầu đăng nhập để truy cập tài nguyên doanh nghiệp');
    }

    // Khóa cửa hậu Web Admin: Quản trị viên hệ thống chỉ làm việc tại /admin/*, không truy cập dữ liệu nội bộ doanh nghiệp
    if (user.role === UserRole.admin || user.isSuperAdmin) {
      throw new ForbiddenException(
        'Tài khoản Quản trị viên hệ thống chỉ quản lý nền tảng chung, không được phép truy cập sổ sách hoặc dữ liệu nội bộ của doanh nghiệp.',
      );
    }

    // Thu thập mọi nguồn định danh doanh nghiệp và chặn tấn công đánh tráo Header vs Body/Query/Param
    const rawHeaderOrgId = request.headers?.['x-organization-id'];
    const headerOrgId = Array.isArray(rawHeaderOrgId) ? rawHeaderOrgId[0] : rawHeaderOrgId;
    const candidateSources = [
      request.params?.orgId,
      request.params?.organizationId,
      request.body?.organizationId,
      request.query?.orgId,
      headerOrgId,
    ]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());

    const uniqueCandidates = Array.from(new Set(candidateSources));
    if (uniqueCandidates.length > 1) {
      throw new ForbiddenException(
        'Phát hiện xung đột định danh doanh nghiệp giữa Header x-organization-id và tham số yêu cầu.',
      );
    }

    let targetOrgId: string | undefined = uniqueCandidates[0];

    // Nếu request không truyền orgId, tự động đối soát doanh nghiệp hợp lệ của người dùng
    if (!targetOrgId) {
      const activeMembership = await this.prisma.membership.findFirst({
        where: {
          userId: user.sub,
          status: MembershipStatus.active,
        },
      });

      if (!activeMembership) {
        throw new ForbiddenException(
          'Yêu cầu xác định doanh nghiệp (Header x-organization-id). Bạn chưa có tư cách thành viên hợp lệ trong doanh nghiệp nào.',
        );
      }

      targetOrgId = activeMembership.organizationId;
    }

    // Kiểm tra membership thực tế trong cơ sở dữ liệu (kết hợp cache ngắn hạn 30s)
    const cacheKey = `${targetOrgId}::${user.sub}`;
    const now = Date.now();
    const cached = OrganizationMembershipGuard.membershipCache.get(cacheKey);

    let membership: Membership | null = null;
    if (cached && cached.expiresAt > now) {
      membership = cached.membership;
    } else {
      membership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: targetOrgId,
            userId: user.sub,
          },
        },
      });

      if (membership && membership.status === MembershipStatus.active) {
        if (OrganizationMembershipGuard.membershipCache.size >= 1000) {
          const oldestKey = OrganizationMembershipGuard.membershipCache.keys().next().value;
          if (oldestKey) {
            OrganizationMembershipGuard.membershipCache.delete(oldestKey);
          }
        }
        OrganizationMembershipGuard.membershipCache.set(cacheKey, {
          membership,
          expiresAt: now + this.MEMBERSHIP_CACHE_TTL_MS,
        });
      } else {
        OrganizationMembershipGuard.membershipCache.delete(cacheKey);
      }
    }

    if (!membership || membership.status !== MembershipStatus.active) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào dữ liệu của doanh nghiệp này (Không có tư cách thành viên hợp lệ).',
      );
    }

    // Gắn thông tin membership đã xác thực vào request và chuẩn hóa lại header để chống giả mạo
    request.activeMembership = membership;
    request.validatedOrgId = targetOrgId;
    if (request.headers) {
      request.headers['x-organization-id'] = targetOrgId;
    }
    return true;
  }
}
