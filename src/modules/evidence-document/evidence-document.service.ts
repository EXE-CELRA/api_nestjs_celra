import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VerifyEvidenceDto } from './dto/evidence.dto';
import { EvidenceStatus, TaskStatus, TimelineEventType, UserRole, WaitingOnRole } from '@prisma/client';

@Injectable()
export class EvidenceDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async saveFile(
    orgId: string,
    userId: string,
    file: Express.Multer.File,
    category?: string,
    taskId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file cần tải lên');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const uploadedBy = user ? user.name : 'Người dùng';
    const uploadedRole = user ? user.role : UserRole.owner;

    const fileSizeFormatted = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    const doc = await this.prisma.evidenceDocument.create({
      data: {
        organizationId: orgId,
        linkedTaskId: taskId,
        name: file.originalname,
        category: category || 'Chứng từ tuân thủ',
        fileType: file.mimetype,
        fileSize: fileSizeFormatted,
        filePath: file.path,
        fileUrl: `/uploads/${file.filename}`,
        uploadedBy,
        uploadedRole,
        status: EvidenceStatus.unverified,
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
              description: `Đã đính kèm tệp ${file.originalname} (${fileSizeFormatted}). Chờ kế toán dịch vụ đối chiếu`,
              actorId: userId,
              actorName: uploadedBy,
              actorRole: uploadedRole,
              type: TimelineEventType.upload,
            },
          },
        },
      });
    }

    return doc;
  }

  async findAll(orgId: string) {
    return this.prisma.evidenceDocument.findMany({
      where: { organizationId: orgId },
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
