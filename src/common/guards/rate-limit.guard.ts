import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../decorators/rate-limit.decorator';

interface RateBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  limit: 120,
  ttlMs: 60 * 1000,
};

/**
 * Native NestJS Rate Limit Guard (0 external dependency, tương thích 100% NestJS v12).
 * - KHÔNG tin header giả mạo như CF-Connecting-IP; dùng req.ip (Express trust proxy: 1).
 * - Ưu tiên định danh theo JWT sub hợp lệ để tránh khóa oan người dùng chung NAT/WiFi.
 */
@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly buckets = new Map<string, RateBucket>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly jwtService?: JwtService,
  ) {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
    if (!isTestEnv) {
      this.cleanupTimer = setInterval(() => this.pruneExpired(), 5 * 60 * 1000);
      if (typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }

  resetStore() {
    this.buckets.clear();
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  private async resolveTracker(request: any): Promise<string> {
    // 1. Nếu JwtAuthGuard đã gắn user.sub -> dùng trực tiếp
    if (request.user?.sub) {
      return `user:${request.user.sub}`;
    }

    // 2. Nếu APP_GUARD chạy trước JwtAuthGuard -> tự xác thực Bearer JWT để định danh theo user
    const authHeader: string | undefined = request.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ') && this.jwtService) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          const payload = await this.jwtService.verifyAsync(token);
          if (payload?.sub) {
            return `user:${payload.sub}`;
          }
        } catch {
          // Token không hợp lệ -> fallback về req.ip
        }
      }
    }

    // 3. Fallback về req.ip (được Express tính an toàn theo trust proxy: 1, TUYỆT ĐỐI không đọc cf-connecting-ip)
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const customOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const options = customOptions || DEFAULT_RATE_LIMIT;

    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest();
    const response = httpCtx.getResponse();

    const tracker = await this.resolveTracker(request);
    const scopeKey = customOptions
      ? `${context.getClass().name}.${context.getHandler().name}`
      : 'global';
    const bucketKey = `${scopeKey}::${tracker}`;

    const now = Date.now();
    let bucket = this.buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 1, resetAt: now + options.ttlMs };
      // Giới hạn kích thước bộ nhớ phòng chống Memory Exhaustion
      if (this.buckets.size > 20000) {
        this.pruneExpired();
      }
      this.buckets.set(bucketKey, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, options.limit - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    if (typeof response?.setHeader === 'function') {
      response.setHeader('X-RateLimit-Limit', String(options.limit));
      response.setHeader('X-RateLimit-Remaining', String(remaining));
    }

    if (bucket.count > options.limit) {
      if (typeof response?.setHeader === 'function') {
        response.setHeader('Retry-After', String(retryAfterSec));
      }
      throw new HttpException(
        'Quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau ít phút.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
