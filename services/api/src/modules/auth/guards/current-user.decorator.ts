import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './authenticated-request';

// Convenience accessor for the { sub, role } payload JwtAuthGuard attaches
// to the request. Only meaningful on routes already behind
// @UseGuards(JwtAuthGuard) — Nest param decorators can't enforce that
// ordering at compile time, so using @CurrentUser() on an unguarded route
// will silently yield `undefined` at runtime rather than erroring. Always
// pair the two.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
