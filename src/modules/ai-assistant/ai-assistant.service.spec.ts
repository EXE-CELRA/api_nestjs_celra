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
    },
    rule: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    contextFact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    task: {
      count: jest.fn().mockResolvedValue(0),
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
    // Khi hỏi chung về luật: không chứa các tiêu đề D -> G dạng rà soát doanh nghiệp
    expect(result.content).not.toContain('D. Danh sách nghĩa vụ thuế');
    expect(result.content).not.toContain('E. Thông tin cần xác minh');
    expect(result.content).not.toContain('F. Việc nên làm tiếp theo');
    expect(result.content).toContain('QUY ĐỊNH PHÁP LUẬT VỀ LỆ PHÍ MÔN BÀI');
  });

  it('nên nhận diện câu hỏi rà soát doanh nghiệp và đưa ra cấu trúc D -> G (isEnterpriseQuery = true)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Rà soát giúp doanh nghiệp tôi về lệ phí môn bài',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    // Khi hỏi về doanh nghiệp: phải có các phần tương ứng D -> G
    expect(result.content).toContain('D. Danh sách nghĩa vụ thuế');
    expect(result.content).toContain('E. Thông tin cần xác minh');
    expect(result.content).toContain('F. Việc nên làm tiếp theo');
    expect(result.content).toContain('G. Nguồn pháp lý');
    expect(result.content).toContain('Công ty TNHH Cà phê Sài Gòn');
  });

  it('câu hỏi "Tôi có còn thiếu tuân thủ nào không?" phải được phân loại là câu hỏi rà soát doanh nghiệp', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Tôi có còn thiếu tuân thủ nào không?',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    expect(result.content).toContain('D. Danh sách nghĩa vụ thuế');
    expect(result.content).toContain('E. Thông tin cần xác minh');
    expect(result.content).toContain('F. Việc nên làm tiếp theo');
    expect(result.content).toContain('G. Nguồn pháp lý');
  });

  it('câu hỏi chung về hạn nộp tờ khai quý phải trả lời luật bình thường, không chứa D -> G', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Hạn nộp tờ khai thuế GTGT và TNCN quý này là khi nào?',
    });

    expect(result.isEnterpriseQuery).toBe(false);
    expect(result.actionType).toBe('info');
    expect(result.content).not.toContain('D. Danh sách nghĩa vụ thuế');
    expect(result.content).not.toContain('E. Thông tin cần xác minh');
    expect(result.content).toContain('QUY ĐỊNH PHÁP LUẬT VỀ THỜI HẠN VÀ KỲ KÊ KHAI THUẾ');
  });

  it('câu hỏi có ngữ cảnh công ty em có 5 người phải kích hoạt prompt rà soát doanh nghiệp D -> G', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.chat('org-test-1', {
      message: 'Công ty em có 5 người thì cần nộp những khoản thuế nào?',
    });

    expect(result.isEnterpriseQuery).toBe(true);
    expect(result.actionType).toBe('enterprise_audit');
    expect(result.content).toContain('D. Danh sách nghĩa vụ thuế');
    expect(result.content).toContain('E. Thông tin cần xác minh');
    expect(result.content).toContain('F. Việc nên làm tiếp theo');
    expect(result.content).toContain('G. Nguồn pháp lý');
  });
});
