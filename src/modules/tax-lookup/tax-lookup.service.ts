import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface TaxLookupResult {
  taxCode: string;
  name: string;
  shortName: string;
  internationalName: string;
  address: string;
  status: string;
  isOperating: boolean;
  source: string;
  isRegisteredInCelra?: boolean;
}

@Injectable()
export class TaxLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tra cứu thông tin người nộp thuế / doanh nghiệp theo Mã Số Thuế
   * Tự động lấy dữ liệu từ cơ sở dữ liệu quốc gia thông qua cổng công khai VietQR/Casso
   * Không tiết lộ UUID nội bộ (registeredOrgId) hay tên tổ chức nội bộ ra endpoint công khai
   */
  async lookupTaxCode(taxCode: string): Promise<TaxLookupResult> {
    const cleanTaxCode = (taxCode || '').trim().replace(/\s+/g, '');

    if (!cleanTaxCode || !/^[0-9-]{10,14}$/.test(cleanTaxCode)) {
      throw new BadRequestException('Mã số thuế không hợp lệ. Vui lòng nhập từ 10 đến 13 chữ số hợp lệ.');
    }

    // 1. Chỉ kiểm tra cờ tồn tại MST trong CELRA (tuyệt đối không trả registeredOrgId / registeredOrgName ra public)
    const existingOrg = await this.prisma.organization.findUnique({
      where: { taxCode: cleanTaxCode },
      select: { id: true },
    });

    try {
      const response = await fetch(`https://api.vietqr.io/v2/business/${encodeURIComponent(cleanTaxCode)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CELRA-Compliance-Engine/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new BadRequestException(`Không thể kết nối đến cổng tra cứu thuế (Mã phản hồi HTTP: ${response.status})`);
      }

      const resData = (await response.json()) as {
        code: string;
        desc: string;
        data?: {
          id: string;
          name: string;
          internationalName?: string;
          shortName?: string;
          address?: string;
          status?: string;
        };
      };

      if (resData.code !== '00' || !resData.data) {
        throw new NotFoundException(
          resData.desc || 'Không tìm thấy thông tin doanh nghiệp tương ứng với mã số thuế này.',
        );
      }

      const info = resData.data;
      const statusText = info.status || 'NNT đang hoạt động';

      return {
        taxCode: info.id || cleanTaxCode,
        name: info.name || '',
        shortName: info.shortName || '',
        internationalName: info.internationalName || '',
        address: info.address || '',
        status: statusText,
        isOperating: statusText.toLowerCase().includes('đang hoạt động'),
        source: 'Cổng thông tin Tổng cục Thuế (gdt.gov.vn)',
        isRegisteredInCelra: !!existingOrg,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Không thể hoàn tất tra cứu mã số thuế: ${error?.message || 'Lỗi kết nối mạng hoặc máy chủ không phản hồi'}`,
      );
    }
  }
}
