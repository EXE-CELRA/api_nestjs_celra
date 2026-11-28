import { IsOptional, IsArray, IsObject } from 'class-validator';

export class SubmitSurveyDto {
  @IsOptional()
  @IsObject()
  baseProfile?: any;

  @IsOptional()
  @IsArray()
  questions?: any[];

  @IsOptional()
  @IsArray()
  answers?: any[];
}
