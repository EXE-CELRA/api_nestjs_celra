import { Injectable, Logger, NotFoundException, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AIChatMessageDto, AcceptProposalDto, UpdateLegalRuleDto } from './dto/ai-chat.dto';
import { TaskStatus, UserRole, WaitingOnRole, TimelineEventType, ContextStatus, ContextGroup } from '@prisma/client';
import * as crypto from 'crypto';

import {
  CORE_LEGAL_DOC_LINKS,
  cleanDLPLUrl,
  matchCoreLegalDocUrl,
  extractLegalCitationsFromText,
} from '../../common/constants/legal-docs.constant';
import { calculateTaxDeadline } from '../../common/utils/tax-deadline.util';
import { evaluateEnterpriseCompliance } from '../../common/utils/compliance-evaluation.util';

// Cấu trúc dữ liệu lưu trong Bộ nhớ đệm (Cache)
interface CachedAnswer {
  content: string;
  citations: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }>;
  proposedChecklists: unknown[];
  actionType: 'info' | 'open_compliance_audit' | 'task_proposal' | 'enterprise_audit';
  isEnterpriseQuery?: boolean;
  verificationChecklist?: unknown[];
  ctaButton?: { text: string; action: string };
  timestamp: number;
}

@Injectable()
export class AIAssistantService implements OnModuleInit {
  private readonly logger = new Logger(AIAssistantService.name);

  // Bộ nhớ đệm thông minh (Cache TTL đúng 30 ngày theo yêu cầu: 2,592,000,000 ms)
  private readonly CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  private queryCache = new Map<string, CachedAnswer>();

  // Bộ nhớ đệm tra cứu DLPL API (TTL 7 ngày: tránh gọi lại API DLPL cho cùng từ khóa)
  private readonly DLPL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  private dlplDocsCache = new Map<string, { data: unknown[]; timestamp: number }>();
  private dlplPenaltiesCache = new Map<string, { data: unknown[]; timestamp: number }>();

