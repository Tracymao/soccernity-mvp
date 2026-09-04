import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AdminTokenService } from '../token/admin-token.service';
import { AdminAccessTokenPayload } from '../token/admin-token.types';

// ---------------------------------------------------------------------
// THE "must have a valid admin access token" guard — the Admin Console
// equivalent of services/api/src/modules/auth/guards/jwt-auth.guard.ts's
// JwtAuthGuard, and deliberately a separate class, not a parameterized
// reuse of it. See AdminTokenService's header comment for the full
// isolation reasoning; the short version here: this guard only ever
// delegates to AdminTokenService.verifyAccessToken(), which can only
// ever succeed for a token signed with ADMIN_JWT_SECRET carrying the
// `aud: "admin-console"` claim — a User access token (signed with the
// separate JWT_SECRET) fails at signature verification before this
// guard's own logic even runs.
//
// USAGE PATTERN — identical shape to JwtAuthGuard's, on purpose, so
// admin-facing controllers read the same way User-facing ones do:
//
//   import { AdminJwtAuthGuard } from '<path>/modules/admin/guards/admin-jwt-auth.guard';
//   import { CurrentAdmin } from '<path>/modules/admin/guards/current-admin.decorator';
//
//   @UseGuards(AdminJwtAuthGuard)
//   @Get('some-protected-admin-route')
//   handler(@CurrentAdmin() admin: AdminAccessTokenPayload) {
//     // admin is exactly { sub, role, aud } — see admin-token.types.ts.
//   }
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not attach accountStatus (or
// any other safety/state-sensitive AdminUser field) to the request — see
// admin-token.types.ts's comment. Any handler that needs current
// accountStatus must re-query Prisma itself, the same discipline
// JwtAuthGuard's own doc comment establishes for isMinor/consentStatus.
// ---------------------------------------------------------------------
@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly adminTokenService: AdminTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { admin?: AdminAccessTokenPayload }>();

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.admin = this.adminTokenService.verifyAccessToken(token);
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    return token;
  }
}
