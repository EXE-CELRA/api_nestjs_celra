import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard phân quyền theo vai trò TRONG ĐÚNG DOANH NGHIỆP (req.activeMembership.role).
 * Lưu ý bắt buộc: luôn đặt SAU JwtAuthGuard và OrganizationMembershipGuard trong @UseGuards(...).
 */
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    // Super Admin toàn hệ thống được phép thao tác quản trị
    if (user.role === UserRole.admin || user.isSuperAdmin) {
      return true;
    }

    const membership = request.activeMembership;
    if (!membership || !membership.role) {
      throw new ForbiddenException(
        'Không xác định được vai trò thành viên hợp lệ trong doanh nghiệp hiện tại',
      );
    }

    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Yêu cầu một trong các vai trò trong doanh nghiệp: ${requiredRoles.join(', ')}. Vai trò hiện tại của bạn: ${membership.role}`,
      );
    }

    return true;
  }
}
