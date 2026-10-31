import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIAssistantService } from './ai-assistant.service';
import { PrismaService } from '../../database/prisma.service';

describe('AIAssistantService Intent & Prompt Conditioning', () => {
  let service: AIAssistantService;

  const mockOrg = {
    id: 'org-test-1',
    name: 'Công ty TNHH Cà phê Sài Gòn',
    taxCode: '0312345678',
    industry: 'F&B',
    employeeCount: 8,
    legalType: 'Công ty TNHH',
    businessModel: 'Nhà hàng & Cà phê',
    contextFacts: [
      {
        id: 'fact-1',
        key: 'q_tax_corp_2',
        label: 'Tạm nộp thuế TNDN 80%',
        currentValue: 'Chưa thực hiện',
        status: 'Chưa xác thực',
        providedAt: new Date(),
      },
    ],
  };

  const mockPrisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue(mockOrg),
      update: jest.fn().mockResolvedValue(mockOrg),
    },
    rule: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    contextFact: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'fact-new', key: 'q_tax_corp_monbai', currentValue: 'Đã nộp' }),
    },
    task: {
      count: jest.fn().mockResolvedValue(0),
    },
    aiSystem: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cfg-test',
        provider: 'OPENCODE',
        apiKey: 'test-key',
        apiUrl: 'https://mock.opencode.ai/v1',
        model: 'deepseek-v4.1-flash',
      }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'OPENCODE_GO_API_URL') return 'https://mock.opencode.ai/v1';
      if (key === 'OPENCODE_GO_API_KEY') return 'test-key';
      if (key === 'OPENCODE_MODEL') return 'deepseek-v4.1-flash';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIAssistantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AIAssistantService>(AIAssistantService);
  });

  it('nên nhận diện câu hỏi chung về quy định pháp luật và trả lời bình thường (isEnterpriseQuery = false)', async () => {
    // Giả lập fetch lỗi để kích hoạt fallback engine kiểm tra nội dung trả về
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Thuế môn bài là gì và quy định mức nộp thế nào?',
    });

    expect(result.isEnterpriseQuery).toBe(false);
    expect(result.actionType).toBe('info');
    // Khi hỏi chung về luật: không chứa 10 phần rà soát doanh nghiệp
    expect(result.content).not.toContain('1. **Tổng quan**');
    expect(result.content).not.toContain('7. **Bằng chứng còn thiếu**');
    expect(result.content).not.toContain('10. **Câu hỏi xác minh**');
    expect(result.content).toContain('QUY ĐỊNH PHÁP LUẬT VỀ LỆ PHÍ MÔN BÀI');
  });

  it('nên nhận diện câu hỏi rà soát doanh nghiệp và đưa ra cấu trúc D -> G (isEnterpriseQuery = true)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Rà soát giúp doanh nghiệp tôi về lệ phí môn bài',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    // Khi hỏi về doanh nghiệp: phải có đầy đủ 10 phần chuẩn mực
    expect(result.content).toContain('1. **Tổng quan**');
    expect(result.content).toContain('2. **Kết luận**');
    expect(result.content).toContain('3. **Nghĩa vụ áp dụng**');
    expect(result.content).toContain('4. **Căn cứ pháp lý**');
    expect(result.content).toContain('5. **Dữ liệu đầu vào**');
    expect(result.content).toContain('6. **Kỳ và thời hạn**');
    expect(result.content).toContain('7. **Bằng chứng còn thiếu**');
    expect(result.content).toContain('8. **Rủi ro**');
    expect(result.content).toContain('9. **Hành động tiếp theo**');
    expect(result.content).toContain('10. **Câu hỏi xác minh**');
    expect(result.content).toContain('Công ty TNHH Cà phê Sài Gòn');
  });

  it('câu hỏi "Tôi có còn thiếu tuân thủ nào không?" phải được phân loại là câu hỏi rà soát doanh nghiệp', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Tôi có còn thiếu tuân thủ nào không?',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    expect(result.content).toContain('1. **Tổng quan**');
    expect(result.content).toContain('2. **Kết luận**');
    expect(result.content).toContain('3. **Nghĩa vụ áp dụng**');
    expect(result.content).toContain('6. **Kỳ và thời hạn**');
    expect(result.content).toContain('8. **Rủi ro**');
    expect(result.content).toContain('9. **Hành động tiếp theo**');
    expect(result.content).toContain('10. **Câu hỏi xác minh**');
  });

  it('câu hỏi chung về hạn nộp tờ khai quý phải trả lời luật bình thường, không chứa D -> G', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Hạn nộp tờ khai thuế GTGT và TNCN quý này là khi nào?',
    });

    expect(result.isEnterpriseQuery).toBe(false);
    expect(result.actionType).toBe('info');
    expect(result.content).not.toContain('1. **Tổng quan**');
    expect(result.content).not.toContain('7. **Bằng chứng còn thiếu**');
    expect(result.content).not.toContain('10. **Câu hỏi xác minh**');
    expect(result.content).toContain('QUY ĐỊNH PHÁP LUẬT VỀ THỜI HẠN VÀ KỲ KÊ KHAI THUẾ');
  });

  it('câu hỏi có ngữ cảnh công ty em có 5 người phải kích hoạt prompt rà soát doanh nghiệp D -> G', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Công ty em có 5 người thì cần nộp những khoản thuế nào?',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    expect(result.content).toContain('1. **Tổng quan**');
    expect(result.content).toContain('2. **Kết luận**');
    expect(result.content).toContain('3. **Nghĩa vụ áp dụng**');
    expect(result.content).toContain('4. **Căn cứ pháp lý**');
    expect(result.content).toContain('5. **Dữ liệu đầu vào**');
    expect(result.content).toContain('6. **Kỳ và thời hạn**');
    expect(result.content).toContain('7. **Bằng chứng còn thiếu**');
    expect(result.content).toContain('8. **Rủi ro**');
    expect(result.content).toContain('9. **Hành động tiếp theo**');
    expect(result.content).toContain('10. **Câu hỏi xác minh**');
  });

  it('câu hỏi rà soát phải sinh ra verificationChecklist chứa các mục thu thập thông tin còn thiếu', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Rà soát tổng thể tuân thủ thuế cho doanh nghiệp',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.verificationChecklist).toBeDefined();
    expect(Array.isArray(result.verificationChecklist)).toBe(true);
    expect((result.verificationChecklist as Array<Record<string, unknown>>).length).toBeGreaterThan(0);

    const firstItem = (result.verificationChecklist as Array<Record<string, unknown>>)[0];
    expect(firstItem.question).toBeDefined();
    expect(firstItem.options).toBeDefined();
    expect(Array.isArray(firstItem.options)).toBe(true);
  });

  it('khi doanh nghiệp gửi xác nhận checklist, hệ thống phân tích theo tình huống giả định nhưng KHÔNG tự ý ghi vào DB contextFact', async () => {
    const result = await service.chat('org-test-1', {
      message: 'Xác nhận thông tin: Lệ phí môn bài: Đã nộp đầy đủ vào NSNN; Tạm nộp thuế TNDN (80%): Đã tạm nộp đạt trên 80% số thuế TNDN cả năm',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    expect(result.content).toContain('BÁO CÁO PHÂN TÍCH LẠI TUÂN THỦ THUẾ THEO TÌNH HUỐNG GIẢ SỬ');
    expect(result.content).toContain('1. **Tổng quan**');
    expect(result.content).toContain('2. **Kết luận**');
    expect(result.content).toContain('3. **Nghĩa vụ áp dụng**');
    expect(result.content).toContain('Đã tiếp nhận và đối chiếu thành công các thông tin xác minh mới');
    expect(mockPrisma.contextFact.update).not.toHaveBeenCalled();
    expect(mockPrisma.contextFact.create).not.toHaveBeenCalled();
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it('từ chối trả lời các câu hỏi ngoài phạm vi doanh nghiệp và thuế (thời tiết, lập trình, ẩm thực)', async () => {
    // Không cần mock fetch vì hệ thống chặn ngay tại bước 1.2
    const weatherResult = await service.chat('org-test-1', {
      message: 'Thời tiết hôm nay ở Hà Nội có mưa không?',
    });

    expect(weatherResult.content).toContain('TỪ CHỐI TRẢ LỜI — CÂU HỎI NGOÀI PHẠM VI CHUYÊN MÔN');
    expect(weatherResult.content).toContain('CELRA AI — Trợ lý Rà soát Tuân thủ Thuế Doanh nghiệp');
    expect(weatherResult.actionType).toBe('info');

    const codeResult = await service.chat('org-test-1', {
      message: 'Viết cho tôi đoạn mã python tính dãy số fibonacci',
    });
    expect(codeResult.content).toContain('TỪ CHỐI TRẢ LỜI — CÂU HỎI NGOÀI PHẠM VI CHUYÊN MÔN');

    const foodResult = await service.chat('org-test-1', {
      message: 'Cách nấu món canh chua cá lóc thơm ngon',
    });
    expect(foodResult.content).toContain('TỪ CHỐI TRẢ LỜI — CÂU HỎI NGOÀI PHẠM VI CHUYÊN MÔN');
  });

  it('chấp nhận các câu hỏi chào hỏi hoặc hỏi năng lực trợ lý CELRA trong phạm vi', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const greetingResult = await service.chat('org-test-1', {
      message: 'Xin chào CELRA, bạn có thể hỗ trợ gì cho tôi?',
    });

    expect(greetingResult.content).not.toContain('TỪ CHỐI TRẢ LỜI');
  });
});
