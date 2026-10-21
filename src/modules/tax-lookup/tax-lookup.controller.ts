import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { TaxLookupService } from './tax-lookup.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Tax Lookup (Tra cứu mã số thuế)')
@Controller('tax-lookup')
export class TaxLookupController {
  constructor(private readonly taxLookupService: TaxLookupService) {}

  @Public()
  @Get(':taxCode')
  @ApiOperation({
    summary: 'Tra cứu thông tin pháp lý doanh nghiệp tự động theo Mã số thuế',
    description:
      'Gọi cổng dữ liệu thuế công khai để lấy Tên công ty, Tên viết tắt, Địa chỉ trụ sở và Trạng thái hoạt động, hỗ trợ tự động điền hồ sơ.',
  })
  @ApiParam({
    name: 'taxCode',
    description: 'Mã số thuế của doanh nghiệp (10 hoặc 13 chữ số, VD: 0101248141)',
    example: '0101248141',
  })
  @ApiResponse({
    status: 200,
    description: 'Tra cứu thành công, trả về thông tin doanh nghiệp',
  })
  @ApiResponse({
    status: 400,
    description: 'Mã số thuế không đúng định dạng',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy doanh nghiệp',
  })
  async lookupTaxCode(@Param('taxCode') taxCode: string) {
    return this.taxLookupService.lookupTaxCode(taxCode);
  }
}
