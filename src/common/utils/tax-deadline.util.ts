// Chuẩn lịch thuế pháp định Việt Nam
export type TaxType = 'MON_BAI' | 'GTGT' | 'TNCN' | 'TNDN_80';

function toTaxType(input: TaxType | string): TaxType {
  if (input === 'MON_BAI' || input === 'GTGT' || input === 'TNCN' || input === 'TNDN_80') {
    return input as TaxType;
  }
  const k = String(input).toLowerCase();
  if (k.includes('mon_bai') || k.includes('monbai') || k.includes('mb')) return 'MON_BAI';
  if (k.includes('tndn')) return 'TNDN_80';
  if (k.includes('tncn') || k.includes('salary') || k.includes('luong')) return 'TNCN';
  if (k.includes('gtgt') || k.includes('vat')) return 'GTGT';
  return 'GTGT';
}

export function calculateTaxDeadline(taxTypeOrKey: TaxType | string, ref: Date = new Date()): Date {
  const taxType = toTaxType(taxTypeOrKey);
  const y = ref.getFullYear();

  switch (taxType) {
    case 'MON_BAI': {
      const d = new Date(y, 0, 30);
      if (ref > d) return new Date(y + 1, 0, 30);
      return d;
    }
    case 'GTGT':
    case 'TNCN': {
      const deadlines = [
        new Date(y, 3, 30),
        new Date(y, 6, 31),
        new Date(y, 9, 31),
        new Date(y + 1, 0, 31),
      ];
      for (const d of deadlines) {
        if (d >= ref) return d;
      }
      return deadlines[0];
    }
    case 'TNDN_80': {
      // Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP: Tạm nộp theo 4 quý (Q1: 30/04, Q2: 31/07, Q3: 31/10, Q4: 31/01 năm sau).
      // Hạn chót tạm nộp 4 quý tối thiểu 80% số thuế TNDN quyết toán cả năm là ngày 31/01 năm tiếp theo.
      const deadlines = [
        new Date(y, 3, 30, 23, 59, 59), // Q1: 30/04
        new Date(y, 6, 31, 23, 59, 59), // Q2: 31/07
        new Date(y, 9, 31, 23, 59, 59), // Q3: 31/10 (tháng 10 có 31 ngày)
        new Date(y + 1, 0, 31, 23, 59, 59), // Q4 & chốt hạn 80%: 31/01 năm sau
      ];
      for (const d of deadlines) {
        if (d >= ref) return d;
      }
      return deadlines[deadlines.length - 1];
    }
    default:
      return new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}