import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { UserRole, MembershipStatus, TransactionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/modules/auth/email.service';
import { RateLimitGuard } from '../src/common/guards/rate-limit.guard';
import { configureApp } from '../src/main';

describe('CELRA Security Fixes Regression & E2E Suite (17 Vulnerabilities)', () => {
  let app: NestExpressApplication;
  let jwtService: JwtService;
  let rateLimitGuard: RateLimitGuard;

  // In-memory state cho mock Prisma
  const users: Record<string, any> = {
    'user-owner-a': {
      id: 'user-owner-a',
      email: 'owner.a@celra.vn',
      name: 'Chủ Doanh Nghiệp A',
      role: UserRole.owner,
      roleTitle: 'Giám đốc',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      isTwoFactorEnabled: false,
      createdAt: new Date(),
    },
    'user-staff-a': {
      id: 'user-staff-a',
      email: 'staff.a@celra.vn',
      name: 'Nhân viên Nhân sự A',
      role: UserRole.hr_staff,
      roleTitle: 'HR Staff',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      isTwoFactorEnabled: false,
      createdAt: new Date(),
    },
    'user-expired-a': {
      id: 'user-expired-a',
      email: 'expired.a@celra.vn',
      name: 'Cựu Nhân Viên A',
      role: UserRole.hr_staff,
      roleTitle: 'Former Staff',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      isTwoFactorEnabled: false,
      createdAt: new Date(),
    },
    'user-new': {
      id: 'user-new',
      email: 'newuser@celra.vn',
      name: 'Người Dùng Mới',
      role: UserRole.owner,
      roleTitle: 'Chủ doanh nghiệp',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      isTwoFactorEnabled: false,
      createdAt: new Date(),
    },
    'user-admin': {
      id: 'user-admin',
      email: 'superadmin@celra.vn',
      name: 'Super Admin CELRA',
      role: UserRole.admin,
      roleTitle: 'Super Administrator',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      isTwoFactorEnabled: false,
      createdAt: new Date(),
    },
  };

  const organizations: Record<string, any> = {
    '11111111-org-a': {
      id: '11111111-org-a',
      name: 'Công ty TNHH Alpha A',
      taxCode: '0101248141',
      legalType: 'Công ty TNHH',
      industry: 'F&B',
      employeeCount: 15,
      subscriptionPlan: 'STARTER',
      subscriptionStatus: 'ACTIVE',
      subscriptionStartedAt: new Date(),
      subscriptionExpiresAt: new Date(Date.now() + 20 * 86400 * 1000),
      subscriptionNextBillingAt: new Date(Date.now() + 20 * 86400 * 1000),
      currentBillingCycleStart: new Date(),
      aiQueriesUsedThisMonth: 10,
      docAnalysesUsedThisMonth: 3,
      autoRenew: true,
      departments: [],
      contextFacts: [],
      evidenceDocuments: [],
    },
    '22222222-org-b': {
      id: '22222222-org-b',
      name: 'Công ty Cổ phần Beta B',
      taxCode: '0309999999',
      legalType: 'Công ty Cổ phần',
      industry: 'Thương mại',
      employeeCount: 40,
      subscriptionPlan: 'PROFESSIONAL',
      subscriptionStatus: 'ACTIVE',
      subscriptionStartedAt: new Date(),
      subscriptionExpiresAt: new Date(Date.now() + 20 * 86400 * 1000),
      subscriptionNextBillingAt: new Date(Date.now() + 20 * 86400 * 1000),
      currentBillingCycleStart: new Date(),
      aiQueriesUsedThisMonth: 5,
      docAnalysesUsedThisMonth: 2,
      autoRenew: true,
      departments: [],
      contextFacts: [],
      evidenceDocuments: [],
    },
  };

  const memberships: any[] = [
    {
      id: 'mem-owner-a',
      organizationId: '11111111-org-a',
      userId: 'user-owner-a',
      role: UserRole.owner,
      roleTitle: 'Giám đốc',
      status: MembershipStatus.active,
      departmentId: 'dept-a',
    },
    {
      id: 'mem-staff-a',
      organizationId: '11111111-org-a',
      userId: 'user-staff-a',
      role: UserRole.hr_staff,
      roleTitle: 'HR',
      status: MembershipStatus.active,
      departmentId: 'dept-a',
    },
    {
      id: 'mem-expired-a',
      organizationId: '11111111-org-a',
      userId: 'user-expired-a',
      role: UserRole.hr_staff,
      roleTitle: 'Former HR',
      status: MembershipStatus.expired,
      departmentId: 'dept-a',
    },
    {
      id: 'mem-b',
      organizationId: '22222222-org-b',
      userId: 'user-owner-b',
      role: UserRole.owner,
      roleTitle: 'Giám đốc B',
      status: MembershipStatus.active,
      departmentId: 'dept-b',
    },
  ];

  const departments: Record<string, any> = {
    'dept-a': { id: 'dept-a', organizationId: '11111111-org-a', name: 'Phòng Kế toán A', code: 'ACC', memberCount: 2 },
    'dept-b': { id: 'dept-b', organizationId: '22222222-org-b', name: 'Phòng Kế toán B', code: 'ACC', memberCount: 1 },
  };

  const contextFacts: Record<string, any> = {
    'fact-a': { id: 'fact-a', organizationId: '11111111-org-a', key: 'tax_code', label: 'MST A', group: 'phap_ly_von', currentValue: '0101248141', status: 'confirmed', history: [] },
    'fact-b': { id: 'fact-b', organizationId: '22222222-org-b', key: 'tax_code', label: 'MST B', group: 'phap_ly_von', currentValue: '0309999999', status: 'confirmed', history: [] },
  };

  const tasks: Record<string, any> = {
    'task-a': { id: 'task-a', organizationId: '11111111-org-a', code: 'T-A', title: 'Task A', status: 'need_info', priority: 'high' },
    'task-b': { id: 'task-b', organizationId: '22222222-org-b', code: 'T-B', title: 'Task B', status: 'need_info', priority: 'high' },
  };

  const evidenceDocs: Record<string, any> = {
    'doc-a': { id: 'doc-a', organizationId: '11111111-org-a', linkedTaskId: 'task-a', name: 'invoice-a.pdf', filePath: './uploads/evidence/nonexistent-a.pdf', status: 'unverified' },
    'doc-b': { id: 'doc-b', organizationId: '22222222-org-b', linkedTaskId: 'task-b', name: 'secret-b.pdf', filePath: './uploads/evidence/nonexistent-b.pdf', status: 'unverified' },
  };

  const wallets: Record<string, any> = {
    '11111111-org-a': { id: 'wallet-a', organizationId: '11111111-org-a', balance: 1350, heldAmount: 50, currency: 'CREDIT', transactions: [] },
    '22222222-org-b': { id: 'wallet-b', organizationId: '22222222-org-b', balance: 500, heldAmount: 0, currency: 'CREDIT', transactions: [] },
  };

  const walletTransactions: any[] = [
    {
      id: 'tx-real-dep-1',
      walletId: 'wallet-b',
      code: 'DEP-999999',
      taskName: 'Nạp tiền bí mật Org B',
      requestedBy: 'SePay',
      amount: 450,
      type: 'deposit',
      status: TransactionStatus.success,
      note: 'Secret Org B deposit',
      timestamp: new Date(),
    },
  ];

  const mockEmailService = {
    sendOtpEmail: jest.fn(async () => false),
    sendResetPasswordOtpEmail: jest.fn(async () => false),
    sendMemberInviteEmail: jest.fn(async () => true),
  };

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return users[where.id] || null;
        if (where.email) {
          return Object.values(users).find((u) => u.email === where.email) || null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: `user-${Date.now()}`, ...data, createdAt: new Date() };
        users[created.id] = created;
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const u = where.id ? users[where.id] : Object.values(users).find((x) => x.email === where.email);
        if (!u) return null;
        Object.assign(u, data);
        return u;
      }),
    },
    organization: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return organizations[where.id] || null;
        if (where.taxCode) {
          return Object.values(organizations).find((o) => o.taxCode === where.taxCode) || null;
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const prefix = where?.id?.startsWith;
        if (prefix) {
          return Object.values(organizations).find((o) => o.id.startsWith(prefix)) || null;
        }
        return null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const org = organizations[where.id];
        if (!org) return null;
        Object.assign(org, data);
        return org;
      }),
    },
    membership: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.organizationId_userId) {
          const { organizationId, userId } = where.organizationId_userId;
          return memberships.find((m) => m.organizationId === organizationId && m.userId === userId) || null;
        }
        if (where.id) return memberships.find((m) => m.id === where.id) || null;
        return null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          memberships.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.userId && m.userId !== where.userId) return false;
            if (where.status && m.status !== where.status) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return memberships
          .filter((m) => {
            if (where?.userId && m.userId !== where.userId) return false;
            if (where?.organizationId && m.organizationId !== where.organizationId) return false;
            if (where?.status && m.status !== where.status) return false;
            return true;
          })
          .map((m) => ({ ...m, organization: organizations[m.organizationId], department: departments[m.departmentId] || null }));
      }),
      create: jest.fn(async ({ data }: any) => {
        const created = {
          id: `mem-${Date.now()}`,
          ...data,
          organization: organizations[data.organizationId],
        };
        memberships.push(created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const m = memberships.find((x) => x.id === where.id);
        if (m) Object.assign(m, data);
        return m;
      }),
      delete: jest.fn(async ({ where }: any) => ({ id: where.id })),
    },
    department: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          Object.values(departments).find(
            (d) =>
              (!where.id || d.id === where.id) &&
              (!where.organizationId || d.organizationId === where.organizationId),
          ) || null
        );
      }),
      update: jest.fn(async ({ where, data }: any) => ({ ...departments[where.id], ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      delete: jest.fn(async ({ where }: any) => ({ id: where.id })),
    },
    contextFact: {
      findUnique: jest.fn(async ({ where }: any) => contextFacts[where.id] || null),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          Object.values(contextFacts).find(
            (f) =>
              (!where.id || f.id === where.id) &&
              (!where.organizationId || f.organizationId === where.organizationId),
          ) || null
        );
      }),
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    task: {
      findUnique: jest.fn(async ({ where }: any) => tasks[where.id] || null),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          Object.values(tasks).find(
            (t) =>
              (!where.id || t.id === where.id) &&
              (!where.organizationId || t.organizationId === where.organizationId),
          ) || null
        );
      }),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ where, data }: any) => ({ ...tasks[where.id], ...data })),
    },
    evidenceDocument: {
      findUnique: jest.fn(async ({ where }: any) => evidenceDocs[where.id] || null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: `doc-${Date.now()}`, ...data, uploadedAt: new Date() };
        evidenceDocs[created.id] = created;
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => ({ ...evidenceDocs[where.id], ...data })),
    },
    wallet: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.organizationId) return wallets[where.organizationId] || null;
        if (where.id) return Object.values(wallets).find((w) => w.id === where.id) || null;
        return null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const w = Object.values(wallets).find((x) => x.id === where.id);
        if (!w) return null;
        if (data.balance?.increment) w.balance += data.balance.increment;
        if (data.balance?.decrement) w.balance -= data.balance.decrement;
        if (typeof data.balance === 'number') w.balance = data.balance;
        if (data.currency) w.currency = data.currency;
        return w;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const w = Object.values(wallets).find((x) => x.id === where.id);
        if (!w) return { count: 0 };
        if (where.balance?.gte !== undefined && w.balance < where.balance.gte) return { count: 0 };
        if (where.heldAmount?.gte !== undefined && w.heldAmount < where.heldAmount.gte) return { count: 0 };
        if (data.balance?.decrement) w.balance -= data.balance.decrement;
        if (data.balance?.increment) w.balance += data.balance.increment;
        if (data.heldAmount?.increment) w.heldAmount += data.heldAmount.increment;
        if (data.heldAmount?.decrement) w.heldAmount -= data.heldAmount.decrement;
        return { count: 1 };
      }),
    },
    walletTransaction: {
      create: jest.fn(async ({ data }: any) => {
        const id = data.id || `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        if (walletTransactions.some((t) => t.id === id)) {
          const err: any = new Error('Unique constraint failed on id');
          err.code = 'P2002';
          throw err;
        }
        const created = { id, ...data, timestamp: new Date() };
        walletTransactions.push(created);
        return created;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const matching = walletTransactions.filter((t) => !where.code || t.code === where.code);
        return matching.length > 0 ? matching[matching.length - 1] : null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return walletTransactions.filter((t) => !where?.walletId || t.walletId === where.walletId);
      }),
    },
    subscriptionInvoice: {
      create: jest.fn(async ({ data }: any) => ({ id: `inv-${Date.now()}`, ...data })),
      findMany: jest.fn(async () => []),
    },
    aiSystem: {
      findFirst: jest.fn(async () => ({
        id: 'ai-sys-1',
        organizationId: null,
        provider: 'GEMINI',
        apiKey: 'AIzaSySUPER_SECRET_RAW_KEY_123456789',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.5-flash',
        availableModels: ['gemini-2.5-flash'],
        lastTestedAt: new Date(),
      })),
      update: jest.fn(async () => ({})),
    },
    systemConfig: {
      findUnique: jest.fn(async () => null),
    },
    rule: {
      findMany: jest.fn(async () => []),
    },
    legalDocument: {
      findMany: jest.fn(async () => []),
    },
    citRevenue: { findMany: jest.fn(async () => []) },
    citExpense: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
  };

  let ownerAToken: string;
  let staffAToken: string;
  let expiredAToken: string;
  let newUserToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_super_strong_jwt_secret_minimum_32_characters_long';
    process.env.SEPAY_WEBHOOK_API_KEY = 'sepay_test_webhook_secret_key_32_chars';
    process.env.VIETQR_ACCOUNT_NO = '0987654321';
    process.env.SANDBOX_HMAC_SECRET = 'sandbox_hmac_secret_key_for_e2e_tests_32';
    process.env.ENABLE_SANDBOX_PAYMENT = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(EmailService)
      .useValue(mockEmailService)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);

    ownerAToken = await jwtService.signAsync({
      sub: 'user-owner-a',
      email: 'owner.a@celra.vn',
      role: UserRole.owner,
      name: 'Chủ Doanh Nghiệp A',
    });
    staffAToken = await jwtService.signAsync({
      sub: 'user-staff-a',
      email: 'staff.a@celra.vn',
      role: UserRole.hr_staff,
      name: 'Nhân viên Nhân sự A',
    });
    expiredAToken = await jwtService.signAsync({
      sub: 'user-expired-a',
      email: 'expired.a@celra.vn',
      role: UserRole.hr_staff,
      name: 'Cựu Nhân Viên A',
    });
    newUserToken = await jwtService.signAsync({
      sub: 'user-new',
      email: 'newuser@celra.vn',
      role: UserRole.owner,
      name: 'Người Dùng Mới',
    });
    adminToken = await jwtService.signAsync({
      sub: 'user-admin',
      email: 'superadmin@celra.vn',
      role: UserRole.admin,
      name: 'Super Admin CELRA',
    });
  });

  beforeEach(() => {
    rateLimitGuard.resetStore();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // GROUP A: AUTH, OTP, EMAIL & MEMBERSHIP ESCALATION
  // =========================================================================
  describe('Group A: Auth, OTP, Profile & Membership Escalation', () => {
    it('A1. Production forgot-password không trả debugOtp, chống email enumeration và trả 503 khi gửi mail lỗi', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        // Email không tồn tại -> trả 200/201 thông báo trung tính (không lộ lỗi email chưa đăng ký)
        const nonExistent = await request(app.getHttpServer())
          .post('/api/v1/auth/forgot-password/send-otp')
          .send({ email: 'nobody@example.com' });
        expect([200, 201]).toContain(nonExistent.status);
        expect(nonExistent.body.data?.debugOtp).toBeUndefined();
        expect(nonExistent.body.debugOtp).toBeUndefined();

        // Email tồn tại nhưng Brevo trả false ở prod -> 503, KHÔNG bao giờ rò debugOtp
        mockEmailService.sendResetPasswordOtpEmail.mockResolvedValueOnce(false);
        const failSend = await request(app.getHttpServer())
          .post('/api/v1/auth/forgot-password/send-otp')
          .send({ email: 'owner.a@celra.vn' });
        expect(failSend.status).toBe(503);
        expect(failSend.body.debugOtp).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('A2. verifyForgotPasswordOtp trả thông báo lỗi đồng nhất và tự hủy OTP sau 3 lần sai', async () => {
      mockEmailService.sendResetPasswordOtpEmail.mockResolvedValueOnce(true);
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password/send-otp')
        .send({ email: 'staff.a@celra.vn' });

      const missingRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'unknown@celra.vn', otp: '111111' });
      expect(missingRes.status).toBe(400);

      for (let i = 0; i < 3; i++) {
        const wrongRes = await request(app.getHttpServer())
          .post('/api/v1/auth/forgot-password/verify-otp')
          .send({ email: 'staff.a@celra.vn', otp: '000000' });
        expect(wrongRes.status).toBe(400);
        // Thông báo lỗi đồng nhất hoàn toàn với email chưa từng gửi OTP (xóa enumeration oracle)
        expect(wrongRes.body.message).toBe(missingRes.body.message);
      }

      // Đã bị hủy khỏi store sau 3 lần sai
      const resetStore: Map<string, any> = (global as any).__CELRA_RESET_OTP_STORE__;
      expect(resetStore.has('staff.a@celra.vn')).toBe(false);
    });

    it('A3. ResetPasswordDto chặn mật khẩu quá ngắn qua field tiếng Việt matKhauMoi', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password/reset')
        .send({ email: 'owner.a@celra.vn', otp: '123456', matKhauMoi: '1' });
      expect(res.status).toBe(400);
    });

    it('A4. PATCH /auth/profile chặn tự đổi email chưa xác thực và chặn avatar javascript:/SVG XSS', async () => {
      const emailRes = await request(app.getHttpServer())
        .patch('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ email: 'hijack@othercompany.vn' });
      expect(emailRes.status).toBe(400);

      const xssAvatarRes = await request(app.getHttpServer())
        .patch('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ avatar: 'javascript:alert(1)' });
      expect(xssAvatarRes.status).toBe(400);
    });

    it('A5. POST /memberships/invite chặn gán role admin và gửi mật khẩu tạm CSPRNG qua EmailService', async () => {
      const escalateRes = await request(app.getHttpServer())
        .post('/api/v1/memberships/invite')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .send({ email: 'hacker@evil.vn', name: 'Hacker', role: 'admin' });
      expect([400, 403]).toContain(escalateRes.status);

      const validInviteRes = await request(app.getHttpServer())
        .post('/api/v1/memberships/invite')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .send({ email: 'newstaff@celra.vn', name: 'Nhân sự mới', role: 'hr_staff', departmentId: 'dept-a' });
      expect(validInviteRes.status).toBe(201);
      expect(mockEmailService.sendMemberInviteEmail).toHaveBeenCalledTimes(1);
      const sentTempPassword = (mockEmailService.sendMemberInviteEmail.mock.calls[0] as unknown[])[3] as string;
      expect(sentTempPassword).toBeTruthy();
      expect(sentTempPassword).not.toBe('12345678');
      expect(sentTempPassword.length).toBeGreaterThanOrEqual(10);
    });
  });

  // =========================================================================
  // GROUP B: MULTI-TENANT ISOLATION, RBAC, SURVEY & ADMIN SSRF
  // =========================================================================
  describe('Group B: Multi-Tenant Isolation, RBAC, Survey & Admin SSRF', () => {
    it('B1. Chặn xung đột orgId (?orgId=OrgA + header x-organization-id=OrgB) bằng 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks?orgId=11111111-org-a')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '22222222-org-b');
      expect(res.status).toBe(403);
    });

    it('B2. Chặn 100% Cross-Tenant IDOR từ Owner Org A sang tài nguyên của Org B', async () => {
      const checks = await Promise.all([
        request(app.getHttpServer())
          .get('/api/v1/organizations/22222222-org-b')
          .set('Authorization', `Bearer ${ownerAToken}`),
        request(app.getHttpServer())
          .patch('/api/v1/organizations/22222222-org-b')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .send({ name: 'Hacked Name' }),
        request(app.getHttpServer())
          .get('/api/v1/wallets/transactions')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .set('x-organization-id', '22222222-org-b'),
        request(app.getHttpServer())
          .get('/api/v1/context-facts/fact-b')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .set('x-organization-id', '11111111-org-a'),
        request(app.getHttpServer())
          .get('/api/v1/tasks/task-b?orgId=11111111-org-a')
          .set('Authorization', `Bearer ${ownerAToken}`),
        request(app.getHttpServer())
          .get('/api/v1/evidence-documents/doc-b/download?orgId=11111111-org-a')
          .set('Authorization', `Bearer ${ownerAToken}`),
        request(app.getHttpServer())
          .patch('/api/v1/departments/dept-b')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .set('x-organization-id', '11111111-org-a')
          .send({ name: 'Hacked Dept' }),
        request(app.getHttpServer())
          .delete('/api/v1/memberships/mem-b')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .set('x-organization-id', '11111111-org-a'),
      ]);

      for (const res of checks) {
        expect([403, 404]).toContain(res.status);
      }
    });

    it('B3. Upload bằng chứng gắn taskId của Org B -> 403, không lưu DB và tự xóa file tạm', async () => {
      const uploadDir = path.resolve(process.cwd(), 'uploads', 'evidence');
      const beforeFiles = fs.existsSync(uploadDir) ? new Set(fs.readdirSync(uploadDir)) : new Set<string>();

      const validPdfBuffer = Buffer.from('%PDF-1.4\n%Valid test PDF\n');
      const res = await request(app.getHttpServer())
        .post('/api/v1/evidence-documents/upload')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .field('taskId', 'task-b')
        .attach('file', validPdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(403);
      expect(mockPrisma.evidenceDocument.create).not.toHaveBeenCalled();

      const afterFiles = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
      const leakedFiles = afterFiles.filter((f) => !beforeFiles.has(f));
      expect(leakedFiles).toHaveLength(0);
    });

    it('B4. Nhân sự bị thu hồi (expired) gọi POST /surveys/submit bị chặn 403 không tự tái kích hoạt', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/surveys/submit')
        .set('Authorization', `Bearer ${expiredAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .send({ baseProfile: { companyName: 'Hijacked' }, questions: [] });
      expect(res.status).toBe(403);
    });

    it('B5. RBAC nội bộ: hr_staff bị chặn 403 khi duyệt chứng từ, đổi gói cước hoặc sửa doanh nghiệp', async () => {
      const [verifyRes, subRes, cancelRes, patchOrgRes] = await Promise.all([
        request(app.getHttpServer())
          .patch('/api/v1/evidence-documents/doc-a/verify')
          .set('Authorization', `Bearer ${staffAToken}`)
          .set('x-organization-id', '11111111-org-a')
          .send({ status: 'accepted' }),
        request(app.getHttpServer())
          .post('/api/v1/subscriptions/subscribe')
          .set('Authorization', `Bearer ${staffAToken}`)
          .set('x-organization-id', '11111111-org-a')
          .send({ planCode: 'ENTERPRISE' }),
        request(app.getHttpServer())
          .post('/api/v1/subscriptions/cancel')
          .set('Authorization', `Bearer ${staffAToken}`)
          .set('x-organization-id', '11111111-org-a'),
        request(app.getHttpServer())
          .patch('/api/v1/organizations/11111111-org-a')
          .set('Authorization', `Bearer ${staffAToken}`)
          .send({ name: 'Staff Changed' }),
      ]);

      expect(verifyRes.status).toBe(403);
      expect(subRes.status).toBe(403);
      expect(cancelRes.status).toBe(403);
      expect(patchOrgRes.status).toBe(403);
    });

    it('B6. RBAC hệ thống: Owner thường bị chặn 403 trên các route Admin của AI & Task', async () => {
      const [r1, r2, r3, r4] = await Promise.all([
        request(app.getHttpServer())
          .put('/api/v1/ai-assistant/legal-rules/RULE-TAX-MB')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .send({ title: 'Tampered' }),
        request(app.getHttpServer())
          .post('/api/v1/ai-assistant/sync-legal-rules')
          .set('Authorization', `Bearer ${ownerAToken}`),
        request(app.getHttpServer())
          .get('/api/v1/ai-assistant/dlpl-quota')
          .set('Authorization', `Bearer ${ownerAToken}`),
        request(app.getHttpServer())
          .post('/api/v1/tasks/trigger-reminders')
          .set('Authorization', `Bearer ${ownerAToken}`),
      ]);

      expect(r1.status).toBe(403);
      expect(r2.status).toBe(403);
      expect(r3.status).toBe(403);
      expect(r4.status).toBe(403);
    });

    it('B7. Admin AI Config ẩn raw apiKey và chặn SSRF + không ghi đè DB ở test-key', async () => {
      const cfgRes = await request(app.getHttpServer())
        .get('/api/v1/admin/ai/config')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(cfgRes.status).toBe(200);
      expect(cfgRes.body.data.apiKey).toBeUndefined();
      expect(cfgRes.body.data.hasApiKey).toBe(true);
      expect(cfgRes.body.data.apiKeyMasked).toContain('...');

      const ssrfRes = await request(app.getHttpServer())
        .post('/api/v1/admin/ai/test-key')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'GEMINI',
          apiUrl: 'http://169.254.169.254/latest/meta-data',
        });
      expect(ssrfRes.status).toBe(400);
      expect(mockPrisma.aiSystem.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GROUP C: FINANCIAL INTEGRITY (SEPAY, WALLET, SUBSCRIPTION, SANDBOX HMAC)
  // =========================================================================
  describe('Group C: SePay Webhook, Wallet Balance, Subscription & Sandbox HMAC', () => {
    it('C1. SePay Webhook: sai API Key -> 401; < 10.000đ -> 400; trùng GD ID -> chỉ cộng đúng 1 lần', async () => {
      const payload = {
        id: 778899,
        gateway: 'MBBank',
        transactionDate: '2026-11-24 10:00:00',
        accountNumber: '0987654321',
        content: 'CELRA 11111111 NAP GOI',
        transferType: 'in',
        transferAmount: 200000,
        accumulated: 2000000,
      };

      const noAuth = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/sepay')
        .send(payload);
      expect(noAuth.status).toBe(401);

      const smallAmount = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/sepay')
        .set('Authorization', `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}`)
        .send({ ...payload, id: 778900, transferAmount: 999 });
      expect(smallAmount.status).toBe(400);

      const startBalance = wallets['11111111-org-a'].balance;

      // Lần 1 -> thành công (+120 credit)
      const first = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/sepay')
        .set('Authorization', `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}`)
        .send(payload);
      expect(first.status).toBe(201);
      expect(wallets['11111111-org-a'].balance).toBe(startBalance + 120);

      // Lần 2 trùng ID -> idempotent, KHÔNG cộng thêm lần 2
      const replay = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/sepay')
        .set('Authorization', `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}`)
        .send(payload);
      expect(replay.status).toBe(201);
      expect(replay.body.data.duplicated).toBe(true);
      expect(wallets['11111111-org-a'].balance).toBe(startBalance + 120);
    });

    it('C2. getWallet() bảo toàn số dư >= 1.000 Credit (không bị reset xuống 50)', async () => {
      wallets['11111111-org-a'].balance = 1350;
      wallets['11111111-org-a'].currency = 'CREDIT';

      const res = await request(app.getHttpServer())
        .get('/api/v1/wallets/my-wallet')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a');
      expect(res.status).toBe(200);
      expect(res.body.data.balance).toBe(1350);
    });

    it('C3. Chặn Owner tự nạp tiền (/wallets/deposit) và chặn tự kích hoạt gói trả phí trên Production', async () => {
      const depRes = await request(app.getHttpServer())
        .post('/api/v1/wallets/deposit')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .send({ amount: 500000 });
      expect(depRes.status).toBe(403);

      const prevEnv = process.env.NODE_ENV;
      const prevSandbox = process.env.ENABLE_SANDBOX_PAYMENT;
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_SANDBOX_PAYMENT = 'false';
      try {
        const buyPkgProd = await request(app.getHttpServer())
          .post('/api/v1/wallets/buy-package')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .set('x-organization-id', '11111111-org-a')
          .send({ packageId: 'PKG_450' });
        expect(buyPkgProd.status).toBe(403);

        const freeEntProd = await request(app.getHttpServer())
          .post('/api/v1/subscriptions/subscribe')
          .set('Authorization', `Bearer ${ownerAToken}`)
          .set('x-organization-id', '11111111-org-a')
          .send({ planCode: 'ENTERPRISE' });
        expect(freeEntProd.status).toBe(403);
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.ENABLE_SANDBOX_PAYMENT = prevSandbox;
      }
    });

    it('C4. Sandbox HMAC: chặn giả mạo, cho phép FAILED -> Thử lại -> SUCCESS, chặn replay SUCCESS và không lộ mã thật', async () => {
      // Giả mạo không có signature -> 403
      const forged = await request(app.getHttpServer())
        .post('/api/v1/wallets/sandbox-payment')
        .send({
          orgId: '11111111-org-a',
          orderCode: 'SBX-FORGED',
          packageId: 'PKG_450',
          outcome: 'SUCCESS',
        });
      expect(forged.status).toBe(403);

      // Tạo session có ký HMAC hợp lệ
      const sessionRes = await request(app.getHttpServer())
        .post('/api/v1/wallets/sandbox-session')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .send({ packageId: 'PKG_50' });
      expect(sessionRes.status).toBe(201);
      const session = sessionRes.body.data;
      expect(session.orderCode).toMatch(/^SBX-/);
      expect(session.signature).toBeTruthy();

      // Kịch bản 1: Bấm FAILED
      const failRes = await request(app.getHttpServer())
        .post('/api/v1/wallets/sandbox-payment')
        .send({
          orgId: session.orgId,
          orderCode: session.orderCode,
          packageId: session.packageId,
          amount: session.amount,
          signature: session.signature,
          expiresAt: session.expiresAt,
          outcome: 'FAILED',
          failureReason: 'Test retry',
        });
      expect(failRes.status).toBe(201);
      expect(failRes.body.data.status).toBe('failed');

      // Kịch bản 2: Bấm Thử lại -> SUCCESS trên CÙNG orderCode hợp lệ -> Thành công!
      const beforeBal = wallets['11111111-org-a'].balance;
      const okRes = await request(app.getHttpServer())
        .post('/api/v1/wallets/sandbox-payment')
        .send({
          orgId: session.orgId,
          orderCode: session.orderCode,
          packageId: session.packageId,
          amount: session.amount,
          signature: session.signature,
          expiresAt: session.expiresAt,
          outcome: 'SUCCESS',
        });
      expect(okRes.status).toBe(201);
      expect(okRes.body.data.status).toBe('success');
      expect(wallets['11111111-org-a'].balance).toBe(beforeBal + 50);

      // Kịch bản 3: Replay lại SUCCESS lần 2 -> 409 Conflict!
      const replayRes = await request(app.getHttpServer())
        .post('/api/v1/wallets/sandbox-payment')
        .send({
          orgId: session.orgId,
          orderCode: session.orderCode,
          packageId: session.packageId,
          amount: session.amount,
          signature: session.signature,
          expiresAt: session.expiresAt,
          outcome: 'SUCCESS',
        });
      expect(replayRes.status).toBe(409);

      // Sandbox status KHÔNG lộ giao dịch thật DEP-999999
      const realDepStatus = await request(app.getHttpServer())
        .get('/api/v1/wallets/sandbox-status/DEP-999999');
      expect(realDepStatus.status).toBe(200);
      expect(realDepStatus.body.data).toEqual({ found: false, status: 'pending' });

      // Sandbox status cho SBX-... chỉ trả { found, status } tối giản
      const sbxStatus = await request(app.getHttpServer())
        .get(`/api/v1/wallets/sandbox-status/${encodeURIComponent(session.orderCode)}`);
      expect(sbxStatus.status).toBe(200);
      expect(sbxStatus.body.data).toEqual({ found: true, status: 'success' });
      expect(sbxStatus.body.data.transaction).toBeUndefined();
    });
  });

  // =========================================================================
  // GROUP D: PERIMETER, CORS, RATE LIMIT, UPLOAD MAGIC BYTES, TAX & AI CACHE
  // =========================================================================
  describe('Group D: Security Headers, CORS, Rate Limit, Upload, TaxLookup & AI DTO', () => {
    it('D1. Security Headers có mặt, bỏ X-Powered-By và CORS từ chối origin lạ không sinh lỗi 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai-assistant/legal-rules')
        .set('Origin', 'https://evil-attacker.example');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('D2. Rate Limit: giả mạo header CF-Connecting-IP KHÔNG vượt được giới hạn 10 lần/phút của /auth/login', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('CF-Connecting-IP', `203.0.113.${i + 1}`)
          .send({ email: 'nobody@celra.vn', password: 'wrongpassword' });
        expect(res.status).toBe(401);
      }

      const blocked = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('CF-Connecting-IP', '198.51.100.99')
        .send({ email: 'nobody@celra.vn', password: 'wrongpassword' });
      expect(blocked.status).toBe(429);
    });

    it('D3. Upload Magic Bytes: chặn giả mạo .exe -> .pdf (400 & xóa file) và chấp nhận .webp thật', async () => {
      const uploadDir = path.resolve(process.cwd(), 'uploads', 'evidence');
      const beforeFiles = fs.existsSync(uploadDir) ? new Set(fs.readdirSync(uploadDir)) : new Set<string>();

      const fakePdf = Buffer.from('MZ\x90\x00FakeExecutableAsPdf');
      const rejectRes = await request(app.getHttpServer())
        .post('/api/v1/evidence-documents/upload')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .attach('file', fakePdf, { filename: 'malware.pdf', contentType: 'application/pdf' });
      expect(rejectRes.status).toBe(400);

      const afterReject = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
      expect(afterReject.filter((f) => !beforeFiles.has(f))).toHaveLength(0);

      // Ảnh WEBP thật -> chấp nhận 201 (rồi dọn file test)
      const validWebp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x20, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP'),
        Buffer.from('VP8 '),
      ]);
      const acceptRes = await request(app.getHttpServer())
        .post('/api/v1/evidence-documents/upload')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .attach('file', validWebp, { filename: 'receipt.webp', contentType: 'image/webp' });
      expect(acceptRes.status).toBe(201);

      const uploadedPath = acceptRes.body?.data?.filePath;
      if (uploadedPath && fs.existsSync(uploadedPath)) {
        fs.unlinkSync(uploadedPath);
      }
    });

    it('D4. GET /tax-lookup/:taxCode không tiết lộ registeredOrgId hay registeredOrgName', async () => {
      const origFetch = global.fetch;
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          code: '00',
          desc: 'Success',
          data: {
            id: '0101248141',
            name: 'CONG TY ALPHA',
            shortName: 'ALPHA',
            address: 'Ha Noi',
            status: 'NNT đang hoạt động',
          },
        }),
      })) as any;

      try {
        const res = await request(app.getHttpServer()).get('/api/v1/tax-lookup/0101248141');
        expect(res.status).toBe(200);
        expect(res.body.data.isRegisteredInCelra).toBe(true);
        expect(res.body.data.registeredOrgId).toBeUndefined();
        expect(res.body.data.registeredOrgName).toBeUndefined();
      } finally {
        global.fetch = origFetch;
      }
    });

    it('D5. POST /ai-assistant/chat chặn mảng history > 10 phần tử bằng 400 Bad Request', async () => {
      const oversizedHistory = Array.from({ length: 11 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Tin nhắn ${i}`,
      }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/ai-assistant/chat')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('x-organization-id', '11111111-org-a')
        .send({ message: 'Thuế môn bài là gì?', history: oversizedHistory });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GROUP E: HAPPY-PATH REGRESSION
  // =========================================================================
  describe('Group E: Happy-Path Regression', () => {
    it('E1. User mới chưa có doanh nghiệp vẫn gọi được GET /organizations/my-workspaces (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/my-workspaces')
        .set('Authorization', `Bearer ${newUserToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('E2. Owner Org A truy cập đúng GET /organizations/11111111-org-a và GET /wallets/packages (200)', async () => {
      const orgRes = await request(app.getHttpServer())
        .get('/api/v1/organizations/11111111-org-a')
        .set('Authorization', `Bearer ${ownerAToken}`);
      expect(orgRes.status).toBe(200);
      expect(orgRes.body.data.id).toBe('11111111-org-a');

      const pkgRes = await request(app.getHttpServer())
        .get('/api/v1/wallets/packages')
        .set('Authorization', `Bearer ${ownerAToken}`);
      expect(pkgRes.status).toBe(200);
      expect(Array.isArray(pkgRes.body.data)).toBe(true);
    });
  });
});
