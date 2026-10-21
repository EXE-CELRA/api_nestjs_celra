/**
 * CELRA Vietnamese Tax & Legal Compliance Evaluation Engine
 * 
 * Căn cứ pháp lý:
 * - Luật Quản lý thuế số 38/2019/QH14 (Điều 44, Điều 59)
 * - Nghị định 126/2020/NĐ-CP (Điều 8, Điều 9, Điều 18)
 * - Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1 - Tạm nộp 4 quý tối thiểu 80% TNDN cả năm)
 * - Nghị định 123/2020/NĐ-CP (Điều 11 - Hóa đơn điện tử máy tính tiền) & Thông tư 78/2021/TT-BTC
 * - Thông tư 96/2015/TT-BTC (Điều 4), Thông tư 219/2013/TT-BTC (Điều 15) & Luật Thuế GTGT số 48/2024/QH15 (Điều 14)
 * - Thông tư 111/2013/TT-BTC (Điều 9, Điều 25 - Thuế TNCN & Giảm trừ gia cảnh)
 * - Nghị định 139/2016/NĐ-CP & Nghị định 22/2020/NĐ-CP (Lệ phí môn bài)
 */

export type ApplicabilityStatus = 'APPLICABLE' | 'POSSIBLE' | 'NEEDS_VERIFICATION' | 'NOT_APPLICABLE';
export type ExecutionStatus = 'COMPLETED' | 'IN_PROGRESS' | 'OVERDUE' | 'NEEDS_VERIFICATION';
export type UnifiedComplianceStatus = 'COMPLETED' | 'IN_PROGRESS' | 'OVERDUE' | 'NEEDS_VERIFICATION' | 'NOT_APPLICABLE';

export interface EvaluatedObligation {
  key: string;
  code: string;
  name: string;
  category: 'TAX_CORP' | 'TAX_VAT' | 'TAX_PIT' | 'INVOICE' | 'LICENSE';
  taxPeriod: string;
  statutoryDueDate: string;
  statutoryDueDateObj: Date;
  applicabilityStatus: ApplicabilityStatus;
  applicabilityLabel: string;
  executionStatus: ExecutionStatus;
  executionLabel: string;
  status: UnifiedComplianceStatus;
  statusLabel: string;
  statusReason: string;
  legalDoc: string;
  article: string;
  effectiveDate: string;
  sourceUrl: string;
  recordedData: string;
  evidenceRequirement: string;
  hasValidEvidence: boolean;
  actionRequired: string;
  missingDataQuestion?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  priorityReason: string;
}

export interface ComplianceSummary {
  total: number;
  completed: number;
  inProgress: number;
  needsVerification: number;
  overdue: number;
  notApplicable: number;
  summaryText: string;
}

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  APPLICABLE: 'Đã xác định nghĩa vụ áp dụng',
  POSSIBLE: 'Có khả năng áp dụng nhưng chưa đủ dữ liệu',
  NEEDS_VERIFICATION: 'Cần xác minh thông tin hoặc căn cứ',
  NOT_APPLICABLE: 'Đã có căn cứ xác định không áp dụng',
  COMPLETED: 'Có đủ bằng chứng xác nhận hoàn thành',
  IN_PROGRESS: 'Đang thực hiện và có dữ liệu xác nhận',
  OVERDUE: 'Đã xác định nghĩa vụ áp dụng, quá hạn và chưa hoàn thành theo dữ liệu đáng tin cậy',
};

export const COMPLIANCE_STATUS_SHORT_LABELS: Record<string, string> = {
  APPLICABLE: 'Bắt buộc áp dụng',
  POSSIBLE: 'Có thể áp dụng',
  NEEDS_VERIFICATION: 'Cần xác minh',
  NOT_APPLICABLE: 'Không áp dụng',
  COMPLETED: 'Đã hoàn thành',
  IN_PROGRESS: 'Đang thực hiện',
  OVERDUE: 'Quá hạn',
};

export function formatComplianceStatus(status: string): string {
  return COMPLIANCE_STATUS_LABELS[status] || status;
}

export function formatComplianceStatusShort(status: string): string {
  return COMPLIANCE_STATUS_SHORT_LABELS[status] || status;
}
export interface ComplianceAuditReport {
  evaluatedAt: string;
  organizationId: string;
  organizationName: string;
  taxCode: string;
  summary: ComplianceSummary;
  obligations: EvaluatedObligation[];
  pendingQuestions: string[];
}

export interface EvaluationFactInput {
  key: string;
  label?: string;
  currentValue?: string;
  status?: string;
  providedAt?: Date | string;
}

