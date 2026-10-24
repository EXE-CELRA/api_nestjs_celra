import { IsString, IsNumber, IsOptional, IsNotEmpty, IsBoolean, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCitSummaryDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  quarter: string | number; // 1, 2, 3, 4 hoặc 'ALL'
}

export class QueryCitRevenueDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  quarter: string | number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateCitRevenueDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  @Type(() => Number)
  quarter: number;

  @IsNotEmpty()
  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  invoiceNo?: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @Type(() => Number)
  amount: number;
}

export class UpdateCitRevenueDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  invoiceNo?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  amount?: number;
}

export class QueryCitExpenseDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  quarter: string | number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ALL', 'DISALLOWED', 'DEDUCTIBLE'])
  filterB4?: 'ALL' | 'DISALLOWED' | 'DEDUCTIBLE' = 'ALL';
}

export class CreateCitExpenseDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  @Type(() => Number)
  quarter: number;

  @IsNotEmpty()
  @IsString()
  date: string;

  @IsNotEmpty()
  @IsString()
  category: string;

  @IsNotEmpty()
  @Type(() => Number)
  amount: number;

  @IsNotEmpty()
  @IsString()
  paymentMethod: string;

  @IsNotEmpty()
  @IsString()
  hasInvoice: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCitExpenseDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  hasInvoice?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BatchImportRevenuesDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  @Type(() => Number)
  quarter: number;

  @IsNotEmpty()
  items: Array<{
    date: string;
    invoiceNo?: string;
    description: string;
    amount: number;
  }>;
}

export class BatchImportExpensesDto {
  @IsNotEmpty()
  @Type(() => Number)
  year: number;

  @IsNotEmpty()
  @Type(() => Number)
  quarter: number;

  @IsNotEmpty()
  items: Array<{
    date: string;
    category: string;
    amount: number;
    paymentMethod: string;
    hasInvoice: string;
    note?: string;
  }>;
}
