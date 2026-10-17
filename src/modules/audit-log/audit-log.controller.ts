import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { CreateAuditLogDto } from './dto/audit-log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Audit Log (Nhật ký Kiểm toán Bất biến)')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditService: AuditLogService) {}

  @Post()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Ghi nhận nhật ký hành động' })
  async log(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
    @Body() dto: CreateAuditLogDto,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.auditService.log(orgId, userId, ip, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiOperation({ summary: 'Tra cứu toàn bộ lịch sử kiểm toán của Doanh nghiệp' })
  async findAll(
    @Headers('x-organization-id') orgId: string,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.auditService.findAll(orgId, { entityType, actorId });
  }
}
