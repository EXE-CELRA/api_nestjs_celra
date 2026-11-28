import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TablePreferenceService } from './table-preference.service';
import { SaveTablePreferenceDto } from './dto/table-preference.dto';

@ApiTags('Table Preferences (Tùy chỉnh giao diện bảng đồng bộ đa thiết bị)')
@Controller('table-preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TablePreferenceController {
  constructor(private readonly tablePreferenceService: TablePreferenceService) {}

  @Get(':tableKey')
  @ApiHeader({ name: 'x-organization-id', required: false, description: 'ID Doanh nghiệp (nếu có)' })
  @ApiOperation({ summary: 'Lấy cấu hình cột giao diện bảng đã lưu của người dùng' })
  async getPreference(
    @CurrentUser('sub') userId: string,
    @Headers('x-organization-id') orgId: string | undefined,
    @Param('tableKey') tableKey: string,
  ) {
    return this.tablePreferenceService.getPreference(userId, orgId, tableKey);
  }

  @Put(':tableKey')
  @ApiHeader({ name: 'x-organization-id', required: false, description: 'ID Doanh nghiệp (nếu có)' })
  @ApiOperation({ summary: 'Lưu cấu hình cột giao diện bảng đồng bộ đa thiết bị' })
  async savePreference(
    @CurrentUser('sub') userId: string,
    @Headers('x-organization-id') orgId: string | undefined,
    @Param('tableKey') tableKey: string,
    @Body() dto: SaveTablePreferenceDto,
  ) {
    return this.tablePreferenceService.upsertPreference(
      userId,
      orgId,
      tableKey,
      dto.columnsConfig,
    );
  }

  @Delete(':tableKey')
  @ApiHeader({ name: 'x-organization-id', required: false, description: 'ID Doanh nghiệp (nếu có)' })
  @ApiOperation({ summary: 'Khôi phục cấu hình cột bảng về mẫu ngầm định' })
  async resetPreference(
    @CurrentUser('sub') userId: string,
    @Headers('x-organization-id') orgId: string | undefined,
    @Param('tableKey') tableKey: string,
  ) {
    return this.tablePreferenceService.resetPreference(userId, orgId, tableKey);
  }
}
