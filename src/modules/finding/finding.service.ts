import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateFindingDto, UpdateFindingStatusDto } from './dto/finding.dto';
import { FindingStatus, TaskStatus, UserRole, WaitingOnRole, TimelineEventType } from '@prisma/client';

@Injectable()
export class FindingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateFindingDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const detectedBy = user ? `${user.name} (${user.roleTitle || user.role})` : 'Kế toán dịch vụ';

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo Finding rủi ro
      const finding = await tx.finding.create({
        data: {
          organizationId: orgId,
          code: dto.code,
          title: dto.title,
          description: dto.description,
          severity: dto.severity,
          relatedTaskId: dto.relatedTaskId,
          relatedTaskCode: dto.relatedTaskCode,
          relatedEvidenceId: dto.relatedEvidenceId,
          detectedBy,
          responsibleDepartmentId: dto.responsibleDepartmentId,
          dueDate: new Date(dto.dueDate),
          proposedAction: dto.proposedAction,
          status: FindingStatus.new,
        },
      });

      // 2. Tự động sinh Task khắc phục (Remediation Task)
      const remediationTaskCode = `REM-${dto.code}`;
      const remTask = await tx.task.create({
        data: {
          organizationId: orgId,
          code: remediationTaskCode,
          title: `Khắc phục sai sót: ${dto.title}`,
          category: 'Khắc phục rủi ro',
          priority: dto.severity,
          departmentId: dto.responsibleDepartmentId,
          departmentName: 'Phòng ban chịu trách nhiệm',
          assigneeName: 'Người phụ trách khắc phục',
          assigneeRole: UserRole.hr_staff,
          waitingOnRole: WaitingOnRole.hr_staff,
          waitingOnName: 'Nhân viên Nhân sự / Phụ trách',
          dueDate: new Date(dto.dueDate),
          status: TaskStatus.in_progress,
          description: `${dto.description}. Hành động đề xuất: ${dto.proposedAction}`,
          ruleCode: 'REMEDIATION',
          legalBasis: 'Khắc phục rủi ro tuân thủ nội bộ',
          findingId: finding.id,
          timeline: {
            create: {
              title: 'Tự động tạo Tác vụ khắc phục rủi ro',
              description: `Khởi tạo từ phát hiện ${dto.code}: ${dto.title}`,
              actorName: detectedBy,
              actorRole: user?.role || UserRole.service_accountant,
              type: TimelineEventType.status_change,
            },
          },
        },
      });

      // 3. Cập nhật lại remediationTaskId vào Finding
      return tx.finding.update({
        where: { id: finding.id },
        data: { remediationTaskId: remTask.id },
        include: { responsibleDepartment: true },
      });
    });
  }

  async findAll(orgId: string) {
    return this.prisma.finding.findMany({
      where: { organizationId: orgId },
      include: {
        responsibleDepartment: true,
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const finding = await this.prisma.finding.findUnique({
      where: { id },
      include: { responsibleDepartment: true },
    });

    if (!finding) {
      throw new NotFoundException('Không tìm thấy phát hiện rủi ro');
    }

    return finding;
  }

  async updateStatus(id: string, dto: UpdateFindingStatusDto) {
    const finding = await this.prisma.finding.findUnique({ where: { id } });
    if (!finding) {
      throw new NotFoundException('Không tìm thấy rủi ro');
    }

    return this.prisma.finding.update({
      where: { id },
      data: { status: dto.status },
    });
  }
}
