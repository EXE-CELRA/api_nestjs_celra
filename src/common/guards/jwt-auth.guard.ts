import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

interface JwtPayloadShape {
  sub: string;
  email?: string;
  role?: string;
  name?: string;
  organizationId?: string;
  isSuperAdmin?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  // Bộ nhớ đệm ngắn hạn (60 giây) tránh bắn hàng chục câu query user.findUnique lặp lại mỗi giây
  private readonly activeUserCache = new Map<string, number>();
  private readonly USER_CACHE_TTL_MS = 60 * 1000;

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

    // Bước 1: Xác thực chữ ký & hạn JWT (chỉ lỗi ở bước này mới là 401 hết hạn/sai token)
    let payload: JwtPayloadShape;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayloadShape>(token);
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Bước 2: Kiểm tra tài khoản người dùng có còn tồn tại trong DB không
    // Nếu tài khoản đã bị xóa khỏi hệ thống thì chặn ngay lập tức và trả về 401.
    // Nếu DB tạm thời quá tải/mất kết nối -> trả về 503 để KHÔNG đá nhầm người dùng ra màn hình đăng nhập.
    if (payload.sub !== 'admin-virtual-system-id') {
      const now = Date.now();
      const cachedExpiry = this.activeUserCache.get(payload.sub);

      if (!cachedExpiry || cachedExpiry <= now) {
        let dbUser: { id: string } | null = null;
        try {
          dbUser = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true },
          });
        } catch (dbErr: unknown) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          this.logger.error(`Lỗi kết nối DB khi kiểm tra phiên người dùng (${payload.sub}): ${msg}`);
          throw new ServiceUnavailableException(
            'Hệ thống cơ sở dữ liệu đang bận xử lý, vui lòng thử lại sau giây lát',
          );
        }

        if (!dbUser) {
          this.activeUserCache.delete(payload.sub);
          throw new UnauthorizedException('Tài khoản đã bị xóa hoặc không còn tồn tại trên hệ thống');
        }

        if (this.activeUserCache.size >= 1000) {
          const oldestKey = this.activeUserCache.keys().next().value;
          if (oldestKey) {
            this.activeUserCache.delete(oldestKey);
          }
        }
        this.activeUserCache.set(payload.sub, now + this.USER_CACHE_TTL_MS);
      }
    }

    request.user = payload;
    request.organizationId = request.headers['x-organization-id'] || payload.organizationId;
    return true;
  }
}
