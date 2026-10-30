import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { findFirstBlocker } from './anonymized-row-purge.references';

// backend/w6-purge-anonymised-rows (B-043; Decision Log #375, which SUPERSEDES #344's "no purge timer,
// by design"; builds on #341).
//
// THE ONLY PLACE A User ROW IS EVER DELETED. AccountDeletionSweepService anonymises a row in place and
// never DELETEs it (#341); this job removes an anonymised row 30 days after anonymisation, and only when
// nothing refers to it any more. #375:
//   (a) a never-approved minor account -- isMinor and no ConsentAuditRecord with consentStatus
//       'confirmed' for that user (the anonymiser snapshots the Guardian row into ConsentAuditRecord
//       before deleting it, so the snapshot is the record of whether consent was ever given); and
//   (b) any account with no content.
// A row that meets (a) but still has anything pointing at it is NOT purged and NOT forced -- it is counted
// and logged. Because every reference blocks (see anonymized-row-purge.references.ts), a row with no
// references satisfies (b) by construction, so (a) cannot widen eligibility today; it is computed anyway
// so the log says WHY a row went (and so a later, narrower definition of "content" has the flag ready).
// Content-bearing anonymised accounts stay until counsel reviews them (#375, OPEN).
//
// NOT exposed over HTTP -- irreversible, like the sweep. Both methods take an explicit `now` so tests can
// prove the 30-day boundary without mocking global time.
//
// WHAT THE PURGE DOES NOT TOUCH: ConsentAuditRecord (its own 6-month clock, #42, deleted by the sweep's
// purgeExpiredConsentAuditRecords) and any stored object. In particular the private object of a REJECTED
// post-media file stays in the bucket (B-206, OPEN under counsel): once this job removes the User row,
// that object's only database pointer is already gone (PostMedia rows are deleted at anonymisation) and
// only its key remains, which names the uploader's user id. See account-deletion/README.md.

/** 30 days, measured from User.anonymizedAt. Fixed-length days, like the sweep's grace period. */
export const ANONYMIZED_ROW_RETENTION_DAYS = 30;

/** Rows examined per run. A backlog drains over several daily runs; the run logs when it was capped. */
export const ANONYMIZED_PURGE_MAX_PER_RUN = 200;

export type PurgeReason = 'never_approved_minor' | 'no_content';

export interface PurgeAnonymizedRowsResult {
  purgedUserIds: string[];
  // Why each purged row was eligible (#375 (a) vs (b)); informational, for the log and the tests.
  purgedReasons: Record<string, PurgeReason>;
  // Eligible by age but something still refers to the row; left in place. Value = the first blocker found.
  keptUserIds: { userId: string; blocker: string; kind: 'content' | 'anomaly' }[];
  // The transaction failed for this row (e.g. a Serializable conflict with a concurrent write); retried
  // on the next run.
  erroredUserIds: string[];
  // More due rows existed than ANONYMIZED_PURGE_MAX_PER_RUN.
  capped: boolean;
}

export interface CleanupRevokedUsernamesResult {
  /** RevokedUsername ids deleted (their user is anonymised and their hold has passed). */
  deletedIds: string[];
  /** The delete failed for this record; retried on the next run. */
  erroredIds: string[];
  /** More due records existed than ANONYMIZED_PURGE_MAX_PER_RUN. */
  capped: boolean;
}

type RowOutcome =
  | { outcome: 'purged'; reason: PurgeReason }
  | { outcome: 'kept'; blocker: string; kind: 'content' | 'anomaly' }
  | { outcome: 'skipped' };

