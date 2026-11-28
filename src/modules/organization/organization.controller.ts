import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, ValidatedOrgId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Organizations / Workspaces')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post('onboarding')
  @ApiOperation({ summary: 'Khởi tạo Doanh nghiệp mới (Onboarding Wizard)' })
  async create(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() dto: CreateOrganizationDto,
  ) {
    if (userRole === UserRole.admin) {
      throw new ForbiddenException('Tài khoản Quản trị viên hệ thống không thể khởi tạo doanh nghiệp khách hàng.');
    }
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

  @Get(':orgId')
  @UseGuards(OrganizationMembershipGuard)
  @ApiOperation({ summary: 'Lấy chi tiết thông tin Doanh nghiệp theo ID (Chỉ thành viên hợp lệ)' })
  async getOne(
    @Param('orgId') _orgIdParam: string,
    @ValidatedOrgId() orgId: string,
  ) {
    return this.orgService.getOne(orgId);
  }

  @Patch(':orgId')
  @UseGuards(OrganizationMembershipGuard, RolesGuard)
  @Roles(UserRole.owner)
  @ApiOperation({ summary: 'Cập nhật thông tin Doanh nghiệp (Chỉ Chủ doanh nghiệp)' })
  async update(
    @Param('orgId') _orgIdParam: string,
    @ValidatedOrgId() orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgService.update(orgId, dto);
  }
}
