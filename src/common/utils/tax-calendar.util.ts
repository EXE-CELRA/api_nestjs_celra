/**
 * CELRA Statutory Tax, Labor & Corporate Compliance Calendar Utility (NestJS Backend)
 * Căn cứ pháp lý:
 * - Luật Quản lý thuế số 38/2019/QH14 (Điều 36, Điều 44)
 * - Nghị định 126/2020/NĐ-CP (Điều 8, Điều 9, Điều 18)
 * - Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1 - Tạm nộp 80% TNDN 4 quý)
 * - Bộ luật Lao động 2019 (Điều 119) & Nghị định 145/2020/NĐ-CP (Khoản 2 Điều 4)
 * - Luật Doanh nghiệp 2020 (Điều 30, Điều 47, Điều 75, Điều 113)
 * - Nghị định 01/2021/NĐ-CP (Điều 66 - Tạm ngừng kinh doanh trước 03 ngày làm việc)
 * - Nghị định 123/2020/NĐ-CP (Điều 19 - Giải trình HĐĐT sai sót Mẫu 04/SS-HĐĐT)
 */

import { StatutoryCycleType } from '@prisma/client';
export { StatutoryCycleType };

// Múi giờ chuẩn Việt Nam (UTC+7)
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Cộng thêm số ngày làm việc (bỏ qua thứ 7 và Chủ nhật)
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let added = 0;
  const direction = businessDays >= 0 ? 1 : -1;
  const absDays = Math.abs(businessDays);

  while (added < absDays) {
    result.setDate(result.getDate() + direction);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

/**
 * Lấy Period Key chuẩn hóa dùng cho Unique Constraint và chống trùng Task
 * Ví dụ:
 * - MONTHLY -> "2026-10"
 * - QUARTERLY -> "2026-Q4"
 * - BIANNUAL_6M -> "2026-H2"
 * - ANNUAL -> "2026"
 * - EVENT_* -> "EVENT-2026-10-21" hoặc ID sự kiện
 */
export function getPeriodKey(
  cycle: StatutoryCycleType,
  refDate: Date = new Date(),
  eventIdentifier?: string,
): string {
  const d = new Date(refDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1 - 12

  switch (cycle) {
    case 'MONTHLY':
      return `${year}-${String(month).padStart(2, '0')}`;
    case 'QUARTERLY': {
      const q = Math.ceil(month / 3);
      return `${year}-Q${q}`;
    }
    case 'BIANNUAL_6M': {
      const h = month <= 6 ? 'H1' : 'H2';
      return `${year}-${h}`;
    }
    case 'ANNUAL':
      return `${year}`;
    default: {
      if (eventIdentifier) {
        return `EVENT-${eventIdentifier}`;
      }
      const day = String(d.getDate()).padStart(2, '0');
      const m = String(month).padStart(2, '0');
      return `EVENT-${year}${m}${day}`;
    }
  }
}

export interface CalculatedDeadlineResult {
  dueDate: Date | null;
  requiresEventDate: boolean;
  missingDataReason?: string;
  calculationBasis: string;
  periodKey: string;
}

/**
 * Tính toán hạn chót pháp lý chuyên biệt theo từng Nghĩa vụ (Rule Code) & Chu kỳ
 * Tuân thủ đúng:
 * - Hạn thuế môn bài: 30/01
 * - Hạn TNDN tạm nộp: 30/04, 31/07, 30/10, 31/01
 * - Hạn thuế GTGT/TNCN tháng: ngày 20 tháng sau; quý: ngày cuối tháng đầu quý sau
 * - Hạn báo cáo lao động 6 tháng: 05/06 và 05/12
 * - Tạm ngừng kinh doanh: TRƯỚC 03 ngày làm việc kể từ ngày dự kiến tạm ngừng
 * - Đổi ĐKKD: trong 10 ngày làm việc kể từ ngày thay đổi
 * - Góp vốn 90 ngày: 90 ngày kể từ ngày cấp GCN ĐKDN
 * - Giảm vốn: 30 ngày tiếp theo sau 90 ngày
 */
export function calculateComplianceDeadline(
  ruleCode: string,
  cycle: StatutoryCycleType,
  eventDate?: Date | null,
  refDate: Date = new Date(),
): CalculatedDeadlineResult {
  const d = new Date(refDate);
  const currentYear = d.getFullYear();
  const currentMonth = d.getMonth(); // 0 - 11

  // 1. Kiểm tra các nghĩa vụ sự kiện bắt buộc có ngày phát sinh (eventDate)
  const isEventCycle = cycle.startsWith('EVENT_');
  if (isEventCycle && !eventDate) {
    return {
      dueDate: null,
      requiresEventDate: true,
      missingDataReason: 'Chờ bổ sung ngày phát sinh sự kiện thực tế để tính thời hạn pháp lý chính xác.',
      calculationBasis: 'Hạn chót tính từ ngày phát sinh sự kiện theo quy định của Luật chuyên ngành.',
      periodKey: getPeriodKey(cycle, d, 'PENDING_EVENT_DATE'),
    };
  }

  const baseDate = eventDate ? new Date(eventDate) : d;

  // 2. Tính hạn chót cụ thể theo loại chu kỳ và quy tắc
  switch (cycle) {
    case 'MONTHLY': {
      // Hạn ngày 20 của tháng kế tiếp
      const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const nextMonth = (currentMonth + 1) % 12;
      const dueDate = new Date(nextMonthYear, nextMonth, 20, 23, 59, 59);
      return {
        dueDate,
        requiresEventDate: false,
        calculationBasis: 'Khoản 1 Điều 44 Luật QLT số 38/2019/QH14: Chậm nhất ngày 20 của tháng tiếp theo kỳ phát sinh nghĩa vụ.',
        periodKey: getPeriodKey(cycle, d),
      };
    }

    case 'QUARTERLY': {
      // Các mốc quý: 30/04 (Q1), 31/07 (Q2), 31/10 (Q3), 31/01 năm sau (Q4)
      const quarterDeadlines = [
        new Date(currentYear, 3, 30, 23, 59, 59), // 30/04
        new Date(currentYear, 6, 31, 23, 59, 59), // 31/07
        new Date(currentYear, 9, 31, 23, 59, 59), // 31/10
        new Date(currentYear + 1, 0, 31, 23, 59, 59), // 31/01 năm sau
      ];

      // Nếu là TNDN tạm nộp 80% (RULE-TAX-TNDN-80): mốc Q3 là 30/10 theo NĐ 91/2022
      if (ruleCode.includes('TNDN')) {
        quarterDeadlines[2] = new Date(currentYear, 9, 30, 23, 59, 59); // 30/10
      }

      let chosen = quarterDeadlines[0];
      for (const deadline of quarterDeadlines) {
        if (deadline.getTime() >= d.getTime()) {
          chosen = deadline;
          break;
        }
      }

      return {
        dueDate: chosen,
        requiresEventDate: false,
        calculationBasis: 'Khoản 1 Điều 44 Luật QLT & NĐ 91/2022/NĐ-CP: Chậm nhất ngày cuối cùng của tháng đầu quý tiếp theo.',
        periodKey: getPeriodKey(cycle, d),
      };
    }

    case 'BIANNUAL_6M': {
      // 05/06 cho 6 tháng đầu năm, 05/12 cho cả năm
      const junDeadline = new Date(currentYear, 5, 5, 23, 59, 59);
      const decDeadline = new Date(currentYear, 11, 5, 23, 59, 59);

      let chosen = junDeadline;
      if (d.getTime() <= junDeadline.getTime()) {
        chosen = junDeadline;
      } else if (d.getTime() <= decDeadline.getTime()) {
        chosen = decDeadline;
      } else {
        chosen = new Date(currentYear + 1, 5, 5, 23, 59, 59);
      }

      return {
        dueDate: chosen,
        requiresEventDate: false,
        calculationBasis: 'Khoản 2 Điều 4 Nghị định 145/2020/NĐ-CP: Báo cáo định kỳ 6 tháng trước ngày 05/06 và cả năm trước ngày 05/12.',
        periodKey: getPeriodKey(cycle, d),
      };
    }

    case 'ANNUAL': {
      // Nếu là lệ phí môn bài: 30/01
      // Nếu là quyết toán BCTC: 31/03
      let dueDate: Date;
      let basis = '';
      if (ruleCode.includes('MB') || ruleCode.includes('MON_BAI')) {
        dueDate = new Date(currentYear, 0, 30, 23, 59, 59);
        if (d.getTime() > dueDate.getTime()) {
          dueDate = new Date(currentYear + 1, 0, 30, 23, 59, 59);
        }
        basis = 'Khoản 9 Điều 18 Nghị định 126/2020/NĐ-CP: Hạn nộp lệ phí môn bài chậm nhất ngày 30/01 hàng năm.';
      } else {
        dueDate = new Date(currentYear, 2, 31, 23, 59, 59);
        if (d.getTime() > dueDate.getTime()) {
          dueDate = new Date(currentYear + 1, 2, 31, 23, 59, 59);
        }
        basis = 'Điểm a Khoản 2 Điều 44 Luật QLT số 38/2019/QH14: Chậm nhất ngày cuối cùng của tháng thứ 3 kể từ ngày kết thúc năm dương lịch.';
      }

      return {
        dueDate,
        requiresEventDate: false,
        calculationBasis: basis,
        periodKey: getPeriodKey(cycle, d),
      };
    }

    case 'EVENT_3D': {
      // Nếu là Tạm ngừng kinh doanh (RULE-CORP-SUSPEND-3D): TRƯỚC ngày tạm ngừng 03 ngày làm việc
      if (ruleCode.includes('SUSPEND')) {
        const dueDate = addBusinessDays(baseDate, -3);
        dueDate.setHours(23, 59, 59, 999);
        return {
          dueDate,
          requiresEventDate: false,
          calculationBasis: 'Khoản 1 Điều 66 Nghị định 01/2021/NĐ-CP: Gửi thông báo bằng văn bản chậm nhất 03 ngày làm việc TRƯỚC ngày tạm ngừng kinh doanh.',
          periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
        };
      }
      // Khác: trong vòng 3 ngày làm việc sau ngày phát sinh
      const dueDate = addBusinessDays(baseDate, 3);
      dueDate.setHours(23, 59, 59, 999);
      return {
        dueDate,
        requiresEventDate: false,
        calculationBasis: 'Trong thời hạn 03 ngày làm việc kể từ ngày phát sinh sự kiện theo quy định.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    case 'EVENT_10D_BIZ': {
      // 10 ngày làm việc kể từ ngày phát sinh thay đổi
      const dueDate = addBusinessDays(baseDate, 10);
      dueDate.setHours(23, 59, 59, 999);
      return {
        dueDate,
        requiresEventDate: false,
        calculationBasis: 'Điều 30 Luật Doanh nghiệp 2020: Đăng ký thay đổi nội dung ĐKKD trong thời hạn 10 ngày làm việc kể từ ngày có thay đổi.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    case 'EVENT_10D': {
      // 10 ngày lịch kể từ ngày phát sinh
      const res = new Date(baseDate);
      res.setDate(res.getDate() + 10);
      res.setHours(23, 59, 59, 999);
      return {
        dueDate: res,
        requiresEventDate: false,
        calculationBasis: 'Khoản 3 Điều 44 Luật QLT số 38/2019/QH14: Chậm nhất ngày thứ 10 kể từ ngày phát sinh nghĩa vụ nộp thuế.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    case 'EVENT_20D': {
      const res = new Date(baseDate);
      res.setDate(res.getDate() + 20);
      res.setHours(23, 59, 59, 999);
      return {
        dueDate: res,
        requiresEventDate: false,
        calculationBasis: 'Điều 9 Nghị định 126/2020/NĐ-CP: Thông báo chuyển đổi kỳ khai thuế trong thời hạn 20 ngày.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    case 'EVENT_30D_CAPITAL': {
      const res = new Date(baseDate);
      res.setDate(res.getDate() + 30);
      res.setHours(23, 59, 59, 999);
      return {
        dueDate: res,
        requiresEventDate: false,
        calculationBasis: 'Khoản 3 Điều 47 Luật Doanh nghiệp 2020: Đăng ký điều chỉnh vốn điều lệ trong thời hạn 30 ngày kể từ ngày kết thúc thời hạn 90 ngày.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    case 'EVENT_45D': {
      const res = new Date(baseDate);
      res.setDate(res.getDate() + 45);
      res.setHours(23, 59, 59, 999);
      return {
        dueDate: res,
        requiresEventDate: false,
        calculationBasis: 'Khoản 4 Điều 44 Luật QLT số 38/2019/QH14: Chậm nhất ngày thứ 45 kể từ ngày có quyết định giải thể, chia tách hoặc chấm dứt hoạt động.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    case 'EVENT_90D': {
      const res = new Date(baseDate);
      res.setDate(res.getDate() + 90);
      res.setHours(23, 59, 59, 999);
      return {
        dueDate: res,
        requiresEventDate: false,
        calculationBasis: 'Khoản 2 Điều 47 & Khoản 2 Điều 75 Luật Doanh nghiệp 2020: Góp đủ vốn điều lệ trong thời hạn 90 ngày kể từ ngày được cấp GCN ĐKDN.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }

    default: {
      const res = new Date(baseDate);
      res.setDate(res.getDate() + 15);
      res.setHours(23, 59, 59, 999);
      return {
        dueDate: res,
        requiresEventDate: false,
        calculationBasis: 'Thời hạn quy định theo lịch tuân thủ tiêu chuẩn.',
        periodKey: getPeriodKey(cycle, baseDate, baseDate.toISOString().slice(0, 10)),
      };
    }
  }
}

/**
 * Hàm tương thích ngược với code cũ
 */
export function calculateLegalDueDate(cycle: StatutoryCycleType, refDate: Date = new Date()): Date {
  const result = calculateComplianceDeadline('DEFAULT', cycle, null, refDate);
  return result.dueDate || new Date(Date.now() + 15 * 86400000);
}
