import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedAdminRequest } from './authenticated-admin-request';

// Convenience accessor for the { sub, role, aud } payload
// AdminJwtAuthGuard attaches to the request under `request.admin`.
// Mirrors services/api/src/modules/auth/guards/current-user.decorator.ts's
// CurrentUser exactly, deliberately reading a different request property
// so the two can never be confused for one another. Only meaningful on
// routes already behind @UseGuards(AdminJwtAuthGuard) — using this on an
// unguarded route silently yields `undefined` at runtime, same caveat as
// CurrentUser.
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    return request.admin;
  },
);
