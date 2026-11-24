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
import { MembershipService } from './membership.service';
import { InviteMemberDto, UpdateMemberDto } from './dto/membership.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { OrgRolesGuard } from '../../common/guards/org-roles.guard';
import { ValidatedOrgId } from '../../common/decorators/validated-org-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Memberships & Roles (Thành viên & Phân quyền)')
@Controller('memberships')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrgRolesGuard)
@ApiBearerAuth()
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post('invite')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Mời thành viên mới vào Doanh nghiệp và phân vai trò' })
  async invite(
    @ValidatedOrgId() orgId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipService.invite(orgId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Lấy danh sách toàn bộ thành viên trong Doanh nghiệp' })
  async findAll(@ValidatedOrgId() orgId: string) {
    return this.membershipService.findAll(orgId);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Cập nhật vai trò hoặc phòng ban của thành viên' })
  async update(
    @Param('id') id: string,
    @ValidatedOrgId() orgId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membershipService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiHeader({ name: 'x-organization-id', description: 'ID của Doanh nghiệp hiện tại' })
  @ApiOperation({ summary: 'Xóa thành viên khỏi Doanh nghiệp' })
  async remove(
    @Param('id') id: string,
    @ValidatedOrgId() orgId: string,
  ) {
    return this.membershipService.remove(id, orgId);
  }
}
