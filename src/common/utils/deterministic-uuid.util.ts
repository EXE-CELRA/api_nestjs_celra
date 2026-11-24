import * as crypto from 'crypto';

/**
 * Sinh UUID v5 xác định (deterministic) từ khóa nghiệp vụ (vd: "sepay:123456" hoặc "sbx_success:SBX-...")
 * Dùng làm Primary Key id cho WalletTransaction để đảm bảo tính bất biến/idempotency nguyên tử ở PostgreSQL (P2002)
 * mà không cần thay đổi schema cơ sở dữ liệu hiện tại.
 */
export function deterministicUuidFromKey(namespaceKey: string): string {
  const hash = crypto.createHash('sha256').update(namespaceKey).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // RFC 4122 version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant 1
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
