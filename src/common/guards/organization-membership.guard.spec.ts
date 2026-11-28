import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipStatus, UserRole } from '@prisma/client';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import { RolesGuard } from './roles.guard';

describe('Layer 1 Multi-Tenant Isolation & RBAC Guards', () => {
  const createMockContext = (reqOverrides: Record<string, unknown>): ExecutionContext => {
    const req = {
      headers: {},
      params: {},
      query: {},
      body: {},
      ...reqOverrides,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    OrganizationMembershipGuard.invalidateMembershipCache('org-a');
    OrganizationMembershipGuard.invalidateMembershipCache('org-b');
  });

  it('chặn đứng tài khoản Super Admin truy cập trái phép vào dữ liệu nội bộ doanh nghiệp', async () => {
    const mockPrisma = {
      membership: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const guard = new OrganizationMembershipGuard(mockPrisma as never);
    const ctx = createMockContext({
      user: { sub: 'admin-virtual-system-id', role: UserRole.admin, isSuperAdmin: true },
      headers: { 'x-organization-id': 'org-a' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('chặn tấn công đánh tráo Header x-organization-id khác với body.organizationId', async () => {
    const mockPrisma = {
      membership: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const guard = new OrganizationMembershipGuard(mockPrisma as never);
    const ctx = createMockContext({
      user: { sub: 'user-1', role: UserRole.owner },
      body: { organizationId: 'org-a' },
      headers: { 'x-organization-id': 'org-b' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('chặn người dùng truy cập doanh nghiệp không có membership active', async () => {
    const mockPrisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
      },
    };
    const guard = new OrganizationMembershipGuard(mockPrisma as never);
    const ctx = createMockContext({
      user: { sub: 'user-1', role: UserRole.owner },
      headers: { 'x-organization-id': 'org-b' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('xác thực hợp lệ, gán validatedOrgId và xóa cache tức thì khi thu hồi thành viên', async () => {
    const mockPrisma = {
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'mem-1',
            organizationId: 'org-a',
            userId: 'user-1',
            role: UserRole.owner,
            status: MembershipStatus.active,
          })
          .mockResolvedValueOnce(null),
        findFirst: jest.fn(),
      },
    };
    const guard = new OrganizationMembershipGuard(mockPrisma as never);
    const reqObj: Record<string, unknown> = {
      user: { sub: 'user-1', role: UserRole.owner },
      headers: { 'x-organization-id': 'org-a' },
    };
    const ctx = createMockContext(reqObj);

    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect((ctx.switchToHttp().getRequest() as { validatedOrgId?: string }).validatedOrgId).toBe('org-a');

    // Thu hồi quyền -> lần gọi tiếp theo phải đọc lại DB và bị chặn ngay lập tức
    OrganizationMembershipGuard.invalidateMembershipCache('org-a', 'user-1');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.membership.findUnique).toHaveBeenCalledTimes(2);
  });

  it('yêu cầu đăng nhập nếu thiếu thông tin user trên request', async () => {
    const mockPrisma = {
      membership: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const guard = new OrganizationMembershipGuard(mockPrisma as never);
    const ctx = createMockContext({ user: null });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('RolesGuard kiểm tra đúng vai trò theo từng doanh nghiệp (activeMembership.role) thay vì vai trò toàn cục', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false) // IS_PUBLIC_KEY
        .mockReturnValueOnce([UserRole.owner]), // ROLES_KEY
    } as unknown as Reflector;

    const rolesGuard = new RolesGuard(reflector);

    // User có global role = owner (ở công ty riêng), nhưng sang org-b chỉ là service_accountant -> phải bị chặn!
    const crossOrgCtx = createMockContext({
      user: { sub: 'user-1', role: UserRole.owner },
      activeMembership: {
        organizationId: 'org-b',
        userId: 'user-1',
        role: UserRole.service_accountant,
        status: MembershipStatus.active,
      },
    });

    expect(() => rolesGuard.canActivate(crossOrgCtx)).toThrow(ForbiddenException);
  });
});
