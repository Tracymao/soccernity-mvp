import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password/password.service';
import { DEFAULT_EMAIL_VERIFICATION_TTL_MS } from '../auth/registration/email-verification/email-verification-token.store';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { TokenService } from '../auth/token/token.service';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import {
  EMAIL_CHANGE_LINK_INVALID_CODE,
  EMAIL_CHANGE_LINK_INVALID_MESSAGE,
  EMAIL_CHANGE_MAX_EMAIL_LENGTH,
  EMAIL_CHANGE_TWO_FACTOR_INVALID_CODE,
  EMAIL_CHANGE_TWO_FACTOR_REQUIRED_CODE,
  EMAIL_CHANGE_UNAVAILABLE_CODE,
  EMAIL_CHANGE_WRONG_PASSWORD_CODE,
} from './email-change.constants';
import { EmailChangeLimiter } from './email-change.limiter';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const normalise = (email: string): string => email.trim().toLowerCase();

type Requester = { id: string; email: string; isMinor: boolean };
type AddressOutcome = { kind: 'ignore' } | { kind: 'usable' } | { kind: 'taken'; registeredEmail: string };

// backend/email-change (B-059; Decision Log #472 adopted default (f), register Section 80b item 8; reworked by
// Decision Log #476). Until B-059 no code path changed User.email. Two steps:
//
//   1. requestChange: a signed-in user proves their password (and a second factor when it is on) and names a new
//      address. The answer is ALWAYS 202 from then on, whatever the address is. What happens next is done in the
//      BACKGROUND, so neither the response nor its timing says anything about the address:
//        - usable: a HASH of a single-use secret is stored and the link is emailed to the NEW address;
//        - already used by an account: a plain "cannot be used" email goes to that address (no link, nothing about
//          the person who asked);
//        - malformed, longer than 254 characters, the same as the current address, or (for a minor) the guardian's
//          address: nothing is sent;
//        - the CURRENT address is told a request was made for every one of them, without naming the new address.
//      Nothing on User changes yet.
//   2. confirmChange: the link is used (no sign-in needed; the secret is the credential). In ONE transaction the
//      address is set, the request is marked used and the checks are repeated; then every session is ended and,
//      for a minor, the confirmed guardian is told (GuardianSecurityNoticeService, event email_changed).
//
// Limits (all on the shared AuthLimitsStore, see EmailChangeLimiter): 5 wrong passwords per 15 minutes per account;
// 5 requests per hour per account on EVERY outcome (429 + Retry-After); and at most 3 emails per 24 hours per
// recipient address (silent skip, response unchanged). The 503 for an unusable WEB_APP_BASE_URL is decided by
// configuration alone, before anything that depends on the address.
//
// Anti-enumeration: a signed-in, password-confirmed person can no longer learn from this route whether an address is
// registered. The only way left is by email (the owner of a taken address gets one), which is why that email says
// nothing about who asked.
@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger(EmailChangeService.name);
  // Background steps still running. Only used by whenIdle(), so a test (or a graceful shutdown) can wait for them.
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly twoFactor: TwoFactorService,
    private readonly email: RegistrationEmailService,
    private readonly guardianNotices: GuardianSecurityNoticeService,
    private readonly limiter: EmailChangeLimiter,
  ) {}

  async requestChange(userId: string, dto: RequestEmailChangeDto): Promise<void> {
    // Configuration alone decides this (Decision Log #476), before any lookup, so the 503 is the same for every
    // address and says nothing about one.
    if (!this.email.isWebAppBaseUrlUsable()) {
      this.logger.error('[email-change] WEB_APP_BASE_URL is missing, a placeholder, or not https -- email change is unavailable.');
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: EMAIL_CHANGE_UNAVAILABLE_CODE,
        message: 'Email change is not available right now.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true, isMinor: true },
    });
    // A valid access token for a since-deleted account (the rare case JwtAuthGuard's comment describes).
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // The slot is taken BEFORE the password is looked at.
    await this.limiter.reserve(userId);

    if (!(await this.passwordService.verify(user.passwordHash, dto.password))) {
      // The slot stays taken: a wrong password is a failed attempt.
      throw this.identityError(EMAIL_CHANGE_WRONG_PASSWORD_CODE, 'Incorrect password');
    }
    // The password was right, so this attempt is not a password failure whatever happens next.
    await this.limiter.release(userId);

    if (await this.twoFactor.isEnabledForUser(userId)) {
      if (dto.twoFactorCode === undefined || dto.twoFactorCode.trim() === '') {
        throw this.identityError(EMAIL_CHANGE_TWO_FACTOR_REQUIRED_CODE, 'A two-factor code is required.');
      }
      try {
        // The same code path sign-in uses: the per-account wrong-code lock (a 429 passes through), the replay guard
        // and single-use backup codes.
        await this.twoFactor.assertUserCode(userId, dto.twoFactorCode);
      } catch (err) {
        if (err instanceof UnauthorizedException) {
          throw this.identityError(EMAIL_CHANGE_TWO_FACTOR_INVALID_CODE, 'That code did not work. Check it and try again.');
        }
        throw err;
      }
    }

    // Identity is proven. From here the answer is the same 202 for every address: the request cap counts the
    // attempt whatever the address is (429 + Retry-After once it is spent), and everything that depends on the
    // address happens after the response.
    await this.limiter.reserveRequest(userId);
    const requester: Requester = { id: user.id, email: user.email, isMinor: user.isMinor };
    this.runInBackground(() => this.processRequest(requester, normalise(dto.newEmail)));
  }

  // Resolves when every background step started so far has finished. For tests and a graceful shutdown; the request
  // path never calls it.
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  private runInBackground(step: () => Promise<void>): void {
    const promise: Promise<void> = step()
      .catch((err) => {
        // No address, token or user detail in the log line.
        this.logger.warn(`Email change background step failed: ${(err as Error)?.message ?? err}`);
      })
      .finally(() => {
        this.inFlight.delete(promise);
      });
    this.inFlight.add(promise);
  }

  // Everything that depends on the address. Each part is isolated, so a failure in one never stops the other.
  private async processRequest(user: Requester, newEmail: string): Promise<void> {
    // The notice to the CURRENT address (timing DEFAULT, founder-veto-able: at request time, so the real owner has a
    // chance to react). For every request that got this far, and it never names the new address.
    try {
      if (await this.limiter.claimRecipientSlot(user.email)) await this.email.sendEmailChangeNoticeEmail(user.email);
    } catch (err) {
      this.logger.warn(`Email change notice was not sent: ${(err as Error)?.message ?? err}`);
    }

    try {
      const outcome = await this.classify(user, newEmail);
      if (outcome.kind === 'ignore') return;
      if (outcome.kind === 'taken') {
        // Sent to the address as it is registered. No link, nothing about who asked.
        if (await this.limiter.claimRecipientSlot(outcome.registeredEmail)) {
          await this.email.sendEmailChangeUnavailableEmail(outcome.registeredEmail);
        }
        return;
      }
      await this.startChange(user.id, newEmail);
    } catch (err) {
      this.logger.warn(`Email change request was not completed: ${(err as Error)?.message ?? err}`);
    }
  }

  private async startChange(userId: string, newEmail: string): Promise<void> {
    // Checked BEFORE a row is created, so a skipped email never replaces an earlier pending request with a dead one.
    if (!(await this.limiter.claimRecipientSlot(newEmail))) return;

    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + DEFAULT_EMAIL_VERIFICATION_TTL_MS);
    // ONE pending request per user: the earlier unused one is deleted, so its link stops working.
    const request = await this.prisma.$transaction(async (tx) => {
      await tx.emailChangeRequest.deleteMany({ where: { userId, usedAt: null } });
      return tx.emailChangeRequest.create({
        data: { userId, newEmail, tokenHash: hashToken(secret), expiresAt },
        select: { id: true },
      });
    });

    const sent = await this.email.sendEmailChangeVerifyEmail(newEmail, secret);
    if (!sent) {
      // The base URL turned unusable after the up-front check: there is no link to send. Discard the request.
      await this.prisma.emailChangeRequest.deleteMany({ where: { id: request.id } });
      this.logger.error('[email-change] The verification link could not be built; the request was discarded.');
    }
  }

  async confirmChange(rawToken: string): Promise<void> {
    const now = new Date();
    const request = await this.prisma.emailChangeRequest.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!request || request.usedAt !== null || request.expiresAt.getTime() <= now.getTime()) {
      throw this.linkInvalid();
    }

    let isMinor = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        // The claim: of two simultaneous uses of one link exactly one gets count 1.
        const claim = await tx.emailChangeRequest.updateMany({
          where: { id: request.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claim.count !== 1) throw this.linkInvalid();

        const user = await tx.user.findUnique({
          where: { id: request.userId },
          select: { id: true, isMinor: true, accountStatus: true },
        });
        if (!user || user.accountStatus !== 'active') throw this.linkInvalid();

        if (user.isMinor) {
          const guardian = await tx.guardian.findUnique({
            where: { minorUserId: user.id },
            select: { email: true, consentStatus: true },
          });
          // Re-checked here, not only at request time: consent can be withdrawn and the guardian's address can be
          // changed between the request and the click. A restricted-pending minor cannot change their email.
          if (!guardian || guardian.consentStatus !== 'confirmed') throw this.linkInvalid();
          if (normalise(guardian.email) === request.newEmail) throw this.linkInvalid();
        }
        isMinor = user.isMinor;

        // The address was proven by the link itself, so the account is now verified (DEFAULT, founder-veto-able).
        // A unique violation (the address was taken in the meantime) rolls the whole transaction back and is the
        // same generic answer.
        await tx.user.update({ where: { id: user.id }, data: { email: request.newEmail, verificationStatus: 'verified' } });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw this.linkInvalid();
      throw err;
    }

    // As after a password change: every session ends (DEFAULT, founder-veto-able).
    await this.tokenService.revokeAllSessionsForUser(request.userId);
    // After the change has committed; never delays or fails the response. The service itself sends nothing for a
    // pending or declined guardian, or an account whose notices are withheld (#458).
    if (isMinor) this.guardianNotices.notifyInBackground(request.userId, 'email_changed');
  }

  // What to do with the new address. Runs in the background, so it may do as many lookups as it likes: nothing the
  // caller sees depends on it. The guardian rule comes BEFORE the lookup, so a guardian's address is never emailed
  // even when it also belongs to an account.
  private async classify(user: Requester, newEmail: string): Promise<AddressOutcome> {
    if (newEmail.length > EMAIL_CHANGE_MAX_EMAIL_LENGTH || !isEmail(newEmail)) return { kind: 'ignore' };
    if (newEmail === normalise(user.email)) return { kind: 'ignore' };
    if (user.isMinor) {
      // #365: a minor's own email and the guardian's differ.
      const guardian = await this.prisma.guardian.findUnique({ where: { minorUserId: user.id }, select: { email: true } });
      if (guardian && normalise(guardian.email) === newEmail) return { kind: 'ignore' };
    }
    const taken = await this.prisma.user.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (taken) return { kind: 'taken', registeredEmail: taken.email };
    return { kind: 'usable' };
  }

  private identityError(code: string, message: string): ForbiddenException {
    return new ForbiddenException({ statusCode: 403, error: 'Forbidden', code, message });
  }

  private linkInvalid(): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: EMAIL_CHANGE_LINK_INVALID_CODE,
      message: EMAIL_CHANGE_LINK_INVALID_MESSAGE,
    });
  }
}
