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
  EMAIL_CHANGE_NOT_ACCEPTED_CODE,
  EMAIL_CHANGE_NOT_ACCEPTED_MESSAGE,
  EMAIL_CHANGE_TWO_FACTOR_INVALID_CODE,
  EMAIL_CHANGE_TWO_FACTOR_REQUIRED_CODE,
  EMAIL_CHANGE_UNAVAILABLE_CODE,
  EMAIL_CHANGE_WRONG_PASSWORD_CODE,
} from './email-change.constants';
import { EmailChangeLimiter } from './email-change.limiter';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const normalise = (email: string): string => email.trim().toLowerCase();

// backend/email-change (B-059; Decision Log #472 adopted default (f), register Section 80b item 8). Until now no code
// path changed User.email. Two steps:
//
//   1. requestChange: a signed-in user proves their password (and a second factor when it is on) and names a new
//      address. We store a HASH of a single-use secret and email the link to the NEW address; the CURRENT address is
//      told a request was made. Nothing changes on User yet.
//   2. confirmChange: the link is used (no sign-in needed; the secret is the credential). In ONE transaction the
//      address is set, the request is marked used and the checks are repeated; then every session is ended and,
//      for a minor, the confirmed guardian is told (GuardianSecurityNoticeService, event email_changed).
//
// Anti-enumeration: every reason the new address cannot be used returns the ONE identical email_change_not_accepted
// answer, and a not-accepted attempt spends the same per-account budget as a wrong password (see the limiter).
// KNOWN RESIDUAL, flagged in the PR: accepted (202) vs not accepted (400) still tells a signed-in, password-confirmed
// user whether an address is registered; the budget above bounds how fast they can ask.
@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger(EmailChangeService.name);

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

    const newEmail = normalise(dto.newEmail);
    if (!(await this.isAcceptable(user, newEmail))) {
      // A not-accepted address counts as a failed attempt (DEFAULT, founder-veto-able): take a slot again.
      await this.limiter.reserve(userId);
      throw this.notAccepted();
    }

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
      // WEB_APP_BASE_URL is unusable: there is no link to send. Same answer for every address; discard the request.
      await this.prisma.emailChangeRequest.deleteMany({ where: { id: request.id } });
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: EMAIL_CHANGE_UNAVAILABLE_CODE,
        message: 'Email change is not available right now.',
      });
    }
    // The notice to the CURRENT address (timing DEFAULT, founder-veto-able: at request time, so the real owner has
    // a chance to react). Never delays or fails the response.
    void this.email.sendEmailChangeNoticeEmail(user.email).catch((err) => {
      this.logger.warn(`Email change notice was not sent: ${(err as Error)?.message ?? err}`);
    });
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

  // Every reason the address is unusable folds into one boolean, so the caller can give one answer.
  private async isAcceptable(user: { id: string; email: string; isMinor: boolean }, newEmail: string): Promise<boolean> {
    if (newEmail.length > EMAIL_CHANGE_MAX_EMAIL_LENGTH || !isEmail(newEmail)) return false;
    if (newEmail === normalise(user.email)) return false;
    const taken = await this.prisma.user.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) return false;
    if (user.isMinor) {
      // #365: a minor's own email and the guardian's differ.
      const guardian = await this.prisma.guardian.findUnique({ where: { minorUserId: user.id }, select: { email: true } });
      if (guardian && normalise(guardian.email) === newEmail) return false;
    }
    return true;
  }

  private identityError(code: string, message: string): ForbiddenException {
    return new ForbiddenException({ statusCode: 403, error: 'Forbidden', code, message });
  }

  private notAccepted(): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: EMAIL_CHANGE_NOT_ACCEPTED_CODE,
      message: EMAIL_CHANGE_NOT_ACCEPTED_MESSAGE,
    });
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
