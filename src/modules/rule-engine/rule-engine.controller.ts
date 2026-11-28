import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { RuleEngineService } from './rule-engine.service';
import { CreateRuleDto } from './dto/rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { ValidatedOrgId } from '../../common/decorators/current-user.decorator';

@ApiTags('Rule Engine (Động cơ Quy tắc Tuân thủ)')
@Controller('rules')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RuleEngineController {
  constructor(private readonly ruleService: RuleEngineService) {}

  @Post()
  @UseGuards(AdminOnlyGuard)
  @ApiOperation({ summary: 'Tạo quy tắc tuân thủ mới (Chỉ Admin)' })
  async create(@Body() dto: CreateRuleDto) {
    return this.ruleService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh mục tất cả quy tắc tuân thủ' })
  async findAll() {
    return this.ruleService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết quy tắc tuân thủ' })
  async findOne(@Param('id') id: string) {
    return this.ruleService.findOne(id);
  }

  @Post('trigger-evaluation')
  @UseGuards(OrganizationMembershipGuard)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Kích hoạt động cơ đánh giá quy tắc & tự động tạo Tasks' })
  async evaluate(@ValidatedOrgId() orgId: string) {
    return this.ruleService.evaluateAndTrigger(orgId);
  }
}
