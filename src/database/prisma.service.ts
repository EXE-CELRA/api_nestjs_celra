import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Chuẩn hóa chuỗi kết nối PostgreSQL cho Prisma Client:
 * - Đặt connection_limit = 50 (hoặc theo DB_CONNECTION_LIMIT) và pool_timeout = 30s.
 * - Nếu phát hiện Supabase Supavisor đang ở cổng 5432 (Session Mode bị khóa cứng trần 15 clients
 *   gây lỗi EMAXCONNSESSION), tự động chuyển runtime sang cổng 6543 (Transaction Mode hỗ trợ 200+ clients)
 *   kèm pgbouncer=true mà không cần sửa trực tiếp file .env (giữ nguyên .env cho prisma cli / migrations).
 */
function resolvePooledDatabaseUrl(rawUrl?: string): { url?: string; modeNote: string } {
  if (!rawUrl) {
    return { url: undefined, modeNote: 'default-env' };
  }

  const targetLimit = process.env.DB_CONNECTION_LIMIT?.trim() || '50';
  const targetPoolTimeout = process.env.DB_POOL_TIMEOUT?.trim() || '30';
  const forceSessionMode = process.env.DB_FORCE_SESSION_MODE === 'true';

  try {
    const parsed = new URL(rawUrl);
    const isSupabasePooler = parsed.hostname.endsWith('.pooler.supabase.com');
    let switchedToTransactionMode = false;

    if (isSupabasePooler && !forceSessionMode && (parsed.port === '5432' || !parsed.port)) {
      parsed.port = '6543';
      parsed.searchParams.set('pgbouncer', 'true');
      switchedToTransactionMode = true;
    } else if (parsed.port === '6543' && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }

    parsed.searchParams.set('connection_limit', targetLimit);
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', targetPoolTimeout);
    }
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '15');
    }

    const modeNote = switchedToTransactionMode
      ? `Supabase Transaction Mode (:6543, pgbouncer=true, connection_limit=${targetLimit}, pool_timeout=${targetPoolTimeout}s)`
      : `Pool configured (port=${parsed.port || '5432'}, connection_limit=${targetLimit}, pool_timeout=${targetPoolTimeout}s)`;

    return { url: parsed.toString(), modeNote };
  } catch {
    // Fallback an toàn bằng nối chuỗi nếu mật khẩu chứa ký tự chưa URL-encode
    let patched = rawUrl;
    const isSupabasePooler = patched.includes('.pooler.supabase.com');
    if (isSupabasePooler && !forceSessionMode && patched.includes('.pooler.supabase.com:5432/')) {
      patched = patched.replace('.pooler.supabase.com:5432/', '.pooler.supabase.com:6543/');
    }

    const separator = patched.includes('?') ? '&' : '?';
    const extraParams: string[] = [];
    if (patched.includes(':6543/') && !patched.includes('pgbouncer=')) {
      extraParams.push('pgbouncer=true');
    }
    if (!patched.includes('connection_limit=')) {
      extraParams.push(`connection_limit=${targetLimit}`);
    } else {
      patched = patched.replace(/connection_limit=\d+/, `connection_limit=${targetLimit}`);
    }
    if (!patched.includes('pool_timeout=')) {
      extraParams.push(`pool_timeout=${targetPoolTimeout}`);
    }
    if (!patched.includes('connect_timeout=')) {
      extraParams.push('connect_timeout=15');
    }

    const finalUrl = extraParams.length > 0 ? `${patched}${separator}${extraParams.join('&')}` : patched;
    return {
      url: finalUrl,
      modeNote: `Fallback URL parser (connection_limit=${targetLimit}, pool_timeout=${targetPoolTimeout}s)`,
    };
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly poolModeNote: string;

  constructor() {
    const { url, modeNote } = resolvePooledDatabaseUrl(process.env.DATABASE_URL);
    super({
      ...(url ? { datasources: { db: { url } } } : {}),
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
    this.poolModeNote = modeNote;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log(`✅ Đã kết nối thành công đến PostgreSQL qua Prisma Client [${this.poolModeNote}]`);
    } catch (error) {
      this.logger.error('❌ Lỗi kết nối đến PostgreSQL:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Đã ngắt kết nối PostgreSQL Prisma Client');
  }
}
