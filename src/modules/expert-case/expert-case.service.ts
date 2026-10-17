import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateExpertCaseDto, SubmitQuoteDto, SubmitConclusionDto } from './dto/expert-case.dto';
import { ExpertCaseStatus, TaskStatus, TimelineEventType, UserRole, WaitingOnRole, PaymentStatus } from '@prisma/client';

@Injectable()
export class ExpertCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  async create(orgId: string, userId: string, dto: CreateExpertCaseDto) {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ liên kết');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Kế toán dịch vụ';

    const caseCode = `EXP-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo bản ghi ExpertCase
      const expertCase = await tx.expertCase.create({
        data: {
          organizationId: orgId,
          taskId: dto.taskId,
          code: caseCode,
          taskTitle: task.title,
          reason: dto.reason,
          specialtyCategory: dto.specialtyCategory,
          sharedDataSummary: dto.sharedDataSummary || [],
          sharedDocIds: dto.sharedDocIds || [],
          status: ExpertCaseStatus.pending_owner_approval,
        },
      });

      // 2. Cập nhật trạng thái Task sang need_expert & chờ Chủ DN duyệt
      await tx.task.update({
        where: { id: dto.taskId },
        data: {
          status: TaskStatus.need_expert,
          waitingOnRole: WaitingOnRole.owner,
          waitingOnName: 'Chủ doanh nghiệp phê duyệt chuyển Chuyên gia',
          timeline: {
            create: {
              title: 'Đề xuất chuyển Chuyên gia / Luật sư',
              description: `Lý do: ${dto.reason}. Chuyên mục: ${dto.specialtyCategory}`,
              actorId: userId,
              actorName,
              actorRole: user?.role || UserRole.service_accountant,
              type: TimelineEventType.escalation,
            },
          },
        },
      });

      return expertCase;
    });
  }

  async findAll(orgId: string) {
    return this.prisma.expertCase.findMany({
      where: { organizationId: orgId },
      include: {
        task: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const expertCase = await this.prisma.expertCase.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!expertCase) {
      throw new NotFoundException('Không tìm thấy ca tư vấn chuyên gia');
    }

    return expertCase;
  }

  async submitQuote(id: string, userId: string, dto: SubmitQuoteDto) {
    const expertCase = await this.prisma.expertCase.findUnique({ where: { id } });
    if (!expertCase) {
      throw new NotFoundException('Không tìm thấy ca tư vấn');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const expertName = dto.expertName || user?.name || 'Luật sư Hoàng Nam';

    return this.prisma.expertCase.update({
      where: { id },
      data: {
        quoteAmount: dto.quoteAmount,
        quoteNotes: dto.quoteNotes,
        expertId: userId,
        expertName,
        status: ExpertCaseStatus.quoted,
      },
    });
  }

  async approveQuoteAndEscrow(id: string, userId: string) {
    const expertCase = await this.prisma.expertCase.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!expertCase) {
      throw new NotFoundException('Không tìm thấy ca tư vấn');
    }

    if (!expertCase.quoteAmount || expertCase.quoteAmount <= 0) {
      throw new BadRequestException('Chưa có báo giá hợp lệ từ chuyên gia');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Chủ doanh nghiệp';

    // 1. Thực hiện Tạm giữ (Hold) tiền cọc từ ví doanh nghiệp
    await this.walletService.hold(
      expertCase.organizationId,
      expertCase.quoteAmount,
      expertCase.taskTitle,
      actorName,
    );

    // 2. Cập nhật trạng thái ExpertCase & Task
    return this.prisma.$transaction(async (tx) => {
      const updatedCase = await tx.expertCase.update({
        where: { id },
        data: {
          clientApproved: true,
          status: ExpertCaseStatus.in_consultation,
        },
      });

      await tx.task.update({
        where: { id: expertCase.taskId },
        data: {
          isPaidTask: true,
          paidTaskCost: expertCase.quoteAmount,
          paymentStatus: PaymentStatus.held,
          waitingOnRole: WaitingOnRole.expert,
          waitingOnName: expertCase.expertName || 'Chuyên gia / Luật sư phụ trách',
          timeline: {
            create: {
              title: 'Chủ doanh nghiệp phê duyệt ký quỹ ví thành công',
              description: `Đã tạm giữ ${(expertCase.quoteAmount ?? 0).toLocaleString()}đ từ Ví CELRA. Hồ sơ đã được chuyển giao cho ${expertCase.expertName}`,
              actorId: userId,
              actorName,
              actorRole: UserRole.owner,
              type: TimelineEventType.payment,
            },
          },
        },
      });

      return updatedCase;
    });
  }

  async submitConclusionAndCapture(id: string, userId: string, dto: SubmitConclusionDto) {
    const expertCase = await this.prisma.expertCase.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!expertCase) {
      throw new NotFoundException('Không tìm thấy ca tư vấn');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const expertName = expertCase.expertName || user?.name || 'Luật sư';

    // 1. Thực hiện Quyết toán (Capture) tiền từ ví cho Chuyên gia
    if (expertCase.quoteAmount && expertCase.quoteAmount > 0) {
      await this.walletService.capture(
        expertCase.organizationId,
        expertCase.quoteAmount,
        expertCase.taskTitle,
        expertName,
      );
    }

    // 2. Cập nhật hoàn tất ExpertCase và Task
    return this.prisma.$transaction(async (tx) => {
      const updatedCase = await tx.expertCase.update({
        where: { id },
        data: {
          expertFeedback: dto.expertFeedback,
          paidAmount: expertCase.quoteAmount,
          status: ExpertCaseStatus.completed,
        },
      });

      await tx.task.update({
        where: { id: expertCase.taskId },
        data: {
          status: TaskStatus.completed,
          paymentStatus: PaymentStatus.captured,
          waitingOnRole: WaitingOnRole.none,
          waitingOnName: 'Hoàn thành tư vấn chuyên gia',
          timeline: {
            create: {
              title: 'Chuyên gia nộp kết luận tư vấn & Quyết toán giao dịch',
              description: `Kết luận: ${dto.expertFeedback}. Đã quyết toán ${(expertCase.quoteAmount || 0).toLocaleString()}đ`,
              actorId: userId,
              actorName: expertName,
              actorRole: UserRole.expert,
              type: TimelineEventType.verification,
            },
          },
        },
      });

      return updatedCase;
    });
  }
}
