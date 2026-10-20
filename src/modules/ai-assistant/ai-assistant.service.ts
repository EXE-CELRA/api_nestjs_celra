import { Injectable, Logger, NotFoundException, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AIChatMessageDto, AcceptProposalDto, UpdateLegalRuleDto } from './dto/ai-chat.dto';
import { TaskStatus, UserRole, WaitingOnRole, TimelineEventType, Priority } from '@prisma/client';
import * as crypto from 'crypto';

import {
  CORE_LEGAL_DOC_LINKS,
  cleanDLPLUrl,
  matchCoreLegalDocUrl,
} from '../../common/constants/legal-docs.constant';
import { calculateTaxDeadline } from '../../common/utils/tax-deadline.util';

// Cấu trúc dữ liệu lưu trong Bộ nhớ đệm (Cache)
interface CachedAnswer {
  content: string;
  citations: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }>;
  proposedChecklists: any[];
  actionType: 'info' | 'open_compliance_audit' | 'task_proposal';
  ctaButton?: { text: string; action: string };
  timestamp: number;
}

// ============================================================================
// TỪ ĐIỂN ĐỐI CHIẾU NGHĨA VỤ THUẾ, CĂN CỨ PHÁP LÝ & RỦI RÒ PHÁT SINH
// Ánh xạ các mã kỹ thuật (q_tax_corp_2, q_tax_corp_3, q_tax_salary_1...) sang nghiệp vụ thực tế
// ============================================================================
export const TAX_FACT_METADATA_MAP: Record<string, {
  name: string;
  legalDoc: string;
  article: string;
  sourceUrl: string;
  deadline: string;
  penaltyRisk: string;
  evidenceRequirement: string;
  actionRequired: string;
}> = {
  q_tax_corp_2: {
    name: 'Tạm nộp thuế Thu nhập doanh nghiệp (TNDN) 4 quý tối thiểu 80% số thuế phải nộp cả năm',
    legalDoc: 'Nghị định 91/2022/NĐ-CP sửa đổi Nghị định 126/2020/NĐ-CP; Luật Quản lý thuế số 38/2019/QH14',
    article: 'Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP và Điều 59 Luật Quản lý thuế',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/nghi-dinh-912022nd-cp-cua-chinh-phu-ve-viec-sua-doi-bo-sung-mot-so-dieu-cua-nghi-dinh-1262020nd-cp-ngay-19102020-cua-chinh-phu-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-quan-ly-thue-1098434.html',
    deadline: 'Chậm nhất ngày 30/10 hàng năm (hết quý 3 dương lịch)',
    penaltyRisk: 'Tính tiền chậm nộp 0.03%/ngày trên số tiền thuế nộp thiếu so với ngưỡng 80% cả năm',
    evidenceRequirement: 'Giấy nộp tiền vào Ngân sách Nhà nước có xác nhận của Kho bạc/Ngân hàng hoặc giấy báo Nợ qua Cổng Thuế điện tử',
    actionRequired: 'Kế toán ước tính doanh thu, chi phí lũy kế và nộp bổ sung tiền thuế TNDN tạm nộp vào tài khoản thu NSNN',
  },
  q_tax_corp_3: {
    name: 'Thanh toán không dùng tiền mặt (qua tài khoản ngân hàng) cho hóa đơn mua hàng từ 20 triệu đồng trở lên',
    legalDoc: 'Thông tư 96/2015/TT-BTC hướng dẫn thuế TNDN và Thông tư 219/2013/TT-BTC về thuế GTGT',
    article: 'Điều 4 Thông tư 96/2015/TT-BTC và Điều 15 Thông tư 219/2013/TT-BTC',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/linh-vuc-khac-van-ban/thong-tu-962015tt-btc-huong-dan-ve-thue-thu-nhap-doanh-nghiep-tai-nghi-dinh-122015nd-cp-quy-dinh-chi-tiet-thi-hanh-luat-sua-doi-bo-sung-mot-so-dieu-cua-cac-luat-ve-thue-va-sua-doi-bo-sung-mot-so-dieu-cua-thong-tu-782014tt-btc-thong-tu-1192014tt-btc-thong-tu-1512014tt-btc-do-bo-truong-bo-tai-chinh-ban-hanh-285496.html',
    deadline: 'Thời điểm thanh toán từng hóa đơn phát sinh trong kỳ',
    penaltyRisk: 'Bị cơ quan thuế loại toàn bộ chi phí được trừ khi tính thuế TNDN (truy thu 20%) và không được khấu trừ thuế GTGT đầu vào',
    evidenceRequirement: 'Ủy nhiệm chi (UNC) và Sao kê tài khoản ngân hàng mang tên công ty khớp với số tài khoản trên hóa đơn người bán',
    actionRequired: 'Rà soát toàn bộ các khoản chi trên 20 triệu bằng tiền mặt; thu hồi và chuyển khoản ngân hàng hợp lệ để bảo vệ chi phí',
  },
  q_tax_salary_1: {
    name: 'Hồ sơ chi phí tiền lương hợp lý và kê khai khấu trừ thuế Thu nhập cá nhân (TNCN)',
    legalDoc: 'Thông tư 96/2015/TT-BTC về chi phí TNDN và Thông tư 111/2013/TT-BTC về thuế TNCN',
    article: 'Điều 4 Thông tư 96/2015/TT-BTC và Điều 25 Thông tư 111/2013/TT-BTC',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/thong-tu-1112013tt-btc-huong-dan-luat-thue-thu-nhap-ca-nhan-va-nghi-dinh-652013nd-cp-do-bo-truong-bo-tai-chinh-ban-hanh-334800.html',
    deadline: 'Thời hạn nộp tờ khai TNCN quý (30/04, 31/07, 31/10, 31/01) hoặc tháng (ngày 20)',
    penaltyRisk: 'Chi phí lương bị xuất toán toàn bộ nếu thiếu hợp đồng/chứng từ chi trả; phạt vi phạm khai thiếu thuế TNCN 20% + lãi 0.03%/ngày',
    evidenceRequirement: 'Hợp đồng lao động, Bảng chấm công, Bảng thanh toán lương có chữ ký hoặc Sao kê chi lương qua ngân hàng, Chứng từ nộp thuế TNCN',
    actionRequired: 'Hoàn thiện hồ sơ nhân sự, rà soát đăng ký MST cá nhân và người phụ thuộc cho 100% nhân sự',
  },
  q_tax_corp_1: {
    name: 'Kê khai và nộp tờ khai thuế GTGT, thuế TNCN định kỳ theo tháng hoặc quý',
    legalDoc: 'Luật Quản lý thuế số 38/2019/QH14 và Nghị định 126/2020/NĐ-CP',
    article: 'Điều 44 Luật Quản lý thuế 38/2019/QH14 và Điều 8 Nghị định 126/2020/NĐ-CP',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/luat-quan-ly-thue-2019-54279.html',
    deadline: 'Theo quý: Chậm nhất ngày cuối cùng của tháng đầu quý tiếp theo (30/04, 31/07, 31/10, 31/01)',
    penaltyRisk: 'Phạt tiền từ 2.000.000 đến 25.000.000 VNĐ theo Nghị định 125/2020/NĐ-CP nếu chậm nộp tờ khai',
    evidenceRequirement: 'Thông báo chấp nhận hồ sơ khai thuế điện tử của Tổng cục Thuế kèm tờ khai mẫu 01/GTGT',
    actionRequired: 'Lập và nộp tờ khai thuế qua cổng thuedientu.gdt.gov.vn trước 24h00 ngày hạn chót',
  },
  q_fnb_tax_1: {
    name: 'Hóa đơn điện tử khởi tạo từ máy tính tiền kết nối dữ liệu cơ quan thuế',
    legalDoc: 'Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC',
    article: 'Điều 11 Nghị định 123/2020/NĐ-CP và Điều 8 Thông tư 78/2021/TT-BTC',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/ke-toan-kiem-toan-van-ban/nghi-dinh-1232020nd-cp-quy-dinh-ve-hoa-don-chung-tu-24634.html',
    deadline: 'Thời điểm cung cấp dịch vụ ăn uống / bán hàng trực tiếp đến người tiêu dùng',
    penaltyRisk: 'Phạt tiền từ 10.000.000 đến 20.000.000 VNĐ đối với hành vi không lập hóa đơn điện tử máy tính tiền',
    evidenceRequirement: 'Hợp đồng đăng ký giải pháp HĐĐT máy tính tiền với nhà cung cấp (VNPT/Viettel/MISA...) và thông báo chấp nhận mẫu 01/ĐKTĐ-HĐĐT',
    actionRequired: 'Đăng ký dải ký hiệu hóa đơn máy tính tiền và kết nối phần mềm bán hàng POS gửi dữ liệu thuế',
  },
};

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

    const normalized = this.normalizeText(rawMessage);
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

    // Nhận diện câu hỏi về rà soát thiếu sót hồ sơ / tài liệu / chứng từ
    const isDocAuditQuery = /(thieu tai lieu|thieu ho so|thieu chung tu|thieu gi|can bo sung gi|con thieu gi|chua lam gi|chua hoan thanh|can bo sung tai lieu|chua nop gi)/i.test(normalized);

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
    } else {
      const priorityTaxKeys = isSpecificTaxQuery
        ? []
        : ['q_tax_corp_2', 'q_tax_corp_3', 'q_tax_salary_1', 'q_tax_corp_1'];
      priorityTaxKeys.forEach((key) => {
        if (!relevantFacts.some((f) => f.key === key)) {
          const found = (org.contextFacts || []).find((f) => f.key === key);
          if (found) relevantFacts.push(found);
        }
      });
    }
    // Làm giàu ngữ cảnh chi tiết (Enriched Context Mapping) giải nghĩa tường minh cho Gemini
    const enrichedFactDetails = relevantFacts.map((f) => {
      const meta = TAX_FACT_METADATA_MAP[f.key];
      const sourceTime = f.providedAt ? new Date(f.providedAt).toLocaleDateString('vi-VN') : 'Khai báo hệ thống';
      if (meta) {
        return `* [Mã thẻ: ${f.key}] ${meta.name}:\n` +
          `  + Trạng thái thực tế trong DB: "${f.currentValue}" (Ghi nhận: ${sourceTime})\n` +
          `  + Căn cứ pháp lý: ${meta.legalDoc} (${meta.article})\n` +
          `  + Hạn chót pháp định: ${meta.deadline}\n` +
          `  + Rủi ro nếu không tuân thủ: ${meta.penaltyRisk}\n` +
          `  + Chứng từ minh chứng cần có: ${meta.evidenceRequirement}\n` +
          `  + Hành động khắc phục: ${meta.actionRequired}`;
      }
      return `* [Mã thẻ: ${f.key}] ${f.label}: "${f.currentValue}" (Trạng thái: ${f.status || 'Chưa xác thực'}, Ngày: ${sourceTime})`;
    }).join('\n\n');

    const denseContext = `THÔNG TIN ĐỊNH DANH DOANH NGHIỆP:\n` +
      `- Tên doanh nghiệp: ${org.name}\n` +
      `- Mã số thuế: ${org.taxCode}\n` +
      `- Ngành nghề kinh doanh: ${org.industry || 'Chung'}\n` +
      `- Quy mô nhân sự: ${org.employeeCount || 0} người\n` +
      `- Hình thức pháp lý: ${org.legalType || 'Doanh nghiệp'}\n` +
      `- Mô hình vận hành: ${org.businessModel || 'Tiêu chuẩn'}\n\n` +
      `CHI TIẾT CÁC THẺ NGỮ CẢNH THUẾ TRONG DATABASE CỦA DOANH NGHIỆP:\n` +
      `${enrichedFactDetails}`;
    // ------------------------------------------------------------------------
    // BƯỚC 1.5: PHÂN BIỆT Ý ĐỊNH - TRẢ LỜI NGAY CÂU HỎI THÔNG TIN DOANH NGHIỆP TỪ DB (0 API, 0 LLM)
    // (Ví dụ: "doanh nghiệp tôi tên gì", "mst của tôi", "công ty tôi bao nhiêu nhân sự", "địa chỉ công ty...")
    // Tuyệt đối không bắt rà soát tính tiền đối với các câu hỏi tra cứu hồ sơ công ty
    // ------------------------------------------------------------------------
    // Nhận diện linh hoạt câu hỏi tra cứu thông tin định danh:
    // 1. Trường hợp có chủ ngữ: "doanh nghiệp tôi tên gì", "mst của tôi", "công ty bao nhiêu người"...
    // 2. Trường hợp KHÔNG có chủ ngữ (ngắn gọn): "mã số thuế", "mst", "tên công ty", "tên doanh nghiệp", "địa chỉ", "quy mô nhân sự"...
    const isSelfOrgSubject = /(toi|minh|chung toi|cua toi|cong ty|doanh nghiep|dn)/i.test(normalized);

    const isNameQuery = (isSelfOrgSubject && /(ten gi|la gi|ten la gi|ten cong ty|ten doanh nghiep|ten dn)/i.test(normalized)) ||
      /^(ten|ten gi|ten cong ty|ten doanh nghiep|ten phap ly)$/i.test(normalized);

    const isTaxCodeQuery = (isSelfOrgSubject && /(mst|ma so thue|tax code)/i.test(normalized)) ||
      /^(mst|ma so thue|tax code|so thue)$/i.test(normalized) ||
      /^(tra cuu mst|xin mst|cho xin mst|cho toi mst|xem mst|xem ma so thue)$/i.test(normalized);

    const isStaffQuery = (isSelfOrgSubject && /(nhan su|nhan vien|quy mo|bao nhieu nguoi|may nguoi)/i.test(normalized)) ||
      /^(nhan su|nhan vien|quy mo|quy mo nhan su|so luong nhan vien)$/i.test(normalized);

    const isAddressQuery = (isSelfOrgSubject && /(dia chi|o dau|tru so|o cho nao)/i.test(normalized)) ||
      /^(dia chi|tru so|dia chi tru so|o dau)$/i.test(normalized);

    const isIndustryQuery = (isSelfOrgSubject && /(nganh nghe|linh vuc|kinh doanh gi|mo hinh)/i.test(normalized)) ||
      /^(nganh nghe|linh vuc|kinh doanh gi|mo hinh kinh doanh)$/i.test(normalized);

    const isGeneralProfileQuery = (isSelfOrgSubject && /(thong tin|ho so)/i.test(normalized)) ||
      /^(thong tin|ho so|thong tin dn|ho so dn|thong tin cong ty|thong tin doanh nghiep)$/i.test(normalized);

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
    // ------------------------------------------------------------------------
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
          ctaButton: cached.ctaButton,
          citations: cached.citations,
          confidenceLevel: 'high',
          confidenceReason: 'Truy xuất tức thì từ Bộ nhớ đệm Pháp lý CELRA (Cache Hit trong hạn 30 ngày - 0 API)',
          proposedChecklists: cached.proposedChecklists,
          createdAt: new Date().toISOString(),
        };
      } else {
        this.queryCache.delete(cacheKey);
      }
    }

    // ------------------------------------------------------------------------
    // BƯỚC 4: TẠM ẨN BẢNG CHẶN RÀ SOÁT - CHO PHÉP TRẢ THẲNG OUTPUT CHUYÊN SÂU RA MÀN HÌNH CHAT
    // (Để kiểm tra chất lượng output giải thích và checklist hành động trước khi đóng gói rà soát tốn tiền)
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // BƯỚC 5: ĐỐI CHIẾU KHO VĂN BẢN THUẾ NỘI BỘ (0 API) - HẠN CHẾ TỐI ĐA GỌI DLPL API
    // ------------------------------------------------------------------------
    // BƯỚC 5: ĐỐI CHIẾU KHO VĂN BẢN THUẾ NỘI BỘ (0 API) - TRIỆT TIÊU MẤT LƯỢT API DLPL
    // Nguyên tắc: 100% câu hỏi thuế thông thường dùng Kho luật nội bộ (25 văn bản & TAX_FACT_METADATA_MAP)
    // Tuyệt đối KHÔNG tự động gọi cả 2 API (/legal-documents VÀ /administrative-penalties) cho mỗi lượt chat
    // ------------------------------------------------------------------------
    const citedSources: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }> = [];
    let dlplGroundingContext = '';

    // Nạp toàn bộ văn bản căn cứ từ bản đồ metadata nội bộ theo các thẻ bối cảnh liên quan (0 API CALL)
    relevantFacts.forEach((f) => {
      const meta = TAX_FACT_METADATA_MAP[f.key];
      if (meta && !citedSources.some((s) => s.docNumber === meta.article)) {
        citedSources.push({
          title: `${meta.name} (${meta.legalDoc})`,
          docNumber: meta.article,
          articleNumber: 'Còn hiệu lực',
          sourceUrl: meta.sourceUrl,
        });
        dlplGroundingContext += `- Quy định: ${meta.name} | Căn cứ: ${meta.legalDoc} (${meta.article}) | Hạn chót: ${meta.deadline} | Chế tài vi phạm: ${meta.penaltyRisk}\n`;
      }
    });

    // Thêm các văn bản thuế nền tảng mặc định nếu kho ngữ cảnh còn ít
    if (citedSources.length === 0) {
      citedSources.push(
        { title: 'Luật Quản lý thuế số 38/2019/QH14', docNumber: '38/2019/QH14', articleNumber: 'Điều 44', sourceUrl: CORE_LEGAL_DOC_LINKS['38/2019'] },
        { title: 'Nghị định 126/2020/NĐ-CP quy định chi tiết Luật Quản lý thuế', docNumber: '126/2020/NĐ-CP', articleNumber: 'Điều 8', sourceUrl: CORE_LEGAL_DOC_LINKS['126/2020'] },
        { title: 'Nghị định 125/2020/NĐ-CP xử phạt vi phạm hành chính về thuế, hóa đơn', docNumber: '125/2020/NĐ-CP', articleNumber: 'Điều 13', sourceUrl: CORE_LEGAL_DOC_LINKS['125/2020'] }
      );
      dlplGroundingContext += `- Luật Quản lý thuế số 38/2019/QH14 (Điều 44 - Thời hạn nộp hồ sơ khai thuế)\n` +
        `- Nghị định 126/2020/NĐ-CP (Điều 8 - Các loại thuế khai theo tháng, quý, năm)\n` +
        `- Nghị định 125/2020/NĐ-CP (Xử phạt vi phạm hành chính về thuế và hóa đơn)\n`;
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
        (dlplDocs as any[]).forEach((doc: any) => {
          dlplGroundingContext += `- Số hiệu: ${doc.code} | Tên: ${doc.name} | Trạng thái: ${doc.status}\n`;
          citedSources.push({
            title: `${doc.name} (${doc.code})`,
            docNumber: doc.code,
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
                  content: `# SYSTEM PROMPT — CELRA LEGAL & TAX CHATBOT OUTPUT RULES\n\n` +
                    `## 1. VAI TRÒ VÀ MỤC TIÊU\n` +
                    `Bạn là trợ lý pháp luật và thuế doanh nghiệp CELRA, hỗ trợ doanh nghiệp Việt Nam hiểu nghĩa vụ pháp lý, kiểm tra tình trạng tuân thủ và xác định công việc cần thực hiện.\n` +
                    `Nhiệm vụ:\n` +
                    `- Trả lời chính xác, rõ ràng, dễ hiểu và có căn cứ pháp lý.\n` +
                    `- Sử dụng dữ liệu doanh nghiệp và tài liệu pháp luật đã được hệ thống cung cấp hoặc truy xuất.\n` +
                    `- Giải thích nghĩa vụ, điều kiện áp dụng, thời hạn và hướng xử lý.\n` +
                    `- Phân biệt thông tin hệ thống ghi nhận với kết luận pháp lý đã xác minh.\n` +
                    `- Không thay thế cơ quan nhà nước hoặc chuyên gia pháp lý, thuế.\n\n` +
                    `## 2. QUY TẮC OUTPUT BẮT BUỘC\n` +
                    `Mọi câu trả lời phải tuân thủ các nguyên tắc sau:\n` +
                    `1. Trả lời trực tiếp câu hỏi trước, sau đó mới giải thích.\n` +
                    `2. Chọn cấu trúc trả lời phù hợp với loại câu hỏi; không ép mọi câu hỏi vào cùng một mẫu.\n` +
                    `3. Mọi kết luận pháp lý quan trọng phải có căn cứ truy xuất được.\n` +
                    `4. Chỉ khẳng định thời hạn, thuế suất, mức phạt, điều kiện hưởng ưu đãi hoặc nghĩa vụ cụ thể khi đã xác minh đủ căn cứ và điều kiện áp dụng.\n` +
                    `5. Không tự tạo số liệu, văn bản pháp luật, điều khoản, thời hạn, đường dẫn hoặc trạng thái tuân thủ.\n` +
                    `6. Không suy luận doanh nghiệp vi phạm chỉ vì checklist đang ở trạng thái chưa hoàn thành.\n` +
                    `7. Nếu thiếu dữ liệu quan trọng, nêu rõ phần chưa xác định và hỏi bổ sung thông tin cần thiết.\n` +
                    `8. Nếu chưa xác minh được pháp luật hiện hành, phải ghi rõ "Cần xác minh", không trình bày giả định như sự thật.\n` +
                    `9. Không đề xuất nộp thuế bổ sung, thanh toán lại, sửa hồ sơ hoặc thực hiện giao dịch khi chưa xác minh nghĩa vụ và biện pháp phù hợp.\n` +
                    `10. Ưu tiên độ chính xác, khả năng kiểm chứng và tính an toàn hơn độ dài hoặc giọng văn cảnh báo.\n\n` +
                    `### RULE: VALIDATE BEFORE CONCLUDING (8 QUY TẮC BẮT BUỘC TRƯỚC KHI KẾT LUẬN):\n` +
                    `1. Không kết luận doanh nghiệp đã hoàn thành nghĩa vụ nếu chưa có bằng chứng xác nhận phù hợp.\n` +
                    `2. Không kết luận doanh nghiệp vi phạm, thiếu nghĩa vụ hoặc không đạt tỷ lệ thuế chỉ dựa trên trạng thái checklist.\n` +
                    `3. Trước khi kết luận về thuế TNDN tạm nộp, phải xác minh kỳ tính thuế, số đã tạm nộp, số thuế dự kiến phải nộp và quy định hiện hành.\n` +
                    `4. Trước khi đưa ra thời hạn, mức thuế, mức phạt hoặc điều kiện thanh toán, phải xác minh căn cứ pháp lý và phạm vi áp dụng.\n` +
                    `5. Phân biệt rõ SYSTEM_RECORDED, USER_PROVIDED và VERIFIED.\n` +
                    `6. Nếu chưa đủ dữ liệu, đặt trạng thái NEEDS_VERIFICATION và nêu thông tin cần đối chiếu.\n` +
                    `7. Chỉ đề xuất hành động có tính bắt buộc sau khi đã xác minh nghĩa vụ tương ứng.\n` +
                    `8. Tuyệt đối không sử dụng từ ngữ gây báo động như "xử lý ngay", "chắc chắn bị phạt" hoặc "chưa đảm bảo tuân thủ" khi chưa có căn cứ đầy đủ.\n\n` +
                    `### DỮ KIỆN NGỮ CẢNH CỦA DOANH NGHIỆP TRONG DB:\n${denseContext}\n\n` +
                    (dlplGroundingContext ? `### CĂN CỨ VĂN BẢN PHÁP LUẬT THUẾ TỪ DLPL:\n${dlplGroundingContext}\n\n` : '') +
                    `## 3. PHÂN LOẠI 8 LOẠI CÂU HỎI VÀ CẤU TRÚC OUTPUT\n` +
                    `* **Loại 1 — Hỏi về một quy định pháp luật**: 1. Trả lời trực tiếp | 2. Căn cứ pháp lý (văn bản, điều/khoản/điểm) | 3. Giải thích nội dung & điều kiện áp dụng | 4. Ngoại lệ/lưu ý | 5. Nguồn tra cứu.\n` +
                    `* **Loại 2 — Hỏi nghĩa vụ của doanh nghiệp**: 1. Kết luận tổng quan | 2. Nghĩa vụ có khả năng áp dụng theo dữ liệu DN | 3. Điều kiện xác định nghĩa vụ | 4. Thời hạn thực hiện (khi đã xác minh) | 5. Trạng thái dữ liệu hệ thống & bằng chứng còn thiếu | 6. Căn cứ pháp lý | 7. Công việc tiếp theo theo thứ tự ưu tiên. (Không liệt kê tất cả nghĩa vụ như thể DN chắc chắn phải thực hiện tất cả).\n` +
                    `* **Loại 3 — Hỏi về một tình huống cụ thể**: 1. Tóm tắt dữ kiện đã biết | 2. Thông tin còn thiếu | 3. Quy định liên quan | 4. Đối chiếu từng điều kiện với tình huống | 5. Kết luận có điều kiện hoặc đã xác minh | 6. Rủi ro & hướng xử lý | 7. Nguồn pháp lý. (Không kết luận chỉ từ một dữ kiện riêng lẻ).\n` +
                    `* **Loại 4 — Hỏi về thủ tục hành chính**: 1. Điều kiện thực hiện | 2. Hồ sơ cần chuẩn bị | 3. Các bước thực hiện theo thứ tự | 4. Cơ quan/kênh tiếp nhận | 5. Thời hạn giải quyết & phí, lệ phí | 6. Căn cứ pháp lý | 7. Lưu ý trường hợp đặc biệt.\n` +
                    `* **Loại 5 — Hỏi cách tính thuế**: 1. Xác định loại thuế & kỳ tính thuế | 2. Điều kiện & công thức | 3. Dữ liệu đầu vào | 4. Phép tính từng bước | 5. Kết quả & đơn vị tiền tệ | 6. Giả định/dữ liệu chưa có | 7. Căn cứ pháp lý. (Không tự điền dữ liệu còn thiếu).\n` +
                    `* **Loại 6 — So sánh các quy định pháp luật**: 1. Mục tiêu so sánh | 2. Bảng so sánh (nội dung, đối tượng, điều kiện, thời điểm áp dụng, ngoại lệ) | 3. Điểm giống & khác nhau | 4. Phạm vi áp dụng | 5. Kết luận thực tiễn | 6. Căn cứ pháp lý từng quy định.\n` +
                    `* **Loại 7 — Hỏi pháp luật mới nhất hoặc quy định hiện hành**: 1. Tình trạng hiệu lực đã xác minh | 2. Văn bản hiện hành & điều khoản liên quan | 3. Ngày ban hành & hiệu lực | 4. Văn bản sửa đổi, bổ sung, thay thế | 5. Quy định chuyển tiếp | 6. Ảnh hưởng đến DN | 7. Nguồn chính thức & thời điểm kiểm tra.\n` +
                    `* **Loại 8 — Câu hỏi thiếu dữ liệu hoặc chưa xác định được nghĩa vụ**: 1. Thông tin đã biết | 2. Phần có thể kết luận ở thời điểm hiện tại | 3. Thông tin còn thiếu | 4. Vì sao dữ liệu đó ảnh hưởng | 5. Một câu hỏi làm rõ quan trọng nhất hoặc danh sách ngắn cần cung cấp | 6. Trạng thái: NEEDS_VERIFICATION.\n\n` +
                    `## 4. QUY TẮC KIỂM CHỨNG PHÁP LUẬT\n` +
                    `- Kiểm tra số hiệu, tên văn bản và điều khoản hỗ trợ trực tiếp cho nhận định.\n` +
                    `- Xác minh ngày hiệu lực, tình trạng sửa đổi, thay thế, bãi bỏ và quy định chuyển tiếp.\n` +
                    `- Kiểm tra điều kiện áp dụng đối với loại hình doanh nghiệp, hoạt động kinh doanh và kỳ thuế.\n` +
                    `- Thứ tự ưu tiên: Văn bản pháp luật chính thức (Cơ sở dữ liệu quốc gia) > Cổng thông tin Tổng cục Thuế > Văn bản hướng dẫn.\n` +
                    `- Không bịa trích dẫn. Nếu nguồn không hỗ trợ trực tiếp cho kết luận, phải sửa hoặc hạ mức độ khẳng định.\n\n` +
                    `## 5. QUY TẮC SỬ DỤNG DỮ LIỆU DOANH NGHIỆP\n` +
                    `Phân biệt rõ ba loại thông tin:\n` +
                    `- SYSTEM_RECORDED: Dữ liệu hoặc trạng thái đang được ghi nhận trong CELRA.\n` +
                    `- USER_PROVIDED: Thông tin do người dùng cung cấp, chưa được xác minh độc lập.\n` +
                    `- VERIFIED: Thông tin đã được kiểm tra bằng bằng chứng hoặc nguồn đáng tin cậy.\n` +
                    `Quy tắc: INCOMPLETE không đồng nghĩa với vi phạm; IN_PROGRESS không đồng nghĩa với chưa thực hiện; COMPLETED không đồng nghĩa với đã tuân thủ nếu chưa có bằng chứng.\n` +
                    `- Không hiển thị mã nội bộ, tên biến hoặc ID kỹ thuật trong câu trả lời.\n\n` +
                    `## 6. QUY TẮC ĐỀ XUẤT HÀNH ĐỘNG\n` +
                    `Mỗi đề xuất thể hiện: Việc cần kiểm tra -> Lý do -> Hồ sơ đối chiếu -> Căn cứ pháp lý -> Kết quả mong đợi -> Điều kiện xác minh.\n` +
                    `Dùng ngôn ngữ chuẩn xác: "Đối chiếu hồ sơ để xác định...", "Cần xác minh điều kiện...", "Theo dữ liệu hệ thống hiện có...", "Chưa đủ cơ sở để kết luận...".\n` +
                    `Không dùng từ gây hoang mang như "chắc chắn bị phạt", "vi phạm nghiêm trọng", "phải nộp ngay" khi chưa đủ căn cứ.\n\n` +
                    `## 7. CẤU TRÚC OUTPUT MẶC ĐỊNH (KHI HỎI TỔNG QUAN NGHĨA VỤ/RỦI RO)\n` +
                    `1. Kết luận tổng quan (1-3 câu)\n` +
                    `2. Các vấn đề cần ưu tiên (Bảng: Vấn đề | Dữ liệu hệ thống ghi nhận | Kết quả xác minh | Hành động tiếp theo | Căn cứ pháp lý)\n` +
                    `3. Nghĩa vụ và thời hạn liên quan\n` +
                    `4. Thông tin cần bổ sung\n` +
                    `5. Bước tiếp theo\n` +
                    `6. Nguồn và giới hạn xác minh\n\n` +
                    `## 8. KIỂM TRA TRƯỚC KHI GỬI CÂU TRẢ LỜI & 9. NGUYÊN TẮC CUỐI CÙNG\n` +
                    `Tự kiểm tra: Đã trả lời đúng loại câu hỏi chưa? Có căn cứ pháp lý không? Có nhầm trạng thái hệ thống với vi phạm không? Có tự tạo dữ liệu không?\n` +
                    `Độ chính xác và khả năng kiểm chứng quan trọng hơn trả lời nhanh hoặc dài. Khi chưa đủ căn cứ, câu trả lời đúng là nêu rõ điều đã biết, điều chưa biết và cách xác minh tiếp theo.`,
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
        } catch (callErr: any) {
          this.logger.warn(`Lỗi khi gọi model ${currentModel}: ${callErr?.message}. Thử model tiếp theo...`);
          lastError = callErr;
        }
      }

      if (successfulResponse && successfulResponse.ok) {
        const data = await successfulResponse.json();
        replyContent = data.choices?.[0]?.message?.content || data.content || '';

        const extractedTaxLegalRegex = /(?:Nghị định|Thông tư|Luật|Quyết định)\s+[\d/A-Z\-a-z]+/gi;
        const matchedLegalDocs = replyContent.match(extractedTaxLegalRegex) || [];

        for (const doc of matchedLegalDocs.slice(0, 4)) {
          const docClean = doc.trim();
          const isAlreadyCited = citedSources.some(
            (s) => s.title.toLowerCase().includes(docClean.toLowerCase()) || (s.docNumber && docClean.includes(s.docNumber))
          );
          if (!isAlreadyCited) {
            citedSources.push({
              title: docClean,
              docNumber: docClean,
              sourceUrl: matchCoreLegalDocUrl(docClean) || `https://dulieuphapluat.vn/van-ban/tim-kiem.html?q=${encodeURIComponent(docClean)}`,
            });
          }
        }
      } else {
        throw lastError || new Error('Tất cả các mô hình AI dự phòng đều tạm thời chưa phản hồi.');
      }
    } catch (err: any) {
      this.logger.warn(`OpenCode API tạm thời chưa phản hồi (${err?.message || 'Lỗi kết nối'}). Kích hoạt Fallback Engine với Dữ Liệu Pháp Luật DLPL.`);
      if (dlplDocs.length > 0) {
        replyContent = `Dựa trên dữ liệu tra cứu từ **Cổng Dữ Liệu Pháp Luật Việt Nam (DLPL)** cho **${org.name}**:\n\n` +
          dlplDocs.map((d: any, idx: number) => `${idx + 1}. **${d.name}**\n   - Số hiệu: **${d.code}**\n   - Trạng thái: **${d.status}**\n   - Nguồn: [Tra cứu văn bản DLPL](${d.sourceUrl})`).join('\n\n') +
          (dlplPenalties.length > 0
            ? `\n\n**Chế tài xử phạt vi phạm hành chính liên quan:**\n` +
            dlplPenalties.map((p: any) => `- ${p.behavior || p.name || 'Hành vi'}: Khung phạt ${p.fine_range || p.penalty_amount || 'theo quy định'}`).join('\n')
            : '') +
          `\n\n*Thông tin này đã được tự động lưu vào bộ nhớ đệm (Cache 30 ngày) của CELRA để phục vụ các lần tra cứu tiếp theo mà không tốn thêm lượt gọi.*`;
      } else {
        // Fallback thông minh theo đúng chủ đề người dùng đang hỏi (không trả ra báo cáo chung)
        const isMonBaiTopic = /(mon bai|môn bài)/i.test(normalized);
        const isTndnTopic = /(tndn|thu nhap doanh nghiep|80%)/i.test(normalized);
        const isGtgtTopic = /(gtgt|vat|gia tri gia tang)/i.test(normalized);
        const isSalaryTopic = /(luong|tncn|thu nhap ca nhan|nhan su)/i.test(normalized);
        const isInvoiceTopic = /(hoa don|may tinh tien|pos)/i.test(normalized);

        if (isMonBaiTopic) {
          replyContent = `**HƯỚNG DẪN THỦ TỤC & VIỆC CẦN LÀM VỀ LỆ PHÍ MÔN BÀI CHO: ${org.name}**\n\n` +
            `Dựa trên bối cảnh doanh nghiệp (${org.legalType || 'Doanh nghiệp'}, quy mô ${org.employeeCount || 0} nhân sự):\n\n` +
            `**1. Bản chất & Mức nộp:**\n` +
            `- Lệ phí môn bài là khoản thu hàng năm dựa trên vốn điều lệ đăng ký trên Giấy chứng nhận ĐKDN (Vốn trên 10 tỷ: 3.000.000đ/năm; Vốn từ 10 tỷ trở xuống: 2.000.000đ/năm).\n\n` +
            `**2. Thời hạn nộp (Pháp định):**\n` +
            `- Chậm nhất là ngày **30/01 hàng năm** (theo Nghị định 139/2016/NĐ-CP và Nghị định 22/2020/NĐ-CP).\n` +
            `- Nếu doanh nghiệp mới thành lập: Được miễn lệ phí môn bài năm đầu tiên, nộp chậm nhất ngày 30/01 năm tiếp theo.\n\n` +
            `**3. Danh sách các việc cần làm để tuân thủ:**\n` +
            `- [ ] Nộp Tờ khai lệ phí môn bài (mẫu 01/LPMB) nếu có thay đổi về vốn điều lệ trong năm.\n` +
            `- [ ] Trích nộp tiền lệ phí môn bài vào tài khoản Kho bạc Nhà nước qua Cổng Thuế điện tử (thuedientu.gdt.gov.vn) trước ngày 30/01.\n` +
            `- [ ] Lưu trữ Giấy nộp tiền vào NSNN có xác nhận giao dịch thành công để làm minh chứng đối soát.\n\n` +
            `**4. Cảnh báo chế tài:**\n` +
            `- Chậm nộp tiền lệ phí môn bài bị tính tiền chậm nộp **0.03%/ngày** trên số tiền nộp chậm theo Nghị định 125/2020/NĐ-CP.`;

          citedSources.push(
            { title: 'Nghị định 139/2016/NĐ-CP quy định về lệ phí môn bài', docNumber: '139/2016/NĐ-CP', articleNumber: 'Điều 4, Điều 5', sourceUrl: CORE_LEGAL_DOC_LINKS['139/2016'] },
            { title: 'Nghị định 22/2020/NĐ-CP sửa đổi Nghị định 139/2016/NĐ-CP', docNumber: '22/2020/NĐ-CP', articleNumber: 'Khoản 1 Điều 1', sourceUrl: CORE_LEGAL_DOC_LINKS['22/2020'] }
          );
        } else if (isTndnTopic) {
          replyContent = `**HƯỚNG DẪN TẠM NỘP THUẾ THU NHẬP DOANH NGHIỆP (TNDN) 80% CHO: ${org.name}**\n\n` +
            `**1. Bản chất quy định:**\n` +
            `- Doanh nghiệp bắt buộc phải tạm nộp 4 quý đạt tối thiểu 80% số thuế TNDN phát sinh theo quyết toán năm.\n\n` +
            `**2. Thời hạn nộp:**\n` +
            `- Chậm nhất ngày **30/10 hàng năm** (ngày kết thúc quý 3 theo Nghị định 91/2022/NĐ-CP).\n\n` +
            `**3. Việc cần làm:**\n` +
            `- [ ] Kế toán ước tính doanh thu và chi phí hợp lý của 3 quý đầu năm.\n` +
            `- [ ] Tính toán số thuế TNDN tạm nộp và nộp bổ sung trước ngày 30/10 nếu chưa đạt ngưỡng 80%.\n\n` +
            `**4. Chế tài:** Nộp thiếu so với 80% sẽ bị tính tiền chậm nộp 0.03%/ngày.`;
          citedSources.push({ title: 'Nghị định 91/2022/NĐ-CP về tạm nộp TNDN 80%', docNumber: '91/2022/NĐ-CP', articleNumber: 'Khoản 3 Điều 1', sourceUrl: CORE_LEGAL_DOC_LINKS['91/2022'] });
        } else {
          replyContent = `**VỀ CÂU HỎI THỜI HẠN & KỲ KÊ KHAI THUẾ CỦA DOANH NGHIỆP: ${org.name}**\n\n` +
            `Theo quy định của Luật Quản lý thuế số 38/2019/QH14 và Nghị định 126/2020/NĐ-CP:\n\n` +
            `**1. Không có sắc thuế nào áp dụng tính theo ngày cố định hàng ngày:**\n` +
            `- Toàn bộ các sắc thuế doanh nghiệp (Môn bài, GTGT, TNDN, TNCN) đều được kê khai và nộp theo kỳ: **Năm**, **Quý** hoặc **Tháng**.\n\n` +
            `**2. Các nghĩa vụ thuế liên quan đến "Ngày" mà doanh nghiệp cần lưu ý:**\n` +
            `- **Tiền chậm nộp tiền thuế tính theo ngày (0.03%/ngày)**: Nếu doanh nghiệp nộp thuế sau ngày hết hạn, tiền chậm nộp sẽ tính liên tục theo từng ngày chậm nộp (Điều 59 Luật Quản lý thuế số 38/2019/QH14).\n` +
            `- **Hóa đơn điện tử máy tính tiền**: Xuất ngay tại thời điểm bán hàng trong ngày cho khách hàng (Nghị định 123/2020/NĐ-CP).\n` +
            `- **Thuế phát sinh theo từng lần phát sinh (chậm nhất 10 ngày)**: Áp dụng khi chuyển nhượng bất động sản hoặc phát sinh nghĩa vụ không định kỳ.\n\n` +
            `**3. Kỳ nộp thuế chuẩn của doanh nghiệp bạn:**\n` +
            `- Lệ phí môn bài: Chậm nhất ngày **30/01 hàng năm**.\n` +
            `- Tạm nộp TNDN 80%: Chậm nhất ngày **30/10 hàng năm**.\n` +
            `- Thuế GTGT/TNCN quý: Chậm nhất ngày cuối tháng đầu quý tiếp theo (**30/04, 31/07, 31/10, 31/01**).`;

          citedSources.push(
            { title: 'Luật Quản lý thuế số 38/2019/QH14', docNumber: '38/2019/QH14', articleNumber: 'Điều 44, Điều 59', sourceUrl: CORE_LEGAL_DOC_LINKS['38/2019'] },
            { title: 'Nghị định 126/2020/NĐ-CP hướng dẫn Luật Quản lý thuế', docNumber: '126/2020/NĐ-CP', articleNumber: 'Điều 8, Điều 18', sourceUrl: CORE_LEGAL_DOC_LINKS['126/2020'] }
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
      proposedChecklists: [], // Không tạo tác vụ ngầm vào DB
      actionType: 'info', // Trả output dạng thông tin chi tiết, không chặn rà soát
      timestamp: Date.now(),
    };

    // Chỉ lưu vào Cache khi câu trả lời thực sự đến từ AI hoặc tra cứu hợp lệ
    if (shouldCache) {
      this.queryCache.set(cacheKey, resultPayload);
    }

    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content: replyContent,
      answer: replyContent,
      actionType: 'info',
      citations: citedSources,
      confidenceLevel: 'high',
      confidenceReason: dlplDocs.length > 0 ? 'Xác thực từ Dữ Liệu Pháp Luật (DLPL) & DeepSeek AI (Lưu Cache 30 ngày)' : 'Tra cứu và tự động lưu Cache thông minh 30 ngày',
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
        this.dlplDocsCache.set(normalizedQuery, { data: mapped, timestamp: Date.now() });
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
        this.dlplPenaltiesCache.set(normalizedQuery, { data: json.data, timestamp: Date.now() });
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
