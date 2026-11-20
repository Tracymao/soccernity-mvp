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
// B-129 (Decision Log #406 item 4) split it in two:
//   - GET /admin/users/:id/summary  -> getUserSummary(): User Detail WITHOUT the
//     date of birth. It never selects the DOB column, so there is nothing to
//     decrypt and nothing to audit (no user.dob_viewed row).
//   - GET /admin/users/:id          -> getUserDetail(): the same plus the DOB,
//     kept for the correction form, with the audit row.
//
// EXPLICIT SELECT, never a row spread: passwordHash, the guardian's consent /
// withdrawal tokens, the Stripe payment-intent reference and the internal
// decline counter (#395 B2: "no count is exposed by any API") are simply not
// selected, so there is no code path by which they could reach the payload.
const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  displayName: true,
  username: true,
  role: true,
  accountStatus: true,
  verificationStatus: true,
  isMinor: true,
  isUnder16: true,
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

// The full detail read adds the DOB ciphertext (decrypted below, never returned
// as stored). The summary read does NOT select it at all.
const USER_DETAIL_SELECT = { ...USER_SUMMARY_SELECT, dateOfBirth: true } as const;

// Everything User Detail shows EXCEPT the date of birth and the age tier
// derived from it (isMinor / isUnder16 stay: they are the flags the platform
// acts on, and the response already carried them).
export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  role: string;
  accountStatus: string;
  verificationStatus: string;
  isMinor: boolean;
  isUnder16: boolean;
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
  // B-033: handles an admin has revoked FROM THIS USER, newest first. Each is
  // permanently barred for this user; `heldUntil` is when everyone else may
  // take it. The reason lives in the audit log, not here. The User Detail
  // screen uses this to show whether a revoke already happened.
  usernameRevocations: Array<{ username: string; revokedAt: Date; heldUntil: Date }>;
}

export interface AdminUserDetail extends AdminUserSummary {
  // 'YYYY-MM-DD'. null only for an anonymized account (Decision Log #341),
  // which has no DOB left to show.
  dateOfBirth: string | null;
  ageTier: AgeTier | null;
}

type SummaryRow = {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  role: string;
  accountStatus: string;
  verificationStatus: string;
  isMinor: boolean;
  isUnder16: boolean;
  createdAt: Date;
  pendingDeletionAt: Date | null;
  declaredCountry: string | null;
  derivedCountry: string | null;
  countryDerivationMethod: string | null;
  countryDerivedAt: Date | null;
  guardian: AdminUserSummary['guardian'];
};

@Injectable()
export class AdminUserDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dobEncryption: DobEncryptionService,
    private readonly adminActionLogService: AdminActionLogService,
  ) {}

  // B-129: User Detail without the date of birth. The DOB column is not even
  // selected, so this path cannot leak it and writes no audit row.
  async getUserSummary(userId: string): Promise<AdminUserSummary> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SUMMARY_SELECT });
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return this.toSummary(row, await this.loadRevocations(userId));
  }

  async getUserDetail(userId: string, adminId: string): Promise<AdminUserDetail> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_DETAIL_SELECT });
    if (!row) {
      throw new NotFoundException('User not found');
    }
    const usernameRevocations = await this.loadRevocations(userId);

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
      ...this.toSummary(row, usernameRevocations),
      dateOfBirth: dob ? dob.toISOString().slice(0, 10) : null,
      ageTier: dob ? ageTierFor(dob) : null,
    };
  }

  private async loadRevocations(userId: string) {
    return this.prisma.revokedUsername.findMany({
      where: { userId },
      orderBy: { revokedAt: 'desc' },
      select: { username: true, revokedAt: true, holdUntil: true },
    });
  }

  // Field-by-field (not a spread) so a column added to the select later cannot
  // reach the payload by accident -- and the DOB ciphertext on the detail row
  // can never ride along.
  private toSummary(
    row: SummaryRow,
    usernameRevocations: Array<{ username: string; revokedAt: Date; holdUntil: Date }>,
  ): AdminUserSummary {
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
      createdAt: row.createdAt,
      pendingDeletionAt: row.pendingDeletionAt,
      safeguardingCountry: {
        declared: row.declaredCountry,
        derived: row.derivedCountry,
        method: row.countryDerivationMethod,
        derivedAt: row.countryDerivedAt,
      },
      guardian: row.guardian,
      usernameRevocations: usernameRevocations.map((r) => ({
        username: r.username,
        revokedAt: r.revokedAt,
        heldUntil: r.holdUntil,
      })),
    };
  }
}