  // Rate Limiting chống spam (Tối đa 15 câu/ngày/tổ chức)
  private dailyQueryTracker = new Map<string, { count: number; date: string }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) { }

  async onModuleInit() {
    // Làm sạch toàn bộ cache cũ để xóa bỏ dứt điểm các câu trả lời fallback lỗi từ các phiên trước
    this.queryCache.clear();
    this.dlplDocsCache.clear();
    this.dlplPenaltiesCache.clear();
    this.logger.log('[CACHE PURGED] Đã khởi tạo và làm sạch toàn bộ bộ nhớ đệm AI Assistant.');
    this.initBiWeeklySyncSchedule();
  }

  /**
   * 🛡️ LRU Cache Setter an toàn bộ nhớ: tự động loại bỏ phần tử cũ nhất khi chạm ngưỡng max
   */
  private setLruCache<T>(cacheMap: Map<string, T>, key: string, value: T, maxLimit = 500) {
    if (cacheMap.has(key)) {
      cacheMap.delete(key);
    } else if (cacheMap.size >= maxLimit) {
      const oldestKey = cacheMap.keys().next().value;
      if (oldestKey) cacheMap.delete(oldestKey);
    }
    cacheMap.set(key, value);
  }
  // ============================================================================
  // LUỒNG CHÍNH 1: TIẾP NHẬN & PHÂN TÍCH CÂU HỎI TƯ VẤN PHÁP LÝ (TOP-DOWN PIPELINE)
  // Đọc từ trên xuống dưới:
  // 1. Nhận câu hỏi & Nén bối cảnh DN ->
  // 2. Tra cứu Kho luật sẵn có trong DB ->
  // 3. Tra cứu Cache 30 ngày ->
  // 4. Kiểm tra Intent Audit Paywall ->
  // 5. Gọi DLPL API nếu kho chưa có ->
  // 6. Ghép System Prompt & Gọi DeepSeek AI ->
  // 7. Đóng gói Checklist & Lưu Cache 30 ngày
  // ============================================================================
  async chat(orgId: string, dto: AIChatMessageDto) {
    // ------------------------------------------------------------------------
    // BƯỚC 1: TIẾP NHẬN CÂU HỎI & NÉN BỐI CẢNH DOANH NGHIỆP (DENSE CONTEXT)
    // ------------------------------------------------------------------------
    if (!orgId) {
      throw new NotFoundException('Thiếu x-organization-id: không xác định được doanh nghiệp');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { contextFacts: true },
    });
    if (!org) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp hợp lệ trong hệ thống');
    }

    const rawMessage = (dto.message || dto.question || '').trim();
    if (!rawMessage) {
      return {
        messageId: `msg-${Date.now()}`,
        sender: 'assistant',
        content: 'Xin chào! Tôi là Trợ Lý Pháp Lý & Thuế Doanh Nghiệp CELRA. Bạn cần giải đáp câu hỏi nào về thuế môn bài, thuế GTGT, tạm nộp TNDN, chi phí lương hay quy định pháp lý nào?',
        answer: 'Xin chào! Tôi là Trợ Lý Pháp Lý & Thuế Doanh Nghiệp CELRA. Bạn cần giải đáp câu hỏi nào về thuế môn bài, thuế GTGT, tạm nộp TNDN, chi phí lương hay quy định pháp lý nào?',
        actionType: 'info',
        citations: [],
        proposedChecklists: [],
        createdAt: new Date().toISOString(),
      };
    }

    // ------------------------------------------------------------------------
    // BƯỚC 1.1: XỬ LÝ SỰ KIỆN XÁC NHẬN THÔNG TIN TÌNH HUỐNG TỪ CHAT (MÔ PHỎNG IN-MEMORY)
    // Câu hỏi/xác nhận từ người dùng chỉ là TÌNH HUỐNG GIẢ SỬ để tư vấn rà soát
    // TUYỆT ĐỐI KHÔNG tự ý lưu hay ghi đè vào contextFact / Organization trong Database
    // ------------------------------------------------------------------------
    const isVerificationConfirm = rawMessage.toLowerCase().startsWith('xac nhan thong tin:') || rawMessage.toLowerCase().startsWith('xác nhận thông tin:');
    if (isVerificationConfirm) {
      const confirmText = rawMessage.replace(/^(xac nhan thong tin:|xác nhận thông tin:)\s*/i, '').trim();
      const updatedFactLabels: string[] = [];

      // Tạo bản sao ngữ cảnh tạm thời (in-memory overlay) để mô phỏng phân tích cho tình huống giả sử, KHÔNG thay đổi DB thực tế
      const simulatedFacts = (org.contextFacts || []).map((f) => ({ ...f }));
      const simulatedOrg = { ...org, contextFacts: simulatedFacts };

      // Helper cập nhật thẻ Fact chỉ tạm thời trong in-memory cho lượt phân tích giả sử này, TUYỆT ĐỐI KHÔNG LƯU VÀO DATABASE
      const simulateFact = (key: string, label: string, group: ContextGroup, value: string) => {
        const existing = simulatedFacts.find((f) => f.key === key);
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

      // 1. Nhận diện Môn bài
      if (/(mon bai|môn bài)/i.test(confirmText)) {
        let monBaiVal = 'Đã nộp đầy đủ vào NSNN';
        if (/(chua nop|chưa nộp)/i.test(confirmText)) {
          monBaiVal = 'Chưa nộp tiền vào ngân sách';
        } else if (/(moi thanh lap|mới thành lập|mien|miễn)/i.test(confirmText)) {
          monBaiVal = 'Mới thành lập (miễn lệ phí môn bài năm đầu)';
        }
        simulateFact('q_tax_corp_monbai', 'Lệ phí môn bài', ContextGroup.thue_ke_toan, monBaiVal);
      }

      // 2. Nhận diện TNDN 80%
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

      // 3. Nhận diện Thanh toán không dùng tiền mặt
      if (/(tien mat|tiền mặt|chuyen khoan|chuyển khoản|ngan hang|ngân hàng|20 trieu|20 triệu|uy nhiem chi|ủy nhiệm chi)/i.test(confirmText)) {
        let nonCashVal = '100% chuyển khoản ngân hàng có đầy đủ Ủy nhiệm chi';
        if (/(tien mat|tiền mặt)/i.test(confirmText) && /(co|có|da tra|đã trả)/i.test(confirmText)) {
          nonCashVal = 'Có hóa đơn trên 20 triệu đã thanh toán bằng tiền mặt';
        } else if (/(chua doi chieu|đang đối chiếu)/i.test(confirmText)) {
          nonCashVal = 'Đang đối chiếu sao kê và ủy nhiệm chi ngân hàng';
        }
        simulateFact('q_tax_corp_3', 'Thanh toán không dùng tiền mặt', ContextGroup.thue_ke_toan, nonCashVal);
      }

      // 4. Nhận diện HĐĐT máy tính tiền / Bán lẻ trực tiếp
      if (/(may tinh tien|máy tính tiền|ban hang truc tiep|bán hàng trực tiếp|pos|ban le|bán lẻ|nguoi tieu dung|người tiêu dùng)/i.test(confirmText)) {
        const isYes = /có|co bán hàng|có áp dụng/i.test(confirmText);
        const isNo = /không|khong bán hàng|không áp dụng|b2b/i.test(confirmText);
        const posVal = isYes
          ? 'Có bán hàng trực tiếp (Bắt buộc HĐĐT máy tính tiền)'
          : isNo
          ? 'Không bán hàng trực tiếp đến người tiêu dùng (Áp dụng HĐĐT thông thường)'
          : 'Chưa xác định rõ hình thức bán hàng trực tiếp';
        simulateFact('q_fnb_tax_1', 'Hóa đơn điện tử máy tính tiền', ContextGroup.hoa_don_dong_tien, posVal);
        if (isYes || isNo) {
          simulatedOrg.hasOnlineSales = isYes;
        }
      }

      // 5. Nhận diện Thuế GTGT định kỳ
      if (/(gtgt|vat|ky ke khai|kỳ kê khai)/i.test(confirmText)) {
        const isMonth = /(thang|tháng)/i.test(confirmText);
        const gtgtVal = isMonth
          ? 'Kê khai thuế GTGT định kỳ theo tháng'
          : 'Kê khai thuế GTGT định kỳ theo quý';
        simulateFact('q_tax_corp_1', 'Kê khai thuế GTGT định kỳ', ContextGroup.thue_ke_toan, gtgtVal);
      }

      // 6. Nhận diện Hồ sơ tiền lương & thuế TNCN
      if (/(luong|lương|nhan su|nhân sự|tncn|mst ca nhan|mst cá nhân)/i.test(confirmText)) {
        let salaryVal = 'Đã hoàn thiện MST cá nhân và hồ sơ chi phí lương';
        if (/(chua ky|chưa ký|chua co mst|chưa có mst)/i.test(confirmText)) {
          salaryVal = 'Chưa hoàn thiện MST cá nhân cho người lao động';
        } else if (/(dang lam|đang hoàn thiện)/i.test(confirmText)) {
          salaryVal = 'Đang hoàn thiện đăng ký MST cá nhân cho nhân viên';
        }
        simulateFact('q_tax_salary_1', 'Hồ sơ chi phí tiền lương & thuế TNCN', ContextGroup.lao_dong_bhxh, salaryVal);
      }

      // KẾT HỢP DỮ LIỆU MỚI VÀO BỐI CẢNH VÀ PHÂN TÍCH LẠI (RE-ANALYZE)
      this.logger.log(`[VERIFICATION SIMULATED] Đã mô phỏng ${updatedFactLabels.length} dữ kiện mới cho tình huống giả sử. Bắt đầu phân tích lại...`);

      // Đánh giá lại tuân thủ toàn diện với dữ liệu facts mô phỏng (database không đổi)
      const updatedAudit = evaluateEnterpriseCompliance(simulatedOrg, new Date());
      const reSummary = updatedAudit.summary;

      const reanalyzedReply =
        `**BÁO CÁO PHÂN TÍCH LẠI TUÂN THỦ THUẾ THEO TÌNH HUỐNG GIẢ SỬ:**\n\n` +
        `1. **Tổng quan**: Đã cập nhật phân tích theo tình huống giả định; tổng hợp ${reSummary.total} nghĩa vụ: ${reSummary.completed} hoàn thành có minh chứng, ${reSummary.inProgress} đang thực hiện, ${reSummary.needsVerification} cần xác minh thêm, ${reSummary.overdue} quá hạn.\n\n` +
        `2. **Kết luận**: Đã tiếp nhận và đối chiếu thành công các thông tin xác minh mới (${updatedFactLabels.length > 0 ? updatedFactLabels.join(', ') : confirmText}). Tình trạng tuân thủ của doanh nghiệp đã được phân tích lại tương ứng.\n\n` +
        `3. **Nghĩa vụ áp dụng**:\n` +
        updatedAudit.obligations.map((o) => `- **${o.name}**: ${o.statusLabel} (Phạm vi: ${o.applicabilityLabel}).`).join('\n') + `\n\n` +
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
        actionType: 'enterprise_audit',
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
        confidenceReason: 'Mô phỏng phân tích tuân thủ theo tình huống giả định của người dùng (không thay đổi cơ sở dữ liệu doanh nghiệp)',
        proposedChecklists: [],
        createdAt: new Date().toISOString(),
      };
    }

    const normalized = this.normalizeText(rawMessage);

    // ------------------------------------------------------------------------
    // BƯỚC 1.2: PHÂN LOẠI PHẠM VI CÂU HỎI (DOMAIN SCOPE GUARD)
    // Chỉ giải đáp câu hỏi liên quan đến DOANH NGHIỆP và LUẬT THUẾ, HÓA ĐƠN CHỨNG TỪ
    // Mọi câu hỏi ngoài phạm vi (thời tiết, lập trình, y tế, ẩm thực, giải trí...): TỪ CHỐI TRẢ LỜI NGAY (0 API)
    // ------------------------------------------------------------------------
    if (!this.isTaxOrEnterpriseDomain(rawMessage)) {
      this.logger.log(`[OUT OF SCOPE] xin lỗi hiện tại câu hỏi ngoài phạm vi thuế & doanh nghiệp: "${rawMessage}"`);
      const rejectionReply =
        `**TỪ CHỐI TRẢ LỜI — CÂU HỎI NGOÀI PHẠM VI CHUYÊN MÔN:**\n\n` +
        `Rất tiếc, tôi là **CELRA AI — Trợ lý Rà soát Tuân thủ Thuế Doanh nghiệp** tại Việt Nam. Tôi chỉ hỗ trợ giải đáp các câu hỏi chuyên sâu về **Doanh nghiệp và Pháp luật Thuế**.\n\n` +
        `Câu hỏi của bạn hiện nằm ngoài phạm vi hỗ trợ của hệ thống. Bạn vui lòng đặt câu hỏi liên quan đến:\n` +
        `- **Nghĩa vụ thuế doanh nghiệp**: Lệ phí môn bài, Thuế TNDN tạm nộp 80%, Thuế GTGT, Thuế TNCN.\n` +
        `- **Hóa đơn & Chứng từ**: Hóa đơn điện tử máy tính tiền, điều kiện thanh toán không dùng tiền mặt, chi phí hợp lý được trừ.\n` +
        `- **Kỳ kê khai & Thời hạn tuân thủ**: Lịch nộp tờ khai và tiền thuế định kỳ theo tháng/quý/năm của doanh nghiệp.\n` +
        `- **Rà soát & Đánh giá rủi ro tuân thủ**: Rà soát nghĩa vụ và kiểm tra hồ sơ thuế thực tế của công ty bạn.`;

      return {
        messageId: `msg-${Date.now()}`,
        sender: 'assistant',
        content: rejectionReply,
        answer: rejectionReply,
        actionType: 'info',
        isEnterpriseQuery: false,
        citations: [],
        proposedChecklists: [],
        verificationChecklist: [],
        confidenceLevel: 'high',
        confidenceReason: 'Từ chối câu hỏi ngoài phạm vi nghiệp vụ thuế và doanh nghiệp',
        createdAt: new Date().toISOString(),
      };
    }

    const cacheKey = crypto.createHash('sha256').update(`${orgId}::${normalized}`).digest('hex');
    const factScores = (org.contextFacts || []).map((f) => {
      let score = 0;
      const nLabel = this.normalizeText(f.label);
      const nValue = this.normalizeText(f.currentValue);
      const nKey = this.normalizeText(f.key);
      if (nLabel && normalized.includes(nLabel)) score += 3;
      if (nValue && normalized.includes(nValue)) score += 2;
      if (nKey && normalized.includes(nKey)) score += 1;
      for (const word of nLabel.split(' ')) {
        if (word.length > 3 && normalized.includes(word)) score += 0.5;
      }
      return { fact: f, score };
    });
    const relevantFacts = factScores
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.fact);

    // ------------------------------------------------------------------------
    // NHẬN DIỆN Ý ĐỊNH CÂU HỎI:
    // 1. Câu hỏi rà soát / liên quan trực tiếp đến doanh nghiệp (isEnterpriseQuery)
    // 2. Câu hỏi chung về luật / quy định pháp luật (!isEnterpriseQuery)
    // ------------------------------------------------------------------------
    const isDocAuditQuery = /(thieu tai lieu|thieu ho so|thieu chung tu|thieu gi|can bo sung gi|con thieu|chua lam|chua hoan thanh|can bo sung tai lieu|chua nop|chua thuc hien)/i.test(normalized);

    const isExplicitEnterpriseRef = /(doanh nghiep|cong ty|don vi|ben|tiem|quan|shop|ho kinh doanh)\s*(toi|em|minh|chung toi|cua toi|cua em|nay)/i.test(normalized) ||
      /(cho toi|cho em|giup toi|giup em)\s*.*(cong ty|doanh nghiep)/i.test(normalized) ||
      /(cong ty|doanh nghiep)\s*.*(cua toi|cua em|cua chung toi)/i.test(normalized);

    const isComplianceAuditIntent = /(ra soat|kiem tra tuan thu|danh gia tuan thu|tinh trang tuan thu|tong quan tuan thu|suc khoe tuan thu|nghia vu cua doanh nghiep|nghia vu cua cong ty|rui ro phap ly cua cong ty|rui ro phap ly cua doanh nghiep|tuan thu nao)/i.test(normalized) ||
      /(doanh nghiep can lam gi|cong ty can lam gi|doanh nghiep phai lam gi|cong ty phai lam gi|toi phai lam gi de tuan thu|toi can lam gi de tuan thu|toi co con thieu|co con thieu)/i.test(normalized) ||
      isDocAuditQuery;

    const isEnterpriseQuery = isExplicitEnterpriseRef || isComplianceAuditIntent;

    // Chỉ nạp các thẻ thuế trọng tâm khi người dùng hỏi tổng thể/tuân thủ/thiếu tài liệu, không hỏi một sắc thuế lẻ loi
    const isSpecificTaxQuery = !isDocAuditQuery && /(gtgt|vat|tndn|tam nop|20 trieu|tien mat|luong|tncn|hoa don|may tinh tien|pos|mon bai)/i.test(normalized);

    // Nếu là câu hỏi rà soát thiếu tài liệu: Tự động gom TẤT CẢ các thẻ có trạng thái "Chưa thực hiện", "Đang chuẩn bị", hoặc "Chưa rõ"
    if (isDocAuditQuery) {
      (org.contextFacts || []).forEach((f) => {
        const nVal = this.normalizeText(f.currentValue);
        const isPendingOrMissing = nVal.includes('chua thuc hien') || nVal.includes('chua co') || nVal.includes('dang chuan bi') || nVal.includes('mot phan') || nVal.includes('chua ro') || nVal.includes('chua xac dinh') || !nVal;
        if (isPendingOrMissing && !relevantFacts.some((rf) => rf.id === f.id)) {
          relevantFacts.push(f);
        }
      });
    } else if (isEnterpriseQuery) {
      (org.contextFacts || []).forEach((f) => {
        if (!relevantFacts.some((rf) => rf.id === f.id)) {
          relevantFacts.push(f);
        }
      });
    }
    // Dữ liệu ngữ cảnh thực tế từ Database của doanh nghiệp (hoàn toàn động, không gán cứng)
    const enrichedFactDetails = relevantFacts.length > 0
      ? relevantFacts.map((f) => {
          const sourceTime = f.providedAt ? new Date(f.providedAt).toLocaleDateString('vi-VN') : 'Khai báo hệ thống';
          return `* ${f.label || f.key}: "${f.currentValue}" (Trạng thái: ${f.status || 'Chưa xác thực'}, Cập nhật: ${sourceTime})`;
        }).join('\n')
      : 'Hệ thống chưa ghi nhận dữ kiện bối cảnh bổ sung.';

    const auditReport = evaluateEnterpriseCompliance(org, new Date());
    const obligationsBreakdown = auditReport.obligations.map((o, idx) => {
      return `* Nghĩa vụ ${idx + 1}: ${o.name} [Mã: ${o.code}]\n` +
        `  - Phạm vi áp dụng: ${o.applicabilityLabel}\n` +
        `  - Tiến độ thực hiện: ${o.executionLabel}\n` +
        `  - Trạng thái tổng hợp: ${o.statusLabel}\n` +
        `  - Dữ liệu ghi nhận: "${o.recordedData}"\n` +
        `  - Đánh giá căn cứ: ${o.statusReason}\n` +
        `  - Căn cứ pháp lý: ${o.legalDoc} (${o.article}) [Hiệu lực: ${o.effectiveDate}]\n` +
        `  - Minh chứng yêu cầu: ${o.evidenceRequirement} (Đã có chứng từ hợp lệ: ${o.hasValidEvidence ? 'CÓ' : 'CHƯA'})\n` +
        `  - Hành động cần thực hiện: ${o.actionRequired}` +
        (o.missingDataQuestion ? `\n  - Câu hỏi xác minh thêm: "${o.missingDataQuestion}"` : '');
    }).join('\n\n');

    const denseContext = `THÔNG TIN ĐỊNH DANH DOANH NGHIỆP:\n` +
      `- Tên doanh nghiệp: ${org.name}\n` +
      `- Mã số thuế: ${org.taxCode}\n` +
      `- Ngành nghề kinh doanh: ${org.industry || 'Chung'}\n` +
      `- Quy mô nhân sự: ${org.employeeCount || 0} người\n` +
      `- Hình thức pháp lý: ${org.legalType || 'Doanh nghiệp'}\n` +
      `- Mô hình vận hành: ${org.businessModel || 'Tiêu chuẩn'}\n\n` +
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
    // ------------------------------------------------------------------------
    // BƯỚC 1.5: PHÂN BIỆT Ý ĐỊNH - TRẢ LỜI NGAY CÂU HỎI THÔNG TIN DOANH NGHIỆP TỪ DB (0 API, 0 LLM)
    // (Ví dụ: "doanh nghiệp tôi tên gì", "mst của tôi", "công ty tôi bao nhiêu nhân sự", "địa chỉ công ty...")
    // Tuyệt đối không bắt rà soát tính tiền đối với các câu hỏi tra cứu hồ sơ công ty
    // ------------------------------------------------------------------------
    // Nhận diện linh hoạt câu hỏi tra cứu thông tin định danh:
    // 1. Trường hợp có chủ ngữ: "doanh nghiệp tôi tên gì", "mst của tôi", "công ty bao nhiêu người"...
    // 2. Trường hợp KHÔNG có chủ ngữ (ngắn gọn): "mã số thuế", "mst", "tên công ty", "tên doanh nghiệp", "địa chỉ", "quy mô nhân sự"...
    const isSelfOrgSubject = /(toi|minh|chung toi|cua toi|cong ty|doanh nghiep|dn)/i.test(normalized);
    const isComplianceOrTaxAsk = /(thue|tuan thu|can lam gi|lam gi|ra soat|nghia vu|chung tu|phat sinh|huong dan|can nop)/i.test(normalized);

    const isNameQuery = !isComplianceOrTaxAsk && ((isSelfOrgSubject && /(ten gi|la gi|ten la gi|ten cong ty|ten doanh nghiep|ten dn)/i.test(normalized)) ||
      /^(ten|ten gi|ten cong ty|ten doanh nghiep|ten phap ly)$/i.test(normalized));

    const isTaxCodeQuery = !isComplianceOrTaxAsk && ((isSelfOrgSubject && /(mst|ma so thue|tax code)/i.test(normalized)) ||
      /^(mst|ma so thue|tax code|so thue)$/i.test(normalized) ||
      /^(tra cuu mst|xin mst|cho xin mst|cho toi mst|xem mst|xem ma so thue)$/i.test(normalized));

    const isStaffQuery = !isComplianceOrTaxAsk && ((isSelfOrgSubject && /(bao nhieu|may|co bao nhieu|so luong|quy mo nhan su|nhan su cua toi|nhan vien cua toi)/i.test(normalized) && /(nhan su|nhan vien|nguoi)/i.test(normalized)) ||
      /^(nhan su|nhan vien|quy mo|quy mo nhan su|so luong nhan vien|bao nhieu nguoi)$/i.test(normalized));

    const isAddressQuery = !isComplianceOrTaxAsk && ((isSelfOrgSubject && /(dia chi|o dau|tru so|o cho nao)/i.test(normalized)) ||
      /^(dia chi|tru so|dia chi tru so|o dau)$/i.test(normalized));

    const isIndustryQuery = !isComplianceOrTaxAsk && ((isSelfOrgSubject && /(nganh nghe|linh vuc|kinh doanh gi|mo hinh)/i.test(normalized)) ||
      /^(nganh nghe|linh vuc|kinh doanh gi|mo hinh kinh doanh)$/i.test(normalized));

    const isGeneralProfileQuery = !isComplianceOrTaxAsk && ((isSelfOrgSubject && /(thong tin|ho so)/i.test(normalized)) ||
      /^(thong tin|ho so|thong tin dn|ho so dn|thong tin cong ty|thong tin doanh nghiep)$/i.test(normalized));

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
        directAnswer = `**Hồ sơ thông tin Doanh nghiệp của bạn trên hệ thống CELRA:**\n\n` +
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
        actionType: 'info',
        citations: [],
        confidenceLevel: 'high',
        confidenceReason: 'Trích xuất trực tiếp từ Cơ sở dữ liệu Doanh nghiệp trong hệ thống (0 API, 0 LLM)',
        proposedChecklists: [],
        createdAt: new Date().toISOString(),
      };
    }

    const today = new Date().toISOString().slice(0, 10);

    // Tự động dọn dẹp các key rate-limit của ngày cũ để tránh tích tụ bộ nhớ
    if (this.dailyQueryTracker.size > 200) {
      for (const [k, v] of this.dailyQueryTracker.entries()) {
        if (v.date !== today) {
          this.dailyQueryTracker.delete(k);
        }
      }
    }

    const trackerKey = `${orgId}::${today}`;
    const current = this.dailyQueryTracker.get(trackerKey);
    if (current && current.count >= 15 && current.date === today) {
      return {
        messageId: `msg-${Date.now()}`,
        sender: 'assistant',
        content: 'Bạn đã hết 15 lượt hỏi hôm nay. Vui lòng quay lại vào ngày mai hoặc sử dụng Rà soát Tuân thủ để nhận tư vấn chi tiết.',
        actionType: 'info',
        citations: [],
        proposedChecklists: [],
        createdAt: new Date().toISOString(),
      };
    }
    this.dailyQueryTracker.set(trackerKey, { count: (current?.count || 0) + 1, date: today });
    // BƯỚC 2: TRA CỨU TRONG KHO LUẬT SẴN CÓ CỦA DATABASE (LOCAL RULES - 0 API)
    // ------------------------------------------------------------------------
    const localDbRules = await this.prisma.rule.findMany();
    let matchedLocalRule: (typeof localDbRules)[0] | undefined;
    let bestScore = 0;
    for (const rule of localDbRules) {
      const cond = rule.conditionsJson as { keywords?: string[] } | null;
      const kwList: string[] = cond?.keywords || [];
      const score = kwList.reduce((acc, kw) => {
        const nkw = this.normalizeText(kw);
        if (!nkw) return acc;
        return normalized.includes(nkw) ? acc + 1 : acc;
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        matchedLocalRule = rule;
      }
    }

    if (matchedLocalRule) {
      const cond = matchedLocalRule.conditionsJson as { content?: string; answer?: string; citations?: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }>; proposedChecklist?: unknown } | null;
      this.logger.log(`[LOCAL RULE HIT] Câu hỏi khớp với quy định trong kho luật: ${matchedLocalRule.code} - ${matchedLocalRule.title}`);
      return {
        messageId: `msg-${Date.now()}`,
        sender: 'assistant',
        content: cond?.content || matchedLocalRule.conditionSummary,
        answer: cond?.answer || matchedLocalRule.conditionSummary,
        actionType: 'task_proposal',
        isEnterpriseQuery: isEnterpriseQuery,
        citations: cond?.citations || [],
        confidenceLevel: 'high',
        confidenceReason: 'Tra cứu trực tiếp từ Kho Quy định Pháp luật nội bộ của hệ thống (0 API)',
        proposedChecklists: cond?.proposedChecklist ? [cond.proposedChecklist] : [],
        createdAt: new Date().toISOString(),
      };
    }
    // ------------------------------------------------------------------------
    // BƯỚC 3: NẾU KHO CHƯA CÓ -> TRA CỨU BỘ NHỚ ĐỆM (CACHE HIT 30 NGÀY - 0 API)
    // ------------------------------------------------------------------------
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.logger.log(`[CACHE HIT - 30 ngày] Phục vụ câu hỏi "${rawMessage}" từ Local Cache (Tốn 0 API call)`);
        return {
          messageId: `msg-${Date.now()}`,
          sender: 'assistant',
          content: cached.content,
          answer: cached.content,
          actionType: cached.actionType,
          isEnterpriseQuery: cached.isEnterpriseQuery ?? (cached.actionType === 'enterprise_audit'),
          ctaButton: cached.ctaButton,
          citations: cached.citations,
          confidenceLevel: 'high',
          proposedChecklists: cached.proposedChecklists,
          createdAt: new Date().toISOString(),
        };
      } else {
      }
    }

    // ------------------------------------------------------------------------
    // BƯỚC 4: TẠM ẨN BẢNG CHẶN RÀ SOÁT - CHO PHÉP TRẢ THẲNG OUTPUT CHUYÊN SÂU RA MÀN HÌNH CHAT
    // (Để kiểm tra chất lượng output giải thích và checklist hành động trước khi đóng gói rà soát tốn tiền)
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // BƯỚC 5: ĐỐI CHIẾU KHO VĂN BẢN THUẾ NỘI BỘ (0 API) - HẠN CHẾ TỐI ĐA GỌI DLPL API
    // ------------------------------------------------------------------------
    // BƯỚC 5: ĐỐI CHIẾU CĂN CỨ PHÁP LÝ TỰ ĐỘNG & GỌI DLPL API KHI CẦN (HOÀN TOÀN ĐỘNG)
    // ------------------------------------------------------------------------
    const citedSources: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }> = [];
    let dlplGroundingContext = '';

    // Căn cứ pháp lý phát sinh từ các nghĩa vụ thực tế của doanh nghiệp (hoàn toàn động từ auditReport)
    if (isEnterpriseQuery) {
      auditReport.obligations.forEach((o) => {
        if (o.legalDoc && o.sourceUrl && !citedSources.some((s) => s.title === o.legalDoc || s.sourceUrl === o.sourceUrl)) {
          citedSources.push({
            title: o.legalDoc,
            docNumber: o.article || o.code,
            articleNumber: o.effectiveDate || 'Còn hiệu lực',
            sourceUrl: o.sourceUrl,
          });
        }
      });
    }

    let dlplDocs: unknown[] = [];
    let dlplPenalties: unknown[] = [];

    // CHỈ GỌI API DLPL KHI VÀ CHỈ KHI: Người dùng hỏi rõ một số hiệu văn bản luật cụ thể nằm ngoài kho 25 văn bản cốt lõi
    const hasSpecificDecreeQuery = /(nghi dinh|thong tu|luat so|quyet dinh)\s+\d+[\d/A-Z\-]+/i.test(rawMessage);
    const isAlreadyCoveredInLocal = citedSources.length >= 2;

    if (hasSpecificDecreeQuery && !isAlreadyCoveredInLocal) {
      const contextHints = relevantFacts.map((f) => f.currentValue).join(' ');
      const taxSearchPrefix = 'thuế';
      const enrichedQuery = `${taxSearchPrefix} ${rawMessage} ${contextHints}`.slice(0, 120);
      this.logger.log(`[DLPL SEARCH ON-DEMAND] Chỉ tra cứu đơn lẻ văn bản chuyên ngành: "${enrichedQuery}"`);
      dlplDocs = await this.searchDLPLLegalDocuments(enrichedQuery, 2);

      if (dlplDocs.length > 0) {
        dlplGroundingContext += '\nVĂN BẢN PHÁP LUẬT TỪ CỔNG DLPL:\n';
        (dlplDocs as Array<{ code?: string; name?: string; status?: string; sourceUrl?: string }>).forEach((doc) => {
          dlplGroundingContext += `- Số hiệu: ${doc.code} | Tên: ${doc.name} | Trạng thái: ${doc.status}\n`;
          citedSources.push({
            title: `${doc.name} (${doc.code})`,
            docNumber: doc.code || '',
            articleNumber: doc.status,
            sourceUrl: doc.sourceUrl,
          });
        });
      }
    } else {
      this.logger.log(`[DLPL BYPASS 100%] Đã sử dụng Kho Luật Thuế Nội Bộ (${citedSources.length} văn bản) -> TỐN ĐÚNG 0 LƯỢT GỌI API DLPL.`);
    }
    // ------------------------------------------------------------------------
    // BƯỚC 6: GHÉP BỐI CẢNH + DỮ LIỆU VÀO SYSTEM PROMPT & GỌI DEEPSEEK AI
    // ------------------------------------------------------------------------
    const opencodeApiUrl = this.config.get<string>('OPENCODE_GO_API_URL', 'https://opencode.ai/inference/openai/v1');
    const apiKey = this.config.get<string>('OPENCODE_GO_API_KEY', '');
    const model = this.config.get<string>('OPENCODE_MODEL', 'deepseek-v4.1-flash');

    let replyContent = '';
    let shouldCache = true;
    const endpoint = opencodeApiUrl.endsWith('/chat/completions')
      ? opencodeApiUrl
      : `${opencodeApiUrl.replace(/\/+$/, '')}/chat/completions`;
    try {
      // Danh sách các mô hình dự phòng tự động chuyển đổi khi gặp 503, 429 hoặc quá tải
      const candidateModels = [
        model,
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-flash-latest',
      ].filter((m, i, arr) => m && arr.indexOf(m) === i);

      let lastError: Error | null = null;
      let successfulResponse: Response | null = null;

      for (const currentModel of candidateModels) {
        try {
          this.logger.log(`[OPENCODE API] Đang gửi câu hỏi đến AI (Model: ${currentModel})`);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: currentModel,
              messages: [
                {
                  role: 'system',
                  content: (() => {
                    let prompt = `# CELRA AI — SYSTEM PROMPT\n` +
                      `## Trợ lý rà soát tuân thủ thuế dành cho doanh nghiệp Việt Nam\n\n` +
                      `### 1. VAI TRÒ VÀ MỤC TIÊU\n` +
                      `Bạn là CELRA AI, trợ lý AI hỗ trợ chủ doanh nghiệp tại Việt Nam rà soát, theo dõi và hiểu các nghĩa vụ thuế của doanh nghiệp.\n` +
                      `Nhiệm vụ của bạn là:\n` +
                      `- Phân tích dữ liệu doanh nghiệp và dữ liệu nghĩa vụ thuế được cung cấp từ hệ thống.\n` +
                      `- Xác định những nghĩa vụ cần thực hiện, những thông tin còn thiếu và những nội dung cần xác minh.\n` +
                      `- Giải thích căn cứ pháp lý liên quan bằng ngôn ngữ tiếng Việt dễ hiểu.\n` +
                      `- Chỉ ra khoảng trống về hồ sơ, chứng từ và bằng chứng thực hiện nghĩa vụ.\n` +
                      `- Đề xuất hành động tiếp theo theo mức độ ưu tiên.\n` +
                      `- Giúp chủ doanh nghiệp biết doanh nghiệp cần làm gì, còn thiếu gì và cần kiểm tra điều gì.\n` +
                      `Bạn là công cụ hỗ trợ rà soát và điều phối tuân thủ thuế, không phải cơ quan thuế, luật sư hoặc đơn vị kiểm toán. Không được tuyên bố rằng báo cáo của bạn là kết luận pháp lý chính thức.\n\n` +
                      `### 2. PHẠM VI MVP\n` +
                      `Chỉ xử lý: đối tượng doanh nghiệp tại Việt Nam; phạm vi nghĩa vụ tuân thủ thuế; người dùng chính là chủ doanh nghiệp. Không tự mở rộng sang hộ kinh doanh hay các lĩnh vực pháp lý khác ngoài phạm vi thuế.\n\n` +
                      `### QUY TẮC BẮT BUỘC VỀ PHẠM VI HỖ TRỢ:\n` +
                      `- Bạn là CELRA AI, CHỈ ĐƯỢC PHÉP trả lời các câu hỏi liên quan trực tiếp đến DOANH NGHIỆP và PHÁP LUẬT THUẾ, HÓA ĐƠN CHỨNG TỪ tại Việt Nam.\n` +
                      `- Đối với bất kỳ câu hỏi nào ngoài phạm vi này (ví dụ: thời tiết, lập trình, thể thao, y tế, ẩm thực, giải trí, chính trị, kiến thức đời sống phổ thông): Bạn BẮT BUỘC PHẢI TỪ CHỐI TRẢ LỜI một cách lịch sự, giải thích rõ bạn là Trợ lý Tuân thủ Thuế Doanh nghiệp CELRA và mời người dùng đặt câu hỏi về nghĩa vụ thuế doanh nghiệp.\n` +
                      `- TUYỆT ĐỐI KHÔNG trả lời các câu hỏi ngoài phạm vi.\n\n` +
                      `- 3.1. Không bịa dữ liệu: Không tự tạo tên doanh nghiệp, MST, số lượng nghĩa vụ, kỳ thuế, thời hạn, số tiền phạt, tiền chậm nộp hoặc điều khoản pháp lý giả. Nếu không có dữ liệu, ghi rõ: "Chưa có dữ liệu để xác định".\n` +
                      `- 3.2. Phân biệt dữ liệu và kết luận: Luôn phân biệt rõ thông tin hệ thống ghi nhận, bằng chứng đã kiểm tra, nhận định của AI, nội dung chưa xác minh và kết luận có căn cứ.\n` +
                      `- 3.3. Không đồng nhất việc thiếu dữ liệu với vi phạm: Chưa có tài liệu không đồng nghĩa với vi phạm. Ví dụ: Viết "Hệ thống hiện chưa ghi nhận giấy nộp tiền... Cần đối chiếu với dữ liệu thuế và chứng từ thanh toán trước khi xác định trạng thái", KHÔNG viết "Doanh nghiệp chưa nộp thuế".\n` +
                      `- 3.4. NGUYÊN TẮC CÂU HỎI TÌNH HUỐNG GIẢ SỬ (HYPOTHETICAL INQUIRIES):\n` +
                      `  + Mọi chi tiết, số liệu hay tình huống người dùng nêu trong câu hỏi (ví dụ: "công ty em F&B có 5 người...", "nếu doanh nghiệp mở bán lẻ trực tiếp...", "giả sử có phát sinh hóa đơn tiền mặt...", "nếu mở thêm chi nhánh...") ĐỀU LÀ TÌNH HUỐNG GIẢ SỬ / THAM KHẢO để hỏi tư vấn.\n` +
                      `  + TUYỆT ĐỐI KHÔNG tự ý coi đây là dữ liệu thực tế đã thay đổi của doanh nghiệp trong hệ thống.\n` +
                      `  + TUYỆT ĐỐI KHÔNG tự ý thêm hoặc ghi đè các tình huống trong câu hỏi vào ngữ cảnh hồ sơ thực tế của doanh nghiệp.\n` +
                      `  + Luôn phân biệt rạch ròi giữa: (A) Dữ liệu ngữ cảnh thực tế của doanh nghiệp trong hệ thống (được cung cấp tại mục DỮ KIỆN NGỮ CẢNH DOANH NGHIỆP - không bị thay đổi bởi câu hỏi) và (B) Tình huống giả định trong câu hỏi của người dùng (chỉ dùng làm tiền đề để phân tích, tư vấn nghĩa vụ và giải thích quy định pháp luật cho người dùng tham khảo).\n\n` +
                      `### 4. QUY TẮC XÁC ĐỊNH NGHĨA VỤ ÁP DỤNG\n` +
                      `Sử dụng các trạng thái diễn đạt bằng tiếng Việt tự nhiên:\n` +
                      `- "Đã xác định nghĩa vụ áp dụng": có đủ thông tin và căn cứ để xác định nghĩa vụ thuộc doanh nghiệp.\n` +
                      `- "Có khả năng áp dụng nhưng chưa đủ dữ liệu": có dấu hiệu liên quan nhưng cần bổ sung thông tin.\n` +
                      `- "Cần xác minh thông tin hoặc căn cứ pháp lý": chưa đủ cơ sở để kết luận.\n` +
                      `- "Đã có căn cứ xác định không áp dụng": có đủ thông tin và căn cứ để xác định nghĩa vụ không áp dụng.\n` +
                      `TUYỆT ĐỐI KHÔNG xuất mã kỹ thuật backend như APPLICABLE, POSSIBLE, NEEDS_VERIFICATION, NOT_APPLICABLE.\n\n` +
                      `### 5. QUY TẮC KIỂM TRA CĂN CỨ PHÁP LÝ\n` +
                      `Ưu tiên văn bản pháp luật chính thức và cơ sở dữ liệu quốc gia. Kiểm tra số hiệu, điều/khoản/điểm, ngày hiệu lực và liên kết tra cứu chính thức. Không tạo trích dẫn giả.\n\n` +
                      `### 6. QUY TẮC VỀ THỜI HẠN VÀ TIỀN THUẾ\n` +
                      `- Không mặc định mọi doanh nghiệp có cùng kỳ kê khai hay hạn nộp.\n` +
                      `- Thuế TNDN tạm nộp: Phân biệt tạm nộp 4 quý với quyết toán năm; tổng 4 quý tối thiểu 80% cả năm; hạn chốt 80% là ngày 31/01 năm sau (theo Khoản 3 Điều 1 NĐ 91/2022/NĐ-CP); tiền chậm nộp 0.03%/ngày tính từ 01/02 năm sau (sau hạn quý 4); KHÔNG mặc định hạn 30/10.\n` +
                      `- Thanh toán không dùng tiền mặt: Hóa đơn từ ngưỡng luật định (từ 20 triệu trước 01/07/2025; theo Luật Thuế GTGT 48/2024 từ 01/07/2025). Tuyệt đối không hướng dẫn rằng chuyển khoản sau khi đã thanh toán tiền mặt chắc chắn khắc phục được điều kiện thuế.\n` +
                      `- Thuế TNCN & Tiền lương: Tách riêng Đăng ký MST cá nhân (cho 100% NLĐ có HĐLĐ), Giảm trừ người phụ thuộc (chỉ người có người phụ thuộc hợp pháp và hồ sơ chứng minh; không mặc định mọi nhân viên đều có), Khấu trừ, Kê khai tháng/quý và Quyết toán năm.\n` +
                      `- Không tự tính hoặc công bố số tiền phạt hay tiền chậm nộp nếu thiếu dữ liệu đầu vào cần thiết.\n\n` +
                      `### 7. QUY TẮC KIỂM TRA BẰNG CHỨNG & 8. QUY TẮC TỔNG HỢP TRẠNG THÁI\n` +
                      `Số liệu tổng quan phải được tính từ cùng một danh sách nghĩa vụ thực tế; không tự viết số lượng trạng thái bằng suy đoán. Tổng các trạng thái phải khớp 100% với số lượng nghĩa vụ.\n\n` +
                      `### 11. PHONG CÁCH TRÌNH BÀY\n` +
                      `- Tiếng Việt rõ ràng, chuyên nghiệp, dễ hiểu với chủ doanh nghiệp.\n` +
                      `- TUYỆT ĐỐI KHÔNG hiển thị mã kỹ thuật backend (APPLICABLE, POSSIBLE, NEEDS_VERIFICATION, NOT_APPLICABLE, COMPLETED, IN_PROGRESS, OVERDUE).\n\n`;

                    if (dlplGroundingContext) {
                      prompt += `### CĂN CỨ VĂN BẢN PHÁP LUẬT THAM CHIẾU:\n${dlplGroundingContext}\n\n`;
                    }

                    if (isEnterpriseQuery) {
                      prompt +=
                        `### DỮ KIỆN NGỮ CẢNH CỦA DOANH NGHIỆP TRONG HỆ THỐNG:\n${denseContext}\n\n` +
                        `## HƯỚNG DẪN BẮT BUỘC (MỤC 9 - CẤU TRÚC OUTPUT RÀ SOÁT TỔNG THỂ DOANH NGHIỆP - 10 PHẦN CHUẨN MỰC):\n` +
                        `Trình bày câu trả lời đầy đủ và rõ ràng theo đúng 10 phần sau:\n` +
                        `1. **Tổng quan**: Trình bày rõ số nghĩa vụ hoàn thành, chưa hoàn thành, cần xác minh (đồng bộ với dữ liệu hệ thống ghi nhận, không bịa số liệu).\n` +
                        `2. **Kết luận**: Nêu rõ vấn đề đã xác nhận và vấn đề chưa đủ dữ liệu.\n` +
                        `3. **Nghĩa vụ áp dụng**: Vì sao áp dụng, điều kiện áp dụng, mức độ chắc chắn. Nêu rõ bằng ngôn ngữ tiếng Việt tự nhiên: "Đã xác định nghĩa vụ áp dụng", "Có khả năng áp dụng nhưng chưa đủ dữ liệu", "Cần xác minh thông tin hoặc căn cứ", "Đã có căn cứ xác định không áp dụng".\n` +
                        `4. **Căn cứ pháp lý**: Trích dẫn chính xác tên văn bản, điều khoản, hiệu lực, nguồn kiểm chứng tra cứu chính thức.\n` +
                        `5. **Dữ liệu đầu vào**: Nêu rõ dữ liệu doanh nghiệp làm căn cứ, nguồn dữ liệu và ngày cập nhật (phân biệt rõ thông tin thực tế hệ thống đang ghi nhận với tình huống giả sử người dùng đưa ra tham khảo tư vấn; câu hỏi giả sử không tự ý biến thành dữ liệu doanh nghiệp).\n` +
                        `6. **Kỳ và thời hạn**: Kỳ tính thuế, hạn nộp, căn cứ xác định hạn (LƯU Ý: TNDN 80% áp dụng cho tổng 4 quý trước ngày 31/01 năm sau; không mặc định hạn 30/10; TNCN theo tháng/quý tuỳ kỳ GTGT).\n` +
                        `7. **Bằng chứng còn thiếu**: Tên hồ sơ, kỳ liên quan, bằng chứng đã có trong hệ thống (chưa có chứng từ KHÔNG đồng nghĩa với vi phạm).\n` +
                        `8. **Rủi ro**: Điều kiện phát sinh, hậu quả có thể xảy ra theo quy định pháp luật (chỉ nêu rủi ro có căn cứ; KHÔNG tự tính số tiền phạt hay tiền chậm nộp khi thiếu dữ liệu đầu vào; thanh toán tiền mặt thì chuyển khoản sau không mặc định khắc phục).\n` +
                        `9. **Hành động tiếp theo**: Thứ tự ưu tiên, người phụ trách, hạn xử lý, điều kiện hoàn tất.\n` +
                        `10. **Câu hỏi xác minh**: Một câu hỏi cụ thể, trọng tâm nhất để giải quyết điểm chưa rõ nhất cho chủ doanh nghiệp.\n`;
                    } else {
                      prompt +=
                        `## HƯỚNG DẪN BẮT BUỘC (MỤC 10 - QUY TẮC KHI TRẢ LỜI CÂU HỎI NGẮN / LUẬT CHUNG):\n` +
                        `Người dùng đang hỏi về một nghĩa vụ, quy định hoặc vấn đề pháp luật cụ thể, KHÔNG yêu cầu rà soát tổng thể doanh nghiệp.\n` +
                        `- Trả lời trực tiếp vào câu hỏi trước một cách rõ ràng, chính xác, súc tích.\n` +
                        `- Giải thích nội dung quy định và điều kiện áp dụng.\n` +
                        `- Nêu rõ căn cứ pháp lý đã xác minh (Tên văn bản, số hiệu, điều/khoản/điểm áp dụng).\n` +
                        `- Chỉ ra dữ liệu còn thiếu hoặc điểm cần lưu ý.\n` +
                        `- Đề xuất hành động phù hợp và kết thúc.\n` +
                        `- TUYỆT ĐỐI KHÔNG lặp lại toàn bộ báo cáo rà soát 10 phần nếu không cần thiết.`;
                    }
                    return prompt;
                  })(),
                },
                ...(dto.history || []),
                { role: 'user', content: rawMessage },
              ],
              temperature: 0.2,
              max_tokens: 4096,
            }),
          });

          if (response.ok) {
            successfulResponse = response;
            break; // Thành công -> Thoát vòng lặp failover
          } else if (response.status === 503 || response.status === 429 || response.status === 404) {
            const errBody = await response.text();
            this.logger.warn(`Model ${currentModel} trả về HTTP ${response.status} (${errBody.slice(0, 100)}). Tự động chuyển đổi sang model tiếp theo...`);
            lastError = new Error(`HTTP ${response.status}: ${errBody}`);
          } else {
            throw new Error(`OpenCode API HTTP ${response.status}`);
          }
        } catch (callErr: unknown) {
          const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
          this.logger.warn(`Lỗi khi gọi model ${currentModel}: ${errMsg}. Thử model tiếp theo...`);
          lastError = callErr instanceof Error ? callErr : new Error(String(callErr));
        }
      }

      if (successfulResponse && successfulResponse.ok) {
        const data = await successfulResponse.json();
        replyContent = data.choices?.[0]?.message?.content || data.content || '';

        const extractedCitations = extractLegalCitationsFromText(replyContent);
        for (const c of extractedCitations) {
          const isAlreadyCited = citedSources.some(
            (s) => s.docNumber.toLowerCase() === c.docNumber.toLowerCase() || s.title.toLowerCase() === c.title.toLowerCase()
          );
          if (!isAlreadyCited) {
            citedSources.push(c);
          }
        }
      } else {
        throw lastError || new Error('Tất cả các mô hình AI dự phòng đều tạm thời chưa phản hồi.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`OpenCode API tạm thời chưa phản hồi (${errMsg || 'Lỗi kết nối'}). Kích hoạt Fallback Engine với Dữ Liệu Pháp Luật DLPL.`);
      if (dlplDocs.length > 0) {
        replyContent = `Dựa trên dữ liệu tra cứu từ **Cổng Dữ Liệu Pháp Luật Việt Nam (DLPL)** cho **${org.name}**:\n\n` +
          (dlplDocs as Array<{ code?: string; name?: string; status?: string; sourceUrl?: string }>).map((d, idx) => `${idx + 1}. **${d.name}**\n   - Số hiệu: **${d.code}**\n   - Trạng thái: **${d.status}**\n   - Nguồn: [Tra cứu văn bản DLPL](${d.sourceUrl})`).join('\n\n') +
          (dlplPenalties.length > 0
            ? `\n\n**Chế tài xử phạt vi phạm hành chính liên quan:**\n` +
              (dlplPenalties as Array<{ behavior?: string; name?: string; fine_range?: string; penalty_amount?: string }>).map((p) => `- ${p.behavior || p.name || 'Hành vi'}: Khung phạt ${p.fine_range || p.penalty_amount || 'theo quy định'}`).join('\n')
            : '') +
          `\n\n*Thông tin này đã được tự động lưu vào bộ nhớ đệm (Cache 30 ngày) của CELRA để phục vụ các lần tra cứu tiếp theo mà không tốn thêm lượt gọi.*`;
      } else {
        // Fallback thông minh theo đúng chủ đề người dùng đang hỏi (không trả ra báo cáo chung)
        const isFilingPeriodTopic = /(han nop|hạn nộp|ky ke khai|kỳ kê khai|thoi han|thời hạn|to khai|tờ khai|quy nay|quý này|thang nay|tháng này)/i.test(normalized);
        const isMonBaiTopic = /(mon bai|môn bài)/i.test(normalized);
        const isTndnTopic = !isFilingPeriodTopic && /(tndn|thu nhap doanh nghiep|80%)/i.test(normalized);
        const isCashPaymentTopic = /(tien mat|tiền mặt|20 trieu|20 triệu|chuyen khoan|chuyển khoản|ngan hang)/i.test(normalized);
        const isSalaryTopic = !isFilingPeriodTopic && /(luong|lương|tncn|thu nhap ca nhan|nhan su|nhân sự|nguoi phu thuoc|người phụ thuộc)/i.test(normalized);
        if (isMonBaiTopic) {
          replyContent = isEnterpriseQuery
            ? `**BÁO CÁO RÀ SOÁT LỆ PHÍ MÔN BÀI CHO: ${org.name}**\n\n` +
              `1. **Tổng quan**: Doanh nghiệp có 1 nghĩa vụ pháp định hàng năm về lệ phí môn bài; trạng thái đang thực hiện chuẩn bị hoặc cần đối chiếu chứng từ nộp NSNN.\n` +
              `2. **Kết luận**: Đã xác nhận doanh nghiệp thuộc đối tượng nộp lệ phí môn bài; cần đối chiếu Giấy nộp tiền NSNN để xác nhận hoàn tất.\n` +
              `3. **Nghĩa vụ áp dụng**: Đã xác định nghĩa vụ áp dụng. Căn cứ theo Giấy chứng nhận ĐKDN và mức vốn điều lệ đăng ký.\n` +
              `4. **Căn cứ pháp lý**: Nghị định 139/2016/NĐ-CP (Điều 4, Điều 5); Nghị định 22/2020/NĐ-CP (Khoản 1 Điều 1); Nghị định 125/2020/NĐ-CP (Điều 13).\n` +
              `5. **Dữ liệu đầu vào**: Doanh nghiệp: ${org.name}, MST: ${org.taxCode}, Quy mô: ${org.employeeCount || 0} người. Nguồn: Khảo sát hệ thống ghi nhận.\n` +
              `6. **Kỳ và thời hạn**: Kỳ tính thuế: Năm hiện tại. Hạn nộp: Chậm nhất ngày 30/01 hàng năm (nếu DN mới thành lập được miễn năm đầu, nộp chậm nhất 30/01 năm sau).\n` +
              `7. **Bằng chứng còn thiếu**: Giấy nộp tiền vào NSNN hoặc giấy báo Nợ ngân hàng xác nhận giao dịch nộp tiền môn bài thành công.\n` +
              `8. **Rủi ro**: Chậm nộp tờ khai hoặc tiền lệ phí môn bài phát sinh tiền chậm nộp 0.03%/ngày theo Luật Quản lý thuế số 38/2019/QH14 và xử phạt hành chính từ 2.000.000đ đến 25.000.000đ.\n` +
              `9. **Hành động tiếp theo**: Kế toán lập tờ khai 01/LPMB nếu có thay đổi vốn, trích nộp tiền qua thuedientu.gdt.gov.vn trước 30/01 và lưu trữ chứng từ.\n` +
              `10. **Câu hỏi xác minh**: Doanh nghiệp đã thực hiện nộp tiền lệ phí môn bài năm nay vào tài khoản Kho bạc Nhà nước chưa và đã có Giấy nộp tiền chưa?`
            : `**QUY ĐỊNH PHÁP LUẬT VỀ LỆ PHÍ MÔN BÀI:**\n\n` +
              `**1. Bản chất & Mức nộp:**\n` +
              `- Lệ phí môn bài là khoản thu hàng năm đối với tổ chức, cá nhân hoạt động sản xuất, kinh doanh hàng hóa, dịch vụ.\n` +
              `- Đối với tổ chức: Vốn điều lệ trên 10 tỷ đồng: 3.000.000 đồng/năm; Vốn điều lệ từ 10 tỷ đồng trở xuống: 2.000.000 đồng/năm; Chi nhánh, văn phòng đại diện: 1.000.000 đồng/năm.\n\n` +
              `**2. Thời hạn nộp:**\n` +
              `- Chậm nhất ngày **30/01 hàng năm** (theo Nghị định 139/2016/NĐ-CP và Nghị định 22/2020/NĐ-CP).\n` +
              `- Miễn lệ phí môn bài năm đầu tiên thành lập cho doanh nghiệp mới thành lập (theo Nghị định 22/2020/NĐ-CP).\n\n` +
              `**3. Căn cứ pháp lý & Chế tài:**\n` +
              `- Căn cứ: Nghị định 139/2016/NĐ-CP và Nghị định 22/2020/NĐ-CP.\n` +
              `- Chế tài: Chậm nộp tiền lệ phí môn bài bị tính tiền chậm nộp 0.03%/ngày theo Luật Quản lý thuế số 38/2019/QH14.`;

          citedSources.push(
            { title: 'Nghị định 139/2016/NĐ-CP quy định về lệ phí môn bài', docNumber: '139/2016/NĐ-CP', articleNumber: 'Điều 4, Điều 5', sourceUrl: CORE_LEGAL_DOC_LINKS['139/2016'] },
            { title: 'Nghị định 22/2020/NĐ-CP sửa đổi Nghị định 139/2016/NĐ-CP', docNumber: '22/2020/NĐ-CP', articleNumber: 'Khoản 1 Điều 1', sourceUrl: CORE_LEGAL_DOC_LINKS['22/2020'] },
          );
        } else if (isTndnTopic) {
          replyContent = isEnterpriseQuery
            ? `**BÁO CÁO RÀ SOÁT TẠM NỘP THUẾ TNDN 80% CHO: ${org.name}**\n\n` +
              `1. **Tổng quan**: Nghĩa vụ tạm nộp thuế TNDN 4 quý tối thiểu 80% cả năm; hệ thống ghi nhận đang trong tiến độ thực hiện các quý trong năm tài chính.\n` +
              `2. **Kết luận**: Đã xác định nghĩa vụ áp dụng; hiện chưa đủ dữ liệu báo cáo tài chính cả năm để tính chính xác tỷ lệ 80% và không tự sinh số tiền chậm nộp khi thiếu dữ liệu đầu vào.\n` +
              `3. **Nghĩa vụ áp dụng**: Đã xác định nghĩa vụ áp dụng đối với doanh nghiệp có hoạt động sản xuất kinh doanh có phát sinh thu nhập chịu thuế TNDN.\n` +
              `4. **Căn cứ pháp lý**: Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP sửa đổi Điều 8 Nghị định 126/2020/NĐ-CP; Điều 44, Điều 59 Luật Quản lý thuế số 38/2019/QH14.\n` +
              `5. **Dữ liệu đầu vào**: Doanh nghiệp: ${org.name}, Ngành nghề: ${org.industry || 'Chung'}. Nguồn: Khai báo hệ thống.\n` +
              `6. **Kỳ và thời hạn**: Tạm nộp theo 4 quý: Q1 (30/04), Q2 (31/07), Q3 (31/10), Q4 (31/01 năm sau). Hạn chót tạm nộp 4 quý tối thiểu đạt 80% cả năm là ngày 31/01 năm sau (theo năm dương lịch).\n` +
              `7. **Bằng chứng còn thiếu**: Giấy nộp tiền thuế TNDN tạm nộp các quý và Bảng ước tính kết quả kinh doanh 4 quý.\n` +
              `8. **Rủi ro**: Nếu tổng số tạm nộp 4 quý thấp hơn 80% số thuế TNDN phải nộp theo quyết toán năm, tiền chậm nộp 0.03%/ngày tính từ ngày 01/02 của năm tiếp theo trên số tiền nộp thiếu (tuyệt đối không tính từ 30/10).\n` +
              `9. **Hành động tiếp theo**: Kế toán ước tính doanh thu và tạm nộp theo từng quý; rà soát lũy kế 4 quý trước ngày 31/01 năm sau để đảm bảo tối thiểu 80% số thuế TNDN dự kiến quyết toán cả năm.\n` +
              `10. **Câu hỏi xác minh**: Doanh nghiệp đã ước tính tổng số thuế TNDN phải nộp của năm nay và tổng số tiền đã tạm nộp vào NSNN qua các quý là bao nhiêu?`
            : `**QUY ĐỊNH PHÁP LUẬT VỀ TẠM NỘP THUẾ TNDN 80%:**\n\n` +
              `**1. Bản chất quy định:**\n` +
              `- Tổng số thuế TNDN đã tạm nộp của 04 quý không được thấp hơn 80% số thuế TNDN phải nộp theo quyết toán năm.\n\n` +
              `**2. Thời hạn tạm nộp & Hạn chốt 80%:**\n` +
              `- Tạm nộp theo quý: Hạn nộp là ngày cuối cùng của tháng đầu quý tiếp theo (Q1: 30/04, Q2: 31/07, Q3: 31/10, Q4: 31/01 năm sau).\n` +
              `- Hạn chót nộp đủ ngưỡng 80% cả năm là ngày **31/01 của năm tiếp theo** (theo Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP).\n\n` +
              `**3. Căn cứ pháp lý & Chế tài:**\n` +
              `- Căn cứ: Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP sửa đổi Điều 8 Nghị định 126/2020/NĐ-CP; Điều 59 Luật Quản lý thuế số 38/2019/QH14.\n` +
              `- Chế tài: Trường hợp nộp thiếu so với ngưỡng 80% cả năm, doanh nghiệp phải nộp tiền chậm nộp 0.03%/ngày tính trên số tiền nộp thiếu kể từ ngày tiếp sau ngày cuối cùng của thời hạn tạm nộp quý 4 (tức từ ngày 01/02 của năm tiếp theo) đến ngày nộp vào NSNN. Tuyệt đối không tính tiền chậm nộp từ hạn quý 3 (31/10).`;
          citedSources.push({ title: 'Nghị định 91/2022/NĐ-CP về tạm nộp TNDN 80%', docNumber: '91/2022/NĐ-CP', articleNumber: 'Khoản 3 Điều 1', sourceUrl: CORE_LEGAL_DOC_LINKS['91/2022'] });
        } else if (isCashPaymentTopic) {
          replyContent = isEnterpriseQuery
            ? `**BÁO CÁO RÀ SOÁT CHỨNG TỪ THANH TOÁN KHÔNG DÙNG TIỀN MẶT CHO: ${org.name}**\n\n` +
              `1. **Tổng quan**: Nghĩa vụ kiểm soát chứng từ thanh toán không dùng tiền mặt cho các hóa đơn mua vào từ ngưỡng luật định; cần rà soát 100% chứng từ ngân hàng.\n` +
              `2. **Kết luận**: Đã xác định nghĩa vụ áp dụng; các hóa đơn mua vào từ 20 triệu đồng (hoặc theo Luật Thuế GTGT 48/2024 từ 01/07/2025) bắt buộc phải thanh toán qua ngân hàng.\n` +
              `3. **Nghĩa vụ áp dụng**: Đã xác định nghĩa vụ áp dụng đối với toàn bộ giao dịch mua hàng hóa, dịch vụ có hóa đơn từng lần từ ngưỡng luật định.\n` +
              `4. **Căn cứ pháp lý**: Điều 4 Thông tư 96/2015/TT-BTC; Điều 15 Thông tư 219/2013/TT-BTC; Điều 14 Luật Thuế GTGT số 48/2024/QH15.\n` +
              `5. **Dữ liệu đầu vào**: Doanh nghiệp: ${org.name}, Mô hình: ${org.businessModel || 'Tiêu chuẩn'}.\n` +
              `6. **Kỳ và thời hạn**: Thời điểm thanh toán từng hóa đơn phát sinh trong kỳ tính thuế.\n` +
              `7. **Bằng chứng còn thiếu**: Ủy nhiệm chi (UNC) và Sao kê tài khoản ngân hàng khớp đúng thông tin và số tài khoản người bán trên hóa đơn.\n` +
              `8. **Rủi ro**: Bị loại khỏi chi phí được trừ khi tính thuế TNDN và không được khấu trừ thuế GTGT đầu vào. Cảnh báo bắt buộc: Trường hợp đã trả tiền mặt, việc chuyển khoản bổ sung sau đó mà không có thủ tục điều chỉnh/hủy hợp pháp sẽ không mặc định hợp lệ hóa chi phí.\n` +
              `9. **Hành động tiếp theo**: Kế toán thu thập và đối soát Ủy nhiệm chi kèm theo từng hóa đơn mua vào; kiểm soát phương thức thanh toán trước khi chi tiền.\n` +
              `10. **Câu hỏi xác minh**: Trong kỳ doanh nghiệp có phát sinh hóa đơn mua hàng từ 20 triệu đồng trở lên nào thanh toán bằng tiền mặt chưa chuyển khoản qua ngân hàng không?`
            : `**QUY ĐỊNH PHÁP LUẬT VỀ CHỨNG TỪ THANH TOÁN KHÔNG DÙNG TIỀN MẶT:**\n\n` +
              `**1. Điều kiện áp dụng:**\n` +
              `- Hàng hóa, dịch vụ mua vào từng lần có giá trị từ ngưỡng luật định (từ 20 triệu đồng trước 01/07/2025; theo Luật Thuế GTGT 48/2024/QH15 từ 01/07/2025) bắt buộc phải có chứng từ thanh toán không dùng tiền mặt.\n\n` +
              `**2. Lưu ý quan trọng về thanh toán tiền mặt:**\n` +
              `- Trường hợp đã thực hiện thanh toán bằng tiền mặt tại thời điểm mua hàng, việc chuyển khoản bổ sung sau đó mà không có thỏa thuận hủy giao dịch/trả lại tiền mặt và thực hiện lại đúng quy định pháp luật sẽ không mặc định hợp lệ hóa chi phí được trừ và khấu trừ thuế GTGT.\n\n` +
              `**3. Căn cứ pháp lý:**\n` +
              `- Điều 4 Thông tư 96/2015/TT-BTC về thuế TNDN.\n` +
              `- Điều 15 Thông tư 219/2013/TT-BTC về thuế GTGT.\n` +
              `- Điều 14 Luật Thuế GTGT số 48/2024/QH15 (hiệu lực từ 01/07/2025).`;
          citedSources.push(
            { title: 'Thông tư 96/2015/TT-BTC hướng dẫn thuế TNDN', docNumber: '96/2015/TT-BTC', articleNumber: 'Điều 4', sourceUrl: CORE_LEGAL_DOC_LINKS['96/2015'] },
            { title: 'Thông tư 219/2013/TT-BTC hướng dẫn thuế GTGT', docNumber: '219/2013/TT-BTC', articleNumber: 'Điều 15', sourceUrl: CORE_LEGAL_DOC_LINKS['219/2013'] },
          );
        } else if (isSalaryTopic) {
          replyContent = isEnterpriseQuery
            ? `**BÁO CÁO RÀ SOÁT HỒ SƠ LƯƠNG & THUẾ TNCN CHO: ${org.name}**\n\n` +
              `1. **Tổng quan**: Nghĩa vụ hồ sơ nhân sự, tiền lương và thuế TNCN gồm nhiều phần riêng biệt: cấp MST, giảm trừ gia cảnh, khấu trừ và kê khai.\n` +
              `2. **Kết luận**: Đã xác nhận doanh nghiệp có phát sinh lao động; cần tách bạch nghĩa vụ đăng ký MST cá nhân và nghĩa vụ đăng ký người phụ thuộc.\n` +
              `3. **Nghĩa vụ áp dụng**: Đã xác định nghĩa vụ áp dụng đối với người lao động có ký hợp đồng lao động; riêng đăng ký người phụ thuộc chỉ áp dụng khi người lao động thực tế có người phụ thuộc hợp pháp.\n` +
              `4. **Căn cứ pháp lý**: Thông tư 111/2013/TT-BTC (Điều 9, Điều 25); Thông tư 96/2015/TT-BTC (Điều 4); Nghị định 126/2020/NĐ-CP (Điều 8, Điều 9).\n` +
              `5. **Dữ liệu đầu vào**: Doanh nghiệp: ${org.name}, Quy mô nhân sự: ${org.employeeCount || 0} người.\n` +
              `6. **Kỳ và thời hạn**: Kê khai thuế TNCN định kỳ theo tháng (hạn ngày 20) hoặc theo quý (hạn ngày cuối tháng đầu quý sau); quyết toán năm chậm nhất 31/03 năm sau.\n` +
              `7. **Bằng chứng còn thiếu**: Hợp đồng lao động, Bảng chấm công, Bảng thanh toán lương có chữ ký hoặc sao kê chuyển khoản lương, hồ sơ chứng minh người phụ thuộc (nếu có).\n` +
              `8. **Rủi ro**: Chi phí lương không có chứng từ hợp pháp bị loại toàn bộ khỏi chi phí được trừ; khai thiếu thuế TNCN bị phạt 20% và tính tiền chậm nộp 0.03%/ngày.\n` +
              `9. **Hành động tiếp theo**: Rà soát đăng ký MST cá nhân cho 100% nhân sự mới; chỉ lập hồ sơ giảm trừ gia cảnh cho nhân sự thực tế có người phụ thuộc đủ điều kiện; chỉ nộp tờ khai TNCN khi có phát sinh khấu trừ thuế trong kỳ.\n` +
              `10. **Câu hỏi xác minh**: Doanh nghiệp hiện có bao nhiêu lao động ký hợp đồng từ 3 tháng trở lên và toàn bộ nhân sự đã được đăng ký Mã số thuế cá nhân chưa?`
            : `**QUY ĐỊNH PHÁP LUẬT VỀ HỒ SƠ LƯƠNG VÀ THUẾ TNCN:**\n\n` +
              `**1. Đăng ký Mã số thuế cá nhân:**\n` +
              `- Doanh nghiệp có trách nhiệm đăng ký thuế thay cho cá nhân có thu nhập từ tiền lương, tiền công trong thời hạn 10 ngày làm việc kể từ ngày phát sinh nghĩa vụ thuế (Điều 30 Luật Quản lý thuế số 38/2019/QH14).\n\n` +
              `**2. Đăng ký người phụ thuộc giảm trừ gia cảnh:**\n` +
              `- Chỉ thực hiện đối với người lao động thực tế có người phụ thuộc đủ điều kiện và nộp đầy đủ hồ sơ chứng minh. Không mặc định mọi người lao động đều có người phụ thuộc (Điều 9 Thông tư 111/2013/TT-BTC).\n\n` +
              `**3. Khấu trừ và Kê khai thuế:**\n` +
              `- Doanh nghiệp kê khai thuế GTGT theo quý thì kê khai thuế TNCN theo quý; trường hợp không phát sinh khấu trừ thuế TNCN trong kỳ thì không phải nộp tờ khai (Nghị định 126/2020/NĐ-CP và Nghị định 91/2022/NĐ-CP).\n\n` +
              `**4. Căn cứ pháp lý:**\n` +
              `- Thông tư 111/2013/TT-BTC, Thông tư 96/2015/TT-BTC và Nghị định 126/2020/NĐ-CP.`;
          citedSources.push(
            { title: 'Thông tư 111/2013/TT-BTC hướng dẫn thuế TNCN', docNumber: '111/2013/TT-BTC', articleNumber: 'Điều 9, Điều 25', sourceUrl: CORE_LEGAL_DOC_LINKS['111/2013'] },
            { title: 'Nghị định 126/2020/NĐ-CP hướng dẫn Luật Quản lý thuế', docNumber: '126/2020/NĐ-CP', articleNumber: 'Điều 8, Điều 9', sourceUrl: CORE_LEGAL_DOC_LINKS['126/2020'] },
          );
        } else {
          replyContent = isEnterpriseQuery
            ? `**BÁO CÁO RÀ SOÁT THỜI HẠN & KỲ KÊ KHAI THUẾ CHO: ${org.name}**\n\n` +
              `1. **Tổng quan**: Báo cáo tổng thể kỳ kê khai và thời hạn nộp các sắc thuế của doanh nghiệp (Môn bài, GTGT, TNDN tạm nộp 4 quý, Quyết toán năm).\n` +
              `2. **Kết luận**: Đã xác nhận các mốc thời hạn kê khai và nộp thuế theo kỳ Tháng, Quý hoặc Năm; không có sắc thuế nào kê khai theo ngày cố định.\n` +
              `3. **Nghĩa vụ áp dụng**: Đã xác định nghĩa vụ áp dụng các sắc thuế pháp định cho doanh nghiệp theo quy định của Luật Quản lý thuế số 38/2019/QH14.\n` +
              `4. **Căn cứ pháp lý**: Luật Quản lý thuế số 38/2019/QH14 (Điều 44, Điều 59); Nghị định 126/2020/NĐ-CP (Điều 8, Điều 18); Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1).\n` +
              `5. **Dữ liệu đầu vào**: Doanh nghiệp: ${org.name}, Mã số thuế: ${org.taxCode}, Quy mô: ${org.employeeCount || 0} người.\n` +
              `6. **Kỳ và thời hạn**:\n` +
              `   - Lệ phí môn bài: Chậm nhất ngày 30/01 hàng năm (miễn năm đầu thành lập).\n` +
              `   - Thuế GTGT và TNCN quý: Chậm nhất ngày cuối tháng đầu quý tiếp theo (30/04, 31/07, 31/10, 31/01).\n` +
              `   - Tạm nộp TNDN 80%: Hạn chót tạm nộp 4 quý tối thiểu 80% cả năm là ngày 31/01 năm sau (không mặc định hạn 30/10).\n` +
              `   - Quyết toán năm (TNDN & TNCN): Chậm nhất ngày 31/03 năm tiếp theo.\n` +
              `7. **Bằng chứng còn thiếu**: Thông báo chấp nhận hồ sơ khai thuế điện tử và Giấy nộp tiền NSNN các kỳ.\n` +
              `8. **Rủi ro**: Chậm nộp tờ khai bị phạt tiền từ 2.000.000đ đến 25.000.000đ theo Nghị định 125/2020/NĐ-CP; chậm nộp tiền thuế bị tính tiền chậm nộp 0.03%/ngày.\n` +
              `9. **Hành động tiếp theo**: Thiết lập lịch theo dõi kỳ kê khai, nộp tờ khai và tiền thuế đúng hạn chót pháp định.\n` +
              `10. **Câu hỏi xác minh**: Doanh nghiệp hiện tại đang thực hiện kê khai thuế GTGT theo kỳ tháng hay kỳ quý theo thông báo của cơ quan thuế?`
            : `**QUY ĐỊNH PHÁP LUẬT VỀ THỜI HẠN VÀ KỲ KÊ KHAI THUẾ:**\n\n` +
              `Theo quy định của Luật Quản lý thuế số 38/2019/QH14 và Nghị định 126/2020/NĐ-CP:\n\n` +
              `**1. Kỳ kê khai thuế:**\n` +
              `- Không có sắc thuế nào kê khai theo ngày cố định; toàn bộ sắc thuế được kê khai và nộp theo kỳ: **Năm**, **Quý** hoặc **Tháng**.\n` +
              `- Thuế GTGT và TNCN theo quý: Hạn chót chậm nhất là ngày cuối cùng của tháng đầu quý tiếp theo (30/04, 31/07, 31/10, 31/01).\n` +
              `- Lệ phí môn bài: Hạn chót nộp chậm nhất ngày 30/01 hàng năm (miễn năm đầu thành lập).\n` +
              `- Tạm nộp TNDN 80%: Hạn chót đạt ngưỡng tối thiểu 80% cả năm là ngày **31/01 năm tiếp theo** (theo Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP).\n` +
              `- Quyết toán thuế năm: Chậm nhất ngày cuối cùng của tháng thứ 3 sau năm tài chính (31/03).\n\n` +
              `**2. Các nghĩa vụ liên quan đến ngày:**\n` +
              `- **Tiền chậm nộp tiền thuế tính theo ngày (0.03%/ngày)**: Tính liên tục theo từng ngày chậm nộp kể từ ngày tiếp sau ngày hết hạn.\n` +
              `- **Hóa đơn điện tử máy tính tiền**: Lập ngay tại thời điểm bán hàng trong ngày cho người tiêu dùng (Nghị định 123/2020/NĐ-CP).\n\n` +
              `**3. Căn cứ pháp lý:**\n` +
              `- Luật Quản lý thuế số 38/2019/QH14 (Điều 44, Điều 59).\n` +
              `- Nghị định 126/2020/NĐ-CP (Điều 8, Điều 18).\n` +
              `- Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1).`;

          citedSources.push(
            { title: 'Luật Quản lý thuế số 38/2019/QH14', docNumber: '38/2019/QH14', articleNumber: 'Điều 44, Điều 59', sourceUrl: CORE_LEGAL_DOC_LINKS['38/2019'] },
            { title: 'Nghị định 126/2020/NĐ-CP hướng dẫn Luật Quản lý thuế', docNumber: '126/2020/NĐ-CP', articleNumber: 'Điều 8, Điều 18', sourceUrl: CORE_LEGAL_DOC_LINKS['126/2020'] },
            { title: 'Nghị định 91/2022/NĐ-CP về tạm nộp TNDN 80%', docNumber: '91/2022/NĐ-CP', articleNumber: 'Khoản 3 Điều 1', sourceUrl: CORE_LEGAL_DOC_LINKS['91/2022'] },
          );
        }
        shouldCache = false;
      }
    }

    // ------------------------------------------------------------------------
    // BƯỚC 7: ĐÓNG GÓI KẾT QUẢ TƯ VẤN, LƯU VÀO CACHE 30 NGÀY & PHẢN HỒI THẲNG RA CHATBOX
    // ------------------------------------------------------------------------
    const resultPayload: CachedAnswer = {
      content: replyContent,
      citations: citedSources,
      proposedChecklists: [],
      actionType: isEnterpriseQuery ? 'enterprise_audit' : 'info',
      isEnterpriseQuery: isEnterpriseQuery,
      verificationChecklist: isEnterpriseQuery ? auditReport.verificationChecklist : [],
      timestamp: Date.now(),
    };

    // Chỉ lưu vào Cache khi câu trả lời thực sự đến từ AI hoặc tra cứu hợp lệ
    if (shouldCache) {
      this.setLruCache(this.queryCache, cacheKey, resultPayload, 500);
    }

    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content: replyContent,
      answer: replyContent,
      actionType: resultPayload.actionType,
      isEnterpriseQuery: isEnterpriseQuery,
      verificationChecklist: resultPayload.verificationChecklist,
      citations: citedSources,
      confidenceLevel: 'high',
      confidenceReason: isEnterpriseQuery
        ? 'Phân tích đối chiếu dữ liệu tuân thủ Doanh nghiệp & Căn cứ Pháp luật'
        : 'Giải thích quy định pháp luật & Căn cứ pháp lý hiện hành',
      proposedChecklists: [],
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // LUỒNG CHÍNH 2: CHẤP NHẬN ĐỀ XUẤT CỦA AI ĐỂ TẠO CHECKLIST & TÁC VỤ VÀO DATABASE
  // ============================================================================
  async acceptProposal(orgId: string, userId: string, dto: AcceptProposalDto) {
    if (!orgId) {
      throw new NotFoundException('Thiếu x-organization-id: không xác định được doanh nghiệp');
    }
    const targetOrgId = orgId;
    // Payment Guard: Checklist/Task chỉ được tạo sau khi DN đã thanh toán Rà soát (isAuditPaid)
    const paidAuditExists = await this.prisma.task.count({
      where: { organizationId: targetOrgId, isAuditPaid: true },
    });
    if (paidAuditExists === 0) {
      throw new ForbiddenException('Checklist chỉ được tạo từ Rà soát Tuân thủ (đã thanh toán). Vui lòng mở Rà soát qua thẻ bối cảnh và thanh toán 25 Credit.');
    }
    // Chống tạo trùng task khi user chấp nhận cùng proposal nhiều lần
    const existing = await this.prisma.task.findFirst({
      where: { organizationId: targetOrgId, code: dto.code },
    });
    if (existing) {
      return {
        success: true,
        message: 'Tác vụ đã tồn tại từ đề xuất này, không tạo trùng',
        task: existing,
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo Task thật vào DB
      const dueDate = calculateTaxDeadline('TNDN_80');

      const task = await tx.task.create({
        data: {
          organizationId: targetOrgId,
          code: dto.code,
          title: dto.title,
          category: dto.category,
          priority: dto.priority,
          assigneeName: 'Nhân viên phụ trách',
          assigneeRole: dto.assigneeRole || UserRole.internal_accountant,
          waitingOnRole: WaitingOnRole.internal_accountant,
          waitingOnName: 'Nhân viên phụ trách hoàn tất hồ sơ',
          dueDate,
          isAuditPaid: false,
          status: TaskStatus.need_info,
          description: dto.reason,
          ruleCode: dto.code,
          legalBasis: dto.legalBasis,
          timeline: {
            create: {
              title: 'Tạo tác vụ từ Đề xuất của Trợ lý AI',
              description: `Người dùng chấp nhận đề xuất tác vụ tuân thủ từ CELRA Copilot`,
              actorId: userId,
              actorName,
              actorRole: user?.role || UserRole.owner,
              type: TimelineEventType.status_change,
            },
          },
        },
      });

      return {
        success: true,
        message: 'Đã tạo thành công Tác vụ từ đề xuất của AI',
        task,
      };
    });
  }

  // ============================================================================
  // QUẢN TRỊ KHO QUY ĐỊNH PHÁP LUẬT & HẠN NGẠCH (QUOTA)
  // ============================================================================
  async getLegalRules() {
    return this.prisma.rule.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async updateLegalRule(code: string, dto: UpdateLegalRuleDto) {
    const existing = await this.prisma.rule.findUnique({ where: { code } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy quy định pháp luật với mã: ${code}`);
    }

    const currentJson = (existing.conditionsJson as { [key: string]: unknown }) || {};
    const updatedJson = {
      ...currentJson,
      ...(dto.content ? { content: dto.content } : {}),
    };

    const updated = await this.prisma.rule.update({
      where: { code },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.legalReference ? { legalReference: dto.legalReference } : {}),
        ...(dto.version ? { version: dto.version } : {}),
        ...(dto.conditionSummary ? { conditionSummary: dto.conditionSummary } : {}),
        ...(dto.effectiveDate ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        conditionsJson: updatedJson,
      },
    });

    // Làm mới Cache 30 ngày ngay lập tức để AI áp dụng thông tư mới ngay
    this.queryCache.clear();
    this.logger.log(`[RULE UPDATED] Đã cập nhật văn bản luật cho mã: ${code} và làm mới toàn bộ Cache.`);

    return {
      success: true,
      message: `Đã cập nhật thành công văn bản pháp luật mã ${code} và xóa Cache cũ để kích hoạt văn bản mới`,
      rule: updated,
    };
  }

  async getDLPLQuota() {
    const apiUrl = this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1');
    const apiKey = this.config.get<string>('DLPL_API_KEY', '');
    if (!apiKey) {
      return { success: false, message: 'Chưa cấu hình DLPL_API_KEY trong .env' };
    }

    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/me`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      return { success: false, status: res.status, message: await res.text() };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối DLPL API' };
    }
  }

  // ============================================================================
  // TIẾN TRÌNH CRON: TỰ ĐỘNG ĐỒNG BỘ ĐỊNH KỲ 15 NGÀY MỘT LẦN (NGÀY 1 & 15 HÀNG THÁNG)
  // ============================================================================
  private initBiWeeklySyncSchedule() {
    setInterval(async () => {
      const today = new Date();
      if (today.getDate() === 1 || today.getDate() === 15) {
        this.logger.log(`[CRON JOB - Chu kỳ 15 ngày] Ngày ${today.getDate()}: Quét cập nhật các văn bản/nghị định mới từ API Dữ Liệu Pháp Luật (DLPL)...`);
        await this.syncLegalRulesFromExternalApi();
      }
    }, 24 * 60 * 60 * 1000);
  }

  async syncLegalRulesFromExternalApi() {
    this.logger.log('[SYNC] Đang kiểm tra hiệu lực các văn bản pháp luật qua API Dữ Liệu Pháp Luật (DLPL)...');
    const rules = await this.prisma.rule.findMany();

    let updatedCount = 0;
    for (const rule of rules) {
      if (rule.legalReference) {
        const docs = await this.searchDLPLLegalDocuments(rule.legalReference, 1);
        if (docs.length > 0) {
          const doc = docs[0];
          this.logger.log(`[DLPL SYNC] Quy tắc ${rule.code} (${rule.legalReference}) -> Trạng thái DLPL: ${doc.status} (${doc.name})`);

          if (doc.sourceUrl) {
            const currentPayload = (rule.conditionsJson as { citations?: Array<{ sourceUrl?: string }> }) || {};
            const citations = currentPayload.citations || [];
            if (citations.length > 0 && doc.sourceUrl !== citations[0].sourceUrl) {
              citations[0].sourceUrl = doc.sourceUrl;
              await this.prisma.rule.update({
                where: { id: rule.id },
                data: {
                  conditionsJson: { ...currentPayload, citations },
                },
              });
              this.logger.log(`[DLPL SYNC] ✅ Đã tự động cập nhật link mới cho quy tắc ${rule.code}: ${doc.sourceUrl}`);
            }
          }
        }
      }

      await this.prisma.rule.update({
        where: { id: rule.id },
        data: { updatedAt: new Date() },
      });
      updatedCount++;

      // Tạm dừng 600ms giữa các văn bản để tuân thủ giới hạn burst <= 2 req/s của DLPL API
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    // Làm mới toàn bộ Cache để người dùng luôn nhận thông tin văn bản cập nhật nhất
    this.queryCache.clear();
    this.logger.log(`[SYNC COMPLETED] Đã đối chiếu và làm mới ${updatedCount} quy định pháp luật qua DLPL API. Đã reset Cache để cập nhật luật mới.`);

    return {
      success: true,
      message: `Đã đối chiếu thành công ${updatedCount} văn bản pháp luật qua DLPL API (Chu kỳ tự động 15 ngày/lần)`,
      syncedAt: new Date().toISOString(),
      syncCycle: '15 ngày / lần (Ngày 1 & Ngày 15 hàng tháng)',
    };
  }

  // ============================================================================
  // HÀM KẾT NỐI API NGOÀI & TIỆN ÍCH PHỤ TRỢ (HELPER METHODS)
  // ============================================================================
  async searchDLPLLegalDocuments(query: string, limit = 3) {
    const normalizedQuery = this.normalizeText(query).slice(0, 100);
    const cached = this.dlplDocsCache.get(normalizedQuery);
    if (cached && Date.now() - cached.timestamp < this.DLPL_CACHE_TTL_MS) {
      this.logger.log(`[DLPL CACHE HIT] Trả kết quả văn bản DLPL từ cache nội bộ (0 API call) cho: "${normalizedQuery}"`);
      return cached.data as Array<{ id: string; code: string; name: string; database: string; status: string; effectiveDate: string; issuedDate: string; sourceUrl: string }>;
    }

    const apiUrl = this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1');
    const apiKey = this.config.get<string>('DLPL_API_KEY', '');
    if (!apiKey) return [];

    const url = `${apiUrl.replace(/\/+$/, '')}/legal-documents?q=${encodeURIComponent(query)}&database=vbqppl&status_id=1&sort=relevance&per_page=${limit}`;
    const res = await this.fetchWithRetry(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const json: Record<string, unknown> = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped = (json.data as Record<string, unknown>[]).map((doc) => ({
          id: String(doc.id || ''),
          code: String(doc.code || ''),
          name: String(doc.name || ''),
          database: String(doc.database || ''),
          status: (doc.status as Record<string, unknown>)?.name ? String((doc.status as Record<string, unknown>).name) : 'Còn hiệu lực',
          effectiveDate: String(doc.effective_date || ''),
          issuedDate: String(doc.issued_date || ''),
          sourceUrl: cleanDLPLUrl(doc.source_url as string) || matchCoreLegalDocUrl(doc.code as string) || `https://dulieuphapluat.vn/van-ban/tim-kiem.html?q=${encodeURIComponent(doc.code as string)}`,
        }));
        this.setLruCache(this.dlplDocsCache, normalizedQuery, { data: mapped, timestamp: Date.now() }, 300);
        return mapped;
      }
    } else if (res.status === 429) {
      this.logger.warn('[DLPL API] Đã chạm hạn ngạch 1.000 lượt/tháng (HTTP 429 quota_exceeded). Tự động dùng Local Fallback.');
    }
    return [];
  }

  async searchDLPLPenalties(query: string, limit = 2) {
    const normalizedQuery = this.normalizeText(query).slice(0, 100);
    const cached = this.dlplPenaltiesCache.get(normalizedQuery);
    if (cached && Date.now() - cached.timestamp < this.DLPL_CACHE_TTL_MS) {
      this.logger.log(`[DLPL CACHE HIT] Trả kết quả mức phạt DLPL từ cache nội bộ (0 API call) cho: "${normalizedQuery}"`);
      return cached.data;
    }

    const apiUrl = this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1');
    const apiKey = this.config.get<string>('DLPL_API_KEY', '');
    if (!apiKey) return [];

    const url = `${apiUrl.replace(/\/+$/, '')}/administrative-penalties?q=${encodeURIComponent(query)}&per_page=${limit}`;
    const res = await this.fetchWithRetry(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const json: Record<string, unknown> = await res.json();
      if (json.success && Array.isArray(json.data)) {
        this.setLruCache(this.dlplPenaltiesCache, normalizedQuery, { data: json.data, timestamp: Date.now() }, 300);
        return json.data;
      }
    }
    return [];
  }

  private normalizeText(text: string): string {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[?.,!;:()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  private isTaxOrEnterpriseDomain(raw: string): boolean {
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

    // 1. Chào hỏi, cảm ơn và hỏi về năng lực của trợ lý
    const greetingAndBotKeywords = [
      'chao', 'xin chao', 'hello', 'hi', 'alo', 'ban la ai', 'celra', 'tro ly', 'copilot',
      'gioi thieu', 'huong dan', 'cam on', 'thank', 'ho tro gi', 'lam duoc gi', 'chuc nang',
      'hoi dap', 'tu van gi'
    ];
    if (greetingAndBotKeywords.some((k) => normalized.includes(k))) {
      return true;
    }

    // 2. Thuế & Nghĩa vụ thuế
    const taxKeywords = [
      'thue', 'mon bai', 'tndn', 'gtgt', 'vat', 'tncn', 'fct', 'nha thau', 'tieu thu dac biet',
      'xuat nhap khau', 'ke khai', 'to khai', 'quyet toan', 'khau tru', 'nop thue', 'hoan thue',
      'mien thue', 'giam thue', 'tien cham nop', 'cham nop', 'nghia vu thue', 'quan ly thue',
      'co quan thue', 'tong cuc thue', 'chi cuc thue', 'thuedientu', 'gdt', 'ma so thue', 'mst',
      'ma so doanh nghiep', 'msdn', 'thue dien tu', 'lich thue', 'bac thue', 'thue suat'
    ];
    if (taxKeywords.some((k) => normalized.includes(k))) {
      return true;
    }

    // 3. Hóa đơn, chứng từ, thanh toán, chi phí, kế toán
    const invoiceAndCostKeywords = [
      'hoa don', 'hddt', 'may tinh tien', 'pos', 'chung tu', 'tien mat', 'chuyen khoan',
      'uy nhiem chi', 'sao ke', 'ngan hang', 'khong dung tien mat', '20 trieu', 'chi phi',
      'chi phi hop ly', 'chi phi duoc tru', 'xuat toan', 'bctc', 'bao cao tai chinh',
      'doanh thu', 'loi nhuan', 'gia von', 'so sach', 'ke toan', 'kiem toan'
    ];
    if (invoiceAndCostKeywords.some((k) => normalized.includes(k))) {
      return true;
    }

    // 4. Doanh nghiệp, tổ chức, pháp lý doanh nghiệp
    const enterpriseKeywords = [
      'doanh nghiep', 'cong ty', 'dn', 'phap nhan', 'to chuc', 'dkkd', 'dang ky kinh doanh',
      'giay phep', 'giay chung nhan', 'von dieu le', 'gop von', 'thanh lap', 'giai the',
      'tam ngung', 'nganh nghe', 'kinh doanh', 'chi nhanh', 'van phong dai dien', 'tnhh',
      'co phan', 'f&b', 'sme', 'ban le', 'thuong mai dien tu', 'shopee', 'tiktok', 'cod',
      'dai dien phap luat', 'chu so huu', 'ho kinh doanh'
    ];
    if (enterpriseKeywords.some((k) => normalized.includes(k))) {
      return true;
    }

    // 5. Lao động, tiền lương gắn với chi phí & thuế TNCN doanh nghiệp
    const laborAndSalaryKeywords = [
      'luong', 'tien luong', 'nhan su', 'nhan vien', 'nguoi lao dong', 'hop dong lao dong',
      'hdld', 'nguoi phu thuoc', 'giam tru gia canh', 'bhxh', 'bao hiem xa hoi', 'bao hiem y te'
    ];
    if (laborAndSalaryKeywords.some((k) => normalized.includes(k))) {
      return true;
    }

    // 6. Tuân thủ, rà soát, rủi ro, pháp luật
    const complianceAndLegalKeywords = [
      'phap luat', 'luat', 'nghi dinh', 'thong tu', 'nghi quyet', 'quyet dinh', 'dieu khoan',
      'tuan thu', 'ra soat', 'kiem tra', 'ho so', 'nghia vu', 'rui ro', 'xu phat', 'vi pham',
      'han chot', 'thoi han', 'ky han', 'con thieu', 'chua lam', 'chua nop', 'xac minh'
    ];
    if (complianceAndLegalKeywords.some((k) => normalized.includes(k))) {
      return true;
    }

    return false;
  }

  private async fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.ok || res.status === 429) return res;
      } catch {
        // Network error — retry
      }
      if (attempt < maxRetries) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 1000 * (attempt + 1));
        await promise;
      }
    }
    return new Response(null, { status: 503 });
  }
}
