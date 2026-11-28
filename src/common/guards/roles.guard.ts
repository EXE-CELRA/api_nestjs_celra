import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

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

    // Ưu tiên kiểm tra vai trò thực tế của người dùng TRONG DOANH NGHIỆP hiện tại (activeMembership.role)
    // thay vì vai trò toàn cục lúc đăng ký tài khoản, chống leo thang đặc quyền chéo công ty
    const effectiveRole: UserRole | undefined = request.activeMembership?.role || user.role;
    if (!effectiveRole) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    const hasRole = requiredRoles.includes(effectiveRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `Yêu cầu một trong các vai trò: ${requiredRoles.join(', ')}. Vai trò hiện tại của bạn trong doanh nghiệp: ${effectiveRole}`,
      );
    }

    return true;
  }
}
