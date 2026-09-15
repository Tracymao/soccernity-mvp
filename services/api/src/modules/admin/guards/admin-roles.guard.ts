import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ROLES_KEY } from './admin-roles.decorator';
import { AuthenticatedAdminRequest } from './authenticated-admin-request';

// ---------------------------------------------------------------------
// The role-gating guard paired with @AdminRoles(...) — see that
// decorator's own header comment for the usage pattern and why this
// exists (sprint-5/admin-moderation-queue-backend, the first role-gated
// admin route in this codebase).
//
// MUST run after AdminJwtAuthGuard in the same @UseGuards(...) list —
// this guard reads request.admin.role, which AdminJwtAuthGuard is what
// attaches. It does NOT re-verify the token itself and does NOT re-read
// AdminUser from Postgres — it trusts the `role` claim already baked into
// the verified access-token payload (AdminAccessTokenPayload), the same
// trust boundary AdminJwtAuthGuard's own header comment already draws
// for `sub`: a short-lived access token's claims are trusted for the
// life of that token; a role change taking effect only on the admin's
// NEXT login (not retroactively, mid-session) is the same trade-off
// Section 5.7's fresh-read-from-Postgres discipline deliberately does
// NOT extend to here — that discipline is about safety-sensitive USER
// state (isMinor/consentStatus), not admin role assignment, which has no
// equivalent "must react to Postgres on this literal request" language
// anywhere in Section 5.7/8.3/8.4.
//
// No required-roles metadata at all (the common case for every admin
// route built before this PR existed) => allow through unconditionally.
// ---------------------------------------------------------------------
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    const role = request.admin?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
