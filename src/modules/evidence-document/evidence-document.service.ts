import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VerifyEvidenceDto } from './dto/evidence.dto';
import { EvidenceStatus, TaskStatus, TimelineEventType, UserRole, WaitingOnRole, ContextGroup, ContextStatus } from '@prisma/client';
import { existsSync } from 'fs';
import { extname, resolve, basename } from 'path';

@Injectable()
export class EvidenceDocumentService {
  constructor(private readonly prisma: PrismaService) {}

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

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const uploadedBy = user ? user.name : 'Người dùng';
    const uploadedRole = user ? user.role : UserRole.owner;

    let targetOrgId = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({ where: { userId } });
      if (userOrg) targetOrgId = userOrg.organizationId;
    }

    const fileSizeFormatted = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    // Chuẩn bị dữ liệu phân loại Tag, Quý, Năm lưu vào JSON OCR Metadata
    const ocrData: any = {};
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
        organizationId: targetOrgId,
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

    // Nếu có gắn với Task, tự động cập nhật trạng thái Task và thêm vào Timeline
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
  }

  async findAll(orgId?: string, userId?: string) {
    let targetOrgId = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId },
      });
      if (userOrg) {
        targetOrgId = userOrg.organizationId;
      }
    }

    const whereClause: any = {};
    if (targetOrgId) {
      whereClause.organizationId = targetOrgId;
    }

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

  async findOne(id: string) {
    const doc = await this.prisma.evidenceDocument.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!doc) {
      throw new NotFoundException('Không tìm thấy bằng chứng');
    }

    return doc;
  }

  async getFileForDownload(id: string) {
    const doc = await this.prisma.evidenceDocument.findUnique({
      where: { id },
    });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy tài liệu bằng chứng');
    }

    const ext = extname(doc.filePath || '');
    let resolvedPath = doc.filePath;
    if (!existsSync(resolvedPath)) {
      resolvedPath = resolve(process.cwd(), doc.filePath);
    }
    if (!existsSync(resolvedPath)) {
      resolvedPath = resolve(process.cwd(), 'uploads', 'evidence', basename(doc.filePath));
    }
    if (!existsSync(resolvedPath)) {
      throw new NotFoundException('Tệp vật lý không tồn tại trên hệ thống lưu trữ');
    }

    const safeName = doc.name.endsWith(ext) ? doc.name : `${doc.name}${ext}`;
    return {
      absolutePath: resolvedPath,
      fileName: safeName,
      mimeType: doc.fileType || 'application/octet-stream',
    };
  }

  async verify(id: string, userId: string, dto: VerifyEvidenceDto) {
    const doc = await this.prisma.evidenceDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy bằng chứng');
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

    // Cập nhật Task liên kết nếu có
    if (doc.linkedTaskId) {
      if (dto.status === EvidenceStatus.rejected) {
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
      } else if (dto.status === EvidenceStatus.accepted) {
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
