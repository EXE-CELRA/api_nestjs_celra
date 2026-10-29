import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrganizationMembershipGuard } from '../src/common/guards/organization-membership.guard';
import { UserRole, MembershipStatus } from '@prisma/client';

describe('🛡️ Multi-Tenant & Auth Security Guards', () => {
  describe('JwtAuthGuard (Token Expiry & Deleted User Check)', () => {
    let guard: JwtAuthGuard;
    let mockJwtService: any;
    let mockReflector: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockJwtService = {
        verifyAsync: jest.fn(),
      };
      mockReflector = {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      };
      mockPrisma = {
        user: {
          findUnique: jest.fn(),
        },
      };
      guard = new JwtAuthGuard(mockJwtService, mockReflector, mockPrisma);
    });

    it('Nên chặn và ném UnauthorizedException khi tài khoản người dùng đã bị xóa khỏi DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'deleted-user-id-123',
        email: 'deleted@test.com',
      });
      // Giả lập tài khoản bị xóa trong DB -> trả về null
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer valid.jwt.token' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('Nên cho phép truy cập khi token hợp lệ và tài khoản vẫn còn tồn tại trong DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'active-user-id-456',
        email: 'active@test.com',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'active-user-id-456',
        email: 'active@test.com',
      });

      const requestObj: any = {
        headers: { authorization: 'Bearer valid.jwt.token' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => requestObj,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
      expect(requestObj.user.sub).toBe('active-user-id-456');
    });
  });

  describe('OrganizationMembershipGuard (Strict Multi-tenant Isolation)', () => {
    let guard: OrganizationMembershipGuard;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        membership: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
        },
      };
      guard = new OrganizationMembershipGuard(mockPrisma);
    });

    it('Nên chặn khi người dùng cố truy cập dữ liệu của doanh nghiệp B mà không có membership', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue(null);

      const mockRequest: any = {
        user: { sub: 'user-1', role: UserRole.owner },
        params: {},
        body: {},
        query: {},
        headers: { 'x-organization-id': 'org-enterprise-B' },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });

    it('Nên cho phép khi người dùng có membership ACTIVE trong doanh nghiệp A', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-enterprise-A',
        userId: 'user-1',
        status: MembershipStatus.active,
        role: UserRole.owner,
      });

      const mockRequest: any = {
        user: { sub: 'user-1', role: UserRole.owner },
        params: {},
        body: {},
        query: {},
        headers: { 'x-organization-id': 'org-enterprise-A' },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
      expect(mockRequest.validatedOrgId).toBe('org-enterprise-A');
    });
  });
});
