import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Organizations / Workspaces')
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post('onboarding')
  @ApiOperation({ summary: 'Khởi tạo Doanh nghiệp mới (Onboarding Wizard)' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.orgService.create(userId, dto);
  }

  @Get('my-workspaces')
  @ApiOperation({ summary: 'Lấy danh sách các Doanh nghiệp/Workspace mà người dùng tham gia' })
  async getMyOrganizations(@CurrentUser('sub') userId: string) {
    return this.orgService.getMyOrganizations(userId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Alias lấy danh sách Doanh nghiệp của người dùng' })
  async getMyOrganizationsAlias(@CurrentUser('sub') userId: string) {
    return this.orgService.getMyOrganizations(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết thông tin Doanh nghiệp theo ID' })
  async getOne(@Param('id') id: string) {
    return this.orgService.getOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Cập nhật thông tin Doanh nghiệp (Chỉ Owner & Admin)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgService.update(id, dto);
  }

  @Delete(':id/reset-demo')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Xóa hoàn toàn doanh nghiệp để phục vụ demo lại từ đầu' })
  async resetDemo(
    @CurrentUser('sub') userId: string,
    @Param('id') orgId: string,
  ) {
    return this.orgService.resetDemo(userId, orgId);
  }
}
