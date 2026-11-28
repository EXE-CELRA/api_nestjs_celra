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
import { CurrentUser, ValidatedOrgId } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('AI Compliance Assistant (Trợ lý AI Tuân thủ OpenCode)')
@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIAssistantController {
  constructor(private readonly aiService: AIAssistantService) {}

  @Post('upload-file')
  @UseGuards(OrganizationMembershipGuard)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên tệp tài liệu trong khung chat AI để đọc, trích xuất và hỏi đáp' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadChatFile(
    @Req() req: AuthenticatedOrgRequest,
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('conversationId') conversationId?: string,
  ) {
    const targetOrgId = req.validatedOrgId || orgId;
    return this.aiService.uploadChatFile(targetOrgId, userId, file, conversationId);
  }

  @Post('chat')
  @UseGuards(OrganizationMembershipGuard)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Gửi câu hỏi tuân thủ đến Trợ lý AI (kèm nạp bối cảnh Context Facts)' })
  async chat(
    @ValidatedOrgId() targetOrgId: string,
    @Body() dto: AIChatMessageDto,
  ) {
    return this.aiService.chat(targetOrgId, dto);
  }

  @Post('accept-proposal')
  @UseGuards(OrganizationMembershipGuard)
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Chấp nhận đề xuất của AI để tự động tạo Checklist và Task vào DB' })
  async acceptProposal(
    @ValidatedOrgId() targetOrgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: AcceptProposalDto,
  ) {
    return this.aiService.acceptProposal(targetOrgId, userId, dto);
  }

  @Public()
  @Get('legal-rules')
  @ApiOperation({ summary: 'Lấy danh sách các Quy định pháp luật cốt lõi đang lưu trong Database' })
  async getLegalRules() {
    return this.aiService.getLegalRules();
  }

  @Put('legal-rules/:code')
  @UseGuards(AdminOnlyGuard)
  @ApiParam({ name: 'code', description: 'Mã quy định pháp luật (ví dụ: RULE-TAX-TNDN-80)' })
  @ApiOperation({ summary: 'Admin cập nhật Nghị định/Thông tư mới hoặc nội dung hướng dẫn cho 1 điều luật' })
  async updateLegalRule(
    @Param('code') code: string,
    @Body() dto: UpdateLegalRuleDto,
  ) {
    return this.aiService.updateLegalRule(code, dto);
  }

  @Post('sync-legal-rules')
  @UseGuards(AdminOnlyGuard)
  @ApiOperation({ summary: 'Kích hoạt đồng bộ cập nhật luật mới và làm mới chu kỳ Cache 30 ngày (Chỉ Admin)' })
  async syncLegalRules() {
    return this.aiService.syncLegalRulesFromExternalApi();
  }

  @Get('dlpl-quota')
  @UseGuards(AdminOnlyGuard)
  @ApiOperation({ summary: 'Kiểm tra hạn ngạch và số lượt còn lại của API Dữ Liệu Pháp Luật (Chỉ Admin)' })
  async getDLPLQuota() {
    return this.aiService.getDLPLQuota();
  }
}
