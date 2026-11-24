import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiParam } from '@nestjs/swagger';
import { AIAssistantService } from './ai-assistant.service';
import { AIChatMessageDto, AcceptProposalDto, UpdateLegalRuleDto } from './dto/ai-chat.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ValidatedOrgId } from '../../common/decorators/validated-org-id.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@ApiTags('AI Compliance Assistant (Trợ lý AI Tuân thủ OpenCode)')
@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIAssistantController {
  constructor(private readonly aiService: AIAssistantService) {}

  @Post('chat')
  @RateLimit({ limit: 10, ttlMs: 60_000 })
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Gửi câu hỏi tuân thủ đến Trợ lý AI (kèm nạp bối cảnh Context Facts)' })
  async chat(
    @ValidatedOrgId() orgId: string,
    @Body() dto: AIChatMessageDto,
  ) {
    return this.aiService.chat(orgId, dto);
  }

  @Post('accept-proposal')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Chấp nhận đề xuất của AI để tự động tạo Checklist và Task vào DB' })
  async acceptProposal(
    @ValidatedOrgId() orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: AcceptProposalDto,
  ) {
    return this.aiService.acceptProposal(orgId, userId, dto);
  }

  @Public()
  @Get('legal-rules')
  @ApiOperation({ summary: 'Lấy danh sách các Quy định pháp luật cốt lõi đang lưu trong Database' })
  async getLegalRules() {
    return this.aiService.getLegalRules();
  }

  @Put('legal-rules/:code')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @ApiParam({ name: 'code', description: 'Mã quy định pháp luật (ví dụ: RULE-TAX-MB)' })
  @ApiOperation({ summary: 'Admin cập nhật Nghị định/Thông tư mới hoặc nội dung hướng dẫn cho 1 điều luật' })
  async updateLegalRule(
    @Param('code') code: string,
    @Body() dto: UpdateLegalRuleDto,
  ) {
    return this.aiService.updateLegalRule(code, dto);
  }

  @Post('sync-legal-rules')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @ApiOperation({ summary: 'Kích hoạt đồng bộ cập nhật luật mới và làm mới chu kỳ Cache 30 ngày' })
  async syncLegalRules() {
    return this.aiService.syncLegalRulesFromExternalApi();
  }

  @Get('dlpl-quota')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @ApiOperation({ summary: 'Kiểm tra hạn ngạch và số lượt còn lại của API Dữ Liệu Pháp Luật (0 tốn lượt)' })
  async getDLPLQuota() {
    return this.aiService.getDLPLQuota();
  }
}
