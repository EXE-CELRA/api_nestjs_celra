import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { extname } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as crypto from 'crypto';

export interface ChatFileRecord {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  sizeFormatted: string;
  fileType: 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'csv' | 'txt' | 'other';
  extractedText: string;
  structureSummary: string;
  orgId: string;
  userId: string;
  conversationId?: string;
  uploadedAt: Date;
}

@Injectable()
export class ChatFileService {
  private readonly logger = new Logger(ChatFileService.name);
  private readonly filesStore = new Map<string, ChatFileRecord>();
  private readonly uploadDir = './uploads/chat-files';

  constructor() {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Tiếp nhận, xác thực, trích xuất cấu trúc và lưu trữ tệp tài liệu trong khung chat.
   */
  async processAndStoreFile(
    orgId: string,
    userId: string,
    file: Express.Multer.File,
    conversationId?: string,
  ): Promise<{
    fileId: string;
    fileName: string;
    fileType: string;
    fileSize: string;
    extractedChars: number;
    summary: string;
  }> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException(
        'Tệp tin tải lên bị rỗng (0 bytes) hoặc không có dữ liệu. Vui lòng chọn tệp tin hợp lệ.',
      );
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_SIZE) {
      throw new BadRequestException(
        'Dung lượng tệp tin vượt quá giới hạn 25MB. Vui lòng nén hoặc giảm dung lượng trước khi tải lên.',
      );
    }

    const ext = extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt'];
    if (!allowedExts.includes(ext)) {
      throw new BadRequestException(
        `Định dạng tệp "${ext}" hiện chưa được hỗ trợ. Hệ thống hỗ trợ các định dạng: PDF (.pdf), Word (.docx, .doc), Excel (.xlsx, .xls), CSV (.csv) và Văn bản (.txt).`,
      );
    }

    let fileType: ChatFileRecord['fileType'] = 'other';
    if (ext === '.pdf') fileType = 'pdf';
    else if (ext === '.docx' || ext === '.doc') fileType = ext === '.docx' ? 'docx' : 'doc';
    else if (ext === '.xlsx' || ext === '.xls') fileType = ext === '.xlsx' ? 'xlsx' : 'xls';
    else if (ext === '.csv') fileType = 'csv';
    else if (ext === '.txt') fileType = 'txt';

    let extractedText = '';
    let structureSummary = '';

