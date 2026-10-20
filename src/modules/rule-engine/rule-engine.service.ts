import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRuleDto } from './dto/rule.dto';
import { UserRole, WaitingOnRole, TaskStatus, Prisma } from '@prisma/client';
import { calculateTaxDeadline } from '../../common/utils/tax-deadline.util';

export class RuleEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRuleDto) {
    return this.prisma.rule.create({
      data: {
        code: dto.code,
        title: dto.title,
        conditionSummary: dto.conditionSummary,
        conditionsJson: (dto.conditionsJson as unknown as Prisma.InputJsonValue) || {},
        triggeredChecklists: dto.triggeredChecklists || [],
        version: dto.version || '1.0',
        legalReference: dto.legalReference,
        priority: dto.priority,
        category: dto.category,
      },
    });
  }

  async findAll() {
    return this.prisma.rule.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.rule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Không tìm thấy quy tắc');
    }
    return rule;
  }

  /**
   * Động cơ đánh giá quy tắc dựa trên ContextFact của Doanh nghiệp
   * và tự động sinh Checklist + Task thật vào PostgreSQL Database
   */
  async evaluateAndTrigger(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        departments: true,
        contextFacts: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp');
    }

    const rules = await this.prisma.rule.findMany();
    const generatedTasks: unknown[] = [];

    for (const rule of rules) {
      // Kiểm tra xem Task cho rule này trong Organization đã tồn tại chưa
      const existingTask = await this.prisma.task.findFirst({
        where: {
          organizationId: orgId,
          ruleCode: rule.code,
        },
      });

      if (existingTask) {
        continue;
      }

      // Đánh giá điều kiện rule (F&B / Hóa đơn / BHXH / ATTP)
      let isMatched = false;

      if (rule.code === 'RULE-HD-01') {
        // Hóa đơn điện tử máy tính tiền
        isMatched = org.hasOnlineSales || org.industry.includes('F&B') || org.industry.includes('ăn uống');
      } else if (rule.code === 'RULE-LD-02') {
        // Hợp đồng lao động & BHXH bắt buộc
        isMatched = org.employeeCount >= 1;
      } else if (rule.code === 'RULE-DT-03') {
        // Đối chiếu chứng từ bán hàng POS / GrabFood
        isMatched = org.hasOnlineSales || org.businessModel.includes('GrabFood') || org.businessModel.includes('ShopeeFood');
      } else if (rule.code === 'RULE-FNB-04') {
        // Giấy phép ATTP F&B
        isMatched = org.industry.includes('F&B') || org.industry.includes('ăn uống');
      } else {
        // Default match if no specific conditions
        isMatched = true;
      }

      if (isMatched) {
        // 1. Tìm department tương ứng
        let targetDept = org.departments.find((d) => d.code === 'ACC');
        let assigneeRole: UserRole = UserRole.internal_accountant;
        let waitingOnRole: WaitingOnRole = WaitingOnRole.service_accountant;

        if (rule.code === 'RULE-LD-02') {
          targetDept = org.departments.find((d) => d.code === 'HR') || targetDept;
          assigneeRole = UserRole.hr_staff;
          waitingOnRole = WaitingOnRole.internal_accountant;
        } else if (rule.code === 'RULE-FNB-04') {
          targetDept = org.departments.find((d) => d.code === 'OPS') || targetDept;
          assigneeRole = UserRole.owner;
          waitingOnRole = WaitingOnRole.service_accountant;
        }

        const taskCode = `TASK-${rule.code.replace('RULE-', '')}`;
        // Tính hạn chót thuế pháp định chuẩn xác theo quy định pháp luật (30/01, 30/10, hoặc cuối quý)
        const dueDate = calculateTaxDeadline(rule.code);

        // 2. Tạo Task thật
        const task = await this.prisma.task.create({
          data: {
            organizationId: orgId,
            code: taskCode,
            title: rule.title,
            category: rule.category,
            priority: rule.priority,
            departmentId: targetDept?.id,
            departmentName: targetDept?.name || 'Phòng ban chuyên môn',
            assigneeName: 'Chuyên viên phụ trách',
            assigneeRole,
            waitingOnRole,
            waitingOnName: 'Người đối soát / Kiểm tra',
            dueDate,
            status: TaskStatus.need_info,
            description: rule.conditionSummary,
            contextTrigger: `Kích hoạt tự động từ ${rule.code}`,
            ruleCode: rule.code,
            legalBasis: rule.legalReference,
            timeline: {
              create: {
                title: 'Tác vụ được khởi tạo tự động',
                description: `Hệ thống Rule Engine kích hoạt tác vụ từ quy tắc ${rule.code}`,
                actorName: 'CELRA Rule Engine',
                actorRole: UserRole.admin,
              },
            },
          },
        });

        generatedTasks.push(task);
      }
    }

    return {
      message: `Đã kích hoạt và khởi tạo thành công ${generatedTasks.length} tác vụ tuân thủ mới`,
      tasks: generatedTasks,
    };
  }
}
