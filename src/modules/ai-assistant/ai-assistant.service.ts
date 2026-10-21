import { Injectable, Logger, NotFoundException, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AIChatMessageDto, AcceptProposalDto, UpdateLegalRuleDto } from './dto/ai-chat.dto';
import { TaskStatus, UserRole, WaitingOnRole, TimelineEventType, Priority, ContextStatus } from '@prisma/client';
import * as crypto from 'crypto';

import {
  CORE_LEGAL_DOC_LINKS,
  cleanDLPLUrl,
  matchCoreLegalDocUrl,
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
    article: 'Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP và Điều 59 Luật Quản lý thuế số 38/2019/QH14',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/nghi-dinh-912022nd-cp-cua-chinh-phu-ve-viec-sua-doi-bo-sung-mot-so-dieu-cua-nghi-dinh-1262020nd-cp-ngay-19102020-cua-chinh-phu-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-quan-ly-thue-1098434.html',
    deadline: 'Tạm nộp theo 4 quý: Q1 (30/04), Q2 (31/07), Q3 (31/10), Q4 (31/01 năm sau). Hạn chốt tạm nộp 4 quý đạt tối thiểu 80% cả năm là 31/01 năm sau (theo năm dương lịch).',
    penaltyRisk: 'Chỉ phát sinh tiền chậm nộp 0.03%/ngày khi tổng số thuế tạm nộp 4 quý thấp hơn 80% số thuế phải nộp theo quyết toán năm; tính từ ngày 01/02 của năm tiếp theo (sau hạn quý 4). Không tính phạt từ hạn quý 3 (31/10).',
    evidenceRequirement: 'Giấy nộp tiền vào Ngân sách Nhà nước có xác nhận của Kho bạc/Ngân hàng hoặc giấy báo Nợ qua Cổng Thuế điện tử',
    actionRequired: 'Kế toán đối chiếu kết quả kinh doanh 4 quý để tạm nộp; rà soát lũy kế 4 quý trước ngày 31/01 năm sau để đảm bảo tối thiểu 80% số thuế TNDN dự kiến quyết toán cả năm.',
  },
  q_tax_corp_3: {
    name: 'Chứng từ thanh toán không dùng tiền mặt khi mua hàng hóa, dịch vụ',
    legalDoc: 'Thông tư 96/2015/TT-BTC, Thông tư 219/2013/TT-BTC & Luật Thuế GTGT số 48/2024/QH15 (từ 01/07/2025)',
    article: 'Điều 4 Thông tư 96/2015/TT-BTC; Điều 15 Thông tư 219/2013/TT-BTC; Điều 14 Luật Thuế GTGT số 48/2024/QH15',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/linh-vuc-khac-van-ban/thong-tu-962015tt-btc-huong-dan-ve-thue-thu-nhap-doanh-nghiep-tai-nghi-dinh-122015nd-cp-quy-dinh-chi-tiet-thi-hanh-luat-sua-doi-bo-sung-mot-so-dieu-cua-cac-luat-ve-thue-va-sua-doi-bo-sung-mot-so-dieu-cua-thong-tu-782014tt-btc-thong-tu-1192014tt-btc-thong-tu-1512014tt-btc-do-bo-truong-bo-tai-chinh-ban-hanh-285496.html',
    deadline: 'Thời điểm thanh toán từng hóa đơn phát sinh trong kỳ',
    penaltyRisk: 'Không đủ điều kiện khấu trừ thuế GTGT đầu vào và bị loại khỏi chi phí được trừ khi tính thuế TNDN đối với các hóa đơn từ ngưỡng luật định.',
    evidenceRequirement: 'Ủy nhiệm chi (UNC) và Sao kê tài khoản ngân hàng mang tên công ty khớp với số tài khoản trên hóa đơn người bán',
    actionRequired: 'Kiểm soát phương thức thanh toán ngay tại thời điểm mua hàng. Cảnh báo: Trường hợp đã trả tiền mặt, việc chuyển khoản bổ sung sau đó mà không có thủ tục điều chỉnh/hủy và hoàn tiền mặt đúng quy định quản lý thuế sẽ không mặc định hợp lệ hóa chi phí được trừ.',
  },
  q_tax_salary_1: {
    name: 'Hồ sơ chi phí tiền lương hợp lý và kê khai khấu trừ thuế Thu nhập cá nhân (TNCN)',
    legalDoc: 'Thông tư 96/2015/TT-BTC về chi phí TNDN, Thông tư 111/2013/TT-BTC về thuế TNCN & Nghị định 126/2020/NĐ-CP',
    article: 'Điều 4 Thông tư 96/2015/TT-BTC; Điều 9, Điều 25 Thông tư 111/2013/TT-BTC; Điều 8 Nghị định 126/2020/NĐ-CP',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/thong-tu-1112013tt-btc-huong-dan-luat-thue-thu-nhap-ca-nhan-va-nghi-dinh-652013nd-cp-do-bo-truong-bo-tai-chinh-ban-hanh-334800.html',
    deadline: 'Thời hạn nộp tờ khai TNCN theo quý (30/04, 31/07, 31/10, 31/01) hoặc tháng (ngày 20). Quyết toán năm chậm nhất 31/03.',
    penaltyRisk: 'Chi phí lương bị loại khỏi chi phí được trừ nếu thiếu hợp đồng, bảng lương hoặc chứng từ thanh toán; xử phạt khai thiếu thuế TNCN 20% + tiền chậm nộp 0.03%/ngày.',
    evidenceRequirement: 'Hợp đồng lao động, Bảng chấm công, Bảng thanh toán lương có chữ ký hoặc Sao kê chi lương qua ngân hàng, Chứng từ nộp thuế TNCN',
    actionRequired: 'Rà soát đăng ký MST cá nhân cho 100% người lao động có HĐLĐ; chỉ lập hồ sơ giảm trừ gia cảnh cho người lao động thực tế có người phụ thuộc hợp pháp có chứng từ chứng minh; chỉ nộp tờ khai TNCN định kỳ khi có phát sinh khấu trừ thuế.',
  },
  q_tax_corp_1: {
    name: 'Kê khai và nộp tờ khai thuế GTGT định kỳ theo tháng hoặc quý',
    legalDoc: 'Luật Quản lý thuế số 38/2019/QH14 & Nghị định 126/2020/NĐ-CP',
    article: 'Điều 44 Luật Quản lý thuế số 38/2019/QH14; Điều 8, Điều 9 Nghị định 126/2020/NĐ-CP',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/luat-quan-ly-thue-2019-54279.html',
    deadline: 'Theo quý: Chậm nhất ngày cuối cùng tháng đầu quý tiếp theo (30/04, 31/07, 31/10, 31/01); Theo tháng: Chậm nhất ngày 20 tháng tiếp theo.',
    penaltyRisk: 'Phạt tiền từ 2.000.000 đến 25.000.000 VNĐ theo Nghị định 125/2020/NĐ-CP nếu chậm nộp tờ khai',
    evidenceRequirement: 'Thông báo chấp nhận hồ sơ khai thuế điện tử của Tổng cục Thuế kèm tờ khai mẫu 01/GTGT',
    actionRequired: 'Lập và nộp tờ khai thuế qua cổng thuedientu.gdt.gov.vn trước 24h00 ngày hạn chót.',
  },
  q_fnb_tax_1: {
    name: 'Hóa đơn điện tử khởi tạo từ máy tính tiền kết nối dữ liệu cơ quan thuế',
    legalDoc: 'Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC',
    article: 'Điều 11 Nghị định 123/2020/NĐ-CP và Điều 8 Thông tư 78/2021/TT-BTC',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/ke-toan-kiem-toan-van-ban/nghi-dinh-1232020nd-cp-quy-dinh-ve-hoa-don-chung-tu-24634.html',
    deadline: 'Thời điểm cung cấp dịch vụ ăn uống / bán hàng trực tiếp đến người tiêu dùng',
    penaltyRisk: 'Phạt tiền từ 10.000.000 đến 20.000.000 VNĐ đối với hành vi không lập hóa đơn điện tử máy tính tiền khi thuộc diện áp dụng',
    evidenceRequirement: 'Hợp đồng đăng ký giải pháp HĐĐT máy tính tiền với nhà cung cấp (VNPT/Viettel/MISA...) và thông báo chấp nhận mẫu 01/ĐKTĐ-HĐĐT',
    actionRequired: 'Nếu thuộc diện bán lẻ/F&B trực tiếp đến người tiêu dùng: đăng ký mẫu 01/ĐKTĐ-HĐĐT với CQT. Doanh nghiệp B2B thuần túy không thuộc diện bắt buộc.',
  },
  q_tax_corp_monbai: {
    name: 'Lệ phí môn bài định kỳ hàng năm',
    legalDoc: 'Nghị định 139/2016/NĐ-CP và Nghị định 22/2020/NĐ-CP',
    article: 'Điều 4, Điều 5 Nghị định 139/2016/NĐ-CP; Khoản 1 Điều 1 Nghị định 22/2020/NĐ-CP',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/linh-vuc-khac-van-ban/nghi-dinh-1392016nd-cp-quy-dinh-ve-le-phi-mon-bai-121377.html',
    deadline: 'Chậm nhất ngày 30/01 hàng năm (DN mới thành lập được miễn năm đầu tiên, nộp chậm nhất 30/01 năm tiếp theo)',
    penaltyRisk: 'Tính tiền chậm nộp 0.03%/ngày trên số tiền môn bài nộp chậm theo Nghị định 125/2020/NĐ-CP và Luật Quản lý thuế',
    evidenceRequirement: 'Giấy nộp tiền vào NSNN hoặc giấy báo Nợ qua Cổng Thuế điện tử',
    actionRequired: 'Trích nộp lệ phí môn bài vào tài khoản Kho bạc Nhà nước trước ngày 30/01 và lưu trữ chứng từ đối soát.',
  },
  q_tax_dependents: {
    name: 'Đăng ký người phụ thuộc giảm trừ gia cảnh thuế TNCN',
    legalDoc: 'Thông tư 111/2013/TT-BTC và Thông tư 105/2020/TT-BTC',
    article: 'Điểm c Khoản 1 Điều 9 Thông tư 111/2013/TT-BTC; Điều 7 Thông tư 105/2020/TT-BTC',
    sourceUrl: 'https://dulieuphapluat.vn/van-ban/thue-phi-le-phi-van-ban/thong-tu-1112013tt-btc-huong-dan-luat-thue-thu-nhap-ca-nhan-va-nghi-dinh-652013nd-cp-do-bo-truong-bo-tai-chinh-ban-hanh-334800.html',
    deadline: 'Tại thời điểm người lao động đăng ký giảm trừ gia cảnh (chậm nhất thời điểm quyết toán thuế năm)',
    penaltyRisk: 'Không được tính giảm trừ gia cảnh 4.400.000 đồng/tháng/người phụ thuộc nếu thiếu mã số thuế người phụ thuộc hoặc hồ sơ chứng minh.',
    evidenceRequirement: 'Tờ khai đăng ký người phụ thuộc (mẫu 07/ĐK-NPT-TNCN), bản sao CCCD/Giấy khai sinh và giấy tờ chứng minh quan hệ phụ dưỡng hợp pháp',
    actionRequired: 'Chỉ tiếp nhận và đăng ký cho người lao động thực tế có người phụ thuộc hợp pháp và cung cấp đủ hồ sơ chứng minh; không mặc định mọi nhân viên đều có người phụ thuộc.',
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

    // ------------------------------------------------------------------------
    // BƯỚC 1.1: XỬ LÝ SỰ KIỆN XÁC NHẬN THÔNG TIN TỪ CHAT VÀ TỰ ĐỘNG CẬP NHẬT DB
    // Khi người dùng bấm "Gửi xác nhận thông tin vào hội thoại" (Ví dụ: Bán hàng trực tiếp CÓ/KHÔNG)
    // Hệ thống tự động cập nhật ContextFact q_fnb_tax_1 và Organization.hasOnlineSales vào PostgreSQL
    // ------------------------------------------------------------------------
    const isVerificationConfirm = rawMessage.toLowerCase().startsWith('xac nhan thong tin:') || rawMessage.toLowerCase().startsWith('xác nhận thông tin:');
    if (isVerificationConfirm) {
      const confirmText = rawMessage.replace(/^(xac nhan thong tin:|xác nhận thông tin:)\s*/i, '').trim();
      const isYes = /có|co bán hàng|có áp dụng/i.test(confirmText);
      const isNo = /không|khong bán hàng|không áp dụng/i.test(confirmText);
      const newStatusValue = isYes
        ? 'Có bán hàng trực tiếp (Bắt buộc HĐĐT máy tính tiền)'
        : isNo
        ? 'Không bán hàng trực tiếp đến người tiêu dùng (Áp dụng HĐĐT thông thường)'
        : 'Chưa xác định rõ hình thức bán hàng trực tiếp';

      // 1. Cập nhật thẻ bối cảnh q_fnb_tax_1 trong Database
      const targetFact = (org.contextFacts || []).find((f) => f.key === 'q_fnb_tax_1');
      if (targetFact) {
        await this.prisma.contextFact.update({
          where: { id: targetFact.id },
          data: {
            currentValue: newStatusValue,
            status: ContextStatus.confirmed,
            history: {
              create: {
                value: newStatusValue,
                changedBy: 'Chủ doanh nghiệp (Xác nhận qua Chatbox CELRA)',
                note: 'Cập nhật từ câu hỏi xác minh trong phiên hội thoại AI',
              },
            },
          },
        });
        targetFact.currentValue = newStatusValue;
        targetFact.status = ContextStatus.confirmed;
        this.logger.log(`[DB UPDATED] Đã cập nhật thành công thẻ [${targetFact.key}] thành: "${newStatusValue}"`);
      }

      // 2. Cập nhật trường hasOnlineSales của Organization nếu liên quan đến bán lẻ/website
      if (isYes || isNo) {
        await this.prisma.organization.update({
          where: { id: orgId },
          data: { hasOnlineSales: isYes },
        });
        org.hasOnlineSales = isYes;
      }

      // 3. Phản hồi xác nhận thành công và đối chiếu ngay nghĩa vụ pháp lý tương ứng
      const legalRef = isYes
        ? 'Căn cứ Điều 11 Nghị định 123/2020/NĐ-CP và Điều 8 Thông tư 78/2021/TT-BTC: Doanh nghiệp của bạn thuộc diện bắt buộc áp dụng Hóa đơn điện tử khởi tạo từ máy tính tiền có kết nối dữ liệu trực tiếp với cơ quan thuế. Mức phạt nếu không xuất HĐĐT máy tính tiền từ 10.000.000đ đến 20.000.000đ.'
        : 'Căn cứ Nghị định 123/2020/NĐ-CP: Doanh nghiệp không bán lẻ trực tiếp đến người tiêu dùng nên tiếp tục sử dụng Hóa đơn điện tử có mã hoặc không có mã của cơ quan thuế theo quy trình thông thường.';

      const replyAck = `**HỆ THỐNG ĐÃ CẬP NHẬT THÀNH CÔNG VÀO CƠ SỞ DỮ LIỆU CÔNG TY:**\n\n` +
        `- **Dữ kiện cập nhật**: Hóa đơn điện tử máy tính tiền\n` +
        `- **Trạng thái mới**: "${newStatusValue}"\n` +
        `- **Thời điểm ghi nhận**: ${new Date().toLocaleString('vi-VN')}\n` +
        `- **Người xác nhận**: Chủ doanh nghiệp (qua Chatbox)\n\n` +
        `**Đối chiếu nghĩa vụ pháp lý tương ứng:**\n` +
        `${legalRef}\n\n` +
        `*Hồ sơ bối cảnh tuân thủ của doanh nghiệp đã được lưu vết minh bạch vào lịch sử đối soát của hệ thống.*`;

      return {
        messageId: `msg-${Date.now()}`,
        sender: 'assistant',
        content: replyAck,
        answer: replyAck,
        actionType: 'info',
        citations: [
          {
            title: 'Nghị định 123/2020/NĐ-CP về hóa đơn, chứng từ',
            docNumber: '123/2020/NĐ-CP',
            articleNumber: 'Điều 11',
            sourceUrl: CORE_LEGAL_DOC_LINKS['123/2020'],
          },
        ],
        confidenceLevel: 'high',
        confidenceReason: 'Dữ liệu đã được lưu trữ và cập nhật thành công vào PostgreSQL Database',
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
                    let prompt = `# SYSTEM PROMPT — CELRA LEGAL & TAX CHATBOT\n\n` +
                      `## 1. VAI TRÒ VÀ MỤC TIÊU\n` +
                      `Bạn là trợ lý pháp luật và thuế doanh nghiệp CELRA, hỗ trợ người dùng hiểu đúng quy định pháp luật, nghĩa vụ tuân thủ và công việc cần thực hiện.\n` +
                      `- Trả lời chính xác, rõ ràng, trung thực, có căn cứ pháp lý truy xuất được.\n` +
                      `- Tuyệt đối không bịa đặt số liệu, văn bản pháp luật, điều khoản, đường dẫn hoặc tình trạng tuân thủ.\n` +
                      `- Không thay thế cơ quan nhà nước hoặc chuyên gia pháp lý, thuế.\n\n` +
                      `## 2. NGUYÊN TẮC CƠ BẢN\n` +
                      `1. Trả lời trực tiếp câu hỏi trước, sau đó mới giải thích chi tiết.\n` +
                      `2. Mọi kết luận pháp lý quan trọng phải có trích dẫn văn bản quy phạm pháp luật (Tên văn bản, số hiệu, điều/khoản/điểm).\n` +
                      `3. Không suy luận vi phạm chỉ vì dữ liệu chưa hoàn thiện hoặc checklist chưa hoàn thành.\n` +
                      `4. Không dùng từ ngữ gây hoang mang, báo động như "xử lý ngay", "chắc chắn bị phạt", "vi phạm nghiêm trọng" khi chưa đủ căn cứ.\n\n`;

                    if (dlplGroundingContext) {
                      prompt += `### CĂN CỨ VĂN BẢN PHÁP LUẬT THAM CHIẾU:\n${dlplGroundingContext}\n\n`;
                    }

                    if (isEnterpriseQuery) {
                      prompt +=
                        `### DỮ KIỆN NGỮ CẢNH CỦA DOANH NGHIỆP TRONG HỆ THỐNG:\n${denseContext}\n\n` +
                        `## 3. CẤU TRÚC ĐẦU RA BẮT BUỘC KHI RÀ SOÁT / CÂU HỎI VỀ DOANH NGHIỆP (9 PHẦN CHUẨN MỰC):\n` +
                        `1. **Kết luận trực tiếp**: Nhận định rõ ràng, súc tích (1-3 câu) về câu hỏi của chủ doanh nghiệp.\n` +
                        `2. **Xác định nghĩa vụ áp dụng**: Nêu rõ bằng ngôn ngữ tiếng Việt tự nhiên:\n` +
                        `   - "Đã xác định nghĩa vụ áp dụng" (khi đã có căn cứ rõ ràng)\n` +
                        `   - "Có khả năng áp dụng nhưng chưa đủ dữ liệu" (khi có khả năng nhưng thiếu dữ kiện)\n` +
                        `   - "Cần xác minh thông tin hoặc căn cứ" (khi cần làm rõ thêm)\n` +
                        `   - "Đã có căn cứ xác định không áp dụng" (khi xác định không thuộc đối tượng áp dụng)\n` +
                        `   (TUYỆT ĐỐI KHÔNG xuất mã kỹ thuật backend như APPLICABLE, POSSIBLE, NEEDS_VERIFICATION, NOT_APPLICABLE).\n` +
                        `3. **Căn cứ pháp lý**: Trích dẫn chính xác tên văn bản, điều, khoản, điểm, ngày hiệu lực và liên kết tra cứu chính thức.\n` +
                        `4. **Dữ liệu doanh nghiệp làm căn cứ**: Căn cứ trên dữ liệu hệ thống ghi nhận, phân biệt rõ với kết luận đã xác minh.\n` +
                        `5. **Kỳ tính thuế và thời hạn tương ứng**: Nêu rõ kỳ kê khai và thời hạn theo luật (LƯU Ý: TNDN 80% áp dụng cho tổng 4 quý trước 31/01 năm sau; không mặc định hạn 30/10; TNCN theo tháng/quý tuỳ kỳ GTGT).\n` +
                        `6. **Trạng thái hiện tại và lý do**: Nêu rõ bằng ngôn ngữ tiếng Việt tự nhiên:\n` +
                        `   - "Có đủ bằng chứng xác nhận hoàn thành"\n` +
                        `   - "Đang thực hiện và có dữ liệu xác nhận"\n` +
                        `   - "Cần xác minh thông tin hoặc căn cứ" (chưa có dữ liệu KHÔNG đồng nghĩa với vi phạm)\n` +
                        `   - "Đã xác định nghĩa vụ áp dụng, quá hạn và chưa hoàn thành theo dữ liệu đáng tin cậy"\n` +
                        `   (TUYỆT ĐỐI KHÔNG hiển thị mã kỹ thuật backend như COMPLETED, IN_PROGRESS, OVERDUE, NEEDS_VERIFICATION).\n` +
                        `7. **Rủi ro có thể phát sinh kèm điều kiện**: Chỉ nêu rủi ro có căn cứ pháp luật; KHÔNG tự tính số tiền phạt hay tiền chậm nộp khi thiếu dữ liệu đầu vào.\n` +
                        `8. **Checklist hành động tiếp theo**: Các công việc cụ thể theo thứ tự ưu tiên (ưu tiên cao, cần làm trước).\n` +
                        `9. **Hồ sơ còn thiếu và câu hỏi cần xác minh**: Nêu rõ chứng từ cần bổ sung và đặt câu hỏi cụ thể cho chủ doanh nghiệp.\n\n` +
                        `QUY TẮC CẤM BẮT BUỘC:\n` +
                        `- TUYỆT ĐỐI KHÔNG hiển thị trạng thái kiểu kỹ thuật Backend (APPLICABLE, POSSIBLE, NEEDS_VERIFICATION, NOT_APPLICABLE, COMPLETED, IN_PROGRESS, OVERDUE). Phải dùng 100% ngôn ngữ tiếng Việt tự nhiên cho chủ doanh nghiệp dễ hiểu.\n` +
                        `- TUYỆT ĐỐI KHÔNG hướng dẫn rằng chuyển khoản sau khi đã thanh toán tiền mặt chắc chắn khắc phục được điều kiện thuế.\n` +
                        `- KHÔNG mặc định mọi nhân viên đều có người phụ thuộc.\n` +
                        `- KHÔNG tự tạo bằng chứng, ngày nộp hoặc điều khoản pháp luật giả.`;
                    } else {
                      prompt +=
                        `## 3. QUY TẮC BẮT BUỘC KHI HỎI CHUNG VỀ LUẬT / QUY ĐỊNH PHÁP LUẬT:\n` +
                        `Người dùng đang hỏi chung về quy định pháp luật, nguyên tắc, thời hạn hoặc giải thích điều khoản luật, KHÔNG yêu cầu rà soát tình hình doanh nghiệp cụ thể.\n` +
                        `- Trả lời trực tiếp vào câu hỏi một cách rõ ràng, chính xác, dễ hiểu.\n` +
                        `- Nêu rõ nội dung quy định hiện hành và căn cứ pháp lý cụ thể (Tên văn bản, số hiệu, điều/khoản/điểm áp dụng).\n` +
                        `- Giải thích điều kiện áp dụng, trường hợp ngoại lệ hoặc chế tài xử phạt vi phạm hành chính (nếu có).\n` +
                        `- **TUYỆT ĐỐI KHÔNG** đưa vào các phần: "D. Danh sách nghĩa vụ thuế", "E. Thông tin cần xác minh", "F. Việc nên làm tiếp theo", "G. Nguồn pháp lý" như một báo cáo rà soát doanh nghiệp.\n` +
                        `- Trả lời bình thường theo văn phong tư vấn pháp luật chuyên nghiệp, tự nhiên, súc tích và kết thúc.`;
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
            ? `**HƯỚNG DẪN THỦ TỤC & VIỆC CẦN LÀM VỀ LỆ PHÍ MÔN BÀI CHO: ${org.name}**\n\n` +
              `Dựa trên bối cảnh doanh nghiệp (${org.legalType || 'Doanh nghiệp'}, quy mô ${org.employeeCount || 0} nhân sự):\n\n` +
              `**A. Kết luận tổng quan:** Doanh nghiệp có nghĩa vụ nộp lệ phí môn bài hàng năm dựa trên mức vốn điều lệ đăng ký trên Giấy chứng nhận ĐKDN.\n\n` +
              `**D. Danh sách nghĩa vụ thuế:**\n` +
              `- Lệ phí môn bài: Hạn chót chậm nhất ngày **30/01 hàng năm** (theo Nghị định 139/2016/NĐ-CP và Nghị định 22/2020/NĐ-CP). Mức nộp: 2.000.000đ/năm (vốn từ 10 tỷ trở xuống) hoặc 3.000.000đ/năm (vốn trên 10 tỷ).\n\n` +
              `**E. Thông tin cần xác minh:**\n` +
              `- Kiểm tra Giấy nộp tiền vào NSNN xem đã hoàn tất nộp tiền môn bài năm hiện tại chưa.\n` +
              `- Kiểm tra trong năm có thay đổi vốn điều lệ làm thay đổi bậc lệ phí không.\n\n` +
              `**F. Việc nên làm tiếp theo:**\n` +
              `- 1. Nộp Tờ khai 01/LPMB nếu có thay đổi vốn điều lệ trong năm.\n` +
              `- 2. Trích nộp tiền lệ phí môn bài vào NSNN qua thuedientu.gdt.gov.vn trước ngày 30/01.\n` +
              `- 3. Lưu trữ Giấy nộp tiền vào NSNN để làm minh chứng đối soát.\n\n` +
              `**G. Nguồn pháp lý:**\n` +
              `- Nghị định 139/2016/NĐ-CP (Điều 4, Điều 5)\n` +
              `- Nghị định 22/2020/NĐ-CP (Khoản 1 Điều 1)\n` +
              `- Nghị định 125/2020/NĐ-CP (Chế tài chậm nộp 0.03%/ngày).`
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
            ? `**HƯỚNG DẪN TẠM NỘP THUẾ THU NHẬP DOANH NGHIỆP (TNDN) 80% CHO: ${org.name}**\n\n` +
              `**A. Kết luận trực tiếp:** Doanh nghiệp bắt buộc phải tạm nộp 4 quý đạt tối thiểu 80% số thuế TNDN phát sinh theo quyết toán năm.\n\n` +
              `**D. Danh sách nghĩa vụ thuế:**\n` +
              `- Tạm nộp thuế TNDN theo 4 quý: Quý 1 (30/04), Quý 2 (31/07), Quý 3 (31/10), Quý 4 (31/01 năm sau).\n` +
              `- Hạn chót tạm nộp 4 quý tối thiểu 80% cả năm là ngày **31/01 năm sau** (Khoản 3 Điều 1 Nghị định 91/2022/NĐ-CP). Tuyệt đối không mặc định ngày 30/10.\n\n` +
              `**E. Thông tin cần xác minh:**\n` +
              `- Chưa đủ dữ liệu để tính toán; cần đối chiếu kết quả kinh doanh 4 quý và tổng số thuế TNDN đã tạm nộp vào NSNN từ đầu năm đến nay.\n` +
              `- Tuyệt đối không tự tính hoặc công bố số tiền chậm nộp khi chưa có số liệu thuế quyết toán thực tế.\n\n` +
              `**F. Việc nên làm tiếp theo:**\n` +
              `- 1. Kế toán ước tính doanh thu và tạm nộp theo từng quý.\n` +
              `- 2. Rà soát tổng số thuế đã nộp trước ngày 31/01 năm sau để đảm bảo không thấp hơn 80% số thuế TNDN dự kiến quyết toán.\n\n` +
              `**G. Nguồn pháp lý:**\n` +
              `- Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1)\n` +
              `- Luật Quản lý thuế số 38/2019/QH14 (Điều 44, Điều 59).`
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
            ? `**HƯỚNG DẪN CHỨNG TỪ THANH TOÁN KHÔNG DÙNG TIỀN MẶT CHO: ${org.name}**\n\n` +
              `**A. Kết luận trực tiếp:** Hóa đơn mua hàng từ ngưỡng luật định bắt buộc phải có chứng từ thanh toán không dùng tiền mặt (qua tài khoản ngân hàng) để được khấu trừ thuế GTGT và tính chi phí được trừ khi tính thuế TNDN.\n\n` +
              `**D. Danh sách nghĩa vụ thuế:**\n` +
              `- Hóa đơn từ 20 triệu đồng trở lên (trước 01/07/2025 theo Điều 4 TT 96/2015/TT-BTC và Điều 15 TT 219/2013/TT-BTC) hoặc theo Luật Thuế GTGT số 48/2024/QH15 (từ 01/07/2025) bắt buộc thanh toán qua ngân hàng.\n\n` +
              `**E. Thông tin cần xác minh:**\n` +
              `- Cảnh báo bắt buộc: Trường hợp đã thực hiện thanh toán bằng tiền mặt tại thời điểm mua hàng, việc chuyển khoản bổ sung sau đó mà không có thủ tục thỏa thuận hủy giao dịch/trả lại tiền mặt và thực hiện lại đúng quy định pháp luật sẽ không mặc định hợp lệ hóa điều kiện thuế.\n\n` +
              `**F. Việc nên làm tiếp theo:**\n` +
              `- 1. Rà soát các khoản chi mua hàng từ ngưỡng luật định để đảm bảo 100% có Ủy nhiệm chi.\n` +
              `- 2. Kiểm tra thông tin tài khoản người bán trên UNC phải khớp với thông tin đăng ký của bên bán.\n\n` +
              `**G. Nguồn pháp lý:**\n` +
              `- Thông tư 96/2015/TT-BTC (Điều 4)\n` +
              `- Thông tư 219/2013/TT-BTC (Điều 15)\n` +
              `- Luật Thuế GTGT số 48/2024/QH15 (Điều 14).`
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
            ? `**HƯỚNG DẪN HỒ SƠ TIỀN LƯƠNG & NGHĨA VỤ THUẾ TNCN CHO: ${org.name}**\n\n` +
              `**A. Kết luận trực tiếp:** Nghĩa vụ tiền lương và thuế TNCN bao gồm nhiều nội dung riêng biệt cần tách bạch:\n\n` +
              `**D. Danh sách nghĩa vụ thuế:**\n` +
              `- 1. Đăng ký MST cá nhân: Bắt buộc cho 100% người lao động có hợp đồng lao động.\n` +
              `- 2. Đăng ký người phụ thuộc giảm trừ gia cảnh: Chỉ áp dụng khi người lao động thực tế có người phụ thuộc hợp pháp và cung cấp đủ hồ sơ chứng minh; không mặc định mọi nhân viên đều có người phụ thuộc.\n` +
              `- 3. Khấu trừ & Kê khai thuế TNCN: Kê khai theo tháng/quý theo kỳ kê khai GTGT; nếu trong kỳ không phát sinh khấu trừ thuế TNCN thì không phải nộp tờ khai (NĐ 126/2020 & NĐ 91/2022).\n\n` +
              `**E. Thông tin cần xác minh:**\n` +
              `- Doanh nghiệp hiện có bao nhiêu lao động ký hợp đồng từ 3 tháng trở lên? Đã có đăng ký MST cá nhân cho tất cả nhân sự chưa?\n\n` +
              `**F. Việc nên làm tiếp theo:**\n` +
              `- 1. Rà soát danh sách nhân sự chưa có MST cá nhân để làm thủ tục đăng ký.\n` +
              `- 2. Tập hợp hồ sơ người phụ thuộc đối với nhân viên có yêu cầu giảm trừ gia cảnh.\n\n` +
              `**G. Nguồn pháp lý:**\n` +
              `- Thông tư 111/2013/TT-BTC (Điều 9, Điều 25)\n` +
              `- Thông tư 96/2015/TT-BTC (Điều 4)\n` +
              `- Nghị định 126/2020/NĐ-CP (Điều 8, Điều 9).`
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
              `**A. Kết luận trực tiếp:** Các sắc thuế doanh nghiệp được kê khai và nộp theo kỳ: Tháng, Quý hoặc Năm theo Luật Quản lý thuế số 38/2019/QH14 và Nghị định 126/2020/NĐ-CP.\n\n` +
              `**D. Danh sách nghĩa vụ thuế:**\n` +
              `- Lệ phí môn bài: Chậm nhất ngày **30/01 hàng năm** (miễn năm đầu thành lập).\n` +
              `- Tạm nộp TNDN 80%: Chậm nhất ngày **31/01 năm sau** (hạn chót quý 4 đạt tối thiểu 80% cả năm; không mặc định hạn 30/10).\n` +
              `- Thuế GTGT và TNCN quý: Chậm nhất ngày cuối tháng đầu quý tiếp theo (**30/04, 31/07, 31/10, 31/01**).\n` +
              `- Quyết toán năm (TNDN & TNCN): Chậm nhất ngày **31/03 năm tiếp theo**.\n\n` +
              `**E. Thông tin cần xác minh:**\n` +
              `- Doanh nghiệp kê khai thuế GTGT theo tháng hay theo quý (doanh thu năm trước > 50 tỷ nộp tháng, <= 50 tỷ nộp quý).\n\n` +
              `**F. Việc nên làm tiếp theo:**\n` +
              `- 1. Thiết lập lịch theo dõi hạn nộp tờ khai và tiền thuế các kỳ trong năm.\n` +
              `- 2. Kiểm tra sao kê và hóa đơn đầu vào đầu ra trước ngày 25 hàng quý.\n\n` +
              `**G. Nguồn pháp lý:**\n` +
              `- Luật Quản lý thuế số 38/2019/QH14 (Điều 44, Điều 59)\n` +
              `- Nghị định 126/2020/NĐ-CP (Điều 8, Điều 18)\n` +
              `- Nghị định 91/2022/NĐ-CP (Khoản 3 Điều 1).`
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
      actionType: resultPayload.actionType,
      isEnterpriseQuery: isEnterpriseQuery,
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