@Injectable()
export class AnonymizedRowPurgeService {
  private readonly logger = new Logger(AnonymizedRowPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 03:30 -- after AccountDeletionSweepService's 03:00 run, so a row the sweep anonymised today (which is
  // 30 days from eligible, never due now) and a long run of the sweep cannot overlap this one in a way
  // that matters. 6-field cron (seconds first), the format @nestjs/schedule uses.
  @Cron('0 30 3 * * *')
  async runDailyPurge(): Promise<void> {
    // B-139: the revoked-username cleanup runs FIRST so a record whose hold has ended is not what keeps an
    // anonymised row alive. Its failure is isolated: it is logged and the purge still runs (the purge also
    // deletes an expired record of the row it is examining, so the two cannot strand each other).
    try {
      const c = await this.cleanupRevokedUsernames();
      this.logger.log(
        `Revoked-username cleanup complete: deleted=${c.deletedIds.length} errored=${c.erroredIds.length} capped=${c.capped}`,
      );
    } catch (err) {
      this.logger.error(
        `Revoked-username cleanup failed (${err instanceof Error ? err.message : String(err)}); the purge still runs.`,
      );
    }
    const r = await this.purgeAnonymizedRows();
    const keptByBlocker = new Map<string, number>();
    for (const k of r.keptUserIds) keptByBlocker.set(k.blocker, (keptByBlocker.get(k.blocker) ?? 0) + 1);
    this.logger.log(
      `Anonymized-row purge complete: purged=${r.purgedUserIds.length} kept=${r.keptUserIds.length} ` +
        `errored=${r.erroredUserIds.length} capped=${r.capped}` +
        (keptByBlocker.size ? ` keptBy=${JSON.stringify(Object.fromEntries(keptByBlocker))}` : ''),
    );
    for (const k of r.keptUserIds.filter((x) => x.kind === 'anomaly')) {
      this.logger.warn(`Anonymized-row purge: ${k.userId} is blocked by ${k.blocker}, a row the anonymiser should have removed.`);
    }
  }

  // B-139 (founder decision 2026-10-30). A RevokedUsername record is kept while its user's account exists
  // and is deleted when the account has been anonymised (accountStatus 'deleted', anonymizedAt set) AND
  // holdUntil has passed. anonymizeUser deletes the records whose hold is already over at anonymisation
  // time; this deletes the ones whose hold was still running then, the first run after holdUntil. A record
  // of an account that is NOT anonymised is never touched (the revoked user keeps being barred from the
  // handle, UsernamePolicyService.assertAssignable). RevokedUsername has no foreign key, so the join to
  // User is done in SQL. Oldest hold first, at most ANONYMIZED_PURGE_MAX_PER_RUN per run, each delete on
  // its own so one failure does not stop the rest. Public so tests reach it; the cron is its only caller.
  async cleanupRevokedUsernames(now: Date = new Date()): Promise<CleanupRevokedUsernamesResult> {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT r."id"
      FROM "RevokedUsername" r
      JOIN "User" u ON u."id" = r."userId"
      WHERE u."accountStatus" = 'deleted'
        AND u."anonymizedAt" IS NOT NULL
        AND r."holdUntil" <= ${now}
      ORDER BY r."holdUntil" ASC, r."id" ASC
      LIMIT ${Prisma.raw(String(ANONYMIZED_PURGE_MAX_PER_RUN + 1))}
    `;
    const capped = due.length > ANONYMIZED_PURGE_MAX_PER_RUN;
    const result: CleanupRevokedUsernamesResult = { deletedIds: [], erroredIds: [], capped };
    if (capped) {
      this.logger.log(
        `Revoked-username cleanup: more than ${ANONYMIZED_PURGE_MAX_PER_RUN} records are due; processing the oldest ${ANONYMIZED_PURGE_MAX_PER_RUN}, the rest wait for the next run.`,
      );
    }
    for (const { id } of due.slice(0, ANONYMIZED_PURGE_MAX_PER_RUN)) {
      try {
        // The hold condition is repeated in the DELETE so a record whose holdUntil was somehow moved later
        // after the selection is not removed.
        const r = await this.prisma.revokedUsername.deleteMany({ where: { id, holdUntil: { lte: now } } });
        if (r.count === 1) result.deletedIds.push(id);
      } catch (err) {
        result.erroredIds.push(id);
        this.logger.error(
          `Revoked-username cleanup: record ${id} was NOT deleted (${err instanceof Error ? err.message : String(err)}); it will be retried.`,
        );
      }
    }
    return result;
  }

  async purgeAnonymizedRows(now: Date = new Date()): Promise<PurgeAnonymizedRowsResult> {
    const cutoff = new Date(now.getTime() - ANONYMIZED_ROW_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // anonymizedAt is NULL on any row anonymised before the column existed: `lte` never matches NULL, so
    // those rows are never selected (and nothing is backfilled).
    const due = await this.prisma.user.findMany({
      where: { accountStatus: 'deleted', anonymizedAt: { lte: cutoff } },
      select: { id: true },
      orderBy: { anonymizedAt: 'asc' },
      take: ANONYMIZED_PURGE_MAX_PER_RUN + 1,
    });
    const capped = due.length > ANONYMIZED_PURGE_MAX_PER_RUN;
    const batch = due.slice(0, ANONYMIZED_PURGE_MAX_PER_RUN);
    if (capped) {
      this.logger.log(
        `Anonymized-row purge: more than ${ANONYMIZED_PURGE_MAX_PER_RUN} rows are due; processing the oldest ${ANONYMIZED_PURGE_MAX_PER_RUN}, the rest wait for the next run.`,
      );
    }

    const result: PurgeAnonymizedRowsResult = {
      purgedUserIds: [],
      purgedReasons: {},
      keptUserIds: [],
      erroredUserIds: [],
      capped,
    };
    for (const { id } of batch) {
      try {
        const outcome = await this.purgeOne(id, cutoff, now);
        if (outcome.outcome === 'purged') {
          result.purgedUserIds.push(id);
          result.purgedReasons[id] = outcome.reason;
          this.logger.log(`Anonymized-row purge: deleted User ${id} (${outcome.reason}).`);
        } else if (outcome.outcome === 'kept') {
          result.keptUserIds.push({ userId: id, blocker: outcome.blocker, kind: outcome.kind });
        }
      } catch (err) {
        result.erroredUserIds.push(id);
        this.logger.error(
          `Anonymized-row purge: User ${id} was NOT deleted (${err instanceof Error ? err.message : String(err)}); it will be retried.`,
        );
      }
    }
    return result;
  }

  // One row, one transaction. Eligibility is RE-CHECKED inside the transaction -- the selection above is
  // only a work list -- and the transaction is Serializable so that a Report (or any other no-foreign-key
  // reference) written between the check and the DELETE makes one of the two abort rather than slip
  // through. The DELETE is a deleteMany guarded on the same conditions, so it cannot remove a row that
  // stopped being eligible.
  private async purgeOne(userId: string, cutoff: Date, now: Date): Promise<RowOutcome> {
    return this.prisma.$transaction(
      async (tx): Promise<RowOutcome> => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { accountStatus: true, anonymizedAt: true, isMinor: true },
        });
        if (!user || user.accountStatus !== 'deleted' || !user.anonymizedAt || user.anonymizedAt > cutoff) {
          return { outcome: 'skipped' };
        }

        // B-139: this row is anonymised, so a RevokedUsername record of it whose hold is over is due for
        // deletion whether or not today's cleanup reached it (it can have been capped). Deleting it here
        // means the check below sees only records whose hold is STILL RUNNING, which block this run and are
        // retried on the next one -- and a record is never left behind pointing at a purged row.
        await tx.revokedUsername.deleteMany({ where: { userId, holdUntil: { lte: now } } });

        const blocker = await findFirstBlocker(tx, userId);
        if (blocker) return { outcome: 'kept', blocker: blocker.label, kind: blocker.kind };

        const confirmed = user.isMinor
          ? await tx.consentAuditRecord.findFirst({
              where: { minorUserId: userId, consentStatus: 'confirmed' },
              select: { id: true },
            })
          : null;
        const reason: PurgeReason = user.isMinor && !confirmed ? 'never_approved_minor' : 'no_content';

        const deleted = await tx.user.deleteMany({
          where: { id: userId, accountStatus: 'deleted', anonymizedAt: { lte: cutoff } },
        });
        if (deleted.count !== 1) return { outcome: 'skipped' };
        return { outcome: 'purged', reason };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000, maxWait: 10_000 },
    );
  }
}
