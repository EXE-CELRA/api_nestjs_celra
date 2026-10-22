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

  private enrichOrgWithVietnamese(org: any) {
    if (!org) return org;
    return {
      ...org,
      tenDoanhNghiep: org.name,
      maSoThue: org.taxCode,
      loaiHinhPhapLy: org.legalType,
      nganhNghe: org.industry,
      moHinhKinhDoanh: org.businessModel,
      soNamHoatDong: org.operatingYears,
      tinhTrangDoanhThu: org.revenueStatus,
      soLuongNhanSu: org.employeeCount,
      diaDiemKinhDoanh: org.locations,
      coBanHangOnline: org.hasOnlineSales,
      diaChi: org.address,
      tenNguoiDaiDien: org.representativeName,
      taoLuc: org.createdAt,
      capNhatLuc: org.updatedAt,
    };
  }

  async create(userId: string, dto: CreateOrganizationDto) {
    const taxCode = dto.maSoThue || dto.taxCode;
    if (!taxCode) {
      throw new BadRequestException('Mã số thuế không được để trống');
    }

    const existingOrg = await this.prisma.organization.findUnique({
      where: { taxCode },
    });

    if (existingOrg) {
      throw new BadRequestException('Mã số thuế này đã được đăng ký trên hệ thống');
    }

    const companyName = dto.tenDoanhNghiep || dto.name || dto.legalName || 'Doanh nghiệp mới';
    const city = dto.thanhPho || dto.city || 'TP. Hồ Chí Minh';
    const legalType = dto.loaiHinhPhapLy || dto.legalType || 'Công ty TNHH';
    const industry = dto.nganhNghe || dto.industry || 'Dịch vụ ăn uống';
    const businessModel = dto.moHinhKinhDoanh || dto.businessModel || 'Trực tiếp tại cơ sở và trực tuyến';
    const operatingYears = dto.soNamHoatDong || dto.operatingYears || '1 - 3 năm';
    const revenueStatus = dto.tinhTrangDoanhThu || dto.revenueStatus || 'Đã phát sinh doanh thu';
    const employeeCount = dto.soLuongNhanSu !== undefined ? dto.soLuongNhanSu : (dto.employeeCount || 5);
    const locations = dto.diaDiemKinhDoanh || dto.locations || city;
    const hasOnlineSales = dto.coBanHangOnline !== undefined ? dto.coBanHangOnline : (dto.hasOnlineSales || false);
    const address = dto.diaChi || dto.address || city;
    const representativeName = dto.tenNguoiDaiDien || dto.representativeName || companyName;
    const registrantRole = dto.vaiTroDangKy || dto.registrantRole || 'Chủ doanh nghiệp';

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
          roleTitle: registrantRole,
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

      const accountingRegime = dto.cheDoKeToan || dto.accountingRegime || 'TT133';
      const vatMethod = dto.phuongPhapVat || dto.vatMethod || 'KHAU_TRU';
      const taxCycle = dto.kyKhaiThue || dto.taxCycle || 'QUY';
      const hasLaborContractAndInsurance = dto.hopDongVaBaoHiem || dto.hasLaborContractAndInsurance || 'DA_DONG_DU';
      const hasElectronicInvoice = dto.coHoaDonDienTu !== undefined ? dto.coHoaDonDienTu : (dto.hasElectronicInvoice ?? true);
      const hasFireSafetyCert = dto.coChungNhanPccc !== undefined ? dto.coChungNhanPccc : (dto.hasFireSafetyCert ?? true);
      const hasSectoralPermit = dto.coGiayPhepCon !== undefined ? dto.coGiayPhepCon : (dto.hasSectoralPermit ?? true);
      const hasTrademarkRegistered = dto.coDangKyNhanHieu !== undefined ? dto.coDangKyNhanHieu : (dto.hasTrademarkRegistered ?? false);

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
          group: ContextGroup.thue_ke_toan,
          currentValue: accountingRegime,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'tax.vat_method',
          label: 'Phương pháp kê khai thuế GTGT',
          group: ContextGroup.thue_ke_toan,
          currentValue: vatMethod,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'tax.tax_cycle',
          label: 'Kỳ kê khai thuế',
          group: ContextGroup.thue_ke_toan,
          currentValue: taxCycle,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'invoice.electronic_invoice',
          label: 'Sử dụng Hóa đơn điện tử (NĐ 123)',
          group: ContextGroup.hoa_don_dong_tien,
          currentValue: hasElectronicInvoice ? 'Đã kích hoạt sử dụng' : 'Chưa đăng ký',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'labor.insurance_status',
          label: 'Trích nộp BHXH bắt buộc',
          group: ContextGroup.lao_dong_bhxh,
          currentValue: hasLaborContractAndInsurance,
          source: 'Khai báo Onboarding',
        },
        {
          key: 'safety.fire_prevention',
          label: 'Hồ sơ quản lý PCCC cơ sở',
          group: ContextGroup.dia_diem_pccc,
          currentValue: hasFireSafetyCert ? 'Đạt chuẩn PCCC cơ sở' : 'Chưa có phương án PCCC',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'permit.sectoral_license',
          label: 'Giấy phép con theo ngành nghề',
          group: ContextGroup.giay_phep_con,
          currentValue: hasSectoralPermit ? 'Có yêu cầu giấy phép con' : 'Không thuộc ngành nghề có điều kiện',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'ip.trademark_registration',
          label: 'Đăng ký bảo hộ nhãn hiệu / Logo',
          group: ContextGroup.du_lieu_shtt,
          currentValue: hasTrademarkRegistered ? 'Đã đăng ký tại Cục SHTT' : 'Chưa bảo hộ độc quyền',
          source: 'Khai báo Onboarding',
        },
        {
          key: 'legal.entity_profile',
          label: 'Pháp nhân & Địa bàn hoạt động',
          group: ContextGroup.phap_ly_von,
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

      return this.enrichOrgWithVietnamese(org);
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

    return memberships.map((m) => {
      const enrichedOrg = this.enrichOrgWithVietnamese(m.organization);
      return {
        ...enrichedOrg,
        legalName: m.organization.name,
        tenDoanhNghiep: m.organization.name,
        myRole: m.role,
        vaiTroCuaToi: m.role,
        myRoleTitle: m.roleTitle,
        chucDanhCuaToi: m.roleTitle,
        myDepartment: m.department,
        phongBanCuaToi: m.department,
      };
    });
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

    return this.enrichOrgWithVietnamese(org);
  }

  async update(orgId: string, dto: UpdateOrganizationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Không tìm thấy thông tin doanh nghiệp');
    }

    const name = dto.tenDoanhNghiep || dto.name;
    const shortName = dto.tenVietTat || dto.shortName;
    const employeeCount = dto.soLuongNhanSu !== undefined ? dto.soLuongNhanSu : dto.employeeCount;
    const address = dto.diaChi || dto.address;
    const representativeName = dto.tenNguoiDaiDien || dto.representativeName;
    const hasOnlineSales = dto.coBanHangOnline !== undefined ? dto.coBanHangOnline : dto.hasOnlineSales;

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(name !== undefined && { name }),
        ...(shortName !== undefined && { shortName }),
        ...(employeeCount !== undefined && { employeeCount }),
        ...(address !== undefined && { address }),
        ...(representativeName !== undefined && { representativeName }),
        ...(hasOnlineSales !== undefined && { hasOnlineSales }),
      },
    });

    return this.enrichOrgWithVietnamese(updated);
  }
}
