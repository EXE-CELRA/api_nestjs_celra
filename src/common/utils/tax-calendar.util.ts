/**
 * CELRA Statutory Tax, Labor & Corporate Compliance Calendar Utility (NestJS Backend)
 * Căn cứ pháp lý:
 * - Luật Quản lý thuế số 38/2019/QH14 (Điều 36, Điều 44)
 * - Nghị định 126/2020/NĐ-CP (Điều 8, Điều 9, Điều 18)
 * - Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1 - Tạm nộp 80% TNDN 4 quý)
 * - Bộ luật Lao động 2019 (Điều 112, Điều 119) & Nghị định 145/2020/NĐ-CP
 * - Luật Doanh nghiệp 2020 (Điều 30, Điều 47, Điều 75, Điều 113)
 * - Nghị định 252/2026/NĐ-CP (Khoản 7 Điều 3 - Chuyển ngày nghỉ thuế)
 */

import { StatutoryCycleType } from '@prisma/client';
export { StatutoryCycleType };

// Múi giờ chuẩn Việt Nam (UTC+7)
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

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

export interface StatutoryHolidayItem {
  date: string;
  name: string;
  isCompensatory?: boolean;
  legalBasis: string;
  legalDocUrl?: string;
}

export const STATUTORY_HOLIDAYS_MAP: Record<string, StatutoryHolidayItem> = {
  // ── NĂM 2026 ─────────────────────────────────────────────────────────────
  '2026-01-01': {
    date: '2026-01-01',
    name: 'Tết Dương lịch 2026',
    legalBasis: 'Điểm a Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-02-16': {
    date: '2026-02-16',
    name: 'Tết Âm lịch Bính Ngọ (29 Tháng Chạp)',
    legalBasis: 'Điểm b Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-02-17': {
    date: '2026-02-17',
    name: 'Tết Âm lịch Bính Ngọ (Mùng 1 Tết)',
    legalBasis: 'Điểm b Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-02-18': {
    date: '2026-02-18',
    name: 'Tết Âm lịch Bính Ngọ (Mùng 2 Tết)',
    legalBasis: 'Điểm b Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-02-19': {
    date: '2026-02-19',
    name: 'Tết Âm lịch Bính Ngọ (Mùng 3 Tết)',
    legalBasis: 'Điểm b Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-02-20': {
    date: '2026-02-20',
    name: 'Tết Âm lịch Bính Ngọ (Mùng 4 Tết)',
    legalBasis: 'Điểm b Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-04-26': {
    date: '2026-04-26',
    name: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)',
    legalBasis: 'Điểm e Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-04-27': {
    date: '2026-04-27',
    name: 'Nghỉ bù Giỗ Tổ Hùng Vương (do trùng Chủ Nhật 26/04)',
    isCompensatory: true,
    legalBasis: 'Khoản 3 Điều 111 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-04-30': {
    date: '2026-04-30',
    name: 'Ngày Chiến thắng 30/4',
    legalBasis: 'Điểm c Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-05-01': {
    date: '2026-05-01',
    name: 'Ngày Quốc tế Lao động 1/5',
    legalBasis: 'Điểm d Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-09-01': {
    date: '2026-09-01',
    name: 'Nghỉ kề Quốc khánh 2/9',
    legalBasis: 'Điểm đ Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
  '2026-09-02': {
    date: '2026-09-02',
    name: 'Ngày Quốc khánh 2/9',
    legalBasis: 'Điểm đ Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },

  // ── NĂM 2027 ─────────────────────────────────────────────────────────────
  '2027-01-01': {
    date: '2027-01-01',
    name: 'Tết Dương lịch 2027',
    legalBasis: 'Điểm a Khoản 1 Điều 112 Bộ luật Lao động 2019',
    legalDocUrl: 'https://dulieuphapluat.vn/van-ban/lao-dong-van-ban/bo-luat-lao-dong-2019-45716.html',
  },
};

export function getStatutoryHolidaysForYear(year: number): StatutoryHolidayItem[] {
  return Object.values(STATUTORY_HOLIDAYS_MAP).filter(
    (h) => new Date(h.date).getFullYear() === year,
  );
}

/**
 * Điều chỉnh ngày deadline về ngày làm việc liền kề tiếp theo nếu rơi vào Thứ Bảy, Chủ Nhật hoặc Ngày Nghỉ Lễ.
 * Căn cứ:
 * - Khoản 7 Điều 3 Nghị định 252/2026/NĐ-CP (quy định chuyển ngày thuế)
 * - Điều 112 Bộ luật Lao động số 45/2019/QH14 (các ngày nghỉ lễ, tết hưởng nguyên lương)
 * - Khoản 5 Điều 8 Nghị định 126/2020/NĐ-CP & Điều 86 Thông tư 80/2021/TT-BTC
 */
export function adjustForWeekendAndHolidays(
  date: Date,
  customHolidays?: Record<string, StatutoryHolidayItem>,
): Date {
  const d = new Date(date);
  const holidays = customHolidays || STATUTORY_HOLIDAYS_MAP;

  while (true) {
    const dow = d.getDay();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${day}`;
    const isHoliday = Boolean(holidays[isoDate]);

    if (dow === 6 || dow === 0 || isHoliday) {
      d.setDate(d.getDate() + 1);
    } else {
      break;
    }
  }

  return d;
}

export function adjustForWeekend(date: Date): Date {
  return adjustForWeekendAndHolidays(date);
}

/**
 * Điều chỉnh ngày nộp thuế nếu rơi vào Thứ 7 hoặc Chủ Nhật -> tự động dời sang Thứ Hai kế tiếp (khoản 5 Điều 148 Bộ luật Dân sự & Luật Quản lý Thuế)
 */
export function adjustDeadlineForWeekend(targetDate: Date): Date {
  const result = new Date(targetDate);
  const day = result.getDay();
  if (day === 6) {
    result.setDate(result.getDate() + 2); // Thứ 7 -> Thứ 2
  } else if (day === 0) {
    result.setDate(result.getDate() + 1); // Chủ nhật -> Thứ 2
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
      // Áp dụng chuyển ngày khi deadline trùng cuối tuần (NĐ 252/2026 Điều 3 Khoản 7)
      const dueDate = adjustForWeekend(new Date(nextMonthYear, nextMonth, 20, 23, 59, 59));
      return {
        dueDate,
        requiresEventDate: false,
        calculationBasis: 'Khoản 1 Điều 44 Luật QLT số 38/2019/QH14: Chậm nhất ngày 20 của tháng tiếp theo kỳ phát sinh nghĩa vụ. Nếu trùng ngày nghỉ, chuyển sang ngày LV kế tiếp theo Khoản 7 Điều 3 NĐ 252/2026/NĐ-CP.',
        periodKey: getPeriodKey(cycle, d),
      };
    }

    case 'QUARTERLY': {
      const isTndn = ruleCode.includes('TNDN');
      // Mốc cơ sở luật định cho 4 quý:
      // Q1: 30/04 (Nghỉ lễ 30/4, 1/5 và cuối tuần -> tự động chuyển sang 04/05/2026)
      // Q2: 31/07 (Thứ Sáu -> giữ nguyên 31/07/2026)
      // Q3: 31/10 (Thứ Bảy, CN 01/11 -> tự động chuyển sang 02/11/2026)
      // Q4: 31/01 năm sau (Chủ Nhật hoặc 30/01 Thứ Bảy -> tự động chuyển sang 01/02/2027)
      const rawQuarterDeadlines = [
        new Date(currentYear, 3, 30, 23, 59, 59),
        new Date(currentYear, 6, 31, 23, 59, 59),
        new Date(currentYear, 9, 31, 23, 59, 59),
        new Date(currentYear + 1, 0, 31, 23, 59, 59),
      ];

      const adjustedQuarterDeadlines = rawQuarterDeadlines.map((dl) => adjustForWeekendAndHolidays(dl));

      let chosen = adjustedQuarterDeadlines[0];
      for (const deadline of adjustedQuarterDeadlines) {
        if (deadline.getTime() >= d.getTime()) {
          chosen = deadline;
          break;
        }
      }

      return {
        dueDate: chosen,
        requiresEventDate: false,
        calculationBasis: isTndn
          ? 'Khoản 6 Điều 1 Nghị định 91/2022/NĐ-CP: Tạm nộp TNDN chậm nhất ngày 30 tháng đầu quý tiếp theo. Nếu trùng ngày nghỉ, chuyển sang ngày LV kế tiếp theo Khoản 7 Điều 3 NĐ 252/2026/NĐ-CP.'
          : 'Khoản 1 Điều 44 Luật QLT 38/2019/QH14: Chậm nhất ngày cuối cùng của tháng đầu quý tiếp theo. Nếu trùng ngày nghỉ, chuyển sang ngày LV kế tiếp theo Khoản 7 Điều 3 NĐ 252/2026/NĐ-CP.',
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
      // LƯU Ý: Từ 01/01/2026, lệ phí môn bài chính thức bị BÃI BỎ HOÀN TOÀN
      // Căn cứ: Khoản 7 Điều 10 Nghị quyết 198/2025/QH15 & Nghị định 362/2025/NĐ-CP
      // → Không còn tạo deadline môn bài cho năm 2026 trở đi.
      // → Code này chỉ còn phục vụ quyết toán thuế TNDN/TNCN/BCTC (hạn 31/03).

      let dueDate = new Date(currentYear, 2, 31, 23, 59, 59); // 31/03
      if (d.getTime() > dueDate.getTime()) {
        dueDate = new Date(currentYear + 1, 2, 31, 23, 59, 59);
      }

      // Áp dụng chuyển ngày khi deadline trùng cuối tuần (NĐ 252/2026 Điều 3 Khoản 7)
      dueDate = adjustForWeekend(dueDate);

      return {
        dueDate,
        requiresEventDate: false,
        calculationBasis: 'Điểm a Khoản 2 Điều 44 Luật QLT số 38/2019/QH14: Chậm nhất ngày cuối cùng của tháng thứ 3 kể từ ngày kết thúc năm tài chính. Nếu trùng ngày nghỉ, chuyển sang ngày LV kế tiếp theo Khoản 7 Điều 3 NĐ 252/2026/NĐ-CP.',
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
