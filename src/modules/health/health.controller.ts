import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('System Health & Diagnostics')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái sức khỏe hệ thống (Liveness & Readiness probe)' })
  @ApiResponse({ status: 200, description: 'Hệ thống và cơ sở dữ liệu hoạt động bình thường' })
  async checkHealth() {
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;

    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'unreachable';
      dbLatencyMs = Date.now() - start;
    }

    const memory = process.memoryUsage();

    return {
      status: dbStatus === 'healthy' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'CELRA Compliance Platform API',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
      },
    };
  }
}
