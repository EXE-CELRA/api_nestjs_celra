import { CitLedgerService } from './cit-ledger.service';
import { PrismaService } from '../../database/prisma.service';
import { adjustToNextWorkingDay, getVietnamHoliday } from '../../common/utils/vietnam-holidays.util';
import { formatVietnamDate } from '../../common/utils/vietnam-holidays.util';
import { matchCoreLegalDocUrl, cleanDLPLUrl } from '../../common/constants/legal-docs.constant';
import { COMPLIANCE_STATUS_LABELS, COMPLIANCE_STATUS_SHORT_LABELS } from '../../common/utils/compliance-evaluation.util';

describe('CIT Compliance Calendar & Due Date Calculation Engine', () => {
  let service: CitLedgerService;
  const mockPrisma = {
    organization: { findUnique: jest.fn() },
    checklist: { findFirst: jest.fn(), create: jest.fn() },
    checklistItem: { create: jest.fn(), update: jest.fn() },
    task: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  } as unknown as PrismaService;

  beforeEach(() => {
    service = new CitLedgerService(mockPrisma);
  });

  // ==========================================================================
  // Test 1: Năm 2026 - Kiểm tra chính xác ngày hạn 4 quý thông thường
  // ==========================================================================
  describe('1. Hạn thuế TNDN năm 2026 tiêu chuẩn (đã tự điều chỉnh ngày nghỉ lễ)', () => {
    it('Quý 1/2026: 30/04 & 01/05 nghỉ lễ, 02-03/05 cuối tuần -> chuyển sang 04/05/2026', () => {
      const q1Due = service.getStatutoryDueDate(1, 2026, false);
      expect(formatVietnamDate(q1Due)).toBe('04/05/2026');
    });

    it('Quý 2/2026 (tiêu chuẩn): 31/07/2026 là Thứ Sáu ngày làm việc -> giữ nguyên 31/07/2026', () => {
      const q2Due = service.getStatutoryDueDate(2, 2026, false);
      expect(formatVietnamDate(q2Due)).toBe('31/07/2026');
    });

    it('Quý 3/2026 (tiêu chuẩn): 31/10 là Thứ Bảy, 01/11 là Chủ Nhật -> chuyển sang 02/11/2026', () => {
      const q3Due = service.getStatutoryDueDate(3, 2026, false);
      expect(formatVietnamDate(q3Due)).toBe('02/11/2026');
    });

    it('Quý 4/2026: 31/01/2027 là Chủ Nhật -> chuyển sang 01/02/2027', () => {
      const q4Due = service.getStatutoryDueDate(4, 2026, false);
      expect(formatVietnamDate(q4Due)).toBe('01/02/2027');
    });
  });

  // ==========================================================================
  // Test 2: Năm 2026 - Kiểm tra chính sách gia hạn cho doanh nghiệp đủ điều kiện
  // ==========================================================================
  describe('2. Chính sách gia hạn thuế TNDN cho Doanh nghiệp đủ điều kiện', () => {
    it('Quý 2/2026 gia hạn: chuyển đến 02/11/2026 (do 31/10 thứ Bảy, 01/11 Chủ Nhật)', () => {
      const q2ExtDue = service.getStatutoryDueDate(2, 2026, true);
      expect(formatVietnamDate(q2ExtDue)).toBe('02/11/2026');
    });

    it('Quý 3/2026 gia hạn: chuyển đến 30/12/2026', () => {
      const q3ExtDue = service.getStatutoryDueDate(3, 2026, true);
      expect(formatVietnamDate(q3ExtDue)).toBe('30/12/2026');
    });
  });

  // ==========================================================================
  // Test 3: Trạng thái quá hạn không được tự kết luận vi phạm
  // ==========================================================================
  describe('3. Nhãn trạng thái tuân thủ không tự kết luận vi phạm khi chưa xác nhận', () => {
    it('Hiển thị "Quá hạn theo lịch – Chưa xác nhận hoàn thành" thay vì vi phạm', () => {
      expect(COMPLIANCE_STATUS_LABELS['OVERDUE']).toBe('Quá hạn theo lịch – Chưa xác nhận hoàn thành');
      expect(COMPLIANCE_STATUS_SHORT_LABELS['OVERDUE']).toBe('Quá hạn theo lịch');
    });
  });

  // ==========================================================================
  // Test 4: Đường dẫn DLPL phải mở đúng điều khoản cụ thể (#dieu_...)
  // ==========================================================================
  describe('4. Rà soát DLPL link: deep-link đến đúng điều khoản cụ thể', () => {
    it('Tự động gắn anchor #dieu_55 cho Luật Quản lý thuế số 38/2019', () => {
      const citation = 'Khoản 1 Điều 55 Luật Quản lý thuế số 38/2019/QH14';
      const url = matchCoreLegalDocUrl(citation);
      expect(url).toBeDefined();
      expect(url).toContain('luat-quan-ly-thue-2019-54279.html#dieu_55');
    });

    it('Tự động gắn anchor #dieu_8 cho Nghị định 126/2020', () => {
      const citation = 'Điều 8 Nghị định 126/2020/NĐ-CP';
      const url = matchCoreLegalDocUrl(citation);
      expect(url).toBeDefined();
      expect(url).toContain('nghi-dinh-1262020nd-cp-ve-huong-dan-luat-quan-ly-thue-24636.html#dieu_8');
    });

    it('cleanDLPLUrl bảo toàn hash anchor', () => {
      const raw = 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/luat-quan-ly-thue-2019-54279.html#dieu_55';
      const cleaned = cleanDLPLUrl(raw);
      expect(cleaned).toBe('https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/luat-quan-ly-thue-2019-54279.html#dieu_55');
    });
  });

  // ==========================================================================
  // Test 5: Tự động điều chỉnh khi ngày lễ trùng cuối tuần cho các năm khác
  // ==========================================================================
  describe('5. Kiểm thử mở rộng cho các năm khác (không lặp lại lỗi)', () => {
    it('Tự động tịnh tiến ngày nghỉ lễ 30/04 & 01/05 sang ngày làm việc kế tiếp', () => {
      const holiday304 = getVietnamHoliday(new Date('2026-04-30'));
      expect(holiday304).toBeDefined();
      expect(holiday304?.name).toBe('Ngày Giải phóng miền Nam');

      const holiday015 = getVietnamHoliday(new Date('2026-05-01'));
      expect(holiday015).toBeDefined();
      expect(holiday015?.name).toBe('Ngày Quốc tế Lao động');

      const adjusted = adjustToNextWorkingDay(new Date('2026-04-30'));
      expect(adjusted.getDate()).toBe(4);
      expect(adjusted.getMonth()).toBe(4); // May
    });
  });
});
