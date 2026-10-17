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
import { FindingService } from './finding.service';
import { CreateFindingDto, UpdateFindingStatusDto } from './dto/finding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Findings & Remediation (Phát hiện Sai sót & Khắc phục)')
@Controller('findings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FindingController {
  constructor(private readonly findingService: FindingService) {}

  @Post()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Ghi nhận sai sót/rủi ro mới (Tự động sinh Task khắc phục)' })
  async create(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateFindingDto,
  ) {
    return this.findingService.create(orgId, userId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh sách các sai sót/rủi ro của Doanh nghiệp' })
  async findAll(@Headers('x-organization-id') orgId: string) {
    return this.findingService.findAll(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết sai sót theo ID' })
  async findOne(@Param('id') id: string) {
    return this.findingService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái tiến trình khắc phục sai sót' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFindingStatusDto,
  ) {
    return this.findingService.updateStatus(id, dto);
  }
}
