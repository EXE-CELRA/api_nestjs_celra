import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CitLedgerService } from './cit-ledger.service';
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ValidatedOrgId } from '../../common/decorators/current-user.decorator';

@ApiTags('CIT Ledger (Sổ Kê Khai Thu Chi & Rà Soát Xuất Toán Thuế TNDN)')
@Controller('cit-ledger')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, RolesGuard)
@ApiBearerAuth()
export class CitLedgerController {
  constructor(private readonly citService: CitLedgerService) {}

  @Get('summary')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy KPI tổng hợp lũy kế toàn kỳ (Grand Total) tính toán tại Backend' })
  async getSummary(
    @ValidatedOrgId() orgId: string,
    @Query() query: QueryCitSummaryDto,
  ) {
    return this.citService.getSummary(orgId, query);
  }

  @Post('sync-compliance-checklist')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tạo hoặc đồng bộ Checklist Hạn Nộp Thuế TNDN 4 Quý & Quyết Toán Năm' })
  async syncComplianceChecklist(
    @ValidatedOrgId() orgId: string,
    @Body() dto: SyncCitComplianceChecklistDto,
  ) {
    return this.citService.syncComplianceChecklist(orgId, dto);
  }

  // ===================== DOANH THU =====================

  @Get('revenues')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách doanh thu phân trang và tìm kiếm (Server-side)' })
  async getRevenues(
    @ValidatedOrgId() orgId: string,
    @Query() query: QueryCitRevenueDto,
  ) {
    return this.citService.getRevenues(orgId, query);
  }

  @Post('revenues')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Thêm mới 1 khoản doanh thu' })
  async createRevenue(
    @ValidatedOrgId() orgId: string,
    @Body() dto: CreateCitRevenueDto,
  ) {
    return this.citService.createRevenue(orgId, dto);
  }

  @Put('revenues/:id')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Cập nhật 1 khoản doanh thu' })
  async updateRevenue(
    @ValidatedOrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCitRevenueDto,
  ) {
    return this.citService.updateRevenue(orgId, id, dto);
  }

  @Delete('revenues/:id')
  @Roles(UserRole.owner, UserRole.internal_accountant)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Xóa 1 khoản doanh thu' })
  async deleteRevenue(
    @ValidatedOrgId() orgId: string,
    @Param('id') id: string,
  ) {
    return this.citService.deleteRevenue(orgId, id);
  }

  @Post('revenues/import')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Nạp hàng loạt khoản doanh thu từ Excel' })
  async batchImportRevenues(
    @ValidatedOrgId() orgId: string,
    @Body() dto: BatchImportRevenuesDto,
  ) {
    return this.citService.batchImportRevenues(orgId, dto);
  }

  // ===================== CHI PHÍ =====================

  @Get('expenses')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách chi phí phân trang, tìm kiếm và lọc B4 (Server-side)' })
  async getExpenses(
    @ValidatedOrgId() orgId: string,
    @Query() query: QueryCitExpenseDto,
  ) {
    return this.citService.getExpenses(orgId, query);
  }

  @Post('expenses')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Thêm mới 1 khoản chi phí (Tự động rà soát Mục B4)' })
  async createExpense(
    @ValidatedOrgId() orgId: string,
    @Body() dto: CreateCitExpenseDto,
  ) {
    return this.citService.createExpense(orgId, dto);
  }

  @Put('expenses/:id')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Cập nhật 1 khoản chi phí (Tự động cập nhật Mục B4)' })
  async updateExpense(
    @ValidatedOrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCitExpenseDto,
  ) {
    return this.citService.updateExpense(orgId, id, dto);
  }

  @Delete('expenses/:id')
  @Roles(UserRole.owner, UserRole.internal_accountant)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Xóa 1 khoản chi phí' })
  async deleteExpense(
    @ValidatedOrgId() orgId: string,
    @Param('id') id: string,
  ) {
    return this.citService.deleteExpense(orgId, id);
  }

  @Post('expenses/import')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Nạp hàng loạt khoản chi phí từ Excel (Tự động rà soát Mục B4)' })
  async batchImportExpenses(
    @ValidatedOrgId() orgId: string,
    @Body() dto: BatchImportExpensesDto,
  ) {
    return this.citService.batchImportExpenses(orgId, dto);
  }

  @Delete('clear')
  @Roles(UserRole.owner, UserRole.internal_accountant)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Xóa toàn bộ dữ liệu của 1 Quý để nạp lại' })
  async clearPeriod(
    @ValidatedOrgId() orgId: string,
    @Query('year') year: number,
    @Query('quarter') quarter: number,
    @Query('type') type: 'revenue' | 'expense' | 'both' = 'both',
  ) {
    return this.citService.clearPeriod(orgId, year, quarter, type);
  }
}
