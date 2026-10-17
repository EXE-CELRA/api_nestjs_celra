import { IsNotEmpty, IsInt, IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnswerItemDto {
  @ApiProperty({ example: 1, description: 'ID câu hỏi' })
  @IsInt()
  @IsNotEmpty()
  questionId!: number;

  @ApiProperty({ example: 'Khởi tạo từ máy tính tiền kết nối cơ quan thuế', description: 'Lựa chọn của người dùng' })
  @IsString()
  @IsNotEmpty()
  selectedOption!: string;

  @ApiPropertyOptional({ example: 'Áp dụng từ đầu quý 1' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class SubmitSurveyDto {
  @ApiPropertyOptional({ description: 'Thông tin hồ sơ nền tảng (Base Profile)' })
  @IsOptional()
  baseProfile?: any;

  @ApiPropertyOptional({ description: 'Danh sách các câu hỏi tình huống Dynamic' })
  @IsOptional()
  questions?: any[];

  @ApiPropertyOptional({ type: [AnswerItemDto], description: 'Danh sách các câu trả lời' })
  @IsOptional()
  @IsArray()
  answers?: AnswerItemDto[];
}
