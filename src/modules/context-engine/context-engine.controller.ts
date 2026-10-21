import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { ContextEngineService } from './context-engine.service';
import { ComplianceFlowService } from './compliance-flow.service';
import { CreateContextFactDto, UpdateContextFactDto, GenerateChecklistFromFactDto } from './dto/context-fact.dto';
import { BatchAuditContextDto, ConfirmChecklistsDto } from './dto/compliance-flow.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Context Engine (9 Nhóm Dữ kiện Bối cảnh & Rà soát Pháp luật)')
@Controller('context-facts')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
@ApiBearerAuth()
export class ContextEngineController {
  constructor(
    private readonly contextService: ContextEngineService,
    private readonly complianceFlowService: ComplianceFlowService,
  ) {}

  @Post()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tạo dữ kiện bối cảnh mới' })
  async create(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateContextFactDto,
  ) {
    return this.contextService.create(orgId, userId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy toàn bộ ma trận dữ kiện 9 nhóm bối cảnh của Doanh nghiệp' })
  async findAll(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.contextService.findAll(orgId, userId);
  }

  @Post('batch-audit')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Rà soát tuân thủ toàn diện theo ma trận bối cảnh (Tích hợp Cache Fingerprint 0 token/0 phí)' })
  async batchAudit(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: BatchAuditContextDto,
  ) {
    return this.complianceFlowService.runAudit(orgId, userId, dto);
  }

  @Post('confirm-checklists')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Xác nhận tạo Checklist và Tác vụ chính thức (Chống trùng lặp tuyệt đối)' })
  async confirmChecklists(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmChecklistsDto,
  ) {
    return this.complianceFlowService.confirmChecklists(orgId, userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết dữ kiện kèm toàn bộ lịch sử thay đổi' })
  async findOne(@Param('id') id: string) {
    return this.contextService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật giá trị dữ kiện (tự động ghi log lịch sử thay đổi)' })
  async update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateContextFactDto,
  ) {
    return this.contextService.update(id, userId, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Xác nhận đối soát dữ kiện (Confirmed)' })
  async confirm(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.contextService.confirm(id, userId);
  }

  @Post(':id/compliance-audit')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Rà soát tuân thủ đơn lẻ thẻ bối cảnh' })
  async auditCompliance(
    @Headers('x-organization-id') orgId: string,
    @Param('id') factId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.contextService.auditCompliance(orgId, factId, userId);
  }

  @Post(':id/generate-checklists')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tạo Checklist & Tasks chính thức sau khi rà soát tuân thủ' })
  async generateChecklists(
    @Headers('x-organization-id') orgId: string,
    @Param('id') factId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: GenerateChecklistFromFactDto,
  ) {
    return this.contextService.generateChecklists(orgId, factId, userId, dto);
  }
}
