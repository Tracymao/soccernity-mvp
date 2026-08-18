import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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
// to look up indefinitely. "Single-use" here means the *state
// transition* (pending -> confirmed, setting consentTimestamp) happens
// at most once; confirming an already-confirmed token is a no-op that
// still returns success, not an error and not a second timestamp write.
@Injectable()
export class GuardianConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async confirmConsent(consentToken: string): Promise<void> {
    const guardian = await this.prisma.guardian.findUnique({ where: { consentToken } });

    // Deliberately generic — matching RegistrationService's own
    // non-enumeration posture (see register()'s duplicate-email comment):
    // an unknown token and an already-used one that's since been rotated
    // or deleted would both land here, and this response doesn't
    // distinguish them.
    if (!guardian) {
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
}
