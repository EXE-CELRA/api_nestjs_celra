import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const SKIP_ORG_MEMBERSHIP_KEY = 'skipOrgMembership';
export const SkipOrgMembership = () => SetMetadata(SKIP_ORG_MEMBERSHIP_KEY, true);

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) {
      return null;
    }
    return data ? request.user[data] : request.user;
  },
);

export const ValidatedOrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.validatedOrgId || '';
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.validatedOrgId || request.organizationId || request.headers['x-organization-id'] || null;
  },
);
