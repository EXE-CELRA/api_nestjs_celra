import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { ExpertCaseService } from './expert-case.service';
import {
  CreateExpertCaseDto,
  SubmitQuoteDto,
  SubmitConclusionDto,
} from './dto/expert-case.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Expert Cases & Escrow (Chuyên gia Tư vấn & Ký quỹ)')
@Controller('expert-cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ExpertCaseController {
  constructor(private readonly expertService: ExpertCaseService) {}

  @Post()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Chuyển giao đầu việc ngoài phạm vi cho Chuyên gia/Luật sư' })
  async create(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateExpertCaseDto,
  ) {
    return this.expertService.create(orgId, userId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách các ca tư vấn chuyên gia của Doanh nghiệp' })
  async findAll(@Headers('x-organization-id') orgId: string) {
    return this.expertService.findAll(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết ca tư vấn chuyên gia theo ID' })
  async findOne(@Param('id') id: string) {
    return this.expertService.findOne(id);
  }

  @Post(':id/quote')
  @Roles(UserRole.expert, UserRole.admin)
  @ApiOperation({ summary: 'Chuyên gia nộp báo giá chi phí tư vấn' })
  async submitQuote(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SubmitQuoteDto,
  ) {
    return this.expertService.submitQuote(id, userId, dto);
  }

  @Post(':id/approve-escrow')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Chủ doanh nghiệp duyệt báo giá và bấm ký quỹ ví (Hold tiền cọc)' })
  async approveEscrow(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.expertService.approveQuoteAndEscrow(id, userId);
  }

  @Post(':id/conclusion')
  @Roles(UserRole.expert, UserRole.admin)
  @ApiOperation({ summary: 'Chuyên gia nộp kết luận pháp lý chính thức & Quyết toán ví' })
  async submitConclusion(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SubmitConclusionDto,
  ) {
    return this.expertService.submitConclusionAndCapture(id, userId, dto);
  }
}
