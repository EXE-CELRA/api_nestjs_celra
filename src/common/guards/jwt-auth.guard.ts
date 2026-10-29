import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Yêu cầu cung cấp Access Token hợp lệ');
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = await this.jwtService.verifyAsync(token);

      // Kiểm tra tài khoản người dùng có còn tồn tại trong DB không
      // Nếu tài khoản đã bị xóa khỏi hệ thống thì chặn ngay lập tức và trả về 401
      if (payload.sub !== 'admin-virtual-system-id') {
        const dbUser = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true },
        });
        if (!dbUser) {
          throw new UnauthorizedException('Tài khoản đã bị xóa hoặc không còn tồn tại trên hệ thống');
        }
      }

      request.user = payload;
      request.organizationId = request.headers['x-organization-id'] || payload.organizationId;
      return true;
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
  }
}
