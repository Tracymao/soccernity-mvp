import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from './authenticated-request';

// Build Plan Section 8.3, step 5: "Until consent is recorded, the
// minor's account exists but is restricted." This is that enforcement,
// as a guard composable alongside JwtAuthGuard -- NOT a replacement for
// it. Always list JwtAuthGuard first in @UseGuards() so request.user
// (AuthenticatedRequest) is already attached by the time this guard
// runs; this guard does not verify the token itself.
//
// Section 5.7's non-negotiable, restated on RegistrationService's own
// register() comment: "every safety-sensitive endpoint must re-check
// current isMinor/guardian.consentStatus against the database itself,
// not trust this (or any) access token" -- AccessTokenPayload
// structurally carries only { sub, role } (token.types.ts), so there is
// no shortcut here even if one were tempting. Both isMinor and
// consentStatus are read fresh from Postgres on every request this
// guard protects.
export const GUARDIAN_CONSENT_PENDING_CODE = 'guardian_consent_pending';

@Injectable()
export class GuardianConsentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { sub: userId } = request.user;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isMinor: true },
    });

    // A since-deleted account behind a still-valid access token (same
    // rare-but-real case JwtAuthGuard's own doc comment and
    // UsersService.getOwnProfile both call out) isn't this guard's
    // concern to diagnose -- let the request through to whatever
    // handler-level check (or 404) is appropriate for that case.
    if (!user || !user.isMinor) {
      return true;
    }

    // Guardian.minorUserId is @unique (prisma/schema.prisma) -- at most
    // one Guardian row per minor.
    const guardian = await this.prisma.guardian.findUnique({
      where: { minorUserId: userId },
      select: { consentStatus: true },
    });

    if (guardian?.consentStatus === 'confirmed') {
      return true;
    }

    // A distinct, machine-readable `code` (not just a generic 403
    // message) so the frontend can render a "waiting on your guardian"
    // state rather than treating this as an auth failure -- see this
    // PR's report for the exact routes this is meant to protect.
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: GUARDIAN_CONSENT_PENDING_CODE,
      message: 'This account is awaiting guardian consent and cannot access this feature yet.',
    });
  }
}
