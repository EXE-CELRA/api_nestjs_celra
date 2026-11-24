import { BadRequestException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';

export const ALLOWED_AI_API_HOSTS = [
  'generativelanguage.googleapis.com',
  'opencode.ai',
  'api.openai.com',
];

export const ALLOWED_DLPL_API_HOSTS = [
  'api.dulieuphapluat.vn',
];

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true; // multicast & reserved
  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(normalized);
  }
  if (ipVersion === 6) {
    if (normalized === '::' || normalized === '::1') {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      const mappedIpv4 = normalized.slice(7);
      if (net.isIP(mappedIpv4) === 4) {
        return isPrivateOrReservedIpv4(mappedIpv4);
      }
      return true;
    }
    // fc00::/7 (Unique Local Address), fe80::/10 (Link-Local), ff00::/8 (Multicast)
    if (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Kiểm tra URL đích chống SSRF:
 * - Bắt buộc HTTPS (không chấp nhận HTTP/file/ftp/credentials).
 * - Hostname phải nằm trong danh sách allowedHosts (không chấp nhận IP trực tiếp).
 * - Phân giải DNS và chặn toàn bộ IP nội bộ / loopback / cloud metadata (169.254.169.254).
 */
export async function assertSafeExternalUrl(
  rawUrl: string,
  allowedHosts: string[],
): Promise<URL> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new BadRequestException('API URL không được để trống');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException('API URL không đúng định dạng hợp lệ');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Chỉ chấp nhận giao thức HTTPS cho kết nối API bên ngoài');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestException('API URL không được chứa thông tin đăng nhập nhúng');
  }

  if (parsed.port && parsed.port !== '443') {
    throw new BadRequestException('Chỉ cho phép kết nối qua cổng HTTPS tiêu chuẩn (443)');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (net.isIP(hostname) !== 0) {
    throw new BadRequestException('Không cho phép kết nối trực tiếp tới địa chỉ IP');
  }

  const normalizedAllowlist = allowedHosts.map((h) => h.toLowerCase());
  if (!normalizedAllowlist.includes(hostname)) {
    throw new BadRequestException(
      `Tên miền '${hostname}' không nằm trong danh sách nhà cung cấp được phép (${normalizedAllowlist.join(', ')})`,
    );
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException(`Không thể phân giải DNS cho tên miền '${hostname}'`);
  }

  if (!records || records.length === 0) {
    throw new BadRequestException(`Không tìm thấy bản ghi DNS hợp lệ cho tên miền '${hostname}'`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new BadRequestException(
        'Tên miền đích phân giải sang dải địa chỉ mạng nội bộ không được phép',
      );
    }
  }

  return parsed;
}
