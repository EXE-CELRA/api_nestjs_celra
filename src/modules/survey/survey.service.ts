import { Injectable, Logger, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SubmitSurveyDto } from './dto/survey.dto';
import { ContextGroup, UserRole, MembershipStatus } from '@prisma/client';

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitAnswers(orgId: string, userId: string, dto: SubmitSurveyDto) {
    let targetOrgId: string | undefined = orgId?.trim() || undefined;

    // BẢO VỆ ĐA DOANH NGHIỆP: Nếu truyền x-organization-id của một doanh nghiệp đang tồn tại mà không có tư cách thành viên active -> chặn ngay!
    if (targetOrgId && userId) {
      const membership = await this.prisma.membership.findFirst({
        where: { organizationId: targetOrgId, userId, status: MembershipStatus.active },
      });
      if (!membership) {
        const existingTargetOrg = await this.prisma.organization.findUnique({
          where: { id: targetOrgId },
          select: { id: true },
        });
        if (existingTargetOrg) {
          throw new ForbiddenException('Bạn không có quyền cập nhật hồ sơ khảo sát của doanh nghiệp khác.');
        }
        // Trường hợp ID doanh nghiệp cũ không còn tồn tại trong hệ thống -> cho phép khởi tạo hồ sơ mới
        this.logger.warn(`Organization ${targetOrgId} không còn tồn tại. Khởi tạo hồ sơ khảo sát mới cho user ${userId}.`);
        targetOrgId = undefined;
      }
    }

    if (!targetOrgId && userId) {
      const userOrg = await this.prisma.membership.findFirst({
        where: { userId, status: MembershipStatus.active },
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
        // KIỂM TRA QUYỀN SỞ HỮU / THÀNH VIÊN: Ngăn chặn tạo trùng MST dẫn đến gán chéo dữ liệu
        let isMember = false;
        if (userId) {
          const mem = await this.prisma.membership.findFirst({
            where: { organizationId: existingOrg.id, userId },
          });
          if (mem) isMember = true;
        }

        if (!isMember) {
          throw new ConflictException(
            `Mã số thuế "${cleanTaxCode}" đã được đăng ký bởi doanh nghiệp "${existingOrg.name}" trên hệ thống CELRA. Mỗi doanh nghiệp chỉ được sử dụng một mã số thuế duy nhất. Vui lòng kiểm tra lại mã số thuế hoặc liên hệ ban quản trị doanh nghiệp.`,
          );
        }

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

      // Kiểm tra chủ động: Mã số thuế mới có bị trùng với Organization khác hay không
      if (p.taxCode) {
        const cleanTax = p.taxCode.trim();
        const conflictOrg = await this.prisma.organization.findUnique({
          where: { taxCode: cleanTax },
          select: { id: true, name: true },
        });
        if (conflictOrg && conflictOrg.id !== targetOrgId) {
          throw new ConflictException(
            `Mã số thuế "${cleanTax}" đã được đăng ký bởi doanh nghiệp "${conflictOrg.name}" trên hệ thống CELRA. Không thể gán trùng mã số thuế.`,
          );
        }
      }

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
          throw new ConflictException(
            `Mã số thuế "${p.taxCode}" đã được sử dụng bởi một doanh nghiệp khác trên hệ thống CELRA. Không thể gán trùng mã số thuế.`,
          );
        } else {
          this.logger.error('Lỗi cập nhật organization:', err);
          throw err;
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

      await this.prisma.contextFact.deleteMany({
        where: {
          organizationId: targetOrgId,
          key: { in: ['tax_filing_cycle', 'annual_revenue', 'employee_count'] },
        },
      }).catch(() => {});

      const baseFacts = [
        {
          key: 'tax_code',
          label: 'Mã số thuế & Định danh pháp lý',
          group: ContextGroup.boi_canh_co_so,
          currentValue: p.taxCode ? `${p.taxCode} - ${p.companyName || 'Công ty'}` : '',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_TAX_REGISTRATION'],
        },
        {
          key: 'company_type_tag',
          label: 'Hình thức kinh doanh & Loại hình doanh nghiệp',
          group: ContextGroup.boi_canh_co_so,
          currentValue: p.companyTypeTag === 'TAG_HKD'
            ? 'Hộ kinh doanh cá thể'
            : p.companyTypeTag === 'TAG_TNHH_1TV'
            ? 'Công ty TNHH Một thành viên'
            : p.companyTypeTag === 'TAG_JSC'
            ? 'Công ty Cổ phần'
            : 'Công ty TNHH Hai thành viên trở lên',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_CIT_LEGAL_TYPE'],
        },
        {
          key: 'charter_capital',
          label: 'Vốn điều lệ đăng ký trên ĐKKD',
          group: ContextGroup.boi_canh_co_so,
          currentValue: `${Number(p.charterCapital || 0).toLocaleString('vi-VN')} VNĐ`,
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_CIT_CAPITAL_INTEREST'],
        },
        {
          key: 'employee_scale',
          label: 'Quy mô nhân sự & Tiêu chí SME (Thuế TNDN)',
          group: ContextGroup.boi_canh_co_so,
          currentValue: `${p.employeeCount || (p.employeeScale === 'under_10' ? 8 : p.employeeScale === '10_to_50' ? 25 : 60)} nhân sự`,
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: ['RULE_CIT_SME_SCALE'],
        },
        {
          key: 'industry_tags',
          label: 'Ngành nghề & Hoạt động kinh doanh thực tế',
          group: ContextGroup.boi_canh_co_so,
          currentValue: Array.isArray(p.industryTags) ? p.industryTags.join(', ') : '',
          source: 'Khảo sát nền tảng Bước 1',
          affectedRules: Array.isArray(p.industryTags) ? p.industryTags.map((t: string) => `RULE_${t}`) : ['RULE_CIT_INDUSTRY'],
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
              group: bf.group,
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
              group: bf.group,
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

    // 2. Đồng bộ các câu hỏi tình huống Thuế TNDN vào ContextFact
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
        const group: ContextGroup = ContextGroup.thue_ke_toan;
        const moduleTag = 'Thuế TNDN';

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
              group,
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
              group,
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
