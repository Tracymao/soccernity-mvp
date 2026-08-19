import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Guardian, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeConsentTokenExpiresAt } from '../guardian-consent/consent-token.constants';
import { PasswordService } from '../password/password.service';
import { TokenService } from '../token/token.service';
import { TokenPair } from '../token/token.types';
import { computeIsMinor, isPlausibleDateOfBirth } from './age.util';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationTokenStore } from './email-verification/email-verification-token.store';
import { RegistrationEmailService } from './email/registration-email.service';

export interface RegisterResult {
  user: User;
  guardian: Guardian | null;
  tokens: TokenPair;
}

// Build Plan Section 4.1 (POST /auth/register, POST /auth/verify-email),
// Section 5.7 (auth spec) and Section 8.3 (guardian-consent flow, steps
// 1-3: age declaration, guardian-details capture, guardian consent
// email). Section 8.3 steps 4-6 (guardian confirming consent, the
// restricted-pending state's enforcement on other endpoints, and
// activation) belong to other modules — this service only covers what
// happens at registration time.
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly emailVerificationTokenStore: EmailVerificationTokenStore,
    private readonly emailService: RegistrationEmailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    // Decision Log #16 (Build Plan Section 9): normalize email to
    // lowercase on write so matching is case-insensitive — a guardian or
    // player who registered with mixed-case casing shouldn't be unable
    // to log in (or get a false "not a duplicate" on re-registering)
    // with the same address typed differently. Normalized once here and
    // reused below rather than at the DTO layer, so it applies
    // consistently regardless of which controller path builds the DTO.
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Deliberately generic — do not reveal whether the email exists via
      // timing or message differences beyond this standard 409; that's as
      // far as this PR's scope goes (no email-enumeration hardening spec
      // exists in Section 4/5.7 beyond ordinary REST semantics).
      throw new ConflictException('An account with this email already exists');
    }

    const dateOfBirth = new Date(dto.dateOfBirth);
    if (!isPlausibleDateOfBirth(dateOfBirth)) {
      throw new BadRequestException('dateOfBirth must be a real, non-future date');
    }

    const isMinor = computeIsMinor(dateOfBirth);

    // Build Plan Section 8.3, step 2: "If the declared age is under 18,
    // the signup flow branches here: capture guardian name, email and
    // relationship to the minor before account creation completes."
    if (isMinor && !dto.guardian) {
      throw new BadRequestException(
        'Guardian details (name, email, relationship) are required for a declared age under 18',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        phone: dto.phone,
        passwordHash,
        displayName: dto.displayName,
        dateOfBirth,
        isMinor,
      },
    });

    let guardian: Guardian | null = null;
    if (isMinor && dto.guardian) {
      // Guardian.consentStatus defaults to "pending" and
      // consentTimestamp is left null in the schema (Section 3) — both
      // only change once the guardian actually consents via the separate
      // /auth/guardian-consent endpoint (Section 4.1, out of this PR's
      // scope), per the restricted-pending state (Section 8.3, step 5).
      guardian = await this.prisma.guardian.create({
        data: {
          minorUserId: user.id,
          name: dto.guardian.name,
          email: dto.guardian.email,
          relationship: dto.guardian.relationship,
          consentToken: randomUUID(),
          // DPIA finding R5: the token is a permanent credential without
          // an expiry -- see guardian-consent/consent-token.constants.ts.
          consentTokenExpiresAt: computeConsentTokenExpiresAt(this.config),
        },
      });
    }

    const verificationToken = await this.emailVerificationTokenStore.issue(user.id);

    // Registration must never block on (or fail because of) email
    // delivery — see RegistrationEmailService's "wired, not live" note.
    // Errors here are logged, not rethrown or awaited into the response.
    void this.emailService.sendVerificationEmail(user.email, verificationToken).catch((err: Error) => {
      this.logger.warn(`Failed to queue verification email for user ${user.id}: ${err.message}`);
    });

    if (guardian) {
      void this.emailService
        .sendGuardianConsentEmail(guardian.email, guardian.consentToken, user.displayName)
        .catch((err: Error) => {
          this.logger.warn(`Failed to queue guardian consent email for user ${user.id}: ${err.message}`);
        });
    }

    // TokenService.issueTokenPair's own doc comment: "Issues a brand-new
    // session (e.g. on login/register)." A minor's account is created in
    // the restricted-pending state (Section 8.3, step 5) but still
    // exists and can authenticate — every safety-sensitive endpoint must
    // re-check current isMinor/guardian.consentStatus against the
    // database itself (Section 5.7's non-negotiable), not trust this (or
    // any) access token, which per token.types.ts carries only
    // { sub, role }.
    const tokens = await this.tokenService.issueTokenPair(user.id, user.role);

    return { user, guardian, tokens };
  }

  async verifyEmail(token: string): Promise<{ userId: string }> {
    const userId = await this.emailVerificationTokenStore.verifyAndConsume(token);
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: 'verified' },
    });

    return { userId };
  }
}
