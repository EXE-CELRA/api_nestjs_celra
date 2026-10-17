import { IsNotEmpty, IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';

export class CreateRuleDto {
  @ApiProperty({ example: 'RULE-HD-01', description: 'Mã định danh quy tắc' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Hóa đơn điện tử máy tính tiền F&B', description: 'Tên quy tắc tuân thủ' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Áp dụng cho cơ sở kinh doanh F&B có xuất hóa đơn trực tiếp cho người tiêu dùng' })
  @IsString()
  @IsNotEmpty()
  conditionSummary!: string;

  @ApiPropertyOptional({
    example: { industry: 'F&B', hasOnlineSales: true },
    description: 'Điều kiện JSON để kích hoạt',
  })
  @IsOptional()
  conditionsJson?: Record<string, unknown>;

  @ApiPropertyOptional({ example: ['TASK-HD-01'] })
  @IsOptional()
  @IsArray()
  triggeredChecklists?: string[];

  @ApiPropertyOptional({ example: '1.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({ example: 'Khoản 2 Điều 90 Luật Quản lý thuế số 38/2019/QH14 và Nghị định 123/2020/NĐ-CP' })
  @IsString()
  @IsNotEmpty()
  legalReference!: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({ example: 'Hóa đơn & Doanh thu' })
  @IsString()
  @IsNotEmpty()
  category!: string;
}
