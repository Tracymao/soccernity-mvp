import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Build Plan Section 9, Decision Log #42. Two independent timers:
//
// 1. A "pending_deletion" account (AuthService.deleteAccount) gets a
//    30-day grace period from User.pendingDeletionAt, then this service
//    hard-deletes the User row -- a real DELETE, not an anonymize/scramble.
// 2. Guardian/consent records are the deliberate exception: they don't
//    die with the User row. AccountDeletionSweepService.hardDeleteUser
//    snapshots what's needed to prove consent occurred into
//    ConsentAuditRecord (schema.prisma -- see that model's own comment
//    for why it's a plain userId string, not a foreign key) and deletes
//    the real Guardian row, before the User row itself can be deleted at
//    all (Guardian.minorUserId is ON DELETE RESTRICT against User,
//    confirmed against the real migration SQL -- ordering here isn't
//    optional). ConsentAuditRecord.createdAt is that record's OWN
//    6-month purge clock, independent of whatever happens to the User
//    row afterwards -- Decision Log #42's own "~7 months total from the
//    original delete-account request" math only holds if this second
//    clock starts at hard-delete time, not at the (possibly
//    years-earlier) original consent-confirmation time.
const GRACE_PERIOD_DAYS = 30;
const CONSENT_AUDIT_RETENTION_MONTHS = 6;

export interface SweepPendingDeletionsResult {
  hardDeletedUserIds: string[];
  // See account-deletion/README.md's Decision Log #44 candidate — every
  // FK from Post/Comment/Follow/Like/SavedPost/Notification/Report/
  // Message/LeaderboardEntry/GrassrootsTeam/Result to User is
  // ON DELETE RESTRICT (confirmed against the real migration SQL, not
  // assumed), so an account past its 30-day mark that has ANY related
  // content cannot be hard-deleted today without a real, separate
  // decision on what happens to that content. Those accounts land here,
  // not in hardDeletedUserIds — left in pending_deletion, untouched,
  // logged, and re-attempted on every future sweep run until that
  // decision is made and implemented, deliberately not silently resolved
  // by this PR.
  blockedUserIds: string[];
}

export interface PurgeConsentAuditRecordsResult {
  purgedCount: number;
}

@Injectable()
export class AccountDeletionSweepService {
  private readonly logger = new Logger(AccountDeletionSweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Scheduled, per this PR's brief — deliberately NOT also exposed as a
  // manually-triggered HTTP endpoint. A destructive, irreversible sweep
  // over every account on the platform has no legitimate reason to be
  // reachable on demand by any caller, including an admin one; the two
  // methods below remain independently callable in-process (tests call
  // them directly, passing an explicit `now` for determinism) without
  // needing @nestjs/schedule or a real clock at all.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailySweep(): Promise<void> {
    const deletionResult = await this.sweepPendingDeletions();
    const purgeResult = await this.purgeExpiredConsentAuditRecords();
    this.logger.log(
      `Account deletion sweep complete: hardDeleted=${deletionResult.hardDeletedUserIds.length} ` +
        `blocked=${deletionResult.blockedUserIds.length} consentAuditRecordsPurged=${purgeResult.purgedCount}`,
    );
  }

  // (a) — finds accountStatus = 'pending_deletion' rows past their 30-day
  // mark and hard-deletes each one (snapshotting a ConsentAuditRecord
  // first for any minor with a Guardian row). `now` defaults to the real
  // clock but is an explicit parameter specifically so tests can prove
  // the 30-day boundary without mocking global time.
  async sweepPendingDeletions(now: Date = new Date()): Promise<SweepPendingDeletionsResult> {
    const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const dueUsers = await this.prisma.user.findMany({
      where: {
        accountStatus: 'pending_deletion',
        pendingDeletionAt: { lte: cutoff },
      },
      select: { id: true, isMinor: true },
    });

    const hardDeletedUserIds: string[] = [];
    const blockedUserIds: string[] = [];

    for (const user of dueUsers) {
      try {
        await this.hardDeleteUser(user.id, user.isMinor);
        hardDeletedUserIds.push(user.id);
      } catch (err) {
        if (!this.isForeignKeyRestrictError(err)) {
          throw err;
        }
        this.logger.warn(
          `Account deletion sweep: user ${user.id} is past its 30-day grace period but has related ` +
            'content (Post/Comment/Follow/Like/etc.) blocking a hard-delete under the current ' +
            'ON DELETE RESTRICT schema — see account-deletion/README.md\'s Decision Log #44 candidate. ' +
            'Left in pending_deletion, not purged.',
        );
        blockedUserIds.push(user.id);
      }
    }

    return { hardDeletedUserIds, blockedUserIds };
  }

  // One transaction: the ConsentAuditRecord write, the Guardian delete,
  // and the User delete either all happen or none do. This matters
  // specifically because of the RESTRICT chain above — if the User
  // delete itself fails (unrelated content elsewhere), the Guardian
  // delete and the ConsentAuditRecord write that already ran in this
  // same transaction are rolled back too, so a blocked account is never
  // left with its Guardian row (or its safeguarding audit trail) already
  // gone while the User row survives.
  private async hardDeleteUser(userId: string, isMinor: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (isMinor) {
        const guardian = await tx.guardian.findUnique({
          where: { minorUserId: userId },
          select: { consentStatus: true, consentTimestamp: true },
        });

        // Not every minor has a Guardian row by the time they reach this
        // sweep (a genuinely rare edge case — e.g. isMinor flipped true
        // by some other path with no guardian-consent flow ever started)
        // — nothing to snapshot or delete in that case, matching this
        // PR's brief: "if the user was ever a minor with a Guardian row."
        if (guardian) {
          await tx.consentAuditRecord.create({
            data: {
              minorUserId: userId,
              consentStatus: guardian.consentStatus,
              consentConfirmedAt: guardian.consentTimestamp,
            },
          });
          await tx.guardian.delete({ where: { minorUserId: userId } });
        }
      }

      await tx.user.delete({ where: { id: userId } });
    });
  }

  private isForeignKeyRestrictError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
  }

  // (b) — purges ConsentAuditRecord rows past their OWN 6-month mark,
  // measured from createdAt (hard-delete time — see this file's header
  // comment), entirely independent of any User row's deletion timing.
  // Calendar months (via setUTCMonth), not a fixed day count —
  // deliberately matching Decision Log #42's own "6 months" language
  // rather than converting it into an arbitrary day count that isn't
  // what was actually decided. setUTCMonth specifically, NOT setMonth —
  // a real, caught-by-test bug during this PR: setMonth reads/writes
  // local-time calendar fields, so subtracting 6 months across a
  // Northern-Hemisphere DST boundary (e.g. August BST -> February GMT)
  // silently shifted the computed cutoff by an hour in UTC terms.
  // setUTCMonth operates on UTC calendar fields throughout, which is
  // what this cutoff should mean regardless of the server's local
  // timezone or time of year.
  async purgeExpiredConsentAuditRecords(now: Date = new Date()): Promise<PurgeConsentAuditRecordsResult> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - CONSENT_AUDIT_RETENTION_MONTHS);

    const result = await this.prisma.consentAuditRecord.deleteMany({
      where: { createdAt: { lte: cutoff } },
    });

    return { purgedCount: result.count };
  }
}
