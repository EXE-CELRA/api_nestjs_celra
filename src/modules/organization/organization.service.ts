import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { UserRole, ContextStatus, ContextGroup } from '@prisma/client';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const taxCode = dto.taxCode;
    if (!taxCode) {
      throw new BadRequestException('Mã số thuế không được để trống');
    }

    const existingOrg = await this.prisma.organization.findUnique({
      where: { taxCode },
    });

    if (existingOrg) {
      throw new ConflictException(
        `Mã số thuế "${taxCode}" đã được đăng ký trên hệ thống CELRA bởi doanh nghiệp "${existingOrg.name}". Mỗi doanh nghiệp chỉ được sử dụng một mã số thuế duy nhất.`,
      );
    }

    const companyName = dto.name || dto.legalName || 'Doanh nghiệp mới';
    const city = dto.city || 'TP. Hồ Chí Minh';
    const legalType = dto.legalType || 'Công ty TNHH';
    const industry = dto.industry || 'Dịch vụ ăn uống';
    const businessModel = dto.businessModel || 'Trực tiếp tại cơ sở và trực tuyến';
    const operatingYears = dto.operatingYears || '1 - 3 năm';
    const revenueStatus = dto.revenueStatus || 'Đã phát sinh doanh thu';
    const employeeCount = dto.employeeCount || 5;
    const locations = dto.locations || city;
    const hasOnlineSales = dto.hasOnlineSales || false;
    const address = dto.address || city;
    const representativeName = dto.representativeName || companyName;
    const registrantRole = dto.registrantRole || 'Chủ doanh nghiệp';

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo Doanh nghiệp
      const org = await tx.organization.create({
        data: {
          name: companyName,
          taxCode,
          legalType,
          industry,
          businessModel,
          operatingYears,
          revenueStatus,
          employeeCount,
          locations,
          hasOnlineSales,
          address,
          representativeName,
          createdById: userId,
        },
      });

      // 2. Tạo 3 phòng ban mặc định phục vụ quản trị & kế toán thuế TNDN
      const adminDept = await tx.department.create({
        data: {
          organizationId: org.id,
          name: 'Ban Giám đốc & Quản trị',
          code: 'ADM',
          description: 'Phê duyệt hồ sơ pháp nhân, ký số tờ khai và quyết toán thuế TNDN',
        },
      });

      await tx.department.create({
        data: {
          organizationId: org.id,
          name: 'Phòng Kế toán & Thuế TNDN',
          code: 'ACC',
          description: 'Phụ trách sổ thu chi, bóc tách chi phí Mục B4 và kê khai thuế TNDN',
        },
      });

      await tx.department.create({
        data: {
          organizationId: org.id,
          name: 'Bộ phận Chứng từ & Thanh toán',
          code: 'OPS',
          description: 'Tập hợp hóa đơn đầu vào, ủy nhiệm chi ngân hàng và bảng kê chi phí',
        },
      });

      // 3. Gán quyền Owner cho người tạo
      await tx.membership.create({
        data: {
          organizationId: org.id,
          userId,
          role: UserRole.owner,
          roleTitle: registrantRole,
          departmentId: adminDept.id,
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

      // 5. Tự động sinh các Dữ Kiện Ngữ Cảnh (Context Facts) cốt lõi cho Hồ sơ cơ sở & Thuế TNDN
      const user = await tx.user.findUnique({ where: { id: userId } });
      const providedBy = user ? user.name : 'Hệ thống';

      const accountingRegime = dto.accountingRegime || 'TT133';
      const vatMethod = dto.vatMethod || 'KHAU_TRU';
      const taxCycle = dto.taxCycle || 'QUY';
      const hasElectronicInvoice = dto.hasElectronicInvoice ?? true;

      const initialFacts: Array<{
        key: string;
        label: string;
        group: ContextGroup;
        currentValue: string;
        source: string;
      }> = [
        {
          key: 'tax.accounting_regime',
          label: 'Chế độ kế toán áp dụng (Xác định chi phí TNDN)',
          group: ContextGroup.thue_ke_toan,
          currentValue: accountingRegime,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'tax.vat_method',
          label: 'Phương pháp hạch toán thuế & hóa đơn đầu vào',
          group: ContextGroup.thue_ke_toan,
          currentValue: vatMethod,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'tax.tax_cycle',
          label: 'Kỳ tạm nộp & đối soát thuế TNDN',
          group: ContextGroup.thue_ke_toan,
          currentValue: taxCycle,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'invoice.electronic_invoice',
          label: 'Hóa đơn điện tử hợp pháp phục vụ chi phí được trừ TNDN',
          group: ContextGroup.thue_ke_toan,
          currentValue: hasElectronicInvoice ? 'Đã kích hoạt sử dụng' : 'Chưa đăng ký',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'legal.entity_profile',
          label: 'Pháp nhân & Địa bàn xét ưu đãi thuế TNDN',
          group: ContextGroup.boi_canh_co_so,
          currentValue: `${legalType} - ${city}`,
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

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.employeeCount !== undefined && { employeeCount: dto.employeeCount }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.representativeName !== undefined && { representativeName: dto.representativeName }),
        ...(dto.hasOnlineSales !== undefined && { hasOnlineSales: dto.hasOnlineSales }),
      },
    });

    return updated;
  }

  async resetDemo(userId: string, orgId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId: orgId, userId, role: { in: [UserRole.owner, UserRole.admin] } },
    });

    if (!membership) {
      throw new BadRequestException('Bạn không có quyền quản trị để xóa dữ liệu doanh nghiệp này');
    }

    await this.prisma.organization.delete({
      where: { id: orgId },
    });

    return { success: true, message: 'Đã xóa sạch dữ liệu doanh nghiệp để chuẩn bị demo lại' };
  }
}
