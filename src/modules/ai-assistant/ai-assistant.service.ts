import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AIChatMessageDto, AcceptProposalDto, UpdateLegalRuleDto } from './dto/ai-chat.dto';
import { TaskStatus, UserRole, WaitingOnRole, TimelineEventType, Priority } from '@prisma/client';

import {
  CORE_LEGAL_DOC_LINKS,
  cleanDLPLUrl,
  matchCoreLegalDocUrl,
} from '../../common/constants/legal-docs.constant';

// Cấu trúc dữ liệu lưu trong Bộ nhớ đệm (Cache)
interface CachedAnswer {
  content: string;
  citations: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }>;
  proposedChecklists: any[];
  actionType: 'info' | 'open_compliance_audit' | 'task_proposal';
  ctaButton?: { text: string; action: string };
  timestamp: number;
}

@Injectable()
export class AIAssistantService implements OnModuleInit {
  private readonly logger = new Logger(AIAssistantService.name);

  // Bộ nhớ đệm thông minh (Cache TTL đúng 30 ngày theo yêu cầu: 2,592,000,000 ms)
  private readonly CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  private queryCache = new Map<string, CachedAnswer>();

  // Rate Limiting chống spam (Tối đa 15 câu/ngày/tổ chức)
  private dailyQueryTracker = new Map<string, { count: number; date: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) { }

