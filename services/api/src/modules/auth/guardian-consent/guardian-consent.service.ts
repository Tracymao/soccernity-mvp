import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RegistrationEmailService } from '../registration/email/registration-email.service';
import { computeConsentTokenExpiresAt } from './consent-token.constants';

// Build Plan Section 8.3, step 4: the guardian-facing confirmation
// endpoint. Steps 1-3 (age declaration, guardian-details capture, the
// consent email carrying this token) are RegistrationService's job
// (PR B2); step 5 (restricted-pending enforcement on other endpoints
// while consent is outstanding) is B7, not this PR. This service only
// covers step 4: turning a clicked consent link into a confirmed
// Guardian row.
//
// Guardian.consentToken (prisma/schema.prisma) is a persistent column,
// not an ephemeral Redis-backed value like
// registration/email-verification/email-verification-token.store.ts's
// email-verification token -- a guardian may legitimately click the
// same email link twice (double-click, re-opening an old email), so
// unlike that store's delete-on-consume, the token itself stays valid
// to look up indefinitely *within its expiry window* (DPIA finding R5 --
// see consent-token.constants.ts). "Single-use" here means the *state
// transition* (pending -> confirmed, setting consentTimestamp) happens
// at most once; confirming an already-confirmed, still-unexpired token
// is a no-op that still returns success, not an error and not a second
// timestamp write. An expired token, confirmed or not, is rejected.
@Injectable()
export class GuardianConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: RegistrationEmailService,
  ) {}

  async confirmConsent(consentToken: string): Promise<void> {
    const guardian = await this.prisma.guardian.findUnique({ where: { consentToken } });

    // Deliberately generic — matching RegistrationService's own
    // non-enumeration posture (see register()'s duplicate-email comment):
    // an unknown token, an already-used one that's since been rotated,
    // and an expired one all land here, and this response doesn't
    // distinguish any of them.
    if (!guardian) {
      throw new BadRequestException('Invalid or expired consent token');
    }

    // DPIA finding R5: checked *before* the already-confirmed check
    // below, deliberately -- a confirmed-but-expired token must not
    // keep returning success forever. Idempotent-success only applies
    // to a still-valid token being re-clicked, not an old one that's
    // aged out.
    if (guardian.consentTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired consent token');
    }

    if (guardian.consentStatus === 'confirmed') {
      return;
    }

    // updateMany + a consentStatus guard in the where clause (rather than
    // a plain update()) closes the read-then-write race between the
    // findUnique above and this write: if two requests for the same
    // token both pass the check above concurrently, only the first
    // update that actually commits will match `consentStatus: pending`
    // -- the second finds zero matching rows and is a silent no-op,
    // never overwriting an already-set consentTimestamp.
    await this.prisma.guardian.updateMany({
      where: { consentToken, consentStatus: { not: 'confirmed' } },
      data: { consentStatus: 'confirmed', consentTimestamp: new Date() },
    });
  }

  // DPIA finding R5's "re-send path": takes the MINOR's registered
  // email, not the guardian's -- the minor is the one who would know to
  // ask "did my guardian get the email," and this avoids needing a
  // second lookup-by-guardian-email path (which would also be a second
  // email-enumeration surface). Deliberately the same generic response
  // (silent success, no error) whether the email doesn't match a User,
  // matches an adult, matches a minor with no Guardian row, or matches
  // a minor whose Guardian has already confirmed -- none of those are
  // distinguishable from the caller's side, matching every other
  // non-enumeration posture in this module (RegistrationService,
  // confirmConsent above). Rate-limited by the controller
  // (@AuthRateLimit()) since an unlimited resend endpoint is a spam
  // vector against a guardian's inbox.
  async resendConsent(email: string): Promise<void> {
    // Decision Log #16: matches the same lowercase-on-write/lookup
    // normalization login()/register() use, since User.email is stored
    // lowercase.
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return;
    }

    const guardian = await this.prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    if (!guardian || guardian.consentStatus !== 'pending') {
      return;
    }

    // A fresh token, not an extension of the old one's expiry -- the old
    // token stops resolving entirely (consentToken is @unique; this
    // overwrites the only copy of it), closing the exact "permanent
    // credential sitting in an inbox" risk R5 describes for whichever
    // inbox the *previous* email landed in.
    const newToken = randomUUID();
    const updated = await this.prisma.guardian.update({
      where: { id: guardian.id },
      data: {
        consentToken: newToken,
        consentTokenExpiresAt: computeConsentTokenExpiresAt(this.config),
      },
    });

    await this.emailService.sendGuardianConsentEmail(updated.email, updated.consentToken, user.displayName);
  }
}
