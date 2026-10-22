import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  NotificationMilestone,
  TaskStatus,
  UserRole,
  WaitingOnRole,
  TimelineEventType,
} from '@prisma/client';
import { calculateComplianceDeadline } from '../../common/utils/tax-calendar.util';

@Injectable()
export class ComplianceNotificationService implements OnModuleInit {
  private readonly logger = new Logger(ComplianceNotificationService.name);
  private checkIntervalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Khởi chạy background scheduler kiểm tra nhắc hạn và kỳ định kỳ mỗi 10 phút
    // (Lần chạy đầu tiên sau 15 giây khởi động)
    setTimeout(() => {
      this.runPeriodicComplianceChecks().catch((err) =>
        this.logger.error('Lỗi khi chạy quét định kỳ:', err),
      );
    }, 15000);

    this.checkIntervalTimer = setInterval(() => {
      this.runPeriodicComplianceChecks().catch((err) =>
        this.logger.error('Lỗi khi chạy quét định kỳ:', err),
      );
    }, 10 * 60 * 1000);
  }

  /**
   * Tổng hợp các tác vụ kiểm tra nền: Nhắc hạn & Tự động sinh task định kỳ
   */
  async runPeriodicComplianceChecks() {
    this.logger.log('[SCHEDULER] Bắt đầu chu kỳ quét nhắc hạn & bù kỳ tác vụ tuân thủ...');
    await this.checkAndGenerateRecurringTasks();
    await this.scanAndSendTaskReminders();
  }

  /**
   * 1. HỆ THỐNG NHẮC HẠN TỰ ĐỘNG (THEO 5 MỐC: 7 NGÀY, 3 NGÀY, 1 NGÀY, ĐÚNG NGÀY, QUÁ HẠN)
   * Chống trùng lặp tuyệt đối bằng Unique Constraint [taskId, milestone, userId] trong DB
   */
  async scanAndSendTaskReminders() {
    const now = new Date();
    const activeTasks = await this.prisma.task.findMany({
      where: {
        status: {
          notIn: [TaskStatus.completed, TaskStatus.cancelled],
        },
      },
      include: {
        organization: {
          include: {
            memberships: {
              where: { status: 'active' },
            },
          },
        },
      },
    });

    let sentCount = 0;

    for (const task of activeTasks) {
      if (!task.dueDate) continue;

      // Tính khoảng cách số ngày đến hạn
      const timeDiff = task.dueDate.getTime() - now.getTime();
      const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      // Xác định milestone nhắc hạn
      let targetMilestone: NotificationMilestone | null = null;
      let milestoneTitle = '';
      let milestoneMessage = '';

      if (daysUntilDue === 7) {
        targetMilestone = NotificationMilestone.BEFORE_7D;
        milestoneTitle = `Sắp đến hạn (còn 7 ngày): ${task.title}`;
        milestoneMessage = `Nghĩa vụ tuân thủ "${task.title}" có hạn chót vào ngày ${task.dueDate.toLocaleDateString('vi-VN')}. Vui lòng chuẩn bị hồ sơ minh chứng.`;
      } else if (daysUntilDue === 3) {
        targetMilestone = NotificationMilestone.BEFORE_3D;
        milestoneTitle = `Khẩn: Còn 3 ngày đến hạn chót: ${task.title}`;
        milestoneMessage = `Chỉ còn 3 ngày làm việc để hoàn thành nghĩa vụ "${task.title}". Hạn chót: ${task.dueDate.toLocaleDateString('vi-VN')}.`;
      } else if (daysUntilDue === 1) {
        targetMilestone = NotificationMilestone.BEFORE_1D;
        milestoneTitle = `Khẩn cấp: Ngày mai là hạn chót: ${task.title}`;
        milestoneMessage = `Nghĩa vụ "${task.title}" hết hạn vào ngày mai (${task.dueDate.toLocaleDateString('vi-VN')}). Cần gửi tờ khai/thanh toán ngay.`;
      } else if (daysUntilDue === 0) {
        targetMilestone = NotificationMilestone.DUE_TODAY;
        milestoneTitle = `HÔM NAY ĐẾN HẠN: ${task.title}`;
        milestoneMessage = `Hôm nay là ngày hạn chót pháp lý của nghĩa vụ "${task.title}". Vui lòng hoàn tất trước 24h00 để tránh bị tính tiền chậm nộp.`;
      } else if (daysUntilDue < 0) {
        targetMilestone = NotificationMilestone.OVERDUE;
        const overdueDays = Math.abs(daysUntilDue);
        milestoneTitle = `CẢNH BÁO QUÁ HẠN (${overdueDays} ngày): ${task.title}`;
        milestoneMessage = `Tác vụ "${task.title}" đã quá hạn ${overdueDays} ngày. Rủi ro bị cơ quan quản lý xử phạt vi phạm hành chính.`;
      }

      if (!targetMilestone) continue;

      // Xác định danh sách người nhận thông báo trong doanh nghiệp:
      // Ưu tiên assigneeId của task, hoặc các user có vai trò phù hợp trong org
      const recipientUserIds: string[] = [];
      if (task.assigneeId) {
        recipientUserIds.push(task.assigneeId);
      } else {
        const matchingMembers = task.organization.memberships.filter(
          (m) => m.role === task.assigneeRole || m.role === UserRole.owner,
        );
        recipientUserIds.push(...matchingMembers.map((m) => m.userId));
      }

      // Gửi thông báo cho từng người nhận (Idempotent: Không tạo trùng nhờ unique constraint)
      for (const userId of Array.from(new Set(recipientUserIds))) {
        try {
          await this.prisma.complianceNotification.upsert({
            where: {
              taskId_milestone_userId: {
                taskId: task.id,
                milestone: targetMilestone,
                userId,
              },
            },
            update: {
              // Cập nhật lại phiên bản hạn nếu hạn chót thay đổi
              dueDateVersion: task.dueDate,
              message: milestoneMessage,
            },
            create: {
              organizationId: task.organizationId,
              userId,
              taskId: task.id,
              milestone: targetMilestone,
              title: milestoneTitle,
              message: milestoneMessage,
              linkUrl: `/tasks?taskId=${task.id}`,
              dueDateVersion: task.dueDate,
            },
          });
          sentCount++;
        } catch (e) {
          // Bỏ qua lỗi duplicate nếu đồng thời có tiến trình khác ghi
        }
      }
    }

    if (sentCount > 0) {
      this.logger.log(`[REMINDERS] Đã đồng bộ ${sentCount} thông báo nhắc hạn thành công.`);
    }
  }

  /**
   * 2. TỰ ĐỘNG SINH TASK KỲ TIẾP THEO & BÙ KỲ BỊ BỎ LỠ (0 TOKEN AI)
   */
  async checkAndGenerateRecurringTasks() {
    const activeItems = await this.prisma.checklistItem.findMany({
      where: {
        isActive: true,
      },
      include: {
        checklist: true,
      },
    });

    const now = new Date();
    let generatedCount = 0;

    for (const item of activeItems) {
      // Chỉ tự động sinh định kỳ cho các chu kỳ lặp lại (Tháng, Quý, 6 Tháng, Năm)
      if (item.cycleType.startsWith('EVENT_')) {
        continue;
      }

      const deadlineInfo = calculateComplianceDeadline(
        item.ruleCode,
        item.cycleType,
        null,
        now,
      );

      // Nếu đã bước sang kỳ mới mà chưa có task
      if (deadlineInfo.periodKey && deadlineInfo.periodKey !== item.lastGeneratedPeriod) {
        const taskCode = `TASK-${item.ruleCode.replace('RULE-', '')}-${deadlineInfo.periodKey}`;
        const dueDate = deadlineInfo.dueDate || new Date(Date.now() + 15 * 86400000);

        try {
          await this.prisma.task.upsert({
            where: {
              organizationId_ruleCode_periodKey: {
                organizationId: item.organizationId,
                ruleCode: item.ruleCode,
                periodKey: deadlineInfo.periodKey,
              },
            },
            update: {},
            create: {
              organizationId: item.organizationId,
              checklistId: item.checklistId,
              checklistItemId: item.id,
              findingId: item.findingId,
              code: taskCode,
              title: item.title,
              category: item.checklist.category,
              priority: item.defaultPriority,
              departmentId: item.departmentId,
              departmentName: 'Phòng ban chuyên môn',
              assigneeId: item.assigneeId,
              assigneeName: item.assigneeName,
              assigneeRole: item.assigneeRole,
              waitingOnRole: WaitingOnRole.none,
              dueDate,
              status: TaskStatus.in_progress,
              description: `${item.title}\nKỳ tuân thủ: ${deadlineInfo.periodKey}\n${deadlineInfo.calculationBasis}`,
              contextTrigger: `Tự động sinh bởi Statutory Scheduler cho kỳ ${deadlineInfo.periodKey}`,
              ruleCode: item.ruleCode,
              periodCycle: item.cycleType,
              periodKey: deadlineInfo.periodKey,
              calculationBasisJson: {
                basis: deadlineInfo.calculationBasis,
                scheduledAt: now.toISOString(),
              },
              legalBasis: item.legalBasis,
              timeline: {
                create: {
                  title: `Khởi tạo tác vụ tuân thủ cho kỳ mới (${deadlineInfo.periodKey})`,
                  description: `Hệ thống tự động sinh nhiệm vụ thực hiện theo chu kỳ ${item.cycleType}`,
                  actorName: 'CELRA Compliance Scheduler',
                  actorRole: UserRole.admin,
                  type: TimelineEventType.status_change,
                },
              },
            },
          });

          // Cập nhật lại ChecklistItem
          await this.prisma.checklistItem.update({
            where: { id: item.id },
            data: {
              lastGeneratedPeriod: deadlineInfo.periodKey,
              nextDueDate: dueDate,
            },
          });

          generatedCount++;
        } catch (e) {
          // Bỏ qua lỗi conflict
        }
      }
    }

    if (generatedCount > 0) {
      this.logger.log(`[RECURRING] Đã tự động sinh ${generatedCount} tác vụ định kỳ cho kỳ mới.`);
    }
  }

  /**
   * 3. LẤY DANH SÁCH THÔNG BÁO CHO NGƯỜI DÙNG
   */
  async getUserNotifications(orgId: string, userId: string, unreadOnly = false) {
    const where: any = {
      organizationId: orgId,
      userId,
    };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.complianceNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.complianceNotification.count({
        where: {
          organizationId: orgId,
          userId,
          isRead: false,
        },
      }),
    ]);

    return {
      notifications,
      unreadCount,
    };
  }

  /**
   * 4. ĐÁNH DẤU THÔNG BÁO ĐÃ ĐỌC
   */
  async markNotificationRead(notificationId: string, userId: string) {
    const notif = await this.prisma.complianceNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notif) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    if (notif.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên thông báo này');
    }

    return this.prisma.complianceNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * 5. ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC
   */
  async markAllNotificationsRead(orgId: string, userId: string) {
    return this.prisma.complianceNotification.updateMany({
      where: {
        organizationId: orgId,
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}
