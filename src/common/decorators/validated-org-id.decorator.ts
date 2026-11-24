import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Trích xuất organizationId đã được OrganizationMembershipGuard xác thực.
 * Nguyên tắc Fail-Closed: không bao giờ fallback sang header/query thô chưa qua kiểm tra.
 */
export const ValidatedOrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const validatedOrgId: string | undefined = request.validatedOrgId;

    if (!validatedOrgId) {
      if (request.user?.role === UserRole.admin || request.user?.isSuperAdmin) {
        return '';
      }
      throw new ForbiddenException(
        'Không xác định được doanh nghiệp hợp lệ cho yêu cầu này.',
      );
    }

    return validatedOrgId;
  },
);
