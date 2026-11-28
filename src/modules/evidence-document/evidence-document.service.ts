import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VerifyEvidenceDto } from './dto/evidence.dto';
import { EvidenceVaultService } from './evidence-vault.service';
import { EvidenceStatus, TaskStatus, TimelineEventType, UserRole, WaitingOnRole } from '@prisma/client';
import { extname } from 'path';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class EvidenceDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultService: EvidenceVaultService,
    @Optional() private readonly subscriptionService?: SubscriptionService,
  ) {}

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

    // 1. Kiểm tra Whitelist định dạng kế toán, đối chiếu Magic Bytes thật & băm SHA-256 trên RAM
    const validatedMeta = this.vaultService.validateAndHashFile(file);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const uploadedBy = user ? user.name : 'Người dùng';
    const uploadedRole = user ? user.role : UserRole.owner;

    let targetOrgId: string | undefined = orgId;
    if (targetOrgId && userId) {
      const membership = await this.prisma.membership.findFirst({
        where: { organizationId: targetOrgId, userId },
      });
      if (!membership) {
        targetOrgId = undefined;
      }
    }
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({ where: { userId } });
      if (userOrg) targetOrgId = userOrg.organizationId;
    }
    if (!targetOrgId) {
      throw new BadRequestException('Không tìm thấy doanh nghiệp hợp lệ để lưu trữ bằng chứng');
    }

    if (this.subscriptionService) {
      await this.subscriptionService.assertStorageAvailable(targetOrgId, file.size);
    }

    const fileSizeFormatted = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    // Chuẩn bị dữ liệu phân loại Tag, Quý, Năm + Dấu vân tay bảo mật SHA-256 / AES-256-GCM
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

    ocrData.originalFileName = file.originalname;
    ocrData.sha256Checksum = validatedMeta.sha256Checksum;
    ocrData.encryption = 'AES-256-GCM';
    ocrData.storageProvider = 'SUPABASE';

    const docName = title || file.originalname;

    // Chống IDOR trên linkedTaskId: Chỉ cho phép gắn chứng từ vào Task thuộc cùng doanh nghiệp
    let verifiedTaskId: string | undefined = undefined;
    if (taskId) {
      const linkedTask = await this.prisma.task.findFirst({
        where: { id: taskId, organizationId: targetOrgId },
        select: { id: true },
      });
      if (!linkedTask) {
        throw new ForbiddenException('Không thể gắn chứng từ vào tác vụ không thuộc doanh nghiệp hiện tại.');
      }
      verifiedTaskId = linkedTask.id;
    }

    // 2. Xác định folder cố định của doanh nghiệp trên Supabase theo chuẩn <ten-cong-ty-rut-gon>-<mst>
    // Nếu doanh nghiệp đã từng có folder chuẩn tên-mst trên Supabase thì tái sử dụng để không tách làm 2 folder khi đổi tên
    const [orgInfo, firstCloudDoc] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { name: true, taxCode: true },
      }),
      this.prisma.evidenceDocument.findFirst({
        where: {
          organizationId: targetOrgId,
          filePath: { startsWith: 'supabase://' },
        },
        select: { filePath: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    let fixedCompanyFolder: string | undefined;
    if (firstCloudDoc?.filePath) {
      const parts = firstCloudDoc.filePath.slice('supabase://'.length).split('/');
      // parts[0] = bucket, parts[1] = companyFolder (bỏ qua nếu là folder UUID cũ để nâng cấp sang folder tên-mst)
      const existingFolder = parts[1];
      const isRawUuid = Boolean(
        existingFolder && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingFolder),
      );
      if (existingFolder && !isRawUuid) {
        fixedCompanyFolder = existingFolder;
      }
    }

    // 3. Mã hóa AES-256-GCM trên RAM và đẩy thẳng lên Private Bucket của Supabase Storage (0 byte ghi xuống ổ cứng)
    const cloudStored = await this.vaultService.uploadEncryptedToSupabase(
      targetOrgId,
      file.buffer,
      year,
      {
        companyFolder: fixedCompanyFolder,
        companyName: orgInfo?.name,
        taxCode: orgInfo?.taxCode,
        documentTitle: docName,
      },
    );
    ocrData.companyCloudFolder = cloudStored.companyFolder;

    const doc = await this.prisma.evidenceDocument.create({
      data: {
        organizationId: targetOrgId,
        linkedTaskId: verifiedTaskId,
        name: docName,
        category: category || tag || 'Chứng từ tuân thủ',
        fileType: validatedMeta.normalizedMimeType,
        fileSize: fileSizeFormatted,
        filePath: cloudStored.storageUri,
        fileUrl: null,
        uploadedBy,
        uploadedRole,
        status: EvidenceStatus.unverified,
        ocrExtractedData: ocrData,
      },
    });

    // Nếu có gắn với Task hợp lệ, tự động cập nhật trạng thái Task và thêm vào Timeline
    if (verifiedTaskId) {
      await this.prisma.task.update({
        where: { id: verifiedTaskId },
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
    let targetOrgId: string | undefined = orgId;
    if (targetOrgId && userId) {
      const membership = await this.prisma.membership.findFirst({
        where: { organizationId: targetOrgId, userId },
      });
      if (!membership) {
        targetOrgId = undefined;
      }
    }
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId },
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

      const originalFileName: string = ocr.originalFileName || doc.name;
      return {
        ...doc,
        title: doc.name,
        fileName: originalFileName,
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

    if (orgId && doc.organizationId !== orgId) {
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

    if (orgId && doc.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền tải chứng từ của doanh nghiệp khác.');
    }

    const ocr = (doc.ocrExtractedData as Record<string, unknown>) || {};
    const expectedSha256 = typeof ocr.sha256Checksum === 'string' ? ocr.sha256Checksum : undefined;
    const originalFileName = typeof ocr.originalFileName === 'string' ? ocr.originalFileName : '';

    const plainBuffer = await this.vaultService.retrieveAndVerifyPlainBuffer(
      doc.filePath,
      doc.organizationId,
      expectedSha256,
    );

    const ext = extname(originalFileName || doc.filePath || '');
    const safeExt = ext === '.enc' ? '' : ext;
    const safeName = originalFileName || (safeExt && !doc.name.endsWith(safeExt) ? `${doc.name}${safeExt}` : doc.name);

    return {
      buffer: plainBuffer,
      fileName: safeName,
      mimeType: doc.fileType || 'application/octet-stream',
      sha256Checksum: expectedSha256,
    };
  }

  async verify(
    id: string,
    userId: string,
    dto: VerifyEvidenceDto,
    orgId?: string,
    memberRole?: UserRole,
  ) {
    const doc = await this.prisma.evidenceDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy bằng chứng');
    }

    if (orgId && doc.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền thẩm tra chứng từ của doanh nghiệp khác.');
    }

    // Khóa bảo toàn chứng từ đã duyệt ĐẠT: Chỉ Chủ doanh nghiệp (owner) mới có quyền mở khóa thẩm định lại
    if (doc.status === EvidenceStatus.accepted && memberRole !== UserRole.owner) {
      throw new ForbiddenException(
        'Chứng từ này đã được thẩm định ĐẠT và khóa bảo toàn. Chỉ Chủ doanh nghiệp mới có quyền mở khóa thẩm tra lại.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người thẩm định';
    const actorRole = memberRole || (user ? user.role : UserRole.service_accountant);

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
