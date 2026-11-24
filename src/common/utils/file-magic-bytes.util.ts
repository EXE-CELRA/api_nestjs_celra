import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';

export const ALLOWED_EVIDENCE_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

export const ALLOWED_EVIDENCE_EXTENSIONS = new Set<string>([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.doc',
  '.xls',
  '.docx',
  '.xlsx',
]);

export function getSafeExtensionForUpload(mimetype: string, originalname: string): string | null {
  const normalizedMime = (mimetype || '').toLowerCase().trim();
  const allowedExts = ALLOWED_EVIDENCE_MIME_TYPES[normalizedMime];
  if (!allowedExts) {
    return null;
  }

  const lowerName = (originalname || '').toLowerCase().trim();
  const lastDot = lowerName.lastIndexOf('.');
  const rawExt = lastDot >= 0 ? lowerName.slice(lastDot) : '';

  if (rawExt && allowedExts.includes(rawExt)) {
    return rawExt;
  }

  // Trường hợp trình duyệt/client gửi đuôi không khớp MIME whitelist -> từ chối
  return null;
}

function readHeaderAndTail(filePath: string): { header: Buffer; tail: Buffer; size: number } {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  if (size <= 0) {
    return { header: Buffer.alloc(0), tail: Buffer.alloc(0), size: 0 };
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const headerLen = Math.min(size, 65536);
    const header = Buffer.alloc(headerLen);
    fs.readSync(fd, header, 0, headerLen, 0);

    let tail = header;
    if (size > headerLen) {
      const tailLen = Math.min(size, 65536);
      tail = Buffer.alloc(tailLen);
      fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    }

    return { header, tail, size };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Xác thực chữ ký nhị phân (Magic Bytes) khớp tuyệt đối với đuôi tệp đã khai báo.
 * Ngăn chặn đổi tên tệp thực thi (.exe, .sh, .svg, .html, .zip/.apk/.jar) thành .pdf/.png/.docx.
 */
export function validateFileMagicBytes(filePath: string, extension: string): void {
  const ext = (extension || '').toLowerCase();
  if (!ALLOWED_EVIDENCE_EXTENSIONS.has(ext)) {
    throw new BadRequestException('Định dạng tệp tải lên không được hỗ trợ.');
  }

  const { header, tail, size } = readHeaderAndTail(filePath);
  if (size < 4) {
    throw new BadRequestException('Tệp tải lên rỗng hoặc bị hỏng định dạng.');
  }

  if (ext === '.pdf') {
    const isPdf = header.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46])); // %PDF
    if (!isPdf) {
      throw new BadRequestException('Nội dung tệp không khớp định dạng PDF hợp lệ.');
    }
    return;
  }

  if (ext === '.png') {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (header.length < 8 || !header.subarray(0, 8).equals(pngSig)) {
      throw new BadRequestException('Nội dung tệp không khớp định dạng ảnh PNG hợp lệ.');
    }
    return;
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (!isJpeg) {
      throw new BadRequestException('Nội dung tệp không khớp định dạng ảnh JPEG hợp lệ.');
    }
    return;
  }

  if (ext === '.webp') {
    const isRiff = header.length >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF';
    const isWebp = header.length >= 12 && header.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isRiff || !isWebp) {
      throw new BadRequestException('Nội dung tệp không khớp định dạng ảnh WEBP hợp lệ.');
    }
    return;
  }

  if (ext === '.doc' || ext === '.xls') {
    const oleSig = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (header.length < 8 || !header.subarray(0, 8).equals(oleSig)) {
      throw new BadRequestException('Nội dung tệp không khớp định dạng tài liệu Office (.doc/.xls) hợp lệ.');
    }
    return;
  }

  if (ext === '.docx' || ext === '.xlsx') {
    const isZip =
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      ((header[2] === 0x03 && header[3] === 0x04) ||
        (header[2] === 0x05 && header[3] === 0x06) ||
        (header[2] === 0x07 && header[3] === 0x08));

    const marker = Buffer.from('[Content_Types].xml', 'utf8');
    const hasOoxmlMarker = header.includes(marker) || tail.includes(marker);

    if (!isZip || !hasOoxmlMarker) {
      throw new BadRequestException(
        'Nội dung tệp không khớp định dạng Office OpenXML (.docx/.xlsx) hợp lệ.',
      );
    }
    return;
  }

  throw new BadRequestException('Định dạng tệp tải lên không hợp lệ.');
}
