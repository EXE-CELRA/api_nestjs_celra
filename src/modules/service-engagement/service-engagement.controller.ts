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
import { ServiceEngagementService } from './service-engagement.service';
import { CreateEngagementDto, UpdateEngagementDto } from './dto/engagement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Service Engagements (Hợp đồng dịch vụ kế toán/luật)')
@Controller('service-engagements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ServiceEngagementController {
  constructor(private readonly engagementService: ServiceEngagementService) {}

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Ký kết/Thiết lập hợp đồng dịch vụ kế toán mới' })
  async create(
    @Headers('x-organization-id') orgId: string,
    @Body() dto: CreateEngagementDto,
  ) {
    return this.engagementService.create(orgId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Lấy danh sách các hợp đồng dịch vụ của doanh nghiệp' })
  async findAll(@Headers('x-organization-id') orgId: string) {
    return this.engagementService.findAll(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết hợp đồng dịch vụ theo ID' })
  async findOne(@Param('id') id: string) {
    return this.engagementService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.service_accountant)
  @ApiOperation({ summary: 'Cập nhật phạm vi công việc trong/ngoài hợp đồng' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEngagementDto,
  ) {
    return this.engagementService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Xóa hợp đồng dịch vụ' })
  async remove(@Param('id') id: string) {
    return this.engagementService.remove(id);
  }
}
