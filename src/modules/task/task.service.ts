import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
  AddTaskCommentDto,
  SelfCertifyTaskDto,
} from './dto/task.dto';
import { TaskStatus, TimelineEventType, UserRole, WaitingOnRole } from '@prisma/client';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateTaskDto) {
    let departmentName = 'Phòng ban';
    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (dept) departmentName = dept.name;
    }

    return this.prisma.task.create({
      data: {
        organizationId: orgId,
        code: dto.code,
        title: dto.title,
        category: dto.category,
        priority: dto.priority,
        departmentId: dto.departmentId,
        departmentName,
        assigneeId: dto.assigneeId,
        assigneeName: dto.assigneeName,
        assigneeRole: dto.assigneeRole,
        waitingOnRole: dto.waitingOnRole || WaitingOnRole.none,
        waitingOnName: dto.waitingOnName,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        ruleCode: dto.ruleCode || 'MANUAL',
        legalBasis: dto.legalBasis || 'Nội bộ doanh nghiệp',
        timeline: {
          create: {
            title: 'Khởi tạo tác vụ',
            description: `Tác vụ được tạo bởi người dùng`,
            actorName: dto.assigneeName,
            actorRole: dto.assigneeRole,
            type: TimelineEventType.status_change,
          },
        },
      },
      include: {
        documents: true,
        comments: true,
        timeline: true,
      },
    });
  }

  async findAll(orgId: string, query?: { status?: TaskStatus; assigneeRole?: UserRole; waitingOnRole?: WaitingOnRole; departmentId?: string }) {
    const where: Record<string, unknown> = { organizationId: orgId };

    if (query?.status) where.status = query.status;
    if (query?.assigneeRole) where.assigneeRole = query.assigneeRole;
    if (query?.waitingOnRole) where.waitingOnRole = query.waitingOnRole;
    if (query?.departmentId) where.departmentId = query.departmentId;

    return this.prisma.task.findMany({
      where,
      include: {
        documents: true,
        comments: {
          orderBy: { createdAt: 'desc' },
        },
        timeline: {
          orderBy: { timestamp: 'desc' },
        },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        documents: true,
        comments: {
          orderBy: { createdAt: 'asc' },
        },
        timeline: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    return task;
  }

  async updateStatus(id: string, userId: string, dto: UpdateTaskStatusDto) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';
    const actorRole = user ? user.role : UserRole.owner;

    return this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        waitingOnRole: dto.waitingOnRole !== undefined ? dto.waitingOnRole : task.waitingOnRole,
        waitingOnName: dto.waitingOnName !== undefined ? dto.waitingOnName : task.waitingOnName,
        timeline: {
          create: {
            title: `Chuyển trạng thái sang: ${dto.status}`,
            description: dto.note || `Trạng thái thay đổi từ ${task.status} ➔ ${dto.status}`,
            actorId: userId,
            actorName,
            actorRole,
            type: TimelineEventType.status_change,
          },
        },
      },
      include: {
        documents: true,
        timeline: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async addComment(taskId: string, userId: string, dto: AddTaskCommentDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const authorName = user ? user.name : 'Người dùng';
    const authorRole = user ? user.role : UserRole.owner;

    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        authorId: userId,
        authorName,
        authorRole,
        content: dto.content,
        isInternalOnly: dto.isInternalOnly || false,
      },
    });

    // Thêm vào timeline
    await this.prisma.taskTimelineEvent.create({
      data: {
        taskId,
        actorId: userId,
        actorName: authorName,
        actorRole: authorRole,
        type: TimelineEventType.comment,
        title: 'Bình luận mới',
        description: dto.content.length > 80 ? `${dto.content.substring(0, 80)}...` : dto.content,
      },
    });

    return comment;
  }

  async selfCertify(taskId: string, userId: string, dto: SelfCertifyTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Chủ doanh nghiệp';

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        isSelfCertifiedNoUpload: true,
        notApplicableReason: dto.reason,
        status: TaskStatus.waiting_verification,
        waitingOnRole: WaitingOnRole.service_accountant,
        waitingOnName: 'Kế toán dịch vụ',
        timeline: {
          create: {
            title: 'Doanh nghiệp xác nhận tự chịu trách nhiệm (Không tải file)',
            description: dto.reason || 'Cam kết tuân thủ theo quy định hiện hành',
            actorId: userId,
            actorName,
            actorRole: user?.role || UserRole.owner,
            type: TimelineEventType.verification,
          },
        },
      },
    });
  }
}
