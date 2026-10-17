import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LegalSourceService } from './legal-source.service';
import { CreateLegalSourceDto } from './dto/legal-source.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Legal Sources (Thư viện Văn bản Pháp luật)')
@Controller('legal-sources')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LegalSourceController {
  constructor(private readonly legalService: LegalSourceService) {}

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Thêm văn bản luật mới vào CSDL (Chỉ Admin)' })
  async create(@Body() dto: CreateLegalSourceDto) {
    return this.legalService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tra cứu thư viện các văn bản quy phạm pháp luật' })
  async findAll() {
    return this.legalService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết văn bản luật và điều khoản liên quan' })
  async findOne(@Param('id') id: string) {
    return this.legalService.findOne(id);
  }
}
