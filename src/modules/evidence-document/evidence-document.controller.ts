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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiConsumes } from '@nestjs/swagger';
import { EvidenceDocumentService } from './evidence-document.service';
import { VerifyEvidenceDto, UploadEvidenceDto } from './dto/evidence.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Evidence & Documents (Bằng chứng số & Thẩm tra)')
@Controller('evidence-documents')
@UseGuards(JwtAuthGuard)
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
    return this.evidenceService.saveFile(orgId, userId, file, dto.category, dto.taskId);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy kho lưu trữ tất cả bằng chứng số của Doanh nghiệp' })
  async findAll(@Headers('x-organization-id') orgId: string) {
    return this.evidenceService.findAll(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết bằng chứng số theo ID' })
  async findOne(@Param('id') id: string) {
    return this.evidenceService.findOne(id);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Thẩm tra bằng chứng (Xác nhận ĐẠT hoặc TỪ CHỐI kèm lý do)' })
  async verify(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyEvidenceDto,
  ) {
    return this.evidenceService.verify(id, userId, dto);
  }
}
