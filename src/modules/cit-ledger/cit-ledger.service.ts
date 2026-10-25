import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  StatutoryCycleType,
  Priority,
  UserRole,
  TaskStatus,
  TimelineEventType,
} from '@prisma/client';
import {
  QueryCitSummaryDto,
  QueryCitRevenueDto,
  CreateCitRevenueDto,
  UpdateCitRevenueDto,
  QueryCitExpenseDto,
  CreateCitExpenseDto,
  UpdateCitExpenseDto,
  BatchImportRevenuesDto,
  BatchImportExpensesDto,
  SyncCitComplianceChecklistDto,
} from './dto/cit-ledger.dto';

export interface CitB4Evaluation {
  isDisallowedB4: boolean;
  disallowedReason?: string;
  legalBasis?: string;
}

@Injectable()
export class CitLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper rà soát điều kiện Mục B4 theo chuẩn Thông tư 96/2015/TT-BTC
   */
  public evaluateB4Rule(
    category: string,
    amount: number,
    paymentMethod: string,
    hasInvoice: string,
    businessModel?: string,
  ): CitB4Evaluation {
    const catLower = (category || '').toLowerCase();
    const payLower = (paymentMethod || '').toLowerCase();
    const invLower = (hasInvoice || '').toLowerCase();

    const isCash = payLower.includes('tiền mặt') || payLower.includes('cash');
    const hasNoInv = invLower.includes('không') || invLower.includes('no') || invLower.includes('chưa');

    // 1. Chi phí không có hóa đơn chứng từ hợp pháp
    if (hasNoInv && !catLower.includes('lương')) {
      return {
        isDisallowedB4: true,
        disallowedReason: 'Chi phí không có hóa đơn chứng từ hợp pháp.',
        legalBasis: 'Điểm 2.1 Khoản 2 Điều 6 TT 78/2014/TT-BTC (sửa đổi bởi Điều 4 TT 96/2015/TT-BTC)',
      };
    }

    // 2. Hóa đơn từ 20 triệu trở lên thanh toán tiền mặt
    if (amount >= 20000000 && isCash) {
      return {
        isDisallowedB4: true,
        disallowedReason: 'Hóa đơn ≥ 20 triệu thanh toán tiền mặt (thiếu chứng từ ngân hàng).',
        legalBasis: 'Điều 4 Thông tư 96/2015/TT-BTC & Điều 15 TT 219/2013/TT-BTC',
      };
    }

    // 3. Tiền lương của chủ công ty TNHH 1TV
    const isOwnerModel = !businessModel || businessModel.includes('TNHH_1TV') || businessModel.includes('1TV') || businessModel.includes('Một thành viên');
    if (
      isOwnerModel &&
      (catLower.includes('lương chủ') ||
        catLower.includes('lương giám đốc') ||
        catLower.includes('lương chủ tịch') ||
        catLower.includes('thù lao chủ'))
    ) {
      return {
        isDisallowedB4: true,
        disallowedReason: 'Lương/thù lao của chủ sở hữu công ty TNHH một thành viên do cá nhân làm chủ.',
        legalBasis: 'Tiết d Điểm 2.6 Khoản 2 Điều 6 TT 78/2014/TT-BTC (sửa đổi bởi TT 96/2015/TT-BTC)',
      };
    }

    return {
      isDisallowedB4: false,
    };
  }

  /**
   * 1. TÍNH TOÁN KPI TỔNG HỢP TOÀN KỲ TẠI BACKEND (GRAND TOTAL)
   */
  async getSummary(orgId: string, query: QueryCitSummaryDto) {
    const year = Number(query.year);
    const isAll = query.quarter === 'ALL' || String(query.quarter).toUpperCase() === 'ALL';
    const quarterFilter = isAll ? {} : { quarter: Number(query.quarter) };

    const whereBase = {
      organizationId: orgId,
      year,
      ...quarterFilter,
    };

    // Lấy doanh thu
    const [revAgg, revCount] = await Promise.all([
      this.prisma.citRevenue.aggregate({
        where: whereBase,
        _sum: { amount: true },
      }),
      this.prisma.citRevenue.count({ where: whereBase }),
    ]);

    // Lấy chi phí
    const [expAgg, expCount, expDisallowedAgg, expDisallowedCount] = await Promise.all([
      this.prisma.citExpense.aggregate({
        where: whereBase,
        _sum: { amount: true },
      }),
      this.prisma.citExpense.count({ where: whereBase }),
      this.prisma.citExpense.aggregate({
        where: { ...whereBase, isDisallowedB4: true },
        _sum: { amount: true },
      }),
      this.prisma.citExpense.count({
        where: { ...whereBase, isDisallowedB4: true },
      }),
    ]);

    const totalRevenue = revAgg._sum.amount || 0;
    const totalAccountingExpense = expAgg._sum.amount || 0;
    const totalDisallowedExpense = expDisallowedAgg._sum.amount || 0;
    const totalDeductibleExpense = Math.max(0, totalAccountingExpense - totalDisallowedExpense);

    // Tính toán thuế TNDN theo quy định
    const assessableIncome = Math.max(0, totalRevenue - totalDeductibleExpense);
    const taxRate = 0.20; // Thuế suất phổ thông 20%
    const estimatedTaxAmount = Math.round(assessableIncome * taxRate);
    const statutoryPrepayment80 = Math.round(estimatedTaxAmount * 0.80);
    const accountingProfitBeforeTax = totalRevenue - totalAccountingExpense;
    const netProfitAfterTax = totalRevenue - totalAccountingExpense - estimatedTaxAmount;

    return {
      year,
      quarter: isAll ? 'ALL' : Number(query.quarter),
      totalRevenue,
      revenueCount: revCount,
      totalAccountingExpense,
      expenseCount: expCount,
      totalDisallowedExpense,
      disallowedCount: expDisallowedCount,
      totalDeductibleExpense,
      assessableIncome,
      taxRate,
      estimatedTaxAmount,
      statutoryPrepayment80,
      accountingProfitBeforeTax,
      netProfitAfterTax,
    };
  }

  /**
   * 2. PHÂN TRANG & TÌM KIẾM BẢNG DOANH THU (SERVER-SIDE)
   */
  async getRevenues(orgId: string, query: QueryCitRevenueDto) {
    const year = Number(query.year);
    const isAll = query.quarter === 'ALL' || String(query.quarter).toUpperCase() === 'ALL';
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: orgId,
      year,
      ...(isAll ? {} : { quarter: Number(query.quarter) }),
    };

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { invoiceNo: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.citRevenue.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.citRevenue.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * 3. PHÂN TRANG, TÌM KIẾM & BỘ LỌC B4 BẢNG CHI PHÍ (SERVER-SIDE)
   */
  async getExpenses(orgId: string, query: QueryCitExpenseDto) {
    const year = Number(query.year);
    const isAll = query.quarter === 'ALL' || String(query.quarter).toUpperCase() === 'ALL';
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: orgId,
      year,
      ...(isAll ? {} : { quarter: Number(query.quarter) }),
    };

    if (query.filterB4 === 'DISALLOWED') {
      where.isDisallowedB4 = true;
    } else if (query.filterB4 === 'DEDUCTIBLE') {
      where.isDisallowedB4 = false;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { category: { contains: s, mode: 'insensitive' } },
        { note: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.citExpense.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.citExpense.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ===================== CRUD DOANH THU =====================

  async createRevenue(orgId: string, dto: CreateCitRevenueDto) {
    return this.prisma.citRevenue.create({
      data: {
        organizationId: orgId,
        year: Number(dto.year),
        quarter: Number(dto.quarter),
        date: dto.date,
        invoiceNo: dto.invoiceNo || null,
        description: dto.description,
        amount: Number(dto.amount),
      },
    });
  }

  async updateRevenue(orgId: string, id: string, dto: UpdateCitRevenueDto) {
    const record = await this.prisma.citRevenue.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy khoản doanh thu');
    }
    return this.prisma.citRevenue.update({
      where: { id },
      data: {
        ...(dto.date ? { date: dto.date } : {}),
        ...(dto.invoiceNo !== undefined ? { invoiceNo: dto.invoiceNo } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.amount !== undefined ? { amount: Number(dto.amount) } : {}),
      },
    });
  }

  async deleteRevenue(orgId: string, id: string) {
    const record = await this.prisma.citRevenue.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy khoản doanh thu');
    }
    return this.prisma.citRevenue.delete({ where: { id } });
  }

  async batchImportRevenues(orgId: string, dto: BatchImportRevenuesDto) {
    if (!dto.items || !Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('Danh sách doanh thu nạp vào trống');
    }
    const year = Number(dto.year);
    const quarter = Number(dto.quarter);

    const records = dto.items.map((item) => ({
      organizationId: orgId,
      year,
      quarter,
      date: item.date || '',
      invoiceNo: item.invoiceNo || null,
      description: item.description || '',
      amount: Number(item.amount) || 0,
    }));

    return this.prisma.citRevenue.createMany({
      data: records,
    });
  }

  // ===================== CRUD CHI PHÍ =====================

  async createExpense(orgId: string, dto: CreateCitExpenseDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { businessModel: true },
    });

    const b4 = this.evaluateB4Rule(
      dto.category,
      Number(dto.amount),
      dto.paymentMethod,
      dto.hasInvoice,
      org?.businessModel,
    );

    return this.prisma.citExpense.create({
      data: {
        organizationId: orgId,
        year: Number(dto.year),
        quarter: Number(dto.quarter),
        date: dto.date,
        category: dto.category,
        amount: Number(dto.amount),
        paymentMethod: dto.paymentMethod,
        hasInvoice: dto.hasInvoice,
        note: dto.note || null,
        isDisallowedB4: b4.isDisallowedB4,
        disallowedReason: b4.disallowedReason || null,
        legalBasis: b4.legalBasis || null,
      },
    });
  }

  async updateExpense(orgId: string, id: string, dto: UpdateCitExpenseDto) {
    const record = await this.prisma.citExpense.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy khoản chi phí');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { businessModel: true },
    });

    const newCategory = dto.category !== undefined ? dto.category : record.category;
    const newAmount = dto.amount !== undefined ? Number(dto.amount) : record.amount;
    const newPayMethod = dto.paymentMethod !== undefined ? dto.paymentMethod : record.paymentMethod;
    const newHasInv = dto.hasInvoice !== undefined ? dto.hasInvoice : record.hasInvoice;

    const b4 = this.evaluateB4Rule(newCategory, newAmount, newPayMethod, newHasInv, org?.businessModel);

    return this.prisma.citExpense.update({
      where: { id },
      data: {
        ...(dto.date ? { date: dto.date } : {}),
        category: newCategory,
        amount: newAmount,
        paymentMethod: newPayMethod,
        hasInvoice: newHasInv,
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        isDisallowedB4: b4.isDisallowedB4,
        disallowedReason: b4.disallowedReason || null,
        legalBasis: b4.legalBasis || null,
      },
    });
  }

  async deleteExpense(orgId: string, id: string) {
    const record = await this.prisma.citExpense.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy khoản chi phí');
    }
    return this.prisma.citExpense.delete({ where: { id } });
  }

  async batchImportExpenses(orgId: string, dto: BatchImportExpensesDto) {
    if (!dto.items || !Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('Danh sách chi phí nạp vào trống');
    }
    const year = Number(dto.year);
    const quarter = Number(dto.quarter);

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { businessModel: true },
    });

    const records = dto.items.map((item) => {
      const amount = Number(item.amount) || 0;
      const b4 = this.evaluateB4Rule(
        item.category,
        amount,
        item.paymentMethod,
        item.hasInvoice,
        org?.businessModel,
      );
      return {
        organizationId: orgId,
        year,
        quarter,
        date: item.date || '',
        category: item.category || '',
        amount,
        paymentMethod: item.paymentMethod || 'Chuyển khoản',
        hasInvoice: item.hasInvoice || 'Có',
        note: item.note || null,
        isDisallowedB4: b4.isDisallowedB4,
        disallowedReason: b4.disallowedReason || null,
        legalBasis: b4.legalBasis || null,
      };
    });

    return this.prisma.citExpense.createMany({
      data: records,
    });
  }

  /**
   * Xóa sạch dữ liệu của 1 Quý để nạp lại
   */
  async clearPeriod(orgId: string, year: number, quarter: number, type: 'revenue' | 'expense' | 'both') {
    const where = {
      organizationId: orgId,
      year: Number(year),
      quarter: Number(quarter),
    };

    if (type === 'revenue' || type === 'both') {
      await this.prisma.citRevenue.deleteMany({ where });
    }
    if (type === 'expense' || type === 'both') {
      await this.prisma.citExpense.deleteMany({ where });
    }
    return { success: true, message: `Đã dọn dẹp dữ liệu Quý ${quarter}/${year}` };
  }

  /**
   * Tính toán ngày hạn chót luật định cho thuế TNDN (Luật số 38/2019/QH14 & NĐ 126/2020/NĐ-CP)
   * Tự động chuyển dời nếu trùng ngày nghỉ lễ/cuối tuần sang ngày làm việc tiếp theo.
   */
  public getStatutoryDueDate(quarter: number | string, year: number): Date {
    const qStr = String(quarter);
    let d: Date;

    if (qStr === '1') {
      // 30/04 & 01/05 luôn là ngày nghỉ lễ toàn quốc.
      // Theo Điều 8 NĐ 126/2020/NĐ-CP, hạn nộp chuyển sang ngày làm việc tiếp theo (sớm nhất là 02/05)
      d = new Date(year, 4, 2, 23, 59, 59);
    } else if (qStr === '2') {
      // Quý 2: 31/07
      d = new Date(year, 6, 31, 23, 59, 59);
    } else if (qStr === '3') {
      // Quý 3: 31/10
      d = new Date(year, 9, 31, 23, 59, 59);
    } else if (qStr === '4') {
      // Quý 4: 31/01 năm kế tiếp
      d = new Date(year + 1, 0, 31, 23, 59, 59);
    } else {
      // Quyết toán năm (ALL): 31/03 năm kế tiếp
      d = new Date(year + 1, 2, 31, 23, 59, 59);
    }

    // Nếu rơi vào Thứ Bảy (6) hoặc Chủ Nhật (0), chuyển sang Thứ Hai làm việc tiếp theo
    const day = d.getDay();
    if (day === 6) {
      d.setDate(d.getDate() + 2);
    } else if (day === 0) {
      d.setDate(d.getDate() + 1);
    }

    return d;
  }

  /**
   * Tạo hoặc đồng bộ Checklist & Task Tuân thủ Hạn Nộp Thuế TNDN 4 Quý + Quyết toán năm
   */
  async syncComplianceChecklist(orgId: string, dto: SyncCitComplianceChecklistDto) {
    const {
      year,
      quarter,
      estimatedTaxAmount = 0,
      revenueCount = 0,
      expenseCount = 0,
      disallowedExpenseAmount = 0,
    } = dto;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { memberships: true },
    });
    if (!org) {
      throw new NotFoundException('Không tìm thấy tổ chức doanh nghiệp');
    }

    // 1. Tìm hoặc khởi tạo Checklist khung năm
    const checklistCode = `CIT_COMPLIANCE_${year}`;
    let checklist = await this.prisma.checklist.findFirst({
      where: { organizationId: orgId, code: checklistCode },
      include: { items: true, tasks: true },
    });

    if (!checklist) {
      checklist = await this.prisma.checklist.create({
        data: {
          organizationId: orgId,
          code: checklistCode,
          title: `Lộ trình Tuân thủ & Hạn Nộp Thuế TNDN Năm ${year}`,
          category: 'Thuế & Kế Toán',
          status: 'active',
        },
        include: { items: true, tasks: true },
      });
    }

    // 2. Cấu hình 5 mốc nhiệm vụ chuẩn (Q1, Q2, Q3, Q4, Quyết toán năm)
    const quartersConfig = [
      {
        q: 1,
        code: `CIT_${year}_Q1`,
        title: `Tạm nộp thuế TNDN Quý 1/${year}`,
        cycleType: StatutoryCycleType.QUARTERLY,
        ruleCode: 'CIT_PREPAY_Q1',
        legalBasis:
          'Khoản 1 Điều 55 Luật QLT số 38/2019/QH14 & Khoản 3 Điều 1 NĐ 91/2022/NĐ-CP (Hạn chót: 30/04)',
        dueDate: this.getStatutoryDueDate(1, year),
      },
      {
        q: 2,
        code: `CIT_${year}_Q2`,
        title: `Tạm nộp thuế TNDN Quý 2/${year}`,
        cycleType: StatutoryCycleType.QUARTERLY,
        ruleCode: 'CIT_PREPAY_Q2',
        legalBasis:
          'Khoản 1 Điều 55 Luật QLT số 38/2019/QH14 & Khoản 3 Điều 1 NĐ 91/2022/NĐ-CP (Hạn chót: 31/07)',
        dueDate: this.getStatutoryDueDate(2, year),
      },
      {
        q: 3,
        code: `CIT_${year}_Q3`,
        title: `Tạm nộp thuế TNDN Quý 3/${year}`,
        cycleType: StatutoryCycleType.QUARTERLY,
        ruleCode: 'CIT_PREPAY_Q3',
        legalBasis:
          'Khoản 1 Điều 55 Luật QLT số 38/2019/QH14 & Khoản 3 Điều 1 NĐ 91/2022/NĐ-CP (Hạn chót: 31/10)',
        dueDate: this.getStatutoryDueDate(3, year),
      },
      {
        q: 4,
        code: `CIT_${year}_Q4`,
        title: `Tạm nộp thuế TNDN Quý 4/${year}`,
        cycleType: StatutoryCycleType.QUARTERLY,
        ruleCode: 'CIT_PREPAY_Q4',
        legalBasis:
          'Khoản 1 Điều 55 Luật QLT số 38/2019/QH14 & NĐ 91/2022/NĐ-CP (Tổng 4 quý ≥ 80%, hạn chót: 31/01)',
        dueDate: this.getStatutoryDueDate(4, year),
      },
      {
        q: 'ALL',
        code: `CIT_${year}_ANNUAL`,
        title: `Quyết toán thuế TNDN & BCTC Năm ${year}`,
        cycleType: StatutoryCycleType.ANNUAL,
        ruleCode: 'CIT_ANNUAL_FINALIZE',
        legalBasis:
          'Điểm a Khoản 2 Điều 44 Luật Quản lý Thuế số 38/2019/QH14 (Hạn chót: 31/03 năm kế tiếp)',
        dueDate: this.getStatutoryDueDate('ALL', year),
      },
    ];

    const syncedTasks = [];

    for (const cfg of quartersConfig) {
      // 2.1. Đảm bảo ChecklistItem tồn tại
      let item = checklist.items.find((it) => it.ruleCode === cfg.ruleCode);
      if (!item) {
        item = await this.prisma.checklistItem.create({
          data: {
            checklistId: checklist.id,
            organizationId: orgId,
            ruleCode: cfg.ruleCode,
            title: cfg.title,
            cycleType: cfg.cycleType,
            legalBasis: cfg.legalBasis,
            evidenceRequirement: 'Giấy nộp tiền vào Ngân sách Nhà nước (Tiểu mục 1052)',
            nextDueDate: cfg.dueDate,
            isActive: true,
          },
        });
      }

      // 2.2. Tìm hoặc tạo Task tương ứng
      let task = await this.prisma.task.findFirst({
        where: {
          organizationId: orgId,
          code: cfg.code,
        },
      });

      const isCurrentQuarter = String(cfg.q) === String(quarter);

      if (isCurrentQuarter) {
        // Quý vừa import Excel: Cập nhật số tiền thực tế và chuyển sang in_progress (Chờ nộp)
        const formattedAmount = Number(estimatedTaxAmount || 0).toLocaleString('vi-VN');
        const formattedDisallowed = Number(disallowedExpenseAmount || 0).toLocaleString('vi-VN');
        const formattedDate = cfg.dueDate.toLocaleDateString('vi-VN');
        const description = `Thuế TNDN tạm nộp ước tính: ${formattedAmount} VNĐ (Từ file Excel: ${revenueCount} khoản thu, ${expenseCount} khoản chi; Chi phí loại trừ B4: ${formattedDisallowed} VNĐ). Cần nộp qua Cổng eTax trước ngày ${formattedDate}.`;

        const calculationBasis = {
          estimatedTaxAmount,
          revenueCount,
          expenseCount,
          disallowedExpenseAmount,
          updatedAt: new Date().toISOString(),
        };

        if (!task) {
          task = await this.prisma.task.create({
            data: {
              organizationId: orgId,
              checklistId: checklist.id,
              checklistItemId: item.id,
              code: cfg.code,
              title: cfg.title,
              category: 'Thuế TNDN',
              priority: Priority.high,
              assigneeName: 'Kế toán trưởng / Người phụ trách thuế',
              assigneeRole: UserRole.owner,
              dueDate: cfg.dueDate,
              status: TaskStatus.need_info,
              description,
              ruleCode: cfg.ruleCode,
              legalBasis: cfg.legalBasis,
              periodCycle: cfg.cycleType,
              calculationBasisJson: calculationBasis,
              timeline: {
                create: {
                  title: `Khởi tạo từ Import Excel Quý ${quarter}/${year}`,
                  description: `Đã nạp số liệu tính thuế: ${formattedAmount} VNĐ`,
                  actorName: 'Hệ thống CELRA Tax Engine',
                  actorRole: UserRole.owner,
                  type: TimelineEventType.status_change,
                },
              },
            },
          });
        } else {
          task = await this.prisma.task.update({
            where: { id: task.id },
            data: {
              checklistId: checklist.id,
              checklistItemId: item.id,
              dueDate: cfg.dueDate,
              status: task.status || TaskStatus.need_info,
              description,
              calculationBasisJson: calculationBasis,
              timeline: {
                create: {
                  title: `Cập nhật số liệu từ Excel Quý ${quarter}/${year}`,
                  description: `Số thuế tạm nộp mới: ${formattedAmount} VNĐ`,
                  actorName: 'Hệ thống CELRA Tax Engine',
                  actorRole: UserRole.owner,
                  type: TimelineEventType.status_change,
                },
              },
            },
          });
        }
      } else {
        // Quý khác: Nếu chưa có Task thì tạo ở trạng thái need_info (Chờ nạp số liệu)
        if (!task) {
          task = await this.prisma.task.create({
            data: {
              organizationId: orgId,
              checklistId: checklist.id,
              checklistItemId: item.id,
              code: cfg.code,
              title: cfg.title,
              category: 'Thuế TNDN',
              priority: Priority.medium,
              assigneeName: 'Kế toán trưởng / Người phụ trách thuế',
              assigneeRole: UserRole.owner,
              dueDate: cfg.dueDate,
              status: TaskStatus.need_info,
              description: `Kỳ tính thuế ${cfg.title}. Chưa có số liệu Excel thực tế (Hạn chót: ${cfg.dueDate.toLocaleDateString('vi-VN')}). Vui lòng nạp file Excel khi đến kỳ.`,
              ruleCode: cfg.ruleCode,
              legalBasis: cfg.legalBasis,
              periodCycle: cfg.cycleType,
            },
          });
        }
      }

      syncedTasks.push(task);
    }

    return {
      success: true,
      checklistId: checklist.id,
      checklistCode: checklist.code,
      year,
      quarter,
      tasks: syncedTasks,
      message: `Đã đồng bộ thành công Checklist Hạn nộp thuế Năm ${year} cho Quý ${quarter}!`,
    };
  }
}
