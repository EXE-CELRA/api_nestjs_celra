import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SubmitSurveyDto } from './dto/survey.dto';
import { ContextGroup } from '@prisma/client';

@Injectable()
export class SurveyService {
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
      const firstOrg = await this.prisma.organization.findFirst();
      if (firstOrg) {
        targetOrgId = firstOrg.id;
      }
    }

    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId } }) : null;
    const answeredBy = user ? user.name : 'Chủ doanh nghiệp';

    // 1. Đồng bộ các thông tin nền tảng (Base Profile) vào ContextFact
    if (dto.baseProfile && targetOrgId) {
      const p = dto.baseProfile;
      const baseFacts = [
        {
          key: 'tax_code',
          label: 'Mã số thuế & Định danh',
          group: 'legal',
          currentValue: p.taxCode || '',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_TAX_REGISTRATION'],
        },
        {
          key: 'company_type_tag',
          label: 'Loại hình doanh nghiệp',
          group: 'legal',
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
          group: 'legal',
          currentValue: p.employeeScale === 'under_10' 
            ? 'Dưới 10 nhân viên' 
            : p.employeeScale === '10_to_50' 
            ? 'Từ 10 đến 50 nhân viên (Cần đăng ký Nội quy lao động)' 
            : 'Trên 50 nhân viên (Cần NQLĐ & Ban ATVSLĐ)',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: p.requiresLaborRuleBook ? ['RULE_LABOR_MANDATORY_REGISTRATION'] : ['RULE_LABOR_GENERAL'],
        },
        {
          key: 'industry_tags',
          label: 'Ngành nghề & Hoạt động thực tế',
          group: 'operations',
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

        let group: ContextGroup = 'tax_accounting';
        if (q.moduleId === 'MODULE_INVOICE_CASHFLOW') {
          group = 'revenue_invoices';
        } else if (q.moduleId === 'MODULE_TAX_CORE') {
          group = 'tax_accounting';
        } else if (q.moduleId === 'MODULE_LABOR_HR') {
          group = 'hr_labor';
        } else if (
          q.id?.includes('inv') ||
          q.id?.includes('cashflow') ||
          q.title?.toLowerCase().includes('hóa đơn') ||
          q.title?.toLowerCase().includes('doanh thu') ||
          q.id === 'q_tax_corp_3'
        ) {
          group = 'revenue_invoices';
        } else if (q.id?.startsWith('q_tax')) {
          group = 'tax_accounting';
        } else if (q.branchType === 'labor_scale') {
          group = 'hr_labor';
        } else if (q.branchType === 'company_type') {
          group = 'legal';
        } else {
          group = 'operations';
        }

        const moduleTag =
          group === 'tax_accounting'
            ? 'Thuế Doanh Nghiệp'
            : group === 'revenue_invoices'
            ? 'Hóa Đơn & Dòng Tiền'
            : group === 'hr_labor'
            ? 'Lao Động & BHXH'
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
      message: 'Đã lưu hiện trạng khảo sát vào Bối cảnh doanh nghiệp thành công. Hãy rà soát tuân thủ để sinh Checklist kiểm tra.',
      questionsCount: dto.questions?.length || 0,
    };
  }
}
