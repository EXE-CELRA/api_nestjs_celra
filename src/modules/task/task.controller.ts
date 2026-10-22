import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TaskService } from './task.service';
import { ComplianceNotificationService } from './compliance-notification.service';
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
  AddTaskCommentDto,
  SelfCertifyTaskDto,
  CreateCalendarNoteDto,
  UpdateCalendarNoteDto,
} from './dto/task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../../common/guards/organization-membership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaskStatus, UserRole, WaitingOnRole, StatutoryCycleType } from '@prisma/client';

@ApiTags('Tasks & Checklists (Quản lý Tác vụ, Quy trình & Nhắc hạn)')
@Controller('tasks')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
@ApiBearerAuth()
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly notificationService: ComplianceNotificationService,
  ) {}

  @Post()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tạo tác vụ tuân thủ mới' })
  async create(
    @Headers('x-organization-id') orgId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.create(orgId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiQuery({ name: 'status', enum: TaskStatus, required: false })
  @ApiQuery({ name: 'assigneeRole', enum: UserRole, required: false })
  @ApiQuery({ name: 'waitingOnRole', enum: WaitingOnRole, required: false })
  @ApiQuery({ name: 'periodCycle', enum: StatutoryCycleType, required: false })
  @ApiQuery({ name: 'checklistId', type: String, required: false })
  @ApiOperation({ summary: 'Lấy danh sách các tác vụ có bộ lọc (Table, Kanban, Đợt Luật Định)' })
  async findAll(
    @Headers('x-organization-id') orgId: string,
    @Query('status') status?: TaskStatus,
    @Query('assigneeRole') assigneeRole?: UserRole,
    @Query('waitingOnRole') waitingOnRole?: WaitingOnRole,
    @Query('departmentId') departmentId?: string,
    @Query('periodCycle') periodCycle?: StatutoryCycleType,
    @Query('checklistId') checklistId?: string,
  ) {
    return this.taskService.findAll(orgId, {
      status,
      assigneeRole,
      waitingOnRole,
      departmentId,
      periodCycle,
      checklistId,
    });
  }

  @Get('checklists')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy danh mục Checklists tuân thủ và tiến độ hoàn thành' })
  async getChecklists(@Headers('x-organization-id') orgId: string) {
    return this.taskService.findAllChecklists(orgId);
  }

  @Get('notifications')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiQuery({ name: 'unreadOnly', type: Boolean, required: false })
  @ApiOperation({ summary: 'Lấy danh sách thông báo nhắc hạn tuân thủ trong ứng dụng' })
  async getNotifications(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    return this.notificationService.getUserNotifications(orgId, userId, unreadOnly);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Đánh dấu thông báo nhắc hạn đã đọc' })
  async markNotificationRead(
    @Param('id') notificationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notificationService.markNotificationRead(notificationId, userId);
  }

  @Post('notifications/read-all')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo nhắc hạn đã đọc' })
  async markAllNotificationsRead(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notificationService.markAllNotificationsRead(orgId, userId);
  }

  @Post('trigger-reminders')
  @ApiOperation({ summary: 'Thực thi quét nhắc hạn và bù kỳ định kỳ ngay lập tức (Admin/Debug)' })
  async triggerReminders() {
    await this.notificationService.runPeriodicComplianceChecks();
    return { success: true, message: 'Đã hoàn tất tiến trình quét nhắc hạn và tự động sinh kỳ mới.' };
  }

  @Get('calendar-notes')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiQuery({ name: 'month', required: false, description: 'Lọc theo tháng dạng YYYY-MM' })
  @ApiOperation({ summary: 'Lấy danh sách ghi chú lịch tuân thủ của doanh nghiệp' })
  async getCalendarNotes(
    @Headers('x-organization-id') orgId: string,
    @Query('month') month?: string,
  ) {
    return this.taskService.getCalendarNotes(orgId, month);
  }

  @Post('calendar-notes')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Tạo ghi chú lịch tuân thủ mới' })
  async createCalendarNote(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('name') userName: string,
    @Body() dto: CreateCalendarNoteDto,
  ) {
    return this.taskService.createCalendarNote(orgId, userId, userName || 'Người dùng', dto);
  }

  @Patch('calendar-notes/:id')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Cập nhật ghi chú lịch' })
  async updateCalendarNote(
    @Headers('x-organization-id') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarNoteDto,
  ) {
    return this.taskService.updateCalendarNote(id, orgId, dto);
  }

  @Delete('calendar-notes/:id')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Xóa ghi chú lịch' })
  async deleteCalendarNote(
    @Headers('x-organization-id') orgId: string,
    @Param('id') id: string,
  ) {
    return this.taskService.deleteCalendarNote(id, orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết tác vụ (Bằng chứng, Bình luận, Timeline)' })
  async findOne(@Param('id') id: string) {
    return this.taskService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái tác vụ & Ai đang chờ ai' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.taskService.updateStatus(id, userId, dto);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Thêm bình luận trao đổi vào tác vụ' })
  async addComment(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: AddTaskCommentDto,
  ) {
    return this.taskService.addComment(id, userId, dto);
  }

  @Post(':id/self-certify')
  @ApiOperation({ summary: 'Xác nhận tự chịu trách nhiệm (Không tải bằng chứng)' })
  async selfCertify(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SelfCertifyTaskDto,
  ) {
    return this.taskService.selfCertify(id, userId, dto);
  }
}
