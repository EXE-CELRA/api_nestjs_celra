import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SubmitSurveyDto } from './dto/survey.dto';
import { ContextGroup, UserRole, MembershipStatus } from '@prisma/client';

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitAnswers(orgId: string, userId: string, dto: SubmitSurveyDto) {
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
      const p = dto.baseProfile;
      const orgName = p?.companyName?.trim() || 'Doanh nghiệp mới';
      const cleanTaxCode = p?.taxCode?.trim() || undefined;

      let existingOrg = null;
      if (cleanTaxCode) {
        existingOrg = await this.prisma.organization.findUnique({
          where: { taxCode: cleanTaxCode },
        });
      }

      if (existingOrg) {
        targetOrgId = existingOrg.id;
      } else {
        const newOrg = await this.prisma.organization.create({
          data: {
            name: orgName,
            taxCode: cleanTaxCode || ('MST-' + Date.now()),
            legalType: p?.companyTypeTag === 'TAG_HKD'
              ? 'Hộ kinh doanh cá thể'
              : p?.companyTypeTag === 'TAG_TNHH_1TV'
              ? 'Công ty TNHH Một thành viên'
              : p?.companyTypeTag === 'TAG_JSC'
              ? 'Công ty Cổ phần'
              : 'Công ty TNHH Hai thành viên trở lên',
            industry: Array.isArray(p?.industryTags) ? p.industryTags.join(', ') : 'Dịch vụ ăn uống',
            businessModel: 'Trực tiếp tại cơ sở và trực tuyến',
            operatingYears: p?.isNewlyEstablished ? 'Dưới 1 năm' : '1 - 3 năm',
            revenueStatus: p?.isNewlyEstablished ? 'newly_established' : (p?.annualRevenue || 0) <= 50000000000 ? 'under_50b' : 'over_50b',
            employeeCount: Number(p?.employeeCount) || (p?.employeeScale === 'under_10' ? 8 : p?.employeeScale === '10_to_50' ? 25 : 60),
            createdById: userId,
            wallet: {
              create: {
                balance: 0,
                heldAmount: 0,
                currency: 'VND',
              },
            },
          },
        });
        targetOrgId = newOrg.id;
      }

      if (userId && targetOrgId) {
        await this.prisma.membership.upsert({
          where: {
            organizationId_userId: {
              organizationId: targetOrgId,
              userId,
            },
          },
          update: { status: MembershipStatus.active },
          create: {
            organizationId: targetOrgId,
            userId,
            role: UserRole.owner,
            status: MembershipStatus.active,
          },
        });
      }
    }

    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId } }) : null;
    const answeredBy = user ? user.name : 'Chủ doanh nghiệp';

    // 1. Đồng bộ các thông tin nền tảng (Base Profile) vào ContextFact & Organization
    if (dto.baseProfile && targetOrgId) {
      const p = dto.baseProfile;
      const isQuarterly = p.isNewlyEstablished || (p.annualRevenue || 0) <= 50000000000;

      // Cập nhật thông tin thực thể Organization an toàn
      try {
        await this.prisma.organization.update({
          where: { id: targetOrgId },
          data: {
            name: p.companyName || undefined,
            taxCode: p.taxCode || undefined,
            employeeCount: Number(p.employeeCount) || (p.employeeScale === 'under_10' ? 8 : p.employeeScale === '10_to_50' ? 25 : 60),
            revenueStatus: p.isNewlyEstablished ? 'newly_established' : (p.annualRevenue || 0) <= 50000000000 ? 'under_50b' : 'over_50b',
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002' && p.taxCode) {
          this.logger.warn(`Mã số thuế ${p.taxCode} đã tồn tại trong DB, chuyển sang dùng Organization tương ứng.`);
          const existingOrg = await this.prisma.organization.findUnique({
            where: { taxCode: p.taxCode },
          });
          if (existingOrg) {
            targetOrgId = existingOrg.id;
            await this.prisma.organization.update({
              where: { id: targetOrgId },
              data: {
                name: p.companyName || undefined,
                employeeCount: Number(p.employeeCount) || (p.employeeScale === 'under_10' ? 8 : p.employeeScale === '10_to_50' ? 25 : 60),
                revenueStatus: p.isNewlyEstablished ? 'newly_established' : (p.annualRevenue || 0) <= 50000000000 ? 'under_50b' : 'over_50b',
              },
            });
          }
        } else {
          this.logger.error('Lỗi cập nhật organization:', err);
        }
      }

      // Đảm bảo user có membership active trong Organization này
      if (userId && targetOrgId) {
        await this.prisma.membership.upsert({
          where: {
            organizationId_userId: {
              organizationId: targetOrgId,
              userId,
            },
          },
          update: { status: MembershipStatus.active },
          create: {
            organizationId: targetOrgId,
            userId,
            role: UserRole.owner,
            status: MembershipStatus.active,
          },
        });
      }

      const baseFacts = [
        {
          key: 'tax_code',
          label: 'Mã số thuế & Định danh',
          group: 'phap_ly_von',
          currentValue: p.taxCode || '',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_TAX_REGISTRATION'],
        },
        {
          key: 'company_type_tag',
          label: 'Loại hình doanh nghiệp',
          group: 'phap_ly_von',
          currentValue: p.companyTypeTag === 'TAG_HKD'
            ? 'Hộ kinh doanh cá thể'
            : p.companyTypeTag === 'TAG_TNHH_1TV'
            ? 'Công ty TNHH Một thành viên'
            : p.companyTypeTag === 'TAG_JSC'
            ? 'Công ty Cổ phần'
            : 'Công ty TNHH Hai thành viên trở lên',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_CORPORATE_STRUCTURE'],
        },
        {
          key: 'employee_scale',
          label: 'Quy mô nhân sự',
          group: 'phap_ly_von',
          currentValue: p.employeeScale === 'under_10' 
            ? 'Dưới 10 nhân viên' 
            : p.employeeScale === '10_to_50' 
            ? 'Từ 10 đến 50 nhân viên (Cần đăng ký Nội quy lao động)' 
            : 'Trên 50 nhân viên (Cần NQLĐ & Ban ATVSLĐ)',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: p.requiresLaborRuleBook ? ['RULE_LABOR_MANDATORY_REGISTRATION'] : ['RULE_LABOR_GENERAL'],
        },
        {
          key: 'employee_count',
          label: 'Số lượng nhân sự thực tế',
          group: 'lao_dong_bhxh',
          currentValue: String(p.employeeCount || (p.employeeScale === 'under_10' ? 8 : p.employeeScale === '10_to_50' ? 25 : 60)),
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_LABOR_GENERAL'],
        },
        {
          key: 'annual_revenue',
          label: 'Doanh thu năm trước liền kề',
          group: 'thue_ke_toan',
          currentValue: p.isNewlyEstablished ? '0 (Mới thành lập)' : String(p.annualRevenue || 0),
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE-TAX-GTGT', 'RULE-TAX-TNDN-80'],
        },
        {
          key: 'charter_capital',
          label: 'Vốn điều lệ đăng ký',
          group: 'phap_ly_von',
          currentValue: String(p.charterCapital || 0),
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE-TAX-MONBAI'],
        },
        {
          key: 'tax_filing_cycle',
          label: 'Kỳ kê khai thuế GTGT & TNCN',
          group: 'thue_ke_toan',
          currentValue: isQuarterly ? 'THEO_QUY' : 'THEO_THANG',
          source: 'Khảo sát nền tảng Bước 1 (Tự động xác định theo NĐ 126/2020)',
          affectedRules: ['RULE-TAX-GTGT'],
        },
        {
          key: 'industry_tags',
          label: 'Ngành nghề & Hoạt động thực tế',
          group: 'nganh_nghe_van_hanh',
          currentValue: Array.isArray(p.industryTags) ? p.industryTags.join(', ') : '',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: Array.isArray(p.industryTags) ? p.industryTags.map((t: string) => `RULE_${t}`) : ['RULE_FNB_OPERATIONS'],
        },
      ];

      for (const bf of baseFacts) {
        const exist = await this.prisma.contextFact.findFirst({
          where: { organizationId: targetOrgId, key: bf.key },
        });
        if (exist) {
          await this.prisma.contextFact.update({
            where: { id: exist.id },
            data: {
              currentValue: bf.currentValue,
              source: bf.source,
              status: 'confirmed',
              affectedRules: bf.affectedRules,
            },
          });
        } else {
          await this.prisma.contextFact.create({
            data: {
              organizationId: targetOrgId,
              key: bf.key,
              label: bf.label,
              group: bf.group as any,
              currentValue: bf.currentValue,
              source: bf.source,
              providedBy: answeredBy,
              status: 'confirmed',
              affectedRules: bf.affectedRules,
              history: {
                create: {
                  value: bf.currentValue,
                  changedBy: answeredBy,
                  note: bf.source,
                },
              },
            },
          });
        }
      }
    }

    // 2. Đồng bộ các câu hỏi tình huống Dynamic vào ContextFact
    if (Array.isArray(dto.questions) && dto.questions.length > 0 && targetOrgId) {
      const submittedKeys = dto.questions.map((q: any) => q.id);
      await this.prisma.contextFact.deleteMany({
        where: {
          organizationId: targetOrgId,
          OR: [
            { key: { startsWith: 'q_tnhh2_' } },
            { key: { startsWith: 'q_tnhh1_' } },
            { key: { startsWith: 'q_fnb_' } },
            { key: { startsWith: 'q_ecom_' } },
            { key: { startsWith: 'comp_type_' } },
            { key: { startsWith: 'ind_fnb_' } },
            { key: { startsWith: 'labor_scale_' } },
            {
              AND: [
                { key: { startsWith: 'q_' } },
                { key: { notIn: submittedKeys } },
              ],
            },
          ],
        },
      });

      for (const q of dto.questions) {
        const factKey = q.id;

        // Phân loại nhóm bối cảnh chuẩn xác theo từng Module bao quát 100%
        let group: ContextGroup = 'thue_ke_toan';
        if (q.moduleId === 'MODULE_INVOICE_CASHFLOW') {
          group = 'hoa_don_dong_tien';
        } else if (q.moduleId === 'MODULE_TAX_CORE') {
          group = 'thue_ke_toan';
        } else if (q.moduleId === 'MODULE_LABOR_HR') {
          group = 'lao_dong_bhxh';
        } else if (q.moduleId === 'MODULE_PREMISES_PCCC') {
          group = 'dia_diem_pccc';
        } else if (q.moduleId === 'MODULE_CONTRACTS') {
          group = 'hop_dong';
        } else if (q.moduleId === 'MODULE_DATA_IP' || q.moduleId === 'MODULE_ECOM_DATA_PRIVACY') {
          group = 'du_lieu_shtt';
        } else if (q.moduleId === 'MODULE_LICENSING_ATTP' || q.moduleId === 'MODULE_LICENSING_CON') {
          group = 'giay_phep_con';
        } else if (q.moduleId === 'MODULE_LEGAL_CORP' || q.id === 'q_corp_capital_90d' || q.id === 'q_corp_amend_10d') {
          group = 'phap_ly_von';
        } else if (
          q.id?.includes('inv') ||
          q.id?.includes('cashflow') ||
          q.title?.toLowerCase().includes('hóa đơn') ||
          q.title?.toLowerCase().includes('doanh thu') ||
          q.id === 'q_tax_corp_3'
        ) {
          group = 'hoa_don_dong_tien';
        } else if (q.id?.startsWith('q_tax')) {
          group = 'thue_ke_toan';
        } else if (q.branchType === 'labor_scale') {
          group = 'lao_dong_bhxh';
        } else if (q.branchType === 'company_type') {
          group = 'phap_ly_von';
        } else {
          group = 'nganh_nghe_van_hanh';
        }

        const moduleTag =
          group === 'thue_ke_toan'
            ? 'Thuế Doanh Nghiệp'
            : group === 'hoa_don_dong_tien'
            ? 'Hóa Đơn & Dòng Tiền'
            : group === 'lao_dong_bhxh'
            ? 'Lao Động & BHXH'
            : group === 'dia_diem_pccc'
            ? 'Địa Điểm & PCCC'
            : group === 'hop_dong'
            ? 'Hợp Đồng & Giao Kết'
            : group === 'du_lieu_shtt'
            ? 'Dữ Liệu & Sở Hữu Trí Tuệ'
            : group === 'giay_phep_con'
            ? 'Giấy Phép Con'
            : group === 'phap_ly_von'
            ? 'Pháp Lý Doanh Nghiệp & Vốn'
            : q.branchLabel || q.branchCode || 'Khảo sát tình huống';

        const exist = await this.prisma.contextFact.findFirst({
          where: { organizationId: targetOrgId, key: factKey },
        });

        const val = q.selectedOption || 'Chưa trả lời';
        const source = `Khảo sát Bước 2 [${moduleTag}]`;
        const affectedRules = [q.branchCode].filter(Boolean);

        if (exist) {
          await this.prisma.contextFact.update({
            where: { id: exist.id },
            data: {
              currentValue: val,
              label: q.title,
              group: group as any,
              source,
              affectedRules,
              history: {
                create: {
                  value: val,
                  changedBy: answeredBy,
                  note: source,
                },
              },
            },
          });
        } else {
          await this.prisma.contextFact.create({
            data: {
              organizationId: targetOrgId,
              key: factKey,
              label: q.title,
              group: group as any,
              currentValue: val,
              source,
              providedBy: answeredBy,
              status: 'confirmed',
              affectedRules,
              history: {
                create: {
                  value: val,
                  changedBy: answeredBy,
                  note: source,
                },
              },
            },
          });
        }
      }
    }

    return {
      success: true,
      organizationId: targetOrgId,
      message: 'Đã lưu hiện trạng khảo sát vào Bối cảnh doanh nghiệp thành công. Hãy rà soát tuân thủ để sinh Checklist kiểm tra.',
      questionsCount: dto.questions?.length || 0,
    };
  }
}
