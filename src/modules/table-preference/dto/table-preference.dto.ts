import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ColumnConfigItemDto {
  @ApiProperty({ example: 'title', description: 'Mã định danh duy nhất của cột' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: true, description: 'Trạng thái hiển thị cột' })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 0, description: 'Thứ tự hiển thị của cột' })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({ example: 200, description: 'Độ rộng cột (px)' })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(1500)
  width?: number;

  @ApiPropertyOptional({
    example: 'left',
    description: 'Cố định cột bên trái, phải hoặc không cố định',
  })
  @IsOptional()
  @IsIn(['left', 'right', false])
  fixed?: 'left' | 'right' | false;
}

export class SaveTablePreferenceDto {
  @ApiProperty({
    type: [ColumnConfigItemDto],
    description: 'Danh sách cấu hình các cột của bảng',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnConfigItemDto)
  columnsConfig: ColumnConfigItemDto[];
}
