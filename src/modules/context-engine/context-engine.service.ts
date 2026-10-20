import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateContextFactDto, UpdateContextFactDto, GenerateChecklistFromFactDto } from './dto/context-fact.dto';
import { ContextStatus, TaskStatus, Priority, UserRole, WaitingOnRole } from '@prisma/client';
import { CORE_LEGAL_DOC_LINKS } from '../../common/constants/legal-docs.constant';
import { calculateTaxDeadline } from '../../common/utils/tax-deadline.util';

@Injectable()
export class ContextEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}


  async create(orgId: string, userId: string, dto: CreateContextFactDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const providedBy = user ? user.name : 'Hệ thống';

    return this.prisma.contextFact.create({
      data: {
        organizationId: orgId,
        key: dto.key,
        label: dto.label,
        group: dto.group,
        currentValue: dto.currentValue,
        source: dto.source,
        providedBy,
        status: dto.status || ContextStatus.unconfirmed,
        affectedRules: dto.affectedRules || [],
        conflictDetails: dto.conflictDetails,
        history: {
          create: {
            value: dto.currentValue,
            changedBy: providedBy,
            note: 'Khởi tạo dữ kiện ban đầu',
          },
        },
      },
      include: {
        history: true,
      },
    });
  }

  async findAll(orgId: string, userId?: string) {
    let targetOrgId = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId },
      });
      if (userOrg) {
        targetOrgId = userOrg.organizationId;
      }
    }
    if (!targetOrgId) {
      const firstOrg = await this.prisma.organization.findFirst();
      if (firstOrg) {
        targetOrgId = firstOrg.id;
      }
    }

    if (!targetOrgId) {
      return [];
    }

    let facts = await this.prisma.contextFact.findMany({
      where: { organizationId: targetOrgId },
      include: {
        history: {
          orderBy: { changedAt: 'desc' },
        },
      },
      orderBy: [{ group: 'asc' }, { createdAt: 'asc' }],
    });

    // Trả về danh sách thẻ bối cảnh thực tế (không tự động tạo dữ liệu giả khi trống)
    return facts;
  }

  async findOne(id: string) {
    const fact = await this.prisma.contextFact.findUnique({
      where: { id },
      include: {
        history: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!fact) {
      throw new NotFoundException('Không tìm thấy dữ kiện bối cảnh');
    }

    return fact;
  }

  async update(id: string, userId: string, dto: UpdateContextFactDto) {
    const fact = await this.prisma.contextFact.findUnique({ where: { id } });
    if (!fact) {
      throw new NotFoundException('Không tìm thấy dữ kiện bối cảnh');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const changedBy = user ? `${user.name} (${user.roleTitle || user.role})` : 'Hệ thống';

    return this.prisma.contextFact.update({
      where: { id },
      data: {
        currentValue: dto.currentValue,
        status: dto.status || fact.status,
        conflictDetails: dto.conflictDetails !== undefined ? dto.conflictDetails : fact.conflictDetails,
        history: {
          create: {
            value: dto.currentValue,
            changedBy,
            note: dto.note || 'Cập nhật dữ kiện',
          },
        },
      },
      include: {
        history: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });
  }

  async confirm(id: string, userId: string) {
    const fact = await this.prisma.contextFact.findUnique({ where: { id } });
    if (!fact) {
      throw new NotFoundException('Không tìm thấy dữ kiện');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const confirmedBy = user ? user.name : 'Hệ thống';

    return this.prisma.contextFact.update({
      where: { id },
      data: {
        status: ContextStatus.confirmed,
        confirmedBy,
        conflictDetails: null,
      },
    });
  }

  /**
   * Rà soát tuân thủ thẻ bối cảnh (Thu phí 50.000 VNĐ qua Ví CELRA)
   * Tích hợp Rule-based Risk Analyzer đánh giá rủi ro và trích xuất căn cứ luật từ Database
   */
  async auditCompliance(orgId: string, factId: string, userId: string) {
    let targetOrgId = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId },
      });
      if (userOrg) targetOrgId = userOrg.organizationId;
    }
    const fact = await this.prisma.contextFact.findFirst({
      where: targetOrgId ? { id: factId, organizationId: targetOrgId } : { id: factId },
    });

    if (!fact) {
      throw new NotFoundException('Không tìm thấy thẻ bối cảnh doanh nghiệp');
    }
    targetOrgId = fact.organizationId;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const userName = user ? user.name : 'Chủ doanh nghiệp';

    // 1. Khấu trừ phí rà soát 50.000 VNĐ từ Ví
    const updatedWallet = await this.walletService.deductAuditFee(targetOrgId, fact.label, userName);

    // 2. Tra cứu Căn cứ pháp lý chính thức từ Database (đồng bộ từ DLPL API)
    const ruleCodeMap: Record<string, string> = {
      tax_code: 'RULE-TAX-MB',
      company_type_tag: 'RULE-TAX-GTGT',
      employee_scale: 'RULE-LABOR-UNDER10',
      industry_tags: 'RULE-TAX-POS-FNB',
      q_tax_corp_1: 'RULE-TAX-GTGT',
      q_tax_corp_2: 'RULE-TAX-TNDN-80',
      q_tax_corp_3: 'RULE-TAX-EXP-20M',
      q_fnb_tax_1: 'RULE-TAX-POS-FNB',
      q_tax_salary_1: 'RULE-TAX-EXP-20M',
      q_tax_salary_2: 'RULE-LABOR-10TO50',
    };

    const firstAffectedRule = Array.isArray(fact.affectedRules) ? String(fact.affectedRules[0]) : undefined;
    const targetCode = ruleCodeMap[fact.key] || firstAffectedRule || 'RULE-TAX-GTGT';
    let dbRule = await this.prisma.rule.findFirst({
      where: { code: targetCode },
    });
    if (!dbRule) {
      dbRule = await this.prisma.rule.findFirst();
    }

    const citation = (dbRule?.conditionsJson as { citations?: Array<{ sourceUrl?: string; docNumber?: string; articleNumber?: string }> } | null)?.citations?.[0];
    const dlplUrl = citation?.sourceUrl || CORE_LEGAL_DOC_LINKS['38/2019'] || 'https://dulieuphapluat.vn';

    const matchedLegal = {
      id: dbRule?.code || 'LEGAL_CORE',
      documentTitle: dbRule?.title || 'Quy định pháp luật hiện hành',
      documentNumber: citation?.docNumber || dbRule?.legalReference || 'VBQPPL',
      articleNumber: citation?.articleNumber || 'Quy chuẩn',
      officialAnchor: '',
      directUrl: dlplUrl,
      exactQuote: dbRule?.conditionSummary || 'Tuân thủ đúng quy định pháp luật hiện hành theo Cổng Dữ Liệu Pháp Luật (dulieuphapluat.vn).',
      shortSummary: dbRule?.conditionSummary || 'Tuân thủ đúng quy định pháp luật theo cổng dulieuphapluat.vn.',
    };

    const lowerVal = (fact.currentValue || '').toLowerCase();

    // 3. Phân tích rủi ro theo quy tắc (Rule-based Risk Analyzer)
    const isUnanswered = !fact.currentValue || fact.currentValue.trim() === '' || lowerVal.includes('chưa trả lời');
    const isNonCompliant = lowerVal.includes('chưa') || lowerVal.includes('không có') || lowerVal.includes('chưa có') || lowerVal.includes('chưa đăng ký');
    const isPreparing = lowerVal.includes('đang') || lowerVal.includes('chuẩn bị') || lowerVal.includes('một phần');
    const isReviewNeeded = lowerVal.includes('chưa rõ') || lowerVal.includes('tham vấn');

    let riskLevel = 'LOW';
    let riskSummary = 'Doanh nghiệp đã tuân thủ cơ bản quy định hiện hành.';
    let proposedStatus: ContextStatus = ContextStatus.confirmed;

    if (isUnanswered) {
      riskLevel = 'HIGH';
      riskSummary = 'Dữ liệu chưa được khai báo đầy đủ. Khuyến nghị cập nhật trước khi đối soát.';
      proposedStatus = ContextStatus.unconfirmed;
    } else if (isNonCompliant) {
      riskLevel = 'URGENT';
      riskSummary = `Cảnh báo vi phạm nghĩa vụ pháp lý bắt buộc: ${matchedLegal.shortSummary}. Căn cứ pháp lý: ${matchedLegal.documentNumber}.`;
      proposedStatus = ContextStatus.conflict;
    } else if (isPreparing || isReviewNeeded) {
      riskLevel = 'MEDIUM';
      riskSummary = `Nghĩa vụ đang trong quá trình hoàn thiện. Cần đôn đốc chuẩn bị hồ sơ minh chứng trước thời hạn thanh kiểm tra.`;
      proposedStatus = ContextStatus.pending_reconciliation;
    }

    // 4. Sinh danh mục Checklist và Tasks khuyến nghị
    const proposedChecklist = {
      title: `Rà soát tuân thủ: ${fact.label}`,
      category: fact.group,
      legalBasis: `${matchedLegal.documentTitle} - ${matchedLegal.articleNumber} (${matchedLegal.directUrl})`,
      tasks: [
        {
          code: `TASK-${Date.now().toString().slice(-4)}-01`,
          title: `Thu thập hồ sơ chứng minh cho [${fact.label}]`,
          description: `Cung cấp tài liệu, hóa đơn hoặc văn bản hợp lệ để đối chiếu quy định tại ${matchedLegal.articleNumber} ${matchedLegal.documentTitle}.`,
          priority: riskLevel === 'URGENT' ? Priority.urgent : Priority.high,
          legalBasis: `${matchedLegal.exactQuote} (Xem luật gốc: ${matchedLegal.directUrl})`,
          dueDateDays: 7,
        },
        {
          code: `TASK-${Date.now().toString().slice(-4)}-02`,
          title: `Ban hành & nộp lưu chiểu theo quy định`,
          description: `Hoàn tất các bước thủ tục hành chính để đảm bảo tính pháp lý của hồ sơ doanh nghiệp.`,
          priority: Priority.medium,
          legalBasis: `${matchedLegal.documentTitle} (${matchedLegal.directUrl})`,
          dueDateDays: 14,
        },
      ],
    };

    return {
      success: true,
      message: 'Rà soát tuân thủ thành công qua CELRA AI Legal Engine',
      auditResult: {
        factId: fact.id,
        factLabel: fact.label,
        currentValue: fact.currentValue,
        riskLevel,
        riskSummary,
        proposedStatus,
        legalCitation: matchedLegal,
        proposedChecklist,
        walletBalance: updatedWallet.balance,
      },
    };
  }

  /**
   * Tạo Checklist và Task chính thức vào Database sau khi Chủ DN nhấn 'Tạo Checklist'
   */
  async generateChecklists(orgId: string, factId: string, userId: string, dto: GenerateChecklistFromFactDto) {
    let targetOrgId = orgId;
    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId },
      });
      if (userOrg) targetOrgId = userOrg.organizationId;
    }
    const fact = await this.prisma.contextFact.findFirst({
      where: targetOrgId ? { id: factId, organizationId: targetOrgId } : { id: factId },
    });

    if (!fact) {
      throw new NotFoundException('Không tìm thấy thẻ bối cảnh doanh nghiệp');
    }
    targetOrgId = fact.organizationId;

    const org = await this.prisma.organization.findUnique({
      where: { id: targetOrgId },
      include: { departments: true },
    });

    const defaultDept = org?.departments?.[0];
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const userName = user ? user.name : 'Chủ doanh nghiệp';

    const createdTasks = [];
    const tasksToCreate = dto.tasks && dto.tasks.length > 0 ? dto.tasks : [
      {
        title: `Hoàn thiện thủ tục & minh chứng: ${fact.label}`,
        description: `Thực hiện đối soát và lưu trữ tài liệu chứng minh sự tuân thủ cho thẻ ${fact.label}`,
        priority: 'high',
        legalBasis: 'Theo quy định pháp luật hiện hành',
        dueDateDays: 7,
      },
    ];

    for (let i = 0; i < tasksToCreate.length; i++) {
      const t = tasksToCreate[i];
      // Áp dụng Động cơ tính hạn chót thuế pháp định (30/01 môn bài, 30/10 TNDN 80%, cuối tháng quý sau GTGT/TNCN)
      const dueDate = calculateTaxDeadline(fact.key);

      let priorityEnum: Priority = Priority.medium;
      if (t.priority === 'urgent' || t.priority === 'CRITICAL') priorityEnum = Priority.urgent;
      else if (t.priority === 'high' || t.priority === 'HIGH') priorityEnum = Priority.high;

      const task = await this.prisma.task.create({
        data: {
          organizationId: targetOrgId,
          code: `TASK-${Date.now().toString().slice(-4)}-0${i + 1}`,
          title: t.title,
          category: fact.group,
          priority: priorityEnum,
          departmentId: defaultDept?.id,
          departmentName: defaultDept?.name || 'Phòng ban chuyên môn',
          assigneeName: userName,
          assigneeRole: UserRole.owner,
          waitingOnRole: WaitingOnRole.none,
          dueDate,
          isAuditPaid: true,
          status: TaskStatus.need_info,
          description: t.description || `Nhiệm vụ kiểm tra tuân thủ cho ${fact.label}`,
          contextTrigger: `Khởi tạo từ phiên rà soát thẻ [${fact.label}]`,
          ruleCode: fact.key,
          legalBasis: t.legalBasis || 'Quy chuẩn pháp luật liên quan',
          timeline: {
            create: {
              title: 'Tác vụ được khởi tạo thành công từ Bối cảnh',
              description: `Chủ doanh nghiệp đã rà soát thẻ ${fact.label} và tạo tác vụ`,
              actorName: userName,
              actorRole: UserRole.owner,
            },
          },
        },
      });

      createdTasks.push(task);
    }

    return {
      success: true,
      message: `Đã khởi tạo thành công ${createdTasks.length} nhiệm vụ kiểm tra mới!`,
      tasks: createdTasks,
    };
  }
}
