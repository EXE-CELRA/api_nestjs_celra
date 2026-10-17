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
import { CreateContextFactDto, UpdateContextFactDto, GenerateChecklistFromFactDto } from './dto/context-fact.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Context Engine (9 Nhóm Dữ kiện Bối cảnh)')
@Controller('context-facts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContextEngineController {
  constructor(private readonly contextService: ContextEngineService) {}

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
  @ApiOperation({ summary: 'Rà soát tuân thủ thẻ bối cảnh (Thu phí 50.000 VNĐ qua Ví CELRA)' })
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

