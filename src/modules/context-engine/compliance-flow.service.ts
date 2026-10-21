import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import {
  BatchAuditContextDto,
  ConfirmChecklistsDto,
  ConfirmChecklistItemDto,
} from './dto/compliance-flow.dto';
import {
  StatutoryCycleType,
  AuditStatus,
  ApplicableStatus,
  LegalValidity,
  ResultSource,
  Priority,
  UserRole,
  WaitingOnRole,
  TaskStatus,
  TimelineEventType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { CORE_LEGAL_DOC_LINKS, cleanDLPLUrl, matchCoreLegalDocUrl } from '../../common/constants/legal-docs.constant';
import {
  calculateComplianceDeadline,
  getPeriodKey,
} from '../../common/utils/tax-calendar.util';

export interface AuditFindingResponse {
  id: string;
  auditId: string;
  factId?: string | null;
  ruleCode: string;
  obligationTitle: string;
  category: string;
  applicableStatus: ApplicableStatus;
  actionRequired: string;
  evidenceRequired: string;
  legalBasis: string;
  legalDocNumber?: string | null;
  legalArticle?: string | null;
  legalDocUrl?: string | null;
  legalValidity: LegalValidity;
  verifiedAt?: string | null;
  resultSource: ResultSource;
  cycleType: StatutoryCycleType;
  calculationMethod?: string | null;
  missingDataNotice?: string | null;
  suggestedPriority: Priority;
  tasks: Array<{
    code: string;
    title: string;
    description: string;
    priority: Priority;
    dueDate?: string | null;
    requiresEventDate: boolean;
  }>;
}

@Injectable()
export class ComplianceFlowService {
  private readonly logger = new Logger(ComplianceFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Tính toán Fingerprint bối cảnh (Context Fingerprint Hash)
   * Giúp nhận diện chính xác sự thay đổi của dữ liệu doanh nghiệp
   */
  private generateContextFingerprint(
    orgId: string,
    facts: Array<{ key: string; currentValue: string; status: string }>,
    rulesVersion = '1.0',
    scope = 'ALL',
  ): string {
    const sorted = [...facts].sort((a, b) => a.key.localeCompare(b.key));
    const raw = `${orgId}::${scope}::${rulesVersion}::${JSON.stringify(sorted)}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * 1. RÀ SOÁT BỐI CẢNH TOÀN DIỆN (TÍCH HỢP CACHE FINGERPRINT & 0 TOKEN REUSE)
   */
  async runAudit(orgId: string, userId: string, dto: BatchAuditContextDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        departments: true,
        contextFacts: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Không tìm thấy tổ chức/doanh nghiệp hợp lệ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const userName = user ? user.name : 'Chủ doanh nghiệp';

    // Lọc danh sách thẻ bối cảnh cần rà soát
    let targetFacts = org.contextFacts;
    if (dto.factIds && dto.factIds.length > 0) {
      targetFacts = org.contextFacts.filter((f) => dto.factIds!.includes(f.id));
    }

    const scope = dto.scope || 'ALL';
    const rulesVersion = '1.0';
    const fingerprint = this.generateContextFingerprint(org.id, targetFacts, rulesVersion, scope);

    // KIỂM TRA BỘ NHỚ ĐỆM DATABASE (CACHE HIT)
    // Nếu cùng fingerprint -> trả ngay kết quả đã lưu mà KHÔNG gọi AI, KHÔNG trừ tiền ví
    const existingAudit = await this.prisma.complianceAudit.findFirst({
      where: {
        organizationId: org.id,
        contextFingerprint: fingerprint,
        status: AuditStatus.succeeded,
      },
      include: {
        findings: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingAudit && existingAudit.findings.length > 0) {
      this.logger.log(`[AUDIT CACHE HIT] Tái sử dụng kết quả rà soát fingerprint: ${fingerprint.slice(0, 10)} (0 phí, 0 AI)`);
      return {
        success: true,
        isCached: true,
        auditId: existingAudit.id,
        contextFingerprint: existingAudit.contextFingerprint,
        verifiedAt: existingAudit.verifiedAt,
        createdAt: existingAudit.createdAt,
        message: 'Tái sử dụng kết quả rà soát hợp lệ từ cơ sở dữ liệu (Không phát sinh chi phí).',
        totalFindings: existingAudit.totalFindings,
        applicableCount: existingAudit.applicableCount,
        findings: this.formatFindings(existingAudit.findings),
      };
    }

    // CACHE MISS: Thực hiện rà soát mới và khấu trừ phí nếu có
    // Kiểm tra và khấu trừ phí qua Ví CELRA (50.000 VNĐ cho phiên rà soát)
    try {
      await this.walletService.deductAuditFee(
        org.id,
        `Rà soát tuân thủ pháp luật (${targetFacts.length} dữ kiện)`,
        userName,
      );
    } catch (err: any) {
      // Nếu ví không đủ tiền, báo lỗi rõ ràng cho người dùng
      throw new BadRequestException(
        `Không thể thực hiện rà soát do số dư ví không đủ: ${err.message || 'Vui lòng nạp thêm tiền vào ví CELRA.'}`,
      );
    }

    // Đánh giá theo Rule Engine và Bản đồ Luật chính thức đã xác minh
    const verifiedNow = new Date();
    const evaluationResults = this.evaluateStatutoryObligations(org, targetFacts, verifiedNow);

    // Lưu phiên Audit vào Database
    const audit = await this.prisma.complianceAudit.create({
      data: {
        organizationId: org.id,
        createdById: userId,
        contextFingerprint: fingerprint,
        rulesVersion,
        scope,
        status: AuditStatus.succeeded,
        summary: `Rà soát ${evaluationResults.length} nghĩa vụ pháp lý trọng yếu`,
        totalFindings: evaluationResults.length,
        applicableCount: evaluationResults.filter((f) => f.applicableStatus === ApplicableStatus.applicable).length,
        verifiedAt: verifiedNow,
        findings: {
          create: evaluationResults.map((item) => ({
            organizationId: org.id,
            factId: item.factId,
            ruleCode: item.ruleCode,
            obligationTitle: item.obligationTitle,
            category: item.category,
            applicableStatus: item.applicableStatus,
            actionRequired: item.actionRequired,
            evidenceRequired: item.evidenceRequired,
            legalBasis: item.legalBasis,
            legalDocNumber: item.legalDocNumber,
            legalArticle: item.legalArticle,
            legalDocUrl: item.legalDocUrl,
            legalValidity: item.legalValidity,
            verifiedAt: verifiedNow,
            resultSource: item.resultSource,
            cycleType: item.cycleType,
            calculationMethod: item.calculationMethod,
            missingDataNotice: item.missingDataNotice,
            suggestedPriority: item.suggestedPriority,
          })),
        },
      },
      include: {
        findings: true,
      },
    });

    return {
      success: true,
      isCached: false,
      auditId: audit.id,
      contextFingerprint: audit.contextFingerprint,
      verifiedAt: audit.verifiedAt,
      createdAt: audit.createdAt,
      message: 'Rà soát tuân thủ thành công qua CELRA Statutory Engine.',
      totalFindings: audit.totalFindings,
      applicableCount: audit.applicableCount,
      findings: this.formatFindings(audit.findings),
    };
  }

  /**
   * 2. XÁC NHẬN TẠO CHECKLIST & TASKS CHÍNH THỨC (IDEMPOTENT TRANSACTION & CHỐNG TRÙNG)
   */
  async confirmChecklists(orgId: string, userId: string, dto: ConfirmChecklistsDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một nghĩa vụ để tạo Checklist.');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { departments: true },
    });

    if (!org) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp hợp lệ');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Chủ doanh nghiệp';
    const actorRole = user ? user.role : UserRole.owner;

    const defaultDept = org.departments.find((d) => d.code === 'ACC') || org.departments[0];

    // Transaction an toàn tạo Checklist, ChecklistItems và Tasks
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Tạo hoặc lấy Checklist chính của tổ chức
      const checklistCode = `CKL-${org.taxCode}-${Date.now().toString().slice(-4)}`;
      const checklist = await tx.checklist.create({
        data: {
          organizationId: org.id,
          createdById: userId,
          code: checklistCode,
          title: `Bộ Checklist Tuân Thủ Pháp Luật & Thuế Doanh Nghiệp`,
          category: 'Tuân thủ định kỳ & theo sự kiện',
        },
      });

      const createdItems: any[] = [];
      const createdTasks: any[] = [];

      for (let i = 0; i < dto.items.length; i++) {
        const itemDto = dto.items[i];
        const eventDateParsed = itemDto.eventDate ? new Date(itemDto.eventDate) : null;

        // Tính toán hạn chót pháp lý theo ruleCode và cycleType
        const deadlineInfo = calculateComplianceDeadline(
          itemDto.ruleCode,
          itemDto.cycleType,
          eventDateParsed,
          new Date(),
        );

        // 2. Tạo ChecklistItem theo dõi nghĩa vụ
        const checklistItem = await tx.checklistItem.create({
          data: {
            checklistId: checklist.id,
            organizationId: org.id,
            findingId: itemDto.findingId,
            ruleCode: itemDto.ruleCode,
            title: itemDto.title,
            cycleType: itemDto.cycleType,
            departmentId: itemDto.departmentId || defaultDept?.id,
            assigneeId: itemDto.assigneeId,
            assigneeName: itemDto.assigneeName || actorName,
            assigneeRole: itemDto.assigneeRole || actorRole,
            defaultPriority: itemDto.priority || Priority.medium,
            legalBasis: itemDto.legalBasis || 'Quy chuẩn pháp luật hiện hành',
            legalDocUrl: itemDto.legalDocUrl,
            evidenceRequirement: itemDto.evidenceRequirement,
            eventDate: eventDateParsed,
            lastGeneratedPeriod: deadlineInfo.periodKey,
            nextDueDate: deadlineInfo.dueDate,
          },
        });
        createdItems.push(checklistItem);

        // 3. Khởi tạo Task thực thi cho kỳ/đợt hiện tại
        // CHỐNG TRÙNG TUYỆT ĐỐI: Dùng upsert dựa trên unique constraint [organizationId, ruleCode, periodKey]
        const taskCode = `TASK-${itemDto.ruleCode.replace('RULE-', '')}-${deadlineInfo.periodKey}`;
        const taskStatus = deadlineInfo.requiresEventDate ? TaskStatus.need_info : TaskStatus.in_progress;
        const taskDueDate = deadlineInfo.dueDate || new Date(Date.now() + 15 * 86400000);

        const task = await tx.task.upsert({
          where: {
            organizationId_ruleCode_periodKey: {
              organizationId: org.id,
              ruleCode: itemDto.ruleCode,
              periodKey: deadlineInfo.periodKey,
            },
          },
          update: {
            // Nếu đã tồn tại task cho kỳ này, chỉ cập nhật người phụ trách nếu chưa completed
            assigneeName: itemDto.assigneeName || actorName,
            assigneeRole: itemDto.assigneeRole || actorRole,
          },
          create: {
            organizationId: org.id,
            checklistId: checklist.id,
            checklistItemId: checklistItem.id,
            findingId: itemDto.findingId,
            code: taskCode,
            title: itemDto.title,
            category: itemDto.category,
            priority: itemDto.priority || Priority.medium,
            departmentId: itemDto.departmentId || defaultDept?.id,
            departmentName: defaultDept?.name || 'Phòng ban chuyên môn',
            assigneeId: itemDto.assigneeId,
            assigneeName: itemDto.assigneeName || actorName,
            assigneeRole: itemDto.assigneeRole || actorRole,
            waitingOnRole: WaitingOnRole.none,
            dueDate: taskDueDate,
            status: taskStatus,
            description: `${itemDto.title}\nCăn cứ: ${itemDto.legalBasis || 'Pháp luật hiện hành'}\n${deadlineInfo.calculationBasis}`,
            contextTrigger: `Kích hoạt từ danh mục Checklist tuân thủ [Kỳ: ${itemDto.cycleType}]`,
            ruleCode: itemDto.ruleCode,
            periodCycle: itemDto.cycleType,
            periodKey: deadlineInfo.periodKey,
            eventDate: eventDateParsed,
            calculationBasisJson: {
              basis: deadlineInfo.calculationBasis,
              requiresEventDate: deadlineInfo.requiresEventDate,
              missingDataReason: deadlineInfo.missingDataReason,
            },
            legalBasis: itemDto.legalBasis || 'Quy định pháp luật hiện hành',
            legalValidity: LegalValidity.in_force,
            verifiedAt: new Date(),
            timeline: {
              create: {
                title: 'Tác vụ tuân thủ được kích hoạt chính thức',
                description: `Chủ doanh nghiệp đã xác nhận kích hoạt Checklist nghĩa vụ [${itemDto.ruleCode}] cho kỳ ${deadlineInfo.periodKey}`,
                actorId: userId,
                actorName,
                actorRole,
                type: TimelineEventType.status_change,
              },
            },
          },
        });
        createdTasks.push(task);
      }

      return { checklist, items: createdItems, tasks: createdTasks };
    });

    return {
      success: true,
      message: `Đã khởi tạo thành công Checklist "${result.checklist.title}" với ${result.tasks.length} tác vụ tuân thủ!`,
      checklistId: result.checklist.id,
      checklistCode: result.checklist.code,
      totalItems: result.items.length,
      totalTasks: result.tasks.length,
      tasks: result.tasks,
    };
  }

  /**
   * Đánh giá 11 Đợt Luật Định và các quy định ngành đặc thù từ Hồ sơ Doanh nghiệp & ContextFacts
   */
  private evaluateStatutoryObligations(org: any, facts: any[], verifiedNow: Date) {
    const isFnb = (org.industry || '').includes('F&B') || (org.industry || '').includes('ăn uống');
    const isEcom = org.hasOnlineSales || (org.industry || '').includes('ECOMMERCE') || (org.industry || '').includes('bán lẻ');
    const isMonthlyRevenue = org.revenueStatus === 'over_50b';
    const hasEmployees = org.employeeCount >= 10;
    const isNewlyEstablished = org.revenueStatus === 'newly_established';

    const findings: any[] = [];

    // 1. RULE-TAX-GTGT: Khai thuế GTGT & TNCN
    const gtgtFact = facts.find((f) => f.key === 'q_tax_corp_1');
    const gtgtCycle: StatutoryCycleType = isMonthlyRevenue ? 'MONTHLY' : 'QUARTERLY';
    findings.push({
      factId: gtgtFact?.id,
      ruleCode: 'RULE-TAX-GTGT',
      obligationTitle: 'Kê khai định kỳ và nộp tờ khai thuế GTGT, thuế TNCN',
      category: 'Thuế Doanh Nghiệp',
      applicableStatus: ApplicableStatus.applicable,
      actionRequired: 'Lập và nộp tờ khai mẫu 01/GTGT và 05/KK-TNCN trên cổng thuedientu.gdt.gov.vn trước 24h00 ngày hạn chót.',
      evidenceRequired: 'Thông báo tiếp nhận và chấp thuận tờ khai điện tử của Tổng cục Thuế kèm Giấy nộp tiền vào NSNN.',
      legalBasis: `Khoản 1 Điều 44 Luật Quản lý thuế số 38/2019/QH14 & Nghị định 126/2020/NĐ-CP`,
      legalDocNumber: '38/2019/QH14',
      legalArticle: 'Điều 44',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['38/2019'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: gtgtCycle,
      calculationMethod: isMonthlyRevenue
        ? 'Doanh thu năm trước > 50 tỷ: Kê khai theo tháng (hạn ngày 20 tháng sau)'
        : 'Doanh thu năm trước <= 50 tỷ: Kê khai theo quý (ngày cuối tháng đầu quý sau: 30/04, 31/07, 31/10, 31/01)',
      missingDataNotice: null,
      suggestedPriority: Priority.urgent,
    });

    // 2. RULE-TAX-TNDN-80: Tạm nộp TNDN 4 quý đạt 80%
    const tndnFact = facts.find((f) => f.key === 'q_tax_corp_2');
    findings.push({
      factId: tndnFact?.id,
      ruleCode: 'RULE-TAX-TNDN-80',
      obligationTitle: 'Tạm nộp thuế Thu nhập doanh nghiệp (TNDN) 4 quý đạt tối thiểu 80%',
      category: 'Kỳ Hàng Quý',
      applicableStatus: ApplicableStatus.applicable,
      actionRequired: 'Ước tính kết quả kinh doanh lũy kế từng quý và nộp tạm thuế TNDN, bảo đảm tổng 4 quý đạt tối thiểu 80% quyết toán.',
      evidenceRequired: 'Chứng từ nộp thuế điện tử vào Ngân sách Nhà nước (Giấy nộp tiền vào NSNN).',
      legalBasis: `Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP sửa đổi Nghị định 126/2020/NĐ-CP`,
      legalDocNumber: '91/2022/NĐ-CP',
      legalArticle: 'Khoản 3 Điều 1',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['91/2022'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'QUARTERLY' as StatutoryCycleType,
      calculationMethod: 'Hạn ngày 30 của tháng đầu quý tiếp theo (30/04, 31/07, 30/10, 31/01).',
      missingDataNotice: null,
      suggestedPriority: Priority.urgent,
    });

    // 3. RULE-TAX-MB: Lệ phí môn bài hàng năm
    findings.push({
      factId: null,
      ruleCode: 'RULE-TAX-MB',
      obligationTitle: 'Kê khai và nộp Lệ phí môn bài hàng năm',
      category: 'Kỳ Cả Năm',
      applicableStatus: ApplicableStatus.applicable,
      actionRequired: 'Nộp tiền lệ phí môn bài vào NSNN chậm nhất ngày 30/01 hàng năm (Miễn năm đầu thành lập).',
      evidenceRequired: 'Giấy nộp tiền lệ phí môn bài tiểu mục 2862, 2863.',
      legalBasis: `Khoản 9 Điều 18 Nghị định 126/2020/NĐ-CP & Nghị định 139/2016/NĐ-CP`,
      legalDocNumber: '139/2016/NĐ-CP',
      legalArticle: 'Khoản 9 Điều 18 NĐ 126/2020',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['139/2016'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'ANNUAL' as StatutoryCycleType,
      calculationMethod: 'Hạn cố định ngày 30/01 hàng năm.',
      missingDataNotice: null,
      suggestedPriority: Priority.high,
    });

    // 4. RULE-LABOR-REPORT-6M: Báo cáo tình hình lao động định kỳ 6 tháng
    findings.push({
      factId: null,
      ruleCode: 'RULE-LABOR-REPORT-6M',
      obligationTitle: 'Báo cáo tình hình thay đổi lao động định kỳ 6 tháng (05/06 & 05/12)',
      category: 'Kỳ 6 Tháng (Bán niên)',
      applicableStatus: org.employeeCount >= 1 ? ApplicableStatus.applicable : ApplicableStatus.not_applicable,
      actionRequired: 'Lập báo cáo tình hình thay đổi lao động gửi Sở LĐ-TB&XH qua Cổng Dịch vụ công Quốc gia.',
      evidenceRequired: 'Giấy xác nhận nộp báo cáo lao động trực tuyến thành công.',
      legalBasis: `Khoản 2 Điều 4 Nghị định 145/2020/NĐ-CP`,
      legalDocNumber: '145/2020/NĐ-CP',
      legalArticle: 'Khoản 2 Điều 4',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['145/2020'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'BIANNUAL_6M' as StatutoryCycleType,
      calculationMethod: 'Trước ngày 05/06 đối với 6 tháng đầu năm và trước ngày 05/12 đối với cả năm.',
      missingDataNotice: null,
      suggestedPriority: Priority.high,
    });

    // 5. RULE-TAX-FCT-10D: Thuế nhà thầu Ads quốc tế (10 ngày)
    findings.push({
      factId: null,
      ruleCode: 'RULE-TAX-FCT-10D',
      obligationTitle: 'Kê khai nộp thuế nhà thầu (FCT) khi chi trả quảng cáo quốc tế (Facebook, Google, TikTok)',
      category: 'Đợt Phát Sinh 10 Ngày',
      applicableStatus: isEcom || isFnb ? ApplicableStatus.applicable : ApplicableStatus.missing_info,
      actionRequired: 'Kê khai và nộp thuế nhà thầu trong vòng 10 ngày kể từ ngày thanh toán phí dịch vụ cho nhà thầu nước ngoài.',
      evidenceRequired: 'Tờ khai thuế nhà thầu Mẫu 01/NTNN kèm chứng từ nộp thuế.',
      legalBasis: `Khoản 3 Điều 44 Luật Quản lý thuế số 38/2019/QH14`,
      legalDocNumber: '38/2019/QH14',
      legalArticle: 'Khoản 3 Điều 44',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['38/2019'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'EVENT_10D' as StatutoryCycleType,
      calculationMethod: 'Trong vòng 10 ngày kể từ ngày thanh toán dịch vụ.',
      missingDataNotice: 'Cần bổ sung ngày phát sinh thanh toán cho nhà cung cấp nước ngoài.',
      suggestedPriority: Priority.high,
    });

    // 6. RULE-CORP-SUSPEND-3D: Thông báo tạm ngừng kinh doanh trước 03 ngày làm việc
    findings.push({
      factId: null,
      ruleCode: 'RULE-CORP-SUSPEND-3D',
      obligationTitle: 'Thông báo tạm ngừng / tiếp tục kinh doanh trước 03 ngày làm việc',
      category: 'Đợt 03 Ngày Làm Việc',
      applicableStatus: ApplicableStatus.verification_required,
      actionRequired: 'Gửi thông báo bằng văn bản đến Phòng ĐKKD - Sở KH&ĐT chậm nhất 03 ngày làm việc trước ngày tạm ngừng hoặc tiếp tục hoạt động.',
      evidenceRequired: 'Giấy biên nhận hồ sơ của Phòng ĐKKD & Thông báo chấp thuận.',
      legalBasis: `Khoản 1 Điều 66 Nghị định 01/2021/NĐ-CP & Điều 19 Nghị định 123/2020/NĐ-CP`,
      legalDocNumber: '01/2021/NĐ-CP',
      legalArticle: 'Khoản 1 Điều 66',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['59/2020'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'EVENT_3D' as StatutoryCycleType,
      calculationMethod: 'Chậm nhất 03 ngày làm việc TRƯỚC ngày dự kiến tạm ngừng kinh doanh.',
      missingDataNotice: 'Chỉ kích hoạt khi doanh nghiệp có kế hoạch tạm ngừng hoạt động.',
      suggestedPriority: Priority.medium,
    });

    // 7. RULE-CORP-AMEND-10D: Đăng ký đổi ĐKKD trong 10 ngày làm việc
    findings.push({
      factId: null,
      ruleCode: 'RULE-CORP-AMEND-10D',
      obligationTitle: 'Đăng ký thay đổi nội dung Giấy chứng nhận ĐKDN trong thời hạn 10 ngày làm việc',
      category: 'Đợt 10 Ngày Làm Việc',
      applicableStatus: ApplicableStatus.applicable,
      actionRequired: 'Thực hiện thủ tục đăng ký thay đổi địa chỉ, người đại diện, vốn, ngành nghề với Sở KH&ĐT trong 10 ngày làm việc.',
      evidenceRequired: 'Giấy chứng nhận đăng ký doanh nghiệp mới được cấp.',
      legalBasis: `Điều 30 Luật Doanh nghiệp 2020 & Khoản 2 Điều 36 Luật QLT 38/2019`,
      legalDocNumber: '59/2020/QH14',
      legalArticle: 'Điều 30',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['59/2020'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'EVENT_10D_BIZ' as StatutoryCycleType,
      calculationMethod: '10 ngày làm việc kể từ ngày phát sinh thay đổi nội dung ĐKDN.',
      missingDataNotice: 'Chờ bổ sung ngày ra biên bản họp / quyết định thay đổi ĐKDN.',
      suggestedPriority: Priority.high,
    });

    // 8. RULE-CORP-CAPITAL-90D: Góp đủ vốn điều lệ trong 90 ngày
    findings.push({
      factId: null,
      ruleCode: 'RULE-CORP-CAPITAL-90D',
      obligationTitle: 'Góp đủ 100% vốn điều lệ đã đăng ký cam kết trong vòng 90 ngày thành lập',
      category: 'Đợt 90 Ngày (Góp Vốn)',
      applicableStatus: isNewlyEstablished ? ApplicableStatus.applicable : ApplicableStatus.not_applicable,
      actionRequired: 'Chủ sở hữu hoặc thành viên chuyển tiền vào tài khoản vốn công ty đủ 100% số vốn đã đăng ký.',
      evidenceRequired: 'Giấy báo Có / Sao kê tài khoản ngân hàng của doanh nghiệp thể hiện nội dung nộp vốn điều lệ.',
      legalBasis: `Khoản 2 Điều 47 & Khoản 2 Điều 75 Luật Doanh nghiệp 2020`,
      legalDocNumber: '59/2020/QH14',
      legalArticle: 'Điều 47, Điều 75',
      legalDocUrl: CORE_LEGAL_DOC_LINKS['59/2020'],
      legalValidity: LegalValidity.in_force,
      resultSource: ResultSource.rule_based,
      cycleType: 'EVENT_90D' as StatutoryCycleType,
      calculationMethod: 'Trong vòng 90 ngày kể từ ngày cấp GCN ĐKDN lần đầu.',
      missingDataNotice: isNewlyEstablished ? 'Cần bổ sung ngày cấp GCN ĐKDN lần đầu để tính hạn chính xác.' : null,
      suggestedPriority: Priority.urgent,
    });

    // 9. RULE-TAX-POS-FNB: Hóa đơn điện tử máy tính tiền F&B
    if (isFnb) {
      findings.push({
        factId: null,
        ruleCode: 'RULE-TAX-POS-FNB',
        obligationTitle: 'Hóa đơn điện tử khởi tạo từ máy tính tiền ngành F&B và bán lẻ',
        category: 'Hóa Đơn & Vận Hành F&B',
        applicableStatus: ApplicableStatus.applicable,
        actionRequired: 'Kết nối máy tính tiền POS với cơ quan thuế để phát hành hóa đơn điện tử cho từng đơn hàng trực tiếp.',
        evidenceRequired: 'Hợp đồng giải pháp HĐĐT máy tính tiền và thông báo chấp nhận mẫu 01/ĐKTĐ-HĐĐT.',
        legalBasis: `Điều 90 Luật QLT 38/2019/QH14 & Thông tư 78/2021/TT-BTC`,
        legalDocNumber: '78/2021/TT-BTC',
        legalArticle: 'Điều 8',
        legalDocUrl: CORE_LEGAL_DOC_LINKS['78/2021'],
        legalValidity: LegalValidity.in_force,
        resultSource: ResultSource.rule_based,
        cycleType: 'EVENT_10D' as StatutoryCycleType,
        calculationMethod: 'Áp dụng liên tục tại thời điểm phát sinh cung cấp dịch vụ ăn uống.',
        missingDataNotice: null,
        suggestedPriority: Priority.urgent,
      });
    }

    // 10. RULE-LABOR-10TO50: Đăng ký Nội quy lao động khi từ 10 nhân sự
    if (hasEmployees) {
      findings.push({
        factId: null,
        ruleCode: 'RULE-LABOR-10TO50',
        obligationTitle: 'Đăng ký Nội quy lao động trong vòng 10 ngày (Áp dụng từ 10 nhân sự)',
        category: 'Đợt Phát Sinh 10 Ngày',
        applicableStatus: ApplicableStatus.applicable,
        actionRequired: 'Nộp hồ sơ đăng ký Nội quy lao động tại Phòng Lao động - Thương binh và Xã hội trong 10 ngày kể từ ngày ban hành.',
        evidenceRequired: 'Biên nhận hồ sơ và Thông báo chấp thuận đăng ký Nội quy lao động.',
        legalBasis: `Điều 118 & Điều 119 Bộ luật Lao động 2019`,
        legalDocNumber: '45/2019/QH14',
        legalArticle: 'Điều 118, Điều 119',
        legalDocUrl: CORE_LEGAL_DOC_LINKS['45/2019'],
        legalValidity: LegalValidity.in_force,
        resultSource: ResultSource.rule_based,
        cycleType: 'EVENT_10D' as StatutoryCycleType,
        calculationMethod: 'Trong vòng 10 ngày kể từ ngày người sử dụng lao động ban hành nội quy lao động.',
        missingDataNotice: 'Chờ bổ sung ngày ban hành nội quy lao động.',
        suggestedPriority: Priority.urgent,
      });
    }

    return findings;
  }

  /**
   * Định dạng dữ liệu Finding kèm danh mục task khuyến nghị để gửi cho Frontend
   */
  private formatFindings(findings: any[]): AuditFindingResponse[] {
    return findings.map((f) => {
      const deadlineInfo = calculateComplianceDeadline(f.ruleCode, f.cycleType, null, new Date());
      return {
        id: f.id,
        auditId: f.auditId,
        factId: f.factId,
        ruleCode: f.ruleCode,
        obligationTitle: f.obligationTitle,
        category: f.category,
        applicableStatus: f.applicableStatus,
        actionRequired: f.actionRequired,
        evidenceRequired: f.evidenceRequired,
        legalBasis: f.legalBasis,
        legalDocNumber: f.legalDocNumber,
        legalArticle: f.legalArticle,
        legalDocUrl: f.legalDocUrl || matchCoreLegalDocUrl(f.legalBasis),
        legalValidity: f.legalValidity,
        verifiedAt: f.verifiedAt ? new Date(f.verifiedAt).toISOString() : null,
        resultSource: f.resultSource,
        cycleType: f.cycleType,
        calculationMethod: f.calculationMethod,
        missingDataNotice: f.missingDataNotice,
        suggestedPriority: f.suggestedPriority,
        tasks: [
          {
            code: `TASK-${f.ruleCode.replace('RULE-', '')}-01`,
            title: `Thực hiện đối soát & hoàn thiện hồ sơ cho [${f.obligationTitle}]`,
            description: f.actionRequired,
            priority: f.suggestedPriority,
            dueDate: deadlineInfo.dueDate ? deadlineInfo.dueDate.toISOString().slice(0, 10) : null,
            requiresEventDate: deadlineInfo.requiresEventDate,
          },
          {
            code: `TASK-${f.ruleCode.replace('RULE-', '')}-02`,
            title: `Tập hợp minh chứng: ${f.evidenceRequired.slice(0, 70)}...`,
            description: `Tải lên tài liệu chứng minh: ${f.evidenceRequired}`,
            priority: Priority.medium,
            dueDate: deadlineInfo.dueDate ? deadlineInfo.dueDate.toISOString().slice(0, 10) : null,
            requiresEventDate: deadlineInfo.requiresEventDate,
          },
        ],
      };
    });
  }
}
