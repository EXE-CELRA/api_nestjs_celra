import { IsNotEmpty, IsString, IsArray, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpertCaseDto {
  @ApiProperty({ description: 'ID Tác vụ ngoài phạm vi cần chuyển chuyên gia' })
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @ApiProperty({ example: 'Cần luật sư thẩm tra tính pháp lý của hồ sơ đủ điều kiện ATTP' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ example: 'Pháp lý F&B & ATTP' })
  @IsString()
  @IsNotEmpty()
  specialtyCategory!: string;

  @ApiPropertyOptional({ example: ['Hợp đồng thuê mặt bằng', 'Bản vẽ mặt bằng bố trí bếp'] })
  @IsOptional()
  @IsArray()
  sharedDataSummary?: string[];

  @ApiPropertyOptional({ description: 'Danh sách ID tài liệu được chia sẻ cho chuyên gia' })
  @IsOptional()
  @IsArray()
  sharedDocIds?: string[];
}

export class SubmitQuoteDto {
  @ApiProperty({ example: 500000, description: 'Số tiền báo giá phí tư vấn (VND)' })
  @IsNumber()
  @Min(0)
  quoteAmount!: number;

  @ApiPropertyOptional({ example: 'Bao gồm rà soát hồ sơ mặt bằng và tư vấn hồ sơ thẩm duyệt ATTP' })
  @IsOptional()
  @IsString()
  quoteNotes?: string;

  @ApiPropertyOptional({ example: 'Luật sư Hoàng Nam (Đoàn Luật sư TP.HCM)' })
  @IsOptional()
  @IsString()
  expertName?: string;
}

export class SubmitConclusionDto {
  @ApiProperty({
    example: 'Hồ sơ mặt bằng đủ điều kiện. Cần bổ sung sơ đồ quy trình bếp một chiều và giấy khám sức khỏe nhân viên theo Thông tư 38.',
    description: 'Nội dung kết luận và khuyến nghị pháp lý chính thức',
  })
  @IsString()
  @IsNotEmpty()
  expertFeedback!: string;
}
