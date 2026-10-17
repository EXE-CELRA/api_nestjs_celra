import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TaskService } from './task.service';
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
  AddTaskCommentDto,
  SelfCertifyTaskDto,
} from './dto/task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaskStatus, UserRole, WaitingOnRole } from '@prisma/client';

@ApiTags('Tasks & Checklists (Quản lý Tác vụ & Quy trình)')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

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
  @ApiOperation({ summary: 'Lấy danh sách các tác vụ có bộ lọc (Table & Kanban)' })
  async findAll(
    @Headers('x-organization-id') orgId: string,
    @Query('status') status?: TaskStatus,
    @Query('assigneeRole') assigneeRole?: UserRole,
    @Query('waitingOnRole') waitingOnRole?: WaitingOnRole,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.taskService.findAll(orgId, {
      status,
      assigneeRole,
      waitingOnRole,
      departmentId,
    });
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
