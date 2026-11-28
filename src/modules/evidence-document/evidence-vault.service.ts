import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { extname, resolve, basename, sep } from 'path';

const VAULT_MAGIC_HEADER = Buffer.from('CELRAENC01', 'ascii'); // 10 bytes
const GCM_IV_LENGTH = 12; // 96-bit NIST recommended IV for AES-256-GCM
const GCM_TAG_LENGTH = 16; // 128-bit authentication tag

export interface ValidatedEvidenceMeta {
  extension: string;
  normalizedMimeType: string;
  sha256Checksum: string;
}

@Injectable()
export class EvidenceVaultService {
  private readonly logger = new Logger(EvidenceVaultService.name);
  private bucketEnsured = false;

  private static readonly ALLOWED_EVIDENCE_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  constructor(private readonly config: ConfigService) {}

  /**
   * 1. KIỂM TRA WHITELIST ĐỊNH DẠNG KẾ TOÁN & ĐỐI CHIẾU CHỮ KÝ NHỊ PHÂN (MAGIC BYTES)
   */
  public validateAndHashFile(file: Express.Multer.File): ValidatedEvidenceMeta {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Tệp tải lên trống hoặc không hợp lệ.');
    }

    if (file.buffer.length > 25 * 1024 * 1024) {
      throw new BadRequestException('Dung lượng tệp vượt quá giới hạn an toàn 25MB.');
    }

    const rawExt = extname(file.originalname || '').toLowerCase().trim();
    const normalizedMimeType = EvidenceVaultService.ALLOWED_EVIDENCE_TYPES[rawExt];
    if (!normalizedMimeType) {
      throw new BadRequestException(
        `Định dạng tệp "${rawExt || 'không xác định'}" bị từ chối. Kho chứng từ Thuế chỉ chấp nhận: .pdf, .xml, .xlsx, .xls, .csv, .docx, .doc, .png, .jpg, .webp.`,
      );
    }

    this.assertMagicBytesMatch(rawExt, file.buffer);

