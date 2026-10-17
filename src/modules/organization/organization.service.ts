import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { UserRole, ContextStatus, ContextGroup, TaskStatus, Priority, WaitingOnRole } from '@prisma/client';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const existingOrg = await this.prisma.organization.findUnique({
      where: { taxCode: dto.taxCode },
    });

    if (existingOrg) {
      throw new BadRequestException('Mã số thuế này đã được đăng ký trên hệ thống');
    }

    const companyName = dto.name || dto.legalName || 'Doanh nghiệp mới';

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo Doanh nghiệp
      const org = await tx.organization.create({
        data: {
          name: companyName,
          taxCode: dto.taxCode,
          legalType: dto.legalType || 'Công ty TNHH',
          industry: dto.industry || 'Dịch vụ ăn uống',
          businessModel: dto.businessModel || 'Trực tiếp tại cơ sở và trực tuyến',
          operatingYears: dto.operatingYears || '1 - 3 năm',
          revenueStatus: dto.revenueStatus || 'Đã phát sinh doanh thu',
          employeeCount: dto.employeeCount || 5,
          locations: dto.locations || dto.city || 'TP. Hồ Chí Minh',
          hasOnlineSales: dto.hasOnlineSales || false,
          address: dto.address || `${dto.city || 'TP. Hồ Chí Minh'}`,
          representativeName: dto.representativeName || companyName,
          createdById: userId,
        },
      });

      // 2. Tạo 3 phòng ban mặc định
      const hrDept = await tx.department.create({
        data: {
          organizationId: org.id,
          name: 'Phòng Nhân sự & Lao động',
          code: 'HR',
          description: 'Phụ trách hợp đồng lao động, BHXH và nhân sự',
        },
      });

      const accDept = await tx.department.create({
        data: {
          organizationId: org.id,
          name: 'Phòng Kế toán & Tài chính',
          code: 'ACC',
          description: 'Phụ trách hóa đơn, đối chiếu dòng tiền và thuế',
        },
      });

      const opsDept = await tx.department.create({
        data: {
          organizationId: org.id,
          name: 'Phòng Vận hành & Cơ sở',
          code: 'OPS',
          description: 'Phụ trách cơ sở kinh doanh, ATTP và giấy phép con',
        },
      });

      // 3. Gán quyền Owner cho người tạo
      await tx.membership.create({
        data: {
          organizationId: org.id,
          userId,
          role: UserRole.owner,
          roleTitle: dto.registrantRole || 'Chủ doanh nghiệp',
          departmentId: hrDept.id,
          permissions: ['all'],
        },
      });

      // 4. Khởi tạo Ví CELRA cho doanh nghiệp
      await tx.wallet.create({
        data: {
          organizationId: org.id,
          balance: 0,
          heldAmount: 0,
          currency: 'VND',
        },
      });

      // 5. Tự động sinh 9 Dữ Kiện Ngữ Cảnh (Context Facts) từ Step 1 & Step 2
      const user = await tx.user.findUnique({ where: { id: userId } });
      const providedBy = user ? user.name : 'Hệ thống';

      const initialFacts: Array<{
        key: string;
        label: string;
        group: ContextGroup;
        currentValue: string;
        source: string;
      }> = [
        {
          key: 'tax.accounting_regime',
          label: 'Chế độ kế toán áp dụng',
          group: ContextGroup.tax_accounting,
          currentValue: dto.accountingRegime || 'TT133',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'tax.vat_method',
          label: 'Phương pháp kê khai thuế GTGT',
          group: ContextGroup.tax_accounting,
          currentValue: dto.vatMethod || 'KHAU_TRU',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'tax.tax_cycle',
          label: 'Kỳ kê khai thuế',
          group: ContextGroup.tax_accounting,
          currentValue: dto.taxCycle || 'QUY',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'invoice.electronic_invoice',
          label: 'Sử dụng Hóa đơn điện tử (NĐ 123)',
          group: ContextGroup.revenue_invoices,
          currentValue: dto.hasElectronicInvoice ? 'Đã kích hoạt sử dụng' : 'Chưa đăng ký',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'labor.insurance_status',
          label: 'Trích nộp BHXH bắt buộc',
          group: ContextGroup.hr_labor,
          currentValue: dto.hasLaborContractAndInsurance || 'DA_DONG_DU',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'safety.fire_prevention',
          label: 'Hồ sơ quản lý PCCC cơ sở',
          group: ContextGroup.premises,
          currentValue: dto.hasFireSafetyCert ? 'Đạt chuẩn PCCC cơ sở' : 'Chưa có phương án PCCC',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'permit.sectoral_license',
          label: 'Giấy phép con theo ngành nghề',
          group: ContextGroup.conditional_licensing,
          currentValue: dto.hasSectoralPermit ? 'Có yêu cầu giấy phép con' : 'Không thuộc ngành nghề có điều kiện',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'ip.trademark_registration',
          label: 'Đăng ký bảo hộ nhãn hiệu / Logo',
          group: ContextGroup.tech_data,
          currentValue: dto.hasTrademarkRegistered ? 'Đã đăng ký tại Cục SHTT' : 'Chưa bảo hộ độc quyền',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'legal.entity_profile',
          label: 'Pháp nhân & Địa bàn hoạt động',
          group: ContextGroup.legal,
          currentValue: `${dto.legalType || 'Công ty TNHH'} - ${dto.city || 'TP. Hồ Chí Minh'}`,
          source: 'Khai báo Onboarding',
        },
      ];

      for (const f of initialFacts) {
        await tx.contextFact.create({
          data: {
            organizationId: org.id,
            key: f.key,
            label: f.label,
            group: f.group,
            currentValue: f.currentValue,
            source: f.source,
            providedBy,
            status: ContextStatus.confirmed,
            history: {
              create: {
                value: f.currentValue,
                changedBy: providedBy,
                note: 'Khởi tạo từ Wizard Onboarding',
              },
            },
          },
        });
      }

      // 6. Theo chuẩn Prototype: Không tự ý sinh task/checklist khi chưa qua Rà soát tuân thủ
      // Danh mục Tác vụ (Tasks) ban đầu luôn luôn rỗng (tasks = [])

      return org;
    });
  }

  async getMyOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            wallet: true,
            departments: true,
          },
        },
        department: true,
      },
    });

    return memberships.map((m) => ({
      ...m.organization,
      legalName: m.organization.name,
      myRole: m.role,
      myRoleTitle: m.roleTitle,
      myDepartment: m.department,
    }));
  }

  async getOne(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        departments: true,
        wallet: true,
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                phone: true,
              },
            },
            department: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Không tìm thấy thông tin doanh nghiệp');
    }

    return org;
  }

  async update(orgId: string, dto: UpdateOrganizationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Không tìm thấy thông tin doanh nghiệp');
    }

    return this.prisma.organization.update({
      where: { id: orgId },
      data: dto,
    });
  }
}
