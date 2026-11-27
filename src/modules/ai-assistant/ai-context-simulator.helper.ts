import { Logger } from '@nestjs/common';
import { ContextGroup, ContextStatus, TaskStatus } from '@prisma/client';
import { CORE_LEGAL_DOC_LINKS } from '../../common/constants/legal-docs.constant';
import { evaluateEnterpriseCompliance } from '../../common/utils/compliance-evaluation.util';
import { normalizeVietnameseText, type CitFinancialSnapshot } from './ai-domain.helper';

/**
 * Xử lý sự kiện xác nhận tình huống giả sử từ Chat (in-memory overlay, KHÔNG ghi đè DB).
 */
export function simulateHypotheticalChatConfirmation(
  orgId: string,
  org: any,
  rawMessage: string,
  logger: Logger,
) {
  const confirmText = rawMessage.replace(/^(xac nhan thong tin:|xác nhận thông tin:)\s*/i, '').trim();
  const updatedFactLabels: string[] = [];

  const simulatedFacts = (org.contextFacts || []).map((f: any) => ({ ...f }));
  const simulatedOrg = { ...org, contextFacts: simulatedFacts };

  const simulateFact = (key: string, label: string, group: ContextGroup, value: string) => {
    const existing = simulatedFacts.find((f: any) => f.key === key);
    if (existing) {
      existing.currentValue = value;
      existing.status = ContextStatus.confirmed;
    } else {
      simulatedFacts.push({
        id: `sim-${Date.now()}-${key}`,
        organizationId: orgId,
        key,
        label,
        group,
        currentValue: value,
        source: 'chatbox_hypothetical',
        providedBy: 'Chủ doanh nghiệp (Tình huống giả sử qua chat)',
        providedAt: new Date(),
        status: ContextStatus.confirmed,
        confirmedBy: null,
        affectedRules: [],
        conflictDetails: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    updatedFactLabels.push(`${label}: "${value}"`);
  };

  if (/(mon bai|môn bài)/i.test(confirmText)) {
    let monBaiVal = 'Đã nộp đầy đủ vào NSNN';
    if (/(chua nop|chưa nộp)/i.test(confirmText)) {
      monBaiVal = 'Chưa nộp tiền vào ngân sách';
    } else if (/(moi thanh lap|mới thành lập|mien|miễn)/i.test(confirmText)) {
      monBaiVal = 'Mới thành lập (miễn lệ phí môn bài năm đầu)';
    }
    simulateFact('q_tax_corp_monbai', 'Lệ phí môn bài', ContextGroup.thue_ke_toan, monBaiVal);
  }

  if (/(tndn|tam nop|tạm nộp)/i.test(confirmText)) {
    let tndnVal = 'Đã tạm nộp đạt trên 80% số thuế TNDN cả năm';
    if (/(chua thuc hien|chưa thực hiện|chua nop|chưa nộp)/i.test(confirmText)) {
      tndnVal = 'Chưa thực hiện tạm nộp thuế TNDN';
    } else if (/(chua co lai|chưa có lãi|khong lai|không phát sinh)/i.test(confirmText)) {
      tndnVal = 'Chưa có lãi (không phát sinh thuế TNDN phải nộp)';
    } else if (/(dang chuan bi|đang chuẩn bị)/i.test(confirmText)) {
      tndnVal = 'Đang chuẩn bị số liệu kế toán và nộp tạm tính';
    }
    simulateFact('q_tax_corp_2', 'Tạm nộp thuế TNDN (80%)', ContextGroup.thue_ke_toan, tndnVal);
  }

  if (
    /(tien mat|tiền mặt|chuyen khoan|chuyển khoản|ngan hang|ngân hàng|20 trieu|20 triệu|uy nhiem chi|ủy nhiệm chi)/i.test(
      confirmText,
    )
  ) {
    let nonCashVal = '100% chuyển khoản ngân hàng có đầy đủ Ủy nhiệm chi';
    if (/(tien mat|tiền mặt)/i.test(confirmText) && /(co|có|da tra|đã trả)/i.test(confirmText)) {
      nonCashVal = 'Có hóa đơn trên 20 triệu đã thanh toán bằng tiền mặt';
    } else if (/(chua doi chieu|đang đối chiếu)/i.test(confirmText)) {
      nonCashVal = 'Đang đối chiếu sao kê và ủy nhiệm chi ngân hàng';
    }
    simulateFact('q_tax_corp_3', 'Thanh toán không dùng tiền mặt', ContextGroup.thue_ke_toan, nonCashVal);
  }

  if (
    /(may tinh tien|máy tính tiền|ban hang truc tiep|bán hàng trực tiếp|pos|ban le|bán lẻ|nguoi tieu dung|người tiêu dùng)/i.test(
      confirmText,
    )
  ) {
    const isYes = /có|co bán hàng|có áp dụng/i.test(confirmText);
    const isNo = /không|khong bán hàng|không áp dụng|b2b/i.test(confirmText);
    const posVal = isYes
      ? 'Có bán hàng trực tiếp (Bắt buộc HĐĐT máy tính tiền)'
      : isNo
        ? 'Không bán hàng trực tiếp đến người tiêu dùng (Áp dụng HĐĐT thông thường)'
        : 'Chưa xác định rõ hình thức bán hàng trực tiếp';
    simulateFact('q_fnb_tax_1', 'Hóa đơn điện tử máy tính tiền', ContextGroup.thue_ke_toan, posVal);
    if (isYes || isNo) {
      simulatedOrg.hasOnlineSales = isYes;
    }
  }

  if (/(gtgt|vat|ky ke khai|kỳ kê khai)/i.test(confirmText)) {
    const isMonth = /(thang|tháng)/i.test(confirmText);
    const gtgtVal = isMonth
      ? 'Kê khai thuế GTGT định kỳ theo tháng'
      : 'Kê khai thuế GTGT định kỳ theo quý';
    simulateFact('q_tax_corp_1', 'Kê khai thuế GTGT định kỳ', ContextGroup.thue_ke_toan, gtgtVal);
  }

  if (/(luong|lương|nhan su|nhân sự|tncn|mst ca nhan|mst cá nhân)/i.test(confirmText)) {
    let salaryVal = 'Đã hoàn thiện MST cá nhân và hồ sơ chi phí lương';
    if (/(chua ky|chưa ký|chua co mst|chưa có mst)/i.test(confirmText)) {
      salaryVal = 'Chưa hoàn thiện MST cá nhân cho người lao động';
    } else if (/(dang lam|đang hoàn thiện)/i.test(confirmText)) {
      salaryVal = 'Đang hoàn thiện đăng ký MST cá nhân cho nhân viên';
    }
    simulateFact('q_tax_salary_1', 'Hồ sơ chi phí tiền lương được trừ TNDN', ContextGroup.thue_ke_toan, salaryVal);
  }

  logger.log(
    `[VERIFICATION SIMULATED] Đã mô phỏng ${updatedFactLabels.length} dữ kiện mới cho tình huống giả sử. Bắt đầu phân tích lại...`,
  );

  const updatedAudit = evaluateEnterpriseCompliance(simulatedOrg, new Date());
  const reSummary = updatedAudit.summary;

  const reanalyzedReply =
    `**BÁO CÁO PHÂN TÍCH LẠI TUÂN THỦ THUẾ THEO TÌNH HUỐNG GIẢ SỬ:**\n\n` +
    `1. **Tổng quan**: Đã cập nhật phân tích theo tình huống giả định; tổng hợp ${reSummary.total} nghĩa vụ: ${reSummary.completed} hoàn thành có minh chứng, ${reSummary.inProgress} đang thực hiện, ${reSummary.needsVerification} cần xác minh thêm, ${reSummary.overdue} quá hạn.\n\n` +
    `2. **Kết luận**: Đã tiếp nhận và đối chiếu thành công các thông tin xác minh mới (${updatedFactLabels.length > 0 ? updatedFactLabels.join(', ') : confirmText}). Tình trạng tuân thủ của doanh nghiệp đã được phân tích lại tương ứng.\n\n` +
    `3. **Nghĩa vụ áp dụng**:\n` +
    updatedAudit.obligations
      .map((o) => `- **${o.name}**: ${o.statusLabel} (Phạm vi: ${o.applicabilityLabel}).`)
      .join('\n') +
    `\n\n` +
    `4. **Căn cứ pháp lý**: Luật Quản lý thuế số 38/2019/QH14, Nghị định 126/2020/NĐ-CP, Nghị định 91/2022/NĐ-CP, Nghị định 123/2020/NĐ-CP và các văn bản liên quan.\n\n` +
    `5. **Dữ liệu đầu vào**: Tình huống giả sử được đưa ra trong hội thoại để tham khảo tư vấn tuân thủ (hệ thống không tự ý ghi đè vào hồ sơ chính thức của doanh nghiệp).\n\n` +
    `6. **Kỳ và thời hạn**: Các nghĩa vụ tiếp tục được theo dõi theo đúng hạn pháp định (Môn bài 30/01, TNDN 80% chốt 31/01 năm sau, GTGT theo quý/tháng).\n\n` +
    `7. **Bằng chứng còn thiếu**: Để chuyển các nghĩa vụ từ đang thực hiện sang hoàn thành (COMPLETED), doanh nghiệp cần tải lên các chứng từ gốc: Giấy nộp tiền NSNN, thông báo chấp nhận mẫu 01/ĐKTĐ-HĐĐT, Ủy nhiệm chi ngân hàng.\n\n` +
    `8. **Rủi ro**: Các nghĩa vụ đã được xác minh rõ ràng giúp loại bỏ rủi ro xử phạt do thiếu thông tin. Cần lưu ý duy trì chứng từ thanh toán ngân hàng và nộp thuế đúng hạn.\n\n` +
    `9. **Hành động tiếp theo**:\n` +
    `- 1. Lưu trữ và phân loại các chứng từ nộp NSNN theo từng quý.\n` +
    `- 2. Kiểm tra lại kỳ kê khai tiếp theo trước ngày 25 của tháng đến hạn.\n\n` +
    (updatedAudit.pendingQuestions.length > 0
      ? `10. **Câu hỏi xác minh**: ${updatedAudit.pendingQuestions[0]}`
      : `10. **Câu hỏi xác minh**: Doanh nghiệp đã giải quyết toàn bộ các điểm chưa rõ trọng yếu. Bạn có cần hướng dẫn chi tiết về thủ tục nộp thuế nào khác không?`);

  return {
    messageId: `msg-${Date.now()}`,
    sender: 'assistant',
    content: reanalyzedReply,
    answer: reanalyzedReply,
    actionType: 'enterprise_audit' as const,
    isEnterpriseQuery: true,
    verificationChecklist: updatedAudit.verificationChecklist,
    citations: [
      {
        title: 'Luật Quản lý thuế số 38/2019/QH14',
        docNumber: '38/2019/QH14',
        articleNumber: 'Điều 44, Điều 59',
        sourceUrl: CORE_LEGAL_DOC_LINKS['38/2019'],
      },
      {
        title: 'Nghị định 126/2020/NĐ-CP hướng dẫn Luật Quản lý thuế',
        docNumber: '126/2020/NĐ-CP',
        articleNumber: 'Điều 8, Điều 18',
        sourceUrl: CORE_LEGAL_DOC_LINKS['126/2020'],
      },
    ],
    confidenceLevel: 'high',
    confidenceReason:
      'Mô phỏng phân tích tuân thủ theo tình huống giả định của người dùng (không thay đổi cơ sở dữ liệu doanh nghiệp)',
    proposedChecklists: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Phân loại intent (doanh nghiệp vs luật chung) và nén dữ liệu thực tế thành Dense Context gửi LLM.
 */
export function buildEnterpriseDenseContext(
  org: any,
  normalized: string,
  fin: CitFinancialSnapshot,
  tasks: Array<{ status: TaskStatus; dueDate?: Date | null }>,
) {
  const factScores = (org.contextFacts || []).map((f: any) => {
    let score = 0;
    const nLabel = normalizeVietnameseText(f.label);
    const nValue = normalizeVietnameseText(f.currentValue);
    const nKey = normalizeVietnameseText(f.key);
    if (nLabel && normalized.includes(nLabel)) score += 3;
    if (nValue && normalized.includes(nValue)) score += 2;
    if (nKey && normalized.includes(nKey)) score += 1;
    for (const word of nLabel.split(' ')) {
      if (word.length > 3 && normalized.includes(word)) score += 0.5;
    }
    return { fact: f, score };
  });

  const relevantFacts = factScores
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 6)
    .map((x: any) => x.fact);

  const isDocAuditQuery =
    /(thieu tai lieu|thieu ho so|thieu chung tu|thieu gi|can bo sung gi|con thieu|chua lam|chua hoan thanh|can bo sung tai lieu|chua nop|chua thuc hien)/i.test(
      normalized,
    );
  const isSelfOrgSubject = /(toi|minh|chung toi|cua toi|cong ty|doanh nghiep|dn)/i.test(normalized);
  const isExplicitEnterpriseRef =
    /(doanh nghiep|cong ty|don vi|ben|tiem|quan|shop|ho kinh doanh)\s*(toi|em|minh|chung toi|cua toi|cua em|nay)/i.test(
      normalized,
    ) ||
    /(cho toi|cho em|giup toi|giup em)\s*.*(cong ty|doanh nghiep)/i.test(normalized) ||
    /(cong ty|doanh nghiep)\s*.*(cua toi|cua em|cua chung toi)/i.test(normalized);

  const isComplianceAuditIntent =
    /(ra soat|kiem tra tuan thu|danh gia tuan thu|tinh trang tuan thu|tong quan tuan thu|suc khoe tuan thu|nghia vu cua doanh nghiep|nghia vu cua cong ty|rui ro phap ly cua cong ty|rui ro phap ly cua doanh nghiep|tuan thu nao)/i.test(
      normalized,
    ) ||
    /(doanh nghiep can lam gi|cong ty can lam gi|doanh nghiep phai lam gi|cong ty phai lam gi|toi phai lam gi de tuan thu|toi can lam gi de tuan thu|toi co con thieu|co con thieu)/i.test(
      normalized,
    ) ||
    isDocAuditQuery;

  const isFinancialRef =
    /(doanh thu|chi phi|chi phí|tndn|tam nop|tạm nộp|muc b4|mục b4|xuat toan|xuất toán|tien mat|tiền mặt|chung tu|chứng từ|hoa don|hoá đơn|bằng chứng|bang chung)/i.test(
      normalized,
    );

  const isEnterpriseQuery =
    isExplicitEnterpriseRef || isComplianceAuditIntent || (isSelfOrgSubject && isFinancialRef);

  if (isDocAuditQuery) {
    (org.contextFacts || []).forEach((f: any) => {
      const nVal = normalizeVietnameseText(f.currentValue);
      const isPendingOrMissing =
        nVal.includes('chua thuc hien') ||
        nVal.includes('chua co') ||
        nVal.includes('dang chuan bi') ||
        nVal.includes('mot phan') ||
        nVal.includes('chua ro') ||
        nVal.includes('chua xac dinh') ||
        !nVal;
      if (isPendingOrMissing && !relevantFacts.some((rf: any) => rf.id === f.id)) {
        relevantFacts.push(f);
      }
    });
  } else if (isEnterpriseQuery) {
    (org.contextFacts || []).forEach((f: any) => {
      if (!relevantFacts.some((rf: any) => rf.id === f.id)) {
        relevantFacts.push(f);
      }
    });
  }

  const enrichedFactDetails =
    relevantFacts.length > 0
      ? relevantFacts
          .map((f: any) => {
            const sourceTime = f.providedAt
              ? new Date(f.providedAt).toLocaleDateString('vi-VN')
              : 'Khai báo hệ thống';
            return `* ${f.label || f.key}: "${f.currentValue}" (Trạng thái: ${f.status || 'Chưa xác thực'}, Cập nhật: ${sourceTime})`;
          })
          .join('\n')
      : 'Hệ thống chưa ghi nhận dữ kiện bối cảnh bổ sung.';

  const auditReport = evaluateEnterpriseCompliance(org, new Date());
  const obligationsBreakdown = auditReport.obligations
    .map(
      (o, idx) =>
        `* Nghĩa vụ ${idx + 1}: ${o.name} [Mã: ${o.code}]\n` +
        `  - Phạm vi áp dụng: ${o.applicabilityLabel}\n` +
        `  - Tiến độ thực hiện: ${o.executionLabel}\n` +
        `  - Trạng thái tổng hợp: ${o.statusLabel}\n` +
        `  - Dữ liệu ghi nhận: "${o.recordedData}"\n` +
        `  - Đánh giá căn cứ: ${o.statusReason}\n` +
        `  - Căn cứ pháp lý: ${o.legalDoc} (${o.article}) [Hiệu lực: ${o.effectiveDate}]\n` +
        `  - Minh chứng yêu cầu: ${o.evidenceRequirement} (Đã có chứng từ hợp lệ: ${o.hasValidEvidence ? 'CÓ' : 'CHƯA'})\n` +
        `  - Hành động cần thực hiện: ${o.actionRequired}` +
        (o.missingDataQuestion ? `\n  - Câu hỏi xác minh thêm: "${o.missingDataQuestion}"` : ''),
    )
    .join('\n\n');

  let financialSection =
    `SỐ LIỆU SỔ KÊ KHAI THU CHI & THUẾ TNDN NĂM ${fin.currentYear} (DỮ LIỆU THỰC TẾ):\n` +
    `- Tổng doanh thu ghi nhận: ${fin.totalRevenue.toLocaleString('vi-VN')} VNĐ (${fin.citRevenues.length} khoản thu)\n` +
    `- Tổng chi phí kế toán: ${fin.totalExpense.toLocaleString('vi-VN')} VNĐ (${fin.citExpenses.length} khoản chi)\n` +
    `- Chi phí loại trừ Mục B4 (không được trừ khi tính thuế TNDN): ${fin.totalDisallowed.toLocaleString('vi-VN')} VNĐ (${fin.disallowedExpenses.length} khoản rủi ro)\n` +
    `- Thu nhập chịu thuế ước tính: ${fin.taxableIncome.toLocaleString('vi-VN')} VNĐ\n` +
    `- Thuế TNDN tạm tính năm (20%): ${fin.estimatedCit.toLocaleString('vi-VN')} VNĐ\n` +
    `- Nghĩa vụ tạm nộp 4 quý tối thiểu 80% (NĐ 91/2022): ${fin.prepayment80.toLocaleString('vi-VN')} VNĐ\n`;

  if (fin.disallowedExpenses.length > 0) {
    financialSection +=
      `DANH SÁCH CHI PHÍ RỦI RO BỊ XUẤT TOÁN MỤC B4:\n` +
      fin.disallowedExpenses
        .slice(0, 5)
        .map(
          (e, idx) =>
            `  ${idx + 1}. [${e.category}] ${e.amount.toLocaleString('vi-VN')} VNĐ (${e.date}, TT: ${e.paymentMethod}, HĐ: ${e.hasInvoice}): ${e.disallowedReason || 'Vi phạm điều kiện được trừ'} [${e.legalBasis || 'TT 96/2015'}]`,
        )
        .join('\n') +
      '\n';
  }

  const acceptedEvidences = (org.evidenceDocuments || []).filter((e: any) => e.status === 'accepted');
  const evidenceSection =
    `HỒ SƠ BẰNG CHỨNG SỐ TRONG KHO HỆ THỐNG:\n` +
    `- Tổng số chứng từ lưu trữ: ${(org.evidenceDocuments || []).length} hồ sơ\n` +
    `- Chứng từ đã được xác nhận hợp lệ: ${acceptedEvidences.length} hồ sơ` +
    (acceptedEvidences.length > 0
      ? ` (${acceptedEvidences.map((e: any) => e.name).join(', ')})`
      : '') +
    '\n';

  const completedTasks = tasks.filter((t) => t.status === TaskStatus.completed);
  const pendingTasks = tasks.filter(
    (t) => t.status !== TaskStatus.completed && t.status !== TaskStatus.cancelled,
  );
  const overdueTasks = tasks.filter(
    (t) =>
      t.status !== TaskStatus.completed && t.dueDate && new Date(t.dueDate).getTime() < Date.now(),
  );
  const taskSection =
    `TIẾN ĐỘ THỰC HIỆN NHIỆM VỤ TUÂN THỦ:\n` +
    `- Tổng số nhiệm vụ theo dõi: ${tasks.length}\n` +
    `- Đã hoàn thành: ${completedTasks.length} nhiệm vụ\n` +
    `- Đang thực hiện / Cần hoàn thiện hồ sơ: ${pendingTasks.length} nhiệm vụ\n` +
    `- Quá hạn: ${overdueTasks.length} nhiệm vụ\n`;

  const denseContext =
    `THÔNG TIN ĐỊNH DANH DOANH NGHIỆP:\n` +
    `- Tên doanh nghiệp: ${org.name}\n` +
    `- Mã số thuế: ${org.taxCode}\n` +
    `- Ngành nghề kinh doanh: ${org.industry || 'Chung'}\n` +
    `- Quy mô nhân sự: ${org.employeeCount || 0} người\n` +
    `- Hình thức pháp lý: ${org.legalType || 'Doanh nghiệp'}\n` +
    `- Mô hình vận hành: ${org.businessModel || 'Tiêu chuẩn'}\n\n` +
    `${financialSection}\n` +
    `${evidenceSection}\n` +
    `${taskSection}\n` +
    `BẢNG TỔNG HỢP TÌNH TRẠNG TUÂN THỦ (ĐỒNG BỘ 100% TỪ TẬP NGHĨA VỤ CHI TIẾT):\n` +
    `- ${auditReport.summary.summaryText}\n` +
    `- Đã hoàn thành (COMPLETED có minh chứng): ${auditReport.summary.completed}\n` +
    `- Đang thực hiện (IN_PROGRESS): ${auditReport.summary.inProgress}\n` +
    `- Cần xác minh (NEEDS_VERIFICATION): ${auditReport.summary.needsVerification}\n` +
    `- Quá hạn (OVERDUE): ${auditReport.summary.overdue}\n` +
    `- Không thuộc diện áp dụng (NOT_APPLICABLE): ${auditReport.summary.notApplicable}\n\n` +
    `CHI TIẾT DANH MỤC NGHĨA VỤ THUẾ CỦA DOANH NGHIỆP:\n` +
    `${obligationsBreakdown}\n\n` +
    `CÁC THẺ NGỮ CẢNH HỆ THỐNG GHI NHẬN:\n${enrichedFactDetails}`;

  return {
    isSelfOrgSubject,
    isEnterpriseQuery,
    relevantFacts,
    auditReport,
    denseContext,
  };
}