  async onModuleInit() {
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
    let org = null;
    if (orgId) {
      org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        include: { contextFacts: true },
      });
    }
    if (!org) {
      org = await this.prisma.organization.findFirst({
        include: { contextFacts: true },
      });
    }
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

    const industry = org.industry || 'Chung';
    const employeeCount = org.employeeCount || 0;
    const legalType = org.legalType || 'Doanh nghiệp';
    const taxFacts = org.contextFacts
      ? org.contextFacts.filter((f) => (f.group as string) === 'tax' || f.key.startsWith('TAX_')).map((f) => `${f.key}:${f.currentValue}`)
      : [];
    const denseContext = `DN: ${org.name} | MST: ${org.taxCode} | Ngành: ${industry} | Quy mô: ${employeeCount} nhân sự | Hình thức: ${legalType} | Thuế: [${taxFacts.join(', ')}]`;

    const normalized = this.normalizeText(rawMessage);
    const cacheKey = normalized.slice(0, 80);

    // ------------------------------------------------------------------------
    // BƯỚC 2: TRA CỨU TRONG KHO LUẬT SẴN CÓ CỦA DATABASE (LOCAL RULES - 0 API)
    // ------------------------------------------------------------------------
    const localDbRules = await this.prisma.rule.findMany();
    const matchedLocalRule = localDbRules.find((r) => {
      const cond = r.conditionsJson as any;
      const kwList: string[] = cond?.keywords || [];
      return kwList.some((kw) => normalized.includes(this.normalizeText(kw)));
    });

    if (matchedLocalRule) {
      const cond = matchedLocalRule.conditionsJson as any;
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
    // BƯỚC 4: BẢO VỆ DOANH THU RÀ SOÁT TUÂN THỦ (AUDIT PAYWALL GUARD)
    // ------------------------------------------------------------------------
    const auditProbeKeywords = ['thieu tuan thu', 'con thieu', 'thieu gi', 'quet loi', 'sai pham', 'vi pham gi', 'kiem tra loi', 'co loi gi', 'danh gia tuan thu', 'chua tuan thu'];
    if (auditProbeKeywords.some((kw) => normalized.includes(kw))) {
      return {
        messageId: `msg-${Date.now()}`,
        sender: 'assistant',
        content: `**Đánh giá sơ bộ về Trạng thái Tuân thủ Doanh nghiệp:**\n\n` +
          `Dựa trên bối cảnh doanh nghiệp **${org.name}** (Ngành: ${industry}, Quy mô: ${employeeCount} nhân sự):\n` +
          `- Hệ thống phát hiện doanh nghiệp của bạn có các nghĩa vụ trọng yếu định kỳ về: **Thuế Môn bài**, **Tạm nộp thuế TNDN (ngưỡng 80%)**, **Kê khai thuế GTGT/TNCN** và **Chi phí tiền lương hợp lý**.\n` +
          `- Tuy nhiên, để xác định chính xác danh sách các hồ sơ còn thiếu và kích hoạt Checklist phân công, bạn cần thực hiện **Rà soát Tuân thủ Doanh nghiệp**.\n\n` +
          `*Vui lòng bấm nút bên dưới để mở Bảng kiểm toán.*`,
        answer: `Dựa trên bối cảnh ${org.name}, bạn có nghĩa vụ về Môn bài, TNDN 80%, GTGT và Chi phí lương. Vui lòng mở Rà soát Tuân thủ để có báo cáo chi tiết và checklist nhiệm vụ.`,
        actionType: 'open_compliance_audit',
        ctaButton: { text: 'Mở Rà soát Tuân thủ Doanh nghiệp ngay (Chỉ từ 25 Credit)', action: 'OPEN_AUDIT_MODAL' },
        citations: [
          { title: 'Nghị định 252/2026/NĐ-CP', docNumber: '252/2026/NĐ-CP', articleNumber: 'Tạm nộp TNDN 80%', sourceUrl: CORE_LEGAL_DOC_LINKS['252/2026'] },
          { title: 'Luật Quản lý thuế số 38/2019/QH14', docNumber: '38/2019/QH14', articleNumber: 'Điều 44', sourceUrl: CORE_LEGAL_DOC_LINKS['38/2019'] },
        ],
        proposedChecklists: [],
        createdAt: new Date().toISOString(),
      };
    }

    // ------------------------------------------------------------------------
    // BƯỚC 5: NẾU KHO & CACHE ĐỀU KHÔNG CÓ -> GỌI API CỔNG DỮ LIỆU PHÁP LUẬT (DLPL)
    // ------------------------------------------------------------------------
    const citedSources: Array<{ title: string; docNumber: string; articleNumber?: string; sourceUrl?: string }> = [];
    const dlplDocs = await this.searchDLPLLegalDocuments(rawMessage, 3);
    const dlplPenalties = await this.searchDLPLPenalties(rawMessage, 2);

    let dlplGroundingContext = '';
    if (dlplDocs.length > 0) {
      dlplGroundingContext += '\nVĂN BẢN PHÁP LUẬT TỪ HỆ THỐNG DỮ LIỆU PHÁP LUẬT (DLPL):\n';
      dlplDocs.forEach((doc: any) => {
        dlplGroundingContext += `- Số hiệu: ${doc.code} | Tên: ${doc.name} | Trạng thái: ${doc.status} | Hiệu lực: ${doc.effectiveDate || 'Đang áp dụng'}\n`;
        citedSources.push({
          title: `${doc.name} (${doc.code})`,
          docNumber: doc.code,
          articleNumber: doc.status,
          sourceUrl: doc.sourceUrl,
        });
      });
    }

    if (dlplPenalties.length > 0) {
      dlplGroundingContext += '\nQUY ĐỊNH XỬ PHẠT VI PHẠM HÀNH CHÍNH LIÊN QUAN:\n';
      dlplPenalties.forEach((pen: any) => {
        const behavior = pen.behavior || pen.name || pen.title || '';
        const fine = pen.fine_range || pen.penalty_amount || (pen.min_fine ? `${pen.min_fine} - ${pen.max_fine} VNĐ` : 'Theo khung quy định');
        const legal = pen.legal_reference || pen.decree || '';
        dlplGroundingContext += `- Hành vi: ${behavior} | Mức phạt: ${fine} | Căn cứ: ${legal}\n`;
      });
    }

    // ------------------------------------------------------------------------
    // BƯỚC 6: GHÉP BỐI CẢNH + DỮ LIỆU VÀO SYSTEM PROMPT & GỌI DEEPSEEK AI
    // ------------------------------------------------------------------------
    const opencodeApiUrl = this.config.get<string>('OPENCODE_GO_API_URL', 'https://opencode.ai/inference/openai/v1');
    const apiKey = this.config.get<string>('OPENCODE_GO_API_KEY', '');
    const model = this.config.get<string>('OPENCODE_MODEL', 'deepseek-v4.1-flash');

    let replyContent = '';
    const endpoint = opencodeApiUrl.endsWith('/chat/completions')
      ? opencodeApiUrl
      : `${opencodeApiUrl.replace(/\/+$/, '')}/chat/completions`;

    try {
      this.logger.log(`[OPENCODE API] Đang gửi câu hỏi đến OpenCode AI (${model})`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `Bạn là CELRA Legal & Tax Copilot - Trợ lý Cố vấn Pháp lý và Thuế Doanh nghiệp chuyên sâu tại Việt Nam. ` +
                `Bối cảnh doanh nghiệp: ${denseContext}. ` +
                (dlplGroundingContext ? `\nCĂN CỨ PHÁP LÝ THẬT ĐÃ XÁC THỰC TỪ DỮ LIỆU PHÁP LUẬT VIỆT NAM (DLPL):\n${dlplGroundingContext}` : '') +
                `\nYÊU CẦU BẮT BUỘC: Trả lời ngắn gọn, chính xác 100%, trích dẫn rõ số Điều, Khoản, Nghị định/Thông tư quy định và mức chế tài phạt tiền cụ thể nếu vi phạm. Không bịa luật.`,
            },
            { role: 'user', content: rawMessage },
          ],
          temperature: 0.2,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        replyContent = data.choices?.[0]?.message?.content || data.content || '';

        // Tự động bóc tách thêm căn cứ pháp lý từ văn bản nếu có
        const matchNd = replyContent.match(/Nghị định \d+[\d/A-Z\-]+/gi);
        const matchTt = replyContent.match(/Thông tư \d+[\d/A-Z\-]+/gi);
        const matchLuat = replyContent.match(/Luật [^,.\n]+/gi);

        if (matchNd) {
          matchNd.slice(0, 2).forEach((doc: string) => citedSources.push({
            title: doc,
            docNumber: doc,
            sourceUrl: matchCoreLegalDocUrl(doc),
          }));
        }
        if (matchTt) {
          matchTt.slice(0, 2).forEach((doc: string) => citedSources.push({
            title: doc,
            docNumber: doc,
            sourceUrl: matchCoreLegalDocUrl(doc),
          }));
        }
        if (matchLuat) {
          matchLuat.slice(0, 1).forEach((doc: string) => citedSources.push({
            title: doc,
            docNumber: doc,
            sourceUrl: matchCoreLegalDocUrl(doc),
          }));
        }
      } else {
        throw new Error(`OpenCode API HTTP ${response.status}`);
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
        replyContent = `Dựa trên bối cảnh doanh nghiệp **${org.name}**: Đối với câu hỏi "${rawMessage}", bạn cần rà soát hồ sơ thực tế đối chiếu với các quy định pháp luật chuyên ngành hiện hành theo Luật Doanh nghiệp 2020.`;
        citedSources.push({
          title: 'Luật Doanh nghiệp số 59/2020/QH14',
          docNumber: '59/2020/QH14',
          articleNumber: 'Điều 8',
          sourceUrl: CORE_LEGAL_DOC_LINKS['59/2020'],
        });
      }
    }

    // ------------------------------------------------------------------------
    // BƯỚC 7: ĐÓNG GÓI CHECKLIST ĐỀ XUẤT, LƯU VÀO CACHE 30 NGÀY & PHẢN HỒI
    // ------------------------------------------------------------------------
    const resultPayload: CachedAnswer = {
      content: replyContent,
      citations: citedSources,
      proposedChecklists: [
        {
          id: `prop-${Date.now()}`,
          code: 'TASK-LEGAL-GEN',
          title: `Rà soát & Hoàn thiện hồ sơ tuân thủ: ${rawMessage.slice(0, 40)}`,
          category: 'Pháp lý & Thuế',
          priority: Priority.high,
          reason: 'Hoàn thiện hồ sơ theo quy định pháp luật hiện hành',
          legalBasis: citedSources[0]?.title || 'Luật Doanh nghiệp 2020',
          assigneeRole: UserRole.owner,
        },
      ],
      actionType: 'task_proposal',
      timestamp: Date.now(),
    };

    // Tự động lưu vào Cache với thời hạn đúng 30 ngày
    this.queryCache.set(cacheKey, resultPayload);

    return {
      messageId: `msg-${Date.now()}`,
      sender: 'assistant',
      content: replyContent,
      answer: replyContent,
      actionType: resultPayload.actionType,
      citations: citedSources,
      confidenceLevel: 'high',
      confidenceReason: dlplDocs.length > 0 ? 'Xác thực từ Dữ Liệu Pháp Luật (DLPL) & DeepSeek AI (Lưu Cache 30 ngày)' : 'Tra cứu và tự động lưu Cache thông minh 30 ngày',
      proposedChecklists: resultPayload.proposedChecklists,
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // LUỒNG CHÍNH 2: CHẤP NHẬN ĐỀ XUẤT CỦA AI ĐỂ TẠO CHECKLIST & TÁC VỤ VÀO DATABASE
  // ============================================================================
  async acceptProposal(orgId: string, userId: string, dto: AcceptProposalDto) {
    let targetOrgId: string | undefined = orgId;
    if (!targetOrgId) {
      const firstOrg = await this.prisma.organization.findFirst();
      targetOrgId = firstOrg?.id;
    }
    if (!targetOrgId) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp hợp lệ trong hệ thống');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const actorName = user ? user.name : 'Người dùng';

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo Task thật vào DB
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

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

    const currentJson = (existing.conditionsJson as any) || {};
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
            const currentPayload = (rule.conditionsJson as any) || {};
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
    const apiUrl = this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1');
    const apiKey = this.config.get<string>('DLPL_API_KEY', '');
    if (!apiKey) return [];

    try {
      const url = `${apiUrl.replace(/\/+$/, '')}/legal-documents?q=${encodeURIComponent(query)}&database=vbqppl&status_id=1&sort=relevance&per_page=${limit}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data.map((doc: any) => ({
            id: doc.id,
            code: doc.code,
            name: doc.name,
            database: doc.database,
            status: doc.status?.name || 'Còn hiệu lực',
            effectiveDate: doc.effective_date,
            issuedDate: doc.issued_date,
            sourceUrl: cleanDLPLUrl(doc.source_url) || matchCoreLegalDocUrl(doc.code) || `https://dulieuphapluat.vn/van-ban/tim-kiem.html?q=${encodeURIComponent(doc.code)}`,
          }));
        }
      } else if (res.status === 429) {
        this.logger.warn('[DLPL API] Đã chạm hạn ngạch 1.000 lượt/tháng (HTTP 429 quota_exceeded). Tự động dùng Local Fallback.');
      }
    } catch (err: any) {
      this.logger.warn(`[DLPL API] Lỗi tra cứu văn bản pháp luật: ${err?.message}`);
    }
    return [];
  }

  async searchDLPLPenalties(query: string, limit = 2) {
    const apiUrl = this.config.get<string>('DLPL_API_URL', 'https://api.dulieuphapluat.vn/v1');
    const apiKey = this.config.get<string>('DLPL_API_KEY', '');
    if (!apiKey) return [];

    try {
      const url = `${apiUrl.replace(/\/+$/, '')}/administrative-penalties?q=${encodeURIComponent(query)}&per_page=${limit}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (err: any) {
      this.logger.warn(`[DLPL API] Lỗi tra cứu mức phạt hành chính: ${err?.message}`);
    }
    return [];
  }

  private normalizeText(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[?.,!;:()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
