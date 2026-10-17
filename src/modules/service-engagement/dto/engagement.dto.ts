import { IsNotEmpty, IsString, IsArray, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EngagementStatus } from '@prisma/client';

export class CreateEngagementDto {
  @ApiProperty({ example: 'Công ty Kế toán An Tâm', description: 'Tên công ty dịch vụ kế toán/luật' })
  @IsString()
  @IsNotEmpty()
  firmName!: string;

  @ApiProperty({ example: 'Lê Thu Hà', description: 'Trưởng nhóm phụ trách dịch vụ' })
  @IsString()
  @IsNotEmpty()
  leadName!: string;

  @ApiProperty({ example: 'lethuha@antam.vn', description: 'Email liên hệ' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '0988776655', description: 'Số điện thoại' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({
    example: ['Kê khai thuế GTGT', 'Báo cáo tài chính năm', 'Đối chiếu hóa đơn'],
    description: 'Danh sách các đầu việc nằm trong phạm vi hợp đồng (In-scope)',
  })
  @IsArray()
  scope!: string[];

  @ApiProperty({
    example: ['Cấp giấy phép cơ sở đủ điều kiện ATTP', 'Thủ tục thành lập chi nhánh', 'Tranh chấp lao động'],
    description: 'Danh sách các đầu việc ngoài phạm vi (Out-of-scope cần chuyển chuyên gia)',
  })
  @IsArray()
  outOfScope!: string[];
}

export class UpdateEngagementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firmName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  scope?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  outOfScope?: string[];

  @ApiPropertyOptional({ enum: EngagementStatus })
  @IsOptional()
  @IsEnum(EngagementStatus)
  status?: EngagementStatus;
}
