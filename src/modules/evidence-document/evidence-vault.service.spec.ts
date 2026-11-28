import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvidenceVaultService } from './evidence-vault.service';

describe('Layer 3 EvidenceVaultService (Magic Bytes + AES-256-GCM + SHA-256)', () => {
  const createVault = () => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'EVIDENCE_ENCRYPTION_KEY') return 'unit-test-super-secret-vault-key-2026';
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SECRET_KEY') return 'sb_secret_test_key';
        if (key === 'SUPABASE_STORAGE_BUCKET') return 'celra-evidence';
        return undefined;
      }),
    } as unknown as ConfigService;
    return new EvidenceVaultService(mockConfig);
  };

  it('cho phép tệp PDF hợp lệ và tính chính xác mã băm SHA-256', () => {
    const vault = createVault();
    const pdfBuf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'utf8');
    const result = vault.validateAndHashFile({
      originalname: 'Hoa_don_GTGT_Q4.pdf',
      buffer: pdfBuf,
      size: pdfBuf.length,
    } as Express.Multer.File);

    expect(result.extension).toBe('.pdf');
    expect(result.normalizedMimeType).toBe('application/pdf');
    expect(result.sha256Checksum).toHaveLength(64);
  });

  it('cho phép hóa đơn điện tử gốc định dạng .xml sạch', () => {
    const vault = createVault();
    const xmlBuf = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><HDon><DLHDon><NDHDon/></DLHDon></HDon>', 'utf8');
    const result = vault.validateAndHashFile({
      originalname: 'hoadon_goc_nd70.xml',
      buffer: xmlBuf,
      size: xmlBuf.length,
    } as Express.Multer.File);

    expect(result.extension).toBe('.xml');
    expect(result.normalizedMimeType).toBe('application/xml');
  });

  it('chặn đứng tệp mã độc .exe đổi tên giả mạo thành .pdf (Magic Bytes mismatch)', () => {
    const vault = createVault();
    // 0x4D 0x5A = 'MZ' (Windows PE Executable)
    const fakePdfBuf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    expect(() =>
      vault.validateAndHashFile({
        originalname: 'Uy_nhiem_chi.pdf',
        buffer: fakePdfBuf,
        size: fakePdfBuf.length,
      } as Express.Multer.File),
    ).toThrow(BadRequestException);
  });

  it('chặn đứng tệp .xml chứa thực thể XXE hoặc thẻ <script>', () => {
    const vault = createVault();
    const maliciousXml = Buffer.from('<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><HDon/>');

    expect(() =>
      vault.validateAndHashFile({
        originalname: 'exploit.xml',
        buffer: maliciousXml,
        size: maliciousXml.length,
      } as Express.Multer.File),
    ).toThrow(BadRequestException);
  });

  it('mã hóa AES-256-GCM ẩn hoàn toàn nội dung và chặn giải mã chéo giữa 2 doanh nghiệp (AAD binding)', () => {
    const vault = createVault();
    const secretInvoice = Buffer.from('%PDF-1.7 Doanh thu noi bo Quy 4: 5.200.000.000 VND', 'utf8');

    const encrypted = vault.encryptBuffer(secretInvoice, 'org-alpha');

    // Bản mã không được chứa chuỗi gốc rõ ràng và phải mang header CELRAENC01
    expect(encrypted.subarray(0, 10).toString('ascii')).toBe('CELRAENC01');
    expect(encrypted.toString('utf8')).not.toContain('5.200.000.000');

    // Giải mã đúng doanh nghiệp trả về chính xác từng byte
    const decrypted = vault.decryptBuffer(encrypted, 'org-alpha');
    expect(decrypted.equals(secretInvoice)).toBe(true);

    // Doanh nghiệp khác (org-beta) cố giải mã cùng gói tin -> bị từ chối bởi AAD của AES-256-GCM
    expect(() => vault.decryptBuffer(encrypted, 'org-beta')).toThrow(ForbiddenException);

    // Sửa đổi trái phép 1 byte trong bản mã -> bị từ chối bởi AuthTag của AES-256-GCM
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => vault.decryptBuffer(tampered, 'org-alpha')).toThrow(ForbiddenException);
  });

  it('sinh tên folder chuẩn <ten-cong-ty-rut-gon>-<mst> gọn đẹp, không dấu và chống trùng tuyệt đối', () => {
    const vault = createVault();

    expect(vault.buildCompanyFolderSlug('Công ty TNHH Bếp Việt', '0312345678')).toBe(
      'cong-ty-bep-viet-0312345678',
    );
    expect(vault.buildCompanyFolderSlug('Công ty Cổ phần Một Thành Viên Ánh Dương', '0109876543')).toBe(
      'cong-ty-anh-duong-0109876543',
    );
  });
});