    const sha256Checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    return {
      extension: rawExt,
      normalizedMimeType,
      sha256Checksum,
    };
  }

  private assertMagicBytesMatch(ext: string, buf: Buffer): void {
    // Chặn chung tệp thực thi Windows PE (MZ) hoặc Linux ELF giả mạo mọi định dạng
    if (
      (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) ||
      (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46)
    ) {
      throw new BadRequestException(
        'Phát hiện mã thực thi nhị phân giả mạo chứng từ kế toán. Tệp đã bị hệ thống bảo mật chặn đứng.',
      );
    }

    switch (ext) {
      case '.pdf': {
        // %PDF-
        if (buf.length < 5 || buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
          throw new BadRequestException('Tệp .pdf không hợp lệ (chữ ký nhị phân không phải tài liệu PDF thật).');
        }
        break;
      }
      case '.png': {
        const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        if (buf.length < 8 || !buf.subarray(0, 8).equals(pngMagic)) {
          throw new BadRequestException('Tệp .png không hợp lệ (chữ ký nhị phân không khớp định dạng ảnh PNG).');
        }
        break;
      }
      case '.jpg':
      case '.jpeg': {
        if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
          throw new BadRequestException('Tệp ảnh JPEG không hợp lệ (chữ ký nhị phân không khớp).');
        }
        break;
      }
      case '.webp': {
        if (
          buf.length < 12 ||
          buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
          buf.subarray(8, 12).toString('ascii') !== 'WEBP'
        ) {
          throw new BadRequestException('Tệp ảnh WEBP không hợp lệ (chữ ký nhị phân không khớp).');
        }
        break;
      }
      case '.xlsx':
      case '.docx': {
        // OOXML là gói ZIP bắt đầu bằng PK\x03\x04
        if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
          throw new BadRequestException(
            `Tệp ${ext} không hợp lệ (cấu trúc nhị phân không phải tài liệu Office chuẩn OOXML).`,
          );
        }
        break;
      }
      case '.xls':
      case '.doc': {
        // OLE2 Compound Document (D0 CF 11 E0 A1 B1 1A E1) hoặc OOXML (PK\x03\x04)
        const oleMagic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        const isOle = buf.length >= 8 && buf.subarray(0, 8).equals(oleMagic);
        const isZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
        if (!isOle && !isZip) {
          throw new BadRequestException(`Tệp ${ext} không hợp lệ (chữ ký nhị phân Office không khớp).`);
        }
        break;
      }
      case '.xml': {
        const sample = this.decodeXmlOrTextSample(buf);
        const trimmed = sample.trimStart();
        if (!trimmed.startsWith('<')) {
          throw new BadRequestException('Tệp hóa đơn điện tử .xml không đúng cấu trúc XML hợp lệ.');
        }
        const lower = trimmed.toLowerCase();
        if (lower.includes('<script') || lower.includes('<!entity') || lower.includes('javascript:')) {
          throw new BadRequestException(
            'Tệp .xml chứa thẻ thực thi hoặc khai báo thực thể ngoài (XXE/XSS) bị cấm bởi hệ thống bảo mật.',
          );
        }
        break;
      }
      case '.csv': {
        // Chặn tệp nhị phân có NUL byte (trừ UTF-16 BOM hợp lệ) hoặc mã HTML/script
        const isUtf16Bom =
          buf.length >= 2 &&
          ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
        if (!isUtf16Bom && buf.subarray(0, Math.min(buf.length, 4096)).includes(0x00)) {
          throw new BadRequestException('Tệp .csv chứa dữ liệu nhị phân bất thường không hợp lệ.');
        }
        const headLower = buf.subarray(0, Math.min(buf.length, 2048)).toString('utf8').toLowerCase();
        if (headLower.includes('<script') || headLower.includes('<html')) {
          throw new BadRequestException('Tệp .csv chứa mã HTML/Script bị từ chối.');
        }
        break;
      }
      default:
        throw new BadRequestException('Định dạng tệp không nằm trong danh sách cho phép.');
    }
  }

  private decodeXmlOrTextSample(buf: Buffer): string {
    const slice = buf.subarray(0, Math.min(buf.length, 8192));
    if (slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xfe) {
      return slice.subarray(2).toString('utf16le');
    }
    if (slice.length >= 3 && slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf) {
      return slice.subarray(3).toString('utf8');
    }
    return slice.toString('utf8');
  }

  /**
   * 2. MÃ HÓA & GIẢI MÃ TỆP AES-256-GCM GẮN RÀNG BUỘC TENANT (AAD = organizationId)
   */
  private resolveMasterKey(): Buffer {
    const rawSecret =
      this.config.get<string>('EVIDENCE_ENCRYPTION_KEY')?.trim() ||
      this.config.get<string>('SUPABASE_SECRET_KEY')?.trim() ||
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim();

    if (!rawSecret) {
      throw new InternalServerErrorException(
        'Thiếu cấu hình khóa mã hóa hệ thống (EVIDENCE_ENCRYPTION_KEY / SUPABASE_SECRET_KEY).',
      );
    }

    return crypto.createHmac('sha256', 'celra-evidence-vault-aes256gcm-v1').update(rawSecret).digest();
  }

  public encryptBuffer(plainBuffer: Buffer, organizationId: string): Buffer {
    const key = this.resolveMasterKey();
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`org:${organizationId}`, 'utf8'));

    const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([VAULT_MAGIC_HEADER, iv, authTag, encrypted]);
  }

  public decryptBuffer(envelopeBuffer: Buffer, organizationId: string): Buffer {
    const minLen = VAULT_MAGIC_HEADER.length + GCM_IV_LENGTH + GCM_TAG_LENGTH;
    if (
      envelopeBuffer.length < minLen ||
      !envelopeBuffer.subarray(0, VAULT_MAGIC_HEADER.length).equals(VAULT_MAGIC_HEADER)
    ) {
      // Tương thích ngược với tệp cũ chưa bọc CELRAENC01 (nếu có)
      return envelopeBuffer;
    }

    const key = this.resolveMasterKey();
    const ivStart = VAULT_MAGIC_HEADER.length;
    const tagStart = ivStart + GCM_IV_LENGTH;
    const cipherStart = tagStart + GCM_TAG_LENGTH;

    const iv = envelopeBuffer.subarray(ivStart, tagStart);
    const authTag = envelopeBuffer.subarray(tagStart, cipherStart);
    const ciphertext = envelopeBuffer.subarray(cipherStart);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(`org:${organizationId}`, 'utf8'));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new ForbiddenException(
        'Giải mã chứng từ thất bại: Dữ liệu tệp đã bị thay đổi trái phép hoặc không thuộc doanh nghiệp hiện tại.',
      );
    }
  }

  /**
   * 3. KẾT NỐI SUPABASE PRIVATE STORAGE (0 BYTE LƯU TRÊN ĐĨA CỤC BỘ)
   */
  private getSupabaseConfig() {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL')?.trim().replace(/\/+$/, '');
    const secretKey = (
      this.config.get<string>('SUPABASE_SECRET_KEY') ||
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    )?.trim();
    const bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET')?.trim() || 'celra-evidence';

    if (!supabaseUrl || !secretKey) {
      throw new InternalServerErrorException(
        'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env để lưu trữ chứng từ Cloud.',
      );
    }

    return { supabaseUrl, secretKey, bucket };
  }

  private buildSupabaseAuthHeaders(secretKey: string): Record<string, string> {
    // Khóa thế hệ mới sb_secret_... của Supabase CHỈ gửi qua header `apikey` (không gửi Authorization: Bearer)
    if (secretKey.startsWith('sb_secret_')) {
      return {
        apikey: secretKey,
        'User-Agent': 'celra-compliance-vault/1.0',
      };
    }
    return {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'User-Agent': 'celra-compliance-vault/1.0',
    };
  }

  public async ensurePrivateBucketExists(): Promise<void> {
    if (this.bucketEnsured) {
      return;
    }

    const { supabaseUrl, secretKey, bucket } = this.getSupabaseConfig();
    const authHeaders = this.buildSupabaseAuthHeaders(secretKey);

    const checkRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (checkRes.ok) {
      this.bucketEnsured = true;
      return;
    }

    // Tự động khởi tạo Private Bucket nếu trên Supabase chưa được tạo
    const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: false,
        file_size_limit: 25 * 1024 * 1024,
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => '');
      // Nếu bucket vừa được tạo đồng thời bởi tiến trình khác (409 Duplicate) vẫn coi là hợp lệ
      if (createRes.status !== 409 && !errBody.toLowerCase().includes('already exists')) {
        this.logger.error(`Không thể khởi tạo bucket Supabase [${bucket}]: ${createRes.status} ${errBody}`);
        throw new InternalServerErrorException(
          `Không thể kết nối hoặc tạo kho lưu trữ mật trên Supabase Storage (HTTP ${createRes.status}).`,
        );
      }
    } else {
      this.logger.log(`✅ Đã tự động khởi tạo Private Bucket [${bucket}] trên Supabase Storage.`);
    }

    this.bucketEnsured = true;
  }

  /**
   * Chuẩn hóa chuỗi tiếng Việt sang slug ASCII an toàn cho đường dẫn S3 / Supabase Storage
   */
  public slugifyStorageSegment(input: string, maxLength = 48): string {
    return (input || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/g, '');
  }

  /**
   * Sinh tên folder doanh nghiệp dễ đọc & duy nhất theo chuẩn: <ten-cong-ty-rut-gon>-<mst>
   * Ví dụ: "Công ty TNHH Bếp Việt" + "0312345678" -> "cong-ty-bep-viet-0312345678"
   */
  public buildCompanyFolderSlug(
    companyName?: string,
    taxCode?: string,
    fallbackOrgId?: string,
  ): string {
    const cleanedName = (companyName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(
        /\b(tnhh|mtv|mot\s+thanh\s+vien|hai\s+thanh\s+vien\s+tro\s+len|hai\s+thanh\s+vien|co\s+phan|cp|tm\s+dv|tmdv)\b/g,
        ' ',
      );

    const nameSlug = this.slugifyStorageSegment(cleanedName, 45) || 'doanh-nghiep';
    const cleanTaxCode = (taxCode || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    const suffix = cleanTaxCode || (fallbackOrgId ? fallbackOrgId.slice(0, 8).toLowerCase() : 'celra');

    if (nameSlug.endsWith(`-${suffix}`) || nameSlug === suffix) {
      return nameSlug;
    }
    return `${nameSlug}-${suffix}`;
  }

  public async uploadEncryptedToSupabase(
    organizationId: string,
    plainBuffer: Buffer,
    year?: string | number,
    options?: {
      companyFolder?: string;
      companyName?: string;
      taxCode?: string;
      documentTitle?: string;
    },
  ): Promise<{ storageUri: string; objectKey: string; bucket: string; companyFolder: string }> {
    await this.ensurePrivateBucketExists();
    const { supabaseUrl, secretKey, bucket } = this.getSupabaseConfig();

    const encryptedPayload = this.encryptBuffer(plainBuffer, organizationId);
    const companyFolder =
      options?.companyFolder?.trim() ||
      this.buildCompanyFolderSlug(options?.companyName, options?.taxCode, organizationId);
    const yearFolder = year ? String(year).replace(/[^0-9]/g, '') || 'general' : 'general';
    const docSlug = options?.documentTitle ? this.slugifyStorageSegment(options.documentTitle, 36) : '';
    const randomId = crypto.randomBytes(6).toString('hex');
    const fileLabel = docSlug ? `${docSlug}_${randomId}` : randomId;
    const objectKey = `${companyFolder}/${yearFolder}/${fileLabel}.celra.enc`;

    const encodedPath = objectKey.split('/').map(encodeURIComponent).join('/');
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST',
      headers: {
        ...this.buildSupabaseAuthHeaders(secretKey),
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: new Uint8Array(encryptedPayload),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      this.logger.error(`Lỗi tải chứng từ mã hóa lên Supabase Storage: ${uploadRes.status} ${errText}`);
      throw new InternalServerErrorException(
        `Không thể lưu trữ chứng từ lên đám mây Supabase (HTTP ${uploadRes.status}).`,
      );
    }

    return {
      storageUri: `supabase://${bucket}/${objectKey}`,
      objectKey,
      bucket,
      companyFolder,
    };
  }

  public async retrieveAndVerifyPlainBuffer(
    filePathOrUri: string,
    organizationId: string,
    expectedSha256?: string,
  ): Promise<Buffer> {
    let rawPayload: Buffer;

    if (filePathOrUri.startsWith('supabase://')) {
      const withoutScheme = filePathOrUri.slice('supabase://'.length);
      const firstSlash = withoutScheme.indexOf('/');
      if (firstSlash <= 0) {
        throw new NotFoundException('Đường dẫn định danh chứng từ đám mây không hợp lệ.');
      }
      const bucket = withoutScheme.slice(0, firstSlash);
      const objectKey = withoutScheme.slice(firstSlash + 1);

      if (!objectKey || objectKey.includes('..') || objectKey.startsWith('/')) {
        throw new ForbiddenException('Đường dẫn lưu trữ đám mây không hợp lệ.');
      }

      const { supabaseUrl, secretKey } = this.getSupabaseConfig();
      const encodedPath = objectKey.split('/').map(encodeURIComponent).join('/');
      const downloadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
        {
          method: 'GET',
          headers: this.buildSupabaseAuthHeaders(secretKey),
        },
      );

      if (downloadRes.status === 404 || downloadRes.status === 400) {
        throw new NotFoundException('Không tìm thấy tệp chứng từ trên kho lưu trữ đám mây Supabase.');
      }
      if (!downloadRes.ok) {
        const errText = await downloadRes.text().catch(() => '');
        this.logger.error(`Lỗi tải chứng từ từ Supabase Storage: ${downloadRes.status} ${errText}`);
        throw new InternalServerErrorException('Không thể tải tệp chứng từ từ kho đám mây Supabase.');
      }

      const arrayBuf = await downloadRes.arrayBuffer();
      rawPayload = Buffer.from(arrayBuf);
    } else {
      // Tương thích ngược an toàn (kèm khóa cứng chống Path Traversal) cho các tệp cũ lưu cục bộ trước đây
      const allowedRoot = resolve(process.cwd(), 'uploads', 'evidence');
      const candidatePrimary = resolve(process.cwd(), filePathOrUri);
      const candidateFallback = resolve(allowedRoot, basename(filePathOrUri));

      let safeLocalPath: string | null = null;
      if (
        (candidatePrimary === allowedRoot || candidatePrimary.startsWith(allowedRoot + sep)) &&
        existsSync(candidatePrimary)
      ) {
        safeLocalPath = candidatePrimary;
      } else if (
        candidateFallback.startsWith(allowedRoot + sep) &&
        existsSync(candidateFallback)
      ) {
        safeLocalPath = candidateFallback;
      }

      if (!safeLocalPath) {
        throw new NotFoundException('Tệp chứng từ vật lý không tồn tại hoặc đường dẫn không hợp lệ.');
      }
      rawPayload = readFileSync(safeLocalPath);
    }

    const plainBuffer = this.decryptBuffer(rawPayload, organizationId);

    if (expectedSha256) {
      const actualSha256 = crypto.createHash('sha256').update(plainBuffer).digest('hex');
      if (actualSha256 !== expectedSha256) {
        throw new ForbiddenException(
          'Cảnh báo an ninh: Mã băm SHA-256 của tệp chứng từ không khớp với bản gốc đã lưu! Tệp có dấu hiệu bị đánh tráo hoặc hư hỏng.',
        );
      }
    }

    return plainBuffer;
  }
}
