import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EvidenceDocumentService } from './evidence-document.service';
import { VerifyEvidenceDto, UploadEvidenceDto } from './dto/evidence.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, ValidatedOrgId } from '../../common/decorators/current-user.decorator';

interface TenantRequest extends Request {
  activeMembership?: {
    role?: UserRole;
  };
}

@ApiTags('Evidence & Documents (Bằng chứng số & Thẩm tra)')
@Controller('evidence-documents')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, RolesGuard)
@ApiBearerAuth()
export class EvidenceDocumentController {
  constructor(private readonly evidenceService: EvidenceDocumentService) {}

  @Post('upload')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên chứng từ tuân thủ (Xử lý trên RAM -> Mã hóa AES-256-GCM -> Lưu thẳng lên Supabase Private Cloud)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max trên RAM, 0 byte ghi xuống ổ đĩa máy chủ
    }),
  )
  async uploadFile(
    @ValidatedOrgId() orgId: string,
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEvidenceDto,
  ) {
    const finalCategory = dto.category || dto.documentType || 'Chứng từ tuân thủ';
    const finalTaskId = dto.taskId;
    const finalTag = dto.tag || (dto.category?.includes('Thuế') ? 'Thuế TNDN' : 'Tài liệu chung');
    const finalQuarter = dto.quarter;
    const finalYear = dto.year;
    const finalTitle = dto.title;

    return this.evidenceService.saveFile(
      orgId,
      userId,
      file,
      finalCategory,
      finalTaskId,
      finalTag,
      finalQuarter,
      finalYear,
      dto.metadata,
      finalTitle,
    );
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy kho lưu trữ tất cả bằng chứng số của Doanh nghiệp' })
  async findAll(
    @ValidatedOrgId() orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.evidenceService.findAll(orgId, userId);
  }

  @Get(':id')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy chi tiết bằng chứng số theo ID' })
  async findOne(
    @Param('id') id: string,
    @ValidatedOrgId() orgId: string,
  ) {
    return this.evidenceService.findOne(id, orgId);
  }

  @Get(':id/download')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tải về tệp bằng chứng số (Giải mã AES-256-GCM & kiểm tra toàn vẹn SHA-256)' })
  async downloadFile(
    @Param('id') id: string,
    @Res() res: Response,
    @ValidatedOrgId() orgId: string,
  ) {
    const fileInfo = await this.evidenceService.getFileForDownload(id, orgId);
    const encodedName = encodeURIComponent(fileInfo.fileName);
    const asciiFallback = fileInfo.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');

    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader('Content-Length', String(fileInfo.buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (fileInfo.sha256Checksum) {
      res.setHeader('X-Evidence-SHA256', fileInfo.sha256Checksum);
    }
    return res.send(fileInfo.buffer);
  }

  @Patch(':id/verify')
  @Roles(UserRole.owner, UserRole.internal_accountant, UserRole.service_accountant)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Thẩm tra bằng chứng (Chỉ Chủ DN & Kế toán — Khóa bảo toàn sau khi ĐẠT)' })
  async verify(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyEvidenceDto,
    @ValidatedOrgId() orgId: string,
    @Req() req: TenantRequest,
  ) {
    return this.evidenceService.verify(id, userId, dto, orgId, req.activeMembership?.role);
  }
}
