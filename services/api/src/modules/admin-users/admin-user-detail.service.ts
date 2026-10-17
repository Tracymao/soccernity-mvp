import { Injectable, NotFoundException } from '@nestjs/common';
import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import { AgeTier, ageTierFor } from '../auth/registration/age-tier.util';

// B-109 (Decision Log #398 D4, #390): the single-user admin read. This is the
// audited place support reads a user's date of birth, which is encrypted at
// rest (Decision Log #362) and decrypted here, server-side, for this response
// only.
//
// EXPLICIT SELECT, never a row spread: passwordHash, the guardian's consent /
// withdrawal tokens, the Stripe payment-intent reference and the internal
// decline counter (#395 B2: "no count is exposed by any API") are simply not
// selected, so there is no code path by which they could reach the payload.
const USER_DETAIL_SELECT = {
  id: true,
  email: true,
  displayName: true,
  username: true,
  role: true,
  accountStatus: true,
  verificationStatus: true,
  isMinor: true,
  isUnder16: true,
  dateOfBirth: true, // ciphertext; decrypted below, never returned as stored
  createdAt: true,
  pendingDeletionAt: true,
  declaredCountry: true,
  derivedCountry: true,
  countryDerivationMethod: true,
  countryDerivedAt: true,
  guardian: {
    select: {
      name: true,
      email: true,
      relationship: true,
      consentStatus: true,
      consentDeclineSource: true,
      consentTimestamp: true,
      consentTokenExpiresAt: true,
      incorrectDetailsReportedAt: true,
      cardVerificationRequired: true,
      cardVerifiedAt: true,
      consentVerificationMethod: true,
    },
  },
} as const;

export interface AdminUserDetail {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  role: string;
  accountStatus: string;
  verificationStatus: string;
  isMinor: boolean;
  isUnder16: boolean;
  // 'YYYY-MM-DD'. null only for an anonymized account (Decision Log #341),
  // which has no DOB left to show.
  dateOfBirth: string | null;
  ageTier: AgeTier | null;
  createdAt: Date;
  pendingDeletionAt: Date | null;
  // The safeguarding country (Decision Log #368, #403 item 17), shown to
  // support only: the derived country decides US under-13 card verification.
  // It is never shown to the user and the IP it was derived from is never
  // stored.
  safeguardingCountry: {
    declared: string | null;
    derived: string | null;
    method: string | null;
    derivedAt: Date | null;
  };
  guardian: {
    name: string;
    email: string;
    relationship: string;
    consentStatus: string;
    consentDeclineSource: string | null;
    consentTimestamp: Date | null;
    consentTokenExpiresAt: Date;
    incorrectDetailsReportedAt: Date | null;
    cardVerificationRequired: boolean;
    cardVerifiedAt: Date | null;
    consentVerificationMethod: string | null;
  } | null;
}

@Injectable()
export class AdminUserDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dobEncryption: DobEncryptionService,
    private readonly adminActionLogService: AdminActionLogService,
  ) {}

  async getUserDetail(userId: string, adminId: string): Promise<AdminUserDetail> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_DETAIL_SELECT });
    if (!row) {
      throw new NotFoundException('User not found');
    }

    // Decrypt FIRST (held in memory only), then write the audit row, then
    // return. If the audit write fails the request fails and no DOB leaves the
    // server: an unaudited DOB read is the one outcome this endpoint must not
    // have. Writes a row on EVERY response that contains a DOB, including
    // repeat reads by the same admin. An anonymized account has no DOB, so its
    // response contains none and writes none.
    const dob = this.dobEncryption.decryptNullable(row.dateOfBirth);
    if (dob) {
      await this.adminActionLogService.record(
        adminId,
        ADMIN_ACTION_LOG_ACTIONS.USER_DOB_VIEWED,
        ADMIN_ACTION_LOG_TARGET_TYPES.USER,
        userId,
      );
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      username: row.username,
      role: row.role,
      accountStatus: row.accountStatus,
      verificationStatus: row.verificationStatus,
      isMinor: row.isMinor,
      isUnder16: row.isUnder16,
      dateOfBirth: dob ? dob.toISOString().slice(0, 10) : null,
      ageTier: dob ? ageTierFor(dob) : null,
      createdAt: row.createdAt,
      pendingDeletionAt: row.pendingDeletionAt,
      safeguardingCountry: {
        declared: row.declaredCountry,
        derived: row.derivedCountry,
        method: row.countryDerivationMethod,
        derivedAt: row.countryDerivedAt,
      },
      guardian: row.guardian,
    };
  }
}
