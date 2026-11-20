import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from './authenticated-request';

// B-020 (Decision Log #367): "Email verification is required of every user
// before Create Profile." Until now nothing read User.verificationStatus
// except for display, so an unverified account could do everything a verified
// one could.
//
// Composable alongside JwtAuthGuard, never a replacement: list JwtAuthGuard
// FIRST in @UseGuards() so request.user is attached by the time this runs.
//
// Same Section 5.7 discipline as GuardianConsentGuard: the access token
// carries only { sub, role }, so verificationStatus is read fresh from
// Postgres on every request this guard protects and is never trusted from the
// token. Verification is one-way (unverified -> verified, see
// RegistrationService.verifyEmail), so a stale read can only be too strict,
// never too loose.
//
// FAIL-SAFE: only the exact value 'verified' lets a request through. A
// missing row (account deleted behind a still-valid token), 'unverified', or
// any future/unknown status all refuse. (GuardianConsentGuard deliberately
// lets a missing row fall through to the handler's own 404; this guard guards
// a precondition rather than a restriction, so absence is a refusal.)
//
// WHICH ROUTES: decision #367 says "before Create Profile" without listing
// routes (build register B-020 notes the gap). As built, the guard is applied
// to the profile-completion write only, PATCH /users/:id -- the route that
// sets username/displayName/phone, i.e. what Create Profile will call. It is
// deliberately NOT applied to login, reading one's own profile, the guardian
// status page, resend-verification, or posting (posting stays governed by
// GuardianConsentGuard): an unverified user must still be able to sign in and
// read why they are blocked. Extending it is a one-line @UseGuards.
export const EMAIL_VERIFICATION_REQUIRED_CODE = 'email_verification_required';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { sub: userId } = request.user;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verificationStatus: true },
    });

    if (user?.verificationStatus === 'verified') {
      return true;
    }

    // A distinct, machine-readable `code` so the frontend can show "verify
    // your email to continue" rather than treating this as an auth failure.
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: EMAIL_VERIFICATION_REQUIRED_CODE,
      message: 'Verify your email address to continue.',
    });
  }
}
