import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Yêu cầu xác thực tài khoản');
    }

    // Kiểm tra role admin hoặc cờ isSuperAdmin
    if (user.role === UserRole.admin || user.role === 'admin' || user.isSuperAdmin) {
      return true;
    }

    throw new ForbiddenException(
      'Truy cập bị từ chối: Chỉ Quản Trị Viên Hệ Thống (Super Admin) mới có quyền truy cập khu vực này',
    );
  }
}