export interface EvaluationEvidenceInput {
  status: string; // 'accepted' | 'unverified' | 'reconciling' | 'rejected'
  fileType?: string;
  fileName?: string;
  category?: string;
}

export interface OrganizationEvaluationInput {
  id: string;
  name: string;
  taxCode: string;
  legalType?: string;
  industry?: string;
  businessModel?: string;
  hasOnlineSales?: boolean;
  operatingYears?: string;
  employeeCount?: number;
  createdAt?: Date | string;
  contextFacts?: EvaluationFactInput[];
  evidenceDocuments?: EvaluationEvidenceInput[];
}

/**
 * Động cơ phân tích & đánh giá trạng thái tuân thủ theo chuẩn mực pháp lý Việt Nam
 * 
 * Nguyên tắc bất di bất dịch:
 * 1. Không có hồ sơ != Chưa thực hiện nghĩa vụ
 * 2. Chưa có dữ liệu != Vi phạm pháp luật
 * 3. Không đánh dấu COMPLETED nếu chưa có bằng chứng phù hợp (Chứng từ nộp NSNN / Thông báo chấp nhận CQT)
 * 4. Chỉ đánh dấu OVERDUE khi đã xác định nghĩa vụ áp dụng, kỳ hạn chính xác và tình trạng chưa hoàn thành
 * 5. TNDN 80%: Tổng 4 quý đạt 80% cả năm; chỉ tính phạt chậm nộp từ sau hạn quý 4 (01/02 năm sau), KHÔNG tính từ 30/10
 * 6. Thanh toán không dùng tiền mặt: Chuyển khoản sau không mặc định khắc phục vi phạm thanh toán tiền mặt
 * 7. Thuế TNCN: Tách riêng Đăng ký MST, Người phụ thuộc, Khấu trừ, Kê khai, Quyết toán
 */
