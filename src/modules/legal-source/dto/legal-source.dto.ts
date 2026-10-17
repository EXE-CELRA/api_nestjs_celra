import { IsNotEmpty, IsString, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LegalSourceStatus } from '@prisma/client';

export class CreateLegalSourceDto {
  @ApiProperty({ example: 'Luật Doanh nghiệp số 59/2020/QH14', description: 'Tên văn bản luật' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: '59/2020/QH14', description: 'Số hiệu văn bản' })
  @IsString()
  @IsNotEmpty()
  documentNumber!: string;

  @ApiProperty({ example: 'Quốc hội', description: 'Cơ quan ban hành' })
  @IsString()
  @IsNotEmpty()
  authority!: string;

  @ApiProperty({ example: '2020-06-17T00:00:00.000Z' })
  @IsDateString()
  issuedDate!: string;

  @ApiProperty({ example: '2021-01-01T00:00:00.000Z' })
  @IsDateString()
  effectiveDate!: string;

  @ApiPropertyOptional({ example: '1.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({ example: 'Điều 90, Khoản 2' })
  @IsString()
  @IsNotEmpty()
  relevantSection!: string;

  @ApiProperty({ example: 'Quy định về trách nhiệm của doanh nghiệp trong việc đăng ký và sử dụng hóa đơn điện tử' })
  @IsString()
  @IsNotEmpty()
  summary!: string;

  @ApiPropertyOptional({ example: 'https://thuvienphapluat.vn/van-ban/Doanh-nghiep/Luat-Doanh-nghiep-2020-59-2020-QH14-432857.aspx' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ enum: LegalSourceStatus, default: LegalSourceStatus.valid })
  @IsOptional()
  @IsEnum(LegalSourceStatus)
  status?: LegalSourceStatus;
}
