import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DobEncryptionService } from '../../../crypto/dob-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';

// B-021 (Decision Log #372): what the guardian is shown, on the consent page,
// before they decide. Built from the consent token alone -- the guardian has
// no Soccernity account.
//
// The `notices` flags are the facts the decision says the guardian must be
// told (their email appears on the minor's profile as the line of contact; the
// minor's photo and username are visible to others). Only STRUCTURED facts are
// returned: the sentence wording is a frontend/legal matter and is still
// pending counsel (Part C rows 22, 44), so no prose is baked into the API.
export interface GuardianRequestSummary {
  minorName: string;
  // YYYY-MM-DD, decrypted on the server for this response only.
  dateOfBirth: string;
  // Guardian.name / Guardian.relationship, i.e. "you were named as ...".
  guardianName: string;
  guardianRelationship: string;
  // When the account (and so the first request) was created.
  requestedAt: string;
  notices: {
    guardianEmailShownOnMinorProfile: true;
    photoAndUsernameVisibleToOthers: true;
  };
}

// Header (not query string) carries the credential so it stays out of URLs and
// therefore out of access/proxy logs -- Decision Log #372 says nothing is
// logged beyond the token outcome.
export const CONSENT_TOKEN_HEADER = 'x-consent-token';

// The ONE rejection. Deliberately identical to confirmConsent's own generic
// message, and returned for every kind of failure so a caller cannot tell an
// unknown token from an expired, used, replaced, declined, or otherwise
// ineligible one (non-enumerating, Decision Log #372).
export const SUMMARY_REJECTION_MESSAGE = 'Invalid or expired consent token';
const MAX_TOKEN_LENGTH = 200;

@Injectable()
export class GuardianConsentSummaryService {
  private readonly logger = new Logger(GuardianConsentSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dobEncryption: DobEncryptionService,
  ) {}

  async getSummary(consentToken: string | undefined): Promise<GuardianRequestSummary> {
    const token = consentToken?.trim();
    if (!token || token.length > MAX_TOKEN_LENGTH) throw reject();

    const guardian = await this.prisma.guardian.findUnique({
      where: { consentToken: token },
      select: {
        name: true,
        relationship: true,
        consentStatus: true,
        consentTokenExpiresAt: true,
        minorUser: {
          select: { displayName: true, dateOfBirth: true, isMinor: true, accountStatus: true, createdAt: true },
        },
      },
    });

    // Only a LIVE request gets a summary: still pending (so a confirmed or
    // declined/withdrawn request -- "used" -- is refused), unexpired, and for a
    // minor whose account is still active and still a minor. Everything else is
    // the same rejection.
    if (
      !guardian ||
      guardian.consentStatus !== 'pending' ||
      guardian.consentTokenExpiresAt.getTime() < Date.now() ||
      !guardian.minorUser.isMinor ||
      guardian.minorUser.accountStatus !== 'active' ||
      guardian.minorUser.dateOfBirth === null
    ) {
      throw reject();
    }

    let dateOfBirth: string;
    try {
      dateOfBirth = this.dobEncryption.decrypt(guardian.minorUser.dateOfBirth).toISOString().slice(0, 10);
    } catch {
      // A key/ciphertext fault is a server problem, but answering it
      // differently from a bad token would let a caller tell valid tokens
      // apart. Log the fault (no token, no data) and give the same response.
      this.logger.error('Could not decrypt a date of birth for a consent request summary.');
      throw reject();
    }

    return {
      minorName: guardian.minorUser.displayName,
      dateOfBirth,
      guardianName: guardian.name,
      guardianRelationship: guardian.relationship,
      requestedAt: guardian.minorUser.createdAt.toISOString(),
      notices: { guardianEmailShownOnMinorProfile: true, photoAndUsernameVisibleToOthers: true },
    };
  }
}

function reject(): BadRequestException {
  return new BadRequestException(SUMMARY_REJECTION_MESSAGE);
}
