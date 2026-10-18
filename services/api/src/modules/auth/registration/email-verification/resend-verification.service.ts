import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RegistrationEmailService } from '../email/registration-email.service';
import { EmailVerificationTokenStore } from './email-verification-token.store';
import { ResendVerificationLimiter } from './resend-verification.limiter';

// The one response, whatever happened. Same posture as forgot-password.
export const RESEND_VERIFICATION_GENERIC_MESSAGE =
  'If that email belongs to an account that still needs to be verified, a new verification link has been sent.';

// B-128 (Decision Log #406 item 3, #37). POST /auth/resend-verification-email.
//
// WHO: unauthenticated and keyed by the account's email, like forgot-password
// and the guardian resend. That serves both a signed-in unverified user on
// /verify-email/prompt and one who has lost their session; it also means the
// route must not reveal whether the address is registered or verified, so
// EVERY outcome returns the same 200 body.
//
// WHAT IT SENDS: a fresh single-use link through the existing
// sendVerificationEmail (B-016 link, existing template). Earlier links are NOT
// revoked -- the token store is keyed by token and has no per-user index -- so
// up to RESEND_VERIFICATION_MAX_PER_WINDOW (3) per hour can be live together,
// each valid for its own 48 h. A deliberate trade-off, bounded by the cap.
//
// WHEN IT SENDS NOTHING (silently): no such user; already verified; account not
// 'active' (deactivated, suspended, pending deletion, deleted); per-account cap
// reached.
//
// TIMING: the sending path does a Redis write and a token issue that the
// no-match path does not, so response time can differ by a few milliseconds.
// Not padded, consistent with forgot-password and Decision Log #350.
@Injectable()
export class ResendVerificationService {
  private readonly logger = new Logger(ResendVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenStore: EmailVerificationTokenStore,
    private readonly emailService: RegistrationEmailService,
    private readonly limiter: ResendVerificationLimiter,
  ) {}

  async resend(email: string): Promise<void> {
    // Decision Log #16: User.email is stored lowercase.
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, verificationStatus: true, accountStatus: true },
    });

    if (!user || user.verificationStatus === 'verified' || user.accountStatus !== 'active') {
      return;
    }
    if (!(await this.limiter.tryAcquire(user.id))) {
      return;
    }

    const token = await this.tokenStore.issue(user.id);
    // Never blocks on, or fails because of, email delivery (as registration).
    void this.emailService.sendVerificationEmail(user.email, token).catch((err: Error) => {
      this.logger.warn(`Failed to queue verification email for user ${user.id}: ${err.message}`);
    });
  }
}
