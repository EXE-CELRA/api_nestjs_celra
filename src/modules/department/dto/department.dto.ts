import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Phòng Nhân sự', description: 'Tên phòng ban' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'HR', description: 'Mã phòng ban' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ example: 'Trần Thu Lan', description: 'Trưởng bộ phận' })
  @IsOptional()
  @IsString()
  leadName?: string;

  @ApiPropertyOptional({ example: 'Phụ trách nhân sự và lao động' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
