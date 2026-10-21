import {
  evaluateEnterpriseCompliance,
  OrganizationEvaluationInput,
} from '../../common/utils/compliance-evaluation.util';
import { calculateTaxDeadline } from '../../common/utils/tax-deadline.util';
import { extractLegalCitationsFromText } from '../../common/constants/legal-docs.constant';

describe('CELRA Compliance & Statutory Tax Evaluation Engine (10 Mandatory Test Cases)', () => {
  const baseOrg: OrganizationEvaluationInput = {
    id: 'org-test-101',
    name: 'Công ty Cổ phần Dịch vụ F&B Sen Vàng',
    taxCode: '0319988776',
    legalType: 'Công ty Cổ phần',
    industry: 'F&B Nhà hàng & Đồ uống',
    businessModel: 'Bán lẻ & Phục vụ trực tiếp',
    hasOnlineSales: true,
    employeeCount: 12,
    createdAt: new Date('2023-01-15'),
    contextFacts: [],
    evidenceDocuments: [],
  };

  // ==========================================================================
  // Test 1: Doanh nghiệp chưa tải chứng từ lên: không tự kết luận vi phạm
  // ==========================================================================
  it('1. Doanh nghiệp chưa tải chứng từ lên: không tự kết luận vi phạm', () => {
    const org: OrganizationEvaluationInput = {
      ...baseOrg,
      contextFacts: [
        {
          key: 'q_tax_corp_monbai',
          label: 'Lệ phí môn bài',
          currentValue: 'Đã nộp theo tờ khai đầu năm',
          status: 'unconfirmed',
        },
      ],
      evidenceDocuments: [], // Không có chứng từ đính kèm
    };

    const report = evaluateEnterpriseCompliance(org, new Date('2026-01-20'));
    const monBai = report.obligations.find((o) => o.key === 'q_tax_corp_monbai');

    expect(monBai).toBeDefined();
    // Không được kết luận vi phạm hoặc overdue khi chưa đủ chứng cứ
    expect(monBai?.status).not.toBe('OVERDUE');
    expect(monBai?.statusReason).not.toMatch(/vi phạm|xử phạt ngay/i);
    expect(monBai?.statusReason).toContain('cần đối chiếu');
  });

  // ==========================================================================
  // Test 2: Nghĩa vụ đã áp dụng, đã quá hạn và có bằng chứng chưa hoàn thành: đánh giá quá hạn đúng quy tắc
  // ==========================================================================
  it('2. Nghĩa vụ đã áp dụng, đã quá hạn và có ghi nhận chưa hoàn thành: đánh giá OVERDUE chính xác', () => {
    const org: OrganizationEvaluationInput = {
      ...baseOrg,
      createdAt: new Date('2024-01-01'), // DN thành lập từ 2024, không được miễn 2026
      contextFacts: [
        {
          key: 'q_tax_corp_monbai',
          label: 'Lệ phí môn bài',
          currentValue: 'Chưa nộp tiền vào ngân sách',
          status: 'confirmed',
        },
      ],
      evidenceDocuments: [],
    };

    // Đánh giá tại thời điểm 15/03/2026 (sau hạn 30/01/2026)
    const report = evaluateEnterpriseCompliance(org, new Date('2026-03-15'));
    const monBai = report.obligations.find((o) => o.key === 'q_tax_corp_monbai');

    expect(monBai?.status).toBe('OVERDUE');
    expect(monBai?.executionStatus).toBe('OVERDUE');
    expect(monBai?.statusReason).toContain('Đã quá hạn ngày 30/01/2026');
  });

  // ==========================================================================
  // Test 3: Nghĩa vụ đã hoàn thành và có bằng chứng: trạng thái hoàn thành chính xác
  // ==========================================================================
  it('3. Nghĩa vụ đã hoàn thành và có bằng chứng hợp lệ: đánh giá COMPLETED', () => {
    const org: OrganizationEvaluationInput = {
      ...baseOrg,
      evidenceDocuments: [
        {
          status: 'accepted',
          category: 'mon_bai',
          fileName: 'giay_nop_tien_mon_bai_2026.pdf',
        },
      ],
    };

    const report = evaluateEnterpriseCompliance(org, new Date('2026-02-10'));
    const monBai = report.obligations.find((o) => o.key === 'q_tax_corp_monbai');

    expect(monBai?.status).toBe('COMPLETED');
    expect(monBai?.hasValidEvidence).toBe(true);
    expect(monBai?.statusReason).toContain('Đã có chứng từ nộp NSNN hợp lệ');
  });

  // ==========================================================================
  // Test 4: Nghĩa vụ chưa xác định được tính áp dụng: yêu cầu xác minh
  // ==========================================================================
  it('4. Nghĩa vụ chưa xác định được tính áp dụng: đưa vào trạng thái xác minh', () => {
    const b2bOrg: OrganizationEvaluationInput = {
      ...baseOrg,
      industry: 'Tư vấn giải pháp phần mềm B2B',
      businessModel: 'B2B Doanh nghiệp thuần túy',
      hasOnlineSales: false,
    };

    const report = evaluateEnterpriseCompliance(b2bOrg, new Date('2026-05-10'));
    const posInvoice = report.obligations.find((o) => o.key === 'q_fnb_tax_1');

    expect(posInvoice).toBeDefined();
    // B2B thuần túy không thuộc diện bắt buộc áp dụng HĐĐT máy tính tiền theo NĐ 123/2020
    expect(posInvoice?.applicabilityStatus).toBe('NOT_APPLICABLE');
    expect(posInvoice?.statusReason).toContain('không thuộc đối tượng bắt buộc');
  });

  // ==========================================================================
  // Test 5: Kỳ tính thuế khác nhau: không dùng chung một hạn chót
  // ==========================================================================
  it('5. Kỳ tính thuế khác nhau: không dùng chung một hạn chót (TNDN không mặc định 30/10)', () => {
    const refDate = new Date('2026-06-15');
    const monBaiDue = calculateTaxDeadline('MON_BAI', refDate);
    const tndnQuarterlyDue = calculateTaxDeadline('TNDN_80', refDate);
    const vatQuarterlyDue = calculateTaxDeadline('GTGT', refDate);

    // Môn bài hạn năm 2027 (vì đã qua 30/01/2026)
    expect(monBaiDue.getFullYear()).toBe(2027);
    expect(monBaiDue.getMonth()).toBe(0); // Tháng 1

    // TNDN quý 2 hạn 31/07/2026 (không phải 30/10)
    expect(tndnQuarterlyDue.getMonth()).toBe(6); // Tháng 7
    expect(tndnQuarterlyDue.getDate()).toBe(31);
    expect(vatQuarterlyDue.getMonth()).toBe(6);
    expect(vatQuarterlyDue.getDate()).toBe(31);
    // Đánh giá TNDN 80% theo luật: Hạn chót đạt tỷ lệ 80% cả năm là 31/01 năm sau
    const report = evaluateEnterpriseCompliance(baseOrg, refDate);
    const tndn = report.obligations.find((o) => o.key === 'q_tax_corp_2');
    expect(tndn?.statutoryDueDate).toBe('31/01/2027');
  });

  // ==========================================================================
  // Test 6: Văn bản pháp luật thay đổi hiệu lực: phân biệt kỳ trước và sau 01/07/2025
  // ==========================================================================
  it('6. Văn bản pháp luật thay đổi hiệu lực: ghi nhận Luật Thuế GTGT 48/2024/QH15 có hiệu lực từ 01/07/2025', () => {
    const report = evaluateEnterpriseCompliance(baseOrg, new Date('2026-08-01'));
    const nonCash = report.obligations.find((o) => o.key === 'q_tax_corp_3');

    expect(nonCash?.legalDoc).toContain('Luật Thuế GTGT số 48/2024/QH15');
    expect(nonCash?.article).toContain('Điều 14 Luật Thuế GTGT 48/2024/QH15');
    expect(nonCash?.effectiveDate).toBe('Áp dụng theo kỳ giao dịch phát sinh');
  });

  // ==========================================================================
  // Test 7: Tổng số lượng trạng thái phải khớp danh sách nghĩa vụ
  // ==========================================================================
  it('7. Tổng số lượng trạng thái phải khớp chính xác 100% với danh sách nghĩa vụ', () => {
    const report = evaluateEnterpriseCompliance(baseOrg, new Date('2026-04-15'));
    const { total, completed, inProgress, needsVerification, overdue, notApplicable } = report.summary;

    expect(total).toBe(report.obligations.length);
    expect(total).toBe(completed + inProgress + needsVerification + overdue + notApplicable);
  });

  // ==========================================================================
  // Test 8: Thiếu dữ liệu để tính thuế hoặc tiền chậm nộp: không tự sinh số tiền
  // ==========================================================================
  it('8. Thiếu dữ liệu để tính thuế hoặc tiền chậm nộp: không tự sinh số tiền phạt hoặc chậm nộp', () => {
    const orgWithoutFinancials: OrganizationEvaluationInput = {
      ...baseOrg,
      contextFacts: [
        {
          key: 'q_tax_corp_2',
          label: 'Tạm nộp TNDN',
          currentValue: 'Chưa có số liệu kế toán',
          status: 'unconfirmed',
        },
      ],
      evidenceDocuments: [],
    };

    // Đánh giá sau 31/01/2027 đối với kỳ tính thuế 2026 nhưng không có dữ liệu số thuế phát sinh
    const report = evaluateEnterpriseCompliance(orgWithoutFinancials, new Date('2027-02-15'), { taxYear: 2026 });
    const tndn = report.obligations.find((o) => o.key === 'q_tax_corp_2');

    expect(tndn?.statusReason).toContain('không tự sinh số tiền chậm nộp khi thiếu dữ liệu');
  });

  // ==========================================================================
  // Test 9: Giao dịch thanh toán tiền mặt: không mặc định rằng chuyển khoản sau đó sẽ khắc phục
  // ==========================================================================
  it('9. Giao dịch thanh toán tiền mặt: cảnh báo chuyển khoản sau không mặc định hợp lệ hóa thuế', () => {
    const orgWithCashPayment: OrganizationEvaluationInput = {
      ...baseOrg,
      contextFacts: [
        {
          key: 'q_tax_corp_3',
          label: 'Chứng từ thanh toán',
          currentValue: 'Có một số khoản chi trên 20 triệu đã trả bằng tiền mặt',
          status: 'confirmed',
        },
      ],
    };

    const report = evaluateEnterpriseCompliance(orgWithCashPayment, new Date('2026-07-20'));
    const nonCash = report.obligations.find((o) => o.key === 'q_tax_corp_3');

    expect(nonCash?.statusReason).toContain('không mặc định khắc phục được điều kiện');
  });

  // ==========================================================================
  // Test 10: Nguồn pháp lý không truy xuất được: không tạo điều khoản hoặc đường dẫn giả
  // ==========================================================================
  it('10. Nguồn pháp lý chính thức: toàn bộ trích dẫn phải thuộc danh mục văn bản thật', () => {
    const report = evaluateEnterpriseCompliance(baseOrg, new Date('2026-09-10'));

    for (const obligation of report.obligations) {
      expect(obligation.legalDoc).toBeTruthy();
      expect(obligation.article).toBeTruthy();
      expect(obligation.sourceUrl).toMatch(/^https:\/\/dulieuphapluat\.vn/);
      // Tuyệt đối không chứa số hiệu giả tưởng ví dụ 252/2026
      expect(obligation.legalDoc).not.toContain('252/2026');
      expect(obligation.sourceUrl).not.toContain('2522026');
    }
  });

  // ==========================================================================
  // Test 11: Căn cứ pháp lý không fix cứng & extractLegalCitationsFromText chuẩn mực
  // ==========================================================================
  it('11. Căn cứ pháp lý không fix cứng: extractLegalCitationsFromText không bị cụt và không bắt chữ luật v', () => {
    const rawAiText = `Theo quy định của pháp luật về thuế, doanh nghiệp cần tạm nộp thuế theo Nghị định 91/2022/NĐ-CP và Luật Quản lý thuế số 38/2019/QH14. Ngoài ra luật và các văn bản hướng dẫn khác cũng quy định tương tự.`;
    const citations = extractLegalCitationsFromText(rawAiText);

    expect(citations.length).toBe(2);
    // Không bao giờ dính "luật v"
    expect(citations.some((c) => c.title.toLowerCase().includes('luật v'))).toBe(false);
    // Không bao giờ bị cụt "Nghị định 91/2022/N"
    const decree91 = citations.find((c) => c.docNumber.includes('91/2022'));
    expect(decree91).toBeDefined();
    expect(decree91?.docNumber).toBe('91/2022/NĐ-CP');
    expect(decree91?.title).toContain('Nghị định 91/2022/NĐ-CP');
  });
});
