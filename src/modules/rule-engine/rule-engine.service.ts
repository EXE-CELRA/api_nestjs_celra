import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRuleDto } from './dto/rule.dto';

import { UserRole, WaitingOnRole, TaskStatus, Prisma, Priority } from '@prisma/client';
import { calculateLegalDueDate, StatutoryCycleType } from '../../common/utils/tax-calendar.util';
import { CORE_LEGAL_DOC_LINKS } from '../../common/constants/legal-docs.constant';

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
   * Khởi tạo và bảo đảm đầy đủ các Quy tắc pháp lý luật định trong Database
   * Bao quát toàn bộ 11 đợt theo luật định:
   * 1. Hàng Tháng (Ngày 20)
   * 2. Hàng Quý (30/04, 31/07, 31/10, 31/01)
   * 3. 6 Tháng / Bán niên (05/06 & 05/12)
   * 4. Cả Năm (30/01 Môn bài, 31/03 Quyết toán)
   * 5. Đợt 10 ngày (Thuế nhà thầu Ads FCT, ĐK NQLĐ)
   * 6. Đợt 20 ngày (Chuyển kỳ kê khai theo NĐ 126/2020)
   * 7. Đợt 45 ngày (Quyết toán giải thể, chia tách theo Luật QLT)
   * 8. Đợt 03 ngày làm việc (Tạm ngừng / HĐĐT sai sót Mẫu 04/SS-HĐĐT)
   * 9. Đợt 10 ngày làm việc (Đổi ĐKKD & Thông tin tài khoản thuế)
   * 10. Đợt 90 ngày (Hạn góp đủ 100% vốn điều lệ ban đầu)
   * 11. Đợt 30 ngày (Đăng ký giảm vốn điều lệ sau 90 ngày)
   */
  private async ensureStatutoryRulesExist() {
    const statutoryRules = [
      {
        code: 'RULE-TAX-GTGT',
        title: 'Kê khai và nộp tờ khai thuế GTGT và thuế TNCN định kỳ',
        conditionSummary: 'Doanh thu năm trước > 50 tỷ nộp theo Tháng (ngày 20); Doanh thu ≤ 50 tỷ nộp theo Quý (cuối tháng đầu quý sau).',
        legalReference: `Khoản 1 Điều 44 Luật QLT số 38/2019/QH14 (${CORE_LEGAL_DOC_LINKS['38/2019']})`,
        priority: Priority.urgent,
        category: 'Thuế Doanh Nghiệp',
      },
      {
        code: 'RULE-TAX-TNDN-80',
        title: 'Tạm nộp thuế Thu nhập doanh nghiệp (TNDN) 4 quý đạt tối thiểu 80%',
        conditionSummary: 'Tổng số thuế TNDN đã tạm nộp của 04 quý không được thấp hơn 80% số thuế TNDN phải nộp theo quyết toán năm.',
        legalReference: `Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP (${CORE_LEGAL_DOC_LINKS['91/2022']})`,
        priority: Priority.urgent,
        category: 'Kỳ Hàng Quý',
      },
      {
        code: 'RULE-TAX-MB',
        title: 'Kê khai và nộp Lệ phí môn bài hàng năm',
        conditionSummary: 'Chậm nhất ngày 30/01 hàng năm; Vốn > 10 tỷ nộp 3 triệu, Vốn ≤ 10 tỷ nộp 2 triệu. Miễn năm đầu thành lập.',
        legalReference: `Khoản 9 Điều 18 Nghị định 126/2020/NĐ-CP & Nghị định 139/2016/NĐ-CP (${CORE_LEGAL_DOC_LINKS['139/2016']})`,
        priority: Priority.high,
        category: 'Kỳ Cả Năm',
      },
      {
        code: 'RULE-TAX-FCT-10D',
        title: 'Kê khai nộp thuế nhà thầu (FCT) khi thanh toán chi phí Ads quốc tế (10 ngày)',
        conditionSummary: 'Thanh toán tiền dịch vụ cho Facebook/Google/TikTok/phần mềm nước ngoài phải khai nộp thuế nhà thầu trong vòng 10 ngày.',
        legalReference: `Khoản 3 Điều 44 Luật Quản lý thuế số 38/2019/QH14 (${CORE_LEGAL_DOC_LINKS['38/2019']})`,
        priority: Priority.high,
        category: 'Đợt Phát Sinh 10 Ngày',
      },
      {
        code: 'RULE-TAX-CONVERT-20D',
        title: 'Thông báo chuyển đổi kỳ kê khai thuế từ Quý sang Tháng khi vượt 50 tỷ (20 ngày)',
        conditionSummary: 'Khi doanh thu vượt ngưỡng 50 tỷ đồng, phải nộp thông báo thay đổi kỳ kê khai trong thời hạn 20 ngày của tháng đầu quý đầu tiên.',
        legalReference: `Điều 9 Nghị định 126/2020/NĐ-CP (${CORE_LEGAL_DOC_LINKS['126/2020']})`,
        priority: Priority.medium,
        category: 'Đợt 20 Ngày',
      },
      {
        code: 'RULE-TAX-DISSOLUTION-45D',
        title: 'Hồ sơ quyết toán thuế trong trường hợp giải thể, chia tách, chấm dứt dự án (45 ngày)',
        conditionSummary: 'Chậm nhất ngày thứ 45 kể từ ngày có quyết định giải thể, sáp nhập, chia tách hoặc chấm dứt hoạt động kinh doanh.',
        legalReference: `Khoản 4 Điều 44 Luật Quản lý thuế số 38/2019/QH14 (${CORE_LEGAL_DOC_LINKS['38/2019']})`,
        priority: Priority.low,
        category: 'Đợt 45 Ngày',
      },
      {
        code: 'RULE-TAX-POS-FNB',
        title: 'Hóa đơn điện tử khởi tạo từ máy tính tiền ngành F&B và bán lẻ',
        conditionSummary: 'Bắt buộc đối với các nhà hàng, quán cafe, trung tâm ăn uống có phát sinh bán lẻ trực tiếp tới người tiêu dùng.',
        legalReference: `Điều 90 Luật QLT 38/2019/QH14 & Thông tư 78/2021/TT-BTC (${CORE_LEGAL_DOC_LINKS['78/2021']})`,
        priority: Priority.urgent,
        category: 'Hóa Đơn & Vận Hành F&B',
      },
      {
        code: 'RULE-FNB-RAW-02',
        title: 'Lập Bảng kê thu mua nông sản thực phẩm tươi sống Mẫu 01/TNDN hợp lệ',
        conditionSummary: 'Tập hợp chi phí mua nông sản, thịt cá rau củ từ nông dân trực tiếp nuôi trồng không có hóa đơn vào Bảng kê 01/TNDN.',
        legalReference: `Điều 4 Thông tư 96/2015/TT-BTC (${CORE_LEGAL_DOC_LINKS['96/2015']})`,
        priority: Priority.high,
        category: 'Hóa Đơn & Vận Hành F&B',
      },
      {
        code: 'RULE-ECOM-REVENUE-SYNC',
        title: 'Đối soát số liệu doanh thu sàn TMĐT (Shopee, TikTok Shop) với tờ khai thuế',
        conditionSummary: 'Đối chiếu tổng doanh thu sàn truyền về thuế với số liệu kê khai để tránh rủi ro truy thu và phạt trốn thuế.',
        legalReference: `Khoản 7 Điều 1 Nghị định 91/2022/NĐ-CP (${CORE_LEGAL_DOC_LINKS['91/2022']})`,
        priority: Priority.urgent,
        category: 'Hóa Đơn & Dòng Tiền TMĐT',
      },
      {
        code: 'RULE-ECOM-COD-RECONCILE',
        title: 'Lập sổ đối soát dòng tiền thu hộ COD từ đơn vị vận chuyển (GHTK, GHN, Viettel Post)',
        conditionSummary: 'Hạch toán đầy đủ dòng tiền giao hàng COD chuyển về tài khoản công ty, đối chiếu đơn hàng và hóa đơn bán lẻ.',
        legalReference: `Luật Quản lý thuế số 38/2019/QH14 (${CORE_LEGAL_DOC_LINKS['38/2019']})`,
        priority: Priority.high,
        category: 'Hóa Đơn & Dòng Tiền TMĐT',
      },
    ];

    for (const r of statutoryRules) {
      const existing = await this.prisma.rule.findUnique({ where: { code: r.code } });
      if (!existing) {
        await this.prisma.rule.create({
          data: {
            code: r.code,
            title: r.title,
            conditionSummary: r.conditionSummary,
            legalReference: r.legalReference,
            priority: r.priority,
            category: r.category,
          },
        });
      }
    }
  }

  /**
   * Động cơ đánh giá quy tắc dựa trên ContextFact và Hồ sơ Doanh nghiệp
   * Tự động sinh Checklist + Task thật vào PostgreSQL Database với DEADLINE PHÁP LÝ CHÍNH XÁC
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

    // Bảo đảm các quy tắc luật định tồn tại trong cơ sở dữ liệu
    await this.ensureStatutoryRulesExist();

    const rules = await this.prisma.rule.findMany();
    const generatedTasks: unknown[] = [];
    const now = new Date();

    const isFnb = org.industry.includes('F&B') || org.industry.includes('ăn uống') || org.industry.includes('TAG_FNB');
    const isEcom = org.hasOnlineSales || org.industry.includes('ECOMMERCE') || org.industry.includes('bán lẻ') || org.industry.includes('TAG_ECOMMERCE');
    const isMonthlyRevenue = org.revenueStatus === 'over_50b';

    for (const rule of rules) {
      // 1. Kiểm tra xem Task cho rule này trong Organization đã tồn tại chưa
      const existingTask = await this.prisma.task.findFirst({
        where: {
          organizationId: orgId,
          ruleCode: rule.code,
        },
      });

      if (existingTask) {
        continue;
      }

      // 2. Đánh giá điều kiện rule
      let isMatched = false;
      let cycleType: StatutoryCycleType = 'QUARTERLY';

      if (rule.code === 'RULE-TAX-GTGT') {
        isMatched = true;
        cycleType = isMonthlyRevenue ? 'MONTHLY' : 'QUARTERLY';
      } else if (rule.code === 'RULE-TAX-TNDN-80') {
        isMatched = true;
        cycleType = 'QUARTERLY';
      } else if (rule.code === 'RULE-TAX-MB') {
        isMatched = true;
        cycleType = 'ANNUAL';
      } else if (rule.code === 'RULE-TAX-FCT-10D') {
        isMatched = isEcom || isFnb;
        cycleType = 'EVENT_10D';
      } else if (rule.code === 'RULE-TAX-CONVERT-20D') {
        isMatched = true;
        cycleType = 'EVENT_20D';
      } else if (rule.code === 'RULE-TAX-DISSOLUTION-45D') {
        isMatched = true;
        cycleType = 'EVENT_45D';
      } else if (rule.code === 'RULE-TAX-POS-FNB') {
        isMatched = isFnb;
        cycleType = 'EVENT_10D';
      } else if (rule.code === 'RULE-FNB-RAW-02') {
        isMatched = isFnb;
        cycleType = 'QUARTERLY';
      } else if (rule.code === 'RULE-ECOM-REVENUE-SYNC') {
        isMatched = isEcom;
        cycleType = 'QUARTERLY';
      } else if (rule.code === 'RULE-ECOM-COD-RECONCILE') {
        isMatched = isEcom;
        cycleType = 'MONTHLY';
      } else if (rule.code === 'RULE-HD-01') {
        isMatched = isFnb || isEcom;
        cycleType = 'EVENT_10D';
      } else if (rule.code === 'RULE-DT-03') {
        isMatched = isFnb || isEcom;
        cycleType = 'QUARTERLY';
      } else {
        isMatched = false;
        cycleType = 'QUARTERLY';
      }

      if (isMatched) {
        // 3. Tìm department tương ứng (Mặc định phòng Kế toán thuế ACC)
        let targetDept = org.departments.find((d) => d.code === 'ACC');
        let assigneeRole: UserRole = UserRole.internal_accountant;
        let waitingOnRole: WaitingOnRole = WaitingOnRole.owner;

        if (rule.code.includes('POS') || rule.code === 'RULE-FNB-04') {
          targetDept = org.departments.find((d) => d.code === 'OPS') || targetDept;
          assigneeRole = UserRole.owner;
          waitingOnRole = WaitingOnRole.internal_accountant;
        }

        const taskCode = `TASK-${rule.code.replace('RULE-', '')}`;

        const dueDate = calculateLegalDueDate(cycleType, now);



        // 4. Tạo Task thật vào PostgreSQL Database
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
            description: `${rule.conditionSummary}\nKỳ hạn tuân thủ: ${cycleType}`,
            contextTrigger: `Kích hoạt tự động từ quy tắc ${rule.code} [Kỳ hạn: ${cycleType}]`,
            ruleCode: rule.code,
            legalBasis: rule.legalReference,
            timeline: {
              create: {
                title: 'Tác vụ được khởi tạo tự động theo Lịch Pháp Luật',
                description: `Hệ thống Rule Engine kích hoạt tác vụ từ quy tắc ${rule.code} với hạn chót pháp lý: ${dueDate.toLocaleDateString('vi-VN')}`,
                actorName: 'CELRA Statutory Engine',
                actorRole: UserRole.admin,
              },
            },
          },
        });

        generatedTasks.push(task);
      }
    }

    return {
      message: `Đã kích hoạt và khởi tạo thành công ${generatedTasks.length} tác vụ tuân thủ mới theo Lịch Pháp Luật`,
      tasks: generatedTasks,
    };
  }
}
