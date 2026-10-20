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
      const d = new Date(y, 9, 30);
      if (ref > d) return new Date(y + 1, 9, 30);
      return d;
    }
    default:
      return new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}