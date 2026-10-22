import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
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
} from '@prisma/client';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  private enrichTaskWithVietnamese(task: any) {
    if (!task) return task;
    return {
      ...task,
      maNhiemVu: task.code,
      tieuDe: task.title,
      danhMuc: task.category,
      doUuTien: task.priority,
      trangThai: task.status,
      hanChot: task.dueDate,
      moTa: task.description,
      canCuPhapLy: task.legalBasis,
      maQuyTac: task.ruleCode,
      tenNguoiXuLy: task.assigneeName,
      vaiTroNguoiXuLy: task.assigneeRole,
      tenNguoiChoDoi: task.waitingOnName,
      vaiTroChoDoi: task.waitingOnRole,
      taoLuc: task.createdAt,
      capNhatLuc: task.updatedAt,
    };
  }

  private enrichCalendarNoteWithVietnamese(note: any) {
    if (!note) return note;
    return {
      ...note,
      ngay: note.date,
      tieuDe: note.title,
      noiDung: note.content,
      danhMuc: note.category,
      daHoanThanh: note.isCompleted,
      taoLuc: note.createdAt,
      capNhatLuc: note.updatedAt,
    };
  }

  async create(orgId: string, dto: CreateTaskDto) {
    const departmentId = dto.maPhongBan || dto.departmentId;
    let departmentName = 'Phòng ban';
    if (departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (dept) departmentName = dept.name;
    }

    const code = dto.maNhiemVu || dto.code || `TASK-${Date.now()}`;
    const title = dto.tieuDe || dto.title || 'Nhiệm vụ mới';
    const category = dto.danhMuc || dto.category || 'Chung';
    const priority = dto.doUuTien || dto.priority || 'medium';
    const assigneeId = dto.maNguoiXuLy || dto.assigneeId;
    const assigneeName = dto.tenNguoiXuLy || dto.assigneeName || 'Người dùng';
    const assigneeRole = dto.vaiTroNguoiXuLy || dto.assigneeRole || UserRole.owner;
    const waitingOnRole = dto.vaiTroChoDoi || dto.waitingOnRole || WaitingOnRole.none;
    const waitingOnName = dto.tenNguoiChoDoi || dto.waitingOnName;
    const dueDate = new Date(dto.hanChot || dto.dueDate || new Date());
    const description = dto.moTa || dto.description || '';
    const ruleCode = dto.maQuyTac || dto.ruleCode || 'MANUAL';
    const legalBasis = dto.canCuPhapLy || dto.legalBasis || 'Nội bộ doanh nghiệp';

    const task = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        code,
        title,
        category,
        priority,
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

    return this.enrichTaskWithVietnamese(task);
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
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });

    return tasks.map((t) => this.enrichTaskWithVietnamese(t));
  }

  async findOne(id: string) {
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

    return this.enrichTaskWithVietnamese(task);
  }

  async updateStatus(id: string, userId: string, dto: UpdateTaskStatusDto) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';
    const actorRole = user ? user.role : UserRole.owner;

    const targetStatus = dto.trangThai || dto.status || task.status;
    const targetWaitingOnRole = dto.vaiTroChoDoi !== undefined ? dto.vaiTroChoDoi : (dto.waitingOnRole !== undefined ? dto.waitingOnRole : task.waitingOnRole);
    const targetWaitingOnName = dto.tenNguoiChoDoi !== undefined ? dto.tenNguoiChoDoi : (dto.waitingOnName !== undefined ? dto.waitingOnName : task.waitingOnName);
    const note = dto.ghiChu || dto.note;

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

    return this.enrichTaskWithVietnamese(updated);
  }

  async addComment(taskId: string, userId: string, dto: AddTaskCommentDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const authorName = user ? user.name : 'Người dùng';
    const authorRole = user ? user.role : UserRole.owner;

    const content = dto.noiDung || dto.content || '';
    const isInternalOnly = dto.chiNoiBo !== undefined ? dto.chiNoiBo : (dto.isInternalOnly || false);

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

    return {
      ...comment,
      noiDung: comment.content,
      tacGia: comment.authorName,
      vaiTroTacGia: comment.authorRole,
      chiNoiBo: comment.isInternalOnly,
      taoLuc: comment.createdAt,
    };
  }

  async selfCertify(taskId: string, userId: string, dto: SelfCertifyTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Không tìm thấy tác vụ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Chủ doanh nghiệp';
    const reason = dto.lyDo || dto.reason;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        isSelfCertifiedNoUpload: true,
        notApplicableReason: reason,
        status: TaskStatus.waiting_verification,
        waitingOnRole: WaitingOnRole.service_accountant,
        waitingOnName: 'Kế toán dịch vụ',
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

    return this.enrichTaskWithVietnamese(updated);
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
        maChecklist: chk.code,
        title: chk.title,
        tieuDe: chk.title,
        category: chk.category,
        danhMuc: chk.category,
        status: chk.status,
        trangThai: chk.status,
        itemCount: chk.items.length,
        soLuongMuc: chk.items.length,
        totalTasks,
        tongSoNhiemVu: totalTasks,
        completedTasks,
        nhiemVuHoanThanh: completedTasks,
        progressPercent,
        tiLeTienDo: progressPercent,
        items: chk.items.map((it) => ({
          ...it,
          maQuyTac: it.ruleCode,
          tieuDe: it.title,
          loaiChuKy: it.cycleType,
          canCuPhapLy: it.legalBasis,
          yeuCauChungTu: it.evidenceRequirement,
          kichHoat: it.isActive,
        })),
        createdAt: chk.createdAt,
        taoLuc: chk.createdAt,
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
    const notes = await this.prisma.calendarNote.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        author: {
          select: { id: true, name: true, role: true, avatar: true },
        },
      },
    });

    return notes.map((n) => this.enrichCalendarNoteWithVietnamese(n));
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
    const date = dto.ngay || dto.date || new Date().toISOString().split('T')[0];
    const title = dto.tieuDe || dto.title || 'Ghi chú mới';
    const content = dto.noiDung || dto.content;
    const category = dto.danhMuc || dto.category || 'general';

    const note = await this.prisma.calendarNote.create({
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

    return this.enrichCalendarNoteWithVietnamese(note);
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

    const date = dto.ngay !== undefined ? dto.ngay : (dto.date !== undefined ? dto.date : note.date);
    const title = dto.tieuDe !== undefined ? dto.tieuDe : (dto.title !== undefined ? dto.title : note.title);
    const content = dto.noiDung !== undefined ? dto.noiDung : (dto.content !== undefined ? dto.content : note.content);
    const category = dto.danhMuc !== undefined ? dto.danhMuc : (dto.category !== undefined ? dto.category : note.category);
    const isCompleted = dto.daHoanThanh !== undefined ? dto.daHoanThanh : (dto.isCompleted !== undefined ? dto.isCompleted : note.isCompleted);

    const updated = await this.prisma.calendarNote.update({
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

    return this.enrichCalendarNoteWithVietnamese(updated);
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
}
