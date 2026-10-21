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

export type StatutoryCycleType =
  | 'MONTHLY'          // 1. Hàng tháng (Hạn ngày 20)
  | 'QUARTERLY'        // 2. Hàng quý (30/04, 31/07, 31/10, 31/01)
  | 'BIANNUAL_6M'      // 3. 6 Tháng / Bán niên (05/06, 05/12)
  | 'ANNUAL'           // 4. Cả năm (30/01 môn bài, 31/03 quyết toán BCTC)
  | 'EVENT_10D'        // 5. Từng lần phát sinh 10 ngày (Thuế nhà thầu FCT, ĐK NQLĐ)
  | 'EVENT_20D'        // 6. Đợt 20 ngày (Chuyển kỳ kê khai theo NĐ 126/2020)
  | 'EVENT_45D'        // 7. Đợt 45 ngày (Quyết toán giải thể, chia tách)
  | 'EVENT_3D'         // 8. Đợt 03 ngày làm việc (Tạm ngừng / HĐĐT sai sót)
  | 'EVENT_10D_BIZ'    // 9. Đợt 10 ngày làm việc (Đổi ĐKKD & Thông tin thuế)
  | 'EVENT_90D'        // 10. Đợt 90 ngày (Hạn góp đủ vốn điều lệ ban đầu)
  | 'EVENT_30D_CAPITAL'; // 11. Đợt 30 ngày (Đăng ký giảm vốn điều lệ sau 90 ngày)

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

export function calculateLegalDueDate(cycle: StatutoryCycleType, refDate: Date = new Date()): Date {
  const d = new Date(refDate);
  const currentYear = d.getFullYear();
  const currentMonth = d.getMonth();
  const currentDate = d.getDate();

  switch (cycle) {
    case 'MONTHLY': {
      if (currentDate <= 20) {
        return new Date(currentYear, currentMonth, 20, 23, 59, 59);
      }
      return new Date(currentYear, currentMonth + 1, 20, 23, 59, 59);
    }

    case 'QUARTERLY': {
      const quarterDeadlines = [
        new Date(currentYear, 3, 30, 23, 59, 59), // 30/04
        new Date(currentYear, 6, 31, 23, 59, 59), // 31/07
        new Date(currentYear, 9, 31, 23, 59, 59), // 31/10
        new Date(currentYear + 1, 0, 31, 23, 59, 59), // 31/01 năm sau
      ];

      for (const deadline of quarterDeadlines) {
        if (deadline.getTime() >= d.getTime()) {
          return deadline;
        }
      }
      return quarterDeadlines[0];
    }

    case 'BIANNUAL_6M': {
      const junDeadline = new Date(currentYear, 5, 5, 23, 59, 59); // 05/06
      const decDeadline = new Date(currentYear, 11, 5, 23, 59, 59); // 05/12

      if (d.getTime() <= junDeadline.getTime()) {
        return junDeadline;
      }
      if (d.getTime() <= decDeadline.getTime()) {
        return decDeadline;
      }
      return new Date(currentYear + 1, 5, 5, 23, 59, 59);
    }

    case 'ANNUAL': {
      const monBaiDeadline = new Date(currentYear, 0, 30, 23, 59, 59);
      const bctcDeadline = new Date(currentYear, 2, 31, 23, 59, 59);

      if (d.getTime() <= monBaiDeadline.getTime()) {
        return monBaiDeadline;
      }
      if (d.getTime() <= bctcDeadline.getTime()) {
        return bctcDeadline;
      }
      return new Date(currentYear + 1, 0, 30, 23, 59, 59);
    }

    case 'EVENT_10D': {
      const res = new Date(d);
      res.setDate(res.getDate() + 10);
      return res;
    }

    case 'EVENT_20D': {
      const res = new Date(d);
      res.setDate(res.getDate() + 20);
      return res;
    }

    case 'EVENT_45D': {
      const res = new Date(d);
      res.setDate(res.getDate() + 45);
      return res;
    }

    case 'EVENT_3D': {
      return addBusinessDays(d, 3);
    }

    case 'EVENT_10D_BIZ': {
      return addBusinessDays(d, 10);
    }

    case 'EVENT_90D': {
      const res = new Date(d);
      res.setDate(res.getDate() + 90);
      return res;
    }

    case 'EVENT_30D_CAPITAL': {
      const res = new Date(d);
      res.setDate(res.getDate() + 30);
      return res;
    }

    default: {
      const res = new Date(d);
      res.setDate(res.getDate() + 15);
      return res;
    }
  }
}
