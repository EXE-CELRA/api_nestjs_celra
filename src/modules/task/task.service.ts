import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { getStatutoryHolidaysForYear } from '../../common/utils/tax-calendar.util';
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
  UpdateTaskPriorityDto,
  AddTaskCommentDto,
  SelfCertifyTaskDto,
  CreateCalendarNoteDto,
  UpdateCalendarNoteDto,
} from './dto/task.dto';
import {
  TaskStatus,
  TimelineEventType,
  UserRole,
  WaitingOnRole,
  StatutoryCycleType,
  Priority,
} from '@prisma/client';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  private formatTaskWithPriority(task: any) {
    if (!task) return task;
    const basis = (task.calculationBasisJson as Record<string, any>) || {};
    const customPriority = basis.customPriority || null;
    const statutoryPriority = task.priority;
    const effectivePriority = customPriority || statutoryPriority;

    return {
      ...task,
      priority: effectivePriority,
      customPriority,
      statutoryPriority,
      legalRisk: statutoryPriority,
      customPriorityReason: basis.customPriorityReason || null,
      customPriorityUpdatedAt: basis.customPriorityUpdatedAt || null,
      customPriorityUpdatedBy: basis.customPriorityUpdatedBy || null,
    };
  }

  async create(orgId: string, dto: CreateTaskDto) {
    const departmentId = dto.departmentId;
    let departmentName = 'Phòng ban';
    if (departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (dept) departmentName = dept.name;
    }

    const code = dto.code || `TASK-${Date.now()}`;
    const title = dto.title || 'Nhiệm vụ mới';
    const category = dto.category || 'Chung';
    const rawPriority = String(dto.priority || 'medium').toLowerCase();
    const priority = (rawPriority === 'critical' ? 'urgent' : rawPriority) as Priority;
    const status = dto.status || TaskStatus.need_info;
    const assigneeId = dto.assigneeId;
    const assigneeName = dto.assigneeName || 'Người dùng';
    const assigneeRole = dto.assigneeRole || UserRole.owner;
    const waitingOnRole = dto.waitingOnRole || WaitingOnRole.none;
    const waitingOnName = dto.waitingOnName;
    const dueDate = new Date(dto.dueDate || new Date());
    const description = dto.description || '';
    const ruleCode = dto.ruleCode || 'MANUAL';
    const legalBasis = dto.legalBasis || 'Nội bộ doanh nghiệp';

    const task = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        code,
        title,
        category,
        priority,
        status,
        departmentId,
        departmentName,
        assigneeId,
        assigneeName,
        assigneeRole,
        waitingOnRole,
        waitingOnName,
        dueDate,
        description,
        ruleCode,
        legalBasis,
        timeline: {
          create: {
            title: 'Khởi tạo tác vụ',
            description: `Tác vụ được tạo bởi người dùng`,
            actorName: assigneeName,
            actorRole: assigneeRole,
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

    return this.formatTaskWithPriority(task);
  }

  async findAll(
    orgId: string,
    query?: {
      status?: TaskStatus;
      assigneeRole?: UserRole;
      waitingOnRole?: WaitingOnRole;
      departmentId?: string;
      periodCycle?: StatutoryCycleType;
      checklistId?: string;
    },
  ) {
    if (!orgId) return [];
    const where: Record<string, unknown> = { organizationId: orgId };

    if (query?.status) where.status = query.status;
    if (query?.assigneeRole) where.assigneeRole = query.assigneeRole;
    if (query?.waitingOnRole) where.waitingOnRole = query.waitingOnRole;
    if (query?.departmentId) where.departmentId = query.departmentId;
    if (query?.periodCycle) where.periodCycle = query.periodCycle;
    if (query?.checklistId) where.checklistId = query.checklistId;

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        documents: true,
        checklist: true,
        checklistItem: true,
        comments: {
          orderBy: { createdAt: 'desc' },
        },
        timeline: {
          orderBy: { timestamp: 'desc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return tasks.map((t) => this.formatTaskWithPriority(t));
  }

  async findOne(id: string, orgId?: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        documents: true,
        checklist: true,
        checklistItem: true,
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

    if (orgId && task.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền truy cập tác vụ của doanh nghiệp khác.');
    }

    return this.formatTaskWithPriority(task);
  }

  async updateStatus(id: string, userId: string, dto: UpdateTaskStatusDto, orgId?: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    if (orgId && task.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên tác vụ của doanh nghiệp khác.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';
    const actorRole = user ? user.role : UserRole.owner;

    const targetStatus = dto.status || task.status;
    const targetWaitingOnRole = dto.waitingOnRole !== undefined ? dto.waitingOnRole : task.waitingOnRole;
    const targetWaitingOnName = dto.waitingOnName !== undefined ? dto.waitingOnName : task.waitingOnName;
    const note = dto.note;

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: targetStatus,
        waitingOnRole: targetWaitingOnRole,
        waitingOnName: targetWaitingOnName,
        timeline: {
          create: {
            title: `Chuyển trạng thái sang: ${targetStatus}`,
            description: note || `Trạng thái thay đổi từ ${task.status} ➔ ${targetStatus}`,
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

    return this.formatTaskWithPriority(updated);
  }

  /**
   * Cập nhật Mức độ ưu tiên vận hành (Custom Priority)
   * Tách bạch giữa Rủi ro luật định (Legal Risk / Statutory Priority) và Ưu tiên xử lý của Chủ DN
   */
  async updatePriority(id: string, userId: string, dto: UpdateTaskPriorityDto, orgId?: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    if (orgId && task.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên tác vụ của doanh nghiệp khác.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';
    const actorRole = user ? user.role : UserRole.owner;

    const existingBasis = (task.calculationBasisJson as Record<string, any>) || {};
    const statutoryPriority = task.priority;
    const rawPriority = (dto.priority || 'medium').toLowerCase();
    const newPriority = rawPriority === 'critical' ? 'urgent' : rawPriority;
    const reason = dto.reason?.trim() || '';

    const updatedBasis = {
      ...existingBasis,
      customPriority: newPriority,
      customPriorityReason: reason,
      customPriorityUpdatedAt: new Date().toISOString(),
      customPriorityUpdatedBy: actorName,
    };

    const isDifferentFromStatutory = newPriority !== statutoryPriority;
    const noteText = isDifferentFromStatutory
      ? `Ưu tiên vận hành điều chỉnh thành: ${newPriority.toUpperCase()} (Rủi ro luật định gốc: ${statutoryPriority.toUpperCase()}).${reason ? ' Lý do: ' + reason : ''}`
      : `Khôi phục mức ưu tiên theo rủi ro luật định: ${statutoryPriority.toUpperCase()}.${reason ? ' Lý do: ' + reason : ''}`;

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        calculationBasisJson: updatedBasis,
        timeline: {
          create: {
            title: `Cập nhật mức ưu tiên vận hành: ${newPriority.toUpperCase()}`,
            description: noteText,
            actorId: userId,
            actorName,
            actorRole,
            type: TimelineEventType.status_change,
          },
        },
      },
      include: {
        documents: true,
        checklist: true,
        checklistItem: true,
        comments: { orderBy: { createdAt: 'asc' } },
        timeline: { orderBy: { timestamp: 'asc' } },
      },
    });

    return this.formatTaskWithPriority(updated);
  }

  async addComment(taskId: string, userId: string, dto: AddTaskCommentDto, orgId?: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    if (orgId && task.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên tác vụ của doanh nghiệp khác.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const authorName = user ? user.name : 'Người dùng';
    const authorRole = user ? user.role : UserRole.owner;

    const content = dto.content || '';
    const isInternalOnly = dto.isInternalOnly || false;

    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        authorId: userId,
        authorName,
        authorRole,
        content,
        isInternalOnly,
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
        description: content.length > 80 ? `${content.substring(0, 80)}...` : content,
      },
    });

    return comment;
  }

  async selfCertify(taskId: string, userId: string, dto: SelfCertifyTaskDto, orgId?: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    if (orgId && task.organizationId !== orgId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên tác vụ của doanh nghiệp khác.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Chủ doanh nghiệp';
    const reason = dto.reason;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        isSelfCertifiedNoUpload: true,
        notApplicableReason: reason,
        status: TaskStatus.waiting_verification,
        waitingOnRole: WaitingOnRole.owner,
        waitingOnName: 'Chủ doanh nghiệp',
        timeline: {
          create: {
            title: 'Doanh nghiệp xác nhận tự chịu trách nhiệm (Không tải file)',
            description: reason || 'Cam kết tuân thủ theo quy định hiện hành',
            actorId: userId,
            actorName,
            actorRole: user?.role || UserRole.owner,
            type: TimelineEventType.verification,
          },
        },
      },
    });

    return this.formatTaskWithPriority(updated);
  }

  /**
   * Lấy danh sách các Checklist của tổ chức kèm thống kê tiến độ
   */
  async findAllChecklists(orgId: string) {
    const checklists = await this.prisma.checklist.findMany({
      where: { organizationId: orgId },
      include: {
        items: true,
        tasks: {
          select: {
            id: true,
            status: true,
            dueDate: true,
            priority: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return checklists.map((chk) => {
      const totalTasks = chk.tasks.length;
      const completedTasks = chk.tasks.filter((t) => t.status === TaskStatus.completed).length;
      const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      return {
        id: chk.id,
        code: chk.code,
        title: chk.title,
        category: chk.category,
        status: chk.status,
        itemCount: chk.items.length,
        totalTasks,
        completedTasks,
        progressPercent,
        items: chk.items,
        createdAt: chk.createdAt,
      };
    });
  }

  /**
   * Lấy danh sách ghi chú lịch tuân thủ của tổ chức
   */
  async getCalendarNotes(orgId: string, month?: string) {
    const where: any = { organizationId: orgId };
    if (month) {
      where.date = { startsWith: month };
    }
    return this.prisma.calendarNote.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        author: {
          select: { id: true, name: true, role: true, avatar: true },
        },
      },
    });
  }

  /**
   * Tạo ghi chú lịch mới
   */
  async createCalendarNote(
    orgId: string,
    authorId: string,
    authorName: string,
    dto: CreateCalendarNoteDto,
  ) {
    const date = dto.date || new Date().toISOString().split('T')[0];
    const title = dto.title || 'Ghi chú mới';
    const content = dto.content;
    const category = dto.category || 'general';

    return this.prisma.calendarNote.create({
      data: {
        organizationId: orgId,
        authorId,
        authorName,
        date,
        title,
        content,
        category,
      },
      include: {
        author: {
          select: { id: true, name: true, role: true, avatar: true },
        },
      },
    });
  }

  /**
   * Cập nhật ghi chú lịch
   */
  async updateCalendarNote(
    noteId: string,
    orgId: string,
    dto: UpdateCalendarNoteDto,
  ) {
    const note = await this.prisma.calendarNote.findFirst({
      where: { id: noteId, organizationId: orgId },
    });
    if (!note) {
      throw new NotFoundException('Không tìm thấy ghi chú lịch');
    }

    const date = dto.date !== undefined ? dto.date : note.date;
    const title = dto.title !== undefined ? dto.title : note.title;
    const content = dto.content !== undefined ? dto.content : note.content;
    const category = dto.category !== undefined ? dto.category : note.category;
    const isCompleted = dto.isCompleted !== undefined ? dto.isCompleted : note.isCompleted;

    return this.prisma.calendarNote.update({
      where: { id: noteId },
      data: {
        date,
        title,
        content,
        category,
        isCompleted,
      },
      include: {
        author: {
          select: { id: true, name: true, role: true, avatar: true },
        },
      },
    });
  }

  /**
   * Xóa ghi chú lịch
   */
  async deleteCalendarNote(noteId: string, orgId: string) {
    const note = await this.prisma.calendarNote.findFirst({
      where: { id: noteId, organizationId: orgId },
    });
    if (!note) {
      throw new NotFoundException('Không tìm thấy ghi chú lịch');
    }

    await this.prisma.calendarNote.delete({
      where: { id: noteId },
    });

    return { success: true, message: 'Đã xóa ghi chú lịch' };
  }
  /**
   * Lấy danh mục ngày nghỉ lễ Nhà nước chuẩn theo Bộ luật Lao động và Thông báo CP
   */
  getStatutoryHolidays(year: number) {
    return {
      year,
      holidays: getStatutoryHolidaysForYear(year),
      message: 'Danh mục ngày nghỉ lễ chính thức theo Điều 112 Bộ luật Lao động và quy định quản lý thuế',
    };
  }
}
