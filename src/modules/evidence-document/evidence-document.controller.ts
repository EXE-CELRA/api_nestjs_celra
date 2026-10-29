import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Headers,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiConsumes } from '@nestjs/swagger';
import { EvidenceDocumentService } from './evidence-document.service';
import { VerifyEvidenceDto, UploadEvidenceDto } from './dto/evidence.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Evidence & Documents (Bằng chứng số & Thẩm tra)')
@Controller('evidence-documents')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
@ApiBearerAuth()
export class EvidenceDocumentController {
  constructor(private readonly evidenceService: EvidenceDocumentService) {}

  @Post('upload')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên tệp đính kèm bằng chứng tuân thủ thật' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = './uploads/evidence';
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
    }),
  )
  async uploadFile(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEvidenceDto,
  ) {
    const finalCategory = dto.category || dto.danhMuc || 'Chứng từ tuân thủ';
    const finalTaskId = dto.taskId || dto.maNhiemVu;
    const finalTag = dto.tag || (dto.category?.includes('Thuế') ? 'Thuế TNDN' : 'Tài liệu chung');
    const finalQuarter = dto.quarter !== undefined ? dto.quarter : dto.quy;
    const finalYear = dto.year !== undefined ? dto.year : dto.nam;
    const finalTitle = dto.title || dto.tenTaiLieu;

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
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.evidenceService.findAll(orgId, userId);
  }

  @Get(':id')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy chi tiết bằng chứng số theo ID' })
  async findOne(
    @Param('id') id: string,
    @Headers('x-organization-id') orgId?: string,
  ) {
    return this.evidenceService.findOne(id, orgId);
  }

  @Get(':id/download')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tải về tệp bằng chứng số' })
  async downloadFile(
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('x-organization-id') orgId?: string,
  ) {
    const fileInfo = await this.evidenceService.getFileForDownload(id, orgId);
    return res.download(fileInfo.absolutePath, fileInfo.fileName);
  }

  @Patch(':id/verify')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Thẩm tra bằng chứng (Xác nhận ĐẠT hoặc TỪ CHỐI kèm lý do)' })
  async verify(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyEvidenceDto,
    @Headers('x-organization-id') orgId?: string,
  ) {
    return this.evidenceService.verify(id, userId, dto, orgId);
  }
}
