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

    // Lấy organizationId từ params (:orgId), query, body hoặc header 'x-organization-id'
    let targetOrgId: string | undefined =
      request.params?.orgId ||
      request.params?.organizationId ||
      request.body?.organizationId ||
      request.query?.orgId ||
      request.headers['x-organization-id'];

    // Nếu request không truyền orgId, tự động đối soát doanh nghiệp hợp lệ của người dùng
    if (!targetOrgId) {
      if (user.role === UserRole.admin) {
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
    }
    // Nếu người dùng là admin toàn hệ thống thì có quyền quản trị
    if (user.role === UserRole.admin) {
      request.activeMembership = { role: UserRole.admin, status: MembershipStatus.active };
      request.validatedOrgId = targetOrgId;
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
    return true;
  }
}
