import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Guardian, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClubsService } from '../../clubs/clubs.service';
import { computeConsentTokenExpiresAt } from '../guardian-consent/consent-token.constants';
import { GuardianConsentService } from '../guardian-consent/guardian-consent.service';
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

// Sprint 2 / sprint-2/verify-email-consent-status-field (Decision Log
// #38). POST /auth/verify-email needs to let a minor's own frontend tell
// apart "fully verified, no consent gate applies" from "still
// restricted-pending" right after the email-verification step, without a
// second round-trip to GET /auth/guardian-consent/status.
//
// Deliberately a plain `string`, not a narrower TypeScript union — this
// mirrors GuardianConsentStatusResponse.consentStatus's own established
// convention (guardian-consent.service.ts) of typing the real DB column's
// value as `string` rather than hardcoding a union that would go stale
// the moment a new value (e.g. Decision Log #34's still-unbuilt
// guardian-decline flow, which would add a 'declined' state) is added to
// the schema. The three values this endpoint can actually produce today:
//   - 'not_applicable' — a synthesized value (never stored anywhere): the
//     caller is not a minor, or is a minor with no Guardian row (a
//     data-invariant violation RegistrationService should never produce,
//     but not guaranteed by a DB constraint — treated the same as "not
//     applicable" here, deliberately, since email verification must
//     never fail over a downstream consent-data question unrelated to the
//     token being verified; contrast with getConsentStatus()'s own 404 in
//     guardian-consent.service.ts, which is the right behavior for ITS
//     endpoint but wrong for this one).
//   - 'pending' | 'confirmed' — Guardian.consentStatus's real, current
//     value, straight from GuardianConsentService.getConsentStatusForUser
//     (never re-derived independently — see that method's own comment).
export type VerifyEmailResult = {
  userId: string;
  guardianConsentStatus: string;
};

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
    private readonly clubsService: ClubsService,
    private readonly guardianConsentService: GuardianConsentService,
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

    // Sprint 2 / sprint-2/auto-join-on-signup: auto-join on signup (Build
    // Plan Section 6's Sprint 2 line, left unbuilt when club pages
    // themselves shipped in PR #58 — RegisterDto had no club-selection
    // field at all). Critical ordering: this existence check MUST happen
    // before user.create() below, not after. If it ran after user
    // creation, a bad clubId would 404 the request while leaving a real,
    // orphaned User row already committed — un-retryable, since the
    // duplicate-email check above would then block that same address from
    // ever registering again. ClubsService.assertClubExists throws
    // NotFoundException (its existing, already-correct behavior for
    // standalone POST /clubs/:id/join) and is allowed to propagate here,
    // failing the whole registration call with a 404 before anything is
    // written. See test/registration-club-join.e2e-spec.ts for the
    // regression proof.
    if (dto.clubId) {
      await this.clubsService.assertClubExists(dto.clubId);
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

    // Auto-join on signup, continued from the pre-user-creation existence
    // check above: the User (and, for a minor, Guardian) row now exists,
    // so this is safe to call unconditionally when dto.clubId was
    // provided — assertClubExists already confirmed the club is real
    // before we got this far. Deliberately its own sequential step, not
    // folded into the same $transaction as user/guardian creation
    // (RegistrationService's brief: follow the existing sequential-steps
    // pattern, don't force this into an artificial single transaction).
    // joinClub itself is internally transactional (see clubs.service.ts)
    // for the membership-row + memberCount pairing.
    if (dto.clubId) {
      await this.clubsService.joinClub(user.id, dto.clubId);
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

  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    const userId = await this.emailVerificationTokenStore.verifyAndConsume(token);
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: 'verified' },
    });

    // Decision Log #38: reuses GuardianConsentService.getConsentStatusForUser
    // — the exact same query/shape GET /auth/guardian-consent/status itself
    // is built on — rather than a second, independent way of deriving
    // consent status. `null` (no Guardian row) covers both "not a minor"
    // and the data-invariant-violation case identically; see
    // VerifyEmailResult's own comment for why that's the right behavior
    // here specifically.
    const consentStatus = await this.guardianConsentService.getConsentStatusForUser(userId);
    const guardianConsentStatus = consentStatus ? consentStatus.consentStatus : 'not_applicable';

    return { userId, guardianConsentStatus };
  }
}
