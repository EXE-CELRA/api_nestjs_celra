import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EvidenceStatus } from '@prisma/client';

export class VerifyEvidenceDto {
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UploadEvidenceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  quarter?: string | number;

  @IsOptional()
  year?: string | number;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  metadata?: string;
}
