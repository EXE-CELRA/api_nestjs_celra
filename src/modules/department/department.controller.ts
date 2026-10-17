import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Departments (Phòng ban)')
@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DepartmentController {
  constructor(private readonly deptService: DepartmentService) {}

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Tạo phòng ban mới trong doanh nghiệp' })
  async create(
    @Headers('x-organization-id') orgId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.deptService.create(orgId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Lấy danh sách các phòng ban kèm số lượng nhân sự' })
  async findAll(@Headers('x-organization-id') orgId: string) {
    return this.deptService.findAll(orgId);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Cập nhật thông tin phòng ban' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.deptService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Xóa phòng ban' })
  async remove(@Param('id') id: string) {
    return this.deptService.remove(id);
  }
}
