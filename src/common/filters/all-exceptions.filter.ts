import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProd = process.env.NODE_ENV === 'production';
    const correlationId = crypto.randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Lỗi máy chủ nội bộ (Internal Server Error)';
    let internalDetail = '';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null && 'message' in res) {
        message = (res as { message: string | string[] }).message;
      }
      internalDetail = JSON.stringify(message);
    } else if (
      exception &&
      typeof exception === 'object' &&
      (exception as { name?: string }).name === 'MulterError'
    ) {
      // Xử lý riêng lỗi upload Multer trả về 413/400 chuẩn thay vì 500
      const multerErr = exception as { code?: string; message?: string };
      if (multerErr.code === 'LIMIT_FILE_SIZE') {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        message = 'Kích thước tệp tải lên vượt quá giới hạn cho phép (tối đa 25MB).';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = 'Tệp tải lên không hợp lệ hoặc vượt quá giới hạn cho phép.';
      }
      internalDetail = `${multerErr.code || 'MULTER_ERROR'}: ${multerErr.message || ''}`;
    } else if (exception instanceof Error) {
      internalDetail = exception.stack || exception.message;
      // Ẩn thông báo lỗi thô (DB/SQL/Stack) khi status 500 ở Production
      message = isProd
        ? 'Đã xảy ra lỗi hệ thống nội bộ. Vui lòng thử lại sau hoặc cung cấp mã tra soát cho bộ phận hỗ trợ.'
        : exception.message;
    }

    this.logger.error(
      `[${correlationId}] [${request.method}] ${request.url} - Status: ${status} - Error: ${internalDetail || JSON.stringify(message)}`,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(status >= 500 ? { correlationId } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
