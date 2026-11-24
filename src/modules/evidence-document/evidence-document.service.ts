import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VerifyEvidenceDto } from './dto/evidence.dto';
import { EvidenceStatus, TaskStatus, TimelineEventType, UserRole, WaitingOnRole, MembershipStatus } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { extname, resolve, basename, relative, isAbsolute } from 'path';
import { validateFileMagicBytes } from '../../common/utils/file-magic-bytes.util';

@Injectable()
export class EvidenceDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  private cleanupUploadedFile(file?: Express.Multer.File) {
    if (file?.path && existsSync(file.path)) {
      try {
        unlinkSync(file.path);
      } catch {
        // Bỏ qua lỗi khi xóa file tạm
      }
    }
  }

  async saveFile(
    orgId: string,
    userId: string,
    file: Express.Multer.File,
    category?: string,
    taskId?: string,
    tag?: string,
    quarter?: string | number,
    year?: string | number,
    metadata?: any,
    title?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file cần tải lên');
    }

    try {
      if (!orgId) {
        throw new ForbiddenException('Không tìm thấy doanh nghiệp hợp lệ để lưu trữ bằng chứng');
      }

      // Kiểm tra chữ ký nhị phân (Magic Bytes) khớp đúng đuôi tệp trước khi lưu DB
      const ext = extname(file.filename || file.originalname).toLowerCase();
      validateFileMagicBytes(file.path, ext);

      // Kiểm tra quyền sở hữu taskId TRƯỚC khi ghi DB để chặn cross-tenant IDOR và dọn sạch file tạm nếu lỗi
      if (taskId) {
        const linkedTask = await this.prisma.task.findFirst({
          where: { id: taskId, organizationId: orgId },
          select: { id: true },
        });
        if (!linkedTask) {
          throw new ForbiddenException(
            'Tác vụ liên kết không tồn tại hoặc không thuộc doanh nghiệp hiện tại.',
          );
        }
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const uploadedBy = user ? user.name : 'Người dùng';
      const uploadedRole = user ? user.role : UserRole.owner;

      const fileSizeFormatted = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

      // Chuẩn bị dữ liệu phân loại Tag, Quý, Năm lưu vào JSON OCR Metadata
      const ocrData: any = {};
      if (category) ocrData.documentType = category;
      if (tag) ocrData.tag = tag;
      if (quarter) ocrData.quarter = quarter === 'ALL' ? 'ALL' : Number(quarter);
      if (year) ocrData.year = Number(year);
      if (quarter && year) {
        ocrData.period = quarter === 'ALL' ? `Cả năm ${year}` : `Quý ${quarter}/${year}`;
      }
      if (metadata) {
        try {
          const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
          Object.assign(ocrData, parsed);
        } catch {}
      }

      const docName = title || file.originalname;

      const doc = await this.prisma.evidenceDocument.create({
        data: {
          organizationId: orgId,
          linkedTaskId: taskId,
          name: docName,
          category: category || tag || 'Chứng từ tuân thủ',
          fileType: file.mimetype,
          fileSize: fileSizeFormatted,
          filePath: file.path,
          fileUrl: `/uploads/${file.filename}`,
          uploadedBy,
          uploadedRole,
          status: EvidenceStatus.unverified,
          ocrExtractedData: ocrData,
        },
      });

      // Nếu có gắn với Task (đã xác minh thuộc đúng orgId), cập nhật trạng thái Task và thêm vào Timeline
      if (taskId) {
        await this.prisma.task.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.waiting_verification,
            waitingOnRole: WaitingOnRole.service_accountant,
            waitingOnName: 'Kế toán dịch vụ',
            timeline: {
              create: {
                title: 'Tải lên bằng chứng mới',
                description: `Đã đính kèm tệp ${docName} (${fileSizeFormatted}). Chờ kế toán dịch vụ đối chiếu`,
                actorId: userId,
                actorName: uploadedBy,
                actorRole: uploadedRole,
                type: TimelineEventType.upload,
              },
            },
          },
        });
      }

      return {
        ...doc,
        title: doc.name,
        fileName: file.originalname,
        tag: ocrData.tag || doc.category,
        quarter: ocrData.quarter,
        year: ocrData.year,
        period: ocrData.period,
      };
    } catch (err) {
      this.cleanupUploadedFile(file);
      throw err;
    }
  }

  async findAll(orgId?: string, userId?: string) {
    let targetOrgId: string | undefined = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId, status: MembershipStatus.active },
      });
      if (userOrg) {
        targetOrgId = userOrg.organizationId;
      }
    }

    if (!targetOrgId) {
      return []; // KHÔNG QUERY DB NẾU THIẾU ORG HỢP LỆ!
    }

    const whereClause: any = { organizationId: targetOrgId };

    const docs = await this.prisma.evidenceDocument.findMany({
      where: whereClause,
      include: {
        task: {
          select: {
            id: true,
            code: true,
            title: true,
            category: true,
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return docs.map((doc) => {
      const ocr = (doc.ocrExtractedData as any) || {};
      const quarterVal = ocr.quarter;
      const yearVal = ocr.year;
      const periodVal = ocr.period || (quarterVal && yearVal ? (quarterVal === 'ALL' ? `Cả năm ${yearVal}` : `Quý ${quarterVal}/${yearVal}`) : undefined);

      return {
        ...doc,
        title: doc.name,
        fileName: doc.name,
        documentType: ocr.documentType || doc.category,
        category: doc.category,
        tag: ocr.tag || doc.category,
        quarter: quarterVal,
        year: yearVal,
        period: periodVal,
        verificationStatus: doc.status === 'accepted' ? 'VERIFIED' : (doc.status === 'rejected' ? 'REJECTED' : 'PENDING'),
        createdAt: doc.uploadedAt,
      };
    });
  }

  async findOne(id: string, orgId?: string) {
    const doc = await this.prisma.evidenceDocument.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!doc) {
      throw new NotFoundException('Không tìm thấy bằng chứng');
    }

    if (!orgId || doc.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền truy cập vào chứng từ của doanh nghiệp khác.');
    }

    return doc;
  }

  async getFileForDownload(id: string, orgId?: string) {
    const doc = await this.prisma.evidenceDocument.findUnique({
      where: { id },
    });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy tài liệu bằng chứng');
    }

    if (!orgId || doc.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền tải chứng từ của doanh nghiệp khác.');
    }

    const baseDir = resolve(process.cwd(), 'uploads', 'evidence');
    const ext = extname(doc.filePath || '');
    let resolvedPath = resolve(process.cwd(), doc.filePath || '');
    if (!existsSync(resolvedPath)) {
      resolvedPath = resolve(baseDir, basename(doc.filePath || ''));
    }

    // Chống Path Traversal bằng path.relative (an toàn cả trên Windows drive case & sibling dirs)
    const rel = relative(baseDir, resolvedPath);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new ForbiddenException('Đường dẫn tệp chứng từ không nằm trong vùng lưu trữ hợp lệ.');
    }

    if (!existsSync(resolvedPath)) {
      throw new NotFoundException('Tệp vật lý không tồn tại trên hệ thống lưu trữ');
    }

    const cleanBaseName = basename(doc.name || 'chung-tu').replace(/[\r\n"\\/:*?<>|]+/g, '_');
    const safeName = cleanBaseName.endsWith(ext) ? cleanBaseName : `${cleanBaseName}${ext}`;
    return {
      absolutePath: resolvedPath,
      fileName: safeName,
      mimeType: doc.fileType || 'application/octet-stream',
    };
  }

  async verify(id: string, userId: string, dto: VerifyEvidenceDto, orgId?: string) {
    const doc = await this.prisma.evidenceDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy bằng chứng');
    }

    if (!orgId || doc.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền thẩm tra chứng từ của doanh nghiệp khác.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người thẩm định';
    const actorRole = user ? user.role : UserRole.service_accountant;

    const updatedDoc = await this.prisma.evidenceDocument.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.status === EvidenceStatus.rejected ? dto.rejectionReason : null,
      },
    });

    // Cập nhật Task liên kết nếu có (xác minh thuộc đúng doanh nghiệp)
    if (doc.linkedTaskId) {
      const linkedTask = await this.prisma.task.findFirst({
        where: { id: doc.linkedTaskId, organizationId: doc.organizationId },
        select: { id: true },
      });
      if (linkedTask && dto.status === EvidenceStatus.rejected) {
        await this.prisma.task.update({
          where: { id: doc.linkedTaskId },
          data: {
            status: TaskStatus.need_info,
            waitingOnRole: WaitingOnRole.owner,
            waitingOnName: 'Chủ doanh nghiệp / Người phụ trách',
            timeline: {
              create: {
                title: 'Bằng chứng bị từ chối thẩm tra',
                description: `Lý do từ chối: ${dto.rejectionReason || 'Chưa đạt yêu cầu quy định'}`,
                actorId: userId,
                actorName,
                actorRole,
                type: TimelineEventType.verification,
              },
            },
          },
        });
      } else if (linkedTask && dto.status === EvidenceStatus.accepted) {
        await this.prisma.task.update({
          where: { id: doc.linkedTaskId },
          data: {
            status: TaskStatus.completed,
            waitingOnRole: WaitingOnRole.none,
            waitingOnName: 'Hoàn thành',
            timeline: {
              create: {
                title: 'Bằng chứng đã được xác nhận ĐẠT',
                description: `Tác vụ được xác nhận hoàn tất tuân thủ theo quy định`,
                actorId: userId,
                actorName,
                actorRole,
                type: TimelineEventType.verification,
              },
            },
          },
        });
      }
    }

    return updatedDoc;
  }
}