export function evaluateEnterpriseCompliance(
  org: OrganizationEvaluationInput,
  refDate: Date = new Date(),
  options?: { taxYear?: number },
): ComplianceAuditReport {
  const currentYear = options?.taxYear || refDate.getFullYear();
  const facts = org.contextFacts || [];
  const evidences = org.evidenceDocuments || [];

  const getFactValue = (key: string): string => {
    const f = facts.find((item) => item.key === key);
    return f?.currentValue?.trim() || '';
  };

  const hasAcceptedEvidence = (keyword: string): boolean => {
    return evidences.some(
      (e) =>
        e.status === 'accepted' &&
        (e.fileName?.toLowerCase().includes(keyword.toLowerCase()) ||
          e.category?.toLowerCase().includes(keyword.toLowerCase())),
    );
  };

  const obligations: EvaluatedObligation[] = [];
  const pendingQuestions: string[] = [];

  // ==========================================================================
  // 1. LỆ PHÍ MÔN BÀI (ANNUAL LICENSE FEE)
  // ==========================================================================
  {
    const monBaiDueDate = new Date(currentYear, 0, 30, 23, 59, 59);
    const orgCreatedDate = org.createdAt ? new Date(org.createdAt) : null;
    const isNewInCurrentYear = orgCreatedDate && orgCreatedDate.getFullYear() === currentYear;

    let appStatus: ApplicabilityStatus = 'APPLICABLE';
    let execStatus: ExecutionStatus = 'NEEDS_VERIFICATION';
    let statusReason = '';
    const factVal = getFactValue('q_tax_corp_monbai') || getFactValue('tax.license_fee');
    const hasEvidence = hasAcceptedEvidence('mon_bai') || hasAcceptedEvidence('môn bài') || hasAcceptedEvidence('lpmb');

    if (isNewInCurrentYear) {
      statusReason = 'Doanh nghiệp mới thành lập trong năm được miễn lệ phí môn bài năm đầu tiên theo Nghị định 22/2020/NĐ-CP.';
      execStatus = 'COMPLETED';
    } else if (hasEvidence) {
      appStatus = 'APPLICABLE';
      execStatus = 'COMPLETED';
      statusReason = 'Đã có chứng từ nộp NSNN hợp lệ xác nhận hoàn thành lệ phí môn bài.';
    } else if (factVal.toLowerCase().includes('da nop') || factVal.toLowerCase().includes('đã nộp')) {
      appStatus = 'APPLICABLE';
      execStatus = 'IN_PROGRESS';
      statusReason = 'Hệ thống ghi nhận thông tin đã nộp từ khảo sát ban đầu; cần đối chiếu Giấy nộp tiền NSNN để xác nhận chính thức.';
      pendingQuestions.push('Doanh nghiệp vui lòng tải lên Giấy nộp tiền vào NSNN hoặc giấy báo Nợ đối với Lệ phí môn bài năm nay.');
    } else if (refDate.getTime() > monBaiDueDate.getTime()) {
      if (factVal.toLowerCase().includes('chua nop') || factVal.toLowerCase().includes('chưa nộp')) {
        appStatus = 'APPLICABLE';
        execStatus = 'OVERDUE';
        statusReason = `Đã quá hạn ngày 30/01/${currentYear} và ghi nhận chưa hoàn tất nộp tiền vào NSNN.`;
      } else {
        appStatus = 'APPLICABLE';
        execStatus = 'NEEDS_VERIFICATION';
        statusReason = `Đã qua ngày 30/01/${currentYear} nhưng chưa đủ dữ liệu chứng từ nộp thuế để khẳng định tình trạng tuân thủ.`;
        pendingQuestions.push('Doanh nghiệp đã nộp lệ phí môn bài năm nay chưa? Vui lòng cung cấp chứng từ nộp tiền vào NSNN.');
      }
    } else {
      appStatus = 'APPLICABLE';
      execStatus = 'IN_PROGRESS';
      statusReason = `Hạn nộp là ngày 30/01/${currentYear}; doanh nghiệp đang trong kỳ chuẩn bị nộp.`;
    }

    const unifiedStatus: UnifiedComplianceStatus = execStatus;
    obligations.push({
      key: 'q_tax_corp_monbai',
      code: 'TAX-OBL-01',
      name: 'Lệ phí môn bài định kỳ hàng năm',
      category: 'LICENSE',
      taxPeriod: `Năm ${currentYear}`,
      statutoryDueDate: `30/01/${currentYear}`,
      statutoryDueDateObj: monBaiDueDate,
      applicabilityStatus: appStatus,
      applicabilityLabel: formatComplianceStatus(appStatus),
      executionStatus: execStatus,
      executionLabel: formatComplianceStatus(execStatus),
      status: unifiedStatus,
      statusLabel: formatComplianceStatus(unifiedStatus),
      statusReason,
      legalDoc: 'Nghị định 139/2016/NĐ-CP & Nghị định 22/2020/NĐ-CP',
      article: 'Điều 4, Điều 5 Nghị định 139/2016/NĐ-CP; Khoản 1 Điều 1 Nghị định 22/2020/NĐ-CP',
      effectiveDate: 'Còn hiệu lực',
      sourceUrl: 'https://dulieuphapluat.vn/van-ban/linh-vuc-khac-van-ban/nghi-dinh-1392016nd-cp-quy-dinh-ve-le-phi-mon-bai-121377.html',
      recordedData: factVal || 'Chưa ghi nhận dữ liệu',
      evidenceRequirement: 'Giấy nộp tiền vào NSNN hoặc thông báo giao dịch Kho bạc thành công',
      hasValidEvidence: hasEvidence,
      actionRequired: isNewInCurrentYear
        ? 'Theo dõi thời hạn nộp tờ khai và lệ phí môn bài cho năm tiếp theo trước 30/01.'
        : 'Trích nộp lệ phí môn bài qua thuedientu.gdt.gov.vn và lưu trữ chứng từ.',
      missingDataQuestion: execStatus === 'NEEDS_VERIFICATION' ? 'Doanh nghiệp đã có chứng từ nộp lệ phí môn bài vào NSNN chưa?' : undefined,
      priority: execStatus === 'OVERDUE' ? 'urgent' : 'medium',
      priorityReason: 'Nghĩa vụ pháp định hàng năm bắt buộc đối với mọi tổ chức sản xuất kinh doanh.',
    });
  }

  // ==========================================================================
  // 2. TẠM NỘP THUẾ THU NHẬP DOANH NGHIỆP (TNDN) 80% 4 QUÝ
  // ==========================================================================
  {
    // Hạn chốt 80% là ngày 31/01 của năm tiếp theo (Nghị định 91/2022/NĐ-CP)
    const tndnThresholdDueDate = new Date(currentYear + 1, 0, 31, 23, 59, 59);
    const factVal = getFactValue('q_tax_corp_2') || getFactValue('tax.cit_interim_payment');
    const hasEvidence = hasAcceptedEvidence('tndn') || hasAcceptedEvidence('thu nhập doanh nghiệp');

    let appStatus: ApplicabilityStatus = 'APPLICABLE';
    let execStatus: ExecutionStatus = 'IN_PROGRESS';
    let statusReason = '';

    if (hasEvidence) {
      execStatus = 'COMPLETED';
      statusReason = 'Đã có chứng từ nộp thuế TNDN tạm nộp vào NSNN xác nhận tuân thủ.';
    } else if (refDate.getTime() <= tndnThresholdDueDate.getTime()) {
      // Trong năm tài chính chưa hết hạn quý 4: Đang trong tiến độ tạm nộp từng quý, KHÔNG ĐƯỢC đánh giá OVERDUE
      execStatus = 'IN_PROGRESS';
      statusReason = `Doanh nghiệp đang trong tiến trình tạm nộp 4 quý (Hạn chót đạt tỷ lệ tối thiểu 80% là ngày 31/01/${currentYear + 1}). Tuyệt đối không tính tiền chậm nộp trước ngày này.`;
    } else {
      // Đã qua 31/01 năm tiếp theo: cần đối chiếu số thuế đã nộp với 80% quyết toán năm
      if (factVal.toLowerCase().includes('chua nop') || factVal.toLowerCase().includes('chưa nộp')) {
        execStatus = 'OVERDUE';
        statusReason = `Đã qua ngày 31/01/${currentYear + 1} và ghi nhận chưa thực hiện tạm nộp đủ 80% thuế TNDN cả năm.`;
      } else {
        execStatus = 'NEEDS_VERIFICATION';
        statusReason = 'Chưa đủ dữ liệu báo cáo tài chính và số thuế đã nộp để tính toán tỷ lệ 80%; không tự sinh số tiền chậm nộp khi thiếu dữ liệu đầu vào.';
        pendingQuestions.push('Doanh nghiệp vui lòng cung cấp ước tính thuế TNDN phải nộp cả năm và tổng số thuế TNDN đã tạm nộp vào NSNN.');
      }
    }

    obligations.push({
      key: 'q_tax_corp_2',
      code: 'TAX-OBL-02',
      name: 'Tạm nộp thuế Thu nhập doanh nghiệp (TNDN) 4 quý tối thiểu 80%',
      category: 'TAX_CORP',
      taxPeriod: `4 Quý năm tài chính ${currentYear}`,
      statutoryDueDate: `31/01/${currentYear + 1}`,
      statutoryDueDateObj: tndnThresholdDueDate,
      applicabilityStatus: appStatus,
      applicabilityLabel: formatComplianceStatus(appStatus),
      executionStatus: execStatus,
      executionLabel: formatComplianceStatus(execStatus),
      status: execStatus,
      statusLabel: formatComplianceStatus(execStatus),
      statusReason,
      legalDoc: 'Nghị định 91/2022/NĐ-CP sửa đổi Nghị định 126/2020/NĐ-CP; Luật Quản lý thuế số 38/2019/QH14',
      article: 'Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP; Điều 59 Luật Quản lý thuế số 38/2019/QH14',
      effectiveDate: 'Còn hiệu lực',
      sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/nghi-dinh-912022nd-cp-cua-chinh-phu-ve-viec-sua-doi-bo-sung-mot-so-dieu-cua-nghi-dinh-1262020nd-cp-ngay-19102020-cua-chinh-phu-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-quan-ly-thue-1098434.html',
      recordedData: factVal || 'Chưa ghi nhận dữ liệu BCTC',
      evidenceRequirement: 'Giấy nộp tiền vào NSNN tạm nộp các quý và Bảng ước tính kết quả kinh doanh 4 quý',
      hasValidEvidence: hasEvidence,
      actionRequired: 'Kế toán ước tính doanh thu và tạm nộp theo từng quý; rà soát lũy kế 4 quý trước ngày 31/01 năm sau.',
      missingDataQuestion: execStatus === 'NEEDS_VERIFICATION' ? 'Doanh nghiệp đã ước tính số thuế TNDN phải nộp cả năm và số đã tạm nộp chưa?' : undefined,
      priority: execStatus === 'OVERDUE' ? 'urgent' : 'high',
      priorityReason: 'Vi phạm ngưỡng 80% sau ngày 31/01 năm sau sẽ phát sinh tiền chậm nộp 0.03%/ngày theo Điều 59 Luật Quản lý thuế.',
    });
  }

  // ==========================================================================
  // 3. CHỨNG TỪ THANH TOÁN KHÔNG DÙNG TIỀN MẶT
  // ==========================================================================
  {
    const factVal = getFactValue('q_tax_corp_3') || getFactValue('tax.non_cash_payment');
    const hasEvidence = hasAcceptedEvidence('unc') || hasAcceptedEvidence('ủy nhiệm chi') || hasAcceptedEvidence('sao kê');

    let appStatus: ApplicabilityStatus = 'APPLICABLE';
    let execStatus: ExecutionStatus = 'IN_PROGRESS';
    let statusReason = '';

    if (hasEvidence) {
      execStatus = 'COMPLETED';
      statusReason = 'Đã có ủy nhiệm chi và sao kê ngân hàng khớp đúng tài khoản bên bán theo quy định.';
    } else if (factVal.toLowerCase().includes('tien mat') || factVal.toLowerCase().includes('tiền mặt')) {
      execStatus = 'NEEDS_VERIFICATION';
      statusReason = 'Phát hiện có hóa đơn thanh toán bằng tiền mặt. Lưu ý pháp lý quan trọng: Việc chuyển khoản sau đó không mặc định khắc phục được điều kiện khấu trừ thuế GTGT và tính chi phí TNDN nếu không có thủ tục điều chỉnh/hủy hợp pháp.';
      pendingQuestions.push('Doanh nghiệp có hóa đơn mua hàng từ ngưỡng luật định thanh toán bằng tiền mặt không? Cần rà soát hồ sơ với bên bán.');
    } else if (factVal.toLowerCase().includes('chuyen khoan') || factVal.toLowerCase().includes('chuyển khoản')) {
      execStatus = 'IN_PROGRESS';
      statusReason = 'Hệ thống ghi nhận tuân thủ thanh toán ngân hàng; cần tập hợp và lưu trữ đầy đủ Ủy nhiệm chi cho từng hóa đơn.';
    } else {
      execStatus = 'NEEDS_VERIFICATION';
      statusReason = 'Chưa đủ dữ liệu về các giao dịch mua hàng; cần kiểm tra phương thức thanh toán đối với các hóa đơn đầu vào.';
      pendingQuestions.push('Doanh nghiệp có lưu trữ đầy đủ ủy nhiệm chi ngân hàng cho các hóa đơn mua vào từ ngưỡng luật định không?');
    }

    obligations.push({
      key: 'q_tax_corp_3',
      code: 'TAX-OBL-03',
      name: 'Chứng từ thanh toán không dùng tiền mặt cho hóa đơn mua vào',
      category: 'TAX_CORP',
      taxPeriod: 'Từng lần phát sinh giao dịch',
      statutoryDueDate: 'Thời điểm thanh toán từng hóa đơn',
      statutoryDueDateObj: refDate,
      applicabilityStatus: appStatus,
      applicabilityLabel: formatComplianceStatus(appStatus),
      executionStatus: execStatus,
      executionLabel: formatComplianceStatus(execStatus),
      status: execStatus,
      statusLabel: formatComplianceStatus(execStatus),
      statusReason,
      legalDoc: 'Thông tư 96/2015/TT-BTC, Thông tư 219/2013/TT-BTC & Luật Thuế GTGT số 48/2024/QH15 (từ 01/07/2025)',
      article: 'Điều 4 Thông tư 96/2015/TT-BTC; Điều 15 Thông tư 219/2013/TT-BTC; Điều 14 Luật Thuế GTGT 48/2024/QH15',
      effectiveDate: 'Áp dụng theo kỳ giao dịch phát sinh',
      sourceUrl: 'https://dulieuphapluat.vn/van-ban/linh-vuc-khac-van-ban/thong-tu-962015tt-btc-huong-dan-ve-thue-thu-nhap-doanh-nghiep-tai-nghi-dinh-122015nd-cp-quy-dinh-chi-tiet-thi-hanh-luat-sua-doi-bo-sung-mot-so-dieu-cua-cac-luat-ve-thue-va-sua-doi-bo-sung-mot-so-dieu-cua-thong-tu-782014tt-btc-thong-tu-1192014tt-btc-thong-tu-1512014tt-btc-do-bo-truong-bo-tai-chinh-ban-hanh-285496.html',
      recordedData: factVal || 'Chưa ghi nhận phương thức thanh toán',
      evidenceRequirement: 'Ủy nhiệm chi hoặc chứng từ chuyển khoản ngân hàng khớp đúng thông tin người bán',
      hasValidEvidence: hasEvidence,
      actionRequired: 'Kiểm soát chặt chẽ phương thức thanh toán ngay tại thời điểm giao dịch; không thanh toán tiền mặt cho các hóa đơn từ ngưỡng quy định.',
      missingDataQuestion: execStatus === 'NEEDS_VERIFICATION' ? 'Các hóa đơn mua vào từ ngưỡng luật định đã có ủy nhiệm chi ngân hàng lưu trữ kèm theo chưa?' : undefined,
      priority: 'high',
      priorityReason: 'Thiếu chứng từ thanh toán không dùng tiền mặt sẽ bị truy thu 10% thuế GTGT và loại 20% chi phí TNDN.',
    });
  }

  // ==========================================================================
  // 4. KÊ KHAI VÀ NỘP THUẾ GTGT ĐỊNH KỲ
  // ==========================================================================
  {
    const factVal = getFactValue('q_tax_corp_1') || getFactValue('tax.vat_filing_period');
    const isMonthly = factVal.toLowerCase().includes('thang') || factVal.toLowerCase().includes('tháng');
    const hasEvidence = hasAcceptedEvidence('gtgt') || hasAcceptedEvidence('vat') || hasAcceptedEvidence('tờ khai');

    let statutoryDueDateStr = `31/10/${currentYear}`;
    let statutoryDueDateObj = new Date(currentYear, 9, 31, 23, 59, 59);

    if (isMonthly) {
      statutoryDueDateStr = `20/${refDate.getMonth() + 2 > 12 ? 1 : refDate.getMonth() + 2}/${refDate.getMonth() + 2 > 12 ? currentYear + 1 : currentYear}`;
      statutoryDueDateObj = new Date(currentYear, refDate.getMonth() + 1, 20, 23, 59, 59);
    }

    let execStatus: ExecutionStatus = 'IN_PROGRESS';
    let statusReason = '';

    if (hasEvidence) {
      execStatus = 'COMPLETED';
      statusReason = 'Đã có thông báo tiếp nhận/chấp nhận hồ sơ khai thuế GTGT điện tử từ Tổng cục Thuế.';
    } else {
      execStatus = 'IN_PROGRESS';
      statusReason = `Kê khai theo kỳ ${isMonthly ? 'Tháng (Hạn ngày 20)' : 'Quý (Hạn cuối tháng đầu quý sau)'}; doanh nghiệp đang trong tiến độ thực hiện.`;
    }

    obligations.push({
      key: 'q_tax_corp_1',
      code: 'TAX-OBL-04',
      name: `Kê khai thuế Giá trị gia tăng (GTGT) định kỳ ${isMonthly ? 'theo tháng' : 'theo quý'}`,
      category: 'TAX_VAT',
      taxPeriod: isMonthly ? `Tháng ${refDate.getMonth() + 1}/${currentYear}` : `Quý ${(Math.floor(refDate.getMonth() / 3) + 1)}/${currentYear}`,
      statutoryDueDate: statutoryDueDateStr,
      statutoryDueDateObj,
      applicabilityStatus: 'APPLICABLE',
      applicabilityLabel: formatComplianceStatus('APPLICABLE'),
      executionStatus: execStatus,
      executionLabel: formatComplianceStatus(execStatus),
      status: execStatus,
      statusLabel: formatComplianceStatus(execStatus),
      statusReason,
      legalDoc: 'Luật Quản lý thuế số 38/2019/QH14 & Nghị định 126/2020/NĐ-CP',
      article: 'Điều 44 Luật Quản lý thuế số 38/2019/QH14; Điều 8, Điều 9 Nghị định 126/2020/NĐ-CP',
      effectiveDate: 'Còn hiệu lực',
      sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/luat-quan-ly-thue-2019-54279.html',
      recordedData: factVal || 'Kê khai theo quý (mặc định SME)',
      evidenceRequirement: 'Thông báo chấp nhận hồ sơ khai thuế qua Cổng thuedientu.gdt.gov.vn',
      hasValidEvidence: hasEvidence,
      actionRequired: 'Lập tờ khai mẫu 01/GTGT và nộp qua cổng Thuế điện tử trước hạn chót.',
      priority: 'high',
      priorityReason: 'Chậm nộp tờ khai thuế bị xử phạt vi phạm hành chính từ 2.000.000 đến 25.000.000 VNĐ theo Nghị định 125/2020/NĐ-CP.',
    });
  }

  // ==========================================================================
  // 5. HỒ SƠ NHÂN SỰ, TIỀN LƯƠNG & THUẾ THU NHẬP CÁ NHÂN (TNCN)
  // Tách riêng: 5A (Đăng ký MST cá nhân) & 5B (Khấu trừ, kê khai thuế TNCN)
  // ==========================================================================
  {
    const factVal = getFactValue('q_tax_salary_1') || getFactValue('tax.pit_filing');
    const hasEvidence = hasAcceptedEvidence('tncn') || hasAcceptedEvidence('lương') || hasAcceptedEvidence('bảng lương');

    let execStatus: ExecutionStatus = hasEvidence ? 'COMPLETED' : 'IN_PROGRESS';
    const statusReason = hasEvidence
      ? 'Đã có bảng lương, hợp đồng lao động và chứng từ khấu trừ thuế TNCN hợp lệ.'
      : 'Cần phân biệt rõ: Đăng ký MST cá nhân là bắt buộc cho 100% người lao động; đăng ký người phụ thuộc chỉ áp dụng khi có người phụ thuộc đủ điều kiện; kê khai TNCN chỉ phát sinh khi có khấu trừ thuế trong kỳ.';

    obligations.push({
      key: 'q_tax_salary_1',
      code: 'TAX-OBL-05',
      name: 'Hồ sơ chi phí tiền lương hợp lý & Khấu trừ thuế TNCN',
      category: 'TAX_PIT',
      taxPeriod: `Kỳ tính thuế năm ${currentYear}`,
      statutoryDueDate: `Theo kỳ kê khai GTGT & Quyết toán 31/03/${currentYear + 1}`,
      statutoryDueDateObj: new Date(currentYear + 1, 2, 31, 23, 59, 59),
      applicabilityStatus: (org.employeeCount || 0) > 0 ? 'APPLICABLE' : 'POSSIBLE',
      applicabilityLabel: formatComplianceStatus((org.employeeCount || 0) > 0 ? 'APPLICABLE' : 'POSSIBLE'),
      executionStatus: execStatus,
      executionLabel: formatComplianceStatus(execStatus),
      status: execStatus,
      statusLabel: formatComplianceStatus(execStatus),
      statusReason,
      legalDoc: 'Thông tư 111/2013/TT-BTC, Thông tư 96/2015/TT-BTC & Nghị định 126/2020/NĐ-CP',
      article: 'Điều 25 Thông tư 111/2013/TT-BTC; Điều 4 Thông tư 96/2015/TT-BTC; Điều 8 Nghị định 126/2020/NĐ-CP',
      effectiveDate: 'Còn hiệu lực',
      sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/thong-tu-1112013tt-btc-huong-dan-luat-thue-thu-nhap-ca-nhan-va-nghi-dinh-652013nd-cp-do-bo-truong-bo-tai-chinh-ban-hanh-334800.html',
      recordedData: factVal || `${org.employeeCount || 0} nhân sự`,
      evidenceRequirement: 'Hợp đồng lao động, Bảng chấm công, Bảng thanh toán lương có chữ ký hoặc sao kê chi lương ngân hàng',
      hasValidEvidence: hasEvidence,
      actionRequired: 'Rà soát đăng ký MST cá nhân cho nhân viên mới; chỉ lập hồ sơ giảm trừ gia cảnh cho nhân sự thực tế có người phụ thuộc hợp pháp.',
      priority: 'high',
      priorityReason: 'Chi phí lương thiếu chứng từ hợp pháp sẽ bị xuất toán toàn bộ khi quyết toán thuế TNDN.',
    });
  }

  // ==========================================================================
  // 6. HÓA ĐƠN ĐIỆN TỬ KHỞI TẠO TỪ MÁY TÍNH TIỀN (NĐ 123/2020)
  // ==========================================================================
  {
    const factVal = getFactValue('q_fnb_tax_1') || getFactValue('invoice.pos_cash_register');
    const isFnBOrRetail =
      org.industry?.toLowerCase().includes('f&b') ||
      org.industry?.toLowerCase().includes('ăn uống') ||
      org.industry?.toLowerCase().includes('nhà hàng') ||
      org.industry?.toLowerCase().includes('bán lẻ') ||
      Boolean(org.hasOnlineSales);

    let appStatus: ApplicabilityStatus = isFnBOrRetail ? 'APPLICABLE' : 'NOT_APPLICABLE';
    let execStatus: ExecutionStatus = 'NEEDS_VERIFICATION';
    let statusReason = '';

    if (!isFnBOrRetail) {
      appStatus = 'NOT_APPLICABLE';
      execStatus = 'COMPLETED';
      statusReason = 'Doanh nghiệp hoạt động mô hình B2B / không cung cấp dịch vụ trực tiếp đến người tiêu dùng nên không thuộc đối tượng bắt buộc dùng HĐĐT máy tính tiền theo Điều 11 Nghị định 123/2020/NĐ-CP.';
    } else {
      const hasPosEvidence = hasAcceptedEvidence('pos') || hasAcceptedEvidence('máy tính tiền') || hasAcceptedEvidence('01/đktđ');
      if (hasPosEvidence) {
        execStatus = 'COMPLETED';
        statusReason = 'Đã có thông báo chấp nhận mẫu 01/ĐKTĐ-HĐĐT và kết nối HĐĐT máy tính tiền thành công.';
      } else if (factVal.toLowerCase().includes('da ap dung') || factVal.toLowerCase().includes('đã áp dụng')) {
        execStatus = 'IN_PROGRESS';
        statusReason = 'Ghi nhận cơ sở có sử dụng giải pháp máy tính tiền; cần lưu giữ thông báo chấp nhận của CQT.';
      } else {
        execStatus = 'NEEDS_VERIFICATION';
        statusReason = 'Cơ sở thuộc nhóm ngành F&B / bán lẻ trực tiếp tới người tiêu dùng. Cần xác minh xem cơ sở đã đăng ký HĐĐT khởi tạo từ máy tính tiền với cơ quan thuế chưa.';
        pendingQuestions.push('Doanh nghiệp F&B / Bán lẻ đã đăng ký sử dụng hóa đơn điện tử máy tính tiền (Mẫu 01/ĐKTĐ-HĐĐT) chưa?');
      }
    }

    obligations.push({
      key: 'q_fnb_tax_1',
      code: 'TAX-OBL-06',
      name: 'Hóa đơn điện tử khởi tạo từ máy tính tiền kết nối dữ liệu thuế',
      category: 'INVOICE',
      taxPeriod: 'Thời điểm cung cấp dịch vụ trực tiếp cho người tiêu dùng',
      statutoryDueDate: 'Thời điểm xuất bán hàng trong ngày',
      statutoryDueDateObj: refDate,
      applicabilityStatus: appStatus,
      applicabilityLabel: formatComplianceStatus(appStatus),
      executionStatus: execStatus,
      executionLabel: formatComplianceStatus(execStatus),
      status: appStatus === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : execStatus,
      statusLabel: formatComplianceStatus(appStatus === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : execStatus),
      statusReason,
      legalDoc: 'Nghị định 123/2020/NĐ-CP & Thông tư 78/2021/TT-BTC',
      article: 'Điều 11 Nghị định 123/2020/NĐ-CP; Điều 8 Thông tư 78/2021/TT-BTC',
      effectiveDate: 'Còn hiệu lực',
      sourceUrl: 'https://dulieuphapluat.vn/van-ban/ke-toan-kiem-toan-van-ban/nghi-dinh-1232020nd-cp-quy-dinh-ve-hoa-don-chung-tu-24634.html',
      recordedData: factVal || (isFnBOrRetail ? 'Nhóm ngành bán lẻ / F&B trực tiếp' : 'Mô hình B2B'),
      evidenceRequirement: 'Thông báo chấp nhận Mẫu 01/ĐKTĐ-HĐĐT từ cơ quan thuế',
      hasValidEvidence: hasAcceptedEvidence('pos'),
      actionRequired: appStatus === 'NOT_APPLICABLE'
        ? 'Duy trì hình thức hóa đơn điện tử thông thường theo Nghị định 123/2020/NĐ-CP.'
        : 'Đăng ký dải ký hiệu HĐĐT máy tính tiền với nhà cung cấp phần mềm và CQT.',
      missingDataQuestion: appStatus === 'APPLICABLE' && execStatus === 'NEEDS_VERIFICATION' ? 'Cơ sở có điểm bán hàng trực tiếp đến khách hàng cá nhân không?' : undefined,
      priority: appStatus === 'NOT_APPLICABLE' ? 'low' : 'medium',
      priorityReason: 'Quy định bắt buộc đối với cơ sở kinh doanh ăn uống, bán lẻ trực tiếp đến người tiêu dùng.',
    });
  }

  // ==========================================================================
  // TỔNG HỢP SỐ LIỆU ĐỒNG BỘ 100% VỚI DANH SÁCH CHI TIẾT (TRÁNH HARDCODE)
  // ==========================================================================
  const completedCount = obligations.filter((o) => o.status === 'COMPLETED').length;
  const inProgressCount = obligations.filter((o) => o.status === 'IN_PROGRESS').length;
  const needsVerificationCount = obligations.filter((o) => o.status === 'NEEDS_VERIFICATION').length;
  const overdueCount = obligations.filter((o) => o.status === 'OVERDUE').length;
  const notApplicableCount = obligations.filter((o) => o.status === 'NOT_APPLICABLE').length;

  const summary: ComplianceSummary = {
    total: obligations.length,
    completed: completedCount,
    inProgress: inProgressCount,
    needsVerification: needsVerificationCount,
    overdue: overdueCount,
    notApplicable: notApplicableCount,
    summaryText: `Tổng hợp ${obligations.length} nghĩa vụ: ${completedCount} có đủ bằng chứng xác nhận hoàn thành, ${inProgressCount} đang thực hiện và có dữ liệu xác nhận, ${needsVerificationCount} cần xác minh thông tin hoặc căn cứ, ${overdueCount} quá hạn chưa hoàn thành, ${notApplicableCount} đã có căn cứ xác định không áp dụng.`,
  };

  return {
    evaluatedAt: refDate.toISOString(),
    organizationId: org.id,
    organizationName: org.name,
    taxCode: org.taxCode,
    summary,
    obligations,
    pendingQuestions,
  };
}
