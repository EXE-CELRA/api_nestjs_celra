import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { OrgRolesGuard } from '../../common/guards/org-roles.guard';
import { ValidatedOrgId } from '../../common/decorators/validated-org-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Departments (Phòng ban)')
@Controller('departments')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
@ApiBearerAuth()
export class DepartmentController {
  constructor(private readonly deptService: DepartmentService) {}

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Tạo phòng ban mới trong doanh nghiệp' })
  async create(
    @ValidatedOrgId() orgId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.deptService.create(orgId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Lấy danh sách các phòng ban kèm số lượng nhân sự' })
  async findAll(@ValidatedOrgId() orgId: string) {
    return this.deptService.findAll(orgId);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Cập nhật thông tin phòng ban' })
  async update(
    @Param('id') id: string,
    @ValidatedOrgId() orgId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.deptService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Xóa phòng ban' })
  async remove(
    @Param('id') id: string,
    @ValidatedOrgId() orgId: string,
  ) {
    return this.deptService.remove(id, orgId);
  }
}