    try {
      if (fileType === 'pdf') {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: file.buffer });
        try {
          const res = await parser.getText();
          extractedText = (res.text || '').trim();
          structureSummary = `Tệp PDF "${file.originalname}" gồm ${res.pages?.length || 1} trang`;
        } finally {
          await parser.destroy();
        }
      } else if (fileType === 'docx' || fileType === 'doc') {
        const mammoth = require('mammoth');
        const docResult = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = (docResult.value || '').trim();
        structureSummary = `Tệp Word "${file.originalname}"`;
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        const XLSX = require('xlsx');
        const wb = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetSummaries: string[] = [];
        let combinedText = '';

        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (csv && csv.trim()) {
            sheetSummaries.push(`Sheet "${sheetName}"`);
            combinedText += `\n--- [BẢNG TÍNH / SHEET: ${sheetName}] ---\n${csv}\n`;
          }
        }
        extractedText = combinedText.trim();
        structureSummary = `Tệp Excel "${file.originalname}" (${sheetSummaries.join(', ') || '0 sheet có dữ liệu'})`;
      } else if (fileType === 'csv' || fileType === 'txt') {
        extractedText = file.buffer.toString('utf-8').trim();
        structureSummary = `Tệp văn bản "${file.originalname}" (${fileType.toUpperCase()})`;
      }
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      this.logger.error(`Lỗi khi trích xuất tệp ${file.originalname}: ${msg}`);
      throw new BadRequestException(
        `Không thể trích xuất nội dung từ tệp "${file.originalname}". Tệp có thể bị hỏng, cài đặt mật khẩu hoặc sai cấu trúc: ${msg}`,
      );
    }

    if (!extractedText) {
      extractedText = `[Tài liệu "${file.originalname}" không chứa nội dung văn bản có thể trích xuất trực tiếp hoặc là tệp quét dạng ảnh chưa qua OCR]`;
    }

    const MAX_CHARS = 45000;
    if (extractedText.length > MAX_CHARS) {
      extractedText =
        extractedText.slice(0, MAX_CHARS) +
        `\n\n[...Đã trích xuất ${MAX_CHARS.toLocaleString('vi-VN')} ký tự đầu tiên của tệp tin trên tổng số ${extractedText.length.toLocaleString('vi-VN')} ký tự để tối ưu hóa ngữ cảnh AI...]`;
    }

    const fileId = `file-${crypto.randomUUID()}`;
    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const record: ChatFileRecord = {
      id: fileId,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      sizeFormatted,
      fileType,
      extractedText,
      structureSummary,
      orgId,
      userId,
      conversationId,
      uploadedAt: new Date(),
    };

    this.filesStore.set(fileId, record);

    // Lưu backup tệp lên đĩa
    try {
      const diskFilename = `${fileId}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      writeFileSync(`${this.uploadDir}/${diskFilename}`, file.buffer);
    } catch (diskErr) {
      this.logger.warn(`Không thể ghi tệp lên đĩa: ${(diskErr as Error)?.message}`);
    }

    this.logger.log(
      `[CHAT FILE] Đã lưu tệp ${file.originalname} (${fileId}) cho Org ${orgId}. Trích xuất ${extractedText.length} ký tự.`,
    );

    return {
      fileId,
      fileName: file.originalname,
      fileType,
      fileSize: sizeFormatted,
      extractedChars: extractedText.length,
      summary: `${structureSummary} — Kích thước: ${sizeFormatted}`,
    };
  }

  /**
   * Lấy bản ghi tệp kèm bảo mật cách ly doanh nghiệp (Multi-tenant check).
   */
  getFile(fileId: string, orgId: string): ChatFileRecord {
    const record = this.filesStore.get(fileId);
    if (!record) {
      throw new NotFoundException(`Không tìm thấy tệp tài liệu trong phiên làm việc (ID: ${fileId})`);
    }

    if (record.orgId !== orgId) {
      this.logger.warn(
        `[SECURITY] Cố tình truy cập chéo tệp ${fileId} từ Org ${orgId} (chủ sở hữu: Org ${record.orgId})`,
      );
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào tệp tài liệu của doanh nghiệp khác.',
      );
    }

    return record;
  }

  /**
   * Lấy danh sách các tệp gắn với cuộc hội thoại hoặc tệp mới nhất của tổ chức.
   */
  getFilesByContext(
    orgId: string,
    fileIds?: string[],
    conversationId?: string,
  ): ChatFileRecord[] {
    const results: ChatFileRecord[] = [];

    if (Array.isArray(fileIds) && fileIds.length > 0) {
      for (const id of fileIds) {
        try {
          const f = this.getFile(id, orgId);
          if (f && !results.some((r) => r.id === f.id)) {
            results.push(f);
          }
        } catch {
          // ignore or skip unauthorized
        }
      }
      return results;
    }

    // Nếu không truyền fileIds nhưng có conversationId, tìm các file thuộc conversation đó
    if (conversationId) {
      for (const record of this.filesStore.values()) {
        if (record.orgId === orgId && record.conversationId === conversationId) {
          if (!results.some((r) => r.id === record.id)) {
            results.push(record);
          }
        }
      }
    }

    // Nếu vẫn chưa có và trong bộ nhớ có tệp của org vừa tải lên trong vòng 1 giờ
    if (results.length === 0) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recent = Array.from(this.filesStore.values())
        .filter((r) => r.orgId === orgId && r.uploadedAt.getTime() > oneHourAgo)
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

      if (recent.length > 0) {
        results.push(recent[0]);
      }
    }

    return results;
  }
}
