import { Controller, Get, Post, Body, Param, UseGuards, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { RuleEngineService } from './rule-engine.service';
import { CreateRuleDto } from './dto/rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Rule Engine (Động cơ Quy tắc Tuân thủ)')
@Controller('rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RuleEngineController {
  constructor(private readonly ruleService: RuleEngineService) {}

  @Post()
  @Roles(UserRole.admin)
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
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Kích hoạt động cơ đánh giá quy tắc & tự động tạo Tasks' })
  async evaluate(@Headers('x-organization-id') orgId: string) {
    return this.ruleService.evaluateAndTrigger(orgId);
  }
}
