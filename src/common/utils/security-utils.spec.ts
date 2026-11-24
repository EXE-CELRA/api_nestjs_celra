import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import {
  validateFileMagicBytes,
  getSafeExtensionForUpload,
} from './file-magic-bytes.util';
import {
  assertSafeExternalUrl,
  isPrivateOrReservedIp,
  ALLOWED_AI_API_HOSTS,
  ALLOWED_DLPL_API_HOSTS,
} from './safe-url.util';
import { deterministicUuidFromKey } from './deterministic-uuid.util';

describe('Security Utilities (Magic Bytes, SSRF Guard, Deterministic UUID)', () => {
  const tmpFiles: string[] = [];

  const createTempFile = (name: string, content: Buffer): string => {
    const filePath = path.join(os.tmpdir(), `celra-test-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
    fs.writeFileSync(filePath, content);
    tmpFiles.push(filePath);
    return filePath;
  };

  afterEach(() => {
    while (tmpFiles.length > 0) {
      const f = tmpFiles.pop();
      if (f && fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore
        }
      }
    }
  });

  describe('file-magic-bytes.util', () => {
    it('chấp nhận chữ ký nhị phân hợp lệ cho PDF, PNG, JPEG, WEBP, DOC/XLS và DOCX/XLSX (OOXML)', () => {
      const pdfFile = createTempFile('valid.pdf', Buffer.from('%PDF-1.4\n1 0 obj\n'));
      expect(() => validateFileMagicBytes(pdfFile, '.pdf')).not.toThrow();

      const pngFile = createTempFile(
        'valid.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      );
      expect(() => validateFileMagicBytes(pngFile, '.png')).not.toThrow();

      const jpgFile = createTempFile('valid.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
      expect(() => validateFileMagicBytes(jpgFile, '.jpg')).not.toThrow();

      const webpFile = createTempFile(
        'valid.webp',
        Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBP'), Buffer.from('VP8 ')]),
      );
      expect(() => validateFileMagicBytes(webpFile, '.webp')).not.toThrow();

      const docFile = createTempFile(
        'valid.doc',
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]),
      );
      expect(() => validateFileMagicBytes(docFile, '.doc')).not.toThrow();

      const docxFile = createTempFile(
        'valid.docx',
        Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('...[Content_Types].xml...')]),
      );
      expect(() => validateFileMagicBytes(docxFile, '.docx')).not.toThrow();
    });

    it('chặn tệp giả mạo đuôi (.exe đổi thành .pdf, .zip thường đổi thành .docx, .svg, tệp rỗng)', () => {
      const fakePdf = createTempFile('evil.pdf', Buffer.from('MZ\x90\x00\x03\x00\x00\x00'));
      expect(() => validateFileMagicBytes(fakePdf, '.pdf')).toThrow(BadRequestException);

      const plainZipAsDocx = createTempFile(
        'plain.docx',
        Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('META-INF/MANIFEST.MF')]),
      );
      expect(() => validateFileMagicBytes(plainZipAsDocx, '.docx')).toThrow(BadRequestException);

      const pngAsPdf = createTempFile(
        'mismatch.pdf',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(() => validateFileMagicBytes(pngAsPdf, '.pdf')).toThrow(BadRequestException);

      const emptyFile = createTempFile('empty.pdf', Buffer.alloc(0));
      expect(() => validateFileMagicBytes(emptyFile, '.pdf')).toThrow(BadRequestException);

      expect(getSafeExtensionForUpload('image/svg+xml', 'xss.svg')).toBeNull();
      expect(getSafeExtensionForUpload('text/html', 'shell.html')).toBeNull();
      expect(getSafeExtensionForUpload('application/pdf', 'evil.exe')).toBeNull();
      expect(getSafeExtensionForUpload('image/webp', 'invoice.webp')).toBe('.webp');
    });
  });

  describe('safe-url.util (SSRF Protection)', () => {
    it('chặn HTTP, cloud metadata, loopback, IP trực tiếp, credentials và host ngoài allowlist', async () => {
      await expect(
        assertSafeExternalUrl('http://169.254.169.254/latest/meta-data', ALLOWED_AI_API_HOSTS),
      ).rejects.toThrow(BadRequestException);

      await expect(
        assertSafeExternalUrl('http://127.0.0.1:3000/api/v1', ALLOWED_AI_API_HOSTS),
      ).rejects.toThrow(BadRequestException);

      await expect(
        assertSafeExternalUrl('https://127.0.0.1/v1', ALLOWED_AI_API_HOSTS),
      ).rejects.toThrow(BadRequestException);

      await expect(
        assertSafeExternalUrl('https://evil.attacker.com/v1', ALLOWED_AI_API_HOSTS),
      ).rejects.toThrow(BadRequestException);

      await expect(
        assertSafeExternalUrl('https://user:pass@api.openai.com/v1', ALLOWED_AI_API_HOSTS),
      ).rejects.toThrow(BadRequestException);

      await expect(
        assertSafeExternalUrl('https://api.dulieuphapluat.vn:8443/v1', ALLOWED_DLPL_API_HOSTS),
      ).rejects.toThrow(BadRequestException);
    });

    it('nhận diện chính xác dải IP nội bộ / loopback / metadata cho cả IPv4 và IPv6', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.1.10')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    });
  });

  describe('deterministic-uuid.util', () => {
    it('sinh UUID v5 xác định, ổn định và không trùng giữa các khóa khác nhau', () => {
      const id1 = deterministicUuidFromKey('sepay:987654');
      const id2 = deterministicUuidFromKey('sepay:987654');
      const id3 = deterministicUuidFromKey('sepay:987655');

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });
});
