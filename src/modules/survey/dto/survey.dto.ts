import { IsOptional, IsArray, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitSurveyDto {
  @ApiPropertyOptional({ description: 'Hồ sơ nền tảng bước 1' })
  @IsOptional()
  @IsObject()
  baseProfile?: any;

  @ApiPropertyOptional({ description: 'Danh sách các câu hỏi tình huống' })
  @IsOptional()
  @IsArray()
  questions?: any[];

  @ApiPropertyOptional({ description: 'Danh sách câu trả lời' })
  @IsOptional()
  @IsArray()
  answers?: any[];
}
