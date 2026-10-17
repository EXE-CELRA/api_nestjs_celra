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
import { MembershipService } from './membership.service';
import { InviteMemberDto, UpdateMemberDto } from './dto/membership.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Memberships & Roles (Thành viên & Phân quyền)')
@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post('invite')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Mời thành viên mới vào Doanh nghiệp và phân vai trò' })
  async invite(
    @Headers('x-organization-id') orgId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipService.invite(orgId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Lấy danh sách toàn bộ thành viên trong Doanh nghiệp' })
  async findAll(@Headers('x-organization-id') orgId: string) {
    return this.membershipService.findAll(orgId);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Cập nhật vai trò hoặc phòng ban của thành viên' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membershipService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Xóa thành viên khỏi Doanh nghiệp' })
  async remove(@Param('id') id: string) {
    return this.membershipService.remove(id);
  }
}
