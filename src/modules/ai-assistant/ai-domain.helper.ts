export interface CitFinancialSnapshot {
  currentYear: number;
  citRevenues: Array<{ amount?: number }>;
  citExpenses: Array<{
    amount: number;
    category?: string;
    date?: string;
    paymentMethod?: string;
    hasInvoice?: string | boolean;
    isDisallowedB4?: boolean;
    disallowedReason?: string | null;
    legalBasis?: string | null;
  }>;
  totalRevenue: number;
  totalExpense: number;
  disallowedExpenses: Array<{
    amount: number;
    category?: string;
    date?: string;
    paymentMethod?: string;
    hasInvoice?: string | boolean;
    disallowedReason?: string | null;
    legalBasis?: string | null;
  }>;
  totalDisallowed: number;
  deductibleExpense: number;
  taxableIncome: number;
  estimatedCit: number;
  prepayment80: number;
}

export function normalizeVietnameseText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[?.,!;:()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTaxOrEnterpriseDomain(raw: string): boolean {
  const normalized = (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[?.,!;:()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.length === 0) return false;

  const keywordGroups = [
    // 1. Chào hỏi, cảm ơn và hỏi về năng lực của trợ lý
    [
      'chao', 'xin chao', 'hello', 'hi', 'alo', 'ban la ai', 'celra', 'tro ly', 'copilot',
      'gioi thieu', 'huong dan', 'cam on', 'thank', 'ho tro gi', 'lam duoc gi', 'chuc nang',
      'hoi dap', 'tu van gi',
    ],
    // 2. Thuế & Nghĩa vụ thuế
    [
      'thue', 'mon bai', 'tndn', 'gtgt', 'vat', 'tncn', 'fct', 'nha thau', 'tieu thu dac biet',
      'xuat nhap khau', 'ke khai', 'to khai', 'quyet toan', 'khau tru', 'nop thue', 'hoan thue',
      'mien thue', 'giam thue', 'tien cham nop', 'cham nop', 'nghia vu thue', 'quan ly thue',
      'co quan thue', 'tong cuc thue', 'chi cuc thue', 'thuedientu', 'gdt', 'ma so thue', 'mst',
      'ma so doanh nghiep', 'msdn', 'thue dien tu', 'lich thue', 'bac thue', 'thue suat',
    ],
    // 3. Hóa đơn, chứng từ, thanh toán, chi phí, kế toán
    [
      'hoa don', 'hddt', 'may tinh tien', 'pos', 'chung tu', 'tien mat', 'chuyen khoan',
      'uy nhiem chi', 'sao ke', 'ngan hang', 'khong dung tien mat', '20 trieu', 'chi phi',
      'chi phi hop ly', 'chi phi duoc tru', 'xuat toan', 'bctc', 'bao cao tai chinh',
      'doanh thu', 'loi nhuan', 'gia von', 'so sach', 'ke toan', 'kiem toan',
    ],
    // 4. Doanh nghiệp, tổ chức, pháp lý doanh nghiệp
    [
      'doanh nghiep', 'cong ty', 'dn', 'phap nhan', 'to chuc', 'dkkd', 'dang ky kinh doanh',
      'giay phep', 'giay chung nhan', 'von dieu le', 'gop von', 'thanh lap', 'giai the',
      'tam ngung', 'nganh nghe', 'kinh doanh', 'chi nhanh', 'van phong dai dien', 'tnhh',
      'co phan', 'f&b', 'sme', 'ban le', 'thuong mai dien tu', 'shopee', 'tiktok', 'cod',
      'dai dien phap luat', 'chu so huu', 'ho kinh doanh',
    ],
    // 5. Chi phí tiền lương, thù lao phục vụ xác định chi phí hợp lý được trừ khi tính Thuế TNDN
    [
      'luong', 'tien luong', 'nhan su', 'nhan vien', 'nguoi lao dong', 'hop dong lao dong',
      'hdld', 'nguoi phu thuoc', 'giam tru gia canh',
    ],
    // 6. Tuân thủ, rà soát, rủi ro, pháp luật
    [
      'phap luat', 'luat', 'nghi dinh', 'thong tu', 'nghi quyet', 'quyet dinh', 'dieu khoan',
      'tuan thu', 'ra soat', 'kiem tra', 'ho so', 'nghia vu', 'rui ro', 'xu phat', 'vi pham',
      'han chot', 'thoi han', 'ky han', 'con thieu', 'chua lam', 'chua nop', 'xac minh',
    ],
    // 7. Đọc, phân tích, tóm tắt, hỏi đáp tệp tin/tài liệu đính kèm
    [
      'file', 'tai lieu', 'tep', 'tep tin', 'dinh kem', 'tom tat', 'doc file',
      'phan tich file', 'so sanh', 'noi dung file', 'trong file', 'tai len',
      'bang luong', 'hop dong', 'to khai', 'bien ban', 'bang tinh', 'sheet',
      'docx', 'pdf', 'xlsx', 'excel', 'file nay', 'tep nay',
    ],
  ];

  return keywordGroups.some((group) => group.some((kw) => normalized.includes(kw)));
}

export function buildOutOfScopeRejectionResponse() {
  const rejectionReply =
    `**TỪ CHỐI TRẢ LỜI — CÂU HỎI NGOÀI PHẠM VI CHUYÊN MÔN:**\n\n` +
    `Rất tiếc, tôi là **CELRA AI — Trợ lý Rà soát Tuân thủ Thuế Doanh nghiệp** (chuyên sâu Thuế TNDN) tại Việt Nam. Tôi chỉ hỗ trợ giải đáp các câu hỏi chuyên sâu về **Thuế Thu nhập doanh nghiệp (TNDN) và Chứng từ chi phí hợp lệ**.\n\n` +
    `Câu hỏi của bạn hiện nằm ngoài phạm vi hỗ trợ của hệ thống. Bạn vui lòng đặt câu hỏi liên quan đến:\n` +
    `- **Nghĩa vụ Thuế TNDN**: Thuế suất TNDN (15%/17%/20%), tạm nộp 4 quý tối thiểu 80%, quyết toán năm Mẫu 03/TNDN.\n` +
    `- **Chi phí được trừ & Mục B4**: Hóa đơn hợp pháp, điều kiện chuyển khoản từ 5 triệu đồng, chi phí lương và khấu trừ FCT.\n` +
    `- **Kỳ kê khai & Thời hạn tuân thủ**: Lịch tạm nộp thuế TNDN hàng quý và quyết toán năm của doanh nghiệp.\n` +
    `- **Rà soát & Đánh giá rủi ro tuân thủ**: Rà soát nghĩa vụ và kiểm tra hồ sơ thuế TNDN thực tế của công ty bạn.`;

  return {
    messageId: `msg-${Date.now()}`,
    sender: 'assistant',
    content: rejectionReply,
    answer: rejectionReply,
    actionType: 'info' as const,
    isEnterpriseQuery: false,
    citations: [],
    proposedChecklists: [],
    verificationChecklist: [],
    confidenceLevel: 'high',
    confidenceReason: 'Từ chối câu hỏi ngoài phạm vi nghiệp vụ thuế và doanh nghiệp',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Trả lời trực tiếp từ DB (0 API, 0 LLM) cho các câu hỏi tra cứu số liệu thu chi / hồ sơ định danh doanh nghiệp.
 */
export function tryBuildDirectDbResponse(
  org: any,
  normalized: string,
  isSelfOrgSubject: boolean,
  fin: CitFinancialSnapshot,
) {
  const isComplianceOrTaxAsk =
    /(thue|tuan thu|can lam gi|lam gi|ra soat|nghia vu|chung tu|phat sinh|huong dan|can nop|hoa don|may tinh tien|xuat toan|tien mat|chuyen khoan|ngan hang|bhxh|bao hiem|luong|nop phat|vi pham|co can|co phai|can khong|phai khong|nhu the nao|the nao|ra sao|luat|nghi dinh|thong tu|quy dinh|dieu kien|muc b4|chuyen nhuong|khau tru|tai lieu|ho so thieu|con thieu)/i.test(
      normalized,
    );

  const isNameQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject &&
      /(ten phap ly|ten cong ty cua toi|ten doanh nghiep cua toi|(cong ty|doanh nghiep) toi ten (la )?gi)/i.test(normalized)) ||
      /^(ten|ten gi|ten cong ty|ten doanh nghiep|ten phap ly)$/i.test(normalized));

  const isTaxCodeQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject && /(mst cua (toi|dn|cong ty)|ma so thue cua (toi|dn|cong ty))/i.test(normalized)) ||
      /^(mst|ma so thue|tax code|so thue)$/i.test(normalized) ||
      /^(tra cuu mst|xin mst|cho xin mst|cho toi mst|xem mst|xem ma so thue)$/i.test(normalized));

  const isStaffQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject &&
      /(quy mo nhan su cua (toi|dn|cong ty)|cong ty toi co bao nhieu (nguoi|nhan vien|nhan su))/i.test(
        normalized,
      )) ||
      /^(nhan su|nhan vien|quy mo|quy mo nhan su|so luong nhan vien|bao nhieu nguoi)$/i.test(
        normalized,
      ));

  const isAddressQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject && /(dia chi cua (toi|dn|cong ty)|tru so cua (toi|dn|cong ty)|cong ty toi o dau)/i.test(normalized)) ||
      /^(dia chi|tru so|dia chi tru so|o dau)$/i.test(normalized));

  const isIndustryQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject && /(nganh nghe cua (toi|dn|cong ty)|linh vuc cua (toi|dn|cong ty)|cong ty toi kinh doanh gi|nganh nghe dang ky cua toi)/i.test(normalized)) ||
      /^(nganh nghe|linh vuc|kinh doanh gi|mo hinh kinh doanh)$/i.test(normalized));

  const isGeneralProfileQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject && /(thong tin doanh nghiep cua toi|ho so doanh nghiep cua toi|thong tin cong ty toi|ho so phap ly cua toi)/i.test(normalized)) ||
      /^(thong tin|ho so|thong tin dn|ho so dn|thong tin cong ty|thong tin doanh nghiep)$/i.test(
        normalized,
      ));

  const isRevenueQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject && /(doanh thu (cua )?(toi|dn|cong ty|doanh nghiep)|tong thu cua (toi|dn|cong ty)|doanh thu nam nay cua toi)/i.test(normalized)) ||
      /^(doanh thu|tong doanh thu)$/i.test(normalized));
  const isExpenseQuery =
    ((isSelfOrgSubject &&
      !/(can lam gi|nhu the nao|huong dan|co bi loai|co duoc tru)/i.test(normalized) &&
      /((tong )?chi phi (cua )?(toi|dn|cong ty|doanh nghiep)|chi phi nam nay cua toi)/i.test(normalized)) ||
      /^(chi phi|tong chi phi)$/i.test(normalized));
  const isTaxEstimateQuery =
    !isComplianceOrTaxAsk &&
    ((isSelfOrgSubject && /(tam tinh thue tndn cua (toi|dn|cong ty)|uoc tinh thue tndn cua (toi|dn|cong ty))/i.test(normalized)) ||
      /^(uoc tinh thue|tam tinh thue)$/i.test(normalized));

  if (isRevenueQuery) {
    const content = `Doanh thu năm ${fin.currentYear} của **${org.name}** ghi nhận trên hệ thống CELRA hiện tại là: **${fin.totalRevenue.toLocaleString('vi-VN')} VNĐ** (Tổng cộng ${fin.citRevenues.length} khoản thu đã kê khai trong Sổ Doanh thu).`;
    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content,
      answer: content,
      actionType: 'info' as const,
      citations: [],
      confidenceLevel: 'high',
      confidenceReason: 'Trích xuất trực tiếp từ Sổ Kê khai Doanh thu Thuế TNDN trong hệ thống (0 API, 0 LLM)',
      proposedChecklists: [],
      createdAt: new Date().toISOString(),
    };
  }

  if (isExpenseQuery) {
    const content =
      `Tổng chi phí năm ${fin.currentYear} của **${org.name}** ghi nhận là: **${fin.totalExpense.toLocaleString('vi-VN')} VNĐ** (${fin.citExpenses.length} khoản chi).\n\n` +
      `- **Chi phí hợp lệ được trừ**: ${fin.deductibleExpense.toLocaleString('vi-VN')} VNĐ\n` +
      `- **Chi phí loại trừ Mục B4 (rủi ro thuế)**: **${fin.totalDisallowed.toLocaleString('vi-VN')} VNĐ** (${fin.disallowedExpenses.length} khoản)` +
      (fin.disallowedExpenses.length > 0
        ? `:\n` +
          fin.disallowedExpenses
            .slice(0, 3)
            .map(
              (e, idx) =>
                `  ${idx + 1}. ${e.category}: ${e.amount.toLocaleString('vi-VN')} VNĐ (${e.disallowedReason || 'Chưa đủ điều kiện khấu trừ'})`,
            )
            .join('\n')
        : '.');
    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content,
      answer: content,
      actionType: 'info' as const,
      citations: [],
      confidenceLevel: 'high',
      confidenceReason: 'Trích xuất trực tiếp từ Sổ Kê khai Chi phí & Rà soát Mục B4 trong hệ thống (0 API, 0 LLM)',
      proposedChecklists: [],
      createdAt: new Date().toISOString(),
    };
  }

  if (isTaxEstimateQuery) {
    const content =
      `Nghĩa vụ Thuế TNDN năm ${fin.currentYear} của **${org.name}** ước tính từ số liệu sổ sách:\n\n` +
      `- **Doanh thu ghi nhận**: ${fin.totalRevenue.toLocaleString('vi-VN')} VNĐ\n` +
      `- **Chi phí được trừ**: ${fin.deductibleExpense.toLocaleString('vi-VN')} VNĐ\n` +
      `- **Thu nhập tính thuế**: ${fin.taxableIncome.toLocaleString('vi-VN')} VNĐ\n` +
      `- **Thuế TNDN dự kiến (20%)**: **${fin.estimatedCit.toLocaleString('vi-VN')} VNĐ**\n` +
      `- **Nghĩa vụ tạm nộp 4 quý tối thiểu 80% (NĐ 91/2022)**: **${fin.prepayment80.toLocaleString('vi-VN')} VNĐ** (Hạn chốt 31/01 năm sau).`;
    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content,
      answer: content,
      actionType: 'info' as const,
      citations: [],
      confidenceLevel: 'high',
      confidenceReason: 'Tính toán tự động từ Sổ thu chi TNDN theo quy định Nghị định 91/2022/NĐ-CP (0 API, 0 LLM)',
      proposedChecklists: [],
      createdAt: new Date().toISOString(),
    };
  }

  if (isNameQuery || isTaxCodeQuery || isStaffQuery || isAddressQuery || isIndustryQuery || isGeneralProfileQuery) {
    let directAnswer = '';
    if (isNameQuery && !isGeneralProfileQuery) {
      directAnswer = `Doanh nghiệp của bạn trên hệ thống CELRA có tên pháp lý là: **${org.name}** (Hình thức: ${org.legalType || 'Doanh nghiệp'}).`;
    } else if (isTaxCodeQuery && !isGeneralProfileQuery) {
      directAnswer = `Mã số thuế của doanh nghiệp **${org.name}** là: **${org.taxCode}**.`;
    } else if (isStaffQuery && !isGeneralProfileQuery) {
      directAnswer = `Quy mô nhân sự đăng ký của doanh nghiệp **${org.name}** hiện tại là: **${org.employeeCount || 0} nhân sự**.`;
    } else if (isAddressQuery && !isGeneralProfileQuery) {
      directAnswer = `Địa chỉ trụ sở của doanh nghiệp **${org.name}** là: **${org.address || org.locations || 'Chưa cập nhật chi tiết'}**.`;
    } else if (isIndustryQuery && !isGeneralProfileQuery) {
      directAnswer = `Ngành nghề hoạt động của **${org.name}** là: **${org.industry || 'Chung'}** (Mô hình: ${org.businessModel || 'Vận hành tiêu chuẩn'}).`;
    } else {
      directAnswer =
        `**Hồ sơ thông tin Doanh nghiệp của bạn trên hệ thống CELRA:**\n\n` +
        `- **Tên doanh nghiệp**: ${org.name}\n` +
        `- **Mã số thuế (MST)**: ${org.taxCode}\n` +
        `- **Hình thức pháp lý**: ${org.legalType || 'Công ty TNHH'}\n` +
        `- **Ngành nghề kinh doanh**: ${org.industry || 'Chung'}\n` +
        `- **Quy mô nhân sự**: ${org.employeeCount || 0} người\n` +
        `- **Địa bàn hoạt động**: ${org.locations || org.address || 'TP. Hồ Chí Minh'}\n` +
        `- **Mô hình**: ${org.businessModel || 'Trực tiếp và trực tuyến'}`;
    }

    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content: directAnswer,
      answer: directAnswer,
      actionType: 'info' as const,
      citations: [],
      confidenceLevel: 'high',
      confidenceReason: 'Trích xuất trực tiếp từ Cơ sở dữ liệu Doanh nghiệp trong hệ thống (0 API, 0 LLM)',
      proposedChecklists: [],
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}
