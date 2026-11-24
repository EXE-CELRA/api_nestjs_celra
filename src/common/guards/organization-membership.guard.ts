import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserRole, MembershipStatus } from '@prisma/client';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      throw new UnauthorizedException('Yêu cầu đăng nhập để truy cập tài nguyên doanh nghiệp');
    }

    // Thu thập tất cả các nguồn organizationId hợp lệ (TUYỆT ĐỐI không đọc params.id chung chung)
    const rawHeaderOrgId = request.headers?.['x-organization-id'];
    const headerOrgIds = Array.isArray(rawHeaderOrgId) ? rawHeaderOrgId : [rawHeaderOrgId];
    const rawSources: unknown[] = [
      request.params?.orgId,
      request.params?.organizationId,
      request.body?.organizationId,
      request.query?.orgId,
      ...headerOrgIds,
    ];

    const distinctOrgIds = new Set<string>();
    for (const source of rawSources) {
      if (typeof source === 'string') {
        const trimmed = source.trim();
        if (trimmed.length > 0) {
          distinctOrgIds.add(trimmed);
        }
      }
    }

    // Chống Parameter Shadowing / Conflict Bypass (VD: ?orgId=OrgA kèm header x-organization-id: OrgB)
    if (distinctOrgIds.size > 1) {
      throw new ForbiddenException(
        'Phát hiện xung đột mã doanh nghiệp (organizationId) giữa các tham số yêu cầu.',
      );
    }

    let targetOrgId: string | undefined =
      distinctOrgIds.size === 1 ? Array.from(distinctOrgIds)[0] : undefined;

    // Chỉ tự động đối soát doanh nghiệp mặc định khi client hoàn toàn KHÔNG truyền bất kỳ orgId nào
    if (!targetOrgId) {
      if (user.role === UserRole.admin || user.isSuperAdmin) {
        request.activeMembership = { role: UserRole.admin, status: MembershipStatus.active };
        return true;
      }

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
      request.headers['x-organization-id'] = targetOrgId;
      request.activeMembership = activeMembership;
      request.validatedOrgId = targetOrgId;
      return true;
    }

    // Nếu người dùng là admin toàn hệ thống thì có quyền quản trị và vẫn gán validatedOrgId nhất quán
    if (user.role === UserRole.admin || user.isSuperAdmin) {
      request.activeMembership = { role: UserRole.admin, status: MembershipStatus.active };
      request.validatedOrgId = targetOrgId;
      request.headers['x-organization-id'] = targetOrgId;
      return true;
    }

    // Kiểm tra membership thực tế trong cơ sở dữ liệu
    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: targetOrgId,
          userId: user.sub,
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.active) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào dữ liệu của doanh nghiệp này (Không có tư cách thành viên hợp lệ).',
      );
    }

    // Gắn thông tin membership đã xác thực vào request để controller/service tái sử dụng
    request.activeMembership = membership;
    request.validatedOrgId = targetOrgId;
    request.headers['x-organization-id'] = targetOrgId;
    return true;
  }
}
